/** Offline tests for the authenticated, opt-in HTTPS transport. NO external requests or GPU charges. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createLocalGeneratorAdapter} from './cutloopz-local-generator-adapter.mjs';
const token='x'.repeat(64);
const endpoint='https://worker.cutloopz.example/';
const remoteHost='worker.cutloopz.example';
test('remote HTTPS is rejected without explicit host AND strong secret',()=>{
 const bad=[
  {endpoint},{endpoint,remoteHost},{endpoint,remoteToken:token},
  {endpoint,remoteHost:'evil.example',remoteToken:token},
  {endpoint,remoteHost,remoteToken:'short'},
  {endpoint:'http://worker.cutloopz.example/',remoteHost,remoteToken:token},
  {endpoint:'https://127.0.0.1/',remoteHost:'127.0.0.1',remoteToken:token},
  {endpoint:'https://worker.cutloopz.example:8443/',remoteHost,remoteToken:token},
  {endpoint:'https://worker.cutloopz.example/extra',remoteHost,remoteToken:token},
  {endpoint:'https://worker.cutloopz.example/?token=abc',remoteHost,remoteToken:token},
  {endpoint:'https://username:password@worker.cutloopz.example/',remoteHost,remoteToken:token},
  {endpoint:'https://localhost/',remoteHost:'localhost',remoteToken:token}
 ];
 for(const config of bad) assert.throws(()=>createLocalGeneratorAdapter(config),/Generator must use HTTP loopback or explicitly approved/);
});
test('approved HTTPS health is read-only, authenticated, and forbids redirects',async()=>{
 const calls=[];
 const a=createLocalGeneratorAdapter({endpoint,remoteHost,remoteToken:token,fetchImpl:async(url,opts)=>{
  calls.push({url:url.toString(),opts});
  return {ok:true,json:async()=>({ok:true,modelLoaded:false,modelId:'not-loaded'})};
 }});
 assert.deepEqual(await a.health(),{ok:true,modelLoaded:false,modelId:'not-loaded'});
 assert.equal(calls[0].url,endpoint+'health');
 assert.equal(calls[0].opts.method,undefined);
 assert.equal(calls[0].opts.redirect,'error');
 assert.equal(calls[0].opts.headers.get('Authorization'),`Bearer ${token}`);
});
test('secure HTTP fetch used for video download includes token but never invokes a GPU',async()=>{
 const uuid='123e4567-e89b-12d3-a456-426614174000';
 let urlCalled, optsCalled;
 const a=createLocalGeneratorAdapter({endpoint,remoteHost,remoteToken:token,fetchImpl:async(url,opts)=>{
  urlCalled=String(url);optsCalled=opts;
  return {ok:false,status:503,headers:new Headers()};
 }});
 await assert.rejects(a.download(uuid,'/tmp/unwritten-cutloopz.mp4'),/Local video HTTP 503/);
 assert.equal(urlCalled,endpoint+'jobs/'+uuid+'/video');
 assert.equal(optsCalled.headers.get('Authorization'),`Bearer ${token}`);
});
test('HTTP loopback mode works with or without a token',async()=>{
 for(const t of [undefined,token]){
  let options;
  const a=createLocalGeneratorAdapter({endpoint:'http://127.0.0.1:8765/',remoteToken:t,fetchImpl:async(_,opts)=>{
   options=opts;
   return {ok:true,json:async()=>({ok:true,modelLoaded:false})};
  }});
  await a.health();
  assert.equal(options.headers?.get('Authorization'),t?`Bearer ${t}`:undefined);
 }
});
