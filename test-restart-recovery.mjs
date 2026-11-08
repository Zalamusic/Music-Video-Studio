import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createPilotOrchestrator} from './cutloopz-pilot-orchestrator.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-restart-'));
let submissions=0;
const adapter={
  async submit(){submissions++;return {id:'pilot-clip-one',status:'queued'}},
  async status(){return {status:'ready'}}
};
try{
  const make=()=>createPilotOrchestrator({baseDir:dir,adapter,unitPriceUSD:0.5,pricingVerified:true});
  let worker=make();
  const job=await worker.create({durationSeconds:15,approved:true,photoPath:'/tmp/reference.jpg',songPath:'/tmp/song.mp3',maximumEstimatedUSD:1.5});
  await worker.advance(job.id);
  assert.equal(submissions,1);
  worker=make(); // Simulate process restart: no in-memory state survives.
  let recovered=await worker.read(job.id);
  assert.equal(recovered.clips[0].pilotId,'pilot-clip-one');
  assert.equal(recovered.clips[0].status,'submitted');
  recovered=await worker.advance(job.id);
  assert.equal(recovered.clips[0].status,'ready');
  assert.equal(submissions,1,'Recovery must poll, not resubmit paid clip');
  recovered=await worker.advance(job.id);
  assert.equal(submissions,2,'Only next clip should be submitted');
  console.log('PASS: persisted provider ID survives coordinator restart; no duplicate paid submission');
}finally{await rm(dir,{recursive:true,force:true})}
