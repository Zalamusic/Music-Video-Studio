/** Offline scheduling bridge. Does NOT call providers, authorize payment, or render video. */
export function buildPerformanceSchedule({ timeline, songSeconds, artistPhotoPresent = false }) {
  if (!artistPhotoPresent) throw new Error('Artist reference photo required');
  if (!timeline || !Array.isArray(timeline.segments)) throw new Error('Fixed timeline required');
  const segments = timeline.segments;
  const seconds = segments.length * 5;
  if (!Number.isInteger(seconds) || seconds < 15 || seconds > 360 || seconds % 5) throw new Error('Unsupported duration');
  if (!Number.isFinite(songSeconds) || songSeconds + 0.02 < seconds) throw new Error('Song too short');
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.number !== i + 1 || Math.abs(s.startSeconds - i * 5) > 0.001 || Math.abs(s.endSeconds - (i + 1) * 5) > 0.001 || s.durationSeconds !== 5 || !String(s.prompt || '').trim()) throw new Error(`Invalid segment ${i+1}`);
  }
  return Object.freeze({
    mode: 'planning-only', renderAuthorized: false, costAuthorized: false,
    originalAudioMustBePreserved: true, visualQualityVerified: false, vocalSyncVerified: false,
    durationSeconds: seconds, totalClips: segments.length,
    estimatedProviderCostUSD: Number((segments.length * 0.50).toFixed(2)),
    costEstimateOnly: true,
    clips: segments.map((s, i) => ({ number: i + 1, startSeconds: i * 5, endSeconds: (i + 1) * 5,
      audioWindowSeconds: 5, referenceImageRequired: true, direction: s.prompt,
      status: 'awaiting-admin-authorization' }))
  });
}
