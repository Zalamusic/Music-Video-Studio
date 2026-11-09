import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLocalGeneratorAdapter} from './cutloopz-local-generator-adapter.mjs';
test('local generator forwards real WAV and PNG types rather than mislabeled MP3/JPEG',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-media-'));
 try{
  const song=Buffer.alloc(1100);song.write('RIFF');song.write('WAVE',8);
  const photo=Buffer.alloc(1100);Buffer.from([137,80,78,71,13,10,26,10]).copy(photo);
  const songPath=path.join(dir,'song.wav'),photoPath=path.join(dir,'photo.png');
  await writeFile(songPath,song);await writeFile(photoPath,photo);
  let checked=false;
  const adapter=createLocalGeneratorAdapter({endpoint:'http://127.0.0.1:7777/',fetchImpl:async(_url,opts)=>{
   const audio=opts.body.get('song'),image=opts.body.get('photo');
   assert.equal(audio.name,'song.wav');assert.equal(audio.type,'audio/wav');
   assert.equal(image.name,'photo.png');assert.equal(image.type,'image/png');checked=true;
   return {ok:true,json:async()=>({ok:true,id:'00000000-0000-4000-8000-000000000001',status:'queued'})};
  }});
  await adapter.submit({songPath,photoPath,startSeconds:0,allowPaidTest:'yes'});assert.equal(checked,true);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('local generator refuses invalid media before submission',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-media-'));
 try{const songPath=path.join(dir,'song.mp3'),photoPath=path.join(dir,'photo.jpg');await writeFile(songPath,Buffer.alloc(1200));await writeFile(photoPath,Buffer.alloc(1200));
  const adapter=createLocalGeneratorAdapter({endpoint:'http://localhost:7777/',fetchImpl:()=>{throw Error('network should not be called')}});
  await assert.rejects(adapter.submit({songPath,photoPath,startSeconds:0,allowPaidTest:'yes'}),/MP3 or WAV/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
