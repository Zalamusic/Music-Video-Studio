import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const ui=read('./public/admin-unified-production.html');
const server=read('./server.js');
const router=read('./cutloopz-production-router.mjs');
const adapter=read('./cutloopz-pilot-http-adapter.mjs');
const pilot=read('./cutloopz-performance-pilot.js');
const checks=[
 ['production API mounted',server.includes("app.use('/api/cutloopz-production'")],
 ['admin authentication on all production routes',router.includes('router.use((req,res,next)=>authorize(req)')],
 ['server paid flag gate',server.includes("process.env.ENABLE_PAID_GENERATION === 'true'")],
 ['server full production flag gate',server.includes("process.env.CUTLOOPZ_FULL_PRODUCTION_ENABLED === 'true'")],
 ['UI uploads song and photo',ui.includes("b.append('song'")&&ui.includes("b.append('photo'")],
 ['UI explicit paid confirmation',ui.includes("confirmPaidClip:'yes'")&&ui.includes("confirm('This action may submit")],
 ['API requires per clip confirmation',router.includes("req.body?.confirmPaidClip!=='yes'")],
 ['adapter sends pilot paid confirmation',adapter.includes("form.set('allowPaidTest','yes')")],
 ['pilot requires paid confirmation',pilot.includes("req.body?.allowPaidTest==='yes'")],
 ['adapter/pilot startSeconds contract',adapter.includes("form.set('startSeconds'")&&pilot.includes('req.body?.startSeconds')],
 ['adapter/pilot upload field contract',adapter.includes("form.set('song'")&&adapter.includes("form.set('photo'")&&pilot.includes("req.files?.song")&&pilot.includes("req.files?.photo")],
 ['video protected by administrator route',router.includes("router.get('/jobs/:id/video'")],
 ['storage preflight gate',server.includes('fullProductionStorageReady')],
 ['admin Studio reads local readiness correctly',ui.includes('setReady(h.readyToSubmit===true)')],
 ['local model status gated by administrator',!router.includes("if(req.method==='GET' && req.path==='/local/status')return next()")],
];
for(const [name,pass] of checks){assert.ok(pass,`FAILED: ${name}`);console.log('PASS',name)}
console.log(`${checks.length} static release contracts passed; NOT a live server test`);
