
import { spawn } from 'node:child_process';

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, {
      stdio: ['ignore', 'ignore', 'pipe']
    });

    let stderr = '';

    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk.toString()).slice(-10000);
    });

    child.on('error', reject);

    child.on('close', code => {
      if (code === 0) resolve(stderr);
      else reject(new Error(stderr.slice(-1500)));
    });
  });
}

async function detectOpeningFreeze(videoFile) {
  const output = await runFFmpeg([
    '-hide_banner',
    '-i', videoFile,
    '-vf',
    'freezedetect=n=-50dB:d=0.15',
    '-t', '2',
    '-an',
    '-f', 'null',
    '-'
  ]);

  const start = output.match(
    /lavfi\.freezedetect\.freeze_start:\s*([\d.]+)/
  );

  const end = output.match(
    /lavfi\.freezedetect\.freeze_end:\s*([\d.]+)/
  );

  if (!start || !end) return 0;

  const freezeStart = Number(start[1]);
  const freezeEnd = Number(end[1]);

  if (!Number.isFinite(freezeStart) ||
      !Number.isFinite(freezeEnd)) {
    return 0;
  }

  if (freezeStart > 0.12) return 0;
  if (freezeEnd < 0.2 || freezeEnd > 1.5) return 0;

  return Math.min(freezeEnd + 0.04, 1.5);
}

async function cleanOpening(input, output, format) {
  const trimSeconds = await detectOpeningFreeze(input);

  const width = format === 'landscape' ? 1280 : 720;
  const height = format === 'landscape' ? 720 : 1280;

  const args = [
    '-hide_banner',
    '-y'
  ];

  if (trimSeconds > 0) {
    args.push('-ss', trimSeconds.toFixed(3));
  }

  args.push(
    '-i', input,
    '-vf',
    `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},setsar=1,fps=24`,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    output
  );

  await runFFmpeg(args);

  return {
    trimmed: trimSeconds > 0,
    trimSeconds
  };
}

export { cleanOpening, detectOpeningFreeze };
