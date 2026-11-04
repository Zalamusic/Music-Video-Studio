
/**
 * CutLoopz Cinema Engine v1 — deterministic production planning core.
 * No provider calls, no network, no charges.
 * Node.js ES module; compatible with existing Story Intelligence v4.
 * Copyright (c) CutLoopz Media. Application code, not model weights.
 */

const MAX_SECONDS = 360;
const MAX_PROMPT = 4000;
const MAX_LYRICS = 30000;
const DEFAULT_SHOT_SECONDS = 15;

function finiteNumber(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a finite number.`);
  return n;
}

function text(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function round(n) { return Math.round(n * 1000) / 1000; }

function overlap(a, b) {
  return Math.max(0, Math.min(a.endSeconds, b.endSeconds) -
    Math.max(a.startSeconds, b.startSeconds));
}

function normalizeScenes(scenes, duration) {
  if (!Array.isArray(scenes)) return [];
  return scenes.slice(0, 120).map((scene, index) => {
    if (!scene || typeof scene !== 'object') return null;
    const start = Number(scene.startSeconds);
    const end = Number(scene.endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) ||
        start < 0 || end <= start || start >= duration) return null;
    return {
      number: index + 1,
      startSeconds: round(start),
      endSeconds: round(Math.min(duration, end)),
      prompt: text(scene.prompt, MAX_PROMPT),
      location: text(scene.location, 200),
      action: text(scene.action, 400),
      shot: text(scene.shot, 150),
      cameraMovement: text(scene.cameraMovement || scene.movement, 150),
      lighting: text(scene.lighting, 150),
      lyricExcerpt: text(scene.lyricExcerpt, 300),
      emotion: text(scene.emotion, 100),
      intensity: text(scene.intensity, 60)
    };
  }).filter(Boolean).sort((a, b) => a.startSeconds - b.startSeconds);
}

function selectScene(slot, scenes) {
  let best = null;
  let bestOverlap = 0;
  for (const scene of scenes) {
    const shared = overlap(slot, scene);
    if (shared > bestOverlap) {
      bestOverlap = shared;
      best = scene;
    }
  }
  if (best) return best;
  const midpoint = (slot.startSeconds + slot.endSeconds) / 2;
  return scenes.reduce((nearest, scene) => {
    const distance = s => Math.abs((s.startSeconds + s.endSeconds) / 2 - midpoint);
    return !nearest || distance(scene) < distance(nearest) ? scene : nearest;
  }, null);
}

function makePrompt({ title, customerPrompt, scene, slot, format, style,
  hasReferencePhoto, previousSceneNotes }) {
  const parts = [
    `CutLoopz cinematic music video: ${title}.`,
    `Shot ${slot.number}.`,
    `CUSTOMER'S CREATIVE DIRECTION (authoritative): ${customerPrompt || 'Create a coherent cinematic interpretation of the song.'}`
  ];
  if (scene) {
    if (scene.location) parts.push(`Location: ${scene.location}.`);
    if (scene.action) parts.push(`On-screen action: ${scene.action}.`);
    if (scene.shot) parts.push(`Framing: ${scene.shot}.`);
    if (scene.cameraMovement) parts.push(`Camera movement: ${scene.cameraMovement}.`);
    if (scene.lighting) parts.push(`Lighting: ${scene.lighting}.`);
    if (scene.emotion) parts.push(`Emotional direction: ${scene.emotion}.`);
    if (scene.lyricExcerpt) parts.push(`Song lyric context (not on-screen text): ${scene.lyricExcerpt}.`);
    if (scene.prompt) parts.push(`Approved storyboard direction: ${scene.prompt}`);
  }
  if (previousSceneNotes) parts.push(`Continuity context (only where compatible with customer direction): ${previousSceneNotes}`);
  if (hasReferencePhoto) parts.push('Keep the performer recognizable from the ORIGINAL authorized reference photograph. Preserve facial structure, hairstyle and skin tone. Never replace the original identity reference with an unverified generated frame.');
  parts.push(`Visual style: ${style}. Composition: ${format === 'landscape' ? 'widescreen horizontal' : 'vertical portrait'}.`);
  parts.push('Natural motion, coherent anatomy, intentional composition, stable background, no unwanted text or watermarks. Do not introduce unrelated locations, characters, props or costumes.');
  return parts.join(' ').slice(0, 8000);
}

/**
 * Build a shot-by-shot production manifest.
 * storyPlan may be Story Intelligence v4 output.
 * A shot's duration is for EDITORIAL TIMING, not a promise that a provider
 * accepts that duration. A provider adapter must validate durations.
 */
export function createCinemaManifest({
  title = 'Untitled Song',
  songSeconds,
  customerPrompt = '',
  lyrics = '',
  storyPlan = null,
  directorPlan = null,
  shotSeconds = DEFAULT_SHOT_SECONDS,
  format = 'vertical',
  visualStyle = 'photorealistic',
  hasReferencePhoto = false,
  previousSceneNotes = '',
  maxVideoBudgetUSD = 20,
  estimatedVideoRateUSDPerSecond = null,
  estimatedImageCostUSDPerShot = 0,
  reservedOverheadUSD = 0,
  retryReserveFraction = 0.2
} = {}) {
  const duration = finiteNumber(songSeconds, 'songSeconds');
  const interval = finiteNumber(shotSeconds, 'shotSeconds');
  const budget = finiteNumber(maxVideoBudgetUSD, 'maxVideoBudgetUSD');
  const imageCost = finiteNumber(estimatedImageCostUSDPerShot, 'estimatedImageCostUSDPerShot');
  const overhead = finiteNumber(reservedOverheadUSD, 'reservedOverheadUSD');
  const retryFraction = finiteNumber(retryReserveFraction, 'retryReserveFraction');
  if (duration <= 0 || duration > MAX_SECONDS) throw new Error('songSeconds must be > 0 and <= 360.');
  if (interval < 1 || interval > 30) throw new Error('shotSeconds must be between 1 and 30.');
  if (budget <= 0 || imageCost < 0 || overhead < 0 || retryFraction < 0 || retryFraction > 1) {
    throw new Error('Invalid cost settings.');
  }
  const concept = text(customerPrompt, MAX_PROMPT);
  const cleanLyrics = text(lyrics, MAX_LYRICS);
  const cleanTitle = text(title, 200) || 'Untitled Song';
  const cleanStyle = text(visualStyle, 100) || 'photorealistic';
  const cleanNotes = text(previousSceneNotes, 600);
  const source = storyPlan && Array.isArray(storyPlan.scenes) && storyPlan.scenes.length
    ? 'story-intelligence'
    : directorPlan && Array.isArray(directorPlan.scenes) && directorPlan.scenes.length
      ? 'director-mode'
      : 'customer-prompt';
  const plan = source === 'story-intelligence' ? storyPlan : source === 'director-mode' ? directorPlan : null;
  const scenes = normalizeScenes(plan?.scenes, duration);
  const count = Math.ceil(duration / interval);
  const shots = [];
  for (let index = 0; index < count; index++) {
    const slot = {
      number: index + 1,
      startSeconds: round(index * interval),
      endSeconds: round(Math.min(duration, (index + 1) * interval))
    };
    const chosen = selectScene(slot, scenes);
    shots.push({
      ...slot,
      durationSeconds: round(slot.endSeconds - slot.startSeconds),
      storyboardSceneNumber: chosen?.number ?? null,
      storyboardSource: source,
      prompt: makePrompt({title: cleanTitle, customerPrompt: concept, scene: chosen,
        slot, format, style: cleanStyle, hasReferencePhoto, previousSceneNotes: cleanNotes}),
      originalIdentityReferenceRequired: Boolean(hasReferencePhoto),
      continuityReferenceVerified: false,
      status: 'planned'
    });
  }
  const rate = estimatedVideoRateUSDPerSecond == null ? null :
    finiteNumber(estimatedVideoRateUSDPerSecond, 'estimatedVideoRateUSDPerSecond');
  if (rate !== null && rate < 0) throw new Error('Video rate must not be negative.');
  const baseVideo = rate === null ? null : round(duration * rate);
  const baseImages = round(count * imageCost);
  const estimatedTotal = baseVideo === null ? null :
    round((baseVideo + baseImages) * (1 + retryFraction) + overhead);
  return {
    version: 1,
    engine: 'CutLoopz Cinema Engine',
    mode: 'planning-only',
    title: cleanTitle,
    songSeconds: duration,
    format: format === 'landscape' ? 'landscape' : 'vertical',
    totalShots: count,
    storySource: source,
    lyricsProvided: Boolean(cleanLyrics),
    budget: {
      targetUSD: budget,
      videoRateUSDPerSecond: rate,
      estimatedVideoUSD: baseVideo,
      estimatedSceneImagesUSD: baseImages,
      retryReserveFraction: retryFraction,
      reservedOverheadUSD: overhead,
      estimatedTotalUSD: estimatedTotal,
      withinTarget: estimatedTotal === null ? null : estimatedTotal < budget,
      caveat: 'Estimate only; provider bills, failed attempts and GPU usage may differ.'
    },
    shots,
    warnings: [
      ...(source === 'customer-prompt' ? ['No timed storyboard supplied; shots use customer prompt only.'] : []),
      ...(source !== 'story-intelligence' && cleanLyrics ? ['Lyrics supplied but no Story Intelligence plan; lyrics are not timed or interpreted.'] : []),
      'Identity and visual continuity are not automatically verified.',
      'Provider-specific duration and image requirements must be checked before generation.'
    ]
  };
}

/** Validate a proposed paid test before any external model call. */
export function authorizeClipTest({
  manifest,
  shotNumber,
  maxSpendUSD,
  quotedClipCostUSD,
  paidGenerationEnabled = false
} = {}) {
  if (!paidGenerationEnabled) throw new Error('Paid generation is disabled.');
  if (!manifest || !Array.isArray(manifest.shots)) throw new Error('Valid manifest required.');
  const shot = manifest.shots.find(s => s.number === shotNumber);
  if (!shot) throw new Error('Shot not found.');
  const ceiling = finiteNumber(maxSpendUSD, 'maxSpendUSD');
  const quote = finiteNumber(quotedClipCostUSD, 'quotedClipCostUSD');
  if (ceiling <= 0 || quote < 0 || quote > ceiling) {
    throw new Error('Quoted clip cost exceeds approved test budget.');
  }
  return {authorized: true, shot, maximumApprovedUSD: ceiling,
    quotedClipCostUSD: quote,
    note: 'Local preflight only. No provider request or charge was made.'};
}
