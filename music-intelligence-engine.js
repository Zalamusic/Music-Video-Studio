
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

const SAMPLE_RATE = 11025;
const WINDOW_SECONDS = 0.1;
const WINDOW_SAMPLES = Math.round(
  SAMPLE_RATE * WINDOW_SECONDS
);

const clamp = (v, low, high) =>
  Math.max(low, Math.min(high, v));

const round = v =>
  Number(v.toFixed(2));

function average(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) /
    values.length;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function decodeAudio(audioPath, maxSeconds) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-v', 'error',
      '-i', audioPath,
      '-map', '0:a:0',
      '-ac', '1',
      '-ar', String(SAMPLE_RATE),
      '-t', String(maxSeconds),
      '-f', 's16le',
      'pipe:1'
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const windows = [];
    let pending = Buffer.alloc(0);
    let errorText = '';
    let settled = false;

    let count = 0;
    let squares = 0;
    let crossings = 0;
    let differences = 0;
    let bassSquares = 0;
    let previous = 0;
    let lowpass = 0;

    const lowpassAlpha =
      1 - Math.exp(-2 * Math.PI * 180 / SAMPLE_RATE);

    function finishWindow() {
      if (!count) return;

      const rms = Math.sqrt(squares / count);

      windows.push({
        energy: rms,
        brightness: differences / count,
        zeroCrossingRate: crossings / count,
        bassRatio: clamp(
          Math.sqrt(bassSquares / count) /
            Math.max(rms, 0.000001),
          0,
          1
        )
      });

      count = 0;
      squares = 0;
      crossings = 0;
      differences = 0;
      bassSquares = 0;
    }

    child.stdout.on('data', chunk => {
      pending = Buffer.concat([pending, chunk]);

      const bytes = pending.length -
        (pending.length % 2);

      for (let i = 0; i < bytes; i += 2) {
        const sample =
          pending.readInt16LE(i) / 32768;

        lowpass += lowpassAlpha *
          (sample - lowpass);

        squares += sample * sample;
        bassSquares += lowpass * lowpass;
        differences += Math.abs(sample - previous);

        if (
          (sample >= 0 && previous < 0) ||
          (sample < 0 && previous >= 0)
        ) {
          crossings++;
        }

        previous = sample;
        count++;

        if (count >= WINDOW_SAMPLES) {
          finishWindow();
        }
      }

      pending = Buffer.from(
        pending.subarray(bytes)
      );
    });

    child.stderr.on('data', chunk => {
      errorText = (
        errorText + chunk.toString()
      ).slice(-1500);
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
        return reject(new Error(
          errorText || 'Audio decoding failed.'
        ));
      }

      finishWindow();

      if (!windows.length) {
        return reject(new Error(
          'No decodable audio samples.'
        ));
      }

      resolve(windows);
    });
  });
}

function findAccents(windows) {
  const novelty = windows.map((window, i) => {
    if (i === 0) return 0;

    const energyRise = Math.max(
      0,
      window.energy - windows[i - 1].energy
    );

    const brightnessRise = Math.max(
      0,
      window.brightness -
        windows[i - 1].brightness
    );

    return energyRise + brightnessRise * 0.15;
  });

  const sorted = [...novelty].sort(
    (a, b) => a - b
  );

  const threshold =
    sorted[Math.floor(sorted.length * 0.85)] || 0;

  const accents = [];
  let previousTime = -Infinity;

  for (let i = 1; i < novelty.length - 1; i++) {
    const time = i * WINDOW_SECONDS;

    if (
      novelty[i] > threshold &&
      novelty[i] >= novelty[i - 1] &&
      novelty[i] > novelty[i + 1] &&
      time - previousTime >= 0.25
    ) {
      accents.push(round(time));
      previousTime = time;
    }
  }

  return accents;
}

function estimateTempo(accents) {
  const intervals = [];

  for (let i = 1; i < accents.length; i++) {
    const interval = accents[i] - accents[i - 1];

    if (interval >= 0.3 && interval <= 1.5) {
      intervals.push(interval);
    }
  }

  if (intervals.length < 4) {
    return {
      bpm: null,
      confidence: 'insufficient'
    };
  }

  const interval = median(intervals);
  const bpm = 60 / interval;

  const consistency = intervals.filter(
    value =>
      Math.abs(value - interval) <
      interval * 0.15
  ).length / intervals.length;

  return {
    bpm: Math.round(clamp(bpm, 60, 200)),
    confidence:
      consistency >= 0.65
        ? 'medium'
        : 'low'
  };
}

function classifyTexture(features, global) {
  if (features.energy < global.energy * 0.65) {
    return 'quiet or restrained';
  }

  if (
    features.bassRatio > global.bassRatio * 1.2 &&
    features.bassRatio > 0.25
  ) {
    return 'bass-forward';
  }

  if (
    features.brightness >
    global.brightness * 1.25
  ) {
    return 'bright or percussive';
  }

  if (
    features.zeroCrossingRate >
    global.zeroCrossingRate * 1.3
  ) {
    return 'busy or textured';
  }

  return 'balanced';
}

function makeScene(
  windows,
  start,
  end,
  number,
  global,
  accents
) {
  const first = Math.floor(
    start / WINDOW_SECONDS
  );

  const last = Math.min(
    windows.length,
    Math.ceil(end / WINDOW_SECONDS)
  );

  const section = windows.slice(first, last);

  const energy = average(
    section.map(x => x.energy)
  );

  const brightness = average(
    section.map(x => x.brightness)
  );

  const bassRatio = average(
    section.map(x => x.bassRatio)
  );

  const zeroCrossingRate = average(
    section.map(x => x.zeroCrossingRate)
  );

  const intensity =
    energy > global.energy * 1.2
      ? 'high'
      : energy < global.energy * 0.8
        ? 'low'
        : 'medium';

  const third = Math.max(
    1,
    Math.floor(section.length / 3)
  );

  const early = average(
    section.slice(0, third).map(x => x.energy)
  );

  const late = average(
    section.slice(-third).map(x => x.energy)
  );

  const energyChange =
    late > early * 1.15
      ? 'rising'
      : late < early * 0.85
        ? 'falling'
        : 'steady';

  const features = {
    energy,
    brightness,
    bassRatio,
    zeroCrossingRate
  };

  const texture = classifyTexture(
    features,
    global
  );

  const sceneAccents = accents.filter(
    time => time >= start && time < end
  );

  let suggestedShot;
  let cameraMovement;

  if (intensity === 'high') {
    suggestedShot =
      'dynamic wide or tracking shot';
    cameraMovement =
      'energetic tracking or crane movement';
  } else if (intensity === 'low') {
    suggestedShot =
      'intimate close-up';
    cameraMovement =
      'restrained dolly or gentle slider';
  } else {
    suggestedShot =
      'smooth cinematic medium shot';
    cameraMovement =
      'controlled tracking or orbit';
  }

  return {
    scene: number,
    startSeconds: round(start),
    endSeconds: round(end),
    durationSeconds: round(end - start),
    intensity,
    energyChange,
    suggestedShot,
    cameraMovement,
    transition:
      energyChange === 'rising'
        ? 'cut on musical accent'
        : 'clean cut',
    musicalTexture: texture,
    accentCount: sceneAccents.length,
    audioFeatures: {
      rmsEnergy: round(energy),
      brightnessProxy: round(brightness),
      bassRatioProxy: round(bassRatio),
      zeroCrossingRate: round(zeroCrossingRate)
    }
  };
}

export async function analyzeMusic(
  audioPath,
  options = {}
) {
  if (
    typeof audioPath !== 'string' ||
    !audioPath.trim()
  ) {
    throw new Error('Audio path required.');
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

  const windows = await decodeAudio(
    audioPath,
    maxSeconds
  );

  const durationSeconds =
    windows.length * WINDOW_SECONDS;

  const global = {
    energy: average(
      windows.map(x => x.energy)
    ),
    brightness: average(
      windows.map(x => x.brightness)
    ),
    bassRatio: average(
      windows.map(x => x.bassRatio)
    ),
    zeroCrossingRate: average(
      windows.map(x => x.zeroCrossingRate)
    )
  };

  const accents = findAccents(windows);
  const tempo = estimateTempo(accents);

  const scenes = [];
  let start = 0;

  while (start < durationSeconds - 0.05) {
    const remaining = durationSeconds - start;

    let end = Math.min(
      durationSeconds,
      start + maxSceneSeconds
    );

    if (
      remaining >
      maxSceneSeconds + minSceneSeconds
    ) {
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

    scenes.push(
      makeScene(
        windows,
        start,
        end,
        scenes.length + 1,
        global,
        accents
      )
    );

    start = end;
  }

  const highEnergyScenes = scenes.filter(
    x => x.intensity === 'high'
  ).length;

  const lowEnergyScenes = scenes.filter(
    x => x.intensity === 'low'
  ).length;

  return {
    engine: 'CutLoopz Music Intelligence v2',
    version: 2,
    durationSeconds: round(durationSeconds),
    bpmEstimate: tempo.bpm,
    bpmConfidence: tempo.confidence,
    detectedAccents: accents.length,
    analysis: {
      sampleRate: SAMPLE_RATE,
      windowSeconds: WINDOW_SECONDS,
      averageEnergy: round(global.energy),
      averageBrightnessProxy:
        round(global.brightness),
      averageBassRatioProxy:
        round(global.bassRatio),
      highEnergyScenes,
      lowEnergyScenes,
      musicalCharacter:
        classifyTexture(global, global)
    },
    scenes,
    notes:
      'Audio-derived rhythm, loudness, and texture ' +
      'estimates. BPM is approximate. Brightness and ' +
      'bass measurements are simplified proxies, not ' +
      'spectral measurements. Genre, lyrical meaning, ' +
      'and emotional intent require additional context.'
  };
}
