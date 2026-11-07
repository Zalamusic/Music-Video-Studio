
/**
 * CutLoopz Media — Generation Timeline Bridge v1
 * One Director. One timeline. No duplicate planning.
 * No provider calls, filesystem changes, or charges.
 */
import {
  validateSongDuration,
  createDurationSegments
} from './cutloopz-duration-contract.js';

const MS_PER_SECOND = 1000;
const MAX_SEGMENTS = 1000;
const toMs = value => Math.round(value * MS_PER_SECOND);
const fromMs = value => value / MS_PER_SECOND;

export function createGenerationTimeline({
  productionPlan,
  segmentSeconds = 5
} = {}) {
  const duration = validateSongDuration(
    productionPlan?.songSeconds
  );
  const shots = productionPlan?.manifest?.shots;

  if (!Array.isArray(shots) || shots.length === 0) {
    throw new Error(
      'A Production Director manifest with editorial shots is required.'
    );
  }

  const totalMs = toMs(duration);
  let previousEndMs = 0;

  const editorial = shots.map((shot, index) => {
    const startMs = toMs(shot?.startSeconds);
    const endMs = toMs(shot?.endSeconds);

    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      startMs !== previousEndMs ||
      endMs <= startMs ||
      endMs > totalMs ||
      typeof shot?.prompt !== 'string' ||
      !shot.prompt.trim()
    ) {
      throw new Error(
        `Editorial shot ${index + 1} has invalid timing or direction.`
      );
    }

    previousEndMs = endMs;

    return {
      editorialShotNumber: index + 1,
      startMs,
      endMs,
      prompt: shot.prompt.trim(),
      storyboardSceneNumber:
        shot.storyboardSceneNumber ?? null,
      originalIdentityReferenceRequired:
        Boolean(shot.originalIdentityReferenceRequired)
    };
  });

  if (previousEndMs !== totalMs) {
    throw new Error(
      'Editorial shots do not cover the complete song.'
    );
  }

  // Use one duration contract for every generation segment.
  const base = createDurationSegments({
    videoSeconds: duration,
    segmentSeconds
  });

  // Split at creative-scene boundaries when necessary.
  const boundaries = new Set([0, totalMs]);

  for (const shot of editorial) {
    boundaries.add(shot.endMs);
  }

  for (const segment of base.segments) {
    boundaries.add(toMs(segment.endSeconds));
  }

  const points = [...boundaries].sort(
    (a, b) => a - b
  );

  if (points.length - 1 > MAX_SEGMENTS) {
    throw new Error(
      'Too many generation segments.'
    );
  }

  let editorialIndex = 0;
  const segments = [];

  for (let index = 0; index < points.length - 1; index++) {
    const startMs = points[index];
    const endMs = points[index + 1];

    while (
      editorialIndex < editorial.length &&
      editorial[editorialIndex].endMs <= startMs
    ) {
      editorialIndex++;
    }

    const shot = editorial[editorialIndex];

    if (
      !shot ||
      startMs < shot.startMs ||
      endMs > shot.endMs ||
      endMs <= startMs
    ) {
      throw new Error(
        'Generation segment has no unique editorial shot.'
      );
    }

    segments.push({
      number: index + 1,
      startSeconds: fromMs(startMs),
      endSeconds: fromMs(endMs),
      durationSeconds: fromMs(endMs - startMs),
      editorialShotNumber:
        shot.editorialShotNumber,
      storyboardSceneNumber:
        shot.storyboardSceneNumber,
      prompt: shot.prompt,
      originalIdentityReferenceRequired:
        shot.originalIdentityReferenceRequired,
      status: 'planned'
    });
  }

  return {
    version: 1,
    engine: 'CutLoopz Generation Timeline Bridge',
    mode: 'planning-only',
    songSeconds: duration,
    editorialShots: editorial.length,
    totalSegments: segments.length,
    segments,
    warning:
      'These segments are plans, not generated or verified footage.'
  };
}
