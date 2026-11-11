/** CutLoopz local model worker. Run on the SAME host as the production router.
 * Requires an actual installed model runner implementing CUTLOOPZ_MODEL_RUNNER contract.
 * No cloud fallback and no synthetic footage presented as generated footage.
 */
import express from 'express';
import multer from 'multer';
import {promises as fs, createReadStream, constants as fsConstants} from 'node:fs';
import {detectLocalMedia} from './cutloopz-local-media-validation.mjs';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
const app=express();
const root=path.resolve(process.env.CUTLOOPZ_WORKER_DIR||path.join(os.tmpdir(),'cutloopz-local-model'));
const runner=process.env.CUTLOOPZ_MODEL_RUNNER||'';
const modelId=process.env.CUTLOOPZ_MODEL_ID||'unconfigured';
const port=Number(process.env.CUTLOOPZ_WORKER_PORT||8765);
const jobs=new Map();let busy=false;
const upload=multer({storage:multer.memoryStorage(),limits:{files:2,fileSize:32*1024*1024}});
const ready=async()=>{if(!runner||process.env.CUTLOOPZ_MODEL_ENABLED!=='true')return false;try{const s=await fs.stat(runner);if(!s.isFile())return false;await fs.access(runner,fsConstants.X_OK);return true}catch{return false}};
app.get('/health',async(_req,res)=>res.json({ok:true,modelLoaded:await ready(),modelId,activeJobs:busy?1:0}));
app.post('/jobs',upload.fields([{name:'song',maxCount:1},{name:'photo',maxCount:1}]),async(req,res)=>{
 if(!await ready())return res.status(503).json({ok:false,error:'Local model runner not installed or enabled'});
 if(busy)return res.status(429).json({ok:false,error:'Local model busy'});
 const start=Number(req.body?.startSeconds),duration=Number(req.body?.durationSeconds);
 if(!Number.isInteger(start)||start<0||start>355||start%5||duration!==5)return res.status(400).json({ok:false,error:'Invalid five-second segment'});
 const format=req.body?.format||'landscape';
 if(!['landscape','vertical'].includes(format))return res.status(400).json({ok:false,error:'Invalid video orientation'});
 const song=req.files?.song?.[0],photo=req.files?.photo?.[0];
 if(!song||!photo)return res.status(400).json({ok:false,error:'Song and photo required'});
 let types;try{types=detectLocalMedia({song:song.buffer,photo:photo.buffer})}catch(error){return res.status(400).json({ok:false,error:error.message})}
 const id=randomUUID(),dir=path.join(root,id),job={id,status:'queued',error:null};
 const songPath=path.join(dir,'song.'+types.songExtension),photoPath=path.join(dir,'photo.'+types.photoExtension);
 try{await fs.mkdir(dir,{recursive:true,mode:0o700});await fs.writeFile(songPath,song.buffer,{mode:0o600});await fs.writeFile(photoPath,photo.buffer,{mode:0o600})}catch{await fs.rm(dir,{force:true,recursive:true}).catch(()=>{});return res.status(500).json({ok:false,error:'Unable to stage inputs'})}
 jobs.set(id,job);busy=true;
 res.status(202).json({ok:true,id,status:'queued'});
 queueMicrotask(async()=>{
  job.status='processing';
  const output=path.join(dir,'video.mp4');
  try{
   await new Promise((resolve,reject)=>{
    const child=spawn(runner,['--song',songPath,'--photo',photoPath,'--start',String(start),'--seconds','5','--format',format,'--output',output],{shell:false,stdio:'ignore'});
    const timeout=setTimeout(()=>child.kill('SIGKILL'),30*60*1000);
    child.on('error',e=>{clearTimeout(timeout);reject(e)});
    child.on('close',code=>{clearTimeout(timeout);code===0?resolve():reject(Error('Model runner failed or timed out'))});
   });
   const stat=await fs.stat(output);const handle=await fs.open(output,'r');const header=Buffer.alloc(12);await handle.read(header,0,12,0);await handle.close();
   if(stat.size<1000||header.toString('ascii',4,8)!=='ftyp')throw Error('Runner did not produce valid MP4');
   job.status='ready';
  }catch(e){job.status='failed';job.error=e.message;await fs.rm(output,{force:true}).catch(()=>{})}
  finally{busy=false}
 });
});
app.get('/jobs/:id',(req,res)=>{const job=jobs.get(req.params.id);if(!job)return res.status(404).json({ok:false,error:'Job not found'});res.json({ok:true,status:job.status,error:job.error})});
app.get('/jobs/:id/video',async(req,res)=>{const job=jobs.get(req.params.id);if(!job||job.status!=='ready')return res.status(404).json({ok:false,error:'Video not ready'});const p=path.join(root,job.id,'video.mp4');try{await fs.access(p);res.type('mp4');res.set('Cache-Control','no-store');createReadStream(p).pipe(res)}catch{res.status(404).json({ok:false,error:'Video missing'})}});
app.listen(port,'127.0.0.1',()=>console.log(`CutLoopz local model worker on 127.0.0.1:${port}; runner ${runner?'configured':'missing'}`));
