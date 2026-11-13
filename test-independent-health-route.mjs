import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createProductionRouter} from './cutloopz-production-router.mjs';
const response=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}});
test('independent health reports missing, invalid, and reachable local generator without submissions',async()=>{
 const routes=new Map();const router={use(){},get(p,h){routes.set(p,h)},post(){}};
 const express={Router:()=>router};const multer=()=>({fields:()=>()=>{}});multer.memoryStorage=()=>({});
 const dir=await mkdtemp(path.join(tmpdir(),'cutloopz-health-'));
 const previous=process.env.CUTLOOPZ_LOCAL_GENERATOR_URL;
 let server;let requests=[];
 try{
  createProductionRouter({express,multer,baseDir:dir,authorize:()=>true,origin:'http://127.0.0.1:9999',adminKey:'test'});
  const health=routes.get('/independent-health');assert.equal(typeof health,'function');
  delete process.env.CUTLOOPZ_LOCAL_GENERATOR_URL;
  let r=response();await health({},r);assert.equal(r.statusCode,503);assert.equal(r.body.configured,false);
  process.env.CUTLOOPZ_LOCAL_GENERATOR_URL='https://example.com/';r=response();await health({},r);assert.equal(r.statusCode,503);assert.equal(r.body.reachable,false);
  server=http.createServer((req,res)=>{requests.push([req.method,req.url]);res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,modelLoaded:true,modelId:'mock'}))});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  process.env.CUTLOOPZ_LOCAL_GENERATOR_URL=`http://127.0.0.1:${server.address().port}/`;
  r=response();await health({},r);assert.equal(r.statusCode,200);assert.equal(r.body.modelLoaded,true);assert.equal(r.body.independentGenerationReady,false);assert.deepEqual(requests,[['GET','/health']]);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.CUTLOOPZ_LOCAL_GENERATOR_URL;else process.env.CUTLOOPZ_LOCAL_GENERATOR_URL=previous;await rm(dir,{recursive:true,force:true})}
});


test('local model readiness is admin protected and does not allow public GPU probing',async()=>{
 let gate; const router={use(fn){gate=fn},get(){},post(){}};
 const express={Router:()=>router};
 const multer=()=>({fields:()=>()=>{}});multer.memoryStorage=()=>({});
 const dir=await mkdtemp(path.join(tmpdir(),'cutloopz-admin-gate-'));
 try{
  createProductionRouter({express,multer,baseDir:dir,authorize:req=>req.authorized===true,origin:'http://127.0.0.1:9999',adminKey:'test'});
  let nextCalled=false;
  const unauthorized=response();await gate({method:'GET',path:'/local/status',authorized:false},unauthorized,()=>{nextCalled=true});
  assert.equal(unauthorized.statusCode,403);assert.equal(nextCalled,false);
  await gate({method:'GET',path:'/local/status',authorized:true},response(),()=>{nextCalled=true});
  assert.equal(nextCalled,true);
 }finally{await rm(dir,{recursive:true,force:true})}
});
