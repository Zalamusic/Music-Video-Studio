import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createPilotOrchestrator} from './cutloopz-pilot-orchestrator.mjs';
const baseDir=await mkdtemp(path.join(tmpdir(),'eight-shot-'));
try {
 const calls=[]; const refs=Array.from({length:6},(_,i)=>`/ref${i}.png`); const indices=[0,1,2,3,4,5,1,0];
 const o=createPilotOrchestrator({baseDir,variableClips:true,pricingVerified:true,adapter:{submit:async x=>{calls.push(x);return {id:String(calls.length),status:'queued'}},status:async()=>({status:'ready'})}});
 const input={durationSeconds:60,approved:true,photoPath:refs[0],photoPaths:refs,referenceIndices:indices,songPath:'/song.wav',maximumEstimatedUSD:6};
 await assert.rejects(o.create({...input,maximumEstimatedUSD:5.99}));
 await assert.rejects(o.create({...input,referenceIndices:[6]}));
 let j=await o.create(input);assert.equal(j.clips.length,8);assert.equal(j.estimatedUSD,6);
 for(let i=0;i<16;i++)j=await o.advance(j.id);
 assert.equal(j.status,'ready');assert.equal(calls.length,8);
 calls.forEach((c,i)=>{assert.equal(c.startSeconds,i*7.5);assert.equal(c.durationSeconds,7.5);assert.equal(c.photoPath,refs[indices[i]]);assert.equal(c.songPath,input.songPath)});
 console.log('PASS: eight shots, 60 seconds, six references, audio offsets, budget and sequential completion (mock provider)');
}finally{await rm(baseDir,{recursive:true,force:true})}
