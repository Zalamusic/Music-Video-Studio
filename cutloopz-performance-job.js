import {buildPerformanceSchedule} from './cutloopz-performance-bridge.js';
const validStates=new Set(['pending','submitted','ready','failed']);
function check(job){
 if(!job || !Array.isArray(job.clips) || job.clips.length!==job.totalClips)throw Error('Invalid production job');
}
export function createPerformanceJob({timeline,songSeconds,artistPhotoPresent}){
 const schedule=buildPerformanceSchedule({timeline,songSeconds,artistPhotoPresent});
 return {...schedule,mode:'coordinated-preview',status:'awaiting-authorization',approvedBudgetUSD:null,spentOrCommittedUSD:0,clips:schedule.clips.map(c=>({...c,status:'pending',providerRequestId:null,videoPath:null})),renderAuthorized:false};
}
export function approvePerformanceJob(job,{approvedBudgetUSD,explicitApproval=false,providerEnabled=false}={}){
 check(job);
 if(job.status!=='awaiting-authorization')throw Error('Job cannot be approved in this state');
 if(!explicitApproval || !providerEnabled)throw Error('Explicit administrator approval and provider readiness required');
 if(!Number.isFinite(approvedBudgetUSD)||approvedBudgetUSD<job.estimatedProviderCostUSD)throw Error('Approved budget is below estimate');
 return {...job,status:'approved',approvedBudgetUSD,renderAuthorized:true,costAuthorized:true};
}
export function nextPerformanceClip(job,{estimatedClipCostUSD=0.50}={}){
 check(job);
 if(!job.renderAuthorized||!job.costAuthorized||!['approved','running'].includes(job.status))throw Error('Rendering not authorized');
 if(job.clips.some(c=>c.status==='submitted'))throw Error('Wait for current clip before submitting another');
 if(job.clips.some(c=>c.status==='failed'))throw Error('Failed clip requires operator recovery');
 const clip=job.clips.find(c=>c.status==='pending');
 if(!clip)return null;
 if(!Number.isFinite(estimatedClipCostUSD)||estimatedClipCostUSD<=0)throw Error('Invalid cost estimate');
 if(job.spentOrCommittedUSD+estimatedClipCostUSD>job.approvedBudgetUSD+1e-8)throw Error('Approved budget exhausted');
 return {...clip,estimatedClipCostUSD};
}
export function recordClipSubmitted(job,{number,providerRequestId,estimatedClipCostUSD=0.50}){
 const next=nextPerformanceClip(job,{estimatedClipCostUSD});
 if(!next||next.number!==number||typeof providerRequestId!=='string'||!providerRequestId.trim())throw Error('Unexpected clip submission');
 return {...job,status:'running',spentOrCommittedUSD:Number((job.spentOrCommittedUSD+estimatedClipCostUSD).toFixed(4)),clips:job.clips.map(c=>c.number===number?{...c,status:'submitted',providerRequestId,estimatedClipCostUSD}:c)};
}
export function recordClipResult(job,{number,status,videoPath=null}){
 check(job);
 if(!['ready','failed'].includes(status))throw Error('Unsupported clip result');
 const clip=job.clips.find(c=>c.number===number);
 if(!clip||clip.status!=='submitted')throw Error('Clip not awaiting result');
 if(status==='ready'&&(!videoPath||typeof videoPath!=='string'))throw Error('Video path required');
 const clips=job.clips.map(c=>c.number===number?{...c,status,videoPath:status==='ready'?videoPath:null}:c);
 return {...job,clips,status:status==='failed'?'needs-review':clips.every(c=>c.status==='ready')?'awaiting-assembly':'running',renderAuthorized:status==='failed'?false:job.renderAuthorized};
}
export function assemblyManifest(job){
 check(job);
 if(job.status!=='awaiting-assembly'||job.clips.some(c=>c.status!=='ready'))throw Error('All clips must be ready before assembly');
 return {durationSeconds:job.durationSeconds,originalAudioMustBePreserved:true,segments:job.clips.map(c=>({number:c.number,startSeconds:c.startSeconds,endSeconds:c.endSeconds,videoPath:c.videoPath})),qualityVerified:false,deliveryAuthorized:false};
}
