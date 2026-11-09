import {createProductionRouter} from './cutloopz-production-router.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const originalVerified=process.env.CUTLOOPZ_PROVIDER_PRICE_VERIFIED;
const originalPrice=process.env.CUTLOOPZ_VERIFIED_CLIP_PRICE_USD;
const dir=await mkdtemp(path.join(tmpdir(),'cutloopz-price-lock-'));
try {
 delete process.env.CUTLOOPZ_PROVIDER_PRICE_VERIFIED;
 delete process.env.CUTLOOPZ_VERIFIED_CLIP_PRICE_USD;
 const routes=new Map();
 const router={use(){},get(p,h){routes.set('GET '+p,h)},post(p,...h){routes.set('POST '+p,h.at(-1))}};
 const express={Router:()=>router};
 const multer=()=>({fields:()=>()=>{}});multer.memoryStorage=()=>({});
 createProductionRouter({express,multer,baseDir:dir,authorize:()=>true,origin:'http://localhost:9999',adminKey:'test',enabled:()=>true});
 const res=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(x){this.body=x;return this}});
 const status=res();await routes.get('GET /status')({},status);
 assert.equal(status.body.paidGenerationLocked,true);
 const create=res();await routes.get('POST /jobs')({body:{},files:{}},create);
 assert.equal(create.statusCode,503);
 const advance=res();await routes.get('POST /jobs/:id/advance')({params:{id:'fake'},body:{confirmPaidClip:'yes'}},advance);
 assert.equal(advance.statusCode,503);
 console.log('PASS: unknown provider pricing blocks creation and paid clip advancement');
} finally {
 if(originalVerified===undefined)delete process.env.CUTLOOPZ_PROVIDER_PRICE_VERIFIED;else process.env.CUTLOOPZ_PROVIDER_PRICE_VERIFIED=originalVerified;
 if(originalPrice===undefined)delete process.env.CUTLOOPZ_VERIFIED_CLIP_PRICE_USD;else process.env.CUTLOOPZ_VERIFIED_CLIP_PRICE_USD=originalPrice;
 await rm(dir,{recursive:true,force:true});
}
