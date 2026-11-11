/** No-charge 30s integration test through the actual local HTTP adapter,
 * coordinator, auto-runner, download and ffmpeg assembler. Fake color clips
 * are generated locally and are NOT a trained music-video model.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {mkdtemp,writeFile,rm,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLocalGeneratorAdapter} from './cutloopz-local-generator-adapter.mjs';
import {createPilotOrchestrator} from './cutloopz-pilot-orchestrator.mjs';
import {createLocalAutoRunner} from './cutloopz-local-auto-runner.mjs';
import {finalizePilotJob} from './cutloopz-finalize-job.mjs';
function ff(...args){const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||'ffmpeg failed');}
function probe(file){const r=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height:format=duration','-of','json',file],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||'ffprobe failed');return JSON.parse(r.stdout);}
test('full local 30-second portrait job assembles six synthetic clips and original audio, without provider calls', {timeout:120000}, async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'cutloopz-30s-local-'));
 let server;
 try{
  const audio=path.join(root,'original.wav'),photo=path.join(root,'reference.png');
  ff('-f','lavfi','-i','sine=frequency=440:duration=30','-c:a','pcm_s16le',audio);
  // Tiny valid reference PNG; the mock never uses this as a real image-generation input.
  await writeFile(photo,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64'));
  const clips=[];
  for(const color of ['red','green','blue','yellow','magenta','cyan']){
   const file=path.join(root,`mock-${color}.mp4`);
   ff('-f','lavfi','-i',`color=c=${color}:s=160x90:r=12:d=5`,'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',file);
   clips.push(file);
  }
  const jobs=new Map(),requests={submitted:0,downloaded:0};
  server=http.createServer(async(req,res)=>{
   const url=new URL(req.url,'http://127.0.0.1');
   res.setHeader('Cache-Control','no-store');
   const json=(code,obj)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(obj));};
   if(req.method==='GET'&&url.pathname==='/health')return json(200,{ok:true,modelLoaded:true,modelId:'synthetic-test-only'});
   if(req.method==='POST'&&url.pathname==='/jobs'){
    // Read and discard multipart media, matching transport while disabling inference.
    let received=0;
    for await(const chunk of req)received+=chunk.length;
    if(received<1000)return json(400,{ok:false,error:'Missing input'});
    const id=randomUUID(),index=requests.submitted++;
    if(index>=clips.length)return json(429,{ok:false,error:'Synthetic test clip limit reached'});
    jobs.set(id,{clip:clips[index],status:'ready'});
    return json(202,{ok:true,id,status:'queued'});
   }
   const m=/^\/jobs\/([0-9a-f-]{36})(\/video)?$/.exec(url.pathname);
   if(m&&jobs.has(m[1])){
    if(m[2]&&req.method==='GET'){requests.downloaded++;res.setHeader('Content-Type','video/mp4');return createReadStream(jobs.get(m[1]).clip).pipe(res);}
    if(req.method==='GET')return json(200,{ok:true,status:'ready'});
   }
   return json(404,{ok:false,error:'not found'});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const adapter=createLocalGeneratorAdapter({endpoint:`http://127.0.0.1:${server.address().port}/`});
  const baseDir=path.join(root,'jobs');
  const coordinator=createPilotOrchestrator({baseDir,adapter,unitPriceUSD:0.01,pricingVerified:true});
  const job=await coordinator.create({durationSeconds:30,format:'vertical',approved:true,photoPath:photo,songPath:audio,maximumEstimatedUSD:0.06});
  const runner=createLocalAutoRunner({coordinator,adapter,finalize:id=>finalizePilotJob({orchestrator:coordinator,adapter,jobId:id,baseDir}),pollIntervalMs:0,wait:async()=>{},maxPollsPerClip:20});
  await runner.start(job.id);
  const result=await runner.settled(job.id);
  assert.equal(result.state,'complete',result.error||'unknown runner error');
  assert.equal(result.clipsReady,6);
  assert.equal(requests.submitted,6);
  assert.equal(requests.downloaded,6);
  const output=path.join(baseDir,job.id,'final.mp4');
  assert.ok((await stat(output)).size>1000);
  const info=probe(output);
  const video=info.streams.find(s=>s.codec_type==='video'),sound=info.streams.find(s=>s.codec_type==='audio');
  assert.deepEqual([video.width,video.height],[360,640]);
  assert.ok(sound,'Original audio stream must be present');
  assert.ok(Math.abs(Number(info.format.duration)-30)<0.25);
  const receipt=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(baseDir,job.id,'assembly.json'),'utf8'));
  assert.equal(receipt.readyForCustomerDelivery,false);
  assert.equal(receipt.lipSyncVerified,false);
  console.log('PASS synthetic 30s local transport -> six clips -> portrait assembly -> audio -> private receipt. No model or GPU used.');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  await rm(root,{recursive:true,force:true});
 }
});
