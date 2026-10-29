
/**
 * Zala QI's World — Visual Continuity Engine v1
 * Uses FFmpeg to extract scene samples and writes a manifest.
 * No face recognition, matching, or automatic correction is performed.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk.toString()).slice(-3000);
    });
    child.on('error', reject);
    child.on('close', code => code === 0
      ? resolve()
      : reject(new Error(`${command} failed: ${stderr}`)));
  });
}

function safeSceneNumber(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000) {
    throw new Error(
      'sceneNumber must be an integer between 1 and 1000'
    );
  }
  return value;
}

async function sha256(file) {
  const bytes = await fs.readFile(file);
  return createHash('sha256')
    .update(bytes)
    .digest('hex');
}

/**
 * Capture three frames from a completed scene.
 * These are samples, NOT verified identity references.
 */
async function captureSceneFrames({
  jobDirectory,
  sceneNumber,
  videoFile,
  durationSeconds
}) {
  if (typeof jobDirectory !== 'string' || !jobDirectory) {
    throw new Error('jobDirectory is required');
  }

  if (typeof videoFile !== 'string' || !videoFile) {
    throw new Error('videoFile is required');
  }

  safeSceneNumber(sceneNumber);

  if (!Number.isFinite(durationSeconds) ||
      durationSeconds < 1) {
    throw new Error(
      'durationSeconds must be at least one second'
    );
  }

  const root = path.join(
    jobDirectory,
    'visual-continuity'
  );

  const sceneDir = path.join(
    root,
    `scene-${sceneNumber}`
  );

  await fs.mkdir(sceneDir, { recursive: true });

  const frames = [];

  for (const fraction of [0.2, 0.5, 0.8]) {
    const timestamp = Math.max(
      0,
      durationSeconds * fraction
    );

    const label = `${Math.round(fraction * 100)}`;
    const filename = `frame-${label}.jpg`;
    const file = path.join(sceneDir, filename);

    await run('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-ss', timestamp.toFixed(3),
      '-i', videoFile,
      '-frames:v', '1',
      '-vf', 'scale=640:-2',
      '-q:v', '3',
      file
    ]);

    frames.push({
      fraction,
      timestampSeconds: Number(
        timestamp.toFixed(3)
      ),
      relativePath: path.relative(
        jobDirectory,
        file
      ),
      sha256: await sha256(file),
      identityVerified: false
    });
  }

  const manifest = {
    version: 1,
    sceneNumber,
    videoFile: path.basename(videoFile),
    referencePhoto: 'reference',
    referenceIsAuthoritative: true,
    identityVerified: false,
    identityScore: null,
    status: 'samples-captured-not-verified',
    frames,
    capturedAt: new Date().toISOString()
  };

  const manifestFile = path.join(
    sceneDir,
    'manifest.json'
  );

  await fs.writeFile(
    manifestFile,
    JSON.stringify(manifest, null, 2)
  );

  return manifest;
}

export { captureSceneFrames };
