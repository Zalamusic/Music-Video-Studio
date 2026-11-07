
/**
 * CutLoopz Media — Unified Integration Tests
 *
 * One Director. One Engine.
 * No Unnecessary Repetition.
 *
 * Tests use temporary files only.
 * No GPU calls, paid APIs, or video generation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  validateSongDuration,
  resolveVideoDuration,
  createDurationSegments
} from './cutloopz-duration-contract.js';

import {
  createGenerationTimeline
} from './cutloopz-generation-timeline.js';

import {
  openShotLedger,
  getShotLedger,
  claimShot,
  recordShotResult
} from './cutloopz-shot-ledger.js';

function makeProductionPlan(seconds, editorialSeconds = 15) {
  const shots = [];

  for (let start = 0; start < seconds; start += editorialSeconds) {
    const end = Math.min(seconds, start + editorialSeconds);

    shots.push({
      number: shots.length + 1,
      startSeconds: start,
      endSeconds: end,
      prompt: `Continue cinematic scene ${shots.length + 1}.`,
      storyboardSceneNumber: shots.length + 1,
      originalIdentityReferenceRequired: true
    });
  }

  return {
    songSeconds: seconds,
    manifest: { shots }
  };
}

async function withTemporaryStorage(callback) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'cutloopz-test-')
  );

  try {
    return await callback(directory);
  } finally {
    await fs.rm(directory, {
      recursive: true,
      force: true
    });
  }
}

test('Six-minute maximum is enforced', () => {
  assert.equal(validateSongDuration(360), 360);

  assert.throws(
    () => validateSongDuration(361)
  );

  assert.throws(
    () => validateSongDuration(0)
  );
});

test('30-second preview is selected correctly', () => {
  assert.equal(
    resolveVideoDuration({
      songSeconds: 226,
      selection: 'preview'
    }),
    30
  );

  assert.equal(
    resolveVideoDuration({
      songSeconds: 226,
      selection: 'full'
    }),
    226
  );
});

test('3:46 song produces 46 segments', () => {
  const result = createDurationSegments({
    videoSeconds: 226
  });

  assert.equal(result.totalSegments, 46);
  assert.equal(result.segments.at(-1).durationSeconds, 1);
});

test('4:01 song produces 49 segments', () => {
  const result = createDurationSegments({
    videoSeconds: 241
  });

  assert.equal(result.totalSegments, 49);
  assert.equal(result.segments.at(-1).durationSeconds, 1);
});

test('6-minute song produces 72 segments', () => {
  const result = createDurationSegments({
    videoSeconds: 360
  });

  assert.equal(result.totalSegments, 72);
});

test('Director timeline preserves complete coverage', () => {
  const plan = makeProductionPlan(226);

  const timeline = createGenerationTimeline({
    productionPlan: plan,
    segmentSeconds: 5
  });

  assert.equal(timeline.totalSegments, 46);
  assert.equal(timeline.segments[0].startSeconds, 0);
  assert.equal(
    timeline.segments.at(-1).endSeconds,
    226
  );
});

test('Creative boundaries do not duplicate time', () => {
  const plan = makeProductionPlan(30, 12);

  const timeline = createGenerationTimeline({
    productionPlan: plan,
    segmentSeconds: 5
  });

  for (let i = 1; i < timeline.segments.length; i++) {
    assert.equal(
      timeline.segments[i].startSeconds,
      timeline.segments[i - 1].endSeconds
    );
  }

  assert.equal(
    timeline.segments.reduce(
      (total, shot) => total + shot.durationSeconds,
      0
    ),
    30
  );
});

test('Shot ledger persists after reopening', async () => {
  await withTemporaryStorage(async storageDirectory => {
    const timeline = createGenerationTimeline({
      productionPlan: makeProductionPlan(30)
    });

    const options = {
      storageDirectory,
      jobId: 'cutloopz-test-persistence',
      timeline
    };

    const first = await openShotLedger(options);
    const second = await openShotLedger(options);

    assert.equal(first.shots.length, 6);
    assert.deepEqual(second.shots, first.shots);
  });
});

test('Running shots cannot be claimed twice', async () => {
  await withTemporaryStorage(async storageDirectory => {
    const jobId = 'cutloopz-test-duplicate';

    const timeline = createGenerationTimeline({
      productionPlan: makeProductionPlan(30)
    });

    await openShotLedger({
      storageDirectory,
      jobId,
      timeline
    });

    const first = await claimShot({
      storageDirectory,
      jobId,
      shotNumber: 1
    });

    assert.ok(first.attemptId);

    await assert.rejects(
      claimShot({
        storageDirectory,
        jobId,
        shotNumber: 1
      })
    );

    const saved = await getShotLedger({
      storageDirectory,
      jobId
    });

    assert.equal(saved.shots[0].status, 'running');
  });
});

test('Completed shots retain their fingerprints', async () => {
  await withTemporaryStorage(async storageDirectory => {
    const jobId = 'cutloopz-test-complete';

    const timeline = createGenerationTimeline({
      productionPlan: makeProductionPlan(30)
    });

    await openShotLedger({
      storageDirectory,
      jobId,
      timeline
    });

    const claimed = await claimShot({
      storageDirectory,
      jobId,
      shotNumber: 1
    });

    const fingerprint = 'a'.repeat(64);

    await recordShotResult({
      storageDirectory,
      jobId,
      shotNumber: 1,
      attemptId: claimed.attemptId,
      status: 'completed',
      outputSha256: fingerprint
    });

    const saved = await getShotLedger({
      storageDirectory,
      jobId
    });

    assert.equal(saved.shots[0].status, 'completed');
    assert.equal(
      saved.shots[0].outputSha256,
      fingerprint
    );

    await assert.rejects(
      claimShot({
        storageDirectory,
        jobId,
        shotNumber: 1
      })
    );
  });
});

test('Changed timelines cannot overwrite saved jobs', async () => {
  await withTemporaryStorage(async storageDirectory => {
    const jobId = 'cutloopz-test-integrity';

    await openShotLedger({
      storageDirectory,
      jobId,
      timeline: createGenerationTimeline({
        productionPlan: makeProductionPlan(30)
      })
    });

    await assert.rejects(
      openShotLedger({
        storageDirectory,
        jobId,
        timeline: createGenerationTimeline({
          productionPlan: makeProductionPlan(60)
        })
      })
    );
  });
});

test('Full-length ledger supports 3:46', async () => {
  await withTemporaryStorage(async storageDirectory => {
    const timeline = createGenerationTimeline({
      productionPlan: makeProductionPlan(226)
    });

    const ledger = await openShotLedger({
      storageDirectory,
      jobId: 'cutloopz-test-full-song',
      timeline
    });

    assert.equal(ledger.shots.length, 46);
    assert.equal(ledger.shots.at(-1).endMs, 226000);
  });
});
