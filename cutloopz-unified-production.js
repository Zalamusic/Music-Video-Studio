/**
 * CutLoopz Unified Production — administrator-only 30-second integration v1.
 * Uses existing Production Director, Duration Contract, Timeline Bridge,
 * Persistent Shot Ledger, character reference, music intelligence, and RunPod.
 * IMPORTANT: Rendering is DISABLED by default. No external request is made by
 * preflight or planning. Rendering requires independent environment approval.
 * This file does not replace or alter customer order / authentication routes.
 */
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createProductionPlan } from './cutloopz-production-director.js';
import { createGenerationTimeline } from './cutloopz-generation-timeline.js';
import { resolveVideoDuration } from './cutloopz-duration-contract.js';
import { openShotLedger, claimShot, recordShotResult, getShotLedger } from './cutloopz-shot-ledger.js';
import { prepareCharacterReference } from './character-identity-engine.js';
import { createRunPodVideo, getRunPodEngineStatus } from './runpod-video-engine.js';
import { analyzeMusic } from './music-intelligence-engine.js';
const ENABLED = () => process.env.CUTLOOPZ_UNIFIED_30S_ENABLED === 'true';
const PROVIDER_ENABLED = () => process.env.ZALA_GPU_GENERATION_ENABLED === 'true';
const APPROVED = () => process.env.CUTLOOPZ_UNIFIED_30S_SPEND_APPROVED === 'true';
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ASSET_LIMIT = MAX_AUDIO_BYTES;
// Conservative, administrator-approved preparation for visual-only Wan TI2V.
// This DOES NOT offer singing/lip synchronization or invent new wardrobe images.
const WAN_CAMERA = new Set(['locked-off','slow-dolly-in','slow-dolly-out','slow-track-left','slow-track-right','gentle-orbit','slow-pan-left','slow-pan-right']);
const WAN_ACTION = new Set(['hold-pose','look-to-camera','turn-head','one-step-forward','two-steps-forward','gentle-shoulder-groove','raise-hand','lower-hand','walk-past-camera']);
const WAN_FRAMING = new Set(['wide','medium','medium-close-up','close-up','full-body']);
const WAN_STYLE = new Set(['photorealistic','cinematic-stylized']);
const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp']);
const lookUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 4 } });
function shotText(value, max, label) {
 if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value))
 throw new Error(`${label} must be 1–${max} characters of clean text.`);
 return value.trim().replace(/\s+/g, ' ');
}
function checked(value, allowed, label) {
 if (!allowed.has(value)) throw new Error(`Unsupported ${label}: ${String(value)}`);
 return value;
}
/**
 * Pure planning function. Human-approved, image-backed shots only.
 * One renderer (Wan TI2V), five-second clips; sung mouth motion is never claimed.
 * All approved text is checked for the RunPod 2000-character limit without truncation.
 */
export function createUnifiedWanShotPackage({ timeline, directions, availableLooks = [1], approved = false,
 noOnCameraSinging = false, storyboardReviewed = false } = {}) {
 if (!Array.isArray(timeline?.segments) || timeline.segments.length !== 6 || Number(timeline.songSeconds) !== 30)
 throw new Error('Expected a 30-second timeline with exactly six segments.');
 if (!approved || !storyboardReviewed || !noOnCameraSinging)
 throw new Error('Administrator must approve the storyboard and confirm NO on-camera singing.');
 if (!Array.isArray(directions) || directions.length !== 6)
 throw new Error('Provide one explicitly approved shot direction for each of six segments.');
 if (!Array.isArray(availableLooks) || availableLooks.length < 1 || availableLooks.length > 5 ||
 !availableLooks.includes(1) || new Set(availableLooks).size !== availableLooks.length ||
 availableLooks.some(n => !Number.isInteger(n) || n < 1 || n > 5))
 throw new Error('Available look references must include lead photo 1 and at most four additional looks.');
 let cursor = 0;
 const shots = timeline.segments.map((segment, index) => {
 const direction = directions[index];
 const start = Math.round(Number(segment?.startSeconds) * 1000);
 const end = Math.round(Number(segment?.endSeconds) * 1000);
 if (segment.number !== index + 1 || start !== cursor || end - start !== 5000)
 throw new Error(`Invalid segment ${index + 1}; expected continuous five-second shots.`);
 cursor = end;
 if (!direction || direction.number !== segment.number || direction.onCameraSinging !== false)
 throw new Error(`Shot ${segment.number} requires explicit visual-only approval; singing must use a real audio-conditioned renderer.`);
 const lookId = direction.lookId;
 if (!availableLooks.includes(lookId))
 throw new Error(`Shot ${segment.number} refers to unavailable look ${String(lookId)}.`); const location = shotText(direction.location, 140, 'location');
 const wardrobe = shotText(direction.wardrobe, 140, 'wardrobe');
 const expression = shotText(direction.expression, 120, 'expression');
 const lighting = shotText(direction.lighting || 'natural cinematic lighting', 110, 'lighting');
 const beat = shotText(direction.storyBeat, 340, 'approved story beat');
 const continuity = shotText(direction.continuityNote || 'stable facial identity and clothing', 160, 'continuity note');
 const framing = checked(direction.framing, WAN_FRAMING, 'framing');
 const camera = checked(direction.camera, WAN_CAMERA, 'camera');
 const action = checked(direction.action, WAN_ACTION, 'action');
 const style = checked(direction.visualStyle || 'photorealistic', WAN_STYLE, 'visual style');
 // Preserve customer-approved story content while avoiding uncontrolled long prompts.
 const prompt = [
 `One continuous five-second ${style} music video shot.`,
 `APPROVED STORY BEAT: ${beat}.`,
 `Location: ${location}. Lighting: ${lighting}.`,
 `Use exactly the uploaded approved LOOK ${lookId} image as the starting photograph.`,
 `Clothing locked to approved photograph: ${wardrobe}. No wardrobe substitution.`,
 `Framing: ${framing}. ONE camera motion: ${camera}. ONE subject action: ${action}.`,
 `Expression: ${expression}. Preserve original authorized artist identity.`,
 `Continuity: ${continuity}. Realistic gravity, natural limbs and facial movement.`,
 'This is a VISUAL shot with soundtrack added in editing. Do not simulate singing, talking, or lip synchronization.',
 'No cut, slideshow, frozen image, transformation, new person, overlay, caption, logo or watermark.'
 ].join(' ');
 if (prompt.length > 2000) throw new Error(`Wan prompt for shot ${segment.number} is too long.`);
 return { number: segment.number, startSeconds: start / 1000, endSeconds: end / 1000,
 durationSeconds: 5, lookId, renderer: 'wan-ti2v-visual-only', prompt,
 reviewChecks: ['original performer identity', 'approved wardrobe reference', 'natural movement',
 'requested camera action', 'scene continuity', 'no simulated singing'] };
 });
 if (cursor !== 30000) throw new Error('Shot timeline does not cover 30 seconds.');
 return { version: 2, mode: 'approved-visual-only', songSeconds: 30, totalShots: 6,
 shots, warning: 'No vocal synchronization or visual identity verification is provided by this model. Human video review required.' };
}
const active = new Set();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: ASSET_LIMIT, files: 2 } });
const isId = value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
const safeError = error => String(error?.message || error || 'Unexpected error').slice(0, 300);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function command(program, args) {
 return new Promise((resolve, reject) => {
 const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'] });
 let stdout = '';
 let stderr = '';
 child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-8192); });
 child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4096); });
 child.on('error', reject);
 child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || `${program} failed: ${code}`)));
 });
}
async function probeDuration(file) {
 const output = await command('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]);
 const value = Number(output.trim());
 if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid media duration.');
 return value;
}
async function writeJsonAtomic(file, data) {
 const temporary = `${file}.${randomUUID()}.tmp`;
 try {
 await fs.writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
 await fs.rename(temporary, file);
 } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}
async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
async function presentStatus(file) {
 const state = await readJson(file);
 const { id, status, phase, songSeconds, videoSeconds, totalSegments, finishedSegments, error, createdAt, updatedAt } = state;
 return { id, status, phase, songSeconds, videoSeconds, totalSegments, finishedSegments, error, createdAt, updatedAt };
}
export function registerCutLoopzUnifiedProduction({ app, isVideoAdmin, outputDirectory }) {
 if (!app || typeof isVideoAdmin !== 'function') throw new TypeError('Express app and administrator authorization are required.');
 const root = path.resolve(outputDirectory || process.env.OUTPUT_DIR || '/app/outputs');
 const storageDirectory = path.join(root, 'unified-30s');
 const jobPaths = id => { if (!isId(id)) throw new Error('Invalid job ID.');
 const folder = path.join(storageDirectory, id);
 return { folder, state: path.join(folder, 'state.json'), video: path.join(folder, 'final.mp4') };
 };
 const auth = (req, res, next) => {
 if (!isVideoAdmin(req)) return res.status(403).json({ ok: false, error: 'Administrator authorization required.' });
 next();
 };
 const router = express.Router();
 router.use(auth);
 router.get('/preflight', async (_req, res) => {
 const engine = getRunPodEngineStatus();
 res.set('Cache-Control', 'no-store').json({
 ok: true,
 mode: 'administrator-only',
 duration: '30-second preview',
 planningReady: true,
 shotPreparationRequired: true,
 visualOnly: true,
 vocalPerformanceAvailable: false,
 renderingEnabled: ENABLED() && PROVIDER_ENABLED() && APPROVED(),
 gates: { unifiedEnabled: ENABLED(), gpuEnabled: PROVIDER_ENABLED(), explicitSpendApproval: APPROVED() },
 engine,
 costWarning: 'GPU runtime and provider usage may incur charges. No hard billing cap is implemented.',
 note: 'This request makes no generation calls and incurs no intentional generation charges.'
 });
 });
 // A planning request stores the user's original assets and approved timeline.
 // It cannot submit GPU jobs; the render endpoint is separate and gated.
 router.post('/plan', upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'photo', maxCount: 1 }]), async (req, res) => {
 const audio = req.files?.audio?.[0];
 const photo = req.files?.photo?.[0];
 if (!audio || !photo) return res.status(400).json({ ok: false, error: 'An audio file and original artist photograph are required.' });
 if (audio.size > MAX_AUDIO_BYTES || photo.size > MAX_IMAGE_BYTES) return res.status(413).json({ ok: false, error: 'Media upload exceeds size limit.' });
 if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.mimetype)) return res.status(400).json({ ok: false, error: 'Photo must be JPG, PNG, or WebP.' });
 const prompt = String(req.body?.prompt || '').trim().slice(0, 4000);
 const lyrics = String(req.body?.lyrics || '').slice(0, 12000);
 const title = String(req.body?.title || 'Untitled Song').trim().slice(0, 120);
 const format = req.body?.format === 'landscape' ? 'landscape' : 'vertical';
 if (prompt.length < 12) return res.status(400).json({ ok: false, error: 'Provide the Director with meaningful instructions.' });
 const id = randomUUID();
 const paths = jobPaths(id);
 try {
 await fs.mkdir(paths.folder, { recursive: true });
 await fs.writeFile(path.join(paths.folder, 'song'), audio.buffer, { flag: 'wx', mode: 0o600 });
 await fs.writeFile(path.join(paths.folder, 'reference'), photo.buffer, { flag: 'wx', mode: 0o600 });
 const songSeconds = await probeDuration(path.join(paths.folder, 'song'));
 const videoSeconds = resolveVideoDuration({ songSeconds, selection: 'preview', previewSeconds: 30 });
 // Music analysis is not permitted to make the timeline fail or request paid generation.
 let musicPlan = null;
 try {
 musicPlan = await analyzeMusic(path.join(paths.folder, 'song'), {
 maxAnalysisSeconds: videoSeconds, maxSceneSeconds: 15, minSceneSeconds: 6
 });
 } catch (err) { console.warn('Unified 30s music analysis unavailable:', safeError(err)); }
 const productionPlan = createProductionPlan({
 title, songSeconds: videoSeconds, customerPrompt: prompt, lyrics, musicPlan,
 format, hasReferencePhoto: true, shotSeconds: 15
 });
 const timeline = createGenerationTimeline({ productionPlan, segmentSeconds: 5 });
 // The current RunPod adapter has only been used for five-second tests.
 // Fail closed if a creative boundary would cause an unsupported segment.
 const unsupported = timeline.segments.filter(s => s.durationSeconds !== 5);
 if (unsupported.length && videoSeconds === 30) throw new Error('Rendering plan contains non-five-second segments; adapter review required.');
 await writeJsonAtomic(path.join(paths.folder, 'production-plan.json'), productionPlan);
 await writeJsonAtomic(path.join(paths.folder, 'generation-timeline.json'), timeline);
 await openShotLedger({ storageDirectory, jobId: id, timeline });
 const now = new Date().toISOString();
 const state = {
 id, status: 'planned', phase: 'Awaiting administrator review and separate rendering approval',
 title, prompt, format, lyricsProvided: Boolean(lyrics), photoMime: photo.mimetype,
 songSeconds, videoSeconds, totalSegments: timeline.totalSegments, finishedSegments: 0,
 createdAt: now, updatedAt: now, error: null
 }; await writeJsonAtomic(paths.state, state);
 return res.status(201).json({ ok: true, job: await presentStatus(paths.state), timeline,
 warning: 'Planning only. No video was generated. GPU calls require separate approval.' });
 } catch (error) {
 await fs.rm(paths.folder, { recursive: true, force: true }).catch(() => {});
 return res.status(400).json({ ok: false, error: safeError(error) });
 }
 });
 // Admin prepares six explicit visual-only directions and up to four outfit photos.
 // This endpoint is planning ONLY: no GPU, FAL, or other paid model calls.
 router.post('/jobs/:id/prepare-shots', lookUpload.fields([
 { name: 'look2', maxCount: 1 }, { name: 'look3', maxCount: 1 },
 { name: 'look4', maxCount: 1 }, { name: 'look5', maxCount: 1 }
 ]), async (req, res) => {
 let staging;
 try {
 const paths = jobPaths(req.params.id);
 const state = await readJson(paths.state);
 if (state.status !== 'planned' || active.has(state.id))
 return res.status(409).json({ ok: false, error: 'Job must be planned and inactive.' });
 const approved = req.body?.confirm === 'APPROVE_SIX_VISUAL_SHOTS';
 const directions = JSON.parse(String(req.body?.directions || 'null'));
 const timeline = await readJson(path.join(paths.folder, 'generation-timeline.json'));
 const lookNumbers = [1];
 const lookFiles = [];
 for (const number of [2, 3, 4, 5]) {
 const file = req.files?.[`look${number}`]?.[0];
 if (!file) continue;
 if (!IMAGE_TYPES.has(file.mimetype) || file.size > MAX_IMAGE_BYTES)
 throw new Error(`Look ${number} must be a JPG, PNG or WebP within 12 MB.`);
 lookNumbers.push(number);
 lookFiles.push({ number, buffer: file.buffer, mime: file.mimetype });
 }
 const packageData = createUnifiedWanShotPackage({
 timeline, directions, availableLooks: lookNumbers, approved,
 storyboardReviewed: req.body?.storyboardReviewed === 'true',
 noOnCameraSinging: req.body?.noOnCameraSinging === 'true'
 });
 // Prevent simultaneous or repeated mutation of an already approved package.
 try { await fs.access(path.join(paths.folder, 'approved-shots.json'));
 return res.status(409).json({ ok: false, error: 'Shot package is already approved.' });
 } catch (e) { if (e.code !== 'ENOENT') throw e; }
 staging = path.join(paths.folder, `.looks-${randomUUID()}`);
 await fs.mkdir(staging, { recursive: false, mode: 0o700 });
 const ref = await fs.readFile(path.join(paths.folder, 'reference'));
 const looks = [{ number: 1, mime: state.photoMime, sha256: sha256(ref) }];
 for (const file of lookFiles) {
 const folder = path.join(staging, `look-${file.number}`);
 await fs.mkdir(folder, { recursive: true });
 await fs.writeFile(path.join(folder, 'reference'), file.buffer, { flag: 'wx', mode: 0o600 });
 looks.push({ number: file.number, mime: file.mime, sha256: sha256(file.buffer) });
 }
 const manifest = { ...packageData, looks, timelineSha256: sha256(Buffer.from(JSON.stringify(timeline))),
 approvedAt: new Date().toISOString() };
 // Keep look files and manifest private and make approval tamper-evident.
 await fs.rename(staging, path.join(paths.folder, 'approved-looks'));
 staging = null;
 await writeJsonAtomic(path.join(paths.folder, 'approved-shots.json'), manifest);
 state.shotPackageSha256 = sha256(Buffer.from(JSON.stringify(manifest)));
 state.status = 'prepared';
 state.phase = 'Six approved visual-only Wan shots ready; GPU remains disabled until separately authorized';
 state.updatedAt = new Date().toISOString();
 await writeJsonAtomic(paths.state, state);
 return res.set('Cache-Control', 'no-store').status(201).json({ ok: true,
 job: await presentStatus(paths.state), shots: manifest.shots.map(s => ({
 number: s.number, lookId: s.lookId, promptLength: s.prompt.length, renderer: s.renderer
 })), warning: manifest.warning });
 } catch (error) {
 if (staging) await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
 return res.status(400).json({ ok: false, error: safeError(error) });
 }
 });
 router.get('/jobs/:id', async (req, res) => {
 try { const paths = jobPaths(req.params.id);
 const job = await presentStatus(paths.state);
 const ledger = await getShotLedger({ storageDirectory, jobId: req.params.id });
 return res.set('Cache-Control', 'no-store').json({ ok: true, job, shots: ledger.shots.map(s => ({ number: s.number, status: s.status })) });
 } catch { return res.status(404).json({ ok: false, error: 'Unified job not found.' }); }
 });
 router.get('/jobs/:id/video', async (req, res) => {
 try {
 const paths = jobPaths(req.params.id);
 const state = await readJson(paths.state);
 if (state.status !== 'completed') return res.status(409).json({ error: 'Video has not passed completion checks.' });
 await fs.access(paths.video);
 return res.set('Cache-Control', 'private, no-store').type('mp4').sendFile(paths.video);
 } catch { return res.status(404).json({ error: 'Video unavailable.' }); }
 });
 // Starts ONLY after an explicit administrator request AND three server-side gates.
 // No automatic retry. Failures remain in the ledger for manual investigation.
 router.post('/jobs/:id/render', async (req, res) => {
 if (!ENABLED() || !PROVIDER_ENABLED() || !APPROVED()) {
 return res.status(503).json({ ok: false, error: 'Rendering is disabled until explicitly approved in environment settings.' });
 }
 if (req.body?.confirm !== 'RENDER_30_SECONDS_WITH_GPU_COST') {
 return res.status(400).json({ ok: false, error: 'Explicit administrator cost confirmation is required.' });
 }
 let paths, state, timeline, manifest;
 try {
 paths = jobPaths(req.params.id);
 state = await readJson(paths.state);
 timeline = await readJson(path.join(paths.folder, 'generation-timeline.json'));
 if (state.videoSeconds !== 30 || state.status !== 'prepared') {
 return res.status(409).json({ ok: false, error: 'Approve the six visual-only shot instructions and image references before rendering.' });
 }
 if (timeline.segments.some(s => s.durationSeconds !== 5)) {
 return res.status(422).json({ ok: false, error: 'Rendering adapter requires five-second segments.' });
 }
 manifest = await readJson(path.join(paths.folder, 'approved-shots.json'));
 if (sha256(Buffer.from(JSON.stringify(manifest))) !== state.shotPackageSha256 ||
 sha256(Buffer.from(JSON.stringify(timeline))) !== manifest.timelineSha256 ||
 manifest.mode !== 'approved-visual-only' || manifest.shots?.length !== 6)
 return res.status(422).json({ ok: false, error: 'Shot approval mismatch; rendering blocked.' });
 const preparedLooks = new Map(manifest.looks.map(l => [l.number, l]));
 for (const shot of manifest.shots) {
 if (shot.renderer !== 'wan-ti2v-visual-only' || shot.prompt.length > 2000 ||
 shot.durationSeconds !== 5 || !preparedLooks.has(shot.lookId))
 return res.status(422).json({ ok: false, error: 'Unapproved or unsupported Wan shot; rendering blocked.' });
 }
 // Check all reference hashes BEFORE returning 202 and making paid calls.
 for (const look of manifest.looks) {
 const original = look.number === 1;
 const referenceFile = original ? path.join(paths.folder, 'reference') :
 path.join(paths.folder, 'approved-looks', `look-${look.number}`, 'reference');
 if (sha256(await fs.readFile(referenceFile)) !== look.sha256)
 return res.status(422).json({ ok: false, error: 'Approved look reference has changed; rendering blocked.' });
 }
 if (active.has(state.id)) return res.status(409).json({ ok: false, error: 'Job already running.' });
 const ledger = await getShotLedger({ storageDirectory, jobId: state.id });
 if (ledger.shots.some(s => s.status !== 'pending')) return res.status(409).json({ ok: false, error: 'Job is not in a clean pending state.' });
 active.add(state.id);
 state.status = 'running'; state.phase = 'Starting approved GPU generation'; state.updatedAt = new Date().toISOString();
 await writeJsonAtomic(paths.state, state);
 res.status(202).json({ ok: true, id: state.id, status: 'running',
 warning: 'GPU usage may incur charges. No automatic retries will be attempted.' });
 } catch (error) {
 if (state?.id) active.delete(state.id);
 return res.status(400).json({ ok: false, error: safeError(error) });
 }
 void (async () => {
 try {
 const referenceUrls = new Map();
 for (const look of manifest.looks) {
 const jobDirectory = look.number === 1 ? paths.folder :
 path.join(paths.folder, 'approved-looks', `look-${look.number}`);
 const result = await prepareCharacterReference({ jobDirectory, mimeType: look.mime }); if (!result?.imageUrl?.startsWith('https://')) throw new Error(`Approved look ${look.number} reference unavailable.`);
 referenceUrls.set(look.number, result.imageUrl);
 }
 const clips = [];
 for (const segment of timeline.segments) {
 const shot = manifest.shots[segment.number - 1];
 if (shot.number !== segment.number) throw new Error('Approved shot ordering mismatch.');
 const { attemptId } = await claimShot({ storageDirectory, jobId: state.id, shotNumber: segment.number });
 const clip = path.join(paths.folder, `segment-${String(segment.number).padStart(3, '0')}.mp4`);
 try {
 state.phase = `Generating segment ${segment.number} of ${timeline.totalSegments}`;
 state.updatedAt = new Date().toISOString();
 await writeJsonAtomic(paths.state, state);
 await createRunPodVideo({
 prompt: shot.prompt,
 imageUrl: referenceUrls.get(shot.lookId),
 seconds: segment.durationSeconds,
 format: state.format,
 outputPath: clip
 });
 const info = await fs.stat(clip);
 const actualSeconds = await probeDuration(clip);
 if (info.size < 1024 || actualSeconds < segment.durationSeconds - 0.15) {
 throw new Error(`Segment ${segment.number} output failed media checks.`);
 }
 const fingerprint = sha256(await fs.readFile(clip));
 await recordShotResult({ storageDirectory, jobId: state.id, shotNumber: segment.number, attemptId, status: 'completed', outputSha256: fingerprint });
 clips.push(clip);
 state.finishedSegments = clips.length;
 await writeJsonAtomic(paths.state, state);
 } catch (error) {
 await recordShotResult({ storageDirectory, jobId: state.id, shotNumber: segment.number, attemptId, status: 'review' }).catch(() => {});
 throw error;
 }
 }
 state.phase = 'Editing generated clips and synchronizing original song';
 await writeJsonAtomic(paths.state, state);
 const listFile = path.join(paths.folder, 'segments.txt');
 const list = clips.map(file => `file '${path.basename(file)}'`).join('\n') + '\n';
 await fs.writeFile(listFile, list, { mode: 0o600 });
 const joined = path.join(paths.folder, 'joined.mp4');
 // Re-encode for consistent segment boundaries; concatenation requires compatible inputs.
 await command('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-an', '-vf',
 `scale=${state.format === 'landscape' ? '1280:720' : '720:1280'}:force_original_aspect_ratio=increase,crop=${state.format === 'landscape' ? '1280:720' : '720:1280'},fps=24,format=yuv420p`,
 '-c:v', 'libx264', '-preset', 'veryfast', joined]);
 await command('ffmpeg', ['-y', '-i', joined, '-i', path.join(paths.folder, 'song'),
 '-map', '0:v:0', '-map', '1:a:0', '-t', '30', '-c:v', 'libx264', '-preset', 'veryfast',
 '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', paths.video]);
 const finalSeconds = await probeDuration(paths.video);
 if (Math.abs(finalSeconds - 30) > 0.25) throw new Error(`Final duration mismatch: ${finalSeconds} seconds.`);
 state.status = 'completed'; state.phase = 'MP4 duration passed; artistic, identity, wardrobe and vocal performance reviews NOT passed';
 state.updatedAt = new Date().toISOString();
 await writeJsonAtomic(paths.state, state);
 } catch (error) {
 console.error('Unified 30-second job failed:', state.id, error);
 state.status = 'failed'; state.phase = 'Paused for administrator investigation';
 state.error = safeError(error); state.updatedAt = new Date().toISOString();
 await writeJsonAtomic(paths.state, state).catch(() => {});
 } finally { active.delete(state.id); }
 })();
 });
 app.use('/api/unified-production', router);
 return { route: '/api/unified-production', enabled: ENABLED() };
}
