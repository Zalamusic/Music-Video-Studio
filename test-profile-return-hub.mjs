import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
function runFloating(path){
  const links=[];
  const make=(tag)=>({tag,id:'',style:{},attributes:{},title:'',innerHTML:'',setAttribute(k,v){this.attributes[k]=v}});
  const document={readyState:'complete',head:{appendChild(){}},body:{appendChild(el){links.push(el)}},getElementById:()=>null,createElement:make};
  const window={location:{pathname:path}};
  runInNewContext(read('./public/cutloopz-floating-home.js'),{document,window});
  return links;
}
test('small floating My Profile link returns to one private hub on customer pages',()=>{
  for(const path of ['/my-studio.html','/creator-profile.html','/hit-maker-rewards.html','/cinema.html','/cutloopz-reviews.html','/customer.html']){
    const links=runFloating(path);
    assert.equal(links.length,2,`two navigation shortcuts on ${path}`);
    assert.equal(links[0].id,'cutloopzFloatingHome');
    assert.equal(links[1].id,'cutloopzProfileReturn');
    assert.equal(links[1].href,'/account.html');
    assert.equal(links[1].textContent,'My Profile');
  }
});
test('My Profile itself has no redundant return-to-self shortcut',()=>{
  const links=runFloating('/account.html');
  assert.equal(links.length,1);
  assert.equal(links[0].id,'cutloopzFloatingHome');
});
test('one signed-in profile with editing and four distinct creative destinations',()=>{
  const html=read('./public/account.html');
  assert.match(html,/<h1 id="profileHeading">My Profile<\/h1>/);
  assert.match(html,/id="artistEditLink">Edit Profile<\/a>/);
  const hub=html.match(/<section class="account-hub"[\s\S]*?<\/section>/)?.[0];
  assert.ok(hub);
  const labels=[...hub.matchAll(/<strong>(.*?)<\/strong>/g)].map(m=>m[1]);
  assert.deepEqual(labels,['Create Video','My Videos','My Hit Maker Rewards','Browse Other Creators']);
  assert.doesNotMatch(hub,/<strong>My Artist Profile<\/strong>/);
  assert.match(read('./public/customer.html'),/Create Video<\/a><a href="\/account\.html">My Profile<\/a><a [^>]*>Music Evaluator/);
});
test('Studio Helper and Review navigation return artists to the hub',()=>{
 const helper=read('./public/cutloopz-studio-helper.js');
 assert.match(helper,/button\('My Profile',\(\)=>\{location\.href='\/account\.html';\}\)/);
 const reviews=read('./public/cutloopz-reviews.html');
 assert.match(reviews,/<a href="\/account.html">My Profile<\/a>/);
});
