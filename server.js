import express from 'express';
import multer from 'multer';
import { fal } from '@fal-ai/client';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const app = express();
const PORT = process.env.PORT || 3000;
const OUT = path.resolve(process.env.OUTPUT_DIR || 'outputs');
const JOBS = path.resolve(process.env.JOBS_DIR || 'jobs');
const MODEL = 'minimax/h3-max-turbo/image-to-video';
const MAX_SONG_SECONDS = 360;
const SCENE_SECONDS = 15;
const SCENE_PRICE_USD = Number(process.env.SCENE_PRICE_USD);
const active = new Set();

await Promise.all([
  fs.mkdir(OUT, { recursive: true }),
  fs.mkdir(JOBS, { recursive: true })
]);

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }
});

app.use(express.static('public'));
app.use('/outputs', express.static(OUT));

app.get('/api/estimate', (req, res) => {
  const seconds = Number(req.query.seconds);

  if (!Number.isFinite(seconds) ||
      seconds <= 0 ||
      seconds > MAX_SONG_SECONDS) {
    return res.status(400).json({
      error: 'Duration must be between 0 and 360 seconds.'
    });
  }

  const scenesRequired = Math.ceil(seconds / SCENE_SECONDS);
  const priceConfigured =
    Number.isFinite(SCENE_PRICE_USD) && SCENE_PRICE_USD > 0;

  res.json({
    ok: true,
    songSeconds: seconds,
    sceneSeconds: SCENE_SECONDS,
    scenesRequired,
    model: MODEL,
    estimatedGenerationCostUSD: priceConfigured
      ? Number((scenesRequired * SCENE_PRICE_USD).toFixed(2))
      : null,
    priceConfigured,
    message: 'Estimate only. Actual provider billing may differ.'
  });
});

function execute(command, args, returnStdout = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let out = '';
    let err = '';

    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => err += d.toString());

    child.on('error', reject);

    child.on('close', code => {
      if (code === 0) {
        resolve(returnStdout ? out.trim() : undefined);
      } else {
        reject(new Error(err.slice(-1600) || `${command} failed`));
      }
    });
  });
}

async function duration(file) {
  const result = await execute('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file
  ], true);

  const n = Number(result);

  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Could not read media duration.');
  }

  return n;
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
const statePath = id => path.join(jobDir(id), 'state.json');

async function readState(id) {
  return JSON.parse(await fs.readFile(statePath(id), 'utf8'));
}

async function saveState(s) {
  s.updatedAt = new Date().toISOString();
  await fs.writeFile(statePath(s.id), JSON.stringify(s, null, 2));
}

function publicState(s) {
  const {
    id, status, phase, completedScenes, totalScenes,
    estimatedGenerationCostUSD, error, url, updatedAt
  } = s;

  return {
    id, status, phase, completedScenes, totalScenes,
    estimatedGenerationCostUSD, error, url, updatedAt
  };
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

async function generate(id) {
  if (active.has(id)) return;

  active.add(id);
  let s;

  try {
    s = await readState(id);
    s.status = 'running';
    s.error = null;
    await saveState(s);

    const dir = jobDir(id);
    const width = s.format === 'landscape' ? 1280 : 720;
    const height = s.format === 'landscape' ? 720 : 1280;

    const imageBytes = await fs.readFile(
      path.join(dir, 'reference')
    );

    const imageUrl =
      `data:${s.photoMime};base64,${imageBytes.toString('base64')}`;

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

      const idea = sceneIdeas[(i - 1) % sceneIdeas.length];

      const prompt =
        `Music video for "${s.title}". ` +
        `Scene ${i} of ${s.totalScenes}. ` +
        `Creative direction: ${s.concept}. ${idea}. ` +
        `Preserve the uploaded person's recognizable identity, ` +
        `face and hairstyle. Create a visually distinct new shot. ` +
        `Natural movement, cinematic composition, ` +
        `professional lighting. No text, captions, logos, ` +
        `watermarks, music or dialogue.`;

      const raw = path.join(dir, `raw-${i}.mp4`);

      if (!(await exists(raw))) {
        if (!process.env.FAL_KEY) {
          throw new Error('FAL_KEY is missing in Render settings.');
        }

        const result = await fal.subscribe(MODEL, {
          input: {
            prompt,
            image_url: imageUrl,
            duration: SCENE_SECONDS,
            resolution: '480P',
            prompt_expansion_mode: 'disabled'
          },
          logs: false
        });

        const videoUrl =
          result?.data?.video?.url || result?.video?.url;

        if (!videoUrl) {
          throw new Error(`Provider returned no video for scene ${i}.`);
        }

        const response = await fetch(videoUrl);

        if (!response.ok) {
          throw new Error(`Could not download scene ${i}.`);
        }

        await fs.writeFile(
          raw,
          Buffer.from(await response.arrayBuffer())
        );
      }

      s.phase = `Preparing scene ${i} of ${s.totalScenes}`;
      await saveState(s);

      const temp = clip + '.partial.mp4';

      await execute('ffmpeg', [
        '-y', '-i', raw,
        '-vf',
        `scale=${width}:${height}:` +
        `force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1,fps=24`,
        '-an',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        temp
      ]);

      if ((await duration(temp)) < 2) {
        throw new Error(`Generated scene ${i} was too short.`);
      }

      await fs.rename(temp, clip);
      s.completedScenes = i;
      await saveState(s);

      await fs.rm(raw, { force: true });
    }

    s.phase = 'Combining scenes and adding song audio';
    await saveState(s);

    const list = Array.from(
      { length: s.totalScenes },
      (_, n) => `file 'scene-${n + 1}.mp4'`
    ).join('\n') + '\n';

    await fs.writeFile(path.join(dir, 'scenes.txt'), list);

    await execute('ffmpeg', [
      '-y', '-f', 'concat',
      '-safe', '0',
      '-i', path.join(dir, 'scenes.txt'),
      '-c', 'copy',
      path.join(dir, 'joined.mp4')
    ]);

    const final = path.join(OUT, `${id}.mp4`);

    await execute('ffmpeg', [
      '-y',
      '-i', path.join(dir, 'joined.mp4'),
      '-i', path.join(dir, 'song'),
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-t', String(s.songSeconds),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      '-shortest',
      final
    ]);

    s.status = 'completed';
    s.phase = 'Video ready';
    s.url = `/outputs/${id}.mp4`;
    await saveState(s);

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

app.post(
  '/api/create',
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'photo', maxCount: 1 }
  ]),
  async (req, res) => {
    let dir;

    try {
      const audio = req.files?.audio?.[0];
      const photo = req.files?.photo?.[0];

      if (!audio || !photo) {
        return res.status(400).json({
          error: 'Please upload your song and a photo.'
        });
      }

      if (!['image/jpeg', 'image/png', 'image/webp']
        .includes(photo.mimetype)) {
        return res.status(400).json({
          error: 'Please upload a JPG, PNG or WebP image.'
        });
      }

      const concept = String(req.body.prompt || '').trim();

      if (!concept) {
        return res.status(400).json({
          error: 'Please describe your music video.'
        });
      }

      if (!process.env.FAL_KEY) {
        return res.status(500).json({
          error: 'FAL_KEY is missing in Render settings.'
        });
      }

      const id = randomUUID();
      dir = jobDir(id);

      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, 'song'), audio.buffer);
      await fs.writeFile(path.join(dir, 'reference'), photo.buffer);

      const songSeconds = await duration(path.join(dir, 'song'));

      if (songSeconds > MAX_SONG_SECONDS) {
        return res.status(400).json({
          error: 'Songs must be 6 minutes or shorter.'
        });
      }

      const totalScenes = Math.ceil(songSeconds / SCENE_SECONDS);

      const s = {
        id,
        status: 'queued',
        phase: 'Waiting to start',
        completedScenes: 0,
        totalScenes,
        songSeconds,
        title: String(req.body.title || 'Untitled Song')
          .slice(0, 120),
        concept: concept.slice(0, 4000),
        format: req.body.format === 'landscape'
          ? 'landscape' : 'vertical',
        photoMime: photo.mimetype,
        estimatedGenerationCostUSD: SCENE_PRICE_USD > 0
          ? Number((totalScenes * SCENE_PRICE_USD).toFixed(2))
          : null,
        error: null,
        url: null,
        updatedAt: new Date().toISOString()
      };

      await saveState(s);

      res.status(202).json({
        ok: true,
        jobId: id,
        ...publicState(s)
      });

      void generate(id);

    } catch (e) {
      console.error(e);

      if (dir) {
        await fs.rm(dir, {
          recursive: true,
          force: true
        }).catch(() => {});
      }

      if (!res.headersSent) {
        res.status(500).json({
          error: e.message || 'Could not start video job.'
        });
      }
    }
  }
);

app.get('/api/jobs/:id', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({
      error: 'Invalid job ID.'
    });
  }

  try {
    const s = await readState(req.params.id);

    if (s.status === 'running' && !active.has(s.id)) {
      s.status = 'failed';
      s.error =
        'Server restarted. Resume from saved scenes if available.';
      s.phase = 'Interrupted';
      await saveState(s);
    }

    res.json({ ok: true, ...publicState(s) });

  } catch {
    res.status(404).json({
      error: 'Job not found. Temporary storage may have been cleared.'
    });
  }
});

app.post('/api/jobs/:id/resume', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({
      error: 'Invalid job ID.'
    });
  }

  try {
    const s = await readState(req.params.id);

    if (active.has(s.id)) {
      return res.status(409).json({
        error: 'Job is already running.'
      });
    }

    if (s.status === 'completed') {
      return res.status(409).json({
        error: 'Video is already completed.'
      });
    }

    if (!(await exists(path.join(jobDir(s.id), 'song'))) ||
        !(await exists(path.join(jobDir(s.id), 'reference')))) {
      return res.status(410).json({
        error: 'Uploaded files are no longer available.'
      });
    }

    s.status = 'queued';
    s.error = null;
    s.phase = 'Resuming';
    await saveState(s);

    res.json({ ok: true, ...publicState(s) });
    void generate(s.id);

  } catch {
    res.status(404).json({
      error: 'Saved job not found.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Zala QI's World running on port ${PORT}`);
});









































































































































































































