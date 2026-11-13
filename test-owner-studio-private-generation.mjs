import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL(name,import.meta.url),'utf8');
test('Studio has owner generate, rights, recovery and progress rather than disabled CTA',async()=>{
 const html=await read('./public/my-studio.html');const js=await read('./public/my-studio.js');
 for(const id of ['generateVideo','audioRights','checkEngine','resumeGeneration','generationProgress','generatedVideo','downloadGeneratedVideo'])assert.ok(html.includes(`id="${id}"`),id);
 assert.ok(!html.includes('Generate Video — Not Enabled'));
 assert.match(js,/fetch\(productionBase\+'\/local\/jobs'/);
 assert.match(js,/lastSongFile\|\|!lastPhotoFile/);
 assert.match(js,/localStorage\.setItem\(productionStorageKey\(\),productionJobId\)/);
 assert.match(js,/resumeProduction/);
});
test('Private owner access uses authenticated session, not first-registered user or browser admin password',async()=>{
 const server=await read('./server.js'),auth=await read('./customer-auth.js'),router=await read('./cutloopz-production-router.mjs');
 assert.match(server,/CUTLOOPZ_OWNER_EMAIL/);assert.match(server,/customerAuthRouter\.authenticatedUser\(req\)/);
 assert.match(auth,/findSession\(req\)\?\.user/);
 assert.match(router,/await authorize\(req\)/);assert.match(router,/Request origin does not match this site/);
 assert.ok(!/id="key"/.test(await read('./public/my-studio.html')));
});
test('Local production starts automatically while external paid approval is preserved',async()=>{
 const router=await read('./cutloopz-production-router.mjs');const adapter=await read('./cutloopz-local-generator-adapter.mjs');
 assert.match(router,/await autoRunner\.start\(job\.id\)/);
 assert.ok(!router.includes("req.body?.approveLocalGeneration!=='yes'"));
 assert.ok(!router.includes("req.body?.confirmLocalClip!=='yes'"));
 assert.ok(!router.includes("req.body?.confirmLocalFullJob!=='yes'"));
 assert.match(router,/req.body\?\.confirmPaidClip!=='yes'/);
 assert.match(adapter,/form\.set\('creativePrompt'/);
});
test('Every five-second duration is available and scene prompts reach worker',async()=>{
 const html=await read('./public/my-studio.html'),model=await read('./cutloopz-local-model-service.mjs');
 for(let sec=15;sec<=360;sec+=5)assert.match(html,new RegExp(`value="${sec}"`));
 assert.match(model,/CUTLOOPZ_VISUAL_PROMPT:creativePrompt/);
 assert.match(model,/CUTLOOPZ_VIDEO_FORMAT:format/);
});
