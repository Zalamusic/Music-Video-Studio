import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectLocalMedia} from './cutloopz-local-media-validation.mjs';
const wav=Buffer.alloc(1200);wav.write('RIFF',0);wav.write('WAVE',8);
const png=Buffer.alloc(1200);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
test('valid media signatures preserve usable file extensions for model runner',()=>{
 assert.deepEqual(detectLocalMedia({song:wav,photo:png}),{songExtension:'wav',photoExtension:'png'});
});
test('rejects unsupported, empty, spoofed and oversized media',()=>{
 assert.throws(()=>detectLocalMedia({song:Buffer.alloc(1200),photo:png}),/MP3 or WAV/);
 assert.throws(()=>detectLocalMedia({song:wav,photo:Buffer.alloc(1200)}),/JPEG, PNG, or WebP/);
 assert.throws(()=>detectLocalMedia({song:wav,photo:Buffer.alloc(12*1024*1024+1)}),/12MB/);
 assert.throws(()=>detectLocalMedia({song:wav,photo:Buffer.alloc(2)}),/1KB/);
});
