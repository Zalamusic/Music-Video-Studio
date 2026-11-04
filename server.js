
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
app.use(
  '/api/customer-auth',
  createCustomerAuthRouter({
    storageDirectory: OUT
  })
);
// Read-only order history and loyalty progress.
app.use(
  '/api/customer-order-history',
  createCustomerOrderHistoryRouter({ storageDirectory: OUT })
);

app.get('/', (req, res) => {
  res.redirect('/customer.html');
});
app.use(express.static('public'));


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
      error: 'GPU video generation is disabled.'
    });
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
    ).catch(() => {});

    return res.status(500).json({
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
    { name: 'audio', maxCount: 1 }
  ]),
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

app.get('/api/independent-video/:id', async (req, res) => {
  if (!isVideoAdmin(req)) {
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
