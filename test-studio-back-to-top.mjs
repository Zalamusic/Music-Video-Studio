import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const base=new URL('./public/',import.meta.url);
test('My Studio retains an accessible floating Back to Top arrow',async()=>{
 const [html,css,js]=await Promise.all(['my-studio.html','my-studio.css','my-studio.js'].map(name=>readFile(new URL(name,base),'utf8')));
 assert.equal((html.match(/id="backToTop"/g)||[]).length,1);
 assert.match(html,/<button[^>]*id="backToTop"[^>]*aria-label="Back to top"[^>]*hidden/);
 assert.match(css,/\.back-to-top\{position:fixed;/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(js,/window\.scrollY<180/);
 assert.match(js,/backToTop\.addEventListener\('click',\(\)=>window\.scrollTo/);
 assert.match(js,/prefers-reduced-motion: reduce/);
 assert.match(js,/window\.addEventListener\('scroll',updateBackToTop,\{passive:true\}\)/);
});
