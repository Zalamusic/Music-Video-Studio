
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FPS = 24;
const MAX_SECONDS = 360;

const MOTIONS = new Set([
  'zoom',
  'zoomOut',
  'panLeft',
  'panRight'
]);

const FORMATS = {
  vertical: { width: 720, height: 1280 },
  landscape: { width: 1280, height: 720 }
};

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
      stdout = stdout.slice(-12000);
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      stderr = stderr.slice(-12000);
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
          `${command} failed: ${stderr || code}`
        ));
      }
    });
  });
}

async function probe(file) {
  const result = await run('ffprobe', [
    '-v', 'error',
    '-show_entries',
    'format=duration:stream=codec_type',
    '-of', 'json',
    file
  ]);

  return JSON.parse(result);
}

function makeMotionFilter(motion, seconds, width, height) {
  const frames = Math.max(1, Math.ceil(seconds * FPS));
  const last = Math.max(1, frames - 1);

  const progress = `(on/${last})`;
  const smooth =
    `(${progress}*${progress}*(3-2*${progress}))`;

  const minZoom = 1.02;
  const maxZoom = 1.12;
  const range = maxZoom - minZoom;

  const zoomIn = `${minZoom}+${range}*${smooth}`;
  const zoomOut = `${maxZoom}-${range}*${smooth}`;

  const positions = {
    zoom: {
      z: zoomIn,
      x: 'iw/2-iw/zoom/2',
      y: 'ih/2-ih/zoom/2'
    },
    zoomOut: {
      z: zoomOut,
      x: 'iw/2-iw/zoom/2',
      y: 'ih/2-ih/zoom/2'
    },
    panLeft: {
      z: '1.12',
      x: `(iw-iw/zoom)*(0.8-0.6*${smooth})`,
      y: 'ih/2-ih/zoom/2'
    },
    panRight: {
      z: '1.12',
      x: `(iw-iw/zoom)*(0.2+0.6*${smooth})`,
      y: 'ih/2-ih/zoom/2'
    }
  };

  const selected = positions[motion];

  return [
    `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase`,
    `crop=${width * 2}:${height * 2}`,
    'setsar=1',
    `zoompan=z='${selected.z}':x='${selected.x}':y='${selected.y}':d=1:s=${width}x${height}:fps=${FPS}`,
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
  motion = 'zoom',
  format = 'vertical'
}) {
  if (!photoPath || !audioPath || !outputPath) {
    throw new Error(
      'Photo, audio and output paths are required.'
    );
  }

  seconds = Number(seconds);

  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    seconds > MAX_SECONDS
  ) {
    throw new Error(
      'Duration must be between 0 and 360 seconds.'
    );
  }

  if (!MOTIONS.has(motion)) {
    throw new Error('Unsupported camera motion.');
  }

  if (!Object.hasOwn(FORMATS, format)) {
    throw new Error('Unsupported video format.');
  }

  const { width, height } = FORMATS[format];

  await fs.access(photoPath);
  await fs.access(audioPath);

  const audioInfo = await probe(audioPath);

  if (!audioInfo.streams?.some(
    stream => stream.codec_type === 'audio'
  )) {
    throw new Error('Uploaded song has no audio stream.');
  }

  const audioDuration = Number(
    audioInfo.format?.duration
  );

  if (
    !Number.isFinite(audioDuration) ||
    audioDuration < seconds
  ) {
    throw new Error(
      'The uploaded song is shorter than the requested video.'
    );
  }

  await fs.mkdir(path.dirname(outputPath), {
    recursive: true
  });

  const temporaryOutput = outputPath + '.partial.mp4';

  const filter = makeMotionFilter(
    motion,
    seconds,
    width,
    height
  );

  try {
    await run('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-nostdin',
      '-y',
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
      '-movflags', '+faststart',
      temporaryOutput
    ]);

    const outputInfo = await probe(temporaryOutput);

    const actualDuration = Number(
      outputInfo.format?.duration
    );

    if (
      !Number.isFinite(actualDuration) ||
      Math.abs(actualDuration - seconds) > 0.5
    ) {
      throw new Error(
        'Output duration did not match the requested duration.'
      );
    }

    if (
      !outputInfo.streams?.some(
        stream => stream.codec_type === 'video'
      ) ||
      !outputInfo.streams?.some(
        stream => stream.codec_type === 'audio'
      )
    ) {
      throw new Error(
        'Output must contain video and audio.'
      );
    }

    const fileInfo = await fs.stat(temporaryOutput);

    if (fileInfo.size <= 0) {
      throw new Error('Generated video is empty.');
    }

    await fs.rename(temporaryOutput, outputPath);

    return {
      ok: true,
      engine: 'Zala Independent Video Engine v4',
      outputPath,
      durationSeconds: actualDuration,
      resolution: `${width}x${height}`,
      fps: FPS,
      motion,
      format,
      bytes: fileInfo.size,
      externalGenerationCredits: 0
    };
  } catch (error) {
    await fs.rm(temporaryOutput, {
      force: true
    }).catch(() => {});

    throw error;
  }
}
