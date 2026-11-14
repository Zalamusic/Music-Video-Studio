import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createCutLoopzReviewsRouter} from './cutloopz-reviews-router.mjs';
function routerFor(dir){
  const actions=new Map();let currentUser=null,owner=false;
  const router=createCutLoopzReviewsRouter({
    express:{Router:()=>({post:(p,f)=>actions.set('POST '+p,f),get:(p,f)=>actions.set('GET '+p,f),delete:(p,f)=>actions.set('DELETE '+p,f)})},
    outputDirectory:dir, authenticatedUser:async()=>currentUser, isOwner:async()=>owner
  });
  assert.ok(router);
  async function call(method,route,body,origin='https://cutloopz-preview.onrender.com'){
    let response={status:200};
    const req={body,params:{id:route.startsWith('/admin/')?route.slice(7):undefined},get:(name)=>name==='origin'?origin:name==='host'?'cutloopz-preview.onrender.com':null};
    const res={set:()=>res,status:(code)=>{response.status=code;return res},json:(data)=>{response.data=data;return res}};
    const handler=actions.get(method+' '+(route.startsWith('/admin/')?'/admin/:id':route));
    assert.ok(handler,method+' '+route);
    await handler(req,res);return response;
  }
  return {call,setUser:(x)=>currentUser=x,setOwner:(x)=>owner=x};
}
test('CutLoopz reviews: sign-in, validation, origin, privacy, and owner-only management',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'cutloopz-review-test-'));
  try{
    const {call,setUser,setOwner}=routerFor(temp);
    assert.equal((await call('POST','/',{rating:5,message:'Beautiful private experience'})).status,401);
    setUser({id:'artist-1',name:'Test Artist'});
    assert.equal((await call('POST','/',{rating:7,message:'Beautiful private experience'})).status,400);
    assert.equal((await call('POST','/',{rating:5,message:'Beautiful private experience'},'https://not-our-site.example')).status,403);
    let saved=await call('POST','/',{rating:5,message:'Beautiful private experience'});
    assert.equal(saved.status,201);
    assert.equal((await call('POST','/',{rating:4,message:'Another feedback message'})).status,429);
    assert.equal((await call('GET','/admin')).status,403);
    setOwner(true);
    const results=await call('GET','/admin');assert.equal(results.status,200);assert.equal(results.data.summary.count,1);assert.equal(results.data.summary.averageRating,5);
    assert.equal(results.data.reviews[0].message,'Beautiful private experience');
    assert.equal((await call('DELETE','/admin/'+results.data.reviews[0].id)).status,200);
    assert.equal((await call('GET','/admin')).data.summary.count,0);
  }finally{await rm(temp,{recursive:true,force:true})}
});
