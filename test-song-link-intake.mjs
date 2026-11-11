import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read=async file=>readFile(new URL(file,import.meta.url),'utf8');
const createInspector=async()=>{
 const context={window:{},URL};
 vm.runInNewContext(await read('./public/cutloopz-song-link.js'),context,{filename:'cutloopz-song-link.js'});
 return context.window.CutLoopzSongLink.inspect;
};
test('V5 recognizes approved Suno and Udio share URLs without touching audio',async()=>{
 const inspect=await createInspector();
 for (const [url,platform] of [
  ['https://suno.com/song/d0ab-14','suno'],
  ['https://suno.com/s/ABC123','suno'],
  ['https://www.suno.com/hook/abc_123','suno'],
  ['https://www.udio.com/songs/ABC-123?utm_source=friend','udio'],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=123','youtube'],
  ['https://youtu.be/dQw4w9WgXcQ?t=12','youtube'],
  ['https://music.youtube.com/watch?v=dQw4w9WgXcQ','youtube'],
  ['https://open.spotify.com/track/1234567890abcd?si=123','spotify'],
  ['https://soundcloud.com/artist/track','soundcloud'],
 ]){
  const result=inspect(url);assert.equal(result.ok,true,url);assert.equal(result.provider,platform);assert.equal(result.requiresAudioUpload,true);
  assert.doesNotMatch(result.url,/(?:utm_source|[?&]t=|[?&]list=|[?&]si=)/);
 }
});
test('V5 rejects impersonation hosts, non-HTTPS, credentials, unknown links and unsafe paths',async()=>{
 const inspect=await createInspector();
 const bad=['https://suno.com.evil.example/song/abc','https://fake-suno.com/song/abc',
 'http://suno.com/song/abc','https://login:secret@suno.com/song/abc','https://suno.com:81/song/abc',
 'javascript:alert(1)','file:///etc/passwd','https://localhost:443/admin','https://127.0.0.1/private',
 'https://youtube.com/watch?v=','https://youtube.com/watch?v=x','https://suno.com/account',
 'https://open.spotify.com/user/me','https://suno.com/song/123#admin'];
 for(const url of bad.slice(0,-1))assert.equal(inspect(url).ok,false,url);
 assert.equal(inspect(bad.at(-1)).ok,true);assert.doesNotMatch(inspect(bad.at(-1)).url,/#/);
 assert.equal(inspect('x'.repeat(2049)).ok,false);
});
test('V5 Studio uses link intake, account sync, truthful audio controls and existing Director',async()=>{
 const [html,js,auth,home,server]=await Promise.all([
  read('./public/my-studio.html'),read('./public/my-studio.js'),read('./customer-auth.js'),read('./public/customer.html'),read('./server.js')]);
 for(const id of ['songLink','useSongLink','songLinkStatus','openSongLink','songAudio','artistPhoto','analyzeBtn','directorBtn'])assert.ok(html.includes(`id="${id}"`));
 assert.ok(html.indexOf('id="songLink"')<html.indexOf('id="songAudio"'));
 assert.match(html,/actual audio, upload your authorized MP3\/WAV/);
 assert.match(js,/songLink:\(window\.CutLoopzSongLink\?\.inspect/);
 assert.match(js,/draft\.songLink/);
 assert.match(js,/lastSongFile/);
 assert.match(js,/mediaWrite\('audio',f\)/);
 assert.match(auth,/'songLink','songName'/);
 assert.match(home,/SUNO Links/);assert.match(home,/href="\/my-studio\.html\?source=link"/);
 assert.match(home,/name="description"/);assert.match(home,/property="og:title"/);
 assert.match(server,/CUTLOOPZ_PUBLIC_LAUNCH!=='true'/);
});
test('V5 marketing does not claim third-party audio extraction, payments or GPU completion',async()=>{
 const [html,home,js]=await Promise.all([read('./public/my-studio.html'),read('./public/customer.html'),read('./public/my-studio.js')]);
 assert.match(html,/does not rip or download audio/);
 assert.match(home,/video generation is not yet enabled/i);
 assert.match(js,/if\(!lastSongFile\)/);
 assert.match(html,/Generate Video — Not Enabled/);
 assert.match(home,/Your music deserves a video/);
});

test('V5C link-only navigation skips audio analyzer and Back returns to Page 1',async()=>{
 const context={window:{},URL};
 vm.runInNewContext(await read('./public/cutloopz-song-link.js'),context);
 const route=context.window.CutLoopzSongLink.navigation;
 assert.equal(route(0,'next',{hasAudio:false,linkAccepted:true}),2);
 assert.equal(route(2,'back',{hasAudio:false,linkAccepted:true}),0);
 assert.equal(route(2,'next',{hasAudio:false,linkAccepted:true}),3);
 assert.equal(route(3,'back',{hasAudio:false,linkAccepted:true}),2);
 assert.equal(route(4,'next',{hasAudio:false,linkAccepted:true}),0);
});
test('V5C uploaded audio still visits analyzer even when a link is saved',async()=>{
 const context={window:{},URL};
 vm.runInNewContext(await read('./public/cutloopz-song-link.js'),context);
 const route=context.window.CutLoopzSongLink.navigation;
 assert.equal(route(0,'next',{hasAudio:true,linkAccepted:true}),1);
 assert.equal(route(0,'next',{hasAudio:true,linkAccepted:false}),1);
 assert.equal(route(1,'next',{hasAudio:true,linkAccepted:true}),2);
 assert.equal(route(2,'back',{hasAudio:true,linkAccepted:true}),1);
 assert.equal(route(0,'next',{hasAudio:false,linkAccepted:false}),1);
});
test('V5C Studio routes link-only projects and explains missing audio and lyrics',async()=>{
 const [html,js,helper]=await Promise.all([read('./public/my-studio.html'),read('./public/my-studio.js'),read('./public/cutloopz-song-link.js')]);
 assert.match(html,/id="directorSourceNotice"/);
 assert.match(html,/song link takes you directly to the Listening Director/i);
 assert.match(js,/showPage\(pageAfter\('next'\)\)/);
 assert.match(js,/showPage\(pageAfter\('back'\)\)/);
 assert.match(js,/Next: Listening Director/);
 assert.match(js,/lyrics have not been imported automatically/i);
 assert.match(js,/!renderLinkStatus\(true\)&&!lastSongFile/);
 assert.match(helper,/linkAccepted && !hasAudio/);
 assert.doesNotMatch(js,/fetch\(['"]https:\/\/suno\.com/);
});
