import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const directory=new URL('./public/',import.meta.url);
const html=readFileSync(new URL('my-studio.html',directory),'utf8');
const code=readFileSync(new URL('my-studio.js',directory),'utf8');
const library=readFileSync(new URL('cutloopz-project-backup.js',directory),'utf8');
const context={TextEncoder,Date};vm.createContext(context);vm.runInContext(library,context);
const backup=context.CutLoopzProjectBackup;
const original={source:'upload',title:'I’m a Baddie',songSeconds:30,sceneSeconds:15,format:'vertical',style:'Cinematic Realism',
 lyrics:'I know what I want',direction:'Luxury artist with elegant, natural movements',characterNotes:'Keep the reference photo identity',songName:'my-song.mp3',photoName:'artist.png',
 scenes:[{number:1,startSeconds:0,endSeconds:15,emotion:'Confident',location:'Mansion',action:'Exits luxury car',prompt:'Slow tracking shot'},
         {number:2,startSeconds:15,endSeconds:30,emotion:'Playful',location:'Rooftop',action:'Performs on a rooftop',prompt:'Close-up, smooth motion'}]};

test('toolbar: four accessible actions on all five pages, no inert backup buttons',()=>{
 for (const id of ['saveNow','downloadStoryboard','downloadProjectBackup','restoreProjectBackup','projectBackupFile','projectTransferStatus'])
  assert.match(html,new RegExp(`id="${id}"`));
 assert.ok(html.indexOf('id="saveNow"')<html.indexOf('data-step="0"'));
 for (const id of ['saveNow','downloadStoryboard','downloadProjectBackup','restoreProjectBackup','projectBackupFile'])
  assert.match(code,new RegExp(`\\$\\('${id}'\\)\\.addEventListener`));
 assert.match(code,/downloadStoryboard'\)\.disabled=scenes\.length===0/);
});

test('portable creative backup roundtrips, preserving prompts and scenes, excluding media',()=>{
 const archive=backup.createBackup(original);
 assert.equal(archive.version,1);assert.equal(archive.format,'cutloopz-studio-project');
 assert.equal(archive.mediaIncluded,false);
 const restored=backup.parseBackup(JSON.stringify(archive));
 assert.equal(restored.title,original.title);
 assert.equal(restored.lyrics,original.lyrics);
 assert.equal(restored.direction,original.direction);
 assert.equal(restored.scenes.length,2);
 assert.equal(restored.scenes[1].prompt,original.scenes[1].prompt);
 assert.equal(restored.songName,'my-song.mp3');
 assert.ok(!JSON.stringify(archive).includes('fileBytes'));
 assert.equal(restored.analysisSourceKey,undefined);
});

test('storyboard download text contains all scenes and creative direction',()=>{
 const result=backup.storyboardText(original);
 for(const word of ['I’m a Baddie','Mansion','Rooftop','Slow tracking shot','Close-up, smooth motion','ARTIST APPEARANCE','Luxury artist'])
  assert.ok(result.includes(word),`Story text omitted ${word}`);
 assert.equal(backup.safeName('../../My Song!?'),'My-Song');
});

test('malformed, oversized, and unsupported backup formats are rejected',()=>{
 assert.throws(()=>backup.parseBackup('{'),/valid JSON/);
 assert.throws(()=>backup.parseBackup(JSON.stringify({format:'other',version:1,draft:{}})),/CutLoopz Studio/);
 assert.throws(()=>backup.parseBackup(JSON.stringify({format:'cutloopz-studio-project',version:2,draft:{}})),/version 1/);
 assert.throws(()=>backup.parseBackup(' '.repeat(1024*1024+1)),/smaller than 1 MB/);
 assert.throws(()=>backup.parseBackup(JSON.stringify({format:'cutloopz-studio-project',version:1,draft:{scenes:Array(41).fill({})}})),/more than 40 scenes/);
});

test('import clears local media and does not start paid generation',()=>{
 assert.match(code,/mediaWrite\('audio',null\),mediaWrite\('photo',null\)/);
 assert.match(code,/Reattach your MP3\/WAV and artist photo before generation/);
 assert.match(code,/const batchSize=2/);
 assert.doesNotMatch(library,/fetch\(|\bXMLHttpRequest\b/);
 assert.doesNotMatch(library,/local\/jobs|\/api\/paypal/);
});


test('server account drafts retain song source and accommodate full-length storyboards',()=>{
 const auth=readFileSync(new URL('../customer-auth.js',directory),'utf8');
 const server=readFileSync(new URL('../server.js',directory),'utf8');
 assert.match(auth,/const allowed=\['source','title'/);
 assert.match(auth,/Buffer\.byteLength\(serialized,'utf8'\)>240000/);
 assert.match(server,/limit: '256kb'/);
});
