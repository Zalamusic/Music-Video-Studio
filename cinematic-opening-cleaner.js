
/**
 * Zala QI's World
 * Cinematic Opening Cleaner v2
 *
 * Detects abrupt opening-frame changes and short freezes.
 * Uses FFmpeg only; no paid API.
 */

import { spawn } from 'node:child_process';

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, {
      stdio: ['ignore', 'ignore', 'pipe']
    });

    let stderr = '';
    let settled = false;

    child.stderr.on('data', chunk => {
      stderr = (
        stderr + chunk.toString()
      ).slice(-20000);
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
        resolve(stderr);
      } else {
        reject(new Error(
          stderr.slice(-2000) || 'FFmpeg failed'
        ));
      }
    });
  });
}

/**
 * Detect a strong visual cut near the beginning.
 *
 * This catches cases where the uploaded photograph
 * appears for one frame before the generated scene.
 */
async function detectOpeningFlash(videoFile) {
  const output = await runFFmpeg([
    '-hide_banner',
    '-i', videoFile,
    '-t', '1.2',
    '-vf',
    "select='gt(scene,0.35)',showinfo",
    '-an',
    '-f', 'null',
    '-'
  ]);

  const match = output.match(
    /Parsed_showinfo[^\n]*pts_time:\s*([\d.]+)/
  );

  if (!match) return 0;

  const time = Number(match[1]);

  if (!Number.isFinite(time)) return 0;

  // Avoid removing intentional opening sequences.
  if (time < 0.02 || time > 0.65) {
    return 0;
  }

  return time;
}

/**
 * Detect a short frozen opening.
 */
async function detectOpeningFreeze(videoFile) {
  const output = await runFFmpeg([
    '-hide_banner',
    '-i', videoFile,
    '-t', '2',
    '-vf',
    'freezedetect=n=-50dB:d=0.15',
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
  if (freezeEnd < 0.2 || freezeEnd > 1.5) {
    return 0;
  }

  return Math.min(freezeEnd + 0.04, 1.5);
}

/**
 * Clean and normalize a generated video.
 */
async function cleanOpening(input, output, format) {
  let trimSeconds = 0;
  let reason = 'none';

  try {
    const flash = await detectOpeningFlash(input);

    if (flash > 0) {
      trimSeconds = flash;
      reason = 'opening-frame-change';
    } else {
      const freeze = await detectOpeningFreeze(input);

      if (freeze > 0) {
        trimSeconds = freeze;
        reason = 'frozen-opening';
      }
    }
  } catch (error) {
    console.error(
      'Opening detection unavailable:',
      error.message
    );
  }

  const width = format === 'landscape'
    ? 1280 : 720;

  const height = format === 'landscape'
    ? 720 : 1280;

  const args = [
    '-hide_banner',
    '-y'
  ];

  if (trimSeconds > 0) {
    args.push(
      '-ss',
      trimSeconds.toFixed(6)
    );
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
    trimSeconds,
    reason
  };
}

export {
  cleanOpening,
  detectOpeningFlash,
  detectOpeningFreeze
};
