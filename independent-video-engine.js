
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FPS = 24;
const WIDTH = 720;
const HEIGHT = 1280;
const MAX_SECONDS = 360;

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

    child.stderr.on('data', data => {
      errorText += data.toString();
      if (errorText.length > 12000) {
        errorText = errorText.slice(-12000);
      }
    });

    child.on('error', reject);

    child.on('close', code => {
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
  const frames = Math.max(1, Math.ceil(seconds * FPS));

  const motion = {
    zoom: {
      z: "min(zoom+0.0007,1.18)",
      x: "iw/2-(iw/zoom/2)",
      y: "ih/2-(ih/zoom/2)"
    },
    panLeft: {
      z: "1.16",
      x: "max(0,(iw-iw/zoom)*(1-on/" + frames + "))",
      y: "ih/2-(ih/zoom/2)"
    },
    panRight: {
      z: "1.16",
      x: "(iw-iw/zoom)*on/" + frames,
      y: "ih/2-(ih/zoom/2)"
    },
    zoomOut: {
      z: "max(1.0,1.18-on*0.0007)",
      x: "iw/2-(iw/zoom/2)",
      y: "ih/2-(ih/zoom/2)"
    }
  };

  const selected = motion[style] || motion.zoom;

  return [
    `scale=${WIDTH * 2}:${HEIGHT * 2}:force_original_aspect_ratio=increase`,
    `crop=${WIDTH * 2}:${HEIGHT * 2}`,
    `zoompan=z='${selected.z}':x='${selected.x}':y='${selected.y}':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
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

  if (!Number.isFinite(seconds) ||
      seconds <= 0 ||
      seconds > MAX_SECONDS) {
    throw new Error(
      `Video duration must be between 0 and ${MAX_SECONDS} seconds.`
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
    '-crf', '23',
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
    throw new Error('Generated video is empty.');
  }

  return {
    ok: true,
    engine: 'Zala Independent Video Engine v1',
    outputPath,
    durationSeconds: seconds,
    resolution: `${WIDTH}x${HEIGHT}`,
    fps: FPS,
    motion,
    bytes: info.size,
    externalGenerationCredits: 0
  };
}
