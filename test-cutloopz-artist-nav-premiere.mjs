import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('mobile navigation cue changes from Scroll right to Scroll left and preserves native swipe',()=>{
  const nav={dataset:{},id:'',scrollWidth:820,clientWidth:350,scrollLeft:0,handlers:{},
    addEventListener(type,fn){this.handlers[type]=fn},insertAdjacentElement(_,el){this.control=el},
    scrollBy({left}){this.scrollLeft=Math.max(0,Math.min(this.scrollWidth-this.clientWidth,this.scrollLeft+left));this.handlers.scroll?.()}};
  const document={readyState:'complete',querySelectorAll:()=>[nav],createElement:tag=>({tag,hidden:false,attributes:{},setAttribute(k,v){this.attributes[k]=v},append(el){this.child=el},addEventListener(k,v){this[k]=v}})};
  const window={addEventListener(){}};
  runInNewContext(read('public/cutloopz-nav-scroll.js'),{document,window,matchMedia:()=>({matches:true})});
  const button=nav.control.child;
  assert.equal(button.textContent,'Scroll →');assert.equal(nav.control.hidden,false);
  button.click();button.click();assert.equal(button.textContent,'← Scroll');
  const end=nav.scrollLeft;button.click();assert.ok(nav.scrollLeft<end);assert.equal(button.textContent,'Scroll →');
  nav.scrollWidth=nav.clientWidth;nav.handlers.scroll();assert.equal(nav.control.hidden,true);
});

test('Creator Directory offers compact clickable cards; public profile fetches public-only backend and uses no video hosting',()=>{
  const directory=read('public/creator-directory.js'),artist=read('public/artist.js'),html=read('public/artist.html'),server=read('customer-auth.js');
  assert.match(directory,/creator-result/);assert.match(directory,/artist\.html\?id=/);
  assert.doesNotMatch(directory,/creator\.bio\)card\.append/);
  assert.match(artist,/\/api\/customer-auth\/creators\//);assert.match(artist,/target='_blank'|target='_blank'|link\.target='_blank'/);
  assert.match(artist,/textContent/);assert.match(html,/Listen &amp; Watch/);assert.match(html,/CutLoopz does not store public showcase videos/);
  assert.match(server,/profile\.visibility !== 'public'/);
  const owner=read('public/creator-profile.html'),ownerClient=read('public/creator-profile.js');
  assert.match(owner,/My Hit Maker Rewards/);assert.match(ownerClient,/\/artist\.html\?id=/);
});

test('Cinema branding is a private premiere without changing token-based access',()=>{
 const html=read('public/cinema.html'),css=read('public/cutloopz-cinema.css'),js=read('public/cutloopz-cinema.js');
 assert.match(html,/Every Artist Deserves a Premiere/);assert.match(html,/WELCOME TO YOUR PRIVATE PREMIERE/);
 assert.match(css,/#431423/);assert.match(html,/id="reviewVideo"/);
 assert.match(js,/\/stream\//);assert.match(js,/\/download\//);
 assert.match(html,/Hey there! Sorry you missed this video preview/);
});
