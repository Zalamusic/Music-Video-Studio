import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPilotOrchestrator} from './cutloopz-pilot-orchestrator.mjs';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
const adapter={submit:async()=>{throw Error('must not submit')},status:async()=>({status:'processing'})};
test('reject non-finite and nonpositive unit prices',()=>{
 for(const unitPriceUSD of [NaN,Infinity,-1,0]) assert.throws(()=>createPilotOrchestrator({baseDir:'/tmp',adapter,unitPriceUSD}),/finite positive/);
});
test('reject non-finite budgets without creating jobs',async()=>{
 const baseDir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-budget-'));
 try{
  const engine=createPilotOrchestrator({baseDir,adapter,unitPriceUSD:0.5,pricingVerified:true});
  for(const maximumEstimatedUSD of [NaN,Infinity,-Infinity,0,-1,1]) await assert.rejects(engine.create({durationSeconds:15,approved:true,photoPath:'/tmp/photo.jpg',songPath:'/tmp/song.mp3',maximumEstimatedUSD}),/finite budget/);
  const job=await engine.create({durationSeconds:15,approved:true,photoPath:'/tmp/photo.jpg',songPath:'/tmp/song.mp3',maximumEstimatedUSD:1.5});
  assert.equal(job.estimatedUSD,1.5);
 }finally{await rm(baseDir,{recursive:true,force:true})}
});
