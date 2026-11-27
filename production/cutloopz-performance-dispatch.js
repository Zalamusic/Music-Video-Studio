/**
 * CutLoopz — Unified Performance Dispatch v1.
 * Planning only. Never starts rendering or approves spending.
 * Singing is NOT inferred from an audio waveform: vocal ranges must come from
 * an inspected vocal analysis or an explicitly approved timecode annotation.
 */
export function buildPerformanceDispatch({ timeline, vocalRanges = [], approval = false } = {}) {
 const segments = timeline?.segments;
 if (!Array.isArray(segments) || !segments.length) {
 throw new Error('A saved generation timeline is required.');
 }
 if (!Array.isArray(vocalRanges)) throw new Error('vocalRanges must be an array.');
 const totalMs = Math.round(Number(timeline.songSeconds) * 1000);
 if (!Number.isSafeInteger(totalMs) || totalMs < 1 || totalMs > 360000) {
 throw new Error('Invalid total timeline duration.');
 }
 const ranges = vocalRanges.map((range, i) => {
 const start = Math.round(Number(range.startSeconds) * 1000);
 const end = Math.round(Number(range.endSeconds) * 1000);
 if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > totalMs) {
 throw new Error(`Invalid vocal range ${i + 1}.`);
 }
 return { start, end };
 }).sort((a, b) => a.start - b.start);
 for (let i = 1; i < ranges.length; i++) {
 if (ranges[i].start < ranges[i - 1].end) throw new Error('Vocal ranges overlap.');
 }
 let previous = 0;
 const decisions = segments.map((segment, i) => {
 const start = Math.round(Number(segment.startSeconds) * 1000);
 const end = Math.round(Number(segment.endSeconds) * 1000);
 if (segment.number !== i + 1 || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start !== previous || end <= start || end > totalMs) {
 throw new Error('Invalid or discontinuous generation timeline.');
 }
 previous = end;
 const overlap = ranges.reduce((sum, r) => sum + Math.max(0, Math.min(end, r.end) - Math.max(start, r.start)), 0);
 const length = end - start;
 // Any overlap without full coverage requires splitting/review; never silently
 // send singing to a video-only model or make up a vocal classification.
 const type = !ranges.length ? 'unclassified' : overlap === 0 ? 'cinematic' : overlap === length ? 'performance' : 'review';
 const durationSeconds = length / 1000;
 const supportedLength = durationSeconds === 5;
 const status = !approval || type === 'unclassified' || type === 'review' || !supportedLength
 ? 'blocked-for-review' : 'planned'; return {
 number: segment.number,
 startSeconds: start / 1000,
 endSeconds: end / 1000,
 durationSeconds,
 type,
 status,
 reason: !approval ? 'Vocal annotations have not been approved.'
 : type === 'unclassified' ? 'No validated vocal timecodes were supplied.'
 : type === 'review' ? 'Vocal change crosses a segment boundary; split required.'
 : !supportedLength ? 'Current adapter supports exactly five-second segments.' : null,
 prompt: segment.prompt,
 audioStartSeconds: type === 'performance' ? start / 1000 : null,
 audioEndSeconds: type === 'performance' ? end / 1000 : null
 };
 });
 if (previous !== totalMs) throw new Error('Timeline does not cover full requested duration.');
 return {
 version: 1,
 mode: 'planning-only',
 songSeconds: totalMs / 1000,
 approvedVocalTimecodes: Boolean(approval),
 readyForAdapterReview: decisions.every(s => s.status === 'planned'),
 segments: decisions,
 notice: 'No singing detection, model execution, or spending occurs here.'
 };
}
