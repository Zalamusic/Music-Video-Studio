import test from 'node:test';
import assert from 'node:assert/strict';
import {looksLikeAudio,rateGate,safeMusicPlan,validateStory} from './cutloopz-creative-preview.mjs';
import {createStoryIntelligencePlan} from './cutloopz-story-intelligence.js';
import {readFile} from 'node:fs/promises';

const input={title:'Safe With Me',lyrics:'I feel safe with you\nI will stay here',songSeconds:30,sceneSeconds:15,prompt:'soft cinematic performance with gentle head motion',format:'vertical',visualStyle:'Cinematic Realism'};
test('No-admin creative director prepares 30-second storyboard',()=>{
 const checked=validateStory(input);
 const plan=createStoryIntelligencePlan(checked);
 assert.equal(plan.totalScenes,2);
 assert.equal(plan.scenes[0].number,1);
 assert.equal(plan.scenes[1].endSeconds,30);
 assert.match(plan.scenes[0].prompt,/safe with me/i);
});
test('Safe music plan strips extraneous provider fields',()=>{
 const safe=safeMusicPlan({bpmEstimate:96,private:'not for clients',scenes:[{startSeconds:0,endSeconds:15,intensity:'high',private:'secret'}]});
 assert.equal(safe.bpmEstimate,96);assert.equal(safe.scenes.length,1);assert.equal('private' in safe.scenes[0],false);
});
test('Unreasonable creative durations rejected',()=>{
 for(const value of [0,361,Infinity,'bad'])assert.throws(()=>validateStory({...input,songSeconds:value}));
 assert.throws(()=>validateStory({...input,lyrics:'a'.repeat(12001)}));
 assert.throws(()=>validateStory({...input,prompt:'a'.repeat(4001)}));
});
test('Invalid audio magic rejected',()=>{
 assert.equal(looksLikeAudio({buffer:Buffer.alloc(100),originalname:'fake.mp3'}),false);
 assert.equal(looksLikeAudio({buffer:Buffer.from('RIFF____WAVE____'),originalname:'a.wav'}),true);
 assert.equal(looksLikeAudio({buffer:Buffer.from('ID3'+'x'.repeat(20)),originalname:'song.mp3'}),true);
});
test('Creative rate gate denies excess operations',()=>{
 const request={ip:'127.0.0.55'};assert.equal(rateGate(request,'unit-test-director',2,1000),false);assert.equal(rateGate(request,'unit-test-director',2,1000),false);assert.equal(rateGate(request,'unit-test-director',2,1000),true);
});
test('Homepage creation is only in My Studio',async()=>{
 const home=await readFile(new URL('./public/customer.html',import.meta.url),'utf8');
 assert.ok(home.includes('href="/my-studio.html"'));
 assert.ok(!home.includes('id="customerForm"'));
 assert.ok(!home.includes("$('customerForm')"));
});
test('Public editor does not contain administrator secret control',async()=>{
 const my=await readFile(new URL('./public/my-studio.html',import.meta.url),'utf8');
 const js=await readFile(new URL('./public/my-studio.js',import.meta.url),'utf8');
 assert.ok(!my.includes('adminKey'));
 assert.ok(!js.includes('X-Video-Admin-Key'));
 assert.ok(js.includes('/api/creative-preview/storyboard'));
 assert.ok(js.includes('/api/creative-preview/music-analysis'));
});
