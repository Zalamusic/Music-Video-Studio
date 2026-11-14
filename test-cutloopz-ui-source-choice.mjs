import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(dirname,'public');
class FakeClassList{
 constructor(el){this.el=el;this.tags=new Set()}
 add(...names){for(const n of names)this.tags.add(n)}
 remove(...names){for(const n of names)this.tags.delete(n)}
 contains(n){return this.tags.has(n)}
 toggle(n,force){const on=force??!this.tags.has(n);on?this.tags.add(n):this.tags.delete(n);return on}
}
class FakeElement{
 constructor(tagName='DIV'){this.tagName=tagName;this.events={};this.value='';this.textContent='';this.dataset={};this.style={};this.hidden=false;this.disabled=false;this.files=[];this.options=[{value:''}];this.attributes={};this.classList=new FakeClassList(this);this.children=[];this.scrollTop=0;this.parentNode=null}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn)}
 dispatch(type,extra={}){for(const fn of this.events[type]??[])fn({preventDefault(){},...extra})}
 click(){this.dispatch('click')}
 setAttribute(name,value){this.attributes[name]=value}
 removeAttribute(name){delete this.attributes[name]}
 getAttribute(name){return this.attributes[name]}
 appendChild(child){this.children.push(child);return child}
 replaceChildren(...children){this.children=children}
 scrollIntoView(){}
 focus(){}
}
const idRegex=/<(input|select|textarea|button|div|section|span|p|a|img)[^>]*\bid="([^"]+)"/g;
function boot(){
 const html=fs.readFileSync(path.join(root,'my-studio.html'),'utf8');
 const code=fs.readFileSync(path.join(root,'my-studio.js'),'utf8');
 const els={};for(const m of html.matchAll(idRegex))els[m[2]]=new FakeElement(m[1].toUpperCase());
 const keys=['title','songLink','songAudio','lyrics','artistPhoto','direction','characterNotes','duration','sceneSeconds','format','visualStyle','customTime'];
 for(const id of keys)assert.ok(els[id],`Missing ${id}`);
 Object.assign(els.duration,{value:'30',options:[{value:'15'}]});
 Object.assign(els.sceneSeconds,{value:'15',options:[{value:'10'}]});
 Object.assign(els.format,{value:'vertical',options:[{value:'vertical'}]});
 Object.assign(els.visualStyle,{value:'Cinematic Realism',options:[{value:'Cinematic Realism'}]});
 const sections=Array.from({length:5},(_,i)=>Object.assign(new FakeElement('SECTION'),{dataset:{step:String(i)}}));
 const items=new Map();let confirmDecision=true;
 const document={getElementById:id=>els[id]||null,
   querySelectorAll:selector=>selector==='.wizard-step'?sections:[],
   querySelector:()=>new FakeElement('H3'),
   createElement:tag=>new FakeElement(tag.toUpperCase())};
 const localStorage={getItem:k=>items.get(k)||null,setItem:(k,v)=>items.set(k,v),removeItem:k=>items.delete(k)};
 const window={addEventListener(){},matchMedia:()=>({matches:true}),confirm:()=>confirmDecision,scrollY:0,scrollTo(){},CutLoopzWelcome:{consume(){}},CutLoopzSongLink:{
   inspect(value){try{if(!value)return {ok:false,error:'Missing URL'};const u=new URL(value);return {ok:/suno\.com|spotify\.com/.test(u.hostname),name:'SUNO',url:u.toString(),error:'Invalid'};}catch{return {ok:false,error:'Invalid URL'}}},
   navigation(page,action,{hasAudio,linkAccepted}){if(action==='next'){if(page===0&&linkAccepted&&!hasAudio)return 2;return Math.min(4,page+1)}if(action==='back'){if(page===2&&linkAccepted&&!hasAudio)return 0;return Math.max(0,page-1)}return page}
 }};
 const fetch=async url=>({ok:false,status:401,async json(){return {ok:false}}});
 const sandbox={document,window,localStorage,fetch,URL,URLSearchParams,Blob,File,FormData,setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(),location:{search:''},alert(){},console};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);
 return {els,sections,localStorage,changeConfirm:v=>confirmDecision=v};
}
const flush=()=>new Promise(r=>setTimeout(r,10));
test('Changing song source clears inactive source and protects existing input without deleting lyrics',async()=>{
 const {els,changeConfirm}=boot();await flush();
 assert.equal(els.audioSourcePanel.hidden,false);
 assert.equal(els.songLinkPanel.hidden,true);
 els.lyrics.value='I am a baddie\nSecond verse';
 els.sourceLinkBtn.click();
 assert.equal(els.audioSourcePanel.hidden,true);
 assert.equal(els.songLinkPanel.hidden,false);
 els.songLink.value='https://suno.com/song/xyz';els.songLink.dispatch('input');
 changeConfirm(false);els.sourceUploadBtn.click();
 assert.equal(els.songLinkPanel.hidden,false,'Canceled switch preserves current link');
 assert.equal(els.songLink.value,'https://suno.com/song/xyz');
 changeConfirm(true);els.sourceUploadBtn.click();
 assert.equal(els.audioSourcePanel.hidden,false);
 assert.equal(els.songLinkPanel.hidden,true);
 assert.equal(els.songLink.value,'');
 assert.equal(els.lyrics.value,'I am a baddie\nSecond verse');
 assert.equal(els.sourceUploadBtn.getAttribute('aria-pressed'),'true');
});
test('Upload clears link and action pulse stops on touch',async()=>{
 const {els}=boot();await flush();
 assert.equal(els.analyzeBtn.classList.contains('action-needs-attention'),true);
 assert.equal(els.directorBtn.classList.contains('action-needs-attention'),true);
 const fake=new File(['ID3','audio'],'song.mp3',{type:'audio/mpeg'});
 els.songAudio.files=[fake];els.songAudio.dispatch('change');
 assert.equal(els.songLink.value,'');
 els.analyzeBtn.click();
 assert.equal(els.analyzeBtn.classList.contains('action-needs-attention'),false);
 els.directorBtn.click();
 assert.equal(els.directorBtn.classList.contains('action-needs-attention'),false);
});
test('Homepage source options are working Studio links; typography and motion are accessible',()=>{
 const home=fs.readFileSync(path.join(root,'customer.html'),'utf8');
 const html=fs.readFileSync(path.join(root,'my-studio.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'my-studio.css'),'utf8');
 for(const source of ['suno','udio','youtube','spotify','upload'])assert.match(home,new RegExp(`my-studio\\.html\\?source=${source}`));
 assert.match(home,/\.cutloopz-source-tags a:focus-visible/);
 assert.match(home,/NO CREDITS\. JUST VIDEO\./);
 assert.match(html,/id="direction"[^>]+rows="11"/);
 assert.match(html,/id="lyrics"[^>]+rows="10"/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\).*action-needs-attention/);
});
