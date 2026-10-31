import express from 'express';
import multer from 'multer';
import { fal } from '@fal-ai/client';
import { prepareSceneImage } from './scene-preparation-engine.js';
import { createDirectorPlan } from './director-mode-engine.js';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkVideoQuality } from './video-quality-checker.js';
import { cleanOpening } from './cinematic-opening-cleaner.js';
import {
  prepareCharacterReference,
  applyCharacterIdentityToPrompt
} from './character-identity-engine.js';
import { captureSceneFrames } from './visual-continuity-engine.js';
import {
  recordEvaluation,
  getRealismStats,
  recommendTechniques
} from './realism-engine.js';
const app = express();
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
const SCENE_PRICE_USD = Number(process.env.SCENE_PRICE_USD);
const TEXT_SCENE_PRICE_USD = Number(process.env.TEXT_SCENE_PRICE_USD);
const LIP_PRICE_PER_SECOND = Number(process.env.LIP_PRICE_PER_SECOND_USD);
const VIDEO_ADMIN_KEY = (process.env.VIDEO_ADMIN_KEY || '').trim();
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
if (process.env.FAL_KEY) fal.config({ credentials: process.env.FAL_KEY });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }
});
const customerUpload = multer({
  dest: CUSTOMER_UPLOADS,
  limits: { fileSize: 100 * 1024 * 1024, files: 6 }
});
app.use(express.json({ limit: '16kb' }));
app.use(express.static('public'));

function isVideoAdmin(req) {
  return Boolean(VIDEO_ADMIN_KEY && req.get('X-Video-Admin-Key') === VIDEO_ADMIN_KEY);
}
function validPrice(n) { return Number.isFinite(n) && n > 0; }
function estimate(seconds, premium, creationType = 'photo') {
  const scenesRequired = premium ? 1 : Math.ceil(seconds / SCENE_SECONDS);
  const model = premium ? LIP_MODEL : creationType === 'prompt' ? TEXT_MODEL : MODEL;
  const unitPrice = premium ? LIP_PRICE_PER_SECOND
    : creationType === 'prompt' ? TEXT_SCENE_PRICE_USD : SCENE_PRICE_USD;
  const priceConfigured = validPrice(unitPrice);
  const cost = premium ? unitPrice * seconds : unitPrice * scenesRequired;
  return {
    songSeconds: seconds,
    sceneSeconds: SCENE_SECONDS,
    scenesRequired,
    model,
    mode: premium ? 'premium' : 'standard',
    creationType,
    estimatedGenerationCostUSD: priceConfigured ? Number(cost.toFixed(2)) : null,
    priceConfigured,
    message: 'Estimate only. Actual provider billing may differ.'
  };
}
app.get('/api/estimate', (req, res) => {
  const seconds = Number(req.query.seconds);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SONG_SECONDS) {
    return res.status(400).json({ error: 'Duration must be between 0 and 360 seconds.' });
  }
  const premium = req.query.mode === 'premium';
  const creationType = req.query.creationType === 'prompt' ? 'prompt' : 'photo';
  if (premium && creationType === 'prompt') {
    return res.status(400).json({ error: 'Premium Lip-Sync requires an artist photo.' });
  }
  res.json({ ok: true, ...estimate(seconds, premium, creationType) });
});

function execute(command, args, returnStdout = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let out = '';
    let err = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0
      ? resolve(returnStdout ? out.trim() : undefined)
      : reject(new Error(err.slice(-1600) || `${command} failed`)));
  });⅚
}
async function duration(file) {
  const n = Number(await execute('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file
  ], true));
  if (!Number.isFinite(n) || n <= 0) throw new Error('Could not read media duration.');
  return n;
}
async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}
const jobDir = id => path.join(JOBS, id);
const statePath = id => path.join(jobDir(id), 'state.json');
async function readState(id) { return JSON.parse(await fs.readFile(statePath(id), 'utf8')); }
async function saveState(s) {
  s.updatedAt = new Date().toISOString();
  await fs.writeFile(statePath(s.id), JSON.stringify(s, null, 2));
}
function publicState(s) {
  const { id, status, phase, completedScenes, totalScenes,
    estimatedGenerationCostUSD, error, url, updatedAt, mode, creationType } = s;
  return { id, status, phase, completedScenes, totalScenes,
    estimatedGenerationCostUSD, error, url, updatedAt, mode, creationType };
}
async function createCustomerLink(id) {
  const job = await readState(id);
  if (job.status !== 'completed') throw new Error('Video is not completed.');
  if (!(await exists(path.join(OUT, `${id}.mp4`)))) throw new Error('Video file is missing.');
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + DOWNLOAD_LINK_DAYS * 86400000).toISOString();
  await fs.writeFile(path.join(LINKS, `${token}.json`), JSON.stringify({ id, expiresAt }));
  return { token, expiresAt };
}
async function downloadVideo(url, file) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download generated video (${response.status}).`);
  await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
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
        ? `Removed ${result.trimSeconds.toFixed(2)} seconds`
        : 'No unwanted frozen opening detected'
    );
  } catch (error) {
    console.error(
      'Opening cleaner unavailable; using normal processing:',
      error
    );

    const width = format === 'landscape' ? 1280 : 720;
    const height = format === 'landscape' ? 720 : 1280;

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

async function addOriginalSong(video, song, seconds, final) {
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


function scenePrompt(s, i) {
  const idea = sceneIdeas[(i - 1) % sceneIdeas.length];
  const cameraDirection =
    cameraShots[(i - 1) % cameraShots.length];

  const concept = String(s.concept || '');

  // Explicit artistic styles remain available to customers.
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
        'Render all human characters as real people ' +
        'photographed with professional cinema cameras, ' +
        'not computer-generated or illustrated figures. ' +
        'Maintain convincing realism in close-ups, ' +
        'medium shots, wide shots and full-body shots. ' +
        'Preserve natural facial structure, realistic ' +
        'skin texture, subtle pores, believable eyes, ' +
        'natural hair strands and realistic clothing. ' +
        'In distant shots, retain realistic human ' +
        'proportions, posture, silhouette and movement. ' +
        'Use physically believable lighting, shadows, ' +
        'depth, perspective and environmental detail. ' +
        'Avoid plastic skin, doll-like faces, cartoon ' +
        'features, artificial body shapes, stiff walking, ' +
        'rubbery motion, excessive smoothing and ' +
        'animation-like rendering. ' +
        'Keep the photographic appearance consistent ' +
        'as the camera moves closer or farther away. '
      );

  const identity = s.creationType === 'prompt'
    ? (
        'CHARACTER CONTINUITY: Keep every recurring ' +
        'character visually consistent throughout ' +
        'the scene and across subsequent scenes. '
      )
    : (
        'CRITICAL CHARACTER IDENTITY LOCK: ' +
        'The uploaded reference photograph defines ' +
        'the main character. Preserve the same ' +
        'recognizable person, facial structure, eyes, ' +
        'nose, lips, jawline, skin tone, hair color, ' +
        'hairstyle, hair length and body proportions. ' +
        'Never substitute a different actor. ' +
        'Maintain identity through camera movements, ' +
        'lighting changes and scene transitions. ' +
        'Clothing may change only when requested. ' +
        'Avoid face morphing and identity drift. '
      );

  return (
    `Professional cinematic music video for "${s.title}". ` +
    `Scene ${i} of ${s.totalScenes}. ` +
    `${identity}` +
    `PRIMARY DIRECTOR INSTRUCTIONS: ${concept}. ` +
    `Follow the customer's requested setting, actions, ` +
    `character behavior, atmosphere and visual style. ` +
    `Do not introduce conflicting locations or actions. ` +
    `${realismDirection}` +
    `Additional scene inspiration, only if compatible ` +
    `with the customer's instructions: ${idea}. ` +
    `Camera direction, when compatible with the ` +
    `customer's request: ${cameraDirection}. ` +
    `ACTION AND MOVEMENT: Follow requested actions ` +
    `in their described order. Maintain believable ` +
    `gravity, momentum, balance and physical contact. ` +
    `HUMAN PERFORMANCE: Use expressive faces, natural ` +
    `blinking, breathing, eye movement, gestures, ` +
    `emotion and believable body language. ` +
    `CHARACTER CONSISTENCY: Preserve facial features, ` +
    `hairstyle, skin tone, body proportions and wardrobe. ` +
    `Avoid distorted anatomy, extra limbs and sudden ` +
    `changes in appearance. ` +
    `CINEMATIC CAMERA: Use professional framing, ` +
    `natural depth of field and smooth camera movement. ` +
    `Support aerial views, tracking shots, close-ups ` +
    `and dynamic perspectives when requested. ` +
    `Begin with a clearly composed opening frame. ` +
    `Avoid fade-ins unless requested. ` +
    `Make scenes visually distinct while maintaining ` +
    `character and story continuity. ` +
    `No text, captions, logos, watermarks, music ` +
    `or dialogue.`
  );
}

  const idea = sceneIdeas[(i - 1) % sceneIdeas.length];
  const cameraDirection = cameraShots[(i - 1) % cameraShots.length];

  const identity = s.creationType === 'prompt'
    ? `CHARACTER CONTINUITY: Keep every recurring character
       visually consistent throughout the scene and across
       subsequent scenes.`
    : `CRITICAL CHARACTER IDENTITY LOCK:
       The uploaded reference photograph is the authoritative
       visual identity of the main character.
       Reproduce the same recognizable person throughout
       every frame of this video.
       Preserve facial structure, eyes, nose, lips, jawline,
       skin tone, hair color, hairstyle, hair length and
       body proportions.
       Do not invent a replacement actor.
       Do not redesign the character when the camera moves,
       the lighting changes, or the location changes.
       The character seen in the opening frame must be
       the exact same character in every subsequent frame.
       Maintain identity during camera pans, zooms,
       close-ups, rotations and scene transitions.
       Clothing may change only when requested.
       No face morphing, hairstyle changes or identity drift.`;

  return (
    `Professional cinematic music video for "${s.title}". ` +
    `Scene ${i} of ${s.totalScenes}. ` +
    `${identity} ` +
    `PRIMARY DIRECTOR INSTRUCTIONS: ${s.concept}. ` +
    `Follow the customer's requested setting, actions, character ` +
    `behavior, atmosphere and visual style. ` +
    `Do not introduce conflicting locations or actions. ` +
    `Additional scene inspiration, only if compatible: ${idea}. ` +
    `Camera direction: ${cameraDirection}. ` +
    `ACTION SEQUENCE AND PHYSICAL REALISM: Follow requested ` +
    `actions in their described order. Show natural preparation, ` +
    `movement, reaction and recovery. Maintain realistic gravity, ` +
    `momentum, balance, posture and physical interactions. ` +
    `NATURAL HUMAN PERFORMANCE: Show believable facial ` +
    `expressions, breathing, blinking, eye movement, gestures, ` +
    `emotions and body language. Avoid robotic movements. ` +
    `CHARACTER CONTINUITY: Preserve consistent facial features, ` +
    `skin tone, hairstyle, body proportions and clothing. ` +
    `Avoid distorted anatomy, extra limbs and sudden changes. ` +
    `CINEMATIC DIRECTION: Use professional composition, lighting, ` +
    `camera movement and visual storytelling. Support aerial ` +
    `views, sweeping movements, close-ups and dynamic perspectives ` +
    `when requested. Support realistic, fantasy, science fiction, ` +
    `anime and 3D animation environments. ` +
    `Begin with a clearly composed opening frame. ` +
    `Avoid fade-ins unless requested. ` +
    `Make each scene visually distinct while preserving continuity. ` +
    `No text, captions, logos, watermarks, music or dialogue.`
  );
}


async function generateStandard(s, dir, imageUrl) {
  for (let i = 1; i <= s.totalScenes; i++) {
    const clip = path.join(dir, `scene-${i}.mp4`);
    if (await exists(clip)) {
      try {
        if ((await duration(clip)) >= 2) {
          s.completedScenes = Math.max(s.completedScenes, i);
          await saveState(s);
          continue;
        }
      } catch {}
    }
    s.phase = `Generating scene ${i} of ${s.totalScenes}`;
    await saveState(s);
    const raw = path.join(dir, `raw-${i}.mp4`);
    if (!(await exists(raw))) {
      const promptOnly = s.creationType === 'prompt';
      const model = promptOnly ? TEXT_MODEL : MODEL;
      const input = {
        prompt: applyCharacterIdentityToPrompt(
  scenePrompt(s, i),
  { hasReferencePhoto: s.creationType !== 'prompt' }
),
        duration: SCENE_SECONDS,
        resolution: '480P',
        prompt_expansion_mode: 'disabled'
      };
      
if (promptOnly) {
  input.aspect_ratio =
    s.format === 'landscape' ? '16:9' : '9:16';
} else {
  s.phase = `Preparing cinematic image for scene ${i}`;
  await saveState(s);

  const preparedImageFile = path.join(
    dir,
    `prepared-scene-${i}.json`
  );

  let preparedImageUrl = null;

  if (await exists(preparedImageFile)) {
    try {
      const saved = JSON.parse(
        await fs.readFile(preparedImageFile, 'utf8')
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
        error
      );
    }
  }

  if (!preparedImageUrl) {
    const prepared = await prepareSceneImage({
      referenceImageUrl: imageUrl,
      sceneDescription: scenePrompt(s, i),
      format: s.format
    });

    preparedImageUrl = prepared.imageUrl;

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

      const result = await fal.subscribe(model, { input, logs: false });
      const url = result?.data?.video?.url || result?.video?.url;
      if (!url) throw new Error(`Provider returned no video for scene ${i}.`);
      await downloadVideo(url, raw);
    }
    s.phase = `Preparing scene ${i} of ${s.totalScenes}`;
    await saveState(s);
    const temp = clip + '.partial.mp4';
    await normalizeVideo(raw, temp, s.format);
    if ((await duration(temp)) < 2) throw new Error(`Generated scene ${i} was too short.`);
    
await fs.rename(temp, clip);
s.completedScenes = i;
await saveState(s);

// VISUAL CONTINUITY ENGINE
// Capture sample frames without interrupting video creation.
try {
  const sceneDuration = await duration(clip);

  await captureSceneFrames({
    jobDirectory: dir,
    sceneNumber: i,
    videoFile: clip,
    durationSeconds: sceneDuration
  });

  console.log(
    'Visual continuity frames captured:',
    s.id,
    'scene',
    i
  );
} catch (continuityError) {
  console.error(
    'Visual continuity capture failed:',
    continuityError
  );
}

await fs.rm(raw, { force: true });

  }
  s.phase = 'Combining scenes and adding song audio';
  await saveState(s);
  const list = Array.from({ length: s.totalScenes }, (_, n) =>
    `file 'scene-${n + 1}.mp4'`).join('\n') + '\n';
  await fs.writeFile(path.join(dir, 'scenes.txt'), list);
  await execute('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'scenes.txt'),
    '-c', 'copy', path.join(dir, 'joined.mp4')
  ]);
  await addOriginalSong(
    path.join(dir, 'joined.mp4'), path.join(dir, 'song'),
    s.songSeconds, path.join(OUT, `${s.id}.mp4`)
  );
}

async function generatePremium(s, dir, imageUrl) {
  const raw = path.join(dir, 'premium-raw.mp4');
  if (!(await exists(raw))) {
    s.phase = 'Preparing singing audio';
    await saveState(s);
    const mp3 = path.join(dir, 'lip-sync-song.mp3');
    await execute('ffmpeg', [
      '-y', '-i', path.join(dir, 'song'), '-vn',
      '-codec:a', 'libmp3lame', '-b:a', '192k', mp3
    ]);
    const audioBytes = await fs.readFile(mp3);
    const audioUrl = await fal.storage.upload(
      new File([audioBytes], 'song.mp3', { type: 'audio/mpeg' })
    );
    s.phase = 'Generating synchronized singing performance';
    await saveState(s);
    const result = await fal.subscribe(LIP_MODEL, {
      input: { image_url: imageUrl, audio_url: audioUrl },
      logs: false
    });
    const url = result?.data?.video?.url || result?.video?.url;
    if (!url) throw new Error('Lip-sync provider returned no video.');
    await downloadVideo(url, raw);
  }
  s.phase = 'Preparing premium video';
  await saveState(s);
  const clip = path.join(dir, 'premium-normalized.mp4');
  await normalizeVideo(raw, clip, s.format);
  await addOriginalSong(
    clip, path.join(dir, 'song'), s.songSeconds,
    path.join(OUT, `${s.id}.mp4`)
  );
  s.completedScenes = 1;
  await saveState(s);
}



async function generate(id) {
  if (active.has(id)) return;
  active.add(id);

  let s;

  try {
    s = await readState(id);
    s.status = 'running';
    s.error = null;
    await saveState(s);

    if (!process.env.FAL_KEY) {
      throw new Error('FAL_KEY is missing in Render settings.');
    }

    
const dir = jobDir(id);
let imageUrl = null;

if (s.creationType !== 'prompt') {
  const character = await prepareCharacterReference({
    jobDirectory: dir,
    mimeType: s.photoMime || 'image/jpeg'
  });

  imageUrl = character.imageUrl;

  console.log(
    'Character reference prepared for job:',
    s.id
  );
}

    

    if (s.mode === 'premium') {
      await generatePremium(s, dir, imageUrl);
    } else {
      await generateStandard(s, dir, imageUrl);
    }

    s.status = 'completed';
    s.phase = 'Video ready';
    s.url = null;

    
    // REALISM ENGINE — FREE AUTOMATIC QUALITY CHECK
    s.realism = {
      status: 'pending',
      score: null,
      threshold: 90
    };
    await saveState(s);

    try {
      const videoFile = path.join(OUT, `${s.id}.mp4`);
      const quality = await checkVideoQuality(videoFile);

      s.realism = {
        status: 'completed',
        score: quality.score,
        category: 'technical-quality',
        metrics: quality.metrics,
        threshold: 90,
        passedTechnicalThreshold: quality.passedTechnicalThreshold,
        evaluatedAt: quality.evaluatedAt
      };

      console.log(
        'Video technical quality score:',
        s.id,
        quality.score
      );
    } catch (qualityError) {
      console.error('Video quality check failed:', qualityError);

      s.realism = {
        status: 'failed',
        score: null,
        error: 'Technical quality analysis unavailable'
      };
    }

    await saveState(s).catch(error => {
      console.error('Unable to save quality results:', error);
    });

  } catch (e) {
    console.error('Video job failed:', id, e);

    if (s) {
      s.status = 'failed';
      s.phase = 'Paused — ready to retry';
      s.error = e.message || 'Video creation failed';
      await saveState(s).catch(() => {});
    }

  } finally {
    active.delete(id);
  }
}


app.post('/api/create', upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'photo', maxCount: 1 }
]), async (req, res) => {
  let dir;
  if (!isVideoAdmin(req)) {
    return res.status(403).json({ error: 'Administrator password required to create videos.' });
  }
  try {
    const audio = req.files?.audio?.[0];
    const photo = req.files?.photo?.[0];
    const creationType = req.body.creationType === 'prompt' ? 'prompt' : 'photo';
    if (!audio) return res.status(400).json({ error: 'Please upload your song.' });
    if (creationType === 'photo' && !photo) {
      return res.status(400).json({ error: 'Please upload your artist photo.' });
    }
    if (creationType === 'prompt' && req.body.mode === 'premium') {
      return res.status(400).json({ error: 'Premium Lip-Sync requires an artist photo.' });
    }
    if (photo && !['image/jpeg', 'image/png', 'image/webp'].includes(photo.mimetype)) {
      return res.status(400).json({ error: 'Please upload a JPG, PNG or WebP image.' });
    }
    const concept = String(req.body.prompt || '').trim();
    if (!concept) return res.status(400).json({ error: 'Please describe your music video.' });
    if (!process.env.FAL_KEY) {
      return res.status(500).json({ error: 'FAL_KEY is missing in Render settings.' });
    }
    const id = randomUUID();
    dir = jobDir(id);
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, 'song'), audio.buffer);
    if (creationType === 'photo') {
      await fs.writeFile(path.join(dir, 'reference'), photo.buffer);
    }
    const songSeconds = await duration(path.join(dir, 'song'));
    if (songSeconds > MAX_SONG_SECONDS) {
      await fs.rm(dir, { recursive: true, force: true });
      dir = null;
      return res.status(400).json({ error: 'Songs must be 6 minutes or shorter.' });
    }
    const mode = ['standard', 'premium', 'director'].includes(req.body.mode)
  ? req.body.mode
  : 'standard';
    const quote = estimate(songSeconds, mode === 'premium', creationType);
    const s = {
      id, status: 'queued', phase: 'Waiting to start',
      completedScenes: 0, totalScenes: quote.scenesRequired,
      songSeconds,
      title: String(req.body.title || 'Untitled Song').slice(0, 120),
      concept: concept.slice(0, 4000),
      format: req.body.format === 'landscape' ? 'landscape' : 'vertical',
      creationType, photoMime: photo ? photo.mimetype : null, mode,
      estimatedGenerationCostUSD: quote.estimatedGenerationCostUSD,
      error: null, url: null, updatedAt: new Date().toISOString()
    };
    await saveState(s);
    res.status(202).json({ ok: true, jobId: id, ...publicState(s) });
    void generate(id);
  } catch (e) {
    console.error(e);
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    if (!res.headersSent) {
      res.status(500).json({ error: e.message || 'Could not start video job.' });
    }
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid job ID.' });
  }
  try {
    const s = await readState(req.params.id);
    if (s.status === 'running' && !active.has(s.id)) {
      s.status = 'failed';
      s.error = 'Server restarted. Resume from saved scenes if available.';
      s.phase = 'Interrupted';
      await saveState(s);
    }
    res.json({ ok: true, ...publicState(s) });
  } catch {
    res.status(404).json({ error: 'Job not found. Temporary storage may have been cleared.' });
  }
});
app.delete('/api/jobs/:id', async (req, res) => {
  const expectedKey = process.env.VIDEO_DELETE_KEY;
  const suppliedKey = req.get('X-Video-Delete-Key') || req.body?.deleteKey;
  if (!expectedKey || suppliedKey !== expectedKey) {
    return res.status(403).json({ error: 'Unauthorized video deletion.' });
  }
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid job ID.' });
  }
  try {
    const job = await readState(id);
    if (active.has(id) || job.status !== 'completed') {
      return res.status(409).json({ error: 'Only completed videos can be deleted.' });
    }
    await fs.rm(path.join(OUT, `${id}.mp4`), { force: true });
    await fs.rm(jobDir(id), { recursive: true, force: true });
    res.json({ ok: true, message: 'Video and job files deleted.' });
  } catch {
    res.status(500).json({ error: 'Could not delete video.' });
  }
});
app.post('/api/jobs/:id/resume', async (req, res) => {
  if (!isVideoAdmin(req)) {
    return res.status(403).json({ error: 'Administrator password required to resume videos.' });
  }
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid job ID.' });
  }
  try {
    const s = await readState(req.params.id);
    if (active.has(s.id)) return res.status(409).json({ error: 'Job is already running.' });
    if (s.status === 'completed') {
      return res.status(409).json({ error: 'Video is already completed.' });
    }
    const songMissing = !(await exists(path.join(jobDir(s.id), 'song')));
    const photoMissing = s.creationType !== 'prompt' &&
      !(await exists(path.join(jobDir(s.id), 'reference')));
    if (songMissing || photoMissing) {
      return res.status(410).json({ error: 'Uploaded files are no longer available.' });
    }
    s.status = 'queued';
    s.error = null;
    s.phase = 'Resuming';
    await saveState(s);
    res.json({ ok: true, ...publicState(s) });
    void generate(s.id);
  } catch {
    res.status(404).json({ error: 'Saved job not found.' });
  }
});
app.post('/api/jobs/:id/customer-link', async (req, res) => {
  if (!isVideoAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid job ID.' });
  }
  try {
    const { token, expiresAt } = await createCustomerLink(id);
    res.json({ ok: true, url: `${req.protocol}://${req.get('host')}/watch/${token}`, expiresAt });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
// Administrator-only, short-lived playback access for My Videos.
// Tokens are stored on the persistent disk and expire after 15 minutes.
const PREVIEW_LINK_MINUTES = 15;

app.post('/api/jobs/:id/preview-link', async (req, res) => {
  if (!isVideoAdmin(req)) {
    return res.status(403).json({ error: 'Administrator password required.' });
  }
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid job ID.' });
  }
  try {
    const job = await readState(id);
    const video = path.join(OUT, `${id}.mp4`);
    if (job.status !== 'completed' || !(await exists(video))) {
      return res.status(404).json({ error: 'Completed video is unavailable.' });
    }
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + PREVIEW_LINK_MINUTES * 60000).toISOString();
    await fs.writeFile(
      path.join(LINKS, `preview-${token}.json`),
      JSON.stringify({ id, expiresAt })
    );
    res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      url: `/preview/${token}`,
      expiresAt
    });
  } catch {
    res.status(404).json({ error: 'Video job not found.' });
  }
});

// Express sendFile handles HTTP Range requests for video seeking.
app.get('/preview/:token', async (req, res) => {
  const token = req.params.token;
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return res.status(404).send('Invalid preview link.');
  }
  try {
    const record = JSON.parse(await fs.readFile(
      path.join(LINKS, `preview-${token}.json`), 'utf8'
    ));
    if (!record || !/^[0-9a-f-]{36}$/i.test(record.id)) {
      return res.status(404).send('Invalid preview.');
    }
    if (!Number.isFinite(Date.parse(record.expiresAt)) ||
        Date.now() >= Date.parse(record.expiresAt)) {
      return res.status(410).send('Preview link expired.');
    }
    const video = path.join(OUT, `${record.id}.mp4`);
    if (!(await exists(video))) {
      return res.status(404).send('Video no longer available.');
    }
    res.set('Cache-Control', 'private, no-store');
    res.type('mp4');
    return res.sendFile(video);
  } catch {
    return res.status(404).send('Preview link not found.');
  }
});

app.get('/watch/:token', (req, res) => {
  const token = req.params.token;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return res.status(404).send('Invalid link.');
  const downloadUrl = '/download/' + token;
  res.type('html').send(`
    <!DOCTYPE html><html lang="en"><head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Zala QI's World - Your Video</title>
    <style>
      body{background:#10101b;color:white;font-family:Arial,sans-serif;text-align:center;padding:30px 15px}
      a{display:inline-block;background:#b45cff;color:white;padding:16px 24px;border-radius:10px;text-decoration:none;font-weight:bold;margin:12px}
    </style></head><body>
    <h1>Zala QI's World</h1><h2>Your Music Video Is Ready!</h2>
    <p>Your private link expires after 7 days.</p>
    <a href="${downloadUrl}">⬇ Download Your Video</a>
    </body></html>
  `);
});
app.get('/download/:token', async (req, res) => {
  const token = req.params.token;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return res.status(404).send('Invalid download link.');
  try {
    const record = JSON.parse(await fs.readFile(path.join(LINKS, `${token}.json`), 'utf8'));
    if (Date.now() >= Date.parse(record.expiresAt)) {
      return res.status(410).send('This download link has expired.');
    }
    if (!/^[0-9a-f-]{36}$/i.test(record.id)) return res.status(404).send('Invalid video.');
    const video = path.join(OUT, `${record.id}.mp4`);
    if (!(await exists(video))) return res.status(404).send('Video is no longer available.');
    res.download(video, 'Zala-QI-World-Video.mp4');
  } catch {
    res.status(404).send('Download link not found.');
  }
});

async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials are missing.');
  }
  const credentials = Buffer.from(PAYPAL_CLIENT_ID + ':' + PAYPAL_CLIENT_SECRET).toString('base64');
  const response = await fetch(PAYPAL_BASE_URL + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + credentials,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!response.ok) throw new Error('PayPal authentication failed.');
  return (await response.json()).access_token;
}
app.post('/api/paypal/create-order', async (req, res) => {
  try {
    if (PAYPAL_ENV !== 'sandbox') {
      return res.status(503).json({ error: 'Live payments are not enabled yet.' });
    }
    const packageType = req.body?.packageType;
    if (!['standard', 'premium'].includes(packageType)) {
      return res.status(400).json({ error: 'Please select a valid video package.' });
    }
    const amount = packageType === 'premium' ? '99.00' : '59.00';
    const accessToken = await getPayPalAccessToken();
    const response = await fetch(PAYPAL_BASE_URL + '/v2/checkout/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          description: packageType === 'premium'
            ? 'Premium Singing Music Video' : 'Standard Cinematic Music Video',
          amount: { currency_code: 'USD', value: amount }
        }]
      })
    });
    const data = await response.json();
    if (!response.ok || !data.id) throw new Error('PayPal could not create the order.');
    res.json({ ok: true, orderID: data.id, amount, currency: 'USD' });
  } catch (error) {
    console.error('PayPal order error:', error.message);
    res.status(500).json({ error: 'Unable to create PayPal test order.' });
  }
});
app.post('/api/paypal/capture-order', async (req, res) => {
  try {
    if (PAYPAL_ENV !== 'sandbox') {
      return res.status(503).json({ error: 'Live payments are not enabled yet.' });
    }
    const orderID = req.body?.orderID;
    if (typeof orderID !== 'string' || !/^[A-Z0-9]{10,30}$/i.test(orderID)) {
      return res.status(400).json({ error: 'Invalid PayPal order ID.' });
    }
    const accessToken = await getPayPalAccessToken();
    const response = await fetch(
      PAYPAL_BASE_URL + '/v2/checkout/orders/' + encodeURIComponent(orderID) + '/capture',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': 'capture-' + orderID
        },
        body: '{}'
      }
    );
    const data = await response.json();
    if (!response.ok || data.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Payment could not be confirmed.' });
    }
    res.json({ ok: true, orderID: data.id, status: data.status });
  } catch (error) {
    console.error('PayPal capture error:', error.message);
    res.status(500).json({ error: 'Unable to confirm PayPal test payment.' });
  }
});
app.get('/api/customer-orders', async (req, res) => {
  if (!isVideoAdmin(req)) {
    return res.status(403).json({ error: 'Administrator password required.' });
  }
  try {
    const files = await fs.readdir(ORDERS);
    const orders = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      orders.push(JSON.parse(await fs.readFile(path.join(ORDERS, file), 'utf8')));
    }
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ ok: true, orders });
  } catch (error) {
    console.error('Customer orders error:', error);
    res.status(500).json({ error: 'Could not load customer orders.' });
  }
});
function validCustomerEmail(email) {
  return typeof email === 'string' && email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
// Customer order submissions remain disabled until the checkout flow is ready.
app.post('/api/customer-orders', (req, res) => {
  res.status(503).json({ error: 'Customer orders are temporarily disabled.' });
});
// REALISM ENGINE — ADMINISTRATOR DASHBOARD

app.get('/api/realism/stats', async (req, res) => {
  if (!isVideoAdmin(req)) {
    return res.status(403).json({
      error: 'Administrator password required.'
    });
  }

  try {
    const stats = await getRealismStats();
    res.json({ ok: true, ...stats });
  } catch (error) {
    console.error('Realism stats error:', error);
    res.status(500).json({
      error: 'Unable to load realism statistics.'
    });
  }
});

app.get('/api/realism/recommendations', async (req, res) => {
  if (!isVideoAdmin(req)) {
    return res.status(403).json({
      error: 'Administrator password required.'
    });
  }

  try {
    const recommendations = await recommendTechniques(5);
    res.json({ ok: true, recommendations });
  } catch (error) {
    console.error('Realism recommendations error:', error);
    res.status(500).json({
      error: 'Unable to load recommendations.'
    });
  }
});
app.listen(PORT, () => {
  console.log(`Zala QI's World running on port ${PORT}`);
});
