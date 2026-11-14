import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
test('Authenticated artist can preview private profile, public discovery remains opt-in',async()=>{
 const routes=new Map();
 const code=read('customer-auth.js')
 .replace("import express from 'express';",'const routes=new Map();const express={Router:()=>({routes,use(fn){this.before=fn},get(k,v){routes.set(`GET ${k}`,v)},put(k,v){routes.set(`PUT ${k}`,v)},post(k,v){routes.set(`POST ${k}`,v)},delete(k,v){routes.set(`DELETE ${k}`,v)}})};')
 .replace("import nodemailer from 'nodemailer';",'const nodemailer={createTransport:()=>({sendMail:()=>{}})};');
 const {createCustomerAuthRouter}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const tmp=mkdtempSync(path.join(os.tmpdir(),'cutloopz-final-'));
 try{
  const router=createCustomerAuthRouter({storageDirectory:tmp});
  async function send(method,url,{cookie='',body={}}={}){
   const req={ip:'127.0.0.1',headers:{cookie},secure:false,body,params:{},get(name){return name==='host'?'localhost:19000':undefined}};
   const res={statusCode:200,headers:{},status(n){this.statusCode=n;return this},json(d){this.data=d;return this},cookie(name,value){this.cookieValue=name+'='+value},clearCookie(){},set(k,v){this.headers[k]=v;return this}};
   await router.before(req,res,()=>{});const handler=router.routes.get(`${method} ${url}`);assert.ok(handler,`${method} ${url}`);await handler(req,res);return res;
  }
  let res=await send('GET','/creator-preview');assert.equal(res.statusCode,401);
  res=await send('POST','/register',{body:{name:'Test Artist',email:'testartist@example.com',password:'StrongTestPassword123!'}});
  assert.equal(res.statusCode,201);const cookie=res.cookieValue;
  const avatar='data:image/jpeg;base64,'+'A'.repeat(400);
  const profile={artistName:'Test Artist',bio:'Music is life',genre:'R&B',platforms:['Suno'],artistPageUrl:'',socialLinks:[],videoLinks:[],visibility:'private',avatar};
  res=await send('PUT','/creator-profile',{cookie,body:{profile}});assert.equal(res.statusCode,200,JSON.stringify(res.data));
  res=await send('GET','/creator-preview',{cookie});assert.equal(res.statusCode,200);assert.equal(res.data.creator.visibility,'private');assert.equal(res.data.creator.avatar,avatar);
  assert.equal(res.headers['Cache-Control'],'private, no-store');
  res=await send('GET','/creators');assert.equal(res.data.creators.length,0);
  res=await send('PUT','/creator-profile',{cookie,body:{profile:{...profile,visibility:'public'}}});assert.equal(res.statusCode,200);
  res=await send('GET','/creators');assert.equal(res.data.creators.length,1);assert.equal(res.data.creators[0].avatar,avatar);
  res=await send('PUT','/creator-profile',{cookie,body:{profile:{...profile,avatar:'data:image/svg+xml;base64,AAAA'}}});assert.equal(res.statusCode,400);
 }finally{rmSync(tmp,{recursive:true,force:true})}
});
test('Rewards, password recovery and private-profile links point to intended destinations',()=>{
 assert.match(read('public/account.html'),/href="\/hit-maker-rewards\.html"/);
 assert.match(read('public/creator-profile.html'),/id="viewMyProfile"[^>]+href="\/account\.html"/);
 assert.match(read('public/artist.js'),/\/api\/customer-auth\/creator-preview/);
 assert.match(read('public/hit-maker-rewards.js'),/\/api\/customer-order-history/);
 assert.match(read('public/hit-maker-rewards.js'),/qualifyingVideos/);
 assert.match(read('public/hit-maker-rewards.js'),/platinumUnlocked/);
 assert.match(read('public/hit-maker-rewards.js'),/discountActive/);
 assert.match(read('public/forgot-password.js'),/\/api\/customer-auth\/forgot-password/);
 assert.match(read('public/account.html'),/window\.location\.href = '\/forgot-password\.html'/);
 assert.match(read('customer-auth.js'),/process\.env\.RENDER_EXTERNAL_URL/);
 assert.doesNotMatch(read('customer-auth.js'),/https:\/\/zala-music-video-studio\.onrender\.com/);
});
test('Review links stay visible and separate on both customer and account pages',()=>{
 for(const file of ['public/customer.html','public/account.html']){
  assert.match(read(file),/class="cutloopz-review-footer"/);
  assert.match(read(file),/class="cutloopz-review-link"/);
  assert.match(read(file),/href="\/cutloopz-reviews\.html"/);
 }
});
