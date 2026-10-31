
import { spawn } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk.toString()).slice(-3000);
    });

    child.on('error', error => {
      if (settled) return;
      settled = true;
      reject(error);
    });

    child.on('close', code => {
      if (settled) return;
      settled = true;

      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(
          stderr || `${command} failed`
        ));
      }
    });
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

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(
      `Invalid media duration: ${file}`
    );
  }

  return seconds;
}

function getMusicTimings(plan, target) {
  if (!Array.isArray(plan?.scenes) ||
      plan.scenes.length === 0) {
    return null;
  }

  const scenes = plan.scenes;
  const timings = [];
  let position = 0;

  for (const scene of scenes) {
    const start = Number(scene.startSeconds);
    const end = Number(scene.endSeconds);

    let length;

    if (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start
    ) {
      if (Math.abs(start - position) > 0.15) {
        throw new Error(
          'Music plan has gaps or overlaps.'
        );
      }

      length = end - start;
      position = end;
    } else {
      length = Number(scene.durationSeconds);

      if (!Number.isFinite(length) || length <= 0) {
        throw new Error(
          'Music plan has invalid scene duration.'
        );
      }

      position += length;
    }

    timings.push(length);
  }

  if (Math.abs(position - target) > 0.25) {
    throw new Error(
      'Music plan duration does not match song.'
    );
  }

  return timings;
}

function makeSegments(durations, target, musicTimings) {
  if (musicTimings) {
    return musicTimings.map((length, index) => {
      const sourceIndex = Math.min(
        durations.length - 1,
        Math.floor(
          index * durations.length / musicTimings.length
        )
      );

      return {
        sourceIndex,
        seconds: length
      };
    });
  }

  const segments = [];
  let remaining = target;

  for (let index = 0;
       index < durations.length && remaining > 0.001;
       index++) {
    const take = Math.min(
      durations[index],
      remaining
    );

    if (take > 0.001) {
      segments.push({
        sourceIndex: index,
        seconds: take
      });

      remaining -= take;
    }
  }

  if (remaining > 0.05) {
    throw new Error(
      'Insufficient scene footage; use standard assembly fallback.'
    );
  }

  return segments;
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

  const musicTimings = getMusicTimings(
    plan,
    target
  );

  const usingMusicPlan = musicTimings !== null;

  const segmentsToCreate = makeSegments(
    durations,
    target,
    musicTimings
  );

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

  const fps = 24;
  const segmentFiles = [];

  // Each segment is cut to its planned length.
  // If the source clip is too short, it is looped.
  // Looping avoids frozen frames but may repeat action.

  for (let index = 0;
       index < segmentsToCreate.length;
       index++) {
    const item = segmentsToCreate[index];

    const source = sceneFiles[item.sourceIndex];
    const sourceDuration = durations[item.sourceIndex];

    const take = item.seconds;

    if (
      !Number.isFinite(take) ||
      take <= 0
    ) {
      throw new Error(
        `Invalid duration for scene ${index + 1}.`
      );
    }

    const segment = path.join(
      work,
      `segment-${String(index + 1).padStart(3, '0')}.mp4`
    );

    const requiresLoop =
      take > sourceDuration - 0.05;

    const inputArgs = requiresLoop
      ? ['-stream_loop', '-1', '-i', source]
      : ['-i', source];

    await run('ffmpeg', [
      '-y',
      ...inputArgs,
      '-vf',
      `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},setsar=1,` +
      `fps=${fps},setpts=PTS-STARTPTS`,
      '-t', String(take),
      '-an',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '19',
      '-pix_fmt', 'yuv420p',
      '-r', String(fps),
      '-movflags', '+faststart',
      segment
    ]);

    const actual = await mediaDuration(segment);

    if (Math.abs(actual - take) > 0.15) {
      throw new Error(
        `Scene ${index + 1} duration mismatch.`
      );
    }

    segmentFiles.push(segment);
  }

  // Use the concat demuxer with standardized clips.
  // This avoids a very large filter graph for long songs.

  const manifest = path.join(
    work,
    'cinematic-scenes.txt'
  );

  const escapePath = file =>
    file.replace(/'/g, "'\\''");

  await writeFile(
    manifest,
    segmentFiles.map(
      file => `file '${escapePath(file)}'`
    ).join('\n') + '\n'
  );

  const joined = path.join(
    work,
    'joined.mp4'
  );

  await run('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', manifest,
    '-an',
    '-c:v', 'copy',
    '-movflags', '+faststart',
    joined
  ]);

  // Restore the uploaded song as the soundtrack.
  // Pad the last video frame only if rounding creates
  // a small gap at the end of the video.

  await run('ffmpeg', [
    '-y',
    '-i', joined,
    '-i', songFile,
    '-filter_complex',
    `[0:v:0]tpad=stop_mode=clone:stop_duration=1,` +
    `trim=duration=${target},setpts=PTS-STARTPTS[v]`,
    '-map', '[v]',
    '-map', '1:a:0',
    '-t', String(target),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '19',
    '-pix_fmt', 'yuv420p',
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
      'Final video duration mismatch: ' +
      `${finalDuration.toFixed(2)} seconds.`
    );
  }

  return {
    engine: 'Zala Cinematic Editing v3',
    scenesUsed: segmentFiles.length,
    usedMusicPlan: usingMusicPlan,
    musicPlanCompatible: usingMusicPlan,
    durationSeconds: finalDuration,
    outputFile
  };
}
