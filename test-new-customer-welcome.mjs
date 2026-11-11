import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('welcome assets exist on sign-up account and Studio pages',async()=>{
 const [account,studio]=await Promise.all([read('./public/account.html'),read('./public/my-studio.html')]);
 for(const html of [account,studio]){
   assert.match(html,/href="\/cutloopz-welcome\.css"/);
   assert.match(html,/src="\/cutloopz-welcome\.js"/);
 }
});

test('only successful new registration queues the welcome; Studio consumes once',async()=>{
 const [account,studio,script]=await Promise.all([read('./public/account.html'),read('./public/my-studio.js'),read('./public/cutloopz-welcome.js')]);
 assert.match(account,/if \(newlyRegistered\) window\.CutLoopzWelcome\?\.queue\(user\);/);
 assert.match(account,/afterAuthentication\(data\.user, registering\)/);
 assert.match(studio,/window\.CutLoopzWelcome\?\.consume\(\)/);
 assert.match(script,/sessionStorage\.removeItem\(KEY\)/);
 assert.match(script,/MAX_AGE_MS = 2 \* 60 \* 1000/);
});

test('welcome is dismissible, accessible and safely renders customer name',async()=>{
 const [script,css]=await Promise.all([read('./public/cutloopz-welcome.js'),read('./public/cutloopz-welcome.css')]);
 assert.match(script,/heading\.textContent=`Welcome to CutLoopz/);
 assert.match(script,/setAttribute\('aria-live','polite'\)/);
 assert.match(script,/aria-label','Dismiss welcome message/);
 assert.match(script,/Escape/);
 assert.match(script,/studio\.href='\/my-studio\.html'/);
 assert.match(script,/setTimeout\(close,18000\)/);
 assert.match(css,/position:fixed/);
 assert.match(css,/prefers-reduced-motion/);
});
