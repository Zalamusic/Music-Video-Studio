import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createProductionRouter} from './cutloopz-production-router.mjs';
function fakeResponse(){return {statusCode:200,status(c){this.statusCode=c;return this},json(data){this.body=data;return this}};}
test('automatic local route refuses disabled flag or missing full-job approval before any GPU access',async()=>{
 const routes=new Map();let gate;
 const router={use(f){gate=f},get(p,f){routes.set('GET '+p,f)},post(p,...f){routes.set('POST '+p,f.at(-1))}};
 const express={Router:()=>router};
 const multer=()=>({fields:()=>()=>{}});multer.memoryStorage=()=>({});
 const baseDir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-auto-routes-'));
 const previous=process.env.CUTLOOPZ_LOCAL_AUTORUN_ENABLED;
 try{
  createProductionRouter({express,multer,baseDir,authorize:req=>req.authorized===true,origin:'http://127.0.0.1:9999',adminKey:'test'});
  let next=false;
  const unauthorized=fakeResponse();gate({authorized:false,path:'/local/jobs/a/auto-run',method:'POST'},unauthorized,()=>next=true);
  assert.equal(unauthorized.statusCode,403);
  assert.equal(next,false);
  const route=routes.get('POST /local/jobs/:id/auto-run');
  delete process.env.CUTLOOPZ_LOCAL_AUTORUN_ENABLED;
  let res=fakeResponse();await route({params:{id:'11111111-1111-4111-8111-111111111111'},body:{confirmLocalFullJob:'yes'}},res);
  assert.equal(res.statusCode,503);assert.match(res.body.error,/disabled/i);
  process.env.CUTLOOPZ_LOCAL_AUTORUN_ENABLED='true';
  res=fakeResponse();await route({params:{id:'11111111-1111-4111-8111-111111111111'},body:{}},res);
  assert.equal(res.statusCode,400);assert.match(res.body.error,/approval/i);
 }finally{
  if(previous===undefined)delete process.env.CUTLOOPZ_LOCAL_AUTORUN_ENABLED;else process.env.CUTLOOPZ_LOCAL_AUTORUN_ENABLED=previous;
  await rm(baseDir,{recursive:true,force:true});
 }
});
