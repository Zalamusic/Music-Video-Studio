import {createProductionRouter} from './cutloopz-production-router.mjs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const routes=new Map();
const router={use(){},get(p,h){routes.set('GET '+p,h)},post(p,...hs){routes.set('POST '+p,hs.at(-1))}};
const express={Router:()=>router};
const multer=()=>({fields:()=> (_req,_res,next)=>next()});multer.memoryStorage=()=>({});
const dir=await mkdtemp(path.join(tmpdir(),'cutloopz-router-'));
const response=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}});
try{
 process.env.CUTLOOPZ_PROVIDER_PRICE_VERIFIED='true';
 process.env.CUTLOOPZ_VERIFIED_CLIP_PRICE_USD='0.5';
 createProductionRouter({express,multer,baseDir:dir,authorize:()=>true,origin:'http://127.0.0.1:9999',adminKey:'test',enabled:()=>true});
 const status=response();await routes.get('GET /status')({},status);assert.equal(status.body.enabled,true);
 const p=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=16','-f','mp3','-'],{encoding:null});assert.equal(p.status,0);
 const req={body:{durationSeconds:'15',maximumEstimatedUSD:'2',approvePaidGeneration:'yes'},files:{song:[{buffer:p.stdout,originalname:'song.mp3'}],photo:[{buffer:Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(1200)]),originalname:'photo.jpg'}]}};
 const created=response();await routes.get('POST /jobs')(req,created);assert.equal(created.statusCode,201,JSON.stringify(created.body));
 assert.equal(created.body.clips,3);
 const got=response();await routes.get('GET /jobs/:id')({params:{id:created.body.jobId}},got);assert.equal(got.body.job.clips.length,3);
 const noClipApproval=response();await routes.get('POST /jobs/:id/advance')({params:{id:created.body.jobId},body:{}},noClipApproval);assert.equal(noClipApproval.statusCode,400);assert.match(noClipApproval.body.error,/Explicit confirmation/);
 const stillCreated=response();await routes.get('GET /jobs/:id')({params:{id:created.body.jobId}},stillCreated);assert.equal(stillCreated.body.job.clips[0].status,'created');
 const noApproval=response();await routes.get('POST /jobs')({...req,body:{...req.body,approvePaidGeneration:'no'}},noApproval);assert.equal(noApproval.statusCode,400);
 const tooLong=response();await routes.get('POST /jobs')({...req,body:{...req.body,durationSeconds:'30'}},tooLong);assert.equal(tooLong.statusCode,400);
 console.log('PASS: real ffprobe audio preflight, admin job creation, persisted job retrieval, approval rejection, duration rejection, per-clip confirmation rejection (no external provider or Express dependency)');
}finally{await rm(dir,{recursive:true,force:true})}
