
/**
 * Zala QI's World
 * Premium Director Mode — Foundation v1
 *
 * Plans cinematic scenes without making paid API calls.
 * Does not modify Standard Cinematic or Premium Lip-Sync.
 */

const SHOTS = [
  'cinematic wide establishing shot',
  'natural full-body performance shot',
  'expressive medium performance shot',
  'intimate emotional close-up',
  'smooth tracking shot',
  'low-angle cinematic shot',
  'over-the-shoulder shot',
  'dramatic aerial establishing shot'
];

const MOVEMENTS = [
  'slow cinematic dolly-in',
  'smooth lateral tracking',
  'gentle camera orbit',
  'steady handheld-style movement',
  'slow crane movement',
  'subtle cinematic pullback',
  'smooth aerial movement'
];

const REALISM = [
  'Photorealistic live-action cinematography.',
  'Natural human anatomy and body proportions.',
  'Realistic hands, feet, joints and posture.',
  'Believable walking, dancing and gestures.',
  'Natural clothing movement and physical balance.',
  'Consistent facial identity and hairstyle.',
  'Avoid artificial-looking skin and robotic motion.',
  'Maintain realistic gravity and momentum.'
].join(' ');

function clean(value, max = 1000) {
  return typeof value === 'string'
    ? value.trim().slice(0, max)
    : '';
}

function choose(items, index) {
  return items[index % items.length];
}

function extractLocations(prompt) {
  const text = clean(prompt, 4000);

  const match = text.match(
    /(?:locations?|settings?|places?)\s*:\s*([^.!?\n]+)/i
  );

  if (!match) return [];

  return match[1]
    .split(/,|;|\band\b/i)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function createDirectorPlan({
  title = 'Untitled',
  prompt = '',
  songSeconds,
  sceneSeconds = 15,
  format = 'vertical',
  direction = 'automatic',
  locations = [],
  cameraShots = [],
  cameraMovements = [],
  visualStyle = 'photorealistic',
  performance = 'natural performance'
} = {}) {
  const seconds = Number(songSeconds);
  const clipSeconds = Number(sceneSeconds);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('Director Mode requires a valid song duration.');
  }

  if (!Number.isFinite(clipSeconds) || clipSeconds <= 0) {
    throw new Error('Director Mode requires a valid scene duration.');
  }

  const count = Math.ceil(seconds / clipSeconds);
  const concept = clean(prompt, 4000);

  if (!concept) {
    throw new Error('Director Mode requires a video prompt.');
  }

  const allowedDirections = [
    'automatic',
    'custom',
    'hybrid'
  ];

  const selectedDirection = allowedDirections.includes(direction)
    ? direction
    : 'automatic';

  const requestedLocations = Array.isArray(locations)
    ? locations.map(value => clean(value, 200)).filter(Boolean)
    : [];

  const sceneLocations = requestedLocations.length
    ? requestedLocations
    : extractLocations(concept);

  const selectedShots = Array.isArray(cameraShots)
    ? cameraShots.map(value => clean(value, 150)).filter(Boolean)
    : [];

  const selectedMovements = Array.isArray(cameraMovements)
    ? cameraMovements.map(value => clean(value, 150)).filter(Boolean)
    : [];

  const scenes = [];

  for (let index = 0; index < count; index++) {
    const number = index + 1;
    const startSeconds = index * clipSeconds;
    const endSeconds = Math.min(
      seconds,
      startSeconds + clipSeconds
    );

    const location = sceneLocations.length
      ? choose(sceneLocations, index)
      : 'Location determined by the customer concept';

    const shot = selectedShots.length
      ? choose(selectedShots, index)
      : choose(SHOTS, index);

    const movement = selectedMovements.length
      ? choose(selectedMovements, index)
      : choose(MOVEMENTS, index);

    const sceneDescription = [
      `Music video: ${clean(title, 120)}.`,
      `Scene ${number} of ${count}.`,
      `Customer vision: ${concept}.`,
      `Scene location: ${location}.`,
      `Camera shot: ${shot}.`,
      `Camera movement: ${movement}.`,
      `Visual style: ${clean(visualStyle, 150)}.`,
      `Performance: ${clean(performance, 200)}.`,
      `Composition: ${format === 'landscape'
        ? 'horizontal cinematic'
        : 'vertical cinematic'}.`,
      REALISM,
      'Do not combine unrelated locations in one shot.',
      'Do not add captions, logos or watermarks.'
    ].join(' ');

    scenes.push({
      number,
      startSeconds,
      endSeconds,
      location,
      shot,
      movement,
      prompt: sceneDescription
    });
  }

  return {
    version: 1,
    package: 'premium-director',
    direction: selectedDirection,
    title: clean(title, 120),
    songSeconds: seconds,
    sceneSeconds: clipSeconds,
    totalScenes: count,
    scenes
  };
}
