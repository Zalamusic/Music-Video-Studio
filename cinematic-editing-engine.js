
import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk.toString()).slice(-3000);
    });

    child.on('error', reject);

    child.on('close', code =>
      code === 0
        ? resolve(stdout.trim())
        : reject(new Error(
            stderr || `${command} failed`
          ))
    );
  });
}

async function mediaDuration(file) {
  const result = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file
  ]);

  const seconds = Number(result);

  if (
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    throw new Error(
      `Invalid media duration: ${file}`
    );
  }

  return seconds;
}

export async function createCinematicEdit({
  sceneFiles,
  songFile,
  outputFile,
  songSeconds,
  format = 'vertical',
  plan = null,
  workDirectory = null
} = {}) {
  if (
    !Array.isArray(sceneFiles) ||
    sceneFiles.length === 0
  ) {
    throw new Error(
      'At least one scene is required.'
    );
  }

  if (!songFile || !outputFile) {
    throw new Error(
      'Song and output paths are required.'
    );
  }

  const target = Number(songSeconds);

  if (
    !Number.isFinite(target) ||
    target <= 0 ||
    target > 360
  ) {
    throw new Error('Invalid song duration.');
  }

  const durations = [];

  for (const file of sceneFiles) {
    await stat(file);
    durations.push(await mediaDuration(file));
  }

  await stat(songFile);

  const available = durations.reduce(
    (sum, value) => sum + value,
    0
  );

  if (available + 0.05 < target) {
    throw new Error(
      'Insufficient scene footage for cinematic edit; ' +
      'use standard assembly fallback.'
    );
  }

  const work = workDirectory || path.join(
    path.dirname(outputFile),
    `edit-${path.parse(outputFile).name}`
  );

  await mkdir(work, { recursive: true });
  await mkdir(path.dirname(outputFile), {
    recursive: true
  });

  const width = format === 'landscape'
    ? 1280
    : 720;

  const height = format === 'landscape'
    ? 720
    : 1280;

  const segments = [];
  let remaining = target;

  for (
    let index = 0;
    index < sceneFiles.length && remaining > 0.04;
    index++
  ) {
    const take = Math.min(
      durations[index],
      remaining
    );

    if (take < 0.05) break;

    const segment = path.join(
      work,
      `segment-${String(index + 1).padStart(3, '0')}.mp4`
    );

    await run('ffmpeg', [
      '-y',
      '-i', sceneFiles[index],
      '-t', String(take),
      '-vf',
      `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},setsar=1,fps=24`,
      '-an',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '19',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      segment
    ]);

    segments.push(segment);
    remaining -= take;
  }

  if (remaining > 0.05) {
    throw new Error(
      'Scene footage was insufficient after trimming.'
    );
  }

  const joined = path.join(work, 'joined.mp4');

  const concatInputs = segments.flatMap(
    file => ['-i', file]
  );

  const filter =
    segments.map((_, i) => `[${i}:v:0]`).join('') +
    `concat=n=${segments.length}:v=1:a=0[v]`;

  await run('ffmpeg', [
    '-y',
    ...concatInputs,
    '-filter_complex', filter,
    '-map', '[v]',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '19',
    '-pix_fmt', 'yuv420p',
    joined
  ]);

  await run('ffmpeg', [
    '-y',
    '-i', joined,
    '-i', songFile,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-t', String(target),
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    outputFile
  ]);

  const finalDuration =
    await mediaDuration(outputFile);

  if (
    Math.abs(finalDuration - target) > 0.25
  ) {
    throw new Error(
      `Final video duration mismatch: ` +
      `${finalDuration.toFixed(2)} seconds.`
    );
  }

  const compatiblePlan =
    Array.isArray(plan?.scenes) &&
    plan.scenes.length === segments.length &&
    Math.abs(
      plan.scenes.reduce(
        (sum, scene) =>
          sum + Number(scene.durationSeconds || 0),
        0
      ) - target
    ) < 0.25 &&
    plan.scenes.every(
      (scene, index) =>
        Math.abs(
          Number(scene.durationSeconds) -
          Math.min(
            durations[index],
            target -
            durations.slice(0, index).reduce(
              (a, b) => a + b,
              0
            )
          )
        ) < 0.25
    );

  return {
    engine: 'Zala Cinematic Editing v1',
    scenesUsed: segments.length,
    usedMusicPlan: false,
    musicPlanCompatible: compatiblePlan,
    durationSeconds: finalDuration,
    outputFile
  };
}
