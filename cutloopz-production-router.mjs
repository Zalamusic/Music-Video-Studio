import path from 'node:path';
import {promises as fs} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createPilotOrchestrator} from './cutloopz-pilot-orchestrator.mjs';
import {createPilotHttpAdapter} from './cutloopz-pilot-http-adapter.mjs';
import {createLocalGeneratorAdapter} from './cutloopz-local-generator-adapter.mjs';
import {finalizePilotJob} from './cutloopz-finalize-job.mjs';
import {createLocalAutoRunner} from './cutloopz-local-auto-runner.mjs';

// Inspect the uploaded recording rather than trusting the file extension or user duration.
// ffprobe does not invoke the paid generation provider.
export function probeSongDuration(songPath){
 return new Promise((resolve,reject)=>{
  // Bound the probe so a malformed recording cannot stall an administrator request.
  const child=spawn('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_type:format=duration','-of','json',songPath],{shell:false});
  let output='',error='',settled=false;
  const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timeout);err?reject(err):resolve(value)};
  const timeout=setTimeout(()=>{child.kill('SIGKILL');finish(Error('Audio inspection timed out'))},15000);
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>16384){child.kill('SIGKILL');finish(Error('Audio metadata exceeds inspection limit'))}});
  child.stderr.on('data',chunk=>{error+=chunk;if(error.length>2048)error=error.slice(0,2048)});
  child.on('error',err=>finish(err));
  child.on('close',code=>{
   if(settled)return;
   try{
    if(code!==0)throw Error('Uploaded song could not be inspected');
    const info=JSON.parse(output);
    const seconds=Number(info?.format?.duration);
    if(!info?.streams?.some(stream=>stream.codec_type==='audio')||!Number.isFinite(seconds)||seconds<=0)throw Error('Uploaded song has no readable audio duration');
    finish(null,seconds);
   }catch(err){finish(err)}
  });
 });
}

// Explicit admin-only orchestration API. No paid calls from create or status.
export function createProductionRouter({express,multer,baseDir,authorize,origin,adminKey,enabled=()=>false}={}){
 if(!express||!multer||!path.isAbsolute(baseDir||'')||typeof authorize!=='function')throw Error('Missing production router dependencies');
 const router=express.Router();
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:40*1024*1024,files:2}});
 const adapter=createPilotHttpAdapter({origin,adminKey});
 const configuredPrice=Number(process.env.CUTLOOPZ_VERIFIED_CLIP_PRICE_USD);
 const pricingVerified=process.env.CUTLOOPZ_PROVIDER_PRICE_VERIFIED==='true' && Number.isFinite(configuredPrice) && configuredPrice>0;
 const unitPriceUSD=pricingVerified?configuredPrice:0.5;
 const coordinator=createPilotOrchestrator({baseDir,adapter,unitPriceUSD,pricingVerified});
 // Every production endpoint, including read-only GPU readiness, is private.
 router.use(async(req,res,next)=>{
  try {
   const suppliedOrigin=req.get?.('origin');
   if(['POST','PUT','PATCH','DELETE'].includes(req.method) && suppliedOrigin){
     let parsed;try{parsed=new URL(suppliedOrigin)}catch{}
     if(!parsed || !['https:','http:'].includes(parsed.protocol) || parsed.host!==req.get('host'))
       return res.status(403).json({ok:false,error:'Request origin does not match this site'});
   }
   if(await authorize(req))return next();
   return res.status(403).json({ok:false,error:'Sign in with the CutLoopz owner account to use private generation.'});
  } catch { return res.status(503).json({ok:false,error:'Owner authentication temporarily unavailable'}); }
 });
 // Read-only administrator diagnostics. This cannot submit video jobs or charge providers.
 router.get('/independent-health',async(_req,res)=>{
  const endpoint=process.env.CUTLOOPZ_LOCAL_GENERATOR_URL;
  if(!endpoint)return res.status(503).json({ok:false,configured:false,reachable:false,modelLoaded:false,independentGenerationReady:false,error:'Local generator URL is not configured'});
  try{
   const generator=createLocalGeneratorAdapter({endpoint,remoteHost:process.env.CUTLOOPZ_REMOTE_GENERATOR_HOST,remoteToken:process.env.CUTLOOPZ_WORKER_SHARED_TOKEN});
   const health=await generator.health();
   return res.json({ok:true,configured:true,reachable:true,modelLoaded:health.modelLoaded,modelId:health.modelId,independentGenerationReady:false,note:'Model health does not prove generation or singing performance; end-to-end verification is required'});
  }catch(e){return res.status(503).json({ok:false,configured:true,reachable:false,modelLoaded:false,independentGenerationReady:false,error:String(e.message||e)})}
 });
 // Local generation uses a separate, explicit admin gate and never calls the paid pilot.
 // A reachable health endpoint is insufficient: the model must report loaded.
 const localEndpoint=process.env.CUTLOOPZ_LOCAL_GENERATOR_URL;
 const localEnabled=()=>process.env.CUTLOOPZ_LOCAL_GENERATION_ENABLED==='true';
 let localAdapter=null,localCoordinator=null,localAutoRunner=null;
 const getLocal=()=>{
  if(!localEnabled())throw Error('Independent generation is disabled');
  if(!localEndpoint)throw Error('Local generator URL is not configured');
  if(!localAdapter){
   localAdapter=createLocalGeneratorAdapter({endpoint:localEndpoint,remoteHost:process.env.CUTLOOPZ_REMOTE_GENERATOR_HOST,remoteToken:process.env.CUTLOOPZ_WORKER_SHARED_TOKEN});
   // A nominal unit is used only for the existing coordinator's accounting schema.
   // It is NOT a cloud price or a claim about GPU operating costs.
   localCoordinator=createPilotOrchestrator({baseDir:path.join(baseDir,'local'),adapter:localAdapter,unitPriceUSD:0.01,pricingVerified:true});
  }
  if(!localAutoRunner) localAutoRunner=createLocalAutoRunner({
   coordinator:localCoordinator,adapter:localAdapter,
   finalize:id=>finalizePilotJob({orchestrator:localCoordinator,adapter:localAdapter,jobId:id,baseDir:path.join(baseDir,'local')})
  });
  return {adapter:localAdapter,coordinator:localCoordinator,autoRunner:localAutoRunner};
 };
 router.get('/local/status',async(_req,res)=>{
  res.set('Cache-Control','no-store');
  // Read-only diagnostics must work even when generation is intentionally off.
  const enabledNow=localEnabled();
  const base={ok:true,configured:!!localEndpoint,connected:false,modelLoaded:false,
   generationEnabled:enabledNow,readyToSubmit:false,
   autoRunEnabled:enabledNow};
  if(!localEndpoint)return res.json({...base,message:'Generator address is not configured in Render. No GPU request was made.'});
  try{
   const adapter=createLocalGeneratorAdapter({endpoint:localEndpoint,
    remoteHost:process.env.CUTLOOPZ_REMOTE_GENERATOR_HOST,
    remoteToken:process.env.CUTLOOPZ_WORKER_SHARED_TOKEN});
   const health=await adapter.health();
   return res.json({...base,connected:true,modelLoaded:health.modelLoaded,modelId:health.modelId,
    readyToSubmit:enabledNow&&health.modelLoaded,
    message:!health.modelLoaded?'Worker reachable, but model runner is not loaded.':
     !enabledNow?'Worker reports loaded; generation remains disabled until explicitly enabled.':
     'Worker reports loaded. This does not verify video or vocal performance.'});
  }catch(error){
   const reason=error instanceof TypeError?'Worker unreachable (transport or TLS failure)':
    String(error?.message||'Connection check failed');
   return res.json({...base,message:`Engine check failed: ${reason}. No generation was requested.`});
  }
 });
 router.post('/local/jobs',upload.fields([{name:'song',maxCount:1},{name:'photo',maxCount:1}]),async(req,res)=>{
  let stage=null;
  try{
   const {adapter,coordinator}=getLocal();
   const durationSeconds=Number(req.body?.durationSeconds);
   const format=req.body?.format||'landscape';
   if(!['landscape','vertical'].includes(format))throw Error('Invalid video orientation');
   if(!Number.isInteger(durationSeconds)||durationSeconds<15||durationSeconds>360||durationSeconds%5)throw Error('Duration must be 15–360 seconds in 5-second steps');
   const song=req.files?.song?.[0],photo=req.files?.photo?.[0];
   if(!song||!photo||song.buffer.length<1000||photo.buffer.length<1000)throw Error('Valid song and photo required');
   const sig=photo.buffer;
   const ext=sig[0]===255&&sig[1]===216?'jpg':sig.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':sig.toString('ascii',0,4)==='RIFF'&&sig.toString('ascii',8,12)==='WEBP'?'webp':null;
   if(!ext)throw Error('Photo must be JPEG, PNG, or WebP');
   const h=await adapter.health();if(!h.modelLoaded)return res.status(503).json({ok:false,error:'Local generation model is not loaded'});
   stage=path.join(baseDir,'local-uploads',randomUUID());await fs.mkdir(stage,{recursive:true});
   const songPath=path.join(stage,'song'+(song.originalname.toLowerCase().endsWith('.wav')?'.wav':'.mp3'));
   const photoPath=path.join(stage,'photo.'+ext);
   await fs.writeFile(songPath,song.buffer);await fs.writeFile(photoPath,photo.buffer);
   const actual=await probeSongDuration(songPath);if(actual+0.25<durationSeconds)throw Error('Song is shorter than requested video');
   const job=await coordinator.create({durationSeconds,approved:true,photoPath,songPath,maximumEstimatedUSD:durationSeconds/5*0.01,format,
     creativeDirection:String(req.body?.creativeDirection||'').slice(0,2000),
     scenePrompts:(()=>{try{const scenes=JSON.parse(String(req.body?.scenePrompts||'[]'));return Array.isArray(scenes)?scenes.slice(0,40).map(x=>({startSeconds:Number(x.startSeconds)||0,prompt:String(x.prompt||'').slice(0,2000)})):[]}catch{return []}})()});
   // One owner click schedules a complete job, not seventy-two separate approvals.
   // No fallback to the paid third-party API and no retry after uncertain submits.
   const {autoRunner}=getLocal();
   const automation=await autoRunner.start(job.id);
   stage=null;return res.status(201).json({ok:true,jobId:job.id,status:job.status,automation,backend:'local-only',actualGpuCostVerified:false});
  }catch(e){if(stage)await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});return res.status(400).json({ok:false,error:String(e.message||e)})}
 });
 router.get('/local/jobs/:id',async(req,res)=>{try{const {coordinator}=getLocal();res.json({ok:true,job:await coordinator.read(req.params.id)})}catch(e){res.status(404).json({ok:false,error:String(e.message||e)})}});
 router.post('/local/jobs/:id/advance',async(req,res)=>{try{
  const {adapter,coordinator,autoRunner}=getLocal();
  if(autoRunner.snapshot(req.params.id).state==='running')return res.status(409).json({ok:false,error:'Automatic local run is active; do not manually advance clips'});
  const h=await adapter.health();if(!h.modelLoaded)return res.status(503).json({ok:false,error:'Local model is not loaded'});
  res.json({ok:true,job:await coordinator.advance(req.params.id)});
 }catch(e){res.status(409).json({ok:false,error:String(e.message||e)})}});
 // Automatic progression is local-only, admin-only, disabled by default, and
 // requires explicit per-job authorization. It NEVER calls the paid pilot.
 router.get('/local/jobs/:id/automation',async(req,res)=>{
  try{const {coordinator,autoRunner}=getLocal();const job=await coordinator.read(req.params.id);
   return res.json({ok:true,automation:autoRunner.snapshot(req.params.id),jobStatus:job.status,readyClips:job.clips.filter(c=>c.status==='ready').length,totalClips:job.clips.length});
  }catch(e){return res.status(404).json({ok:false,error:String(e.message||e)})}
 });
 router.post('/local/jobs/:id/auto-run',async(req,res)=>{
  try{
   const {autoRunner}=getLocal();const state=await autoRunner.start(req.params.id);
   return res.status(202).json({ok:true,automation:state,backend:'local-only',paidProviderUsed:false});
  }catch(e){return res.status(409).json({ok:false,error:String(e.message||e)})}
 });
 router.post('/local/jobs/:id/assemble',async(req,res)=>{try{const {adapter,coordinator,autoRunner}=getLocal();if(autoRunner.snapshot(req.params.id).state==='running')return res.status(409).json({ok:false,error:'Automatic local run is active; finalization will occur automatically'});const receipt=await finalizePilotJob({orchestrator:coordinator,adapter,jobId:req.params.id,baseDir:path.join(baseDir,'local')});res.json({ok:true,receipt})}catch(e){res.status(409).json({ok:false,error:String(e.message||e)})}});
 router.get('/local/jobs/:id/video',async(req,res)=>{try{const {coordinator}=getLocal();const job=await coordinator.read(req.params.id);const dir=path.join(baseDir,'local',job.id);const receipt=JSON.parse(await fs.readFile(path.join(dir,'assembly.json'),'utf8'));const video=path.join(dir,'final.mp4');if(receipt.jobId!==job.id||receipt.outputPath!==video)throw Error('Invalid assembly receipt');const stat=await fs.stat(video);if(!stat.isFile()||stat.size<1000)throw Error('No video');res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.type('mp4');res.sendFile(video)}catch{res.status(404).json({ok:false,error:'Local video unavailable'})}});
 router.get('/status',(_req,res)=>res.json({ok:true,enabled:enabled(),paidRequestsRequireApproval:true,pricingVerified, paidGenerationLocked:!pricingVerified, generationBackend:'external-performance-pilot', independentGenerationReady:false, liveProductionReady:false, clipSeconds:5, minimumDurationSeconds:15, maximumDurationSeconds:360, durationStepSeconds:5, warning:'This route uses an external paid provider. It is not the independent CutLoopz generation backend.'}));
 router.post('/jobs',upload.fields([{name:'song',maxCount:1},{name:'photo',maxCount:1}]),async(req,res)=>{
  let stage=null;
  try{
   if(!enabled())return res.status(503).json({ok:false,error:'Production is not enabled'});
   if(!pricingVerified)return res.status(503).json({ok:false,error:'External provider price has not been verified; paid production is locked'});
   const song=req.files?.song?.[0],photo=req.files?.photo?.[0];
   if(!song||!photo)throw Error('Song and reference photo required');
   const durationSeconds=Number(req.body?.durationSeconds);
   const maximumEstimatedUSD=Number(req.body?.maximumEstimatedUSD);
   if(req.body?.approvePaidGeneration!=='yes')throw Error('Explicit paid-generation approval required');
   if(!Number.isInteger(durationSeconds)||durationSeconds<15||durationSeconds>360||durationSeconds%5)throw Error('Duration must be 15–360 seconds in 5-second steps');
   if(!Number.isFinite(maximumEstimatedUSD)||maximumEstimatedUSD<durationSeconds/5*unitPriceUSD||maximumEstimatedUSD>500)throw Error('Approved budget must cover the estimate and be at most $500');
   if(song.buffer.length<1000||photo.buffer.length<1000)throw Error('Files are unexpectedly small');
   const ext=photo.buffer[0]===255&&photo.buffer[1]===216?'jpg':photo.buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':photo.buffer.toString('ascii',0,4)==='RIFF'&&photo.buffer.toString('ascii',8,12)==='WEBP'?'webp':null;
   if(!ext)throw Error('Photo must be JPEG, PNG, or WebP');
   stage=path.join(baseDir,'uploads',randomUUID());await fs.mkdir(stage,{recursive:true});
   const songPath=path.join(stage,'song'+(song.originalname.toLowerCase().endsWith('.wav')?'.wav':'.mp3'));
   const photoPath=path.join(stage,'photo.'+ext);
   await fs.writeFile(songPath,song.buffer);await fs.writeFile(photoPath,photo.buffer);
   const actualSongSeconds=await probeSongDuration(songPath);
   if(actualSongSeconds+0.25<durationSeconds)throw Error(`Song is ${actualSongSeconds.toFixed(2)} seconds; requested video is ${durationSeconds} seconds`);
   const job=await coordinator.create({durationSeconds,approved:true,photoPath,songPath,maximumEstimatedUSD});
   res.status(201).json({ok:true,jobId:job.id,status:job.status,estimatedUSD:job.estimatedUSD,clips:job.clips.length});
  }catch(e){if(stage)await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});res.status(400).json({ok:false,error:String(e.message||e)});}
 });
 router.get('/jobs/:id',async(req,res)=>{try{const job=await coordinator.read(req.params.id);res.json({ok:true,job})}catch{res.status(404).json({ok:false,error:'Job not found'})}});
 router.post('/jobs/:id/advance',async(req,res)=>{try{if(!enabled())return res.status(503).json({ok:false,error:'Production disabled'});if(!pricingVerified)return res.status(503).json({ok:false,error:'External provider price has not been verified; paid generation is locked'});if(req.body?.confirmPaidClip!=='yes')return res.status(400).json({ok:false,error:'Explicit confirmation required for each advance; advancing may submit a paid clip'});const job=await coordinator.advance(req.params.id);res.json({ok:true,job})}catch(e){res.status(409).json({ok:false,error:String(e.message||e)})}});
 // Administrator-only playback. Never expose output through public static hosting.
 router.get('/jobs/:id/video',async(req,res)=>{
  try{
   const job=await coordinator.read(req.params.id);
   const folder=path.join(baseDir,job.id);
   const receipt=JSON.parse(await fs.readFile(path.join(folder,'assembly.json'),'utf8'));
   const video=path.join(folder,'final.mp4');
   if(receipt.jobId!==job.id || receipt.outputPath!==video)throw Error('Assembly receipt mismatch');
   const stat=await fs.stat(video);
   if(!stat.isFile()||stat.size<1000)throw Error('Video unavailable');
   res.set('Cache-Control','private, no-store');
   res.set('X-Content-Type-Options','nosniff');
   res.type('mp4');res.sendFile(video);
  }catch{res.status(404).json({ok:false,error:'Assembled video unavailable'})}
 });
 router.post('/jobs/:id/assemble',async(req,res)=>{try{const receipt=await finalizePilotJob({orchestrator:coordinator,adapter,jobId:req.params.id,baseDir});res.json({ok:true,receipt})}catch(e){res.status(409).json({ok:false,error:String(e.message||e)})}});
 return router;
}

