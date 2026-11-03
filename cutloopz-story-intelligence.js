
/**
 * CutLoopz Media — Story Intelligence v2
 * Rule-based, zero paid API calls.
 * Storyboard preview only.
 * Compatible with server.js.
 */

const MAX_SECONDS = 360;
const MAX_LYRICS = 30000;
const MAX_SCENES = 100;

const EMOTIONS = {
  reassurance: [
    'safe with me', 'i will stay', "i'll stay",
    'still here', 'not going anywhere',
    "won't disappear", "won't turn away",
    'you are safe', "you're safe",
    'you can trust', 'i got you', 'not alone',
    'hold your hand', 'hand in mine',
    'you belong', 'place you land',
    'you do not have to', "you don't have to",
    'i see you', 'no need to pretend'
  ],
  vulnerability: [
    'scars', 'scar', 'afraid', 'fear', 'fears',
    'cry', 'tears', 'fall apart',
    'break in your voice', 'silence',
    'hurt', 'bleed', 'broken', 'hide',
    'alone', 'dark'
  ],
  heartbreak: [
    'goodbye', 'left me', 'lost you',
    'without you', 'betrayed', 'heartbreak',
    'miss you', 'walking away',
    'abandoned', 'lonely'
  ],
  romance: [
    'love', 'kiss', 'together', 'forever',
    'embrace', 'in your arms',
    'falling for you', 'heart',
    'hold me', 'touch'
  ],
  hope: [
    'healing', 'tomorrow', 'rise',
    'stronger', 'believe', 'new beginning',
    'sunrise', 'freedom', 'moving on',
    'breathe', 'home', 'light'
  ],
  conflict: [
    'fight', 'argue', 'lies', 'cheating',
    'betrayal', 'angry', 'shouting',
    'leave me alone', 'trust is gone'
  ],
  celebration: [
    'party', 'dance', 'celebrate',
    'winning', 'champagne', 'club',
    'success', 'living my life'
  ],
  reflection: [
    'remember', 'memories', 'thinking',
    'wonder', 'regret', 'yesterday',
    'used to', 'looking back', 'past'
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
    'intimate close-up',
    'over-the-shoulder two-shot',
    'patient medium close-up',
    'quiet wide establishing shot',
    'profile close-up'
  ],
  medium: [
    'cinematic tracking shot',
    'expressive medium two-shot',
    'wide environmental shot',
    'slow dolly-in',
    'layered foreground composition'
  ],
  high: [
    'sweeping crane shot',
    'dynamic wide shot',
    'controlled orbit shot',
    'energetic tracking shot',
    'dramatic low-angle shot'
  ]
};

const MOVEMENTS = {
  low: [
    'locked-off camera with subtle breathing room',
    'slow restrained dolly-in',
    'gentle lateral slider movement'
  ],
  medium: [
    'smooth cinematic tracking movement',
    'deliberate slow push-in',
    'controlled side-tracking movement'
  ],
  high: [
    'dynamic but controlled camera movement',
    'fluid rising crane movement',
    'wide moving reveal'
  ]
};

const BEATS = [
  {
    name: 'isolation',
    action:
      'Establish the protagonist alone, emotionally guarded, with restrained body language and an unoccupied space beside them.'
  },
  {
    name: 'recognition',
    action:
      'Show another recurring character noticing the protagonist’s discomfort without intruding; use a meaningful glance and respectful distance.'
  },
  {
    name: 'first-contact',
    action:
      'A quiet gesture of support invites connection; the protagonist hesitates, then acknowledges the gesture.'
  },
  {
    name: 'trust',
    action:
      'Show a small, believable moment of trust through shared space, attentive listening and natural expressions.'
  },
  {
    name: 'vulnerability',
    action:
      'The protagonist permits an honest moment of vulnerability; the companion stays present without attempting to fix everything.'
  },
  {
    name: 'acceptance',
    action:
      'Show an unforced act of acceptance: the companion remains nearby as the protagonist relaxes their guarded posture.'
  },
  {
    name: 'connection',
    action:
      'A meaningful shared action reveals growing emotional security; preserve the same characters and relationship.'
  },
  {
    name: 'setback',
    action:
      'A memory or hesitation briefly interrupts progress; communicate it through performance, not an unrelated new subplot.'
  },
  {
    name: 'reassurance',
    action:
      'The companion responds with calm reassurance; show the protagonist realizing the connection is dependable.'
  },
  {
    name: 'healing',
    action:
      'Convey gradual relief through a change in posture, expression and a subtle increase in warmth of light.'
  },
  {
    name: 'choice',
    action:
      'The protagonist makes a small, active choice to trust rather than withdraw.'
  },
  {
    name: 'belonging',
    action:
      'Show both characters comfortable together in a familiar place, emphasizing a sense of belonging.'
  },
  {
    name: 'resolution',
    action:
      'Resolve the emotional question visually: the protagonist is no longer isolated, without exaggerating the transformation.'
  },
  {
    name: 'afterglow',
    action:
      'Allow a quiet, intimate moment of stillness; show comfort rather than spectacle.'
  },
  {
    name: 'closing',
    action:
      'End on a clear, memorable composition that visually communicates safety, presence and continuity.'
  }
];

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

function phrasePresent(text, phrase) {
  const needle = normalizedText(phrase);

  return needle &&
    (` ${text} `).includes(` ${needle} `);
}

function detectEmotion(text, concept = '') {
  const content = normalizedText(text);
  const context = normalizedText(concept);
  const scores = {};

  for (const [emotion, keywords] of Object.entries(EMOTIONS)) {
    scores[emotion] = keywords.reduce(
      (total, keyword) =>
        total + (phrasePresent(content, keyword) ? 1 : 0),
      0
    );
  }

  const reassurance =
    scores.reassurance > 0 ||
    /(?:i|we) (?:will|won't|wont|can|am|i'm|i'll) (?:stay|never leave|be here|hold|protect)/.test(content);

  if (reassurance) {
    scores.reassurance += 3;
    scores.heartbreak = Math.max(
      0,
      scores.heartbreak - 1
    );
  }

  if (
    phrasePresent(content, 'not walking away') ||
    phrasePresent(content, "won't disappear")
  ) {
    scores.heartbreak = Math.max(
      0,
      scores.heartbreak - 2
    );
  }

  if (
    phrasePresent(context, 'unconditional love') ||
    phrasePresent(context, 'emotional security')
  ) {
    if (scores.reassurance) {
      scores.reassurance += 1;
    }
  }

  const ranked = Object.entries(scores)
    .sort((a, b) => b[1] - a[1]);

  const best = ranked[0];

  return {
    primary:
      best?.[1] > 0 ? best[0] : 'undetermined',
    confidence:
      best?.[1] >= 4 ? 'medium' : 'low',
    scores
  };
}

function detectLocation(text) {
  const content = normalizedText(text);

  for (const [keyword, location] of LOCATIONS) {
    if (phrasePresent(content, keyword)) {
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

  if (
    (match[1] && minutes > 59) ||
    seconds > 59
  ) {
    return null;
  }

  return (
    hours * 3600 +
    minutes * 60 +
    seconds +
    Number(
      (match[4] || '').padEnd(2, '0')
    ) / 100
  );
}

function parseLyrics(lyrics) {
  const lines = clean(lyrics, MAX_LYRICS)
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  const result = [];
  let section = 'unlabeled';

  for (const line of lines) {
    const heading = line.match(
      /^\[(verse|chorus|bridge|intro|outro|pre-chorus|hook|refrain|instrumental)[^\]]*\]$/i
    );

    if (heading) {
      section = heading[1].toLowerCase();
      continue;
    }

    const timed = line.match(
      /^\[([0-9:.]+)\]\s*(.*)$/
    );

    const time = timed
      ? parseTimestamp(timed[1])
      : null;

    result.push({
      time,
      text:
        time !== null && timed[2].trim()
          ? timed[2].trim()
          : line,
      section
    });
  }

  return result;
}

function buildTimeline(lines, duration) {
  if (!lines.length) return [];

  if (
    lines.every(x => Number.isFinite(x.time))
  ) {
    const sorted = [...lines]
      .sort((a, b) => a.time - b.time);

    return sorted
      .map((line, i) => ({
        ...line,
        startSeconds: clamp(
          line.time,
          0,
          duration
        ),
        endSeconds: clamp(
          i + 1 < sorted.length
            ? sorted[i + 1].time
            : duration,
          0,
          duration
        ),
        timingSource: 'provided'
      }))
      .filter(
        x => x.endSeconds > x.startSeconds
      );
  }

  const slice = duration / lines.length;

  return lines.map((line, i) => ({
    ...line,
    startSeconds: round(i * slice),
    endSeconds: round(
      Math.min(
        duration,
        (i + 1) * slice
      )
    ),
    timingSource: 'estimated'
  }));
}

function normalizeMusicScenes(
  plan,
  duration,
  sceneSeconds
) {
  const input = Array.isArray(plan?.scenes)
    ? plan.scenes
    : [];

  const valid = input
    .map(scene => ({
      startSeconds: Number(scene.startSeconds),
      endSeconds: Number(scene.endSeconds),
      intensity:
        ['low', 'medium', 'high'].includes(
          scene.intensity
        )
          ? scene.intensity
          : 'medium',
      energyChange:
        clean(scene.energyChange, 40) ||
        'steady'
    }))
    .filter(x =>
      Number.isFinite(x.startSeconds) &&
      Number.isFinite(x.endSeconds) &&
      x.startSeconds >= 0 &&
      x.startSeconds < duration &&
      x.endSeconds > x.startSeconds
    )
    .sort(
      (a, b) => a.startSeconds - b.startSeconds
    )
    .map(x => ({
      ...x,
      endSeconds: round(
        Math.min(duration, x.endSeconds)
      )
    }));

  if (valid.length) {
    return valid.slice(0, MAX_SCENES);
  }

  const fallback = [];

  for (
    let start = 0;
    start < duration &&
    fallback.length < MAX_SCENES;
    start += sceneSeconds
  ) {
    fallback.push({
      startSeconds: round(start),
      endSeconds: round(
        Math.min(
          duration,
          start + sceneSeconds
        )
      ),
      intensity: 'medium',
      energyChange: 'steady'
    });
  }

  return fallback;
}

function narrativeBeat(index, total) {
  if (total === 1) {
    return BEATS[14];
  }

  const position = Math.round(
    index * (BEATS.length - 1) /
    (total - 1)
  );

  return BEATS[position];
}

function visualLocation(base, beat, concept) {
  const lower = normalizedText(concept);

  if (
    /single location|one location|entirely inside|only in|never leave/.test(lower)
  ) {
    return base;
  }

  if (
    base === 'home interior' ||
    base === 'quiet bedroom' ||
    base === 'location selected from customer concept'
  ) {
    if (
      [
        'isolation',
        'recognition',
        'vulnerability',
        'setback'
      ].includes(beat.name)
    ) {
      return 'quiet home interior near a window';
    }

    if (
      [
        'healing',
        'choice',
        'resolution',
        'afterglow',
        'closing'
      ].includes(beat.name)
    ) {
      return 'the same home, now with warm natural light';
    }

    return 'the same home, in an adjacent living area';
  }

  return base;
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
  const lines = parseLyrics(lyrics);

  const timeline = buildTimeline(
    lines,
    duration
  );

  const musicScenes = normalizeMusicScenes(
    musicPlan,
    duration,
    clipSeconds
  );

  const overall = detectEmotion(
    lines.map(x => x.text).join(' '),
    concept
  );

  const baseLocation =
    detectLocation(concept) ||
    'location selected from customer concept';

  const scenes = musicScenes.map(
    (musicScene, index) => {
      const matched = timeline.filter(
        line =>
          line.startSeconds <
            musicScene.endSeconds &&
          line.endSeconds >
            musicScene.startSeconds
      );

      const excerpt = matched
        .map(line => line.text)
        .join(' ')
        .slice(0, 600);

      const detected = detectEmotion(
        excerpt,
        concept
      );

      const emotion =
        detected.primary === 'undetermined'
          ? overall.primary
          : detected.primary;

      const beat = narrativeBeat(
        index,
        musicScenes.length
      );

      const explicitLocation =
        detectLocation(excerpt);

      const location =
        explicitLocation ||
        visualLocation(
          baseLocation,
          beat,
          concept
        );

      const intensity =
        musicScene.intensity;

      const shot = SHOTS[intensity][
        index % SHOTS[intensity].length
      ];

      const movement = MOVEMENTS[intensity][
        Math.floor(index / 2) %
        MOVEMENTS[intensity].length
      ];

      const warmth =
        musicScenes.length === 1
          ? 0.5
          : index /
            (musicScenes.length - 1);

      const lighting =
        warmth < 0.34
          ? 'cool, subdued and emotionally isolated'
          : warmth < 0.67
            ? 'balanced natural light with growing warmth'
            : 'warm, inviting and emotionally secure';

      const action =
        `${beat.action} ` +
        `Emotional cue: ${emotion}. ` +
        'Keep gestures consistent with the lyrics ' +
        'rather than interpreting vulnerability ' +
        'as a breakup. ' +
        `Setting: ${location}.`;

      const scenePrompt = [
        `CutLoopz cinematic music video: ${clean(title, 120)}.`,
        `Scene ${index + 1} of ${musicScenes.length}.`,
        `Time: ${round(musicScene.startSeconds)} to ${round(musicScene.endSeconds)} seconds.`,
        `Customer creative direction: ${concept || 'automatic story direction'}.`,
        `Lyrics associated with this section: ${excerpt || 'not available'}.`,
        `Narrative beat: ${beat.name}.`,
        `Primary emotional cue: ${emotion}.`,
        `Visual action: ${action}`,
        `Lighting: ${lighting}.`,
        `Camera: ${shot}; ${movement}.`,
        `Musical energy: ${intensity}; movement: ${musicScene.energyChange}.`,
        `Visual style: ${clean(visualStyle, 150)}.`,
        `Composition: ${format === 'landscape' ? '16:9' : '9:16'}.`,
        'Preserve recurring character identity, wardrobe, hairstyle and relationship across scenes.',
        'Maintain believable anatomy, physical movement and lighting.',
        'Avoid unrelated scenes, repeated actions, text and watermarks.'
      ].join(' ');

      return {
        number: index + 1,
        startSeconds:
          musicScene.startSeconds,
        endSeconds:
          musicScene.endSeconds,
        durationSeconds: round(
          musicScene.endSeconds -
          musicScene.startSeconds
        ),
        section:
          matched[0]?.section || 'unknown',
        lyricExcerpt: excerpt,
        lyricTiming:
          matched[0]?.timingSource ||
          'unavailable',
        emotion,
        emotionConfidence:
          detected.confidence,
        intensity,
        energyChange:
          musicScene.energyChange,
        location,
        shot,
        action,
        prompt: scenePrompt,
        narrativeBeat: beat.name,
        lighting,
        cameraMovement: movement
      };
    }
  );

  return {
    version: 2,
    engine: 'CutLoopz Story Intelligence',
    status: 'preview',
    title: clean(title, 120),
    songSeconds: duration,
    totalScenes: scenes.length,
    lyricSource:
      lines.length
        ? 'customer-provided'
        : 'none',
    lyricTiming:
      lines.length
        ? timeline[0]?.timingSource
        : 'unavailable',
    storyEmotion: overall.primary,
    customerConcept: concept,
    scenes,
    limitations: [
      'No automatic vocal transcription in this version.',
      'Emotion detection uses rule-based context and is not semantic language-model interpretation.',
      'Untimed lyrics use approximate timing.',
      'Storyboard prompts are not generated video footage.',
      'Narrative beats are suggested and may need manual creative revision.'
    ]
  };
}
