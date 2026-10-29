
import { spawn } from 'node:child_process';

function run(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(
          'Video analysis failed: ' + stderr.slice(-500)
        ));
      }
      resolve({ stdout, stderr });
    });
  });
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

async function inspectVideo(filePath) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries',
    'stream=width,height,avg_frame_rate:format=duration',
    '-of', 'json',
    filePath
  ]);

  const data = JSON.parse(stdout);
  const stream = data.streams?.[0];

  if (!stream) {
    throw new Error('No video stream found.');
  }

  const [numerator, denominator] =
    (stream.avg_frame_rate || '0/1')
      .split('/')
      .map(Number);

  const fps = denominator
    ? numerator / denominator
    : 0;

  return {
    width: stream.width,
    height: stream.height,
    fps,
    duration: Number(data.format?.duration || 0)
  };
}

async function measureSharpness(filePath) {
  const { stderr } = await run('ffmpeg', [
    '-hide_banner',
    '-nostdin',
    '-i', filePath,
    '-vf', 'fps=1/5,scale=320:-2,blurdetect',
    '-an',
    '-f', 'null',
    '-'
  ]);

  const values = [
    ...stderr.matchAll(/blur mean:\s*([\d.]+)/g)
  ].map(match => Number(match[1]));

  if (!values.length) {
    return null;
  }

  return values.reduce((a, b) => a + b, 0) /
    values.length;
}

async function checkVideoQuality(filePath) {
  const info = await inspectVideo(filePath);
  const blur = await measureSharpness(filePath);

  const resolutionScore = clamp(
    Math.min(info.width, info.height) / 720 * 100
  );

  const frameRateScore = clamp(
    info.fps / 24 * 100
  );

  const durationScore =
    info.duration >= 2 ? 100 : 0;

  const technicalScore = Math.round(
    resolutionScore * 0.45 +
    frameRateScore * 0.35 +
    durationScore * 0.20
  );

  return {
    score: technicalScore,
    category: 'technical-quality',
    metrics: {
      resolution: Math.round(resolutionScore),
      frameRate: Math.round(frameRateScore),
      duration: durationScore,
      blurEstimate: blur
    },
    video: info,
    threshold: 90,
    passedTechnicalThreshold: technicalScore >= 90,
    evaluatedAt: new Date().toISOString()
  };
}

export {
  inspectVideo,
  measureSharpness,
  checkVideoQuality
};
