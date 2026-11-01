
import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  randomUUID,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

const SESSION_DAYS = 7;
const MAX_SESSIONS_PER_USER = 5;
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const attempts = new Map();

function validEmail(email) {
  return typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPassword(password) {
  return typeof password === 'string' &&
    password.length >= 12 &&
    password.length <= 128;
}

function sessionHash(token) {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1
  });

  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [salt, hex] = String(stored || '').split(':');

  if (
    !salt ||
    !/^[0-9a-f]{32}$/i.test(salt) ||
    !/^[0-9a-f]{128}$/i.test(hex || '')
  ) {
    return false;
  }

  const expected = Buffer.from(hex, 'hex');
  const actual = await scrypt(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1
  });

  return timingSafeEqual(expected, actual);
}

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || '')
    .split(';');

  for (const item of cookies) {
    const index = item.indexOf('=');

    if (index < 0) continue;

    if (item.slice(0, index).trim() === name) {
      return item.slice(index + 1).trim();
    }
  }

  return null;
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'lax',
    path: '/'
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
}

function rateLimited(key) {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || now - record.started > ATTEMPT_WINDOW_MS) {
    attempts.set(key, {
      count: 1,
      started: now
    });
    return false;
  }

  record.count += 1;
  return record.count > MAX_ATTEMPTS;
}

export function createCustomerAuthRouter({
  storageDirectory = '/app/outputs'
} = {}) {
  const router = express.Router();
  const directory = path.join(
    storageDirectory,
    'customer-accounts'
  );

  const usersFile = path.join(directory, 'users.json');
  const sessionsFile = path.join(directory, 'sessions.json');

  let users = [];
  let sessions = [];
  let initialized = false;
  let writeQueue = Promise.resolve();

  async function readJson(file) {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async function initialize() {
    if (initialized) return;

    await fs.mkdir(directory, {
      recursive: true,
      mode: 0o700
    });

    users = await readJson(usersFile);
    sessions = await readJson(sessionsFile);

    if (!Array.isArray(users) || !Array.isArray(sessions)) {
      throw new Error('Invalid customer account storage.');
    }

    initialized = true;
  }

  function save() {
    const operation = writeQueue.then(async () => {
      await fs.mkdir(directory, {
        recursive: true,
        mode: 0o700
      });

      const writeAtomic = async (file, data) => {
        const temp = file + '.' + randomUUID() + '.tmp';

        await fs.writeFile(
          temp,
          JSON.stringify(data, null, 2),
          { mode: 0o600 }
        );

        await fs.rename(temp, file);
      };

      await writeAtomic(usersFile, users);
      await writeAtomic(sessionsFile, sessions);
    });

    writeQueue = operation.catch(() => {});
    return operation;
  }

  function findSession(req) {
    const token = getCookie(req, 'zala_session');

    if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
      return null;
    }

    const hashed = sessionHash(token);
    const session = sessions.find(
      item =>
        item.tokenHash === hashed &&
        Date.parse(item.expiresAt) > Date.now()
    );

    if (!session) return null;

    const user = users.find(
      item => item.id === session.userId
    );

    return user ? { user, session } : null;
  }

  async function createSession(req, res, user) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + SESSION_DAYS * 86400000
    ).toISOString();

    sessions = sessions.filter(
      item =>
        Date.parse(item.expiresAt) > Date.now() &&
        item.userId !== user.id
    ).concat(
      sessions.filter(
        item =>
          item.userId === user.id &&
          Date.parse(item.expiresAt) > Date.now()
      ).slice(-(MAX_SESSIONS_PER_USER - 1))
    );

    sessions.push({
      id: randomUUID(),
      userId: user.id,
      tokenHash: sessionHash(token),
      expiresAt
    });

    await save();

    res.cookie('zala_session', token, {
      ...cookieOptions(req),
      maxAge: SESSION_DAYS * 86400000
    });
  }

  router.use(async (req, res, next) => {
    try {
      await initialize();
      res.set('Cache-Control', 'no-store');
      next();
    } catch (error) {
      console.error('Customer account storage error:', error);
      res.status(503).json({
        ok: false,
        error: 'Customer accounts are temporarily unavailable.'
      });
    }
  });

  router.post('/register', async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '')
        .trim()
        .toLowerCase();
      const password = req.body?.password;

      if (rateLimited('register:' + req.ip)) {
        return res.status(429).json({
          ok: false,
          error: 'Too many attempts. Please try later.'
        });
      }

      if (
        name.length < 2 ||
        name.length > 80 ||
        !validEmail(email) ||
        !validPassword(password)
      ) {
        return res.status(400).json({
          ok: false,
          error: 'Enter a name, valid email, and password of 12–128 characters.'
        });
      }

      if (users.some(user => user.email === email)) {
        return res.status(409).json({
          ok: false,
          error: 'An account already exists for this email.'
        });
      }

      const user = {
        id: randomUUID(),
        name,
        email,
        passwordHash: await hashPassword(password),
        createdAt: new Date().toISOString()
      };

      users.push(user);
      await save();
      await createSession(req, res, user);

      res.status(201).json({
        ok: true,
        user: publicUser(user)
      });
    } catch (error) {
      console.error('Customer registration error:', error);
      res.status(500).json({
        ok: false,
        error: 'Could not create your account.'
      });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const email = String(req.body?.email || '')
        .trim()
        .toLowerCase();
      const password = req.body?.password;

      if (rateLimited('login:' + req.ip)) {
        return res.status(429).json({
          ok: false,
          error: 'Too many attempts. Please try later.'
        });
      }

      if (!validEmail(email) || typeof password !== 'string') {
        return res.status(401).json({
          ok: false,
          error: 'Invalid email or password.'
        });
      }

      const user = users.find(
        item => item.email === email
      );

      if (
        !user ||
        !(await verifyPassword(password, user.passwordHash))
      ) {
        return res.status(401).json({
          ok: false,
          error: 'Invalid email or password.'
        });
      }

      await createSession(req, res, user);

      res.json({
        ok: true,
        user: publicUser(user)
      });
    } catch (error) {
      console.error('Customer login error:', error);
      res.status(500).json({
        ok: false,
        error: 'Could not sign in.'
      });
    }
  });

  router.get('/me', (req, res) => {
    const result = findSession(req);

    if (!result) {
      return res.status(401).json({
        ok: false,
        error: 'Not signed in.'
      });
    }

    res.json({
      ok: true,
      user: publicUser(result.user)
    });
  });

  router.post('/logout', async (req, res) => {
    try {
      const token = getCookie(req, 'zala_session');

      if (token) {
        const hashed = sessionHash(token);
        sessions = sessions.filter(
          item => item.tokenHash !== hashed
        );
        await save();
      }

      res.clearCookie('zala_session', cookieOptions(req));

      res.json({
        ok: true,
        message: 'Signed out.'
      });
    } catch (error) {
      console.error('Customer logout error:', error);
      res.status(500).json({
        ok: false,
        error: 'Could not sign out.'
      });
    }
  });

  return router;
}
