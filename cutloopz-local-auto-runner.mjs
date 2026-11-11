/** Administrator-triggered local-only job progression.
 * No external-provider calls, automatic retries of uncertain submissions, or
 * implicit startup/resume. All progress is persisted by the coordinator.
 * This module is orchestration, NOT a video-generation model.
 */
export function createLocalAutoRunner({
  coordinator, adapter, finalize, wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  pollIntervalMs = 3000, maxPollsPerClip = 1200
} = {}) {
  if (!coordinator?.read || !coordinator?.advance || !adapter?.health || typeof finalize !== 'function')
    throw Error('Local auto-runner requires a coordinator, generator adapter and finalizer');
  if (!Number.isInteger(maxPollsPerClip) || maxPollsPerClip < 1 || !Number.isInteger(pollIntervalMs) || pollIntervalMs < 0)
    throw Error('Invalid local poll limits');
  const runs = new Map();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const assertId = id => { if (!uuid.test(id || '')) throw Error('Invalid local job ID'); };
  function snapshot(id) {
    assertId(id);
    const run = runs.get(id);
    if (!run) return {state:'not-running', note:'No runner active in this server process. A restart never submits a clip automatically.'};
    const {state, phase, clipsReady, totalClips, error, startedAt, finishedAt} = run;
    return {state, phase, clipsReady, totalClips, error, startedAt, finishedAt};
  }
  async function processJob(id, entry) {
    let observedReady = -1;
    let stagnantPolls = 0;
    while (true) {
      const job = await coordinator.read(id);
      entry.totalClips = job.clips.length;
      entry.clipsReady = job.clips.filter(c => c.status === 'ready').length;
      if (job.status === 'failed' || job.status === 'needs-review' || job.clips.some(c => ['failed', 'needs-review', 'submitting'].includes(c.status)))
        throw Error('Job needs operator review. No clip has been resubmitted automatically.');
      if (job.status === 'ready') {
        entry.phase = 'assembling';
        await finalize(id);
        entry.phase = 'complete';
        entry.state = 'complete';
        entry.finishedAt = new Date().toISOString();
        return;
      }
      if (!['created', 'submitting', 'submitted', 'processing'].includes(job.status))
        throw Error('Unexpected local job state: ' + job.status);
      if (entry.clipsReady !== observedReady) {
        observedReady = entry.clipsReady;
        stagnantPolls = 0;
      } else if (++stagnantPolls > maxPollsPerClip) {
        throw Error('Timed out waiting for the local model. Check its state before resuming; no clip was retried automatically.');
      }
      // Verify model availability before each next step; no nonlocal fallback.
      const health = await adapter.health();
      if (health.modelLoaded !== true) throw Error('Local model is no longer loaded. Resume only after checking the model.');
      entry.phase = job.clips.some(c => c.status === 'submitted' || c.status === 'processing') ? 'waiting-for-model' : 'submitting-next-clip';
      const next = await coordinator.advance(id);
      if (next.status === 'failed' || next.status === 'needs-review')
        throw Error('Generator returned a failure or uncertain submission. Operator review required; no retry attempted.');
      if (next.status === 'ready') continue;
      await wait(pollIntervalMs);
    }
  }
  async function start(id) {
    assertId(id);
    if (runs.get(id)?.state === 'running') return {...snapshot(id), alreadyRunning:true};
    const job = await coordinator.read(id);
    if (!Array.isArray(job.clips) || job.clips.length < 3 || job.clips.length > 72)
      throw Error('Local job clip count is invalid');
    if (job.status === 'failed' || job.status === 'needs-review' || job.clips.some(c => ['submitting','failed','needs-review'].includes(c.status)))
      throw Error('Job requires operator review and cannot be automatically resumed');
    const health = await adapter.health();
    if (health.modelLoaded !== true) throw Error('Local model is not loaded');
    const entry = {
      state:'running',phase:'starting',clipsReady:job.clips.filter(c=>c.status==='ready').length,
      totalClips:job.clips.length,error:null,startedAt:new Date().toISOString(),finishedAt:null,promise:null
    };
    runs.set(id,entry);
    entry.promise = processJob(id,entry).catch(error=>{
      entry.state='stopped';entry.phase='operator-review';entry.error=String(error?.message||error);
      entry.finishedAt=new Date().toISOString();
    });
    return snapshot(id);
  }
  async function settled(id) { assertId(id); await runs.get(id)?.promise; return snapshot(id); }
  return {start,snapshot,settled};
}
