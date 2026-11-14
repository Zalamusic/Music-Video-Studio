import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('My Creative Home centralizes navigation without duplicating rewards progress',()=>{
 const a=read('./public/account.html');
 assert.match(a,/class="account-hub-grid"/);
 assert.match(a,/href="\/creator-profile\.html"/);
 assert.match(a,/href="#historyTitle"/);
 assert.match(a,/href="\/my-studio\.html\?source=upload"/);
 assert.doesNotMatch(a,/id="loyaltyPanel"|id="progressFill"|id="progressText"/);
 assert.match(a,/if \(pageParams\.get\('return'\)==='studio'\)/);
 assert.match(a,/showUser\(user, newlyRegistered\)/);
 assert.match(a,/id="orderHistory"/);
});

test('Artist editor keeps personal details, one private rewards link and no duplicate public-view button',()=>{
 const a=read('./public/creator-profile.html');
 assert.match(a,/href="\/hit-maker-rewards\.html"/);
 assert.equal((a.match(/href="\/hit-maker-rewards\.html"/g)||[]).length,1);
 assert.match(a,/id="viewMyProfile"/);
 assert.doesNotMatch(a,/id="viewPublicProfile"/);
 assert.match(a,/href="\/account\.html\?view=studio"/);
});

test('Avatar allows touch reposition and pinch/slider zoom before saving a small JPEG',()=>{
 const html=read('./public/creator-profile.html');
 const js=read('./public/creator-profile.js');
 const css=read('./public/cutloopz-creator.css');
 for(const id of ['avatarCropOverlay','avatarCropCanvas','avatarZoom','avatarCropConfirm','avatarCropCancel'])assert.ok(html.includes(`id="${id}"`),id);
 assert.match(js,/pointerdown/);assert.match(js,/pointermove/);
 assert.match(js,/pointers\.size===1/);assert.match(js,/pointers\.size===1/);
 assert.match(js,/zoomInput\.addEventListener\('input'/);
 assert.match(js,/output\.width=160;output\.height=160/);
 assert.match(js,/toDataURL\('image\/jpeg',0\.72\)/);
 assert.match(js,/avatarData=value;showAvatar\(\);closeCrop\(\)/);
 assert.match(css,/touch-action:none/);
 assert.match(css,/\.avatar-crop-overlay\[hidden\]/);
});

test('The public homepage and Studio favor the central signed-in hub',()=>{
 const home=read('./public/customer.html'),studio=read('./public/my-studio.html');
 assert.equal((home.match(/My Creative Home/g)||[]).length,2);
 assert.match(studio,/My Creative Home/);
 assert.match(read('./public/hit-maker-rewards.html'),/href="\/creator-profile\.html"/);
});
