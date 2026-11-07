/**
 * CutLoopz Unified Production — no-charge HTTP integration tests.
 * Exercises admin authorization, preflight, 30s planning, shot ledger,
 * and the disabled render gate. Does NOT call any video provider.
 * Run with: node --test test-cutloopz-unified-production.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import express from 'express';
import { registerCutLoopzUnifiedProduction } from './cutloopz-unified-production.js';
const ADMIN_KEY = 'local-integration-test-only';
function silentWav(seconds = 30) {
 const sampleRate = 8000;
 const dataSize = sampleRate * seconds * 2;
 const wav = Buffer.alloc(44 + dataSize);
 wav.write('RIFF', 0);
 wav.writeUInt32LE(36 + dataSize, 4);
 wav.write('WAVEfmt ', 8);
 wav.writeUInt32LE(16, 16);
 wav.writeUInt16LE(1, 20);
 wav.writeUInt16LE(1, 22);
 wav.writeUInt32LE(sampleRate, 24);
 wav.writeUInt32LE(sampleRate * 2, 28);
 wav.writeUInt16LE(2, 32);
 wav.writeUInt16LE(16, 34);
 wav.write('data', 36);
 wav.writeUInt32LE(dataSize, 40);
 return wav;
}
const png = Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
 'base64'
);
async function json(response) {
 const body = await response.text();
 let value;
 try { value = JSON.parse(body); } catch {
 throw new Error(`Expected JSON (${response.status}): ${body.slice(0, 200)}`);
 }
 return value;
}
test('unified production admin routes: plan and deny paid rendering', {
 timeout: 60000
}, async t => {
 const ffprobe = spawnSync('ffprobe', ['-version'], { stdio: 'ignore' });
 if (ffprobe.error || ffprobe.status !== 0) {
 t.skip('ffprobe required for a realistic audio planning test');
 return;
 }
 // Fail closed regardless of any CI or developer machine settings.
 process.env.CUTLOOPZ_UNIFIED_30S_ENABLED = 'false';
 process.env.ZALA_GPU_GENERATION_ENABLED = 'false';
 process.env.CUTLOOPZ_UNIFIED_30S_SPEND_APPROVED = 'false';
 process.env.ENABLE_PAID_GENERATION = 'false'; const root = await mkdtemp(path.join(os.tmpdir(), 'cutloopz-unified-test-'));
 const app = express();
 app.use(express.json());
 registerCutLoopzUnifiedProduction({
 app,
 outputDirectory: root,
 isVideoAdmin: req => req.get('X-Video-Admin-Key') === ADMIN_KEY
 });
 const server = await new Promise(resolve => {
 const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
 });
 const address = server.address();
 const base = `http://127.0.0.1:${address.port}/api/unified-production`;
 const auth = { 'X-Video-Admin-Key': ADMIN_KEY };
 try {
 const forbidden = await fetch(`${base}/preflight`);
 assert.equal(forbidden.status, 403, 'Anonymous users cannot access admin routes');
 const preflight = await fetch(`${base}/preflight`, { headers: auth });
 assert.equal(preflight.status, 200);
 const checks = await json(preflight);
 assert.equal(checks.renderingEnabled, false);
 assert.equal(checks.gates.explicitSpendApproval, false);
 const form = new FormData();
 form.append('audio', new Blob([silentWav()], { type: 'audio/wav' }), 'test.wav');
 form.append('photo', new Blob([png], { type: 'image/png' }), 'reference.png');
 form.append('title', 'CutLoopz Integration Test');
 form.append('prompt', 'A gentle continuous cinematic performance in a warmly lit room.');
 form.append('format', 'landscape');
 const planning = await fetch(`${base}/plan`, { method: 'POST', headers: auth, body: form });
 const planned = await json(planning);
 assert.equal(planning.status, 201, JSON.stringify(planned));
 assert.equal(planned.job.status, 'planned');
 assert.equal(planned.job.videoSeconds, 30);
 assert.equal(planned.timeline.totalSegments, 6);
 assert.deepEqual(planned.timeline.segments.map(s => s.durationSeconds), [5, 5, 5, 5, 5, 5]);
 const id = planned.job.id;
 const statusResponse = await fetch(`${base}/jobs/${id}`, { headers: auth });
 const status = await json(statusResponse);
 assert.equal(statusResponse.status, 200);
 assert.equal(status.shots.length, 6);
 assert.ok(status.shots.every(shot => shot.status === 'pending'));
 const saved = JSON.parse(await readFile(
 path.join(root, 'unified-30s', id, 'shot-ledger.json'), 'utf8'
 ));
 assert.equal(saved.shots.length, 6);
 const denied = await fetch(`${base}/jobs/${id}/render`, {
 method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
 body: JSON.stringify({ confirm: 'RENDER_30_SECONDS_WITH_GPU_COST' })
 });
 assert.equal(denied.status, 503, 'No GPU request is permitted by default');
 const noVideo = await fetch(`${base}/jobs/${id}/video`, { headers: auth });
 assert.equal(noVideo.status, 409, 'Unrendered jobs cannot be downloaded as videos');
 } finally {
 await new Promise(resolve => server.close(resolve));
 await rm(root, { recursive: true, force: true }); }
});
