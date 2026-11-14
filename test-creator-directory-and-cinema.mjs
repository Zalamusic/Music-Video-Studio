import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=new URL('.',import.meta.url);
const read=filename=>readFileSync(new URL(filename,root),'utf8');

test('Creator Directory remains metadata-only, account-owned, and opt-in public',async()=>{
 const code=read('customer-auth.js')
  .replace("import express from 'express';",'const routes=new Map();const express={Router:()=>({routes,use(fn){this.before=fn},get(k,v){routes.set(`GET ${k}`,v)},put(k,v){routes.set(`PUT ${k}`,v)},post(k,v){routes.set(`POST ${k}`,v)},delete(k,v){routes.set(`DELETE ${k}`,v)}})};')
  .replace("import nodemailer from 'nodemailer';",'const nodemailer={createTransport:()=>({sendMail:()=>{}})};')
  +'\nexport {express};';
 const encoded='data:text/javascript;base64,'+Buffer.from(code).toString('base64');
 const {createCustomerAuthRouter}=await import(encoded);
 const tmp=mkdtempSync(path.join(os.tmpdir(),'cutloopz-creator-test-'));
 try{
  const router=createCustomerAuthRouter({storageDirectory:tmp});
  const respond=async(method,url,{cookie='',body={}}={})=>{
   const req={ip:'127.0.0.1',headers:{cookie},secure:false,body,params:{},get(h){return h==='host'?'localhost:19000':undefined}};
   const res={statusCode:200,headers:{},status(n){this.statusCode=n;return this},json(x){this.data=x;return this},cookie(name,value){this.cookieValue=name+'='+value},clearCookie(){},set(){return this}};
   await router.before(req,res,()=>{});
   const handler=router.routes.get(`${method} ${url}`);assert.ok(handler,`${method} ${url}`);
   await handler(req,res);return res;
  };
  const register=await respond('POST','/register',{body:{name:'Zala',email:'test@example.com',password:'AnExcellentPassword123!'}});
  assert.equal(register.statusCode,201);const cookie=register.cookieValue;
  let directory=await respond('GET','/creators');assert.deepEqual(directory.data.creators,[]);
  const profile={artistName:'Zala QI',genre:'R&B',bio:'Independent artist',platforms:['Suno','YouTube'],visibility:'private',artistPageUrl:'https://example.com/artist',videoLinks:['https://www.youtube.com/watch?v=123'],socialLinks:[]};
  let saved=await respond('PUT','/creator-profile',{cookie,body:{profile}});
  assert.equal(saved.statusCode,200,JSON.stringify(saved.data));
  directory=await respond('GET','/creators');assert.equal(directory.data.creators.length,0,'Private artist must not be listed');
  saved=await respond('PUT','/creator-profile',{cookie,body:{profile:{...profile,visibility:'public'}}});assert.equal(saved.statusCode,200);
  directory=await respond('GET','/creators');assert.equal(directory.data.creators.length,1);
  assert.equal(directory.data.creators[0].artistName,'Zala QI');assert.ok(directory.data.creators[0].videoLinks[0].startsWith('https://'));
  assert.equal(Object.hasOwn(directory.data.creators[0],'email'),false);
  assert.equal(Object.hasOwn(directory.data.creators[0],'passwordHash'),false);
  assert.equal(Object.hasOwn(directory.data.creators[0],'draft'),false);
  for(const unsafe of ['javascript:alert(1)','file:///etc/passwd','http://example.com','https://127.0.0.1/a','https://user:pass@videos.example/']){
   const bad=await respond('PUT','/creator-profile',{cookie,body:{profile:{...profile,visibility:'public',videoLinks:[unsafe]}}});
   assert.equal(bad.statusCode,400,unsafe);
  }
  saved=await respond('PUT','/creator-profile',{cookie,body:{profile:{...profile,visibility:'hidden'}}});assert.equal(saved.statusCode,200);
  directory=await respond('GET','/creators');assert.equal(directory.data.creators.length,0,'Hidden artist must disappear');
  const own=await respond('GET','/creator-profile',{cookie});assert.equal(own.data.profile.visibility,'hidden');
  const outsider=await respond('GET','/creator-profile');assert.equal(outsider.statusCode,401);
 } finally{rmSync(tmp,{recursive:true,force:true});}
});
test('Cinema review uses secure owner endpoint or expiring token, and does not create public hosted media',()=>{
 const html=read('public/cinema.html'),client=read('public/cutloopz-cinema.js'),server=read('server.js');
 assert.match(html,/id="reviewVideo"/);assert.match(html,/id="shareCinemaVideo"/);
 assert.match(client,/\/api\/cutloopz-production\/local\/jobs\//);
 assert.match(client,/\/stream\//);assert.match(client,/\/download\//);
 assert.match(server,/app\.get\('\/stream\/:token'/);
 assert.match(server,/Date\.now\(\)>=Date\.parse\(record\.expiresAt\)/);
 assert.match(server,/res\.type\('mp4'\);return res\.sendFile\(video\)/);
 assert.match(html,/preferred platform/);
});
test('Page-aware helper and compact homepage links preserve page behavior',()=>{
 const home=read('public/customer.html'),studio=read('public/my-studio.html'),helper=read('public/cutloopz-studio-helper.js'),design=read('public/cutloopz-design-upgrades.css');
 assert.match(home,/href="\/creator-directory\.html"/);assert.match(home,/src="\/cutloopz-studio-helper\.js"/);
 assert.match(studio,/id="reviewInCinema"/);assert.match(studio,/src="\/cutloopz-studio-helper\.js"/);
 assert.match(helper,/dataset\.step/);assert.match(helper,/Save & Download/);assert.doesNotMatch(helper,/fetch\(|\/api\/paypal/);
 assert.match(design,/grid-template-columns:repeat\(5/);assert.match(design,/border-radius:7px/);
 assert.match(studio,/cutloopz-project-backup\.js/);assert.match(studio,/cutloopz-lyrics-board\.js/);
});
test('Private owner-only Cinema sharing creates an expiring token without copying video bytes',async()=>{
 const {runInNewContext}=await import('node:vm');
 const {promises:fs}=await import('node:fs');
 const {randomUUID}=await import('node:crypto');
 const server=read('server.js');
 const begin=server.indexOf('// Create a short-lived, bearer-token Cinema review');
 const finish=server.indexOf("app.get('/api/gpu/status'",begin);
 assert.ok(begin>0 && finish>begin);
 let handler;
 const app={post(name,fn){assert.equal(name,'/api/cutloopz-production/local/jobs/:id/share');handler=fn;}};
 const tmp=mkdtempSync(path.join(os.tmpdir(),'cutloopz-cinema-link-'));
 const OUT=tmp,LINKS=path.join(tmp,'links'),id=randomUUID();
 const folder=path.join(tmp,'cutloopz-production','local',id),video=path.join(folder,'final.mp4');
 try{
  await fs.mkdir(folder,{recursive:true});await fs.mkdir(LINKS,{recursive:true});
  await fs.writeFile(video,Buffer.alloc(2048));
  await fs.writeFile(path.join(folder,'assembly.json'),JSON.stringify({jobId:id,outputPath:video}));
  let allowed=false;
  runInNewContext(server.slice(begin,finish),{app,OUT,LINKS,path,fs,randomUUID,isOwnerOrAdmin:async()=>allowed,validId:x=>/^[a-f0-9-]{36}$/i.test(x),Date,URL});
  const invoke=async(idValue)=>{
   const req={params:{id:idValue},get:x=>x==='host'?'example.com':undefined};
   const res={statusCode:200,status(x){this.statusCode=x;return this},set(){return this},json(x){this.data=x;return this}};
   await handler(req,res);return res;
  };
  let response=await invoke(id);assert.equal(response.statusCode,403);
  allowed=true;response=await invoke('not-an-id');assert.equal(response.statusCode,400);
  response=await invoke(id);assert.equal(response.statusCode,200,JSON.stringify(response.data));
  const createdToken=response.data.url.split('/').at(-1),record=JSON.parse(await fs.readFile(path.join(LINKS,createdToken+'.json'),'utf8'));
  assert.equal(record.id,id);assert.equal(record.kind,'local');
  assert.ok(Date.parse(record.expiresAt)>Date.now()+6.5*86400000);
  assert.equal((await fs.readFile(video)).length,2048);
  // No new MP4 created in LINKS; only one tiny metadata file.
  assert.deepEqual(await fs.readdir(LINKS),[createdToken+'.json']);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
