import {promises as fs} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
const exec=promisify(execFile);
export const LTX_MODEL='fal-ai/ltx-2.3/audio-to-video';
export function createLtxAdapter({fal,fetchImpl=fetch,run=exec}={}){
 if(!fal?.queue||!fal?.storage)throw Error('fal client required');
 return {
 async health(){return {modelLoaded:!!process.env.FAL_KEY,modelId:LTX_MODEL}},
 async submit({songPath,photoPath,startSeconds,durationSeconds=5,format='landscape',creativePrompt='',allowPaidTest}){
  if(allowPaidTest!=='yes'||!process.env.FAL_KEY)throw Error('Paid generation not authorized or configured');
  if(!Number.isFinite(startSeconds)||startSeconds<0||!Number.isFinite(durationSeconds)||durationSeconds<2||durationSeconds>10)throw Error('Invalid clip window');
  if(!['landscape','vertical'].includes(format)||creativePrompt.length>5000)throw Error('Invalid orientation or prompt exceeds 5000 characters');
  const dir=await fs.mkdtemp(path.join(tmpdir(),'cl-ltx-'));
  try{
   const audio=path.join(dir,'clip.wav');
   await run('ffmpeg',['-nostdin','-v','error','-ss',String(startSeconds),'-i',songPath,'-t',String(durationSeconds),'-vn','-ac','1','-ar','24000',audio],{timeout:30000});
   const image=await fs.readFile(photoPath);const mime=photoPath.endsWith('.png')?'image/png':photoPath.endsWith('.webp')?'image/webp':'image/jpeg';
   const audio_url=await fal.storage.upload(new Blob([await fs.readFile(audio)],{type:'audio/wav'}));
   const image_url=await fal.storage.upload(new Blob([image],{type:mime}));
   const receipt=await fal.queue.submit(LTX_MODEL,{input:{audio_url,image_url,prompt:creativePrompt||'Natural musical performance with consistent identity.',aspect_ratio:format==='vertical'?'9:16':'16:9',enable_safety_checker:true}});
   if(!receipt.request_id)throw Error('Missing provider receipt');return {id:receipt.request_id,status:'queued'};
  }finally{await fs.rm(dir,{recursive:true,force:true});}
 },
 async status(id){const s=await fal.queue.status(LTX_MODEL,{requestId:id});return {status:s.status==='COMPLETED'?'ready':s.status==='IN_QUEUE'?'queued':s.status==='IN_PROGRESS'?'processing':'failed'}},
 async download(id,dest){const r=await fal.queue.result(LTX_MODEL,{requestId:id});const url=new URL(r.data.video.url);if(url.protocol!=='https:'||!/(^|\.)fal\.media$/.test(url.hostname))throw Error('Unexpected video host');const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!response.ok||!response.body)throw Error('Video download failed');let size=0;const temp=dest+'.partial';try{await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,_,cb){size+=chunk.length;cb(size>120*1024*1024?Error('Video too large'):null,chunk)}}), (await import('node:fs')).createWriteStream(temp,{flags:'wx'}));await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_type','-of','csv=p=0',temp],{timeout:15000}).then(x=>{if(!x.stdout.includes('video'))throw Error('No video stream')});await fs.rename(temp,dest);}catch(e){await fs.rm(temp,{force:true});throw e}return dest;}
 };
}
