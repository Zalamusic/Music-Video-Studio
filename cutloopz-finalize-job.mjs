import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {assemblePerformanceJob} from './cutloopz-performance-assembler.mjs';

// Finalize only a fully completed job. No provider calls and no paid submissions.
export async function finalizePilotJob({orchestrator,adapter,jobId,baseDir,assembler=assemblePerformanceJob}={}){
 if(!path.isAbsolute(baseDir||'') || !orchestrator?.read || !adapter?.download)throw Error('Invalid finalization dependencies');
 const job=await orchestrator.read(jobId);
 if(job.status!=='ready'||!job.clips?.every(c=>c.status==='ready'&&c.pilotId))throw Error('All clips must be ready before finalization');
 const dir=path.join(baseDir,job.id),workDir=path.join(dir,'assembly');
 await fs.mkdir(dir,{recursive:true});
 const clips=[];
 for(const clip of job.clips){
  const dest=path.join(dir,`clip-${String(clip.number).padStart(3,'0')}.mp4`);
  try{await fs.access(dest)}catch{await adapter.download(clip.pilotId,dest)}
  clips.push({number:clip.number,videoPath:dest,startSeconds:clip.startSeconds,endSeconds:clip.startSeconds+5});
 }
 const out=path.join(dir,'final.mp4');
 const manifestJob={...job,status:'awaiting-assembly',totalClips:clips.length,clips:clips.map(c=>({...c,status:'ready'}))};
 const result=await assembler(manifestJob,{originalSongPath:job.songPath,outputPath:out,workDir});
 const stat=await fs.stat(out);
 if(stat.size<1000)throw Error('Assembled output is unexpectedly small');
 const receipt={jobId:job.id,outputPath:out,bytes:stat.size,lipSyncVerified:false,identityVerified:false,readyForCustomerDelivery:false,assembledAt:new Date().toISOString()};
 const temp=path.join(dir,`assembly-${randomUUID()}.tmp`);
 await fs.writeFile(temp,JSON.stringify(receipt,null,2));await fs.rename(temp,path.join(dir,'assembly.json'));
 return receipt;
}
