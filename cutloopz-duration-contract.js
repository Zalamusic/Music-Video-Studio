
/**
 * CutLoopz Media — Duration Contract v1
 * Planning only. No provider calls or charges.
 */

export const MAX_VIDEO_SECONDS = 360;
export const DEFAULT_GENERATION_SEGMENT_SECONDS = 5;
export const DEFAULT_PREVIEW_SECONDS = 30;

function preciseSeconds(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(
      `${name} must be a finite number of seconds.`
    );
  }
  if (value <= 0) {
    throw new RangeError(
      `${name} must be greater than zero.`
    );
  }
  return value;
}

export function validateSongDuration(songSeconds) {
  const seconds = preciseSeconds(
    songSeconds, 'songSeconds'
  );

  if (seconds > MAX_VIDEO_SECONDS) {
    throw new RangeError(
      'Songs must be 6 minutes or shorter.'
    );
  }

  return seconds;
}

export function resolveVideoDuration({
  songSeconds,
  selection = 'preview',
  previewSeconds = DEFAULT_PREVIEW_SECONDS
} = {}) {
  const verifiedSongSeconds =
    validateSongDuration(songSeconds);

  if (selection === 'full') {
    return verifiedSongSeconds;
  }

  if (selection !== 'preview') {
    throw new RangeError(
      'selection must be "preview" or "full".'
    );
  }

  const preview = preciseSeconds(
    previewSeconds, 'previewSeconds'
  );

  if (preview > MAX_VIDEO_SECONDS) {
    throw new RangeError(
      'Preview must be 6 minutes or shorter.'
    );
  }

  return Math.min(preview, verifiedSongSeconds);
}

export function createDurationSegments({
  videoSeconds,
  segmentSeconds = DEFAULT_GENERATION_SEGMENT_SECONDS
} = {}) {
  const duration = validateSongDuration(videoSeconds);
  const length = preciseSeconds(
    segmentSeconds, 'segmentSeconds'
  );

  if (length > MAX_VIDEO_SECONDS) {
    throw new RangeError(
      'segmentSeconds exceeds the six-minute limit.'
    );
  }

  const totalMs = Math.round(duration * 1000);
  const segmentMs = Math.round(length * 1000);

  if (totalMs < 1 || segmentMs < 1) {
    throw new RangeError(
      'Durations must be at least one millisecond.'
    );
  }

  const segments = [];

  for (
    let startMs = 0;
    startMs < totalMs;
    startMs += segmentMs
  ) {
    const endMs = Math.min(
      totalMs, startMs + segmentMs
    );

    segments.push({
      number: segments.length + 1,
      startSeconds: startMs / 1000,
      endSeconds: endMs / 1000,
      durationSeconds: (endMs - startMs) / 1000
    });
  }

  return {
    videoSeconds: totalMs / 1000,
    exactRequestedSeconds: duration,
    segmentSeconds: segmentMs / 1000,
    totalSegments: segments.length,
    segments
  };
}
