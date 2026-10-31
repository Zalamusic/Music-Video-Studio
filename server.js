
import express from 'express';
import multer from 'multer';
import { fal } from '@fal-ai/client';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createIndependentVideo } from './independent-video-engine.js';

import { prepareSceneImage } from './scene-preparation-engine.js';
import { createDirectorPlan } from './director-mode-engine.js';
import { checkVideoQuality } from './video-quality-checker.js';
import { cleanOpening } from './cinematic-opening-cleaner.js';

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
const PREVIEW_LINK_MINUTES = 15;

const SCENE_PRICE_USD = Number(
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

app.use(express.json({
  limit: '16kb'
}));

app.use(express.static('public'));

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
    );

    try {
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

    if (
      !filename.endsWith('.mp4') ||
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
      stderr = (
        stderr + chunk.toString()
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
  path.join(jobDir(id), 'state.json');

async function readState(id) {
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
  }

  if (!(await exists(
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
    );

    const width = format === 'landscape'
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
      const plan = JSON.parse(
        await fs.readFile(
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
      status: 'unavailable'
    };

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
        'strands and realistic clothing. ' +
        'Use physically believable lighting, shadows, ' +
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
 * Try the new engine first.
 * If it cannot assemble the footage, use the
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
    const result = await createCinematicEdit({
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
    songFile,
    state.songSeconds,
    finalFile
  );
}

async function generateStandard(
  state,
  dir,
  imageUrl,
  musicPlan = null
) {
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

      const musicScene =
        musicPlan?.scenes?.[index - 1] || null;

      const description = scenePrompt(
        state,
        index,
        musicScene
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
        jobDirectory: dir,
        sceneNumber: index,
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
      )
    );

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
    state = await readState(id);

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
    };

    await saveState(state);

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
    active.delete(id);
  }
}

app.post('/api/create', upload.fields([
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
      req.body.mode === 'premium'
    ) {
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
      });

      dir = null;

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
    console.error(error);

    if (dir) {
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
    return res.status(403).json({
      error: 'Unauthorized video deletion.'
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
  if (!isVideoAdmin(req)) {
    return res.status(403).json({
      error:
        'Administrator password required to resume videos.'
    });
  }

  if (!validId(req.params.id)) {
    return res.status(400).json({
      error: 'Invalid job ID.'
    });
  }

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
  }

  if (!validId(req.params.id)) {
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
    });
  }
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
  } catch {
    res.status(404).json({
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

    const video = path.join(
      OUT,
      `${record.id}.mp4`
    );

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
    return res.status(404).send(
      'Preview link not found.'
    );
  }
});

app.get('/watch/:token', (req, res) => {
  const token = req.params.token;

  if (!validId(token)) {
    return res.status(404).send(
      'Invalid link.'
    );
  }

  const downloadUrl =
    '/download/' + token;

  res.type('html').send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta name="viewport"
            content="width=device-width,initial-scale=1">
      <title>Zala QI's World - Your Video</title>
      <style>
        body {
          background: #10101b;
          color: white;
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 30px 15px;
        }
        a {
          display: inline-block;
          background: #b45cff;
          color: white;
          padding: 16px 24px;
          border-radius: 10px;
          text-decoration: none;
          font-weight: bold;
          margin: 12px;
        }
      </style>
    </head>
    <body>
      <h1>Zala QI's World</h1>
      <h2>Your Music Video Is Ready!</h2>
      <p>Your private link expires after 7 days.</p>
      <a href="${downloadUrl}">
        Download Your Video
      </a>
    </body>
    </html>
  `);
});

app.get('/download/:token', async (req, res) => {
  const token = req.params.token;

  if (!validId(token)) {
    return res.status(404).send(
      'Invalid download link.'
    );
  }

  try {
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

    const video = path.join(
      OUT,
      `${record.id}.mp4`
    );

    if (!(await exists(video))) {
      return res.status(404).send(
        'Video is no longer available.'
      );
    }

    res.download(
      video,
      'Zala-QI-World-Video.mp4'
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

  const response = await fetch(
    PAYPAL_BASE_URL + '/v1/oauth2/token',
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
        },
        body: JSON.stringify({
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
      await getPayPalAccessToken();

    const response = await fetch(
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

    for (const file of files) {
      if (!file.endsWith('.json')) {
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
    });
  } catch (error) {
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

app.listen(PORT, () => {
  console.log(
    `Zala QI's World running on port ${PORT}`
  );

  console.log(
    'Music Intelligence integration loaded'
  );

  console.log(
    'Cinematic Editing integration loaded'
  );
});
