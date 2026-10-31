
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

const SAMPLE_RATE = 11025;
const WINDOW_SECONDS = 0.1;
const SAMPLES_PER_WINDOW = Math.round(SAMPLE_RATE * WINDOW_SECONDS);

function decodeEnergy(audioPath, maxSeconds) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-i', audioPath,
      '-map', '0:a:0',
      '-ac', '1',
      '-ar', String(SAMPLE_RATE),
      '-f', 's16le',
      '-t', String(maxSeconds),
      'pipe:1'
    ];

    const child = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const energy = [];
    let pending = Buffer.alloc(0);
    let sumSquares = 0;
    let count = 0;
    let errorText = '';
    let settled = false;

    child.stderr.on('data', chunk => {
      errorText = (errorText + chunk.toString()).slice(-1500);
    });

    child.stdout.on('data', chunk => {
      pending = Buffer.concat([pending, chunk]);
      const bytes = pending.length - (pending.length % 2);

      for (let offset = 0; offset < bytes; offset += 2) {
        const sample = pending.readInt16LE(offset) / 32768;
        sumSquares += sample * sample;
        count++;

        if (count === SAMPLES_PER_WINDOW) {
          energy.push(Math.sqrt(sumSquares / count));
          sumSquares = 0;
          count = 0;
        }
      }

      pending = Buffer.from(pending.subarray(bytes));
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

      if (code !== 0) {
        return reject(new Error(
          errorText || 'Audio decoding failed'
        ));
      }

      if (count) {
        energy.push(Math.sqrt(sumSquares / count));
      }

      if (!energy.length) {
        return reject(new Error(
          'No decodable audio samples'
        ));
      }

      resolve(energy);
    });
  });
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function round(value) {
  return Number(value.toFixed(2));
}

export async function analyzeMusic(audioPath, options = {}) {
  if (
    typeof audioPath !== 'string' ||
    !audioPath.trim()
  ) {
    throw new Error('Audio path required');
  }

  await stat(audioPath);

  const maxSeconds = clamp(
    Number(options.maxAnalysisSeconds) || 360,
    1,
    360
  );

  const maxSceneSeconds = clamp(
    Number(options.maxSceneSeconds) || 15,
    3,
    30
  );

  const minSceneSeconds = clamp(
    Number(options.minSceneSeconds) || 6,
    1,
    maxSceneSeconds
  );

  const energy = await decodeEnergy(
    audioPath,
    maxSeconds
  );

  const durationSeconds =
    energy.length * WINDOW_SECONDS;

  const novelty = energy.map((value, index) =>
    index === 0
      ? 0
      : Math.max(0, value - energy[index - 1])
  );

  const sorted = [...novelty].sort(
    (a, b) => a - b
  );

  const threshold =
    sorted[Math.floor(sorted.length * 0.85)] || 0;

  const accents = [];
  let previous = -Infinity;

  for (let i = 1; i < novelty.length - 1; i++) {
    const time = i * WINDOW_SECONDS;

    if (
      novelty[i] > threshold &&
      novelty[i] >= novelty[i - 1] &&
      novelty[i] > novelty[i + 1] &&
      time - previous >= 0.25
    ) {
      previous = time;
      accents.push(round(time));
    }
  }

  const intervals = accents
    .slice(1)
    .map((time, index) => time - accents[index])
    .filter(value => value >= 0.3 && value <= 1.5)
    .sort((a, b) => a - b);

  const median = intervals.length >= 4
    ? intervals[Math.floor(intervals.length / 2)]
    : null;

  const bpmEstimate = median
    ? Math.round(clamp(60 / median, 60, 200))
    : null;

  const scenes = [];
  const globalAverage = energy.reduce(
    (a, b) => a + b,
    0
  ) / energy.length;

  let start = 0;

  while (start < durationSeconds - 0.05) {
    const remaining = durationSeconds - start;

    let end = Math.min(
      durationSeconds,
      start + maxSceneSeconds
    );

    if (remaining > maxSceneSeconds + minSceneSeconds) {
      const candidates = accents.filter(
        time =>
          time >= start + minSceneSeconds &&
          time <= end
      );

      if (candidates.length) {
        end = candidates[candidates.length - 1];
      }
    }

    if (
      durationSeconds - end < minSceneSeconds &&
      durationSeconds - end > 0
    ) {
      end = durationSeconds;
    }

    if (end <= start) {
      end = durationSeconds;
    }

    const first = Math.floor(
      start / WINDOW_SECONDS
    );

    const last = Math.min(
      energy.length,
      Math.ceil(end / WINDOW_SECONDS)
    );

    const segment = energy.slice(first, last);

    const average = segment.reduce(
      (a, b) => a + b,
      0
    ) / (segment.length || 1);

    const intensity =
      average > globalAverage * 1.2
        ? 'high'
        : average < globalAverage * 0.8
          ? 'low'
          : 'medium';

    const third = Math.max(
      1,
      Math.floor(segment.length / 3)
    );

    const early = segment.slice(0, third);
    const late = segment.slice(-third);

    const firstEnergy = early.reduce(
      (a, b) => a + b,
      0
    ) / early.length;

    const lastEnergy = late.reduce(
      (a, b) => a + b,
      0
    ) / late.length;

    const energyChange =
      lastEnergy > firstEnergy * 1.15
        ? 'rising'
        : lastEnergy < firstEnergy * 0.85
          ? 'falling'
          : 'steady';

    scenes.push({
      scene: scenes.length + 1,
      startSeconds: round(start),
      endSeconds: round(end),
      durationSeconds: round(end - start),
      intensity,
      energyChange,
      suggestedShot:
        intensity === 'high'
          ? 'dynamic wide or tracking shot'
          : intensity === 'low'
            ? 'intimate close-up'
            : 'smooth cinematic medium shot',
      transition:
        energyChange === 'rising'
          ? 'cut on musical accent'
          : 'clean cut'
    });

    start = end;
  }

  return {
    engine: 'Zala Music Intelligence v1',
    durationSeconds: round(durationSeconds),
    bpmEstimate,
    detectedAccents: accents.length,
    scenes,
    notes:
      'Rhythm and energy estimates are heuristic, ' +
      'not verified beat or chorus detection.'
  };
}
