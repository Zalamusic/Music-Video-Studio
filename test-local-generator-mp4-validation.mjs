import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLocalGeneratorAdapter} from './cutloopz-local-generator-adapter.mjs';
const id='00000000-0000-4000-8000-000000000001';
const makeAdapter=bytes=>createLocalGeneratorAdapter({endpoint:'http://localhost:7777/',fetchImpl:async()=>({ok:true,headers:{get:()=>String(bytes.length)},arrayBuffer:async()=>bytes})});
test('rejects non-MP4 generator output without writing a file',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-mp4-'));try{const target=path.join(dir,'output.mp4');await assert.rejects(makeAdapter(Buffer.alloc(2048)).download(id,target),/invalid MP4/);await assert.rejects(readFile(target),{code:'ENOENT'});}finally{await rm(dir,{recursive:true,force:true})}});
test('accepts MP4 file signature and writes atomically',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-mp4-'));try{const bytes=Buffer.alloc(2048);bytes.writeUInt32BE(24,0);bytes.write('ftyp',4);bytes.write('isom',8);const target=path.join(dir,'output.mp4');await makeAdapter(bytes).download(id,target);assert.deepEqual(await readFile(target),bytes);await assert.rejects(readFile(target+'.partial'),{code:'ENOENT'});}finally{await rm(dir,{recursive:true,force:true})}});

test('aborts oversized streamed generator response before buffering full video',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-stream-cap-'));
 try{
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(121*1024*1024));controller.close()}});
  const adapter=createLocalGeneratorAdapter({endpoint:'http://localhost:7777/',fetchImpl:async()=>({ok:true,headers:{get:()=>null},body:stream})});
  const target=path.join(dir,'output.mp4');
  await assert.rejects(adapter.download(id,target),/size limit/);
  await assert.rejects(readFile(target),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true})}
});
