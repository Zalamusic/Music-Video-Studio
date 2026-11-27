
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 120000;
const MAX_SCENE_CHANGES = 500;

function runCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`${command} timed out.`));
    }, timeoutMs);

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (error) reject(error);
      else resolve(result);
    }

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.length > 2000000) {
        child.kill('SIGKILL');
        finish(new Error('Command output exceeded limit.'));
      }
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      if (stderr.length > 2000000) {
        child.kill('SIGKILL');
        finish(new Error('Command log exceeded limit.'));
      }
    });

    child.on('error', error => finish(error));

    child.on('close', code => {
      if (code !== 0) {
        return finish(
          new Error(
            `${command} failed: ${stderr.slice(-1200)}`
          )
        );
      }

      finish(null, { stdout, stderr });
    });
  });
}

function round(value, digits = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function parseFrameRate(value) {
  if (!value || value === '0/0') return null;

  const parts = String(value).split('/');

  if (parts.length === 2) {
    const numerator = Number(parts[0]);
    const denominator = Number(parts[1]);

    if (!denominator) return null;

    return round(numerator / denominator, 3);
  }

  return round(value, 3);
}

async function inspectMedia(videoFile) {
  const { stdout } = await runCommand('ffprobe', [
    '-v', 'error',
    '-show_format',
    '-show_streams',
    '-of', 'json',
    videoFile
  ]);

  const info = JSON.parse(stdout);

  const streams = info.streams || [];

  const video = streams.find(
    stream => stream.codec_type === 'video'
  );

  const audio = streams.find(
    stream => stream.codec_type === 'audio'
  );

  if (!video) {
    throw new Error('No video stream was found.');
  }

  const duration = Number(
    info.format?.duration || video.duration || 0
  );

  return {
    durationSeconds: round(duration, 3),
    width: video.width || null,
    height: video.height || null,
    frameRate: parseFrameRate(
      video.avg_frame_rate || video.r_frame_rate
    ),
    videoCodec: video.codec_name || 'unknown',
    pixelFormat: video.pix_fmt || null,
    bitrateKbps: round(
      Number(info.format?.bit_rate || 0) / 1000
    ),
    fileSizeMB: round(
      Number(info.format?.size || 0) / 1048576
    ),
    hasAudio: Boolean(audio),
    audioCodec: audio?.codec_name || null,
    audioSampleRate: audio
      ? Number(audio.sample_rate) || null
      : null,
    audioChannels: audio?.channels || null,
    audioDurationSeconds: audio
      ? round(audio.duration)
      : null
  };
}

async function detectSceneChanges(videoFile, options = {}) {
  const threshold = Math.min(
    0.9,
    Math.max(0.1, Number(options.sceneThreshold) || 0.35)
  );

  const { stderr } = await runCommand('ffmpeg', [
    '-hide_banner',
    '-nostdin',
    '-i', videoFile,
    '-vf',
    `select='gt(scene,${threshold})',showinfo`,
    '-an',
    '-f', 'null',
    '-'
  ], {
    timeoutMs: options.timeoutMs || 180000
  });

  const times = [];
  const pattern = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;

  let match;

  while ((match = pattern.exec(stderr)) !== null) {
    const time = round(match[1], 3);

    if (
      time !== null &&
      (times.length === 0 ||
        time > times[times.length - 1])
    ) {
      times.push(time);
    }

    if (times.length >= MAX_SCENE_CHANGES) break;
  }

  return {
    threshold,
    count: times.length,
    timestampsSeconds: times,
    truncated: times.length >= MAX_SCENE_CHANGES
  };
}

function createSceneIntervals(duration, timestamps) {
  const boundaries = [
    0,
    ...timestamps.filter(
      time => time > 0 && time < duration
    ),
    duration
  ];

  const scenes = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];

    scenes.push({
      sceneNumber: i + 1,
      startSeconds: round(start, 3),
      endSeconds: round(end, 3),
      durationSeconds: round(end - start, 3)
    });
  }

  return scenes;
}

function buildQualityReport(media, sceneChanges, scenes) {
  const warnings = [];
  const recommendations = [];

  if (media.width < 720 || media.height < 720) {
    warnings.push('Video resolution may be low.');
    recommendations.push(
      'Use higher-resolution footage where available.'
    );
  }

  if (media.frameRate && media.frameRate < 20) {
    warnings.push('Low frame rate detected.');
    recommendations.push(
      'Review playback for uneven motion.'
    );
  }

  if (!media.hasAudio) {
    warnings.push('No audio stream detected.');
    recommendations.push(
      'Add or verify the soundtrack before delivery.'
    );
  }

  const shortScenes = scenes.filter(
    scene => scene.durationSeconds < 0.5
  );

  if (shortScenes.length > 0) {
    warnings.push(
      `${shortScenes.length} very short scene intervals detected.`
    );

    recommendations.push(
      'Review rapid cuts for visual comfort.'
    );
  }

  const averageSceneSeconds = scenes.length
    ? round(
        scenes.reduce(
          (total, scene) =>
            total + scene.durationSeconds,
          0
        ) / scenes.length
      )
    : null;

  return {
    technicalStatus: warnings.length
      ? 'review_recommended'
      : 'basic_checks_passed',
    warnings,
    recommendations,
    detectedScenes: scenes.length,
    averageSceneSeconds,
    note:
      'This is an automated technical assessment. ' +
      'It does not prove artistic quality, identity ' +
      'consistency, lip-sync accuracy, or musical alignment.'
  };
}

export async function analyzeVideo(videoFile, options = {}) {
  if (!videoFile || typeof videoFile !== 'string') {
    throw new Error('A video file path is required.');
  }

  const file = path.resolve(videoFile);

  const stats = await fs.stat(file);

  if (!stats.isFile()) {
    throw new Error('The video path is not a file.');
  }

  if (stats.size === 0) {
    throw new Error('The video file is empty.');
  }

  const media = await inspectMedia(file);

  if (
    !media.durationSeconds ||
    media.durationSeconds <= 0
  ) {
    throw new Error('Unable to determine video duration.');
  }

  const sceneChanges = await detectSceneChanges(
    file,
    options
  );

  const scenes = createSceneIntervals(
    media.durationSeconds,
    sceneChanges.timestampsSeconds
  );

  const quality = buildQualityReport(
    media,
    sceneChanges,
    scenes
  );

  return {
    ok: true,
    engine: 'Zala QI Video Intelligence v1',
    analyzedAt: new Date().toISOString(),
    filename: path.basename(file),
    media,
    sceneChanges,
    scenes,
    quality,
    generationProviderUsed: false,
    note:
      'Analysis completed without generating new video.'
  };
}

export default analyzeVideo;
