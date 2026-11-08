import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {finalizePilotJob} from './cutloopz-finalize-job.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-finalize-'));
try{
 const id='11111111-1111-4111-8111-111111111111',song=path.join(dir,'song.mp3');await writeFile(song,'mock');
 const job={id,status:'ready',durationSeconds:15,songPath:song,clips:[0,1,2].map(i=>({number:i+1,startSeconds:i*5,status:'ready',pilotId:`pilot-${i}`}))};
 let downloads=0,assemblies=0;
 const adapter={download:async(_,dest)=>{downloads++;await writeFile(dest,Buffer.alloc(2000));return dest}};
 const assembler=async(j,{outputPath})=>{assemblies++;assert.equal(j.status,'awaiting-assembly');assert.equal(j.totalClips,3);await writeFile(outputPath,Buffer.alloc(3000));return {outputPath}};
 const orchestrator={read:async()=>job};
 const a=await finalizePilotJob({orchestrator,adapter,jobId:id,baseDir:dir,assembler});
 assert.equal(downloads,3);assert.equal(assemblies,1);assert.equal(a.readyForCustomerDelivery,false);
 const b=await finalizePilotJob({orchestrator,adapter,jobId:id,baseDir:dir,assembler});assert.equal(downloads,3);assert.equal(b.bytes,3000);
 const receipt=JSON.parse(await readFile(path.join(dir,id,'assembly.json')));assert.equal(receipt.lipSyncVerified,false);
 await assert.rejects(finalizePilotJob({orchestrator:{read:async()=>({...job,status:'processing'})},adapter,jobId:id,baseDir:dir,assembler}));
 console.log('PASS: ready-only assembly, clip downloads, restart-safe clip reuse, receipt, and no customer release (mock clips)');
}finally{await rm(dir,{recursive:true,force:true})}
