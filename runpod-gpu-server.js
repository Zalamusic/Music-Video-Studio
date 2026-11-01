
import express from 'express';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const app = express();

const PORT = Number(process.env.PORT || 8000);
const GPU_API_KEY = process.env.ZALA_GPU_API_KEY || '';

const GENERATION_ENABLED =
  process.env.ZALA_GPU_GENERATION_ENABLED === 'true';

const PYTHON = process.env.ZALA_PYTHON || 'python3';

const GENERATOR_SCRIPT = path.resolve(
  process.env.ZALA_GENERATOR_SCRIPT ||
  '/workspace/zala-world/generate_video.py'
);

const MAX_SECONDS = 15;
const MAX_CONCURRENT_JOBS = 1;
const TIMEOUT_MS = 30 * 60 * 1000;

let activeJobs = 0;

app.use(express.json({ limit: '32kb' }));

function authorized(req) {
  if (!GPU_API_KEY) return false;

  const header = req.get('authorization') || '';
  const prefix = 'Bearer ';

  if (!header.startsWith(prefix)) return false;

  const supplied = Buffer.from(
    header.slice(prefix.length),
    'utf8'
  );

  const expected = Buffer.from(GPU_API_KEY, 'utf8');

  return (
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: "Zala QI's World GPU Engine",
    status: 'online',
    gpuGenerationReady: GENERATION_ENABLED &&
      Boolean(GPU_API_KEY),
    activeJobs,
    maxConcurrentJobs: MAX_CONCURRENT_JOBS
  });
});

app.post('/generate', async (req, res) => {
  if (!authorized(req)) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized.'
    });
  }

  if (!GENERATION_ENABLED) {
    return res.status(503).json({
      ok: false,
      error:
        'GPU generation is disabled. ' +
        'No paid GPU work has started.'
    });
  }

  const {
    prompt,
    seconds,
    format,
    imageUrl
  } = req.body || {};

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
    typeof seconds !== 'number' ||
    !Number.isInteger(seconds) ||
    seconds < 1 ||
    seconds > MAX_SECONDS
  ) {
    return res.status(400).json({
      ok: false,
      error: 'Video duration must be 1–15 seconds.'
    });
  }

  if (!['vertical', 'landscape'].includes(format)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid video format.'
    });
  }

  if (
    typeof imageUrl !== 'string' ||
    imageUrl.length > 4096
  ) {
    return res.status(400).json({
      ok: false,
      error: 'An image URL is required.'
    });
  }

  let parsedImageUrl;

  try {
    parsedImageUrl = new URL(imageUrl);
  } catch {
    return res.status(400).json({
      ok: false,
      error: 'Invalid image URL.'
    });
  }

  if (parsedImageUrl.protocol !== 'https:') {
    return res.status(400).json({
      ok: false,
      error: 'Image URL must use HTTPS.'
    });
  }

  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    return res.status(429).json({
      ok: false,
      error: 'GPU engine is busy. Try again later.'
    });
  }

  activeJobs++;

  const jobId = randomUUID();

  const jobDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zala-gpu-')
  ).catch(() => null);

  if (!jobDir) {
    activeJobs--;
    return res.status(500).json({
      ok: false,
      error: 'Unable to prepare generation workspace.'
    });
  }

  const outputPath = path.join(jobDir, 'video.mp4');

  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        PYTHON,
        [
          GENERATOR_SCRIPT,
          '--prompt', prompt.trim(),
          '--seconds', String(seconds),
          '--format', format,
          '--image-url', imageUrl,
          '--output', outputPath
        ],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: process.env
        }
      );

      let stderr = '';
      let settled = false;

      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (error) reject(error);
        else resolve(value);
      };

      child.stderr.on('data', chunk => {
        stderr = (stderr + chunk.toString()).slice(-4000);
      });

      child.stdout.on('data', () => {});

      child.on('error', error => {
        finish(error);
      });

      child.on('close', code => {
        if (code === 0) {
          finish(null, true);
        } else {
          finish(new Error(
            'Generator exited with code ' + code +
            ': ' + stderr.slice(-500)
          ));
        }
      });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(new Error('Generation timed out.'));
      }, TIMEOUT_MS);
    });

    if (!result) {
      throw new Error('Video generation failed.');
    }

    const stat = await fs.stat(outputPath);

    if (!stat.isFile() || stat.size < 1024) {
      throw new Error('Generated video is invalid.');
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Zala-Job-Id', jobId);

    const video = await fs.readFile(outputPath);
    res.end(video);

  } catch (error) {
    console.error('GPU generation failed:', error.message);

    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error:
          'GPU video generation failed. ' +
          'Check the server logs.'
      });
    }
  } finally {
    activeJobs--;
    await fs.rm(jobDir, {
      recursive: true,
      force: true
    }).catch(() => {});
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Zala QI's World GPU server listening on port ${PORT}`
  );
  console.log(
    'GPU generation enabled:',
    GENERATION_ENABLED
  );
});
