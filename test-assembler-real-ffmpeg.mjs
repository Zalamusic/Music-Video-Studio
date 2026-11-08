
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {createPerformanceJob,approvePerformanceJob,recordClipSubmitted,recordClipResult} from './cutloopz-performance-job.js';
import {assemblePerformanceJob} from './cutloopz-performance-assembler.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-assembly-'));
function ff(args){const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);}
try{
 const audio=path.join(dir,'original.wav');
 ff(['-f','lavfi','-i','sine=frequency=440:duration=15','-c:a','pcm_s16le',audio]);
 const timeline={segments:Array.from({length:3},(_,i)=>({number:i+1,startSeconds:i*5,endSeconds:(i+1)*5,durationSeconds:5,prompt:'test'}))};
 let job=createPerformanceJob({timeline,songSeconds:15,artistPhotoPresent:true});
 job=approvePerformanceJob(job,{approvedBudgetUSD:1.5,explicitApproval:true,providerEnabled:true});
 for(let i=1;i<=3;i++){
  const clip=path.join(dir,`clip-${i}.mp4`);
  ff(['-f','lavfi','-i',`color=c=${['red','green','blue'][i-1]}:s=320x240:r=24:d=4`,'-c:v','libx264','-pix_fmt','yuv420p',clip]);
  job=recordClipSubmitted(job,{number:i,providerRequestId:`mock-${i}`});
  job=recordClipResult(job,{number:i,status:'ready',videoPath:clip});
 }
 const output=path.join(dir,'assembled.mp4');
 const result=await assemblePerformanceJob(job,{originalSongPath:audio,outputPath:output,workDir:path.join(dir,'work')});
 const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',output],{encoding:'utf8'});
 if(probe.status!==0)throw Error(probe.stderr);
 const seconds=Number(probe.stdout.trim());
 if(Math.abs(seconds-15)>0.15)throw Error('Wrong duration '+seconds);
 console.log(JSON.stringify({test:'synthetic video assembly',durationSeconds:seconds,outputExists:true,deliveryAuthorized:result.deliveryAuthorized,lipSyncVerified:result.lipSyncVerified}));
}finally{await rm(dir,{recursive:true,force:true});}
