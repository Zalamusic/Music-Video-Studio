/** Controller check is read-only: it must never submit a GPU job. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createProductionRouter} from './cutloopz-production-router.mjs';
function fakeResponse(){return {statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};}
async function routeStatus(vars){
 const keys=['CUTLOOPZ_LOCAL_GENERATOR_URL','CUTLOOPZ_LOCAL_GENERATION_ENABLED','CUTLOOPZ_REMOTE_GENERATOR_HOST','CUTLOOPZ_WORKER_SHARED_TOKEN'];
 const old=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const baseDir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-bridge-status-'));
 const router={handlers:new Map(),use(){},get(k,f){this.handlers.set('GET '+k,f)},post(k,...f){this.handlers.set('POST '+k,f.at(-1))}};
 const express={Router:()=>router};
 const multer=()=>({fields:()=>()=>{}});multer.memoryStorage=()=>({});
 try{
  for(const key of keys)delete process.env[key];
  Object.assign(process.env,vars);
  createProductionRouter({express,multer,baseDir,authorize:()=>true,origin:'http://127.0.0.1:19080',adminKey:'test'});
  const res=fakeResponse();
  await router.handlers.get('GET /local/status')({},res);
  return res;
 }finally{
  for(const [k,v] of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;
  await rm(baseDir,{recursive:true,force:true});
 }
}
test('readiness tells administrator when no generator address exists, even while generation is off',async()=>{
 const res=await routeStatus({CUTLOOPZ_LOCAL_GENERATION_ENABLED:'false'});
 assert.equal(res.statusCode,200);
 assert.equal(res.body.configured,false);
 assert.equal(res.body.connected,false);
 assert.equal(res.body.readyToSubmit,false);
 assert.match(res.body.message,/not configured/);
});
test('a misconfigured remote route reports a useful status without any network call',async()=>{
 const res=await routeStatus({CUTLOOPZ_LOCAL_GENERATOR_URL:'https://worker.example.com/',CUTLOOPZ_LOCAL_GENERATION_ENABLED:'false'});
 assert.equal(res.statusCode,200);
 assert.equal(res.body.configured,true);
 assert.equal(res.body.connected,false);
 assert.equal(res.body.generationEnabled,false);
 assert.match(res.body.message,/authenticated HTTPS host/);
});
