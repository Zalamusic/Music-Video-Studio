
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FPS = 24;
const WIDTH = 720;
const HEIGHT = 1280;
const MAX_SECONDS = 360;

// Conservative zoom limits to help preserve framing.
const MIN_ZOOM = 1.02;
const MAX_ZOOM = 1.12;

const MOTIONS = new Set([
  'zoom',
  'zoomOut',
  'panLeft',
  'panRight'
]);

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-nostdin',
      '-y',
      ...args
    ]);

    let errorText = '';
    let settled = false;

    child.stderr.on('data', data => {
      errorText += data.toString();

      if (errorText.length > 12000) {
        errorText = errorText.slice(-12000);
      }
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
        resolve();
      } else {
        reject(new Error(
          'FFmpeg failed: ' +
          (errorText || `exit code ${code}`)
        ));
      }
    });
  });
}

function makeMotionFilter(style, seconds) {
  const frames = Math.max(
    1,
    Math.ceil(seconds * FPS)
  );

  const last = Math.max(1, frames - 1);

  // Progress from 0 to 1.
  const progress = `(on/${last})`;

  // Smoothstep creates gentle acceleration
  // and deceleration.
  const smooth =
    `(${progress}*${progress}*` +
    `(3-2*${progress}))`;

  const zoomRange = MAX_ZOOM - MIN_ZOOM;

  const zoomIn =
    `${MIN_ZOOM}+${zoomRange}*${smooth}`;

  const zoomOut =
    `${MAX_ZOOM}-${zoomRange}*${smooth}`;

  // Use a limited horizontal pan.
  const panZoom = 1.12;
  const panFraction = 0.65;

  const motion = {
    zoom: {
      z: zoomIn,
      x: 'iw/2-(iw/zoom/2)',
      y: 'ih/2-(ih/zoom/2)'
    },

    zoomOut: {
      z: zoomOut,
      x: 'iw/2-(iw/zoom/2)',
      y: 'ih/2-(ih/zoom/2)'
    },

    panLeft: {
      z: String(panZoom),
      x:
        `(iw-iw/zoom)*` +
        `(0.5+${panFraction / 2}-` +
        `${panFraction}*${smooth})`,
      y: 'ih/2-(ih/zoom/2)'
    },

    panRight: {
      z: String(panZoom),
      x:
        `(iw-iw/zoom)*` +
        `(0.5-${panFraction / 2}+` +
        `${panFraction}*${smooth})`,
      y: 'ih/2-(ih/zoom/2)'
    }
  };

  const selected = motion[style] || motion.zoom;

  return [
    `scale=${WIDTH * 2}:${HEIGHT * 2}:force_original_aspect_ratio=increase`,
    `crop=${WIDTH * 2}:${HEIGHT * 2}`,
    'setsar=1',
    `zoompan=z='${selected.z}':x='${selected.x}':y='${selected.y}':d=1:s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
    `trim=duration=${seconds}`,
    'setpts=PTS-STARTPTS',
    'format=yuv420p'
  ].join(',');
}

export async function createIndependentVideo({
  photoPath,
  audioPath,
  outputPath,
  seconds = 15,
  motion = 'zoom'
}) {
  if (!photoPath || !audioPath || !outputPath) {
    throw new Error(
      'Photo, audio, and output paths are required.'
    );
  }

  seconds = Number(seconds);

  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    seconds > MAX_SECONDS
  ) {
    throw new Error(
      `Video duration must be between 0 and ${MAX_SECONDS} seconds.`
    );
  }

  if (!MOTIONS.has(motion)) {
    throw new Error(
      'Unsupported camera motion: ' + motion
    );
  }

  await fs.access(photoPath);
  await fs.access(audioPath);

  await fs.mkdir(path.dirname(outputPath), {
    recursive: true
  });

  const filter = makeMotionFilter(motion, seconds);

  await runFFmpeg([
    '-loop', '1',
    '-framerate', String(FPS),
    '-i', photoPath,
    '-i', audioPath,
    '-filter_complex', `[0:v]${filter}[v]`,
    '-map', '[v]',
    '-map', '1:a:0',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '21',
    '-pix_fmt', 'yuv420p',
    '-r', String(FPS),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-t', String(seconds),
    '-shortest',
    '-movflags', '+faststart',
    outputPath
  ]);

  const info = await fs.stat(outputPath);

  if (info.size === 0) {
    throw new Error(
      'Generated video is empty.'
    );
  }

  return {
    ok: true,
    engine: 'Zala Independent Video Engine v3',
    outputPath,
    durationSeconds: seconds,
    resolution: `${WIDTH}x${HEIGHT}`,
    fps: FPS,
    motion,
    bytes: info.size,
    externalGenerationCredits: 0
  };
}
