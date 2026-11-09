import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createLocalGeneratorAdapter} from './cutloopz-local-generator-adapter.mjs';
test('refuses public and cloud endpoints',()=>{for(const endpoint of ['https://example.com/','http://192.168.1.10/','http://localhost.evil.com/','http://localhost:3000/other','http://user:pass@localhost/'])assert.throws(()=>createLocalGeneratorAdapter({endpoint}))});
test('local health handshake is read-only',async()=>{let called;const adapter=createLocalGeneratorAdapter({endpoint:'http://127.0.0.1:7777/',fetchImpl:async(url,options)=>{called={url:String(url),options};return {ok:true,json:async()=>({ok:true,modelLoaded:true,modelId:'test'})}}});assert.deepEqual(await adapter.health(),{ok:true,modelLoaded:true,modelId:'test'});assert.equal(called.url,'http://127.0.0.1:7777/health');assert.equal(called.options.method,undefined)});
test('submission requires authorization before reading files',async()=>{const a=createLocalGeneratorAdapter({endpoint:'http://localhost:7777/'});await assert.rejects(a.submit({allowPaidTest:'no'}),/authorization/)});
test('rejects malformed job identifiers before network',async()=>{const a=createLocalGeneratorAdapter({endpoint:'http://localhost:7777/'});await assert.rejects(a.status('../evil'),/Invalid job ID/)});
