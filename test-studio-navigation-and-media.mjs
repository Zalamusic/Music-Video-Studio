import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const files=new URL('./public/',import.meta.url);
test('Homepage Director opens Studio stage 3, while My Studio opens the central workspace',async()=>{
 const home=await readFile(new URL('customer.html',files),'utf8');
 assert.equal((home.match(/href="\/my-studio\.html\?step=director">Director/g)||[]).length,2);
 assert.ok(home.includes('href="/my-studio.html">My Studio'));
 assert.ok(!home.includes('href="/my-studio.html?step=analyze">Director'));
 const js=await readFile(new URL('my-studio.js',files),'utf8');
 assert.match(js,/director:2/);
 assert.match(js,/if\(Number\.isInteger\(destination\)\)showPage\(destination\)/);
});
test('Page 2 reuses Page 1 song and retained media stays private in browser',async()=>{
 const html=await readFile(new URL('my-studio.html',files),'utf8');
 const js=await readFile(new URL('my-studio.js',files),'utf8');
 assert.match(html,/id="songAudio"/);
 assert.match(html,/id="artistPhoto"/);
 assert.ok(html.indexOf('id="artistPhoto"')<html.indexOf('data-step="1"'));
 assert.match(html,/id="analysisIntro"/);
 assert.match(js,/lastSongFile=f/);
 assert.match(js,/mediaWrite\('audio',f\)/);
 assert.match(js,/mediaRead\('audio'\)/);
 assert.match(js,/form\.append\('audio',lastSongFile\)/);
 assert.match(js,/if\(page===1\)refreshAnalysisIntro\(\)/);
 assert.ok(!js.includes('localStorage.setItem(storageKey,JSON.stringify({at:Date.now(),draft:serializable(),file:'));
});
