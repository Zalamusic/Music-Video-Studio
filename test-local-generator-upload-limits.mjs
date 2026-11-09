import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createLocalGeneratorAdapter} from './cutloopz-local-generator-adapter.mjs';
test('rejects oversized song before network submission',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'cutloopz-limits-'));
 try{
  const song=path.join(dir,'song.mp3'),photo=path.join(dir,'photo.jpg');
  const {open}=await import('node:fs/promises');const handle=await open(song,'w');await handle.truncate(32*1024*1024+1);await handle.close();
  await writeFile(photo,Buffer.alloc(20));let called=false;
  const adapter=createLocalGeneratorAdapter({endpoint:'http://localhost:7777/',fetchImpl:async()=>{called=true;throw Error('unexpected network')}});
  await assert.rejects(adapter.submit({songPath:song,photoPath:photo,startSeconds:0,allowPaidTest:'yes'}),/song size outside limits/);
  assert.equal(called,false);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('rejects oversized photo before network submission',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'cutloopz-limits-'));
 try{
  const song=path.join(dir,'song.mp3'),photo=path.join(dir,'photo.jpg');
  await writeFile(song,Buffer.alloc(20));const {open}=await import('node:fs/promises');const handle=await open(photo,'w');await handle.truncate(12*1024*1024+1);await handle.close();
  let called=false;const adapter=createLocalGeneratorAdapter({endpoint:'http://localhost:7777/',fetchImpl:async()=>{called=true;throw Error('unexpected network')}});
  await assert.rejects(adapter.submit({songPath:song,photoPath:photo,startSeconds:0,allowPaidTest:'yes'}),/photo size outside limits/);
  assert.equal(called,false);
 }finally{await rm(dir,{recursive:true,force:true})}
});
