import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const home=read('./public/customer.html');
const studio=read('./public/my-studio.html');
const styles=read('./public/my-studio.css');
const js=read('./public/my-studio.js');
const link=read('./public/cutloopz-song-link.js');
test('free link evaluation and MP3 production are distinct sections, and not adjacent choices',()=>{
  const evaluation=home.match(/<div class="cutloopz-evaluation-card"[\s\S]*?<\/div>/)?.[0];
  assert.ok(evaluation);
  assert.match(evaluation,/Evaluate Your Song — Free/);
  assert.match(evaluation,/Song links do not create videos/);
  assert.doesNotMatch(evaluation,/>MP3\s*\/\s*WAV</);
  assert.match(home,/<section class="content cutloopz-create-section" id="create"/);
  assert.match(home,/Create My Video · MP3\/WAV/);
  assert.ok(home.indexOf('cutloopz-evaluation-card') < home.indexOf('cutloopz-create-section'));
  assert.match(home,/\.cutloopz-create-section\{[^}]*margin-top:22px/);
  assert.match(home,/video ordering is still in preview/i);
});
test('Studio preserves source toggle but explains the two paths with separated cards',()=>{
  assert.match(studio,/FREE EVALUATION · NO VIDEO/);
  assert.match(studio,/VIDEO CREATION · MP3\/WAV/);
  assert.match(studio,/id="sourceLinkBtn"/);
  assert.match(studio,/id="sourceUploadBtn"/);
  assert.match(studio,/id="songLinkPanel"[^>]*hidden/);
  assert.match(studio,/id="audioSourcePanel"/);
  assert.match(styles,/\.source-mode\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(js,/selectedSource!=='upload'/);
  assert.match(js,/selectedSource!=='link'/);
  assert.match(js,/\['suno','udio','youtube','spotify','soundcloud','tiktok'\]/);
});
test('TikTok public video and short links accepted as references, not audio, and spoofed hosts refused',()=>{
  const context={window:{},URL};vm.runInNewContext(link,context);
  const inspect=context.window.CutLoopzSongLink.inspect;
  for(const url of ['https://www.tiktok.com/@artist.name/video/7334567890123456789','https://vt.tiktok.com/ZS123abc/','https://vm.tiktok.com/ZM123456/']){
    const result=inspect(url);
    assert.equal(result.ok,true,url);assert.equal(result.provider,'tiktok');
    assert.equal(result.requiresAudioUpload,true);
  }
  for(const url of ['https://tiktok.com.evil.example/@artist/video/7334567890123456789','http://www.tiktok.com/@artist/video/7334567890123456789','https://www.tiktok.com/@artist','https://vt.tiktok.com/private/account','https://www.tiktok.com:81/@artist/video/7334567890123456789']){
    assert.equal(inspect(url).ok,false,url);
  }
  assert.match(home,/my-studio\.html\?source=tiktok/);
});
