import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./public/my-studio.html',import.meta.url),'utf8');
const css=readFileSync(new URL('./public/my-studio.css',import.meta.url),'utf8');
test('artist photo is available on Page 1, not hidden on Director page',()=>{
 const first=html.indexOf('data-step="0"');const second=html.indexOf('data-step="1"');
 const third=html.indexOf('data-step="2"');const fourth=html.indexOf('data-step="3"');
 assert.ok(first>=0&&second>first&&third>second&&fourth>third);
 assert.equal((html.match(/id="artistPhoto"/g)||[]).length,1);
 assert.ok(html.slice(first,second).includes('id="artistPhoto"'));
 assert.ok(!html.slice(third,fourth).includes('id="artistPhoto"'));
 assert.ok(html.includes('id="photoPreview"'));
});
test('readable mobile copy is not reduced to 10px',()=>{
 assert.ok(css.includes('.status-chip{font-size:12px}'));
 assert.ok(css.includes('.hint,.helper{font-size:15px'));
 assert.ok(css.includes('.scene-card label{font-size:15px'));
});
