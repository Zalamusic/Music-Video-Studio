import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLocalAutoRunner} from './cutloopz-local-auto-runner.mjs';
const id = '11111111-1111-4111-8111-111111111111';
function mock({failAfter=Infinity, loaded=true}={}) {
  let advances=0, completions=0;
  const job={status:'created',clips:Array.from({length:6},(_,i)=>({number:i+1,status:'created'}))};
  const coordinator={
    read:async()=>structuredClone(job),
    advance:async()=>{
      advances++;
      if (advances===failAfter) {job.status='needs-review';job.clips.find(c=>c.status!=='ready').status='needs-review';return structuredClone(job);}
      const clip=job.clips.find(c=>c.status!=='ready');
      if (!clip) {job.status='ready';return structuredClone(job);}
      if (clip.status==='created') {clip.status='submitted';job.status='processing';}
      else {clip.status='ready';job.status=job.clips.every(c=>c.status==='ready')?'ready':'processing';}
      return structuredClone(job);
    }
  };
  const runner=createLocalAutoRunner({coordinator,adapter:{health:async()=>({modelLoaded:loaded})},finalize:async()=>{completions++},wait:async()=>{},pollIntervalMs:0,maxPollsPerClip:30});
  return {runner,job,advances:()=>advances,completions:()=>completions};
}
test('one administrator start processes six local clips and finalizes once',async()=>{
  const x=mock();
  const started=await x.runner.start(id);
  assert.equal(started.state,'running');
  const finished=await x.runner.settled(id);
  assert.equal(finished.state,'complete');
  assert.equal(finished.clipsReady,6);
  assert.equal(x.advances(),12);
  assert.equal(x.completions(),1);
});
test('uncertain generator submission stops without retrying the same clip',async()=>{
  const x=mock({failAfter:3});
  await x.runner.start(id);
  const status=await x.runner.settled(id);
  assert.equal(status.state,'stopped');
  assert.match(status.error,/review/);
  assert.equal(x.advances(),3);
  await assert.rejects(x.runner.start(id),/review/);
  assert.equal(x.completions(),0);
});
test('unloaded model rejects auto run before GPU submission',async()=>{
  const x=mock({loaded:false});
  await assert.rejects(x.runner.start(id),/not loaded/);
  assert.equal(x.advances(),0);
});
test('duplicate starts do not submit duplicate clips',async()=>{
  let release;
  const pause = new Promise(resolve=>release=resolve);
  let advances=0;
  const job={status:'created',clips:Array.from({length:3},()=>({status:'created'}))};
  const runner=createLocalAutoRunner({coordinator:{read:async()=>structuredClone(job),advance:async()=>{advances++;job.status='needs-review';return structuredClone(job)}},adapter:{health:async()=>({modelLoaded:true})},finalize:async()=>{},wait:async()=>pause,pollIntervalMs:0});
  await runner.start(id);
  const again=await runner.start(id);
  assert.equal(again.alreadyRunning,true);
  await runner.settled(id);
  assert.equal(advances,1);
});
