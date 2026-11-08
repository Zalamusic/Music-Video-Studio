import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createPilotOrchestrator} from './cutloopz-pilot-orchestrator.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-price-'));let calls=0;
const adapter={submit:async()=>{calls++;return {id:'pilot-1',status:'queued'}},status:async()=>({status:'processing'})};
try{
 const args={baseDir:dir,adapter,unitPriceUSD:2};
 const locked=createPilotOrchestrator({...args,pricingVerified:false});
 const job=await locked.create({durationSeconds:15,approved:true,photoPath:'/tmp/photo.png',songPath:'/tmp/song.mp3',maximumEstimatedUSD:6});
 await assert.rejects(()=>locked.advance(job.id),/verified provider price/);assert.equal(calls,0);
 const verified=createPilotOrchestrator({...args,pricingVerified:true});
 await assert.rejects(()=>verified.advance(job.id),/verified provider price/);assert.equal(calls,0);
 const good=await verified.create({durationSeconds:15,approved:true,photoPath:'/tmp/photo.png',songPath:'/tmp/song.mp3',maximumEstimatedUSD:6});
 const result=await verified.advance(good.id);assert.equal(result.clips[0].status,'submitted');assert.equal(calls,1);
 console.log('PASS: fail-closed pricing gate; budget approval; no calls when price unverified');
}finally{await rm(dir,{recursive:true,force:true})}
