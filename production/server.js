import {createCreativePreviewRouter} from './cutloopz-creative-preview.mjs';
import {createCutLoopzReviewsRouter} from './cutloopz-reviews-router.mjs';
import {createProductionRouter} from './cutloopz-production-router.mjs';
import {verifyProductionStorage} from './cutloopz-storage-preflight.mjs';
import { createCinemaManifest } from './cutloopz-cinema-engine.js';
import { createProductionPlan, getProductionScenePrompt } from './cutloopz-production-director.js';
import {
 createStoryIntelligencePlan
} from './cutloopz-story-intelligence.js';
import { createCustomerAuthRouter } from './customer-auth.js';
import express from 'express';
import multer from 'multer';
import { fal } from '@fal-ai/client';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { File as NodeFile } from 'node:buffer';
import { createIndependentVideo } from './independent-video-engine.js';
import {
 createRunPodVideo,
 getRunPodEngineStatus
} from './runpod-video-engine.js';
import { createHybridVideo } from './hybrid-video-engine.js';
import { prepareSceneImage } from './scene-preparation-engine.js';
import { createDirectorPlan } from './director-mode-engine.js';
import { checkVideoQuality } from './video-quality-checker.js';
import { cleanOpening } from './cinematic-opening-cleaner.js';
import { createCustomerOrderHistoryRouter } from './customer-order-history.js';
import { createPerformancePilotRouter } from './cutloopz-performance-pilot.js';
import {
 prepareCharacterReference,
 applyCharacterIdentityToPrompt
} from './character-identity-engine.js';
import {
 captureSceneFrames
} from './visual-continuity-engine.js';
import {
 recordEvaluation,
 getRealismStats,
 recommendTechniques
} from './realism-engine.js';
import {
 analyzeMusic
} from './music-intelligence-engine.js';
import { analyzeVideo } from './video-intelligence-engine.js';
import {
 createCinematicEdit
} from './cinematic-editing-engine.js';
const app = express();
// Respect Render HTTPS proxy when setting secure authentication cookies.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const OUT = process.env.OUTPUT_DIR || '/app/outputs';
const JOBS = process.env.JOBS_DIR || path.join(OUT, 'jobs');
const LINKS = path.join(OUT, 'links');
const ORDERS = path.join(OUT, 'customer-orders');
const CUSTOMER_UPLOADS = path.join(ORDERS, 'uploads');
const MODEL = 'minimax/h3-max-turbo/image-to-video';
const TEXT_MODEL = 'minimax/h3-max/text-to-video';
const LIP_MODEL = 'minimax/h3-max/lip-sync/image-to-video';
const MAX_SONG_SECONDS = 360;
const SCENE_SECONDS = 15;
const DOWNLOAD_LINK_DAYS = 7;
const PREVIEW_LINK_MINUTES = 15; const SCENE_PRICE_USD = Number(
 process.env.SCENE_PRICE_USD
);
const TEXT_SCENE_PRICE_USD = Number(
 process.env.TEXT_SCENE_PRICE_USD
);
const LIP_PRICE_PER_SECOND = Number(
 process.env.LIP_PRICE_PER_SECOND_USD
);
const VIDEO_ADMIN_KEY = (
 process.env.VIDEO_ADMIN_KEY || ''
).trim();
// Paid provider generation is disabled by default.
// Only explicitly enable it when we choose to use FAL.
const ENABLE_PAID_GENERATION =
 process.env.ENABLE_PAID_GENERATION === 'true';
const PAYPAL_ENV = process.env.PAYPAL_ENV || 'sandbox';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_BASE_URL = PAYPAL_ENV === 'live'
 ? 'https://api-m.paypal.com'
 : 'https://api-m.sandbox.paypal.com';
const active = new Set();
await Promise.all([
 fs.mkdir(OUT, { recursive: true }),
 fs.mkdir(JOBS, { recursive: true }),
 fs.mkdir(LINKS, { recursive: true }),
 fs.mkdir(ORDERS, { recursive: true }),
 fs.mkdir(CUSTOMER_UPLOADS, { recursive: true })
]);
// Fail closed: a paid full-production job must never start without writable storage.
let fullProductionStorageReady = false;
if (process.env.CUTLOOPZ_FULL_PRODUCTION_ENABLED === 'true') {
 try {
  await verifyProductionStorage({outputDir: OUT, productionDir: path.join(OUT, 'cutloopz-production')});
  fullProductionStorageReady = true;
 } catch (error) {
  console.error('CutLoopz full production disabled: storage preflight failed:', error.message);
 }
}
if (process.env.FAL_KEY) {
 fal.config({
 credentials: process.env.FAL_KEY
 });
}
const upload = multer({
 storage: multer.memoryStorage(),
 limits: {
 fileSize: 30 * 1024 * 1024
 }
});
const customerUpload = multer({
 dest: CUSTOMER_UPLOADS,
 limits: {
 fileSize: 100 * 1024 * 1024,
 files: 6
 }
});
// Search metadata is prepared for launch, but private preview must not be indexed.
// Only an explicitly approved official launch may set CUTLOOPZ_PUBLIC_LAUNCH=true.
app.use((req,res,next)=>{if(process.env.CUTLOOPZ_PUBLIC_LAUNCH!=='true')res.set('X-Robots-Tag','noindex, nofollow, noarchive');next();});
app.use(express.json({
 limit: '256kb'
}));
// Public no-charge creative previews; no administrator key, GPU or billing.
app.use('/api/creative-preview',createCreativePreviewRouter({express,multer}));
const customerAuthRouter = createCustomerAuthRouter({storageDirectory: OUT});
app.use('/api/customer-auth', customerAuthRouter);
const configuredOwnerEmail = String(process.env.CUTLOOPZ_OWNER_EMAIL||'').trim().toLowerCase();
async function isOwnerOrAdmin(req){
  if (isVideoAdmin(req)) return true; // Existing admin tooling remains compatible.
  if (!configuredOwnerEmail || process.env.CUTLOOPZ_PUBLIC_LAUNCH === 'true') return false;
  const user = await customerAuthRouter.authenticatedUser(req);
  return user?.email?.toLowerCase() === configuredOwnerEmail;
}
// Private CutLoopz feedback: signed-in customers submit; only the configured owner can read it.
// The review dashboard does NOT permit access with a customer account or a public profile.
app.use('/api/cutloopz-reviews',createCutLoopzReviewsRouter({
  express,
  outputDirectory:OUT,
  authenticatedUser:req=>customerAuthRouter.authenticatedUser(req),
  isOwner:async req=>{
    if (!configuredOwnerEmail) return false;
    const reviewerOwner = await customerAuthRouter.authenticatedUser(req);
    return reviewerOwner?.email?.trim().toLowerCase()===configuredOwnerEmail;
  }
}));
// Read-only order history and loyalty progress.
app.use(
 '/api/customer-order-history',
 createCustomerOrderHistoryRouter({ storageDirectory: OUT })
);
app.get('/', (req, res) => {
 res.redirect('/customer.html');
});
app.use(express.static('public'));
/*
 * Administrator-only audio-driven performance test, NOT customer lip-sync mode.
 * Both existing paid-generation flag and pilot flag must be enabled;
 * every paid request still requires explicit administrator approval.
 */
app.use('/api/performance-pilot', createPerformancePilotRouter({
  express, multer, fal, outDir: OUT,
  authorize: isVideoAdmin,
  enabled: () => process.env.CUTLOOPZ_PERFORMANCE_PILOT_ENABLED === 'true',
  paidEnabled: () => process.env.ENABLE_PAID_GENERATION === 'true'
}));

// Administrator-only persistent full-song production (disabled unless explicitly enabled).
app.use('/api/cutloopz-production', createProductionRouter({
  express, multer,
  baseDir: path.join(OUT, 'cutloopz-production'),
  authorize: isOwnerOrAdmin,
  origin: `http://127.0.0.1:${PORT}`,
  adminKey: VIDEO_ADMIN_KEY || 'not-configured',
  enabled: () => fullProductionStorageReady && process.env.CUTLOOPZ_FULL_PRODUCTION_ENABLED === 'true' &&
    process.env.CUTLOOPZ_PERFORMANCE_PILOT_ENABLED === 'true' &&
    process.env.ENABLE_PAID_GENERATION === 'true'
}));

// Create a short-lived, bearer-token Cinema review for an assembled local video.
// No new video copy is made; the token points to an existing output file.
app.post('/api/cutloopz-production/local/jobs/:id/share', async(req,res)=>{
  res.set('Cache-Control','no-store');
  const id=req.params.id;
  if(!validId(id))return res.status(400).json({ok:false,error:'Invalid job ID.'});
  const origin=req.get('origin');
  if(origin){try{if(new URL(origin).host!==req.get('host'))return res.status(403).json({ok:false,error:'Invalid request origin.'});}catch{return res.status(403).json({ok:false,error:'Invalid request origin.'});}}
  try{if(!await isOwnerOrAdmin(req))return res.status(403).json({ok:false,error:'Owner sign-in required.'});}
  catch{return res.status(503).json({ok:false,error:'Owner authorization unavailable.'});}
  const video=path.join(OUT,'cutloopz-production','local',id,'final.mp4');
  try{
    const receipt=JSON.parse(await fs.readFile(path.join(OUT,'cutloopz-production','local',id,'assembly.json'),'utf8'));
    if(receipt.jobId!==id||receipt.outputPath!==video)throw Error('Invalid assembly receipt');
    const stat=await fs.stat(video);if(!stat.isFile()||stat.size<1000)throw Error('Incomplete video');
    const token=randomUUID(),expiresAt=new Date(Date.now()+7*86400000).toISOString();
    await fs.writeFile(path.join(LINKS,`${token}.json`),JSON.stringify({kind:'local',id,expiresAt}),{flag:'wx',mode:0o600});
    res.json({ok:true,url:'/watch/'+token,expiresAt});
  }catch{return res.status(404).json({ok:false,error:'Finished video unavailable for sharing.'});}
});

app.get('/api/gpu/status', (req, res) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 ok: false,
 error: 'Administrator password required.'
 });
 }
 res.set('Cache-Control', 'no-store');
 res.json({
 ok: true,
 ...getRunPodEngineStatus(),
 generationEnabled:
 process.env.ZALA_GPU_GENERATION_ENABLED === 'true'
 });
});
 function isVideoAdmin(req) {
 return Boolean(
 VIDEO_ADMIN_KEY &&
 req.get('X-Video-Admin-Key') === VIDEO_ADMIN_KEY
 );
}
function validId(id) {
 return typeof id === 'string' &&
 /^[0-9a-f-]{36}$/i.test(id);
}
function validPrice(value) {
 return Number.isFinite(value) && value > 0;
}
/*
 * CUTLOOPZ GPU VIDEO TEST
 * Administrator only.
 * Disabled until explicitly enabled.
 * Does not use FAL.
 */
app.post('/api/gpu/test-video', async (req, res) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 ok: false,
 error: 'Administrator password required.'
 });
 }
 if (
 process.env.ZALA_GPU_GENERATION_ENABLED !== 'true'
 ) {
 return res.status(503).json({
 ok: false,
 error: 'GPU video generation is disabled.' });
 }
 const { prompt, imageUrl, format } = req.body || {};
 if (
 typeof prompt !== 'string' ||
 !prompt.trim() ||
 prompt.length > 2000
 ) {
 return res.status(400).json({
 ok: false,
 error: 'A valid video prompt is required.'
 });
 }
 if (
 typeof imageUrl !== 'string' ||
 !imageUrl.startsWith('https://')
 ) {
 return res.status(400).json({
 ok: false,
 error: 'An HTTPS artist photo URL is required.'
 });
 }
 if (
 format !== undefined &&
 !['vertical', 'landscape'].includes(format)
 ) {
 return res.status(400).json({
 ok: false,
 error: 'Invalid video format.'
 });
 }
 const id = randomUUID();
 const outputPath = path.join(
 JOBS,
 'gpu-test-' + id,
 'video.mp4'
 );
 try {
 const result = await createRunPodVideo({
 prompt: prompt.trim(),
 imageUrl,
 seconds: 5,
 format: format || 'vertical',
 outputPath
 });
 return res.json({
 ok: true,
 id,
 engine: result.engine,
 durationSeconds: result.seconds,
 message: 'GPU test video generated.'
 });
 } catch (error) {
 console.error('GPU test failed:', error);
 await fs.rm(
 path.dirname(outputPath),
 { recursive: true, force: true }
 ).catch(() => {}); return res.status(500).json({
 ok: false,
 error: 'GPU test failed. Check server logs.'
 });
 }
});
function estimate(seconds, premium, creationType = 'photo') {
 const scenesRequired = premium
 ? 1
 : Math.ceil(seconds / SCENE_SECONDS);
 const model = premium
 ? LIP_MODEL
 : creationType === 'prompt'
 ? TEXT_MODEL
 : MODEL;
 const unitPrice = premium
 ? LIP_PRICE_PER_SECOND
 : creationType === 'prompt'
 ? TEXT_SCENE_PRICE_USD
 : SCENE_PRICE_USD;
 const priceConfigured = validPrice(unitPrice);
 const cost = premium
 ? unitPrice * seconds
 : unitPrice * scenesRequired;
 return {
 songSeconds: seconds,
 sceneSeconds: SCENE_SECONDS,
 scenesRequired,
 model,
 mode: premium ? 'premium' : 'standard',
 creationType,
 estimatedGenerationCostUSD: priceConfigured
 ? Number(cost.toFixed(2))
 : null,
 priceConfigured,
 message:
 'Estimate only. Actual provider billing may differ.'
 };
}
app.post(
 '/api/test-music-intelligence',
 upload.single('audio'),
 async (req, res) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 error: 'Administrator password required.'
 });
 }
 if (!req.file) {
 return res.status(400).json({
 error: 'Please upload an MP3 or WAV song.'
 });
 }
 const testDir = path.join(
 JOBS,
 'music-test-' + randomUUID()
 ); try {
 await fs.mkdir(testDir, {
 recursive: true
 });
 const songFile = path.join(
 testDir,
 'test-song'
 );
 await fs.writeFile(
 songFile,
 req.file.buffer
 );
 const plan = await analyzeMusic(
 songFile,
 {
 maxAnalysisSeconds: 360,
 maxSceneSeconds: 15,
 minSceneSeconds: 6
 }
 );
 res.json({
 ok: true,
 message: 'Music analysis completed.',
 plan
 });
 } catch (error) {
 res.status(500).json({
 error: error.message
 });
 } finally {
 await fs.rm(testDir, {
 recursive: true,
 force: true
 }).catch(() => {});
 }
 }
);
app.post(
 '/api/test-video-intelligence',
 (req, res, next) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 error: 'Administrator password required.'
 });
 }
 next();
 },
 upload.single('video'),
 async (req, res) => {
 if (!req.file) {
 return res.status(400).json({
 error: 'Please upload an MP4 video.'
 });
 }
 const filename = String(
 req.file.originalname || ''
 ).toLowerCase();
 if ( !filename.endsWith('.mp4') ||
 req.file.mimetype !== 'video/mp4'
 ) {
 return res.status(400).json({
 error: 'Only MP4 video uploads are supported.'
 });
 }
 const testDir = path.join(
 JOBS,
 'video-test-' + randomUUID()
 );
 try {
 await fs.mkdir(testDir, {
 recursive: true
 });
 const videoFile = path.join(
 testDir,
 'test-video.mp4'
 );
 await fs.writeFile(
 videoFile,
 req.file.buffer
 );
 const report = await analyzeVideo(videoFile);
 res.json({
 ok: true,
 message: 'Video analysis completed.',
 report
 });
 } catch (error) {
 console.error(
 'Video intelligence test failed:',
 error
 );
 res.status(500).json({
 error: error.message
 });
 } finally {
 await fs.rm(testDir, {
 recursive: true,
 force: true
 }).catch(() => {});
 }
 }
);
app.post(
 '/api/independent-video/create',
 (req, res, next) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 error: 'Administrator password required.'
 });
 }
 next();
 },
 upload.fields([
 { name: 'photo', maxCount: 1 },
 { name: 'audio', maxCount: 1 } ]),
 async (req, res) => {
 const photo = req.files?.photo?.[0];
 const audio = req.files?.audio?.[0];
 const seconds = Number(req.body?.seconds || 15);
 const motion = String(req.body?.motion || 'zoom');
 if (!photo || !audio) {
 return res.status(400).json({
 error: 'Please upload a photo and a song.'
 });
 }
 if (![15, 30, 60].includes(seconds)) {
 return res.status(400).json({
 error: 'Choose 15, 30, or 60 seconds.'
 });
 }
 if (!['zoom', 'zoomOut', 'panLeft', 'panRight'].includes(motion)) {
 return res.status(400).json({
 error: 'Invalid camera motion.'
 });
 }
 const id = randomUUID();
 const dir = path.join(JOBS, 'independent-' + id);
 const photoPath = path.join(dir, 'photo');
 const audioPath = path.join(dir, 'song');
 const outputPath = path.join(dir, 'video.mp4');
 try {
 await fs.mkdir(dir, { recursive: true });
 await fs.writeFile(photoPath, photo.buffer);
 await fs.writeFile(audioPath, audio.buffer);
 const video = await createIndependentVideo({
 photoPath,
 audioPath,
 outputPath,
 seconds,
 motion
 });
 res.json({
 ok: true,
 id,
 url: '/api/independent-video/' + id,
 durationSeconds: video.durationSeconds,
 resolution: video.resolution
 });
 } catch (error) {
 console.error('Independent video failed:', error);
 await fs.rm(dir, {
 recursive: true,
 force: true
 }).catch(() => {});
 res.status(500).json({
 error: 'Video generation failed: ' + error.message
 });
 }
 }
);
app.get('/api/independent-video/:id', async (req, res) => { if (!isVideoAdmin(req)) {
 return res.status(403).json({
 error: 'Administrator password required.'
 });
 }
 const id = String(req.params.id || '');
 if (!/^[0-9a-f-]{36}$/i.test(id)) {
 return res.status(400).send('Invalid video ID.');
 }
 const outputPath = path.join(
 JOBS,
 'independent-' + id,
 'video.mp4'
 );
 try {
 await fs.access(outputPath);
 res.type('mp4');
 res.sendFile(outputPath);
 } catch {
 res.status(404).send('Video not found.');
 }
});
/*
 * CUTLOOPZ STORY INTELLIGENCE
 * Administrator-only Director's Preview.
 * No paid video generation.
 */
app.post('/api/director/story-preview', async (req, res) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 ok: false,
 error: 'Administrator password required.'
 });
 }
 try {
 const {
 title,
 lyrics,
 songSeconds,
 prompt,
 format,
 sceneSeconds,
 visualStyle,
 musicPlan
 } = req.body || {};
 if (
 typeof lyrics !== 'string' ||
 lyrics.length > 12000
 ) {
 return res.status(400).json({
 ok: false,
 error: 'Lyrics must be text under 12,000 characters.'
 });
 }
 const plan = createStoryIntelligencePlan({
 title,
 lyrics,
 songSeconds,
 prompt, format,
 sceneSeconds: sceneSeconds ?? 15,
 visualStyle,
 musicPlan
 });
 res.set('Cache-Control', 'no-store');
 return res.json({
 ok: true,
 message: 'Director storyboard preview created.',
 plan
 });
 } catch (error) {
 return res.status(400).json({
 ok: false,
 error: error.message
 });
 }
});
app.get('/api/estimate', (req, res) => {
 const seconds = Number(req.query.seconds);
 if (
 !Number.isFinite(seconds) ||
 seconds <= 0 ||
 seconds > MAX_SONG_SECONDS
 ) {
 return res.status(400).json({
 error: 'Duration must be between 0 and 360 seconds.'
 });
 }
 const premium = req.query.mode === 'premium';
 const creationType = req.query.creationType === 'prompt'
 ? 'prompt'
 : 'photo';
 if (premium && creationType === 'prompt') {
 return res.status(400).json({
 error: 'Premium Lip-Sync requires an artist photo.'
 });
 }
 res.json({
 ok: true,
 ...estimate(seconds, premium, creationType)
 });
});
function execute(command, args, returnStdout = false) {
 return new Promise((resolve, reject) => {
 const child = spawn(command, args);
 let stdout = '';
 let stderr = '';
 let settled = false;
 child.stdout.on('data', chunk => {
 stdout += chunk.toString();
 });
 child.stderr.on('data', chunk => {
 stderr = ( stderr + chunk.toString()
 ).slice(-3000);
 });
 child.on('error', error => {
 if (!settled) {
 settled = true;
 reject(error);
 }
 });
 child.on('close', code => {
 if (settled) return;
 settled = true;
 if (code === 0) {
 resolve(
 returnStdout
 ? stdout.trim()
 : undefined
 );
 } else {
 reject(new Error(
 stderr || `${command} failed`
 ));
 }
 });
 });
}
async function duration(file) {
 const value = Number(
 await execute('ffprobe', [
 '-v', 'error',
 '-show_entries', 'format=duration',
 '-of',
 'default=noprint_wrappers=1:nokey=1',
 file
 ], true)
 );
 if (
 !Number.isFinite(value) ||
 value <= 0
 ) {
 throw new Error(
 'Could not read media duration.'
 );
 }
 return value;
}
async function exists(file) {
 try {
 await fs.access(file);
 return true;
 } catch {
 return false;
 }
}
const jobDir = id => path.join(JOBS, id);
const statePath = id =>
 path.join(jobDir(id), 'state.json'); async function readState(id) {
 return JSON.parse(
 await fs.readFile(
 statePath(id),
 'utf8'
 )
 );
}
async function saveState(state) {
 state.updatedAt = new Date().toISOString();
 await fs.writeFile(
 statePath(state.id),
 JSON.stringify(state, null, 2)
 );
}
function publicState(state) {
 const {
 id,
 title,
 status,
 phase,
 completedScenes,
 totalScenes,
 songSeconds,
 estimatedGenerationCostUSD,
 error,
 url,
 updatedAt,
 mode,
 creationType,
 musicIntelligence,
 editing
 } = state;
 return {
 id,
 title,
 status,
 phase,
 completedScenes,
 totalScenes,
 songSeconds,
 durationSeconds: songSeconds,
 estimatedGenerationCostUSD,
 error,
 url,
 updatedAt,
 mode,
 creationType,
 musicIntelligence,
 editing
 };
}
async function createCustomerLink(id) {
 const job = await readState(id);
 if (job.status !== 'completed') {
 throw new Error(
 'Video is not completed.'
 );
 } if (!(await exists(
 path.join(OUT, `${id}.mp4`)
 ))) {
 throw new Error(
 'Video file is missing.'
 );
 }
 const token = randomUUID();
 const expiresAt = new Date(
 Date.now() +
 DOWNLOAD_LINK_DAYS * 86400000
 ).toISOString();
 await fs.writeFile(
 path.join(LINKS, `${token}.json`),
 JSON.stringify({
 id,
 expiresAt
 })
 );
 return {
 token,
 expiresAt
 };
}
async function downloadVideo(url, file) {
 const response = await fetch(url);
 if (!response.ok) {
 throw new Error(
 `Could not download generated video (${response.status}).`
 );
 }
 await fs.writeFile(
 file,
 Buffer.from(
 await response.arrayBuffer()
 )
 );
}
async function normalizeVideo(input, output, format) {
 try {
 const result = await cleanOpening(
 input,
 output,
 format
 );
 console.log(
 'Cinematic Opening Cleaner:',
 result.trimmed
 ? `Removed ${Number(result.trimSeconds).toFixed(2)} seconds`
 : 'No unwanted frozen opening detected'
 );
 } catch (error) {
 console.error(
 'Opening cleaner unavailable:',
 error.message
 ); const width = format === 'landscape'
 ? 1280
 : 720;
 const height = format === 'landscape'
 ? 720
 : 1280;
 await execute('ffmpeg', [
 '-y',
 '-i', input,
 '-vf',
 `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
 `crop=${width}:${height},setsar=1,fps=24`,
 '-an',
 '-c:v', 'libx264',
 '-preset', 'veryfast',
 '-pix_fmt', 'yuv420p',
 '-movflags', '+faststart',
 output
 ]);
 }
}
async function addOriginalSong(
 video,
 song,
 seconds,
 final
) {
 await execute('ffmpeg', [
 '-y',
 '-i', video,
 '-i', song,
 '-filter_complex',
 `[0:v:0]tpad=stop_mode=clone:stop_duration=${seconds},` +
 `trim=duration=${seconds},setpts=PTS-STARTPTS[v]`,
 '-map', '[v]',
 '-map', '1:a:0',
 '-t', String(seconds),
 '-c:v', 'libx264',
 '-preset', 'veryfast',
 '-pix_fmt', 'yuv420p',
 '-c:a', 'aac',
 '-b:a', '192k',
 '-movflags', '+faststart',
 final
 ]);
}
/*
 * MUSIC INTELLIGENCE
 *
 * The analysis is cached per job.
 * Analysis errors do not stop video generation.
 */
async function prepareMusicPlan(state, dir) {
 const planFile = path.join(
 dir,
 'music-intelligence-plan.json'
 );
 if (await exists(planFile)) {
 try {
 const plan = JSON.parse( await fs.readFile(
 planFile,
 'utf8'
 )
 );
 if (Array.isArray(plan.scenes)) {
 state.musicIntelligence = {
 status: 'ready',
 bpmEstimate: plan.bpmEstimate,
 detectedAccents: plan.detectedAccents,
 suggestedScenes: plan.scenes.length
 };
 await saveState(state);
 return plan;
 }
 } catch (error) {
 console.error(
 'Saved music plan unavailable:',
 error.message
 );
 }
 }
 state.phase = 'Analyzing song rhythm and energy';
 await saveState(state);
 try {
 const plan = await analyzeMusic(
 path.join(dir, 'song'),
 {
 maxAnalysisSeconds: MAX_SONG_SECONDS,
 maxSceneSeconds: SCENE_SECONDS,
 minSceneSeconds: 6
 }
 );
 await fs.writeFile(
 planFile,
 JSON.stringify(plan, null, 2)
 );
 state.musicIntelligence = {
 status: 'ready',
 bpmEstimate: plan.bpmEstimate,
 detectedAccents: plan.detectedAccents,
 suggestedScenes: plan.scenes.length
 };
 await saveState(state);
 console.log(
 'Music Intelligence ready:',
 state.id
 );
 return plan;
 } catch (error) {
 console.error(
 'Music Intelligence unavailable:',
 error.message
 );
 state.musicIntelligence = {
 status: 'unavailable' };
 await saveState(state);
 return null;
 }
}
const sceneIdeas = [
 'Expressive close-up performance with dramatic studio lighting',
 'Wide concert stage performance with moving spotlights',
 'Nighttime city walk under colorful lights',
 'Emotional performance in a luxurious dark studio',
 'Romantic scene beside a rain-covered window',
 'Full-body performance in a stylish modern interior',
 'Nighttime rooftop with city skyline',
 'Intimate warm-lit performance with expressive eyes',
 'Cinematic driving scene with city light reflections',
 'Dramatic hallway scene walking toward the camera',
 'Concert stage from a different camera angle',
 'Outdoor sunset scene with reflective mood'
];
const cameraShots = [
 'Sweeping aerial drone shot with cinematic depth',
 'Smooth 360-degree orbit around the subject',
 'Intimate close-up with shallow depth of field',
 'Wide-angle cinematic tracking shot',
 'Low-angle dramatic camera movement',
 'Overhead crane shot revealing the environment',
 'Slow cinematic dolly-in toward the subject',
 'Side-tracking shot with layered foreground'
];
function scenePrompt(state, index, musicScene = null) {
 const idea = sceneIdeas[
 (index - 1) % sceneIdeas.length
 ];
 const cameraDirection = cameraShots[
 (index - 1) % cameraShots.length
 ];
 const concept = String(
 state.concept || ''
 );
 const stylizedStyle =
 /\b(anime|animated|animation|cartoon|pixar|claymation|stop.motion|cel.shaded|illustration|comic.book|3d.render|cgi|video.game|stylized|non.photorealistic)\b/i
 .test(concept);
 const realismDirection = stylizedStyle
 ? (
 'VISUAL STYLE: Honor the customer requested ' +
 'artistic or animated style. Preserve character ' +
 'consistency, coherent anatomy, natural motion ' +
 'and professional cinematic composition. '
 )
 : (
 'PHOTOREALISTIC LIVE-ACTION CINEMA: ' +
 'Render human characters as real people ' +
 'photographed with professional cinema cameras. ' +
 'Maintain realism in close-ups, medium shots, ' +
 'wide shots and full-body shots. ' +
 'Preserve natural facial structure, realistic ' +
 'skin texture, believable eyes, natural hair ' +
 'strands and realistic clothing. ' + 'Use physically believable lighting, shadows, ' +
 'depth, perspective and environmental detail. ' +
 'Water, vegetation, buildings and skies must ' +
 'appear naturally photographed. ' +
 'Avoid plastic skin, doll-like faces, cartoon ' +
 'features, distorted anatomy and rubbery motion. '
 );
 const identity = state.creationType === 'prompt'
 ? (
 'CHARACTER CONTINUITY: Keep every recurring ' +
 'character visually consistent throughout ' +
 'the video. '
 )
 : (
 'CRITICAL CHARACTER IDENTITY LOCK: ' +
 'The uploaded reference photograph defines ' +
 'the main character. Preserve the same person, ' +
 'facial structure, eyes, nose, lips, jawline, ' +
 'skin tone, hair color, hairstyle, hair length ' +
 'and body proportions. Never substitute ' +
 'a different actor. Avoid identity drift. '
 );
 const musicDirection = musicScene
 ? (
 `MUSIC DIRECTION: Energy is ${musicScene.intensity}. ` +
 `Energy movement is ${musicScene.energyChange}. ` +
 `Suggested framing: ${musicScene.suggestedShot}. ` +
 'Match the visual performance to the musical mood. '
 )
 : '';
 return (
 `Professional cinematic music video for "${state.title}". ` +
 `Scene ${index} of ${state.totalScenes}. ` +
 identity +
 `PRIMARY DIRECTOR INSTRUCTIONS: ${concept}. ` +
 'Follow the customer requested setting, actions, ' +
 'character behavior, atmosphere and visual style. ' +
 'Do not introduce conflicting locations or actions. ' +
 realismDirection +
 musicDirection +
 'Additional scene inspiration, only if compatible ' +
 `with customer instructions: ${idea}. ` +
 'Camera direction, only when compatible with ' +
 `customer instructions: ${cameraDirection}. ` +
 'Maintain believable gravity, momentum, balance, ' +
 'natural facial expressions, blinking and gestures. ' +
 'Preserve character identity through camera movement. ' +
 'Use professional framing, depth of field, ' +
 'natural lighting and smooth camera movement. ' +
 'Support aerial views when requested. ' +
 'Begin with a clearly composed opening frame. ' +
 'Avoid fade-ins unless requested. ' +
 'Make scenes visually distinct while maintaining ' +
 'story and character continuity. ' +
 'No text, captions, logos, watermarks, ' +
 'music or dialogue.'
 );
}
/*
 * CINEMATIC EDITING
 *
 * Try the new engine first. * If it cannot assemble the footage, use the
 * original working FFmpeg assembly.
 */
async function assembleStandardVideo(
 state,
 dir,
 musicPlan
) {
 const sceneFiles = Array.from(
 { length: state.totalScenes },
 (_, index) => path.join(
 dir,
 `scene-${index + 1}.mp4`
 )
 );
 const songFile = path.join(
 dir,
 'song'
 );
 const finalFile = path.join(
 OUT,
 `${state.id}.mp4`
 );
 state.phase =
 'Editing scenes and synchronizing song';
 await saveState(state);
 try {
 
 let result;
 try {
 result = await createCinematicEdit({
 sceneFiles,
 songFile,
 outputFile: finalFile,
 songSeconds: state.songSeconds,
 format: state.format,
 plan: musicPlan,
 workDirectory: path.join(
 dir,
 'cinematic-edit-work'
 )
 });
 } catch (cinematicError) {
 console.error(
 'Cinematic editor failed; trying Hybrid Engine:',
 cinematicError.message
 );
 await fs.rm(finalFile, {
 force: true
 });
 result = await createHybridVideo({
 clips: sceneFiles,
 songFile,
 outputFile: finalFile,
 songSeconds: state.songSeconds,
 format: state.format,
 workDirectory: path.join( dir,
 'hybrid-edit-work'
 )
 });
 result.scenesUsed = result.clipsUsed;
 result.usedMusicPlan = false;
 }
 state.editing = {
 status: 'completed',
 engine: result.engine,
 scenesUsed: result.scenesUsed,
 usedMusicPlan: result.usedMusicPlan,
 durationSeconds: result.durationSeconds
 };
 await saveState(state);
 return;
 } catch (error) {
 console.error(
 'Cinematic Editing fallback:',
 error.message
 );
 state.editing = {
 status: 'fallback',
 engine: 'Original FFmpeg assembly'
 };
 await saveState(state);
 // Remove any incomplete output from the failed
 // editing attempt before using the fallback.
 await fs.rm(finalFile, {
 force: true
 });
 }
 state.phase =
 'Combining scenes using standard assembly';
 await saveState(state);
 const manifest = sceneFiles.map(
 (_, index) =>
 `file 'scene-${index + 1}.mp4'`
 ).join('\n') + '\n';
 await fs.writeFile(
 path.join(dir, 'scenes.txt'),
 manifest
 );
 await execute('ffmpeg', [
 '-y',
 '-f', 'concat',
 '-safe', '0',
 '-i', path.join(dir, 'scenes.txt'),
 '-c', 'copy',
 path.join(dir, 'joined.mp4')
 ]);
 await addOriginalSong(
 path.join(dir, 'joined.mp4'),
 songFile, state.songSeconds,
 finalFile
 );
}
async function generateStandard(
 state,
 dir,
 imageUrl,
 musicPlan = null
 ){
 const productionPlan = createProductionPlan({
 title: state.title,
 songSeconds: state.songSeconds,
 customerPrompt: state.concept,
 lyrics: state.lyrics || '',
 storyboard: state.storyboard || null,
 musicPlan,
 format: state.format,
 hasReferencePhoto: state.creationType !== 'prompt',
 shotSeconds: SCENE_SECONDS
 });
 for (
 let index = 1;
 index <= state.totalScenes;
 index++
 ) {
 const clip = path.join(
 dir,
 `scene-${index}.mp4`
 );
 if (await exists(clip)) {
 try {
 if ((await duration(clip)) >= 2) {
 state.completedScenes = Math.max(
 state.completedScenes,
 index
 );
 await saveState(state);
 continue;
 }
 } catch {}
 }
 state.phase =
 `Generating scene ${index} of ${state.totalScenes}`;
 await saveState(state);
 const raw = path.join(
 dir,
 `raw-${index}.mp4`
 );
 if (!(await exists(raw))) {
 const promptOnly =
 state.creationType === 'prompt';
 const model = promptOnly
 ? TEXT_MODEL
 : MODEL;
 const musicScene = musicPlan?.scenes?.[index - 1] || null;
 const description = getProductionScenePrompt(
 productionPlan,
 index
);
const input = {
 prompt: applyCharacterIdentityToPrompt(
 description,
 {
 hasReferencePhoto:
 state.creationType !== 'prompt'
 }
 ),
 duration: SCENE_SECONDS,
 resolution: '480P',
 prompt_expansion_mode: 'disabled'
 };
 if (promptOnly) {
 input.aspect_ratio =
 state.format === 'landscape'
 ? '16:9'
 : '9:16';
 } else {
 state.phase =
 `Preparing cinematic image for scene ${index}`;
 await saveState(state);
 const preparedImageFile = path.join(
 dir,
 `prepared-scene-${index}.json`
 );
 let preparedImageUrl = null;
 if (await exists(preparedImageFile)) {
 try {
 const saved = JSON.parse(
 await fs.readFile(
 preparedImageFile,
 'utf8'
 )
 );
 if (
 typeof saved.imageUrl === 'string' &&
 saved.imageUrl.startsWith('https://')
 ) {
 preparedImageUrl = saved.imageUrl;
 }
 } catch (error) {
 console.error(
 'Unable to read prepared image:',
 error.message
 );
 }
 }
 if (!preparedImageUrl) {
 const prepared = await prepareSceneImage({
 referenceImageUrl: imageUrl,
 sceneDescription: description,
 format: state.format
 }); preparedImageUrl = prepared.imageUrl;
 await fs.writeFile(
 preparedImageFile,
 JSON.stringify({
 imageUrl: preparedImageUrl,
 createdAt: new Date().toISOString()
 })
 );
 }
 input.image_url = preparedImageUrl;
 }
 const result = await fal.subscribe(
 model,
 {
 input,
 logs: false
 }
 );
 const url =
 result?.data?.video?.url ||
 result?.video?.url;
 if (!url) {
 throw new Error(
 `Provider returned no video for scene ${index}.`
 );
 }
 await downloadVideo(url, raw);
 }
 state.phase =
 `Preparing scene ${index} of ${state.totalScenes}`;
 await saveState(state);
 const temp = clip + '.partial.mp4';
 await normalizeVideo(
 raw,
 temp,
 state.format
 );
 if ((await duration(temp)) < 2) {
 throw new Error(
 `Generated scene ${index} was too short.`
 );
 }
 await fs.rename(temp, clip);
 state.completedScenes = index;
 await saveState(state);
 try {
 const sceneDuration =
 await duration(clip);
 await captureSceneFrames({
 jobDirectory: dir, sceneNumber: index,
 videoFile: clip,
 durationSeconds: sceneDuration
 });
 console.log(
 'Visual continuity frames captured:',
 state.id,
 'scene',
 index
 );
 } catch (error) {
 console.error(
 'Visual continuity capture failed:',
 error
 );
 }
 await fs.rm(raw, {
 force: true
 });
 }
 await assembleStandardVideo(
 state,
 dir,
 musicPlan
 );
}
async function generatePremium(
 state,
 dir,
 imageUrl
) {
 const raw = path.join(
 dir,
 'premium-raw.mp4'
 );
 if (!(await exists(raw))) {
 state.phase = 'Preparing singing audio';
 await saveState(state);
 const mp3 = path.join(
 dir,
 'lip-sync-song.mp3'
 );
 await execute('ffmpeg', [
 '-y',
 '-i', path.join(dir, 'song'),
 '-vn',
 '-codec:a', 'libmp3lame',
 '-b:a', '192k',
 mp3
 ]);
 const audioBytes = await fs.readFile(mp3);
 const audioUrl = await fal.storage.upload(
 new File(
 [audioBytes],
 'song.mp3',
 { type: 'audio/mpeg' }
 ) );
 state.phase =
 'Generating synchronized singing performance';
 await saveState(state);
 const result = await fal.subscribe(
 LIP_MODEL,
 {
 input: {
 image_url: imageUrl,
 audio_url: audioUrl
 },
 logs: false
 }
 );
 const url =
 result?.data?.video?.url ||
 result?.video?.url;
 if (!url) {
 throw new Error(
 'Lip-sync provider returned no video.'
 );
 }
 await downloadVideo(url, raw);
 }
 state.phase = 'Preparing premium video';
 await saveState(state);
 const clip = path.join(
 dir,
 'premium-normalized.mp4'
 );
 await normalizeVideo(
 raw,
 clip,
 state.format
 );
 await addOriginalSong(
 clip,
 path.join(dir, 'song'),
 state.songSeconds,
 path.join(OUT, `${state.id}.mp4`)
 );
 state.completedScenes = 1;
 await saveState(state);
}
async function generate(id) {
 if (active.has(id)) return;
 active.add(id);
 let state;
 try {
 state = await readState(id); if (!ENABLE_PAID_GENERATION) {
 throw new Error(
 'Paid video generation is disabled. No FAL charges allowed.'
 );
 }
 state.status = 'running';
 state.error = null;
 await saveState(state);
 if (!process.env.FAL_KEY) {
 throw new Error(
 'FAL_KEY is missing in Render settings.'
 );
 }
 const dir = jobDir(id);
 const musicPlan = await prepareMusicPlan(
 state,
 dir
 );
 let imageUrl = null;
 if (state.creationType !== 'prompt') {
 const character = await prepareCharacterReference({
 jobDirectory: dir,
 mimeType:
 state.photoMime || 'image/jpeg'
 });
 imageUrl = character.imageUrl;
 console.log(
 'Character reference prepared:',
 state.id
 );
 }
 if (state.mode === 'premium') {
 await generatePremium(
 
 state,
 dir,
 imageUrl
 );
 } else {
 await generateStandard(
 state,
 dir,
 imageUrl,
 musicPlan
 );
 }
 state.status = 'completed';
 state.phase = 'Video ready';
 state.url = null;
 state.realism = {
 status: 'pending',
 score: null,
 threshold: 90
 }; await saveState(state);
 try {
 const videoFile = path.join(
 OUT,
 `${state.id}.mp4`
 );
 const quality = await checkVideoQuality(
 videoFile
 );
 state.realism = {
 status: 'completed',
 score: quality.score,
 category: 'technical-quality',
 metrics: quality.metrics,
 threshold: 90,
 passedTechnicalThreshold:
 quality.passedTechnicalThreshold,
 evaluatedAt: quality.evaluatedAt
 };
 console.log(
 'Video technical quality score:',
 state.id,
 quality.score
 );
 } catch (error) {
 console.error(
 'Video quality check failed:',
 error
 );
 state.realism = {
 status: 'failed',
 score: null,
 error:
 'Technical quality analysis unavailable'
 };
 }
 await saveState(state).catch(error => {
 console.error(
 'Unable to save quality results:',
 error
 );
 });
 } catch (error) {
 console.error(
 'Video job failed:',
 id,
 error
 );
 if (state) {
 state.status = 'failed';
 state.phase = 'Paused — ready to retry';
 state.error =
 error.message || 'Video creation failed';
 await saveState(state).catch(() => {});
 }
 } finally {
 active.delete(id); }
}
app.post('/api/create', (req, res, next) => {
 if (!ENABLE_PAID_GENERATION) {
 return res.status(503).json({
 error: 'Paid video generation is disabled. Use Independent Video Studio.'
 });
 }
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 error: 'Administrator password required to create videos.'
 });
 }
 next();
}, upload.fields([
 {
 name: 'audio',
 maxCount: 1
 },
 {
 name: 'photo',
 maxCount: 1
 }
]), async (req, res) => {
 let dir;
 if (!ENABLE_PAID_GENERATION) {
 return res.status(503).json({
 error:
 'Paid video generation is disabled. Use Independent Video Studio.'
 });
 }
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 error:
 'Administrator password required to create videos.'
 });
 }
 try {
 const audio = req.files?.audio?.[0];
 const photo = req.files?.photo?.[0];
 const creationType =
 req.body.creationType === 'prompt'
 ? 'prompt'
 : 'photo';
 if (!audio) {
 return res.status(400).json({
 error: 'Please upload your song.'
 });
 }
 if (
 creationType === 'photo' &&
 !photo
 ) {
 return res.status(400).json({
 error: 'Please upload your artist photo.'
 });
 }
 if (
 creationType === 'prompt' &&
 req.body.mode === 'premium' ) {
 return res.status(400).json({
 error:
 'Premium Lip-Sync requires an artist photo.'
 });
 }
 if (
 photo &&
 ![
 'image/jpeg',
 'image/png',
 'image/webp'
 ].includes(photo.mimetype)
 ) {
 return res.status(400).json({
 error:
 'Please upload a JPG, PNG or WebP image.'
 });
 }
 const concept = String(
 req.body.prompt || ''
 ).trim();
 if (!concept) {
 return res.status(400).json({
 error:
 'Please describe your music video.'
 });
 }
 if (!process.env.FAL_KEY) {
 return res.status(500).json({
 error:
 'FAL_KEY is missing in Render settings.'
 });
 }
 const id = randomUUID();
 dir = jobDir(id);
 await fs.mkdir(dir);
 await fs.writeFile(
 path.join(dir, 'song'),
 audio.buffer
 );
 if (creationType === 'photo') {
 await fs.writeFile(
 path.join(dir, 'reference'),
 photo.buffer
 );
 }
 const songSeconds = await duration(
 path.join(dir, 'song')
 );
 if (songSeconds > MAX_SONG_SECONDS) {
 await fs.rm(dir, {
 recursive: true,
 force: true
 }); dir = null;
 return res.status(400).json({
 error:
 'Songs must be 6 minutes or shorter.'
 });
 }
 const mode = [
 'standard',
 'premium',
 'director'
 ].includes(req.body.mode)
 ? req.body.mode
 : 'standard';
 const quote = estimate(
 songSeconds,
 mode === 'premium',
 creationType
 );
 const state = {
 id,
 status: 'queued',
 phase: 'Waiting to start',
 completedScenes: 0,
 totalScenes: quote.scenesRequired,
 songSeconds,
 title: String(
 req.body.title || 'Untitled Song'
 ).slice(0, 120),
 concept: concept.slice(0, 4000),
 format:
 req.body.format === 'landscape'
 ? 'landscape'
 : 'vertical',
 creationType,
 photoMime:
 photo ? photo.mimetype : null,
 mode,
 estimatedGenerationCostUSD:
 quote.estimatedGenerationCostUSD,
 musicIntelligence: {
 status: 'pending'
 },
 editing: {
 status: 'pending'
 },
 error: null,
 url: null,
 updatedAt: new Date().toISOString()
 };
 await saveState(state);
 res.status(202).json({
 ok: true,
 jobId: id,
 ...publicState(state)
 });
 void generate(id);
 } catch (error) {
 console.error(error); if (dir) {
 await fs.rm(dir, {
 recursive: true,
 force: true
 }).catch(() => {});
 }
 if (!res.headersSent) {
 res.status(500).json({
 error:
 error.message ||
 'Could not start video job.'
 });
 }
 }
});
app.get('/api/jobs/:id', async (req, res) => {
 if (!validId(req.params.id)) {
 return res.status(400).json({
 error: 'Invalid job ID.'
 });
 }
 try {
 const state = await readState(
 req.params.id
 );
 if (
 state.status === 'running' &&
 !active.has(state.id)
 ) {
 state.status = 'failed';
 state.error =
 'Server restarted. Resume from saved scenes if available.';
 state.phase = 'Interrupted';
 await saveState(state);
 }
 res.json({
 ok: true,
 ...publicState(state)
 });
 } catch {
 res.status(404).json({
 error:
 'Job not found. Temporary storage may have been cleared.'
 });
 }
});
app.delete('/api/jobs/:id', async (req, res) => {
 const expectedKey =
 process.env.VIDEO_DELETE_KEY;
 const suppliedKey =
 req.get('X-Video-Delete-Key') ||
 req.body?.deleteKey;
 if (
 !expectedKey ||
 suppliedKey !== expectedKey
 ) {
 return res.status(403).json({ error: 'Unauthorized video deletion.'
 });
 }
 const id = req.params.id;
 if (!validId(id)) {
 return res.status(400).json({
 error: 'Invalid job ID.'
 });
 }
 try {
 const job = await readState(id);
 if (
 active.has(id) ||
 job.status !== 'completed'
 ) {
 return res.status(409).json({
 error:
 'Only completed videos can be deleted.'
 });
 }
 await fs.rm(
 path.join(OUT, `${id}.mp4`),
 { force: true }
 );
 await fs.rm(jobDir(id), {
 recursive: true,
 force: true
 });
 res.json({
 ok: true,
 message:
 'Video and job files deleted.'
 });
 } catch {
 res.status(500).json({
 error: 'Could not delete video.'
 });
 }
});
app.post('/api/jobs/:id/resume', async (req, res) => {
 if (!ENABLE_PAID_GENERATION) {
 return res.status(503).json({
 error:
 'Paid video generation is disabled. Resume is unavailable.'
 });
 }
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 error:
 'Administrator password required to resume videos.'
 });
 }
 if (!validId(req.params.id)) {
 return res.status(400).json({
 error: 'Invalid job ID.'
 }); }
 try {
 const state = await readState(
 req.params.id
 );
 if (active.has(state.id)) {
 return res.status(409).json({
 error: 'Job is already running.'
 });
 }
 if (state.status === 'completed') {
 return res.status(409).json({
 error:
 'Video is already completed.'
 });
 }
 const dir = jobDir(state.id);
 const songMissing = !(
 await exists(
 path.join(dir, 'song')
 )
 );
 const photoMissing =
 state.creationType !== 'prompt' &&
 !(await exists(
 path.join(dir, 'reference')
 ));
 if (songMissing || photoMissing) {
 return res.status(410).json({
 error:
 'Uploaded files are no longer available.'
 });
 }
 state.status = 'queued';
 state.error = null;
 state.phase = 'Resuming';
 await saveState(state);
 res.json({
 ok: true,
 ...publicState(state)
 });
 void generate(state.id);
 } catch {
 res.status(404).json({
 error: 'Saved job not found.'
 });
 }
});
app.get('/api/jobs/:id/music-plan', async (req, res) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 error: 'Administrator password required.'
 });
 } if (!validId(req.params.id)) {
 return res.status(400).json({
 error: 'Invalid job ID.'
 });
 }
 try {
 const plan = JSON.parse(
 await fs.readFile(
 path.join(
 jobDir(req.params.id),
 'music-intelligence-plan.json'
 ),
 'utf8'
 )
 );
 res.set(
 'Cache-Control',
 'no-store'
 );
 res.json({
 ok: true,
 plan
 });
 } catch {
 res.status(404).json({
 error:
 'Music analysis is not available for this job.'
 });
 }
});
app.post('/api/jobs/:id/customer-link', async (req, res) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 error: 'Unauthorized.'
 });
 }
 const id = req.params.id;
 if (!validId(id)) {
 return res.status(400).json({
 error: 'Invalid job ID.'
 });
 }
 try {
 const {
 token,
 expiresAt
 } = await createCustomerLink(id);
 res.json({
 ok: true,
 url:
 `${req.protocol}://${req.get('host')}/watch/${token}`,
 expiresAt
 });
 } catch (error) {
 res.status(400).json({
 error: error.message
 }); }
});
app.post('/api/jobs/:id/preview-link', async (req, res) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 error:
 'Administrator password required.'
 });
 }
 const id = req.params.id;
 if (!validId(id)) {
 return res.status(400).json({
 error: 'Invalid job ID.'
 });
 }
 try {
 const job = await readState(id);
 const video = path.join(
 OUT,
 `${id}.mp4`
 );
 if (
 job.status !== 'completed' ||
 !(await exists(video))
 ) {
 return res.status(404).json({
 error:
 'Completed video is unavailable.'
 });
 }
 const token = randomUUID();
 const expiresAt = new Date(
 Date.now() +
 PREVIEW_LINK_MINUTES * 60000
 ).toISOString();
 await fs.writeFile(
 path.join(
 LINKS,
 `preview-${token}.json`
 ),
 JSON.stringify({
 id,
 expiresAt
 })
 );
 res.set(
 'Cache-Control',
 'no-store'
 );
 res.json({
 ok: true,
 url: `/preview/${token}`,
 expiresAt
 });
 } catch { res.status(404).json({
 error: 'Video job not found.'
 });
 }
});
app.get('/preview/:token', async (req, res) => {
 const token = req.params.token;
 if (!validId(token)) {
 return res.status(404).send(
 'Invalid preview link.'
 );
 }
 try {
 const record = JSON.parse(
 await fs.readFile(
 path.join(
 LINKS,
 `preview-${token}.json`
 ),
 'utf8'
 )
 );
 if (!validId(record.id)) {
 return res.status(404).send(
 'Invalid preview.'
 );
 }
 const expires = Date.parse(
 record.expiresAt
 );
 if (
 !Number.isFinite(expires) ||
 Date.now() >= expires
 ) {
 return res.status(410).send(
 'Preview link expired.'
 );
 }
 const video = path.join(OUT, `${record.id}.mp4`);
 if (!(await exists(video))) {
 return res.status(404).send(
 'Video no longer available.'
 );
 }
 res.set(
 'Cache-Control',
 'private, no-store'
 );
 res.type('mp4');
 return res.sendFile(video);
 } catch {
 return res.status(404).send( 'Preview link not found.'
 );
 }
});
// Token-bearing watch URLs open a distraction-free Cinema review page.
// Access remains tied to the same expiring bearer token.
app.get('/watch/:token', (req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!validId(req.params.token))return res.status(404).send('Invalid review link.');
  res.redirect(302,'/cinema.html?share='+encodeURIComponent(req.params.token));
});
app.get('/stream/:token', async (req,res)=>{
  res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');
  if(!validId(req.params.token))return res.status(404).send('Invalid link.');
  try{
    const record=JSON.parse(await fs.readFile(path.join(LINKS,`${req.params.token}.json`),'utf8'));
    if(!validId(record.id))return res.status(404).send('Invalid video.');
    if(!Number.isFinite(Date.parse(record.expiresAt))||Date.now()>=Date.parse(record.expiresAt))
      return res.status(410).send('This review link has expired.');
    const video=record.kind==='local'
      ? path.join(OUT,'cutloopz-production','local',record.id,'final.mp4')
      : path.join(OUT,`${record.id}.mp4`);
    if(!(await exists(video)))return res.status(404).send('Video no longer available.');
    res.type('mp4');return res.sendFile(video); // express handles HTTP Range playback.
  }catch{return res.status(404).send('Review link not found.');}
});
app.get('/download/:token', async (req, res) => {
 res.set('Cache-Control', 'private, no-store');
 const token = req.params.token;
 if (!validId(token)) {
 return res.status(404).send(
 'Invalid download link.'
 );
 } try {
 const record = JSON.parse(
 await fs.readFile(
 path.join(
 LINKS,
 `${token}.json`
 ),
 'utf8'
 )
 );
 if (
 !Number.isFinite(Date.parse(record.expiresAt)) ||
 Date.now() >= Date.parse(record.expiresAt)
 ) {
 return res.status(410).send(
 'This download link has expired.'
 );
 }
 if (!validId(record.id)) {
 return res.status(404).send(
 'Invalid video.'
 );
 }
 const video = record.kind === 'local'
 ? path.join(OUT, 'cutloopz-production', 'local', record.id, 'final.mp4')
 : path.join(OUT, `${record.id}.mp4`);
 if (!(await exists(video))) {
 return res.status(404).send(
 'Video is no longer available.'
 );
 }
 res.download(
 video,
 'CutLoopz-Media-Video.mp4'
 );
 } catch {
 res.status(404).send(
 'Download link not found.'
 );
 }
});
async function getPayPalAccessToken() {
 if (
 !PAYPAL_CLIENT_ID ||
 !PAYPAL_CLIENT_SECRET
 ) {
 throw new Error(
 'PayPal credentials are missing.'
 );
 }
 const credentials = Buffer.from(
 PAYPAL_CLIENT_ID +
 ':' +
 PAYPAL_CLIENT_SECRET
 ).toString('base64');
 const response = await fetch( PAYPAL_BASE_URL + '/v1/oauth2/token',
 {
 method: 'POST',
 headers: {
 Authorization:
 'Basic ' + credentials,
 'Content-Type':
 'application/x-www-form-urlencoded'
 },
 body:
 'grant_type=client_credentials'
 }
 );
 if (!response.ok) {
 throw new Error(
 'PayPal authentication failed.'
 );
 }
 return (
 await response.json()
 ).access_token;
}
app.post('/api/paypal/create-order', async (req, res) => {
 try {
 if (PAYPAL_ENV !== 'sandbox') {
 return res.status(503).json({
 error:
 'Live payments are not enabled yet.'
 });
 }
 const packageType =
 req.body?.packageType;
 if (
 !['standard', 'premium'].includes(
 packageType
 )
 ) {
 return res.status(400).json({
 error:
 'Please select a valid video package.'
 });
 }
 const amount =
 packageType === 'premium'
 ? '99.00'
 : '59.00';
 const accessToken =
 await getPayPalAccessToken();
 const response = await fetch(
 PAYPAL_BASE_URL + '/v2/checkout/orders',
 {
 method: 'POST',
 headers: {
 Authorization:
 'Bearer ' + accessToken,
 'Content-Type':
 'application/json'
 }, body: JSON.stringify({
 intent: 'CAPTURE',
 purchase_units: [{
 description:
 packageType === 'premium'
 ? 'Premium Singing Music Video'
 : 'Standard Cinematic Music Video',
 amount: {
 currency_code: 'USD',
 value: amount
 }
 }]
 })
 }
 );
 const data = await response.json();
 if (!response.ok || !data.id) {
 throw new Error(
 'PayPal could not create the order.'
 );
 }
 res.json({
 ok: true,
 orderID: data.id,
 amount,
 currency: 'USD'
 });
 } catch (error) {
 console.error(
 'PayPal order error:',
 error.message
 );
 res.status(500).json({
 error:
 'Unable to create PayPal test order.'
 });
 }
});
app.post('/api/paypal/capture-order', async (req, res) => {
 try {
 if (PAYPAL_ENV !== 'sandbox') {
 return res.status(503).json({
 error:
 'Live payments are not enabled yet.'
 });
 }
 const orderID =
 req.body?.orderID;
 if (
 typeof orderID !== 'string' ||
 !/^[A-Z0-9]{10,30}$/i.test(orderID)
 ) {
 return res.status(400).json({
 error: 'Invalid PayPal order ID.'
 });
 }
 const accessToken =
 await getPayPalAccessToken(); const response = await fetch(
 PAYPAL_BASE_URL +
 '/v2/checkout/orders/' +
 encodeURIComponent(orderID) +
 '/capture',
 {
 method: 'POST',
 headers: {
 Authorization:
 'Bearer ' + accessToken,
 'Content-Type':
 'application/json',
 'PayPal-Request-Id':
 'capture-' + orderID
 },
 body: '{}'
 }
 );
 const data = await response.json();
 if (
 !response.ok ||
 data.status !== 'COMPLETED'
 ) {
 return res.status(400).json({
 error:
 'Payment could not be confirmed.'
 });
 }
 res.json({
 ok: true,
 orderID: data.id,
 status: data.status
 });
 } catch (error) {
 console.error(
 'PayPal capture error:',
 error.message
 );
 res.status(500).json({
 error:
 'Unable to confirm PayPal test payment.'
 });
 }
});
app.get('/api/customer-orders', async (req, res) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 error:
 'Administrator password required.'
 });
 }
 try {
 const files = await fs.readdir(
 ORDERS
 );
 const orders = [];
 for (const file of files) { if (!file.endsWith('.json')) {
 continue;
 }
 orders.push(
 JSON.parse(
 await fs.readFile(
 path.join(ORDERS, file),
 'utf8'
 )
 )
 );
 }
 orders.sort(
 (a, b) =>
 new Date(b.createdAt) -
 new Date(a.createdAt)
 );
 res.json({
 ok: true,
 orders
 });
 } catch (error) {
 console.error(
 'Customer orders error:',
 error
 );
 res.status(500).json({
 error:
 'Could not load customer orders.'
 });
 }
});
function validCustomerEmail(email) {
 return typeof email === 'string' &&
 email.length <= 254 &&
 /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
app.post('/api/customer-orders', (req, res) => {
 res.status(503).json({
 error:
 'Customer orders are temporarily disabled.'
 });
});
app.get('/api/realism/stats', async (req, res) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 error:
 'Administrator password required.'
 });
 }
 try {
 const stats =
 await getRealismStats();
 res.json({
 ok: true,
 ...stats
 }); } catch (error) {
 console.error(
 'Realism stats error:',
 error
 );
 res.status(500).json({
 error:
 'Unable to load realism statistics.'
 });
 }
});
app.get('/api/realism/recommendations', async (req, res) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({
 error:
 'Administrator password required.'
 });
 }
 try {
 const recommendations =
 await recommendTechniques(5);
 res.json({
 ok: true,
 recommendations
 });
 } catch (error) {
 console.error(
 'Realism recommendations error:',
 error
 );
 res.status(500).json({
 error:
 'Unable to load recommendations.'
 });
 }
});
/*
 * CUTLOOPZ CINEMATIC LAB — isolated admin-only quality test (v1).
 * Real 1080p generative video, not the Independent still-photo engine.
 * Does NOT replace the production Standard or Lip Sync generators.
 * The ledger accounts conservatively for requested tests. Only this Lab
 * route uses this ledger; external provider billing may differ.
 */
const CINEMA_LAB_MODEL_TEXT = 'fal-ai/ltx-2.3/text-to-video/fast';
const CINEMA_LAB_MODEL_IMAGE = 'fal-ai/kling-video/v3/standard/image-to-video';
const CINEMA_LAB_SECONDS = 6;
const CINEMA_LAB_BUDGET_USD = 25;
// Reserve $0.60 per six-second request. Kling v3 Standard image-to-video
// without audio or elements lists at ~$0.084/s (~$0.504 per six seconds),
// while LTX text-to-video may cost less. This is an internal ledger,
// NOT a contractual provider-side spending cap.
const CINEMA_LAB_RESERVE_USD = 0.60;
const CINEMA_LAB_LEDGER_PATH = path.join(OUT, 'cinema-lab-ledger.json');
let cinemaLabBusy = false;
const cinemaLabCompleting = new Set();
function cinemaLabJobDir(id) {
 return path.join(JOBS, 'cinema-lab-' + id);
} async function cinemaLabReadLedger() {
 try {
 const ledger = JSON.parse(await fs.readFile(
 CINEMA_LAB_LEDGER_PATH, 'utf8'
 ));
 if (
 !ledger ||
 !Number.isFinite(ledger.reservedUsd) ||
 ledger.reservedUsd < 0 ||
 !Array.isArray(ledger.requests)
 ) {
 throw new Error('Budget ledger is malformed.');
 }
 return ledger;
 } catch (error) {
 if (error.code === 'ENOENT') {
 return { reservedUsd: 0, requests: [] };
 }
 throw error; // Fail closed; never reset an unreadable ledger.
 }
}
async function cinemaLabWriteLedger(ledger) {
 const temp = CINEMA_LAB_LEDGER_PATH + '.new';
 await fs.writeFile(temp, JSON.stringify(ledger, null, 2));
 await fs.rename(temp, CINEMA_LAB_LEDGER_PATH);
}
async function cinemaLabSaveJob(id, details) {
 const dir = cinemaLabJobDir(id);
 await fs.mkdir(dir, { recursive: true });
 await fs.writeFile(
 path.join(dir, 'state.json'),
 JSON.stringify({ ...details, updatedAt: new Date().toISOString() }, null, 2)
 );
}
async function cinemaLabReadJob(id) {
 return JSON.parse(await fs.readFile(
 path.join(cinemaLabJobDir(id), 'state.json'), 'utf8'
 ));
}
// The provider queue keeps working if the web browser closes. Checking a job
// after a Render restart can resume downloading a completed provider result.
async function cinemaLabSyncJob(id) {
 const current = await cinemaLabReadJob(id);
 if (current.status !== 'processing' || !current.requestId) return current;
 if (cinemaLabCompleting.has(id)) return current;
 cinemaLabCompleting.add(id);
 try {
 const progress = await fal.queue.status(current.model, {
 requestId: current.requestId,
 logs: false
 });
 if (progress.status === 'COMPLETED') {
 await cinemaLabSaveJob(id, {
 ...current, phase: 'Downloading finished 1080p video'
 });
 const result = await fal.queue.result(current.model, {
 requestId: current.requestId
 });
 const url = result?.data?.video?.url || result?.video?.url;
 if (!url || !url.startsWith('https://')) {
 throw new Error('Provider result contained no usable video URL.'); }
 const file = path.join(cinemaLabJobDir(id), 'video.mp4');
 if (!await exists(file)) await downloadVideo(url, file);
 await cinemaLabSaveJob(id, {
 ...current, status: 'completed', phase: '1080p video ready',
 ready: true, error: null
 });
 } else if (progress.status === 'FAILED') {
 await cinemaLabSaveJob(id, {
 ...current, status: 'failed', phase: 'Provider generation failed',
 ready: false, error: 'Provider rejected or failed this generation.'
 });
 }
 return await cinemaLabReadJob(id);
 } catch (error) {
 console.error('Cinematic Lab status recovery:', id, error);
 return {
 ...current,
 syncWarning: 'Unable to check provider status right now; try again.'
 };
 } finally {
 cinemaLabCompleting.delete(id);
 }
}
app.get('/api/cinema-lab/budget', async (req, res) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({ error: 'Administrator password required.' });
 }
 try {
 const ledger = await cinemaLabReadLedger();
 return res.json({
 ok: true,
 ceilingUsd: CINEMA_LAB_BUDGET_USD,
 conservativeReservedUsd: Number(ledger.reservedUsd.toFixed(2)),
 remainingUsd: Number(Math.max(0,
 CINEMA_LAB_BUDGET_USD - ledger.reservedUsd
 ).toFixed(2)),
 reservationPerTestUsd: CINEMA_LAB_RESERVE_USD,
 providerBilling: 'Not accessible; check your fal account for actual charges.',
 otherPaidRoutesIncluded: false,
 enabled: ENABLE_PAID_GENERATION && Boolean(process.env.FAL_KEY)
 });
 } catch (error) {
 console.error('Cinematic Lab ledger error:', error);
 return res.status(503).json({ error: 'Cannot read budget ledger; spending blocked.' });
 }
});
app.post('/api/cinema-lab/start', upload.single('photo'), async (req, res) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({ error: 'Administrator password required.' });
 }
 if (!ENABLE_PAID_GENERATION || !process.env.FAL_KEY) {
 return res.status(503).json({
 error: 'Cinematic Lab requires ENABLE_PAID_GENERATION=true and FAL_KEY.'
 });
 }
 if (cinemaLabBusy) {
 return res.status(409).json({ error: 'One test is already running. Check its status.' });
 }
 const prompt = String(req.body?.prompt || '').trim();
 const format = String(req.body?.format || 'vertical');
 const photo = req.file || null;
 if (prompt.length < 20 || prompt.length > 2500) { return res.status(400).json({ error: 'Use a 20–2500 character cinematic prompt.' });
 }
 if (!['vertical', 'landscape'].includes(format)) {
 return res.status(400).json({ error: 'Choose vertical or landscape.' });
 }
 if (photo && !['image/jpeg', 'image/png', 'image/webp'].includes(photo.mimetype)) {
 return res.status(400).json({ error: 'Photo must be JPEG, PNG, or WebP.' });
 }
 if (photo && photo.size > 10 * 1024 * 1024) {
 return res.status(400).json({ error: 'Photo must be under 10MB.' });
 }
 // Serialize budget reservation and provider submission for this instance.
 cinemaLabBusy = true;
 const id = randomUUID();
 const model = photo ? CINEMA_LAB_MODEL_IMAGE : CINEMA_LAB_MODEL_TEXT;
 try {
 const ledger = await cinemaLabReadLedger();
 if (ledger.reservedUsd + CINEMA_LAB_RESERVE_USD > CINEMA_LAB_BUDGET_USD + 1e-8) {
 cinemaLabBusy = false;
 return res.status(402).json({ error: 'Cinematic Lab $25 budget reached; no request sent.' });
 }
 ledger.reservedUsd = Number((ledger.reservedUsd + CINEMA_LAB_RESERVE_USD).toFixed(2));
 ledger.requests.push({
 id, reservedUsd: CINEMA_LAB_RESERVE_USD, model,
 createdAt: new Date().toISOString()
 });
 await cinemaLabWriteLedger(ledger);
 await cinemaLabSaveJob(id, {
 id, status: 'processing', phase: 'Preparing request',
 model, format, durationSeconds: CINEMA_LAB_SECONDS,
 resolution: '1080p', reserveUsd: CINEMA_LAB_RESERVE_USD,
 error: null, ready: false
 });
 res.status(202).json({
 ok: true, id, status: 'processing',
 conservativeBudgetReserveUsd: CINEMA_LAB_RESERVE_USD,
 warning: 'Actual provider billing may differ from the reserved estimate.'
 });
 } catch (error) {
 cinemaLabBusy = false;
 console.error('Cinematic Lab start failed:', error);
 return res.status(503).json({ error: 'Could not safely reserve test budget. No generation started.' });
 }
 // Return 202 before long-running provider generation to avoid browser timeouts.
 void (async () => {
 try {
 // Kling image-to-video uses start_image_url and a string duration.
 // LTX text-to-video has a different schema. Keep them separate so
 // the selected photo route truly uses the requested motion model.
 const input = photo ? {
 prompt: prompt + ' SINGLE CONTINUOUS REAL-TIME SHOT: no cuts, no stills, no dissolves, no montage. The performer and camera must visibly move naturally throughout all six seconds. Preserve the input person and location.',
 duration: String(CINEMA_LAB_SECONDS),
 generate_audio: false,
 enable_safety_checker: true,
 shot_type: 'customize',
 negative_prompt: 'slideshow, still photograph, frozen pose, crossfade, montage, double exposure, scene cut, jump cut, distorted anatomy, morphing hands, face changes, low quality',
 cfg_scale: 0.65
 } : {
 prompt,
 duration: CINEMA_LAB_SECONDS,
 resolution: '1080p',
 fps: 25,
 generate_audio: false,
 enable_safety_checker: true, aspect_ratio: format === 'landscape' ? '16:9' : '9:16'
 };
 if (photo) {
 await cinemaLabSaveJob(id, {
 id, status: 'processing', phase: 'Uploading reference photograph',
 model, format, durationSeconds: CINEMA_LAB_SECONDS,
 resolution: '1080p', reserveUsd: CINEMA_LAB_RESERVE_USD,
 error: null, ready: false
 });
 const image = new NodeFile(
 [photo.buffer],
 photo.mimetype === 'image/png' ? 'reference.png'
 : photo.mimetype === 'image/webp' ? 'reference.webp' : 'reference.jpg',
 { type: photo.mimetype }
 );
 input.start_image_url = await fal.storage.upload(image);
 // Kling derives output orientation from the starting photograph.
 }
 await cinemaLabSaveJob(id, {
 id, status: 'processing', phase: 'Generating actual 1080p video',
 model, format, durationSeconds: CINEMA_LAB_SECONDS,
 resolution: '1080p', reserveUsd: CINEMA_LAB_RESERVE_USD,
 error: null, ready: false
 });
 const queued = await fal.queue.submit(model, { input });
 const requestId = queued?.request_id || queued?.requestId;
 if (!requestId) {
 throw new Error('Provider did not return a recoverable request ID.');
 }
 await cinemaLabSaveJob(id, {
 id, status: 'processing', phase: 'Queued with provider; rendering 1080p video',
 model, format, durationSeconds: CINEMA_LAB_SECONDS,
 resolution: '1080p', reserveUsd: CINEMA_LAB_RESERVE_USD,
 requestId,
 error: null, ready: false
 });
 console.log('Cinematic Lab queued:', id, requestId);
 } catch (error) {
 console.error('Cinematic Lab failed:', id, error);
 await cinemaLabSaveJob(id, {
 id, status: 'failed', phase: 'Generation failed',
 model, format, durationSeconds: CINEMA_LAB_SECONDS,
 resolution: '1080p', reserveUsd: CINEMA_LAB_RESERVE_USD,
 error: String(error.message || 'Unknown provider error').slice(0, 500),
 ready: false
 }).catch(() => {});
 } finally {
 cinemaLabBusy = false;
 }
 })();
});
app.get('/api/cinema-lab/job/:id', async (req, res) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({ error: 'Administrator password required.' });
 }
 if (!validId(req.params.id)) {
 return res.status(400).json({ error: 'Invalid job ID.' });
 }
 try {
 return res.json({ ok: true, ...(await cinemaLabSyncJob(req.params.id)) });
 } catch {
 return res.status(404).json({ error: 'Cinematic test not found.' });
 }
}); app.get('/api/cinema-lab/video/:id', async (req, res) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({ error: 'Administrator password required.' });
 }
 if (!validId(req.params.id)) {
 return res.status(400).json({ error: 'Invalid job ID.' });
 }
 const file = path.join(cinemaLabJobDir(req.params.id), 'video.mp4');
 if (!await exists(file)) {
 return res.status(404).json({ error: 'Video not ready.' });
 }
 res.set('Cache-Control', 'private, no-store');
 return res.sendFile(file);
});
app.get('/admin-cinema-lab', (req, res) => {
 res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cinematic Lab | CutLoopz Media</title><style>
*{box-sizing:border-box}body{margin:0;background:#0d1422;color:#f7f9ff;font-family:system-ui,-apple-system,sans-serif;line-height:1.55}
main{max-width:760px;margin:auto;padding:22px 18px 70px}header{border-bottom:1px solid #2d4058;padding-bottom:15px;margin-bottom:23px}
h1{font-size:clamp(25px,5vw,35px);margin:7px 0}p{color:#c4d0e2}small,.small{font-size:13px;color:#bbcada}
section{background:#172338;border:1px solid #33445e;border-radius:15px;padding:19px;margin:18px 0}
label{display:block;font-size:15px;font-weight:700;margin:14px 0 6px}input,textarea,select{width:100%;padding:13px 12px;border:1px solid #52637c;border-radius:9px;color:#f7f9ff;background:#0d1727;font:inherit}
textarea{min-height:170px;resize:vertical}input[type=file]{font-size:14px}button{border:0;border-radius:9px;padding:13px 20px;background:#56bbff;color:#061426;font-weight:800;font:inherit;cursor:pointer;margin:8px 0}
button:disabled{opacity:.55;cursor:wait}.secondary{background:#293e59;color:#e8f5ff}video{width:100%;border:3px solid #748fb4;border-radius:10px;background:#000;display:none}
#resultLink{display:none;color:#b0e8ff;font-weight:700}#status{white-space:pre-wrap}strong{color:#fff}.tag{color:#7ce5b7;font-size:13px;font-weight:800}
</style></head><body><main>
<header><div class="tag">CUTLOOPZ MEDIA · ADMIN ONLY</div><h1>Cinematic Lab</h1><p>Real 1080p motion generation. One affordable six-second test before upgrading full-length videos.</p></header>
<section><strong>Cost control</strong><p>Lab ceiling: $25 total. Each six-second test reserves $0.60 conservatively against this limit. Advertised base generation may cost less; actual provider billing is separate.</p><div id="budget" class="small">Enter admin password to view the Lab budget.</div></section>
<section><form id="labForm">
<label for="admin">Administrator password</label><input type="password" id="admin" autocomplete="off" required placeholder="Enter your existing video admin password">
<button type="button" class="secondary" id="check">Check budget</button>
<label for="prompt">Director's prompt</label>
<textarea id="prompt" required maxlength="2500" minlength="20">ONE UNBROKEN six-second cinematic shot in the recording studio shown in the artist reference photo. The singer is beside the mixing console. She releases her left hand from the console, takes two natural steps forward, looks directly into the lens, blinks and gives a confident subtle smile. Her shoulders, arms, legs, and clothing move naturally with believable weight. The camera tracks gently backward while keeping her in frame. Same face, short curly hairstyle, white top, jeans, boots and studio background throughout. Photorealistic motion and cinematic lighting. No cuts, zoom transitions, still poses, montages, or dissolves.</textarea>
<label for="photo">Reference artist photo (optional)</label><input id="photo" type="file" accept="image/png,image/jpeg,image/webp"><div class="small">With a photo, the model attempts to animate that person. Without one, it creates the scene from your prompt. Max photo size 10MB.</div>
<label for="format">Video orientation</label><select id="format"><option value="vertical">Vertical (9:16)</option><option value="landscape">Landscape (16:9)</option></select>
<button id="create" type="submit">Generate 6-second cinematic test</button>
<p class="small">This calls the paid provider once. With an uploaded photo the test uses Kling V3 Standard (audio off). With no photo it uses LTX-2.3 Fast. Keep the prompt consistent with the photo location, outfit and pose: the photo determines the initial scene. No automatic retries, no full-song generation, no background music purchased. The photo's shape determines image-to-video orientation.</p>
</form></section>
<section><strong>Test progress</strong><p id="status" role="status">No test started.</p><label for="recoverId">Recover an earlier test ID</label><input id="recoverId" placeholder="Paste your earlier test ID"><button type="button" class="secondary" id="recover">Recover test</button><video id="player" controls playsinline></video><p><a id="resultLink" download="cutloopz-cinema-test.mp4">Download test MP4</a></p></section>
</main><script>
(function(){
const admin=document.getElementById('admin');const status=document.getElementById('status');const player=document.getElementById('player');const link=document.getElementById('resultLink');const create=document.getElementById('create');
let timer=null;let videoUrl=null;let currentId=null;
function auth(){return {'X-Video-Admin-Key':admin.value.trim()};}
async function responseJson(response){const body=await response.text();let data;try{data=JSON.parse(body);}catch{throw new Error('Unexpected server reply ('+response.status+'): '+body.slice(0,160));}if(!response.ok)throw new Error(data.error||'Request failed.');return data;}
async function budget(){try{const response=await fetch('/api/cinema-lab/budget',{headers:auth()});const data=await responseJson(response);document.getElementById('budget').textContent='Conservatively reserved: $'+data.conservativeReservedUsd.toFixed(2)+' • Remaining: $'+data.remainingUsd.toFixed(2)+' • Per test reservation: $'+data.reservationPerTestUsd.toFixed(2);}catch(error){document.getElementById('budget').textContent=error.message;}}
document.getElementById('check').addEventListener('click',budget);
document.getElementById('recover').addEventListener('click',async function(){const id=document.getElementById('recoverId').value.trim();if(!id){status.textContent='Enter a previous test ID.';return;}currentId=id;if(timer)clearInterval(timer);timer=setInterval(function(){poll(currentId);},4000);await poll(currentId);});
async function showVideo(id){const response=await fetch('/api/cinema-lab/video/'+encodeURIComponent(id),{headers:auth()});if(!response.ok){throw new Error('Video download failed ('+response.status+').');}const blob=await response.blob();if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=URL.createObjectURL(blob);player.src=videoUrl;player.style.display='block';link.href=videoUrl;link.style.display='inline';create.disabled=false;}
async function poll(id){try{const response=await fetch('/api/cinema-lab/job/'+encodeURIComponent(id),{headers:auth()});const data=await responseJson(response);status.textContent=data.phase+'\\nTest ID: '+id;if(data.status==='completed'){clearInterval(timer);timer=null;status.textContent='Completed! Your real 1080p cinematic video is ready.\\nTest ID: '+id;await showVideo(id);await budget();}else if(data.status==='failed'){clearInterval(timer);timer=null;create.disabled=false;status.textContent='Test failed: '+(data.error||'Unknown error')+'\\nTest ID: '+id+'\\nNote: reservation is retained until provider billing is checked.';await budget();}}catch(error){status.textContent='Status check failed: '+error.message+'\\nYou can refresh and keep the test ID.';}}
document.getElementById('labForm').addEventListener('submit',async function(event){event.preventDefault();if(!admin.value.trim()){status.textContent='Enter administrator password.';return;}if(!confirm('Generate ONE real six-second video? This can charge your fal account. Up to $0.60 is reserved against the Lab budget.'))return;create.disabled=true;status.textContent='Starting cinematic test...';player.style.display='none';link.style.display='none';const form=new FormData();form.append('prompt',document.getElementById('prompt').value.trim());form.append('format',document.getElementById('format').value);const photo=document.getElementById('photo').files[0];if(photo)form.append('photo',photo);try{const response=await fetch('/api/cinema-lab/start',{method:'POST',headers:auth(),body:form});const data=await responseJson(response);currentId=data.id;document.getElementById('recoverId').value=currentId;status.textContent='Generation started.\\nTest ID: '+currentId+'\\nWaiting for real motion...';if(timer)clearInterval(timer);timer=setInterval(function(){poll(currentId);},4000);await poll(currentId);}catch(error){create.disabled=false;status.textContent='Could not start: '+error.message;}});
})();
</script></body></html>`);
});
app.listen(PORT, () => {
 console.log(
 `CutLoopz Media running on port ${PORT}`
 );
 console.log(
 'Music Intelligence integration loaded'
 ); console.log(
 'Cinematic Editing integration loaded'

 );
});

import { registerCutLoopzPerformanceLab } from './cutloopz-performance-lab.js';

registerCutLoopzPerformanceLab({ app, isVideoAdmin });


import { registerCutLoopzUnifiedProduction } from './cutloopz-unified-production.js';

registerCutLoopzUnifiedProduction({
  app,
  isVideoAdmin,
  outputDirectory: OUT
});

import { registerCutLoopzGlamourRoutes } from './cutloopz-glamour-routes.js';

registerCutLoopzGlamourRoutes({
  app,
  isVideoAdmin,
  outputDirectory: OUT
});
