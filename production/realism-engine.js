import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_ROOT = process.env.OUTPUT_DIR || '/app/outputs';
const ROOT = path.join(DEFAULT_ROOT, 'realism-engine');
const RECORDS = path.join(ROOT, 'records');
const THRESHOLD = 90;

const METRICS = {
  movement: 25,
  identity: 25,
  cinematography: 20,
  continuity: 15,
  accuracy: 15
};

async function initialize() {
  await fs.mkdir(RECORDS, { recursive: true });
}

function validId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
}

function scoreQuality(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    throw new Error('Quality metrics are required.');
  }

  let total = 0;
  for (const [name, weight] of Object.entries(METRICS)) {
    const value = metrics[name];
    if (typeof value !== 'number' || !Number.isFinite(value) ||
        value < 0 || value > 100) {
      throw new Error('Invalid quality metric: ' + name);
    }
    total += (value / 100) * weight;
  }

  return Math.round(total * 100) / 100;
}

async function recordEvaluation({
  jobId,
  metrics,
  techniques = [],
  evaluator = 'manual',
  permissionToLearn = false
}) {
  await initialize();

  if (!validId(jobId)) throw new Error('Invalid job ID.');
  if (!Array.isArray(techniques) || techniques.length > 30 ||
      techniques.some(t => typeof t !== 'string' || t.length > 200)) {
    throw new Error('Invalid techniques.');
  }

  const score = scoreQuality(metrics);
  const qualified = score >= THRESHOLD;
  const eligibleForLearning = qualified && permissionToLearn;

  const record = {
    id: randomUUID(),
    jobId,
    score,
    metrics,
    techniques,
    evaluator,
    qualified,
    eligibleForLearning,
    createdAt: new Date().toISOString()
  };

  const file = path.join(RECORDS, record.id + '.json');
  await fs.writeFile(file, JSON.stringify(record, null, 2), {
    flag: 'wx'
  });

  return record;
}

async function listEvaluations() {
  await initialize();
  const files = await fs.readdir(RECORDS);
  const records = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const data = JSON.parse(
        await fs.readFile(path.join(RECORDS, file), 'utf8')
      );
      records.push(data);
    } catch {
      // Skip invalid records.
    }
  }

  return records.sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

async function getLearningLibrary() {
  const records = await listEvaluations();
  return records.filter(r =>
    r.eligibleForLearning === true &&
    r.qualified === true &&
    r.score >= THRESHOLD
  );
}

async function recommendTechniques(limit = 5) {
  const library = await getLearningLibrary();
  const rankings = new Map();

  for (const record of library) {
    for (const technique of record.techniques || []) {
      const key = technique.trim();
      if (!key) continue;
      const item = rankings.get(key) || {
        technique: key,
        appearances: 0,
        totalScore: 0
      };
      item.appearances++;
      item.totalScore += record.score;
      rankings.set(key, item);
    }
  }

  return [...rankings.values()]
    .map(item => ({
      technique: item.technique,
      appearances: item.appearances,
      averageScore: Math.round(
        item.totalScore / item.appearances * 100
      ) / 100
    }))
    .sort((a, b) =>
      b.appearances - a.appearances ||
      b.averageScore - a.averageScore
    )
    .slice(0, Math.max(0, Math.min(20, limit)));
}

async function getRealismStats() {
  const records = await listEvaluations();
  const library = records.filter(r => r.eligibleForLearning);
  return {
    totalEvaluations: records.length,
    qualifyingEvaluations: records.filter(r => r.qualified).length,
    learningLibrarySize: library.length,
    threshold: THRESHOLD,
    averageScore: records.length
      ? Math.round(records.reduce((sum, r) => sum + r.score, 0) /
          records.length * 100) / 100
      : null
  };
}

export {
  initialize,
  scoreQuality,
  recordEvaluation,
  listEvaluations,
  getLearningLibrary,
  recommendTechniques,
  getRealismStats
};
