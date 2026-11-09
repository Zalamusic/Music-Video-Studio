// Offline, read-only readiness check. Never launches generation or incurs charges.
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function checkIndependentReadiness({env=process.env, checkBinary=defaultBinaryCheck, checkFile=defaultFileCheck}={}) {
 const checks=[];
 const add=(id,ok,detail)=>checks.push({id,ok:Boolean(ok),detail});
 const backend=(env.CUTLOOPZ_INDEPENDENT_BACKEND||'').trim();
 add('independent-backend-selected',backend==='local','CUTLOOPZ_INDEPENDENT_BACKEND must be local; external pilot is not independent');
 const endpoint=(env.CUTLOOPZ_LOCAL_GENERATOR_URL||'').trim();
 let validEndpoint=false;
 try {const u=new URL(endpoint);validEndpoint=['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)&&['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{}
 add('local-generator-configured',validEndpoint,'Loopback generator endpoint required; configuration alone does not prove a running generator');
 add('ffmpeg-installed',checkBinary('ffmpeg'),'ffmpeg must be available for final video assembly');
 add('ffprobe-installed',checkBinary('ffprobe'),'ffprobe must be available for audio inspection');
 const modelPath=(env.CUTLOOPZ_LOCAL_MODEL_PATH||'').trim();
 add('local-model-configured',Boolean(modelPath)&&checkFile(modelPath),'Local model assets must exist; this does not establish model quality or license');
 add('independent-route-integrated',false,'Current production router still invokes createPilotHttpAdapter; local backend integration and end-to-end tests are outstanding');
 return {ready:checks.every(x=>x.ok),paidCallsMade:false,checks};
}
function defaultBinaryCheck(name){const r=spawnSync(name,['-version'],{encoding:'utf8',timeout:3000});return r.status===0;}
function defaultFileCheck(p){return existsSync(p)}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=checkIndependentReadiness();console.log(JSON.stringify(report,null,2));process.exitCode=report.ready?0:2;
}
