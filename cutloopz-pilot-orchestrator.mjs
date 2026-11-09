import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// Persistent, single-flight coordinator. The adapter uses the existing pilot routes.
// An uncertain submission is NEVER automatically repeated: this prevents double billing.
const terminal = new Set(['ready','failed','dry-run']);
const allowed = new Set(['created','submitting','submitted','processing','ready','failed','needs-review']);
export function createPilotOrchestrator({baseDir,adapter,clock=()=>new Date().toISOString(),unitPriceUSD=0.5,pricingVerified=false}={}){
 if(!path.isAbsolute(baseDir||'')||!adapter?.submit||!adapter?.status)throw Error('Missing orchestrator dependencies');
 if(!Number.isFinite(unitPriceUSD)||unitPriceUSD<=0)throw Error('Clip price must be a finite positive number');
 const inFlight=new Set();
 const file=id=>{if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Invalid job ID');return path.join(baseDir,id,'job.json')};
 async function write(job){const p=file(job.id);await fs.mkdir(path.dirname(p),{recursive:true});const tmp=p+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(job,null,2));await fs.rename(tmp,p);return job;}
 async function read(id){return JSON.parse(await fs.readFile(file(id),'utf8'))}
 async function create({durationSeconds,approved,photoPath,songPath,maximumEstimatedUSD=0}={}){
  if(!Number.isInteger(durationSeconds)||durationSeconds<15||durationSeconds>360||durationSeconds%5)throw Error('Duration must be 15–360 seconds in five-second increments');
  if(!path.isAbsolute(photoPath||'')||!path.isAbsolute(songPath||''))throw Error('Absolute input paths required');
  const estimate=durationSeconds/5*unitPriceUSD;
  if(approved!==true || !Number.isFinite(maximumEstimatedUSD) || maximumEstimatedUSD<=0 || maximumEstimatedUSD<estimate)throw Error('Explicit finite budget approval required');
  const job={id:randomUUID(),createdAt:clock(),durationSeconds,estimatedUSD:estimate,maximumEstimatedUSD,unitPriceUSD,pricingVerified,photoPath,songPath,status:'created',clips:Array.from({length:durationSeconds/5},(_,i)=>({number:i+1,startSeconds:i*5,status:'created',pilotId:null}))};
  return write(job);
 }
 async function advance(id){
  if(inFlight.has(id))throw Error('Job is already being advanced');inFlight.add(id);
  try{
   const job=await read(id);if(job.status==='failed'||job.status==='ready')return job;
   const clip=job.clips.find(c=>c.status!=='ready');
   if(!clip){job.status='ready';return write(job)}
   if(clip.status==='submitting'){job.status='needs-review';return write(job)}
   if(clip.status==='needs-review'){job.status='needs-review';return job}
   if(clip.status==='created'){
    if(!pricingVerified || job.pricingVerified!==true || !Number.isFinite(unitPriceUSD) || unitPriceUSD<=0 || job.unitPriceUSD!==unitPriceUSD)throw Error('Paid generation blocked: verified provider price required');
    const submittedCount=job.clips.filter(c=>c.status!=='created').length;
    if((submittedCount+1)*unitPriceUSD>job.maximumEstimatedUSD+1e-8)throw Error('Paid generation blocked: approved budget exceeded');
    // Save before calling provider. On network uncertainty, require manual reconciliation.
    clip.status='submitting';job.status='submitting';await write(job);
    try{const submitted=await adapter.submit({songPath:job.songPath,photoPath:job.photoPath,startSeconds:clip.startSeconds,allowPaidTest:'yes'});
     if(!submitted?.id || !['queued','processing'].includes(submitted.status))throw Error('Pilot did not return a confirmed paid request');
     clip.pilotId=submitted.id;clip.status='submitted';job.status='processing';return write(job);
    }catch(e){clip.status='needs-review';clip.error=String(e.message||e);job.status='needs-review';return write(job)}
   }
   if(clip.status==='submitted'||clip.status==='processing'){
    try{const status=await adapter.status(clip.pilotId);
     if(status.status==='ready'){clip.status='ready';clip.videoReady=true;job.status=job.clips.every(c=>c.status==='ready')?'ready':'processing'}
     else if(status.status==='failed'){clip.status='failed';job.status='failed';clip.error=status.error||'Provider failed'}
     else {clip.status='processing';job.status='processing'}
     return write(job);
    }catch(e){job.status='needs-review';clip.status='needs-review';clip.error=String(e.message||e);return write(job)}
   }
   return job;
  }finally{inFlight.delete(id)}
 }
 return {create,read,advance};
}
