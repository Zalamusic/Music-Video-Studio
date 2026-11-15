// Offline, no-cost regression tests for CutLoopz customer account durability.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readCustomerAccountState, writeCustomerAccountState } from './cutloopz-account-store.js';

const dir = await mkdtemp(path.join(os.tmpdir(), 'cutloopz-account-test-'));
const oldFetch = globalThis.fetch;
const oldUrl = process.env.UPSTASH_REDIS_REST_URL;
const oldToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const values = new Map();
let down = false;
let requests = 0;

try {
  process.env.UPSTASH_REDIS_REST_URL = 'https://mock-test.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-test-token';
  globalThis.fetch = async (url, opts) => {
    assert.equal(url, 'https://mock-test.upstash.io/');
    assert.equal(opts.headers.Authorization, 'Bearer fake-test-token');
    requests++;
    if (down) return {ok:false,status:503};
    const [command, key, value] = JSON.parse(opts.body);
    const upper = command.toUpperCase();
    let result;
    if (upper === 'GET') result = values.has(key) ? values.get(key) : null;
    else if (upper === 'SET') { values.set(key, value); result = 'OK'; }
    else if (upper === 'SETNX') {
      result = values.has(key) ? 0 : 1;
      if (result === 1) values.set(key, value);
    } else throw new Error('Unexpected mock command: ' + command);
    return {ok: true, json: async () => ({result})};
  };

  // Recover existing local records to Redis, preserving identifiers and hashes.
  await mkdir(path.join(dir, 'customer-accounts'), {recursive:true});
  const original = [{id:'preserve-user-id',email:'example@example.com',passwordHash:'stored:hash'}];
  await writeFile(path.join(dir, 'customer-accounts', 'users.json'), JSON.stringify(original));
  await writeFile(path.join(dir, 'customer-accounts', 'sessions.json'), '[]');
  await writeFile(path.join(dir, 'customer-accounts', 'studio-drafts.json'), '[]');
  let first = await readCustomerAccountState(dir);
  assert.deepEqual(first.users, original);
  assert.equal(values.size, 1);

  // Simulate a fresh Render filesystem after deployment: Redis must retain accounts.
  const freshDir = await mkdtemp(path.join(os.tmpdir(), 'cutloopz-new-render-'));
  try {
    let second = await readCustomerAccountState(freshDir);
    assert.deepEqual(second.users, original);
    second.users.push({id:'second-user',email:'new@example.com'});
    second.sessions.push({userId:'second-user',tokenHash:'test',expiresAt:'2030-01-01'});
    second.drafts.push({userId:'second-user',draft:{title:'test'}});
    await writeCustomerAccountState(second, freshDir);
    const third = await readCustomerAccountState(dir);
    assert.equal(third.users.length, 2);
    assert.equal(third.sessions.length, 1);
    assert.equal(third.drafts.length, 1);
    assert.equal(values.size, 1);
  } finally { await rm(freshDir, {recursive:true,force:true}); }

  // If Redis goes down, never silently return empty accounts or write local state.
  down = true;
  await assert.rejects(() => readCustomerAccountState(dir), /Upstash Redis request failed/);
  await assert.rejects(() => writeCustomerAccountState(first,dir), /Upstash Redis request failed/);
  down = false;

  // Half-configured Redis fails closed and never falls back to local files.
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  await assert.rejects(() => readCustomerAccountState(dir), /Both Upstash Redis REST/);
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-test-token';

  // Existing local developer setup is still available with no Redis credentials.
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const local = await readCustomerAccountState(dir);
  assert.deepEqual(local.users, original);

  console.log('PASS: Redis migration, restart durability, sessions/drafts, fail-closed, local fallback ('+requests+' mock requests).');
} finally {
  globalThis.fetch = oldFetch;
  if (oldUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = oldUrl;
  if (oldToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = oldToken;
  await rm(dir,{recursive:true,force:true});
}
