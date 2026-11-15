/**
 * Durable customer account, session and studio-draft storage.
 * Prefers the configured Upstash Redis REST service; otherwise retains the
 * legacy local-file behavior for local development and existing installations.
 * Never substitutes a local, empty account list when configured Redis fails.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const ACCOUNT_REDIS_KEY = 'cutloopz:customer-accounts:v1';

function redisCredentials() {
  const address = String(process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();

  if (!address && !token) return null;
  if (!address || !token) {
    throw new Error('Both Upstash Redis REST environment variables are required.');
  }

  let url;
  try { url = new URL(address); }
  catch { throw new Error('Invalid Upstash Redis REST URL.'); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.upstash.io') ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('Upstash Redis REST URL must be HTTPS on upstash.io.');
  }
  return { url: url.toString(), token };
}

async function redisCommand(credentials, args) {
  const response = await fetch(credentials.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Upstash Redis request failed (' + response.status + ').');
  const result = await response.json();
  if (!result || typeof result !== 'object' || result.error) {
    throw new Error('Upstash Redis returned an error.');
  }
  return result.result;
}

function validateState(state) {
  if (!state || !Array.isArray(state.users) ||
      !Array.isArray(state.sessions) || !Array.isArray(state.drafts)) {
    throw new Error('Invalid customer account storage.');
  }
  return { users: state.users, sessions: state.sessions, drafts: state.drafts };
}

async function readFile(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

async function localState(storageDirectory) {
  const directory = path.join(storageDirectory, 'customer-accounts');
  const users = await readFile(path.join(directory, 'users.json'));
  const sessions = await readFile(path.join(directory, 'sessions.json'));
  const drafts = await readFile(path.join(directory, 'studio-drafts.json'));
  return validateState({ users, sessions, drafts });
}

/** Read state; migrate a surviving local account file only if Redis has no data. */
export async function readCustomerAccountState(storageDirectory = '/app/outputs') {
  const credentials = redisCredentials();
  if (!credentials) return localState(storageDirectory);

  let saved = await redisCommand(credentials, ['GET', ACCOUNT_REDIS_KEY]);
  if (saved !== null && saved !== undefined) {
    if (typeof saved !== 'string') throw new Error('Unexpected Redis account data type.');
    return validateState(JSON.parse(saved));
  }

  // Initial Redis connection: retain any account data from the previous local
  // installation if it still exists. SETNX prevents overwriting an existing
  // account record initialized by another instance at the same time.
  const previous = await localState(storageDirectory);
  const created = await redisCommand(credentials, [
    'SETNX', ACCOUNT_REDIS_KEY, JSON.stringify(previous)
  ]);
  if (created === 1) return previous;

  saved = await redisCommand(credentials, ['GET', ACCOUNT_REDIS_KEY]);
  if (typeof saved !== 'string') {
    throw new Error('Redis customer account initialization failed.');
  }
  return validateState(JSON.parse(saved));
}

async function writeAtomic(file, data) {
  const temp = file + '.' + randomUUID() + '.tmp';
  await fs.writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await fs.rename(temp, file);
}

/** Save the complete snapshot; a Redis outage must fail, never write ephemeral data. */
export async function writeCustomerAccountState(state, storageDirectory = '/app/outputs') {
  const valid = validateState(state);
  const credentials = redisCredentials();
  if (credentials) {
    const result = await redisCommand(credentials, [
      'SET', ACCOUNT_REDIS_KEY, JSON.stringify(valid)
    ]);
    if (result !== 'OK') throw new Error('Redis customer account save failed.');
    return;
  }

  const directory = path.join(storageDirectory, 'customer-accounts');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await writeAtomic(path.join(directory, 'users.json'), valid.users);
  await writeAtomic(path.join(directory, 'sessions.json'), valid.sessions);
  await writeAtomic(path.join(directory, 'studio-drafts.json'), valid.drafts);
}
