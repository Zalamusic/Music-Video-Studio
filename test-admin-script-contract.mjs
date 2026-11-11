import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';

const root=path.dirname(fileURLToPath(import.meta.url));
test('every inline browser script in public HTML compiles', async()=>{
 const files=(await fs.readdir(path.join(root,'public'))).filter(name=>name.endsWith('.html'));
 let checked=0;
 for(const filename of files){
  const html=await fs.readFile(path.join(root,'public',filename),'utf8');
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
   const [,attrs,source]=match;
   if(/\bsrc\s*=/.test(attrs)||!source.trim())continue;
   // All currently inline authoring is classic JS; reject unparsable JS before release.
   assert.doesNotThrow(()=>new Script(source,{filename}),`Bad inline JavaScript in ${filename}`);
   checked++;
  }
 }
 assert.ok(checked>0);
});

test('admin Director constructs six five-second shot forms and uses actual readiness field', async()=>{
 const html=await fs.readFile(path.join(root,'public','admin-unified-production.html'),'utf8');
 assert.match(html,/for\s*\(let number=1;number<=6;number\+\+\)\s*\$\('shotCards'\)\.append\(createShotCard\(number\)\)/);
 for(const field of ['location','wardrobe','expression','lighting','storyBeat','continuityNote','framing','camera','action','visualStyle','lookId']){
  assert.ok(html.includes(`'${field}'`),`Missing ${field} field`);
 }
 assert.match(html,/setReady\(h\.readyToSubmit===true\)/);
 assert.doesNotMatch(html,/setReady\(h\.modelLoaded===true\)/);
});
