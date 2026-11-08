import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createPilotHttpAdapter} from './cutloopz-pilot-http-adapter.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'cutloopz-http-'));
try{
 const song=path.join(dir,'song.mp3'),photo=path.join(dir,'photo.png');await writeFile(song,'fake audio');await writeFile(photo,Buffer.from([137,80,78,71,13,10,26,10,0]));
 const id='11111111-1111-4111-8111-111111111111';let requests=[];
 const adapter=createPilotHttpAdapter({origin:'https://example.org',adminKey:'test-key',fetchImpl:async(u,opts)=>{
  requests.push({url:String(u),method:opts.method||'GET',headers:opts.headers,form:opts.body});
  if(String(u).endsWith('/video'))return new Response(Buffer.alloc(1024),{status:200});
  return Response.json({ok:true,id,status:opts.method==='POST'?'queued':'ready'});
 }});
 const submission=await adapter.submit({songPath:song,photoPath:photo,startSeconds:0,allowPaidTest:'yes'});
 assert.equal(submission.id,id);assert.equal(requests[0].form.get('allowPaidTest'),'yes');assert.equal(requests[0].form.get('startSeconds'),'0');
 assert.equal(requests[0].headers['X-Video-Admin-Key'],'test-key');
 assert.equal((await adapter.status(id)).status,'ready');
 assert.equal(await adapter.download(id,path.join(dir,'result.mp4')),path.join(dir,'result.mp4'));
 assert.equal(requests.length,3);
 await assert.rejects(adapter.submit({songPath:song,photoPath:photo,startSeconds:0,allowPaidTest:'no'}));
 console.log('PASS: multipart paid submission, admin authentication, status polling, clip download, and approval guard (mock HTTP only)');
}finally{await rm(dir,{recursive:true,force:true})}
