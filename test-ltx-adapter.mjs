import assert from 'node:assert/strict';
import {createLtxAdapter,LTX_MODEL} from './cutloopz-ltx-adapter.mjs';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=await fs.mkdtemp(path.join(tmpdir(),'ltx-test-'));process.env.FAL_KEY='mock';let sent;
try{const photo=path.join(dir,'ref.png');await fs.writeFile(photo,'mock');const a=createLtxAdapter({fal:{storage:{upload:async()=> 'https://example.com/input'},queue:{submit:async(model,{input})=>{sent={model,input};return {request_id:'mock-id'}},status:async()=>({status:'COMPLETED'})}},run:async(_,args)=>fs.writeFile(args.at(-1),'mock audio')});await assert.rejects(a.submit({allowPaidTest:'no'}));await assert.rejects(a.submit({allowPaidTest:'yes',startSeconds:0,durationSeconds:11}));assert.equal((await a.submit({allowPaidTest:'yes',songPath:'song.wav',photoPath:photo,startSeconds:5,creativePrompt:'Continue walking'})).id,'mock-id');assert.equal(sent.model,LTX_MODEL);assert.equal(sent.input.prompt,'Continue walking');assert.equal((await a.status('mock-id')).status,'ready');console.log('LTX mock contract PASS');}finally{await fs.rm(dir,{recursive:true,force:true});}
