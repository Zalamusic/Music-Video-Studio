import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {verifyProductionStorage} from './cutloopz-storage-preflight.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-disk-'));
try{
 const result=await verifyProductionStorage({outputDir:dir});
 assert.equal(result.ok,true);
 await assert.rejects(()=>verifyProductionStorage({outputDir:'relative'}),/absolute/);
 console.log('PASS: write/read/delete storage preflight; rejects relative paths');
}finally{await rm(dir,{recursive:true,force:true})}
