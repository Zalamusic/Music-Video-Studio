import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read=async path=>readFile(new URL(path,import.meta.url),'utf8');
const inspector=async()=>{const c={window:{},URL};vm.runInNewContext(await read('./public/cutloopz-song-link.js'),c);return c.window.CutLoopzSongLink.inspect;};
test('V5D accepts Spotify mobile short song share URLs as link-only references',async()=>{
 const inspect=await inspector();
 for(const url of ['https://spotify.link/TIG6rLB7yDb?si=abc','https://www.spotify.link/A5QPkZ3JWDb']){
   const info=inspect(url);assert.equal(info.ok,true,url);assert.equal(info.provider,'spotify');assert.equal(info.requiresAudioUpload,true);assert.ok(!info.url.includes('si='));
 }
});
test('V5D handles localized Spotify track links, preserves platform security, rejects playlist-as-song',async()=>{
 const inspect=await inspector();
 const urls=['https://open.spotify.com/track/56y1jOTK0XSvJzVv9vHQBK?si=abc',
 'https://open.spotify.com/intl-en/track/56y1jOTK0XSvJzVv9vHQBK?si=abc',
 'https://open.spotify.com/intl-fr/episode/1234567890ABCDEF012345'];
 for(const url of urls){const info=inspect(url);assert.equal(info.ok,true,url);assert.equal(info.provider,'spotify');assert.equal(info.requiresAudioUpload,true);assert.ok(!info.url.includes('si='));}
 for(const url of ['https://spotify.link.evil.com/abcde','https://evilspotify.link/abcde','https://spotify.link@evil.example/abcde',
  'http://spotify.link/abcde','https://spotify.link/a','https://open.spotify.com/playlist/1234567890ABCDE',
  'https://open.spotify.com/artist/1234567890ABCDE','https://open.spotify.com/intl-en/track/abc?utm=a',
  'https://spotify.link:8443/12345'])assert.equal(inspect(url).ok,false,url);
});
test('V5D Back/Next anchors the current step; restored drafts do not force scrolling',async()=>{
 const [js,css,html]=await Promise.all([read('./public/my-studio.js'),read('./public/my-studio.css'),read('./public/my-studio.html')]);
 assert.match(js,/function showPage\(index,\{reposition=true\}=\{\}\)/);
 assert.match(js,/page===0\?\$\('songHeading'\)/);
 assert.match(js,/scrollIntoView\(\{block:'start',behavior:'instant'\}\)/);
 assert.match(js,/showPage\(page,\{reposition:false\}\)/);
 assert.match(js,/showPage\(destination,\{reposition:false\}\)/);
 assert.match(css,/scroll-margin-top:20px/);
 assert.match(html,/id="songHeading"/);
});
