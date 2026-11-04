
/**
 * CutLoopz Production Director v1
 * Planning only: no provider calls, no billing, no filesystem changes.
 */
import { createCinemaManifest } from './cutloopz-cinema-engine.js';
import { createStoryIntelligencePlan } from './cutloopz-story-intelligence.js';

const MAX_SECONDS = 360;
const MAX_LYRICS = 12000;
const MAX_PROMPT = 4000;

function requiredDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SECONDS) {
    throw new RangeError('Song duration must be greater than 0 and at most 360 seconds.');
  }
  return seconds;
}

function safeText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validStoryboard(value) {
  return value && typeof value === 'object' && Array.isArray(value.scenes)
    ? value : null;
}

/**
 * Prepare the full shot list. An existing Listening Director storyboard
 * takes priority. Otherwise, Story Intelligence builds a plan from the
 * customer's prompt and optional lyrics.
 */
export function createProductionPlan({
  title = 'Untitled Song',
  songSeconds,
  customerPrompt = '',
  lyrics = '',
  storyboard = null,
  musicPlan = null,
  format = 'vertical',
  visualStyle = 'photorealistic',
  hasReferencePhoto = false,
  shotSeconds = 15,
  maxVideoBudgetUSD = 20,
  estimatedVideoRateUSDPerSecond = null,
  estimatedImageCostUSDPerShot = 0,
  reservedOverheadUSD = 0,
  retryReserveFraction = 0.2
} = {}) {
  const seconds = requiredDuration(songSeconds);
  const prompt = safeText(customerPrompt, MAX_PROMPT);
  const songLyrics = safeText(lyrics, MAX_LYRICS);
  const name = safeText(title, 120) || 'Untitled Song';
  const outputFormat = format === 'landscape' ? 'landscape' : 'vertical';

  if (!prompt && !validStoryboard(storyboard)) {
    throw new Error('A customer prompt or valid storyboard is required.');
  }
  if (!Number.isFinite(shotSeconds) || shotSeconds <= 0 || shotSeconds > 15) {
    throw new RangeError('Shot length must be greater than 0 and at most 15 seconds.');
  }

  const storyPlan = validStoryboard(storyboard) || createStoryIntelligencePlan({
    title: name,
    lyrics: songLyrics,
    songSeconds: seconds,
    prompt,
    format: outputFormat,
    sceneSeconds: shotSeconds,
    visualStyle,
    musicPlan
  });

  const manifest = createCinemaManifest({
    title: name,
    songSeconds: seconds,
    customerPrompt: prompt,
    lyrics: songLyrics,
    storyPlan,
    shotSeconds,
    format: outputFormat,
    visualStyle,
    hasReferencePhoto: Boolean(hasReferencePhoto),
    maxVideoBudgetUSD,
    estimatedVideoRateUSDPerSecond,
    estimatedImageCostUSDPerShot,
    reservedOverheadUSD,
    retryReserveFraction
  });

  if (!manifest || !Array.isArray(manifest.shots) || !manifest.shots.length) {
    throw new Error('Cinema Engine did not return a usable shot list.');
  }

  return {
    version: 1,
    engine: 'CutLoopz Production Director',
    mode: 'planning-only',
    title: name,
    songSeconds: seconds,
    format: outputFormat,
    source: validStoryboard(storyboard) ? 'customer-storyboard' : 'story-intelligence',
    storyPlan,
    manifest
  };
}

/**
 * Returns a single shot's creative direction. The server can add its
 * existing character-identity, realism and safety instructions afterward.
 * No automatic fallback to unrelated stock scene ideas is permitted.
 */
export function getProductionScenePrompt(plan, sceneNumber) {
  const shots = plan?.manifest?.shots;
  if (!Array.isArray(shots)) {
    throw new TypeError('A valid production plan is required.');
  }
  if (!Number.isInteger(sceneNumber) || sceneNumber < 1 || sceneNumber > shots.length) {
    throw new RangeError('Scene number is outside the production plan.');
  }
  const shot = shots[sceneNumber - 1];
  if (typeof shot?.prompt !== 'string' || !shot.prompt.trim()) {
    throw new Error(`Scene ${sceneNumber} has no usable direction.`);
  }
  return shot.prompt.trim();
}
