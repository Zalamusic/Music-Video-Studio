import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read = filename => readFileSync(new URL('./public/'+filename,import.meta.url),'utf8');

test('Account checks session before displaying either account form or profile',()=>{
  const page=read('account.html');
  assert.match(page,/<section class="panel account-loading" id="accountLoading"/);
  assert.match(page,/<section class="panel hidden" id="authPanel">/);
  assert.match(page,/<section class="panel hidden" id="profilePanel">/);
  assert.match(page,/function showUser\([\s\S]*?\$\('accountLoading'\)\.classList\.add\('hidden'\)/);
  assert.match(page,/function showAuth\([\s\S]*?\$\('accountLoading'\)\.classList\.add\('hidden'\)/);
  assert.match(page,/\.catch\(\(\) => \{ if \(!signedIn && !busy\) \{ showAuth\(\); setMode\(pageParams\.get\('mode'\) === 'signup' \? 'register' : 'login'\); \} \}\);/);
});
test('Floating home shortcut does not use a fragment that triggers extra scrolling',()=>{
  const source=read('cutloopz-floating-home.js');
  assert.match(source,/link\.href = '\/customer\.html';/);
  assert.doesNotMatch(source,/\/customer\.html#home/);
  const page=read('account.html');
  assert.equal((page.match(/src="\/cutloopz-floating-home\.js"/g)||[]).length,1);
});
test('Wizard movement happens after layout, honors reduced-motion and cancels outdated scroll',()=>{
  const script=read('my-studio.js');
  assert.match(script,/requestAnimationFrame\(\(\)=>\{/);
  assert.match(script,/cancelAnimationFrame\(stepScrollFrame\)/);
  assert.match(script,/behavior:reduced\?'auto':'smooth'/);
  assert.match(read('my-studio.css'),/overflow-anchor: none/);
});
test('Artist links show actual platform names and reject lookalike domains',()=>{
  for(const filename of ['account.html','artist.js']){
    const source=read(filename);
    const begin=source.indexOf('function cutloopzPlatformName'); const tail=source.indexOf('return hostname.replace',begin); const end=source.indexOf('}',tail);
    const code=begin>=0 && tail>=0 && end>=0 ? source.slice(begin,end+1) : null;
    assert.ok(code,`platform helper present in ${filename}`);
    const ctx={};
    runInNewContext(code+'; this.label = cutloopzPlatformName',ctx);
    assert.equal(ctx.label('open.spotify.com'),'Spotify');
    assert.equal(ctx.label('m.youtube.com'),'YouTube');
    assert.equal(ctx.label('www.tiktok.com'),'TikTok');
    assert.equal(ctx.label('notspotify.com'),'notspotify.com');
  }
});
