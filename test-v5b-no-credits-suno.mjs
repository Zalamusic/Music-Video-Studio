import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async file=>readFile(new URL(file,import.meta.url),'utf8');
test('V5B uses uppercase visually bold SUNO and prominent supported platform names',async()=>{
 const [home,studio,styles,links]=await Promise.all([read('./public/customer.html'),read('./public/my-studio.html'),read('./public/my-studio.css'),read('./public/cutloopz-song-link.js')]);
 assert.match(home,/<strong class="cutloopz-platform">SUNO<\/strong>/);
 assert.match(home,/class="cutloopz-suno">SUNO Links/);
 assert.match(studio,/<strong class="studio-platform studio-suno">SUNO<\/strong>/);
 assert.match(styles,/\.studio-suno\{font-weight:900/);
 assert.match(links,/name:'SUNO'/);
 assert.doesNotMatch(home,/Suno Links/);
});
test('V5B promises straightforward per-video pricing without claiming preview checkout works',async()=>{
 const [home,studio]=await Promise.all([read('./public/customer.html'),read('./public/my-studio.html')]);
 assert.match(home,/NO CREDITS\. JUST VIDEO\./);
 assert.match(home,/No credit packs or token counting/);
 assert.match(home,/Orders and payments are not yet enabled in this preview/);
 assert.match(studio,/NO CREDITS\. JUST VIDEO\./);
 assert.match(studio,/No credit packs or token counting/);
 assert.match(studio,/Generate Video — Not Enabled/);
});
