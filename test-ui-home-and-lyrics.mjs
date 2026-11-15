import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const root=new URL('./public/',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');

test('Home shortcut is accessible, fixed and included across all customer pages',()=>{
 const home=read('cutloopz-floating-home.js');
 for (const page of ['index.html','customer.html','my-studio.html','account.html','customer-backup.html',
   'customer-order.html','customer-orders.html','director-preview.html','glamour.html',
   'glamour-dashboard.html','order.html','video-studio.html','reset-password.html']) {
   assert.match(read(page),/src="\/cutloopz-floating-home\.js"/,page);
 }
 assert.match(home,/position: fixed;/);
 assert.match(home,/left: max\(/);
 assert.match(home,/bottom: max\(/);
 assert.match(home,/safe-area-inset-bottom/);
 assert.match(home,/aria-label', 'Go to CutLoopz Home'/);
 assert.match(home,/link\.href = '\/customer\.html';/);
 assert.doesNotMatch(home,/\/customer\.html#home/);
 assert.doesNotMatch(home,/fetch\(|\/api\/local\/jobs|\/api\/paypal/);
});

test('Lyrics stay compact until focused, then expand without trapping page swipes; paste resets to first verse',()=>{
 const html=read('my-studio.html'),css=read('my-studio.css'),js=read('my-studio.js'),library=read('cutloopz-lyrics-board.js');
 assert.match(html,/src="\/cutloopz-lyrics-board\.js"/);
 assert.match(html,/id="lyrics"[^>]*maxlength="12000"[^>]*aria-describedby="lyricsBoardHelp"/);
 assert.match(html,/Tap the box to expand and edit the complete song/);
 assert.match(css,/#lyrics \{height:260px;min-height:230px;max-height:min\(65vh,450px\);overflow-y:auto;/);
 assert.match(css,/#lyrics \{overflow-y:hidden; resize:none; touch-action:pan-y;\}/);
 assert.match(css,/#lyrics\.lyrics-expanded \{max-height:none;overflow-y:hidden;\}/);
 assert.match(js,/lyricsField\.addEventListener\('focus'/);
 assert.match(js,/lyricsField\.classList\.add\('lyrics-expanded'\)/);
 assert.match(js,/lyricsField\.addEventListener\('blur'/);
 assert.match(js,/if\(page===0\)window\.CutLoopzLyricsBoard\?\.refresh\(\)/);
 assert.match(library,/lyrics\.scrollTop = 0/);
 assert.match(library,/lyrics\.addEventListener\('paste'/);
 assert.doesNotMatch(library,/scrollHeight/);
 assert.doesNotMatch(library,/lyrics\.addEventListener\('input'/);
 assert.match(read('director-preview.html'),/src="\/cutloopz-lyrics-board\.js"/);
 assert.doesNotMatch(library,/\.value\s*=|fetch\(|\/api\//);
});
