import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createPilotOrchestrator} from './cutloopz-pilot-orchestrator.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-'));
try{
 let calls=0;const adapter={submit:async()=>({id:'pilot-'+(++calls),status:'queued'}),status:async()=>({status:'ready'})};
 let o=createPilotOrchestrator({baseDir:dir,adapter,pricingVerified:true});
 await assert.rejects(o.create({durationSeconds:30,approved:false,songPath:'/song',photoPath:'/photo',maximumEstimatedUSD:3}));
 await assert.rejects(o.create({durationSeconds:30,approved:true,songPath:'/song',photoPath:'/photo',maximumEstimatedUSD:2}));
 let j=await o.create({durationSeconds:30,approved:true,songPath:'/song',photoPath:'/photo',maximumEstimatedUSD:3});
 for(let i=0;i<12;i++){j=await o.advance(j.id);assert.equal(j.clips.filter(c=>c.status==='ready').length,Math.floor((i+1)/2));}
 assert.equal(j.status,'ready');assert.equal(calls,6);
 o=createPilotOrchestrator({baseDir:dir,adapter,pricingVerified:true});assert.equal((await o.read(j.id)).status,'ready');
 let uncertain=createPilotOrchestrator({baseDir:dir,adapter:{submit:async()=>{throw Error('timeout')},status:adapter.status},pricingVerified:true});
 let x=await uncertain.create({durationSeconds:15,approved:true,songPath:'/song',photoPath:'/photo',maximumEstimatedUSD:1.5});
 x=await uncertain.advance(x.id);assert.equal(x.status,'needs-review');assert.equal(x.clips[0].status,'needs-review');
 x=await uncertain.advance(x.id);assert.equal(x.status,'needs-review');
 console.log('PASS: six-clip sequential coordination, durable state, cost approval, and no automatic retry on uncertain submission');
}finally{await rm(dir,{recursive:true,force:true})}
