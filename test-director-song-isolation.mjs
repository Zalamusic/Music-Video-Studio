import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createStoryIntelligencePlan} from './cutloopz-story-intelligence.js';

// Real story engine checks, rather than only checking literal source text.
test('A breakup song cannot inherit a reassuring opening or safety resolution',()=>{
 const plan=createStoryIntelligencePlan({title:'No More',lyrics:"Don't tell me to stay\nYour promises were fake\nI'm leaving today\nNever again",prompt:'angry breakup',songSeconds:30});
 assert.equal(plan.storyEmotion,'heartbreak');
 assert.ok(plan.scenes.every(scene=>scene.emotion!=='reassurance'));
 assert.ok(plan.scenes.every(scene=>!/emotional safety|renewed trust/i.test(scene.action)));
});
test('A baddie performance is treated as confidence, not a generic romance or safety story',()=>{
 const plan=createStoryIntelligencePlan({title:'Baddie',lyrics:'I am a baddie\nI run the show\nI call my own shots',songSeconds:30});
 assert.equal(plan.storyEmotion,'confidence');
 assert.ok(plan.scenes.every(scene=>scene.emotion==='confidence'));
 assert.ok(plan.scenes.every(scene=>!/romantic chemistry|reassuring gaze|emotional safety/i.test(scene.action)));
});

function fakeElement(name=''){
 const events=new Map();
 return {
  name,events,value:'',textContent:'',hidden:false,disabled:false,style:{},dataset:{},
  files:[],options:[{value:'Cinematic Realism'}],className:'',classList:{toggle(){},remove(){},add(){}},
  addEventListener(type,handler){events.set(type,handler)},
  trigger(type){return events.get(type)?.({target:this})},
  setAttribute(){},removeAttribute(){},appendChild(child){return child},append(){},
  replaceChildren(){},scrollIntoView(){},focus(){},get tagName(){return 'INPUT'},
 };
}
async function loadStudio(savedDraft){
 const elements=new Map();
 const id=name=>{if(!elements.has(name))elements.set(name,fakeElement(name));return elements.get(name)};
 id('duration').value='30';id('sceneSeconds').value='15';id('format').value='vertical';
 id('visualStyle').value='Cinematic Realism';
 id('customTimeField').hidden=true;
 id('artistPhoto').files=[];id('songAudio').files=[];
 id('backToTop').hidden=true;
 const stored=new Map();
 if(savedDraft)stored.set('cutloopz:artist-studio:v1:guest',JSON.stringify({at:100,draft:savedDraft}));
 const document={getElementById:id,querySelectorAll:()=>Array.from({length:5},(_,i)=>({dataset:{step:String(i)},hidden:false})),
  querySelector:()=>fakeElement('heading'),createElement:(name)=>fakeElement(name)};
 const window={
  matchMedia:()=>({matches:false}),addEventListener(){},scrollY:0,scrollTo(){},confirm:()=>true,
  CutLoopzSongLink:{inspect:()=>({ok:false}),navigation:(page,action)=>action==='next'?page+1:page-1},
  CutLoopzWelcome:{consume(){}},
 };
 const localStorage={getItem:key=>stored.get(key)||null,setItem:(key,v)=>stored.set(key,v),removeItem:key=>stored.delete(key)};
 const fetch=async(url,options)=>{
  if(url==='/api/customer-auth/me')return {ok:false};
  if(url==='/api/creative-preview/storyboard'){
    const payload=JSON.parse(options.body);
    return {ok:true,json:async()=>({ok:true,plan:createStoryIntelligencePlan(payload)})};
  }
  throw Error('Unexpected fetch '+url);
 };
 const context={document,window,location:{search:''},URLSearchParams,localStorage,fetch,
  setTimeout:()=>1,clearTimeout(){},console,Blob,File:class{},
  URL:{createObjectURL:()=>'',revokeObjectURL(){}},
  alert(){},FormData:class{append(){}},Math,Date};
 const source=await readFile(new URL('./public/my-studio.js',import.meta.url),'utf8');
 vm.runInNewContext(source,context);
 // initialize() fetches the guest state, then tries IndexedDB (not available).
 for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
 return {id,stored};
}
test('Legacy saved drafts cannot restore another song’s music analysis or storyboard',async()=>{
 const {id}=await loadStudio({
  title:'New Track',lyrics:'This is a completely different song',songSeconds:30,sceneSeconds:15,
  style:'Cinematic Realism',format:'vertical',page:3,
  songName:'safe-with-me.mp3',musicResult:{summary:{bpmEstimate:68},plan:{scenes:[{intensity:'low'}]}},
  scenes:[{number:1,startSeconds:0,endSeconds:15,emotion:'reassurance',location:'quiet apartment',action:'Comfort me',prompt:'Safe With Me'}]
 });
 assert.equal(id('analysisResult').hidden,true,'old analysis hidden');
 assert.equal(id('storyEmpty').hidden,false,'placeholder displayed when no scenes');
});
test('Changing the song after generating a storyboard clears the old story',async()=>{
 const {id}=await loadStudio();
 id('title').value='Safe With Me';id('lyrics').value='Stay by my side and keep me safe';
 await id('directorBtn').trigger('click');
 assert.match(id('storyEmotion').textContent,/reassurance/);
 id('title').value='Baddie';id('title').trigger('input');
 assert.equal(id('storyEmotion').textContent,'');
 assert.match(id('directorStatus').textContent,/Previous storyboard cleared/);
 id('lyrics').value='I am a baddie, I call my own shots';id('lyrics').trigger('input');
 await id('directorBtn').trigger('click');
 assert.match(id('storyEmotion').textContent,/confidence/);
 assert.doesNotMatch(id('storyEmotion').textContent,/reassurance/);
});
test('Server persists draft provenance keys for account sessions',async()=>{
 const auth=await readFile(new URL('./customer-auth.js',import.meta.url),'utf8');
 assert.match(auth,/'analysisSourceKey','storyboardSourceKey'/);
});
