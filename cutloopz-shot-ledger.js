
/**
 * CutLoopz Media — Persistent Shot Ledger v1
 * Records production progress only.
 * No generation, network, or spending.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const STATES = new Set([
  'pending', 'running', 'completed', 'failed', 'review'
]);

const validId = id =>
  typeof id === 'string' &&
  /^[a-zA-Z0-9_-]{1,100}$/.test(id);

const hash = value =>
  createHash('sha256').update(value).digest('hex');

function jobPaths(storageDirectory, jobId) {
  if (!path.isAbsolute(storageDirectory) || !validId(jobId)) {
    throw new Error(
      'Absolute storage directory and safe job ID required.'
    );
  }

  const folder = path.join(storageDirectory, jobId);

  return {
    folder,
    file: path.join(folder, 'shot-ledger.json'),
    lock: path.join(folder, '.shot-ledger-lock')
  };
}

function verifiedTimeline(timeline) {
  const shots = timeline?.segments;
  const totalMs = Math.round(
    Number(timeline?.songSeconds) * 1000
  );

  if (
    !Number.isSafeInteger(totalMs) ||
    totalMs < 1 ||
    totalMs > 360000 ||
    !Array.isArray(shots) ||
    shots.length < 1 ||
    shots.length > 1000
  ) {
    throw new Error('Invalid production timeline or duration.');
  }

  let nextStart = 0;

  const normalized = shots.map((shot, i) => {
    const start = Math.round(Number(shot?.startSeconds) * 1000);
    const end = Math.round(Number(shot?.endSeconds) * 1000);

    if (
      shot?.number !== i + 1 ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start !== nextStart ||
      end <= start ||
      end > totalMs ||
      typeof shot?.prompt !== 'string' ||
      !shot.prompt.trim()
    ) {
      throw new Error(
        `Invalid timeline segment ${i + 1}.`
      );
    }

    nextStart = end;

    return {
      number: i + 1,
      startMs: start,
      endMs: end,
      editorialShotNumber: shot.editorialShotNumber,
      prompt: shot.prompt.trim(),
      originalIdentityReferenceRequired:
        Boolean(shot.originalIdentityReferenceRequired)
    };
  });

  if (nextStart !== totalMs) {
    throw new Error('Timeline has incomplete coverage.');
  }

  return { totalMs, segments: normalized };
}

function validateLedger(data) {
  if (
    !data ||
    data.version !== 1 ||
    !validId(data.jobId) ||
    !Array.isArray(data.shots) ||
    data.shots.length === 0 ||
    !/^[a-f0-9]{64}$/.test(data.timelineHash || '')
  ) {
    throw new Error('Invalid or incompatible shot ledger.');
  }

  for (let i = 0; i < data.shots.length; i++) {
    const s = data.shots[i];

    if (
      s.number !== i + 1 ||
      !STATES.has(s.status) ||
      !Number.isSafeInteger(s.startMs) ||
      !Number.isSafeInteger(s.endMs) ||
      s.endMs <= s.startMs ||
      (i && s.startMs !== data.shots[i - 1].endMs) ||
      (s.status === 'running' && !s.attemptId) ||
      (
        s.status === 'completed' &&
        (
          !s.attemptId ||
          !/^[a-f0-9]{64}$/.test(s.outputSha256 || '')
        )
      )
    ) {
      throw new Error('Invalid shot ledger record.');
    }
  }

  return data;
}

async function read(file) {
  return validateLedger(
    JSON.parse(await fs.readFile(file, 'utf8'))
  );
}

async function write(file, data) {
  validateLedger(data);

  const temp = file + '.' + randomUUID() + '.tmp';

  try {
    await fs.writeFile(
      temp,
      JSON.stringify(data, null, 2),
      { flag: 'wx', mode: 0o600 }
    );

    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

// A leftover lock blocks writes until it is investigated.
// Never guess whether an interrupted GPU request finished.
async function locked(paths, fn) {
  await fs.mkdir(paths.folder, { recursive: true });

  try {
    await fs.mkdir(paths.lock);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(
        'Production is locked; inspect interrupted operation before retrying.'
      );
    }
    throw error;
  }

  try {
    return await fn();
  } finally {
    await fs.rmdir(paths.lock).catch(() => {});
  }
}

export async function openShotLedger({
  storageDirectory,
  jobId,
  timeline
}) {
  const paths = jobPaths(storageDirectory, jobId);
  const source = verifiedTimeline(timeline);
  const timelineHash = hash(JSON.stringify(source));

  return locked(paths, async () => {
    let ledger;

    try {
      ledger = await read(paths.file);

      if (
        ledger.jobId !== jobId ||
        ledger.timelineHash !== timelineHash ||
        ledger.shots.length !== source.segments.length
      ) {
        throw new Error(
          'Existing job differs from the approved timeline.'
        );
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;

      ledger = {
        version: 1,
        jobId,
        timelineHash,
        createdAt: new Date().toISOString(),
        shots: source.segments.map(s => ({
          number: s.number,
          startMs: s.startMs,
          endMs: s.endMs,
          status: 'pending',
          attemptId: null,
          outputSha256: null
        }))
      };

      await write(paths.file, ledger);
    }

    return structuredClone(ledger);
  });
}

export async function getShotLedger({
  storageDirectory,
  jobId
}) {
  const paths = jobPaths(storageDirectory, jobId);
  return structuredClone(await read(paths.file));
}

export async function claimShot({
  storageDirectory,
  jobId,
  shotNumber
}) {
  const paths = jobPaths(storageDirectory, jobId);

  return locked(paths, async () => {
    const ledger = await read(paths.file);
    const shot = ledger.shots[shotNumber - 1];

    if (
      !Number.isInteger(shotNumber) ||
      !shot ||
      shot.status !== 'pending'
    ) {
      throw new Error(
        'Shot cannot be claimed; review current status first.'
      );
    }

    shot.status = 'running';
    shot.attemptId = randomUUID();
    shot.outputSha256 = null;

    await write(paths.file, ledger);

    return {
      shotNumber,
      attemptId: shot.attemptId
    };
  });
}

export async function recordShotResult({
  storageDirectory,
  jobId,
  shotNumber,
  attemptId,
  status,
  outputSha256 = null
}) {
  if (!['completed', 'failed', 'review'].includes(status)) {
    throw new Error('Invalid completion status.');
  }

  const paths = jobPaths(storageDirectory, jobId);

  return locked(paths, async () => {
    const ledger = await read(paths.file);
    const shot = ledger.shots[shotNumber - 1];

    if (
      !Number.isInteger(shotNumber) ||
      !shot ||
      shot.status !== 'running' ||
      shot.attemptId !== attemptId
    ) {
      throw new Error(
        'Attempt mismatch or shot is not running.'
      );
    }

    if (
      status === 'completed' &&
      !/^[a-f0-9]{64}$/.test(outputSha256 || '')
    ) {
      throw new Error(
        'Completed shot requires an output SHA-256 fingerprint.'
      );
    }

    shot.status = status;
    shot.outputSha256 =
      status === 'completed' ? outputSha256 : null;

    await write(paths.file, ledger);

    return {
      shotNumber,
      status,
      requiresVisualReview: true
    };
  });
}
