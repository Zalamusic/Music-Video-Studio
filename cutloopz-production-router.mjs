import path from 'node:path';
import {promises as fs} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createPilotOrchestrator} from './cutloopz-pilot-orchestrator.mjs';
import {createPilotHttpAdapter} from './cutloopz-pilot-http-adapter.mjs';
import {finalizePilotJob} from './cutloopz-finalize-job.mjs';

// Inspect the uploaded recording rather than trusting the file extension or user duration.
// ffprobe does not invoke the paid generation provider.
export function probeSongDuration(songPath){
 return new Promise((resolve,reject)=>{
  const child=spawn('ffprobe',['-v','error','-select_streams','a:0','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',songPath],{shell:false});
  let output='',error='';
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>2048)child.kill()});
  child.stderr.on('data',chunk=>{error+=chunk;if(error.length>2048)child.kill()});
  child.on('error',reject);
  child.on('close',code=>{
   const seconds=Number(output.trim());
   if(code!==0||!Number.isFinite(seconds)||seconds<=0)reject(Error('Uploaded song has no readable audio duration'));
   else resolve(seconds);
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
 router.use((req,res,next)=>authorize(req)?next():res.status(403).json({ok:false,error:'Administrator access required'}));
 router.get('/status',(_req,res)=>res.json({ok:true,enabled:enabled(),paidRequestsRequireApproval:true,pricingVerified}));
 router.post('/jobs',upload.fields([{name:'song',maxCount:1},{name:'photo',maxCount:1}]),async(req,res)=>{
  const files=[];
  try{
   if(!enabled())return res.status(503).json({ok:false,error:'Production is not enabled'});
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
   const stage=path.join(baseDir,'uploads',randomUUID());await fs.mkdir(stage,{recursive:true});
   const songPath=path.join(stage,'song'+(song.originalname.toLowerCase().endsWith('.wav')?'.wav':'.mp3'));
   const photoPath=path.join(stage,'photo.'+ext);
   files.push(songPath,photoPath);await fs.writeFile(songPath,song.buffer);await fs.writeFile(photoPath,photo.buffer);
   const actualSongSeconds=await probeSongDuration(songPath);
   if(actualSongSeconds+0.25<durationSeconds)throw Error(`Song is ${actualSongSeconds.toFixed(2)} seconds; requested video is ${durationSeconds} seconds`);
   const job=await coordinator.create({durationSeconds,approved:true,photoPath,songPath,maximumEstimatedUSD});
   res.status(201).json({ok:true,jobId:job.id,status:job.status,estimatedUSD:job.estimatedUSD,clips:job.clips.length});
  }catch(e){await Promise.all(files.map(p=>fs.rm(p,{force:true}).catch(()=>{})));res.status(400).json({ok:false,error:String(e.message||e)});}
 });
 router.get('/jobs/:id',async(req,res)=>{try{const job=await coordinator.read(req.params.id);res.json({ok:true,job})}catch{res.status(404).json({ok:false,error:'Job not found'})}});
 router.post('/jobs/:id/advance',async(req,res)=>{try{if(!enabled())return res.status(503).json({ok:false,error:'Production disabled'});if(req.body?.confirmPaidClip!=='yes')return res.status(400).json({ok:false,error:'Explicit confirmation required for each advance; advancing may submit a paid clip'});const job=await coordinator.advance(req.params.id);res.json({ok:true,job})}catch(e){res.status(409).json({ok:false,error:String(e.message||e)})}});
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
