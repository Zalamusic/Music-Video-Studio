
/**
 * Zala QI's World
 * Hybrid Video Engine v1
 *
 * Combines existing video clips into a finished
 * music video with the original song.
 *
 * No paid generation API calls.
 * Does not generate character movement or lip-sync.
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FPS = 24;
const MAX_SECONDS = 360;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr = (
        stderr + data.toString()
      ).slice(-12000);
    });

    child.on('error', error => {
      if (settled) return;
      settled = true;
      reject(error);
    });

    child.on('close', code => {
      if (settled) return;
      settled = true;

      if (code !== 0) {
        reject(new Error(
          stderr || `${command} exited with ${code}`
        ));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function mediaDuration(file) {
  const output = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file
  ]);

  const seconds = Number(output);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(
      `Unable to read media duration: ${file}`
    );
  }

  return seconds;
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function outputSize(format) {
  return format === 'landscape'
    ? { width: 1280, height: 720 }
    : { width: 720, height: 1280 };
}

async function normalizeClip({
  input,
  output,
  format
}) {
  const { width, height } = outputSize(format);

  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-i', input,
    '-vf',
    `scale=${width}:${height}:` +
      'force_original_aspect_ratio=increase,' +
      `crop=${width}:${height},` +
      'setsar=1,fps=24,format=yuv420p',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '22',
    '-pix_fmt', 'yuv420p',
    '-r', String(FPS),
    '-movflags', '+faststart',
    output
  ]);
}

/**
 * Assemble clips and synchronize the original song.
 *
 * clips: array of local MP4 file paths
 * songFile: local audio file path
 * outputFile: finished MP4 destination
 */
export async function createHybridVideo({
  clips,
  songFile,
  outputFile,
  format = 'vertical',
  songSeconds,
  workDirectory
}) {
  if (!Array.isArray(clips) || clips.length === 0) {
    throw new Error(
      'At least one video clip is required.'
    );
  }

  if (!songFile || !outputFile || !workDirectory) {
    throw new Error(
      'songFile, outputFile and workDirectory are required.'
    );
  }

  if (!['vertical', 'landscape'].includes(format)) {
    throw new Error(
      'Format must be vertical or landscape.'
    );
  }

  if (!(await fileExists(songFile))) {
    throw new Error(
      'Original song file was not found.'
    );
  }

  const duration = songSeconds == null
    ? await mediaDuration(songFile)
    : Number(songSeconds);

  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_SECONDS
  ) {
    throw new Error(
      'Song duration must be between 0 and 360 seconds.'
    );
  }

  await fs.mkdir(workDirectory, {
    recursive: true
  });

  await fs.mkdir(path.dirname(outputFile), {
    recursive: true
  });

  const normalized = [];

  for (let index = 0; index < clips.length; index++) {
    const input = clips[index];

    if (!(await fileExists(input))) {
      throw new Error(
        `Missing video clip ${index + 1}.`
      );
    }

    const output = path.join(
      workDirectory,
      `hybrid-scene-${index + 1}.mp4`
    );

    await normalizeClip({
      input,
      output,
      format
    });

    normalized.push(output);
  }

  // Use FFmpeg's concat demuxer with paths relative
  // to the manifest, avoiding filename quoting issues.
  const manifest = path.join(
    workDirectory,
    'hybrid-scenes.txt'
  );

  const lines = normalized.map(file => {
    const safeName = path.basename(file);

    return `file '${safeName}'`;
  });

  await fs.writeFile(
    manifest,
    lines.join('\n') + '\n'
  );

  const joined = path.join(
    workDirectory,
    'hybrid-joined.mp4'
  );

  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', manifest,
    '-c', 'copy',
    joined
  ]);

  const joinedSeconds = await mediaDuration(joined);

  // Freeze the last frame if the combined clips
  // are shorter than the song.
  const extraSeconds = Math.max(
    0,
    duration - joinedSeconds
  );

  const partialOutput = path.join(
    workDirectory,
    'hybrid-final.partial.mp4'
  );

  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-i', joined,
    '-i', songFile,
    '-filter_complex',
    `[0:v]tpad=stop_mode=clone:` +
      `stop_duration=${extraSeconds + 1},` +
      `trim=duration=${duration},` +
      'setpts=PTS-STARTPTS[v]',
    '-map', '[v]',
    '-map', '1:a:0',
    '-t', String(duration),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '21',
    '-pix_fmt', 'yuv420p',
    '-r', String(FPS),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    partialOutput
  ]);

  const stats = await fs.stat(partialOutput);

  if (stats.size === 0) {
    throw new Error(
      'Hybrid video output is empty.'
    );
  }

  await fs.copyFile(
    partialOutput,
    outputFile
  );

  return {
    ok: true,
    engine: 'Zala Hybrid Video Engine v1',
    outputFile,
    clipsUsed: normalized.length,
    durationSeconds: duration,
    format,
    resolution: outputSize(format),
    externalGenerationCredits: 0
  };
}
