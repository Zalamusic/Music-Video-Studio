
/**
 * CutLoopz Media — Listening Director V3
 * "A Director That Listens."
 *
 * Zero paid API calls.
 * Storyboard planning and preliminary safety checks.
 *
 * Does not replace V2 or modify server.js.
 * Does not generate or inspect video footage.
 */

const MAX_SECONDS = 360;
const MAX_LYRICS = 30000;
const MAX_SCENES = 100;

const GENRES = {
  romance: [
    'romance', 'romantic', 'love story',
    'relationship', 'intimacy'
  ],
  action: [
    'action', 'chase', 'battle', 'fight',
    'adventure', 'stunt'
  ],
  scienceFiction: [
    'science fiction', 'sci-fi', 'spaceship',
    'alien planet', 'futuristic', 'cyberpunk'
  ],
  fantasy: [
    'fantasy', 'magic', 'dragon', 'enchanted',
    'mythical'
  ],
  horror: [
    'horror', 'haunted', 'supernatural',
    'terrifying', 'ghost story'
  ],
  comedy: [
    'comedy', 'funny', 'humorous', 'comedic'
  ],
  drama: [
    'drama', 'emotional', 'healing',
    'heartbreak', 'vulnerability'
  ],
  performance: [
    'performance', 'concert', 'singing',
    'dancing', 'stage'
  ]
};

const LOCATION_PATTERNS = [
  ['rooftop', 'city rooftop'],
  ['beach', 'beach'],
  ['ocean', 'oceanfront'],
  ['forest', 'forest'],
  ['mountain', 'mountain landscape'],
  ['desert', 'desert landscape'],
  ['spaceship', 'spaceship interior'],
  ['planet', 'otherworldly landscape'],
  ['city', 'cinematic cityscape'],
  ['street', 'city street'],
  ['park', 'public park'],
  ['restaurant', 'restaurant'],
  ['hotel', 'hotel'],
  ['club', 'nightclub'],
  ['church', 'church'],
  ['school', 'school'],
  ['airport', 'airport'],
  ['train', 'train station'],
  ['bedroom', 'bedroom'],
  ['kitchen', 'kitchen'],
  ['home', 'home interior']
];

const CAMERA_PATTERNS = [
  ['aerial', 'aerial establishing shot'],
  ['drone', 'drone establishing shot'],
  ['close-up', 'expressive close-up'],
  ['close up', 'expressive close-up'],
  ['wide shot', 'wide cinematic shot'],
  ['tracking', 'tracking shot'],
  ['dolly', 'dolly shot'],
  ['orbit', 'orbit shot'],
  ['crane', 'crane shot'],
  ['pov', 'point-of-view shot'],
  ['handheld', 'handheld shot']
];

const STORY_PHASES = [
  'establishment',
  'development',
  'escalation',
  'turning-point',
  'resolution'
];

function clean(value, max = 4000) {
  return typeof value === 'string'
    ? value.trim().slice(0, max)
    : '';
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsPhrase(text, phrase) {
  return (` ${normalize(text)} `)
    .includes(` ${normalize(phrase)} `);
}

function unique(values) {
  return [...new Set(values)];
}

function round(value) {
  return Number(value.toFixed(2));
}

function detectMatches(text, dictionary) {
  return dictionary
    .filter(([keyword]) => containsPhrase(text, keyword))
    .map(([, value]) => value);
}

function detectGenres(text) {
  const found = [];

  for (const [genre, keywords] of Object.entries(GENRES)) {
    if (keywords.some(word => containsPhrase(text, word))) {
      found.push(genre);
    }
  }

  return found.length ? found : ['general cinematic'];
}

function interpretInstructions(prompt) {
  const text = clean(prompt);

  const locations = unique(
    detectMatches(text, LOCATION_PATTERNS)
  );

  const cameras = unique(
    detectMatches(text, CAMERA_PATTERNS)
  );

  const genres = detectGenres(text);

  const sentences = text
    .split(/(?<=[.!?\n])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  const restrictions = sentences.filter(sentence =>
    /\b(?:do not|don't|never|avoid|without|no repeated|must not)\b/i
      .test(sentence)
  );

  const requirements = sentences.filter(sentence =>
    /\b(?:must|always|include|show|feature|use|ensure|keep|preserve|follow)\b/i
      .test(sentence)
  );

  const constraints = {
    singleLocation:
      /\b(?:single location|one location|entirely inside|never leave)\b/i
        .test(text),
    noRepetition:
      /\b(?:no repetition|avoid repetition|no repeated|every scene should advance)\b/i
        .test(text),
    characterContinuity:
      /\b(?:same character|consistent character|preserve identity|same face|same hairstyle)\b/i
        .test(text)
  };

  return {
    original: text,
    genres,
    locations,
    cameras,
    requirements: unique(requirements),
    restrictions: unique(restrictions),
    constraints,
    interpretationMethod: 'rule-based',
    requiresCustomerApproval: true
  };
}

/**
 * Guardian V3 preliminary text screening.
 *
 * This is NOT production-grade moderation.
 * It cannot reliably identify paraphrases,
 * context, images, or adversarial instructions.
 */
export function guardianPrecheck({
  prompt = '',
  lyrics = '',
  rating = 'PG-13'
} = {}) {
  const text = normalize(`${prompt} ${lyrics}`);

  const supportedRatings = ['G', 'PG', 'PG-13', 'R'];

  if (!supportedRatings.includes(rating)) {
    return {
      status: 'review',
      allowed: false,
      reasons: ['Unsupported audience rating.']
    };
  }

  const prohibited = [
    {
      pattern: /\b(?:child pornography|child sexual abuse material|csam)\b/i,
      reason: 'Sexual exploitation of minors.'
    },
    {
      pattern: /\b(?:nonconsensual pornography|revenge porn|sexual deepfake)\b/i,
      reason: 'Nonconsensual intimate content.'
    },
    {
      pattern: /\b(?:explicit pornography|hardcore porn|graphic sexual intercourse)\b/i,
      reason: 'Explicit pornographic content.'
    }
  ];

  const reasons = prohibited
    .filter(item => item.pattern.test(text))
    .map(item => item.reason);

  if (reasons.length) {
    return {
      status: 'rejected',
      allowed: false,
      reasons,
      screeningMethod: 'limited keyword screening'
    };
  }

  return {
    status: 'requires-full-moderation',
    allowed: false,
    reasons: [
      'Preliminary screening completed. Production moderation and upload inspection are still required.'
    ],
    screeningMethod: 'limited keyword screening'
  };
}

function parseLyrics(lyrics) {
  let section = 'unlabeled';

  return clean(lyrics, MAX_LYRICS)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .reduce((result, line) => {
      const heading = line.match(
        /^\[(verse|chorus|bridge|intro|outro|hook|pre-chorus|instrumental)[^\]]*\]$/i
      );

      if (heading) {
        section = heading[1].toLowerCase();
        return result;
      }

      if (/^(?:written by|produced by|copyright|©)\s/i.test(line)) {
        return result;
      }

      result.push({ text: line, section });
      return result;
    }, []);
}

function buildScenes(duration, sceneSeconds) {
  const scenes = [];

  for (
    let start = 0;
    start < duration && scenes.length < MAX_SCENES;
    start += sceneSeconds
  ) {
    scenes.push({
      startSeconds: round(start),
      endSeconds: round(
        Math.min(duration, start + sceneSeconds)
      )
    });
  }

  return scenes;
}

function phaseFor(index, total) {
  const progress = total <= 1 ? 1 : index / (total - 1);

  return STORY_PHASES[
    Math.min(
      STORY_PHASES.length - 1,
      Math.floor(progress * STORY_PHASES.length)
    )
  ];
}

function planLocation(index, instructions) {
  const locations = instructions.locations;

  if (!locations.length) {
    return 'Director-selected location; customer approval required';
  }

  if (instructions.constraints.singleLocation) {
    return locations[0];
  }

  return locations[index % locations.length];
}

function planCamera(index, instructions) {
  const cameras = instructions.cameras;

  if (cameras.length) {
    return cameras[index % cameras.length];
  }

  const defaults = [
    'wide establishing shot',
    'expressive close-up',
    'medium tracking shot',
    'over-the-shoulder shot',
    'slow cinematic push-in'
  ];

  return defaults[index % defaults.length];
}

function evaluateStoryboard(scenes, instructions) {
  const warnings = [];
  const coveredLocations = new Set(
    scenes.map(scene => scene.location)
  );

  const coveredCameras = new Set(
    scenes.map(scene => scene.camera)
  );

  for (const location of instructions.locations) {
    if (!coveredLocations.has(location)) {
      warnings.push(
        `Requested location not scheduled: ${location}`
      );
    }
  }

  for (const camera of instructions.cameras) {
    if (!coveredCameras.has(camera)) {
      warnings.push(
        `Requested camera shot not scheduled: ${camera}`
      );
    }
  }

  for (let i = 1; i < scenes.length; i++) {
    const previous = scenes[i - 1];
    const current = scenes[i];

    if (
      previous.location === current.location &&
      previous.camera === current.camera
    ) {
      warnings.push(
        `Scenes ${i} and ${i + 1} have matching location and camera plans; review for repetition.`
      );
    }
  }

  if (instructions.requirements.length) {
    warnings.push(
      'Natural-language requirements need semantic review and customer confirmation.'
    );
  }

  if (instructions.restrictions.length) {
    warnings.push(
      'Negative instructions need explicit compliance verification.'
    );
  }

  return {
    status: warnings.length
      ? 'review-required'
      : 'preliminary-plan-complete',
    warnings,
    verifiedFootage: false,
    semanticComplianceVerified: false,
    customerApprovalRequired: true
  };
}

export function createListeningDirectorPlan({
  title = 'Untitled Song',
  lyrics = '',
  songSeconds,
  prompt = '',
  format = 'landscape',
  sceneSeconds = 15,
  visualStyle = 'photorealistic',
  rating = 'PG-13'
} = {}) {
  const duration = Number(songSeconds);
  const clipLength = Number(sceneSeconds);

  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_SECONDS
  ) {
    throw new Error(
      'Song duration must be greater than 0 and no more than 360 seconds.'
    );
  }

  if (
    !Number.isFinite(clipLength) ||
    clipLength < 3 ||
    clipLength > 30
  ) {
    throw new Error(
      'Scene length must be between 3 and 30 seconds.'
    );
  }

  const safety = guardianPrecheck({
    prompt,
    lyrics,
    rating
  });

  if (safety.status === 'rejected') {
    return {
      version: 3,
      engine: 'CutLoopz Listening Director',
      status: 'rejected',
      guardian: safety,
      scenes: []
    };
  }

  const instructions = interpretInstructions(prompt);
  const lyricLines = parseLyrics(lyrics);
  const timeline = buildScenes(duration, clipLength);

  const scenes = timeline.map((timing, index) => {
    const phase = phaseFor(index, timeline.length);
    const location = planLocation(index, instructions);
    const camera = planCamera(index, instructions);

    const lyricStart = Math.floor(
      index * lyricLines.length / timeline.length
    );

    const lyricEnd = Math.floor(
      (index + 1) * lyricLines.length / timeline.length
    );

    const selectedLyrics = lyricLines
      .slice(lyricStart, Math.max(lyricStart + 1, lyricEnd));

    const excerpt = selectedLyrics
      .map(line => line.text)
      .join(' ')
      .slice(0, 600);

    const scenePrompt = [
      `CutLoopz Listening Director.`,
      `Music video: ${clean(title, 120)}.`,
      `Scene ${index + 1} of ${timeline.length}.`,
      `Narrative phase: ${phase}.`,
      `Customer direction: ${instructions.original}.`,
      `Location: ${location}.`,
      `Camera: ${camera}.`,
      `Lyrics for reference: ${excerpt || 'unavailable'}.`,
      `Visual style: ${clean(visualStyle, 150)}.`,
      `Composition: ${format === 'vertical' ? '9:16' : '16:9'}.`,
      'Maintain character identity and visual continuity.',
      'Respect all customer restrictions.',
      'Avoid unrelated events, visual glitches, and watermarks.',
      'Do not introduce unapproved story developments.'
    ].join(' ');

    return {
      number: index + 1,
      ...timing,
      durationSeconds: round(
        timing.endSeconds - timing.startSeconds
      ),
      narrativePhase: phase,
      location,
      camera,
      lyricExcerpt: excerpt,
      lyricTiming: 'estimated',
      prompt: scenePrompt,
      approvalStatus: 'pending'
    };
  });

  const compliance = evaluateStoryboard(
    scenes,
    instructions
  );

  return {
    version: 3,
    engine: 'CutLoopz Listening Director',
    slogan: 'A Director That Listens.',
    status: 'preview',
    title: clean(title, 120),
    songSeconds: duration,
    totalScenes: scenes.length,
    rating,
    guardian: safety,
    instructions,
    genres: instructions.genres,
    scenes,
    compliance,
    generationAuthorized: false,
    learningEnabled: false,
    limitations: [
      'This is a rule-based planning foundation, not a trained AI model.',
      'Guardian is a preliminary text filter, not complete content moderation.',
      'Customer instructions are not yet semantically verified.',
      'Lyric timing is estimated, not audio-aligned.',
      'Narrative phases are structural placeholders, not fully developed scene actions.',
      'No persistent learning or customer memory is implemented.',
      'Generated footage is not inspected.',
      'Customer approval and production moderation are required before generation.'
    ]
  };
}
