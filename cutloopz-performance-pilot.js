/**
 * CutLoopz - Audio-driven Performance Pilot v7 (administrator-only)
 *
 * Test real audio-conditioned acting and mouth movement WITHOUT adding a
 * customer-facing lip-sync mode or changing standard/premium production.
 *
 * Routes (mounted at /api/performance-pilot):
 *   GET  /status
 *   POST /test              multipart: song, photo, startSeconds, guidance,
 *                           lyricExcerpt, allowPaidTest="yes"
 *   GET  /test/:id          reads queued result and finalizes when ready
 *   GET  /test/:id/video    authenticated finished MP4
 *
 * Security/cost gates: admin header, paid-generation environment switch,
 * pilot-specific environment switch, per-request approval, <=5 seconds,
 * 480p, <=80 frames; provider safety checks ON. This feature makes no
 * purchases while in dry-run or disabled mode.
 *
 * IMPORTANT: It does NOT automatically align lyrics, separate vocal stems,
 * or guarantee lip sync. A human must verify the rendered result.
 */
import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MODEL = 'fal-ai/wan/v2.2-14b/speech-to-video';
const CLIP_SECONDS = 5;
const FRAME_RATE = 16;
const FRAMES = 80;
const RATE_USD_PER_SECOND = 0.10; // Published 480p reference, NOT a guaranteed quote.
const MAX_PENDING = 1;
const MAX_BYTES = 30 * 1024 * 1024;
const SAFE_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const activeFinalizers = new Set();

function clean(value, n) {
  return String(value ?? '').replace(/[\u0000-\u001f]+/g,' ').trim().slice(0, n);
}
function errObj(error) { return clean(error?.message || error, 260) || 'Unknown processing error'; }
function statusView(job) {
  return {
    ok: true, id: job.id, status: job.status, phase: job.phase,
    createdAt: job.createdAt, sectionStart: job.sectionStart,
    sectionSeconds: CLIP_SECONDS, estimatedProviderCostUSD: 0.50,
    costIsEstimate: true, model: MODEL,
    videoReady: job.status === 'ready',
    verification: job.verification || null,
    error: job.error || null,
    notice: 'Technical duration checks do not prove facial/lyric synchronization. Review the actual clip.'
  };
}
function validPhoto(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return false;
  return (buf[0]===0xff && buf[1]===0xd8 && buf[2]===0xff) ||
    buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
    (buf.toString('ascii',0,4)==='RIFF' && buf.toString('ascii',8,12)==='WEBP');
}
function run(cmd,args,{timeoutMs=90_000}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(cmd,args,{shell:false,stdio:['ignore','pipe','pipe']});
    let std='',stderr='',done=false;
    const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
    child.stdout.on('data',b=>{std=(std+b.toString()).slice(-9000);});
    child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-9000);});
    child.on('error',e=>{if(!done){done=true;clearTimeout(timer);reject(e);}});
    child.on('close',code=>{
      if(done)return; done=true;clearTimeout(timer);
      code===0?resolve(std.trim()):reject(new Error(`${cmd} failed (${code}): ${stderr.slice(-700)}`));
    });
  });
}
async function probe(file) {
  return JSON.parse(await run('ffprobe',[
    '-v','error','-show_entries',
    'format=duration:stream=codec_type,width,height,avg_frame_rate',
    '-of','json',file
  ]));
}
function duration(data) {
  return Number(data?.format?.duration);
}
async function save(job, base) {
  const dir=path.join(base,job.id);
  await fs.mkdir(dir,{recursive:true});
  const dest=path.join(dir,'status.json');
  const tmp=dest+'.'+randomUUID()+'.tmp';
  await fs.writeFile(tmp,JSON.stringify(job,null,2));
  await fs.rename(tmp,dest);
}
async function load(base,id) {
  if(!SAFE_ID.test(id)) throw new Error('Invalid test ID.');
  return JSON.parse(await fs.readFile(path.join(base,id,'status.json'),'utf8'));
}
function safeMediaUrl(value) {
  const u=new URL(value);
  if(u.protocol!=='https:' || !(u.hostname==='fal.media' || u.hostname.endsWith('.fal.media') || u.hostname==='fal.ai' || u.hostname.endsWith('.fal.ai')))
    throw new Error('Provider returned an untrusted video location.');
  return u.toString();
}
async function downloadMedia(url, out) {
  const response=await fetch(safeMediaUrl(url),{signal:AbortSignal.timeout(120000)});
  if(!response.ok || !response.body)throw new Error('Provider video download failed.');
  const len=Number(response.headers.get('content-length')||'0');
  if(len>120*1024*1024)throw new Error('Provider video is too large.');
  await pipeline(Readable.fromWeb(response.body),createWriteStream(out));
  const st=await fs.stat(out);
  if(st.size<1000 || st.size>120*1024*1024)throw new Error('Invalid provider video size.');
}
async function finalize(job, fal, base) {
  if(activeFinalizers.has(job.id))return job;
  activeFinalizers.add(job.id);
  try {
    const dir=path.join(base,job.id);
    const results=await fal.queue.result(MODEL,{requestId:job.providerRequestId});
    const videoUrl=results?.data?.video?.url || results?.video?.url;
    if(!videoUrl) throw new Error('Generation finished, but the provider supplied no video.');
    job.phase='Downloading generated performance';
    job.status='finalizing'; await save(job,base);
    const raw=path.join(dir,'provider.mp4');
    await downloadMedia(videoUrl,raw);
    const p=await probe(raw);
    const pDuration=duration(p);
    const videoStream=p.streams?.find(s=>s.codec_type==='video');
    if(!videoStream || !Number.isFinite(pDuration) || pDuration<3.8 || pDuration>6.5)
      throw new Error('Generated scene failed video duration/frame validation.');
    job.phase='Reattaching the original five-second recording';
    await save(job,base);
    const output=path.join(dir,'performance-preview.mp4');
    await run('ffmpeg',[
      '-hide_banner','-loglevel','error','-y','-i',raw,
      '-i',path.join(dir,'vocal-section.wav'),
      '-map','0:v:0','-map','1:a:0','-c:v','copy',
      '-c:a','aac','-b:a','192k','-t','5','-movflags','+faststart',output
    ],{timeoutMs:120000});
    const checked=await probe(output);
    const checkedDuration=duration(checked);
    if(!checked.streams?.some(s=>s.codec_type==='audio') ||
       !checked.streams?.some(s=>s.codec_type==='video') ||
       !Number.isFinite(checkedDuration) || Math.abs(checkedDuration-CLIP_SECONDS)>0.75)
       throw new Error('Final clip did not pass basic audio/video integrity checks.');
    job.status='ready';job.phase='Ready for your visual and lip-sync review';
    job.verification={technical:'passed',videoSeconds:Number(checkedDuration.toFixed(2)),
      width:videoStream.width,height:videoStream.height,
      mouthSync:'NOT VERIFIED - inspect the delivered video',
      identityConsistency:'NOT VERIFIED - inspect the delivered video'};
    await save(job,base);
    return job;
  }catch(e){
    job.status='failed';job.phase='Test failed';job.error=errObj(e);
    await save(job,base);return job;
  }finally{activeFinalizers.delete(job.id);}
}

export function createPerformancePilotRouter({express,multer,fal,outDir,authorize,
  enabled=()=>false,paidEnabled=()=>false}={}) {
  if(!express?.Router || !multer || !fal?.queue || !fal?.storage ||
     typeof authorize!=='function' || !outDir)
    throw new Error('Pilot router dependencies are not configured.');
  const router=express.Router();
  const base=path.join(outDir,'performance-pilot');
  let acceptingPaidTest=false;
  const upload=multer({storage:multer.memoryStorage(),limits:{files:2,fileSize:MAX_BYTES}})
    .fields([{name:'song',maxCount:1},{name:'photo',maxCount:1}]);
  const admin=(req,res,next)=>authorize(req)?next():res.status(403).json({ok:false,error:'Administrator password required.'});
  router.use(admin);
  router.get('/status',(req,res)=>res.json({ok:true,
    enabled:Boolean(enabled()), paidGenerationEnabled:Boolean(paidEnabled()),
    maxClipSeconds:CLIP_SECONDS, estimatedCostUSD:0.50,
    model:MODEL, intent:'administrator performance proof; not a customer lip-sync mode'}));

  router.post('/test',upload,async(req,res)=>{
    const requestedPaid=req.body?.allowPaidTest==='yes';
    const start=Number(req.body?.startSeconds);
    const guidance=clean(req.body?.guidance,900);
    const lyricExcerpt=clean(req.body?.lyricExcerpt,350);
    if(!Number.isFinite(start) || start<0 || start>355)
      return res.status(400).json({ok:false,error:'Start time must be 0-355 seconds.'});
    if(!req.files?.song?.[0] || !req.files?.photo?.[0])
      return res.status(400).json({ok:false,error:'Upload a song and a reference photo.'});
    if(!validPhoto(req.files.photo[0].buffer))
      return res.status(400).json({ok:false,error:'Photo must be JPEG, PNG or WebP.'});
    const id=randomUUID();
    const dir=path.join(base,id);
    await fs.mkdir(dir,{recursive:true});
    try {
      const songFile=path.join(dir,'original-song');
      await fs.writeFile(songFile,req.files.song[0].buffer);
      const p=await probe(songFile);
      const songLength=duration(p);
      if(!Number.isFinite(songLength) || songLength<start+CLIP_SECONDS-0.1)
        return res.status(400).json({ok:false,error:'The song must have five full seconds remaining after the selected start.'});
      if(!p.streams?.some(s=>s.codec_type==='audio'))
        return res.status(400).json({ok:false,error:'The uploaded song has no readable audio stream.'});
      const section=path.join(dir,'vocal-section.wav');
      await run('ffmpeg',['-hide_banner','-loglevel','error','-y',
        '-ss',String(start),'-i',songFile,'-t',String(CLIP_SECONDS),
        '-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',section]);
      const ap=await probe(section);
      if(Math.abs(duration(ap)-CLIP_SECONDS)>0.20)
        throw new Error('Five-second audio extraction failed.');
      const ext=req.files.photo[0].buffer[0]===0xff?'.jpg':
        req.files.photo[0].buffer.toString('ascii',0,4)==='RIFF'?'.webp':'.png';
      const photo=path.join(dir,'artist'+ext);
      await fs.writeFile(photo,req.files.photo[0].buffer);
      const prompt=[
        'Music video, single continuous five-second shot. The SAME performer as the reference photo.',
        'The source recorded vocals must drive natural mouth and facial movements at exactly the time they are heard.',
        'When vocals pause, do not invent speaking or singing. Natural blinking and expressive body movement.',
        'The performance must follow the provided AUDIO, not imagined dialogue.',
        lyricExcerpt?`Lyrics (semantic reference ONLY, not a timing source): ${lyricExcerpt}.`:'',
        guidance?`Director instructions: ${guidance}.`:'Elegant natural musical performance.',
        'Keep face and hairstyle consistent. No subtitle, watermark or cuts.'
      ].filter(Boolean).join(' ').slice(0,2200);
      const job={id,createdAt:new Date().toISOString(),status:'prepared',
        phase:'Five-second audio and reference image validated',sectionStart:start,
        promptPreview:prompt,providerRequestId:null,verification:null,error:null};
      await save(job,base);
      // No provider upload or cost occurs until all four conditions hold.
      if(!requestedPaid || !enabled() || !paidEnabled()) {
        job.status='dry-run';job.phase='Ready but no paid generation was authorized';
        await save(job,base);
        // Keep the small status record, not the artist's audio and photo.
        await Promise.all([songFile,section,photo].map(f=>fs.rm(f,{force:true})));
        return res.json({...statusView(job),
          reason: !requestedPaid?'The operator did not approve a paid test.':
            'Pilot generation and paid generation must BOTH be explicitly enabled in Render.',
          uploadedToProvider:false,charged:false});
      }
      if(acceptingPaidTest) return res.status(429).json({ok:false,error:'A paid test submission is already in progress.'});
      acceptingPaidTest=true;
      try {
      const all=await fs.readdir(base,{withFileTypes:true});
      let count=0;
      for(const item of all){
        if(!item.isDirectory() || item.name===id || !SAFE_ID.test(item.name))continue;
        try{const old=await load(base,item.name);if(['queued','processing','finalizing'].includes(old.status))count++;}
        catch{}
        if(count>=MAX_PENDING)break;
      }
      if(count>=MAX_PENDING)return res.status(429).json({ok:false,error:'Finish the current performance test before purchasing another.'});
      job.phase='Uploading approved five-second section to provider';
      job.status='preparing-provider';await save(job,base);
      const [songUrl,photoUrl]=await Promise.all([
        fal.storage.upload(new File([await fs.readFile(section)],'vocal-section.wav',{type:'audio/wav'})),
        fal.storage.upload(new File([req.files.photo[0].buffer],`artist${ext}`,{type:req.files.photo[0].mimetype}))
      ]);
      // HARD STOP at five seconds - 80 frames at 16 fps; reference estimate $0.50.
      const queued=await fal.queue.submit(MODEL,{
        input:{prompt,image_url:photoUrl,audio_url:songUrl,
          num_frames:FRAMES,frames_per_second:FRAME_RATE,resolution:'480p',
          enable_safety_checker:true,enable_output_safety_checker:true}
      });
      if(!queued?.request_id)throw new Error('Provider did not accept generation request.');
      job.providerRequestId=queued.request_id;
      job.status='queued';job.phase='Generating true audio-driven performance';
      await save(job,base);
      return res.status(202).json({...statusView(job),
        charged:'Generation submitted; provider billing rules apply.'});
      } finally { acceptingPaidTest=false; }
    }catch(e){
      const failure={id,createdAt:new Date().toISOString(),status:'failed',
        phase:'Test setup failed',sectionStart:start,error:errObj(e)};
      await save(failure,base);
      return res.status(500).json({ok:false,error:failure.error,id});
    }
  });

  router.get('/test/:id',async(req,res)=>{
    try{
      const job=await load(base,req.params.id);
      if(['queued','processing','finalizing'].includes(job.status) && job.providerRequestId){
        const p=await fal.queue.status(MODEL,{requestId:job.providerRequestId,logs:false});
        if(p?.status==='COMPLETED') {
          // Retrying finalization is safe after server restart.
          if(!activeFinalizers.has(job.id))await finalize(job,fal,base);
        } else if(p?.status==='FAILED'){
          job.status='failed';job.phase='Provider reported failure';
          job.error='The model provider failed the request; review provider billing separately.';
          await save(job,base);
        } else if(p?.status==='IN_PROGRESS'){
          job.status='processing';job.phase='Rendering audio-conditioned artist performance';await save(job,base);
        } else if(p?.status==='IN_QUEUE'){
          job.status='queued';job.phase='Waiting for generation worker';await save(job,base);
        }
      }
      const latest=await load(base,job.id);
      res.set('Cache-Control','no-store');return res.json(statusView(latest));
    }catch(e){return res.status(404).json({ok:false,error:'Test job not found or unavailable.'});}
  });
  router.get('/test/:id/video',async(req,res)=>{
    try {
      const job=await load(base,req.params.id);
      if(job.status!=='ready')return res.status(409).json({ok:false,error:'Preview is not ready.'});
      res.set('Cache-Control','private, no-store');
      return res.sendFile(path.join(base,job.id,'performance-preview.mp4'));
    }catch(e){return res.status(404).json({ok:false,error:'Preview not found.'});}
  });
  return router;
}
