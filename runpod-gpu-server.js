
import express from 'express';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  randomUUID,
  timingSafeEqual
} from 'node:crypto';
import { pipeline } from 'node:stream/promises';

const app = express();

const PORT = Number(process.env.PORT || 8000);
const GPU_API_KEY = process.env.ZALA_GPU_API_KEY || '';

const GENERATION_ENABLED =
  process.env.ZALA_GPU_GENERATION_ENABLED === 'true';

const PYTHON =
  process.env.ZALA_PYTHON ||
  '/workspace/zala-world/venv/bin/python';

const GENERATOR_SCRIPT = path.resolve(
  process.env.ZALA_GENERATOR_SCRIPT ||
  '/workspace/zala-world/generate_video.py'
);

const MODEL_DIR = path.resolve(
  process.env.ZALA_WAN_MODEL_DIR ||
  '/workspace/zala-world/models/Wan2.2-TI2V-5B'
);

const WAN_SCRIPT = path.resolve(
  process.env.ZALA_WAN_SOURCE_DIR ||
  '/workspace/zala-world/Wan2.2',
  'generate.py'
);

const MAX_SECONDS = 5;
const MAX_CONCURRENT_JOBS = 1;
const TIMEOUT_MS = 30 * 60 * 1000;

let activeJobs = 0;

app.use(express.json({ limit: '32kb' }));

function authorized(req) {
  if (!GPU_API_KEY) return false;

  const header = req.get('authorization') || '';

  if (!header.startsWith('Bearer ')) return false;

  const supplied = Buffer.from(
    header.slice(7),
    'utf8'
  );

  const expected = Buffer.from(GPU_API_KEY, 'utf8');

  return (
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}

async function checkInstallation() {
  try {
    const [generator, wan, model] = await Promise.all([
      fs.stat(GENERATOR_SCRIPT),
      fs.stat(WAN_SCRIPT),
      fs.stat(MODEL_DIR)
    ]);

    if (
      !generator.isFile() ||
      !wan.isFile() ||
      !model.isDirectory()
    ) {
      return false;
    }

    const files = await fs.readdir(MODEL_DIR);

    return files.length > 0;
  } catch {
    return false;
  }
}

app.get('/health', async (req, res) => {
  const installed = await checkInstallation();

  res.json({
    ok: true,
    service: "Zala QI's World GPU Engine",
    status: 'online',
    installationDetected: installed,
    gpuGenerationEnabled: GENERATION_ENABLED,
    gpuGenerationReady:
      installed &&
      GENERATION_ENABLED &&
      Boolean(GPU_API_KEY),
    activeJobs,
    maxConcurrentJobs: MAX_CONCURRENT_JOBS
  });
});

function validateRequest(body) {
  if (!body || typeof body !== 'object') {
    return 'Invalid request body.';
  }

  const {
    prompt,
    seconds,
    format,
    imageUrl
  } = body;

  if (
    typeof prompt !== 'string' ||
    !prompt.trim() ||
    prompt.length > 2000
  ) {
    return 'A valid video prompt is required.';
  }

  if (
    !Number.isInteger(seconds) ||
    seconds < 1 ||
    seconds > MAX_SECONDS
  ) {
    return 'Testing supports 1–5 second videos.';
  }

  if (!['vertical', 'landscape'].includes(format)) {
    return 'Invalid video format.';
  }

  if (
    typeof imageUrl !== 'string' ||
    imageUrl.length > 4096
  ) {
    return 'A valid image URL is required.';
  }

  try {
    const url = new URL(imageUrl);

    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    ) {
      return 'A standard HTTPS image URL is required.';
    }
  } catch {
    return 'Invalid image URL.';
  }

  return null;
}

function runGenerator(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      PYTHON,
      [GENERATOR_SCRIPT, ...args],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        env: process.env,
        detached: process.platform !== 'win32'
      }
    );

    let stderr = '';
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;

      try {
        if (process.platform !== 'win32' && child.pid) {
          process.kill(-child.pid, 'SIGKILL');
        } else {
          child.kill('SIGKILL');
        }
      } catch (error) {
        console.error(
          'Unable to stop generator:',
          error.message
        );
      }
    }, TIMEOUT_MS);

    child.stderr.on('data', chunk => {
      stderr = (
        stderr + chunk.toString()
      ).slice(-4000);
    });

    child.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (timedOut) {
        reject(new Error('Generation timed out.'));
      } else if (code !== 0) {
        reject(new Error(
          'Generator exited with code ' +
          code + ': ' + stderr.slice(-500)
        ));
      } else {
        resolve();
      }
    });
  });
}

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
      error: 'GPU generation is disabled.'
    });
  }

  const validationError = validateRequest(req.body);

  if (validationError) {
    return res.status(400).json({
      ok: false,
      error: validationError
    });
  }

  if (!(await checkInstallation())) {
    return res.status(503).json({
      ok: false,
      error:
        'Wan 2.2 installation is incomplete.'
    });
  }

  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    return res.status(429).json({
      ok: false,
      error: 'GPU engine is busy.'
    });
  }

  activeJobs++;

  let jobDir;

  try {
    jobDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zala-gpu-')
    );

    const outputPath = path.join(
      jobDir,
      'video.mp4'
    );

    const jobId = randomUUID();

    await runGenerator([
      '--prompt', req.body.prompt.trim(),
      '--seconds', String(req.body.seconds),
      '--format', req.body.format,
      '--image-url', req.body.imageUrl,
      '--output', outputPath
    ]);

    const stat = await fs.stat(outputPath);

    if (!stat.isFile() || stat.size < 1024) {
      throw new Error(
        'Generated video is invalid.'
      );
    }

    res.setHeader(
      'Content-Type',
      'video/mp4'
    );

    res.setHeader(
      'Content-Length',
      stat.size
    );

    res.setHeader(
      'Cache-Control',
      'no-store'
    );

    res.setHeader(
      'X-Zala-Job-Id',
      jobId
    );

    await pipeline(
      createReadStream(outputPath),
      res
    );

  } catch (error) {
    console.error(
      'GPU generation error:',
      error.message
    );

    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error:
          'Video generation failed. Check GPU logs.'
      });
    } else if (!res.destroyed) {
      res.destroy(error);
    }

  } finally {
    activeJobs--;

    if (jobDir) {
      await fs.rm(jobDir, {
        recursive: true,
        force: true
      }).catch(() => {});
    }
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
