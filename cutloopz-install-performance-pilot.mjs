/**
 * CutLoopz - safe, idempotent installer for administrator Performance Pilot.
 * Use inside a working checkout of Zalamusic/Music-Video-Studio:
 *   node cutloopz-install-performance-pilot.mjs
 *
 * Requires these files already present:
 *   ./cutloopz-performance-pilot.js
 *   ./public/performance-pilot.html
 *
 * This installer edits exactly TWO locations in CURRENT server.js, regardless
 * of which newer version you have. It refuses unexpected source layouts.
 * It preserves the original code in .cutloopz-backups/. No deployment or
 * paid generation is triggered by this installer.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root=process.cwd();
const serverFile=path.join(root,'server.js');
const moduleFile=path.join(root,'cutloopz-performance-pilot.js');
const pageFile=path.join(root,'public','performance-pilot.html');
const IMP="import { createPerformancePilotRouter } from './cutloopz-performance-pilot.js';";
const ANCHOR="app.get('/api/gpu/status', (req, res) => {";
const BLOCK=`/*
 * Administrator-only audio-driven performance test, NOT customer lip-sync mode.
 * Both existing paid-generation flag and pilot flag must be enabled;
 * every paid request still requires explicit administrator approval.
 */
app.use('/api/performance-pilot', createPerformancePilotRouter({
  express, multer, fal, outDir: OUT,
  authorize: isVideoAdmin,
  enabled: () => process.env.CUTLOOPZ_PERFORMANCE_PILOT_ENABLED === 'true',
  paidEnabled: () => process.env.ENABLE_PAID_GENERATION === 'true'
}));

`;

async function install(){
  for(const f of [moduleFile,pageFile])await fs.access(f);
  const original=await fs.readFile(serverFile,'utf8');
  if(original.includes(IMP) && original.includes("app.use('/api/performance-pilot'")){
    console.log('Already installed; no changes.');return;
  }
  if(original.includes(IMP) || original.includes("app.use('/api/performance-pilot'"))
    throw new Error('Partial pilot integration detected; refusing unsafe second patch.');
  if(original.split(ANCHOR).length!==2)
    throw new Error('Could not safely locate the existing GPU status route.');
  const importAnchor="import { createCustomerOrderHistoryRouter } from './customer-order-history.js';";
  if(original.split(importAnchor).length!==2)
    throw new Error('Current server.js lacks the expected customer-order-history import. Stop instead of replacing it.');
  for(const required of ["import express from 'express'","import multer from 'multer'","import { fal } from '@fal-ai/client'",'const OUT =','function isVideoAdmin(req)']){
    if(!original.includes(required))throw new Error(`Required server feature missing: ${required}`);
  }
  const revised=original
    .replace(importAnchor,importAnchor+'\n'+IMP)
    .replace(ANCHOR,BLOCK+ANCHOR);
  const dir=path.join(root,'.cutloopz-backups');
  await fs.mkdir(dir,{recursive:true});
  const hash=createHash('sha256').update(original).digest('hex').slice(0,12);
  const back=path.join(dir,`server-before-performance-pilot-${hash}.js`);
  await fs.writeFile(back,original,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
  const tmp=serverFile+'.pilot-check.js';
  try{
    await fs.writeFile(tmp,revised);
    const check=spawnSync(process.execPath,['--check',tmp],{encoding:'utf8'});
    if(check.status!==0)throw new Error('Syntax check failed: '+check.stderr.slice(-1000));
    await fs.rename(tmp,serverFile);
    console.log('Installed safely into latest checked-out server.js.');
    console.log('Backup:',path.relative(root,back));
    console.log('Paid testing remains OFF unless both environment switches are set.');
  }catch(error){await fs.rm(tmp,{force:true});throw error;}
}
install().catch(e=>{console.error('NO CHANGES APPLIED:',e.message);process.exitCode=1;});
