
/**
 * CutLoopz Media — Story Intelligence v1
 *
 * Zero paid API calls.
 * Creates a preliminary, lyric-aware director plan.
 *
 * This is a rule-based foundation, NOT automatic
 * transcription or language-model interpretation.
 *
 * Does not modify existing generation engines.
 */

const MAX_SECONDS = 360;
const MAX_LYRICS = 30000;
const MAX_SCENES = 100;

const EMOTIONS = {
  heartbreak: [
    'heartbreak', 'broken', 'goodbye', 'left me',
    'miss you', 'tears', 'cry', 'lonely',
    'betrayed', 'hurt', 'lost you', 'without you'
  ],
  romance: [
    'love', 'kiss', 'hold me', 'baby',
    'together', 'forever', 'touch', 'embrace',
    'in your arms', 'falling for you'
  ],
  hope: [
    'hope', 'healing', 'tomorrow', 'rise',
    'stronger', 'believe', 'new beginning',
    'sunrise', 'freedom', 'moving on'
  ],
  conflict: [
    'fight', 'argue', 'lies', 'cheating',
    'betrayal', 'angry', 'shouting',
    'leave me alone', 'trust is gone'
  ],
  celebration: [
    'party', 'dance', 'celebrate', 'winning',
    'tonight', 'champagne', 'club',
    'success', 'living my life'
  ],
  reflection: [
    'remember', 'memories', 'thinking',
    'wonder', 'regret', 'yesterday',
    'used to', 'looking back'
  ]
};

const LOCATIONS = [
  ['bedroom', 'quiet bedroom'],
  ['kitchen', 'home kitchen'],
  ['restaurant', 'restaurant'],
  ['hotel', 'hotel'],
  ['rooftop', 'city rooftop'],
  ['beach', 'beach'],
  ['ocean', 'oceanfront'],
  ['street', 'city street'],
  ['club', 'nightclub'],
  ['church', 'church'],
  ['school', 'school'],
  ['airport', 'airport'],
  ['train', 'train station'],
  ['car', 'parked car or driving scene'],
  ['rain', 'rainy exterior'],
  ['home', 'home interior']
];

const SHOTS = {
  low: [
    'intimate cinematic close-up',
    'slow medium shot',
    'quiet over-the-shoulder shot'
  ],
  medium: [
    'cinematic tracking shot',
    'expressive medium shot',
    'wide environmental shot'
  ],
  high: [
    'dynamic wide shot',
    'sweeping crane shot',
    'energetic tracking shot'
  ]
};

const MOVEMENTS = {
  low: 'slow dolly-in with restrained movement',
  medium: 'smooth cinematic tracking movement',
  high: 'dynamic but controlled camera movement'
};

function clean(value, limit = 1000) {
  return typeof value === 'string'
    ? value.trim().slice(0, limit)
    : '';
}

function round(value) {
  return Number(value.toFixed(2));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizedText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectEmotion(text) {
  const content = normalizedText(text);
  const scores = {};

  for (const [emotion, keywords] of Object.entries(EMOTIONS)) {
    scores[emotion] = keywords.reduce(
      (total, keyword) =>
        total + (
          content.includes(keyword) ? 1 : 0
        ),
      0
    );
  }

  const ranking = Object.entries(scores)
    .sort((a, b) => b[1] - a[1]);

  if (!ranking.length || ranking[0][1] === 0) {
    return {
      primary: 'undetermined',
      confidence: 'low',
      scores
    };
  }

  return {
    primary: ranking[0][0],
    confidence:
      ranking[0][1] >= 3 ? 'medium' : 'low',
    scores
  };
}

function detectLocation(text) {
  const content = normalizedText(text);

  for (const [keyword, location] of LOCATIONS) {
    const pattern = new RegExp(
      `\\b${keyword}\\b`, 'i'
    );

    if (pattern.test(content)) {
      return location;
    }
  }

  return null;
}

function parseTimestamp(value) {
  const match = String(value).match(
    /^\s*(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?\s*$/
  );

  if (!match) return null;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = Number(
    (match[4] || '').padEnd(2, '0')
  ) / 100;

  if (
    minutes > 59 && match[1] ||
    seconds > 59
  ) return null;

  return hours * 3600 +
    minutes * 60 +
    seconds +
    fraction;
}

function parseLyrics(lyrics) {
  const lines = clean(lyrics, MAX_LYRICS)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const result = [];
  let currentSection = 'unlabeled';

  for (const line of lines) {
    const section = line.match(
      /^\[(verse|chorus|bridge|intro|outro|pre-chorus|hook|refrain|instrumental)[^\]]*\]$/i
    );

    if (section) {
      currentSection = section[1].toLowerCase();
      continue;
    }

    const timed = line.match(
      /^\[([0-9:.]+)\]\s*(.*)$/
    );

    if (timed) {
      const time = parseTimestamp(timed[1]);

      if (time !== null && timed[2].trim()) {
        result.push({
          time,
          text: timed[2].trim(),
          section: currentSection
        });
        continue;
      }
    }

    result.push({
      time: null,
      text: line,
      section: currentSection
    });
  }

  return result;
}

function buildTimeline(lines, duration) {
  if (!lines.length) return [];

  const hasAllTimes = lines.every(
    line => Number.isFinite(line.time)
  );

  if (hasAllTimes) {
    const sorted = [...lines]
      .sort((a, b) => a.time - b.time);

    return sorted.map((line, index) => ({
      ...line,
      startSeconds: clamp(
        line.time, 0, duration
      ),
      endSeconds: clamp(
        index + 1 < sorted.length
          ? sorted[index + 1].time
          : duration,
        0,
        duration
      ),
      timingSource: 'provided'
    })).filter(line =>
      line.endSeconds > line.startSeconds
    );
  }

  // Untimed lyrics are distributed approximately.
  // These timings are NOT verified vocal alignment.
  const slice = duration / lines.length;

  return lines.map((line, index) => ({
    ...line,
    startSeconds: round(index * slice),
    endSeconds: round(
      Math.min(duration, (index + 1) * slice)
    ),
    timingSource: 'estimated'
  }));
}

function normalizeMusicScenes(plan, duration, sceneSeconds) {
  const input = Array.isArray(plan?.scenes)
    ? plan.scenes
    : [];

  const valid = input
    .map(scene => ({
      startSeconds: Number(scene.startSeconds),
      endSeconds: Number(scene.endSeconds),
      intensity: ['low', 'medium', 'high'].includes(
        scene.intensity
      ) ? scene.intensity : 'medium',
      energyChange: clean(
        scene.energyChange, 40
      ) || 'steady'
    }))
    .filter(scene =>
      Number.isFinite(scene.startSeconds) &&
      Number.isFinite(scene.endSeconds) &&
      scene.startSeconds >= 0 &&
      scene.endSeconds > scene.startSeconds
    )
    .sort((a, b) => a.startSeconds - b.startSeconds);

  if (valid.length) return valid;

  const fallback = [];

  for (
    let start = 0;
    start < duration && fallback.length < MAX_SCENES;
    start += sceneSeconds
  ) {
    fallback.push({
      startSeconds: round(start),
      endSeconds: round(
        Math.min(duration, start + sceneSeconds)
      ),
      intensity: 'medium',
      energyChange: 'steady'
    });
  }

  return fallback;
}

function lyricsForInterval(timeline, start, end) {
  return timeline.filter(line =>
    line.startSeconds < end &&
    line.endSeconds > start
  );
}

function choose(items, index) {
  return items[index % items.length];
}

function storyAction(emotion, location) {
  const place = location || 'a consistent cinematic setting';

  const actions = {
    heartbreak:
      'The protagonist experiences separation or emotional distance; emphasize restrained, believable reactions.',
    romance:
      'Show a meaningful connection between the protagonist and a loved one, respecting the lyrics.',
    hope:
      'Show the protagonist moving toward a positive change or new possibility.',
    conflict:
      'Show interpersonal tension through expressions, distance and believable behavior.',
    celebration:
      'Show joyful movement and social energy consistent with the song.',
    reflection:
      'Show the protagonist reflecting on meaningful memories or past choices.',
    undetermined:
      'Use the customer concept to guide a purposeful visual performance.'
  };

  return `${actions[emotion] || actions.undetermined} Setting: ${place}.`;
}

export function createStoryIntelligencePlan({
  title = 'Untitled Song',
  lyrics = '',
  songSeconds,
  musicPlan = null,
  prompt = '',
  format = 'vertical',
  sceneSeconds = 15,
  visualStyle = 'photorealistic'
} = {}) {
  const duration = Number(songSeconds);
  const clipSeconds = Number(sceneSeconds);

  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_SECONDS
  ) {
    throw new Error(
      'Song duration must be between 0 and 360 seconds.'
    );
  }

  if (
    !Number.isFinite(clipSeconds) ||
    clipSeconds < 3 ||
    clipSeconds > 30
  ) {
    throw new Error(
      'Scene duration must be between 3 and 30 seconds.'
    );
  }

  const concept = clean(prompt, 4000);
  const lyricLines = parseLyrics(lyrics);
  const timeline = buildTimeline(
    lyricLines,
    duration
  );

  const musicScenes = normalizeMusicScenes(
    musicPlan,
    duration,
    clipSeconds
  ).slice(0, MAX_SCENES);

  const fullEmotion = detectEmotion(
    lyricLines.map(line => line.text).join(' ')
  );

  let previousLocation =
    detectLocation(concept) ||
    'location selected from customer concept';

  const scenes = musicScenes.map(
    (musicScene, index) => {
      const lines = lyricsForInterval(
        timeline,
        musicScene.startSeconds,
        musicScene.endSeconds
      );

      const lyricExcerpt = lines
        .map(line => line.text)
        .join(' ')
        .slice(0, 600);

      const emotion = detectEmotion(
        lyricExcerpt || concept
      );

      const primaryEmotion =
        emotion.primary === 'undetermined'
          ? fullEmotion.primary
          : emotion.primary;

      const location =
        detectLocation(lyricExcerpt) ||
        previousLocation;

      previousLocation = location;

      const intensity = musicScene.intensity;

      const shot = choose(
        SHOTS[intensity] || SHOTS.medium,
        index
      );

      const action = storyAction(
        primaryEmotion,
        location
      );

      const scenePrompt = [
        `CutLoopz cinematic music video: ${clean(title, 120)}.`,
        `Scene ${index + 1} of ${musicScenes.length}.`,
        `Time: ${round(musicScene.startSeconds)} to ${round(musicScene.endSeconds)} seconds.`,
        `Customer creative direction: ${concept || 'automatic story direction'}.`,
        `Lyrics associated with this section: ${lyricExcerpt || 'not available'}.`,
        `Primary emotional cue: ${primaryEmotion}.`,
        `Visual action: ${action}`,
        `Camera: ${shot}; ${MOVEMENTS[intensity]}.`,
        `Visual style: ${clean(visualStyle, 150)}.`,
        `Composition: ${format === 'landscape' ? '16:9' : '9:16'}.`,
        'Preserve recurring character identity, wardrobe and hairstyle.',
        'Maintain believable anatomy, physical movement and lighting.',
        'Avoid unrelated scenes, repeated shots, text and watermarks.'
      ].join(' ');

      return {
        number: index + 1,
        startSeconds: musicScene.startSeconds,
        endSeconds: musicScene.endSeconds,
        durationSeconds: round(
          musicScene.endSeconds -
          musicScene.startSeconds
        ),
        section: lines[0]?.section || 'unknown',
        lyricExcerpt,
        lyricTiming:
          lines[0]?.timingSource || 'unavailable',
        emotion: primaryEmotion,
        emotionConfidence: emotion.confidence,
        intensity,
        energyChange: musicScene.energyChange,
        location,
        shot,
        action,
        prompt: scenePrompt
      };
    }
  );

  return {
    version: 1,
    engine: 'CutLoopz Story Intelligence',
    status: 'preview',
    title: clean(title, 120),
    songSeconds: duration,
    totalScenes: scenes.length,
    lyricSource: lyricLines.length
      ? 'customer-provided'
      : 'none',
    lyricTiming: lyricLines.length
      ? timeline[0]?.timingSource
      : 'unavailable',
    storyEmotion: fullEmotion.primary,
    customerConcept: concept,
    scenes,
    limitations: [
      'No automatic vocal transcription in this version.',
      'Emotion detection uses keyword heuristics.',
      'Untimed lyrics use approximate timing.',
      'Storyboard prompts are not generated video footage.'
    ]
  };
}
