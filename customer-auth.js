
import express from 'express';
import nodemailer from 'nodemailer';
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
const RESET_MINUTES = 30;

const APP_URL =
  'https://zala-music-video-studio.onrender.com';

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

function mailTransport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error(
      'Gmail SMTP credentials are not configured.'
    );
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user,
      pass
    }
  });
}

async function sendResetEmail(email, name, token) {
  const link =
    APP_URL +
    '/reset-password.html?token=' +
    encodeURIComponent(token);

  const transporter = mailTransport();

  await transporter.sendMail({
    from: {
      name: 'Cut Loopz Media',
      address: process.env.SMTP_USER
    },
    to: email,
    subject: 'Reset Your Cut Loopz Media Password',
    text:
      `Hello ${name},\n\n` +
      'We received a request to reset your ' +
      'Cut Loopz Media password.\n\n' +
      'Open this secure link:\n' +
      link + '\n\n' +
      'This link expires in 30 minutes ' +
      'and can only be used once.\n\n' +
      'If you did not request this change, ' +
      'you can ignore this email.\n\n' +
      'Cut Loopz Media',
    html:
      '<div style="font-family:Arial,sans-serif;' +
      'max-width:540px;margin:auto;' +
      'padding:24px;color:#222">' +
      '<h2 style="color:#b48b36">' +
      'Cut Loopz Media</h2>' +
      '<p>We received a request to reset ' +
      'your account password.</p>' +
      '<p><a href="' + link + '" ' +
      'style="display:inline-block;' +
      'padding:14px 22px;' +
      'background:#171717;color:#fff;' +
      'text-decoration:none;border-radius:8px">' +
      'Reset My Password</a></p>' +
      '<p>This link expires in 30 minutes ' +
      'and can only be used once.</p>' +
      '<p>If you did not request this change, ' +
      'you can ignore this email.</p>' +
      '<p>Cut Loopz Media</p></div>'
  });
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
  const draftsFile = path.join(directory, 'studio-drafts.json');

  let users = [];
  let sessions = [];
  let drafts = [];
  const draftAttempts = new Map();
  let initialized = false;
  let initializationPromise = null;
  let writeQueue = Promise.resolve();

  async function readJson(file) {
    try {
      return JSON.parse(
        await fs.readFile(file, 'utf8')
      );
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async function initialize() {
    if (initialized) return;

    if (!initializationPromise) {
      initializationPromise = (async () => {
        await fs.mkdir(directory, {
          recursive: true,
          mode: 0o700
        });

        const loadedUsers = await readJson(usersFile);
        const loadedSessions = await readJson(sessionsFile);
        const loadedDrafts = await readJson(draftsFile);

        if (
          !Array.isArray(loadedUsers) ||
          !Array.isArray(loadedSessions) ||
          !Array.isArray(loadedDrafts)
        ) {
          throw new Error(
            'Invalid customer account storage.'
          );
        }

        users = loadedUsers;
        sessions = loadedSessions;
        drafts = loadedDrafts;
        initialized = true;
      })().catch(error => {
        initializationPromise = null;
        throw error;
      });
    }

    await initializationPromise;
  }

  function save() {
    const operation = writeQueue.then(async () => {
      await fs.mkdir(directory, {
        recursive: true,
        mode: 0o700
      });

      const writeAtomic = async (file, data) => {
        const temp =
          file + '.' + randomUUID() + '.tmp';

        await fs.writeFile(
          temp,
          JSON.stringify(data, null, 2),
          { mode: 0o600 }
        );

        await fs.rename(temp, file);
      };

      await writeAtomic(usersFile, users);
      await writeAtomic(sessionsFile, sessions);
      await writeAtomic(draftsFile, drafts);
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
      console.error(
        'Customer account storage error:',
        error
      );

      res.status(503).json({
        ok: false,
        error:
          'Customer accounts are temporarily unavailable.'
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
          error:
            'Too many attempts. Please try later.'
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
          error:
            'Enter a name, valid email, and password of 12–128 characters.'
        });
      }

      if (users.some(user => user.email === email)) {
        return res.status(409).json({
          ok: false,
          error:
            'An account already exists for this email.'
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
      console.error(
        'Customer registration error:',
        error
      );

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
          error:
            'Too many attempts. Please try later.'
        });
      }

      if (
        !validEmail(email) ||
        typeof password !== 'string'
      ) {
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
        !(await verifyPassword(
          password,
          user.passwordHash
        ))
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
      console.error(
        'Customer login error:',
        error
      );

      res.status(500).json({
        ok: false,
        error: 'Could not sign in.'
      });
    }
  });

  router.post('/forgot-password', async (req, res) => {
    try {
      const email = String(req.body?.email || '')
        .trim()
        .toLowerCase();

      const genericMessage =
        'If an account exists for this email, ' +
        'a password reset link will be sent.';

      if (!validEmail(email)) {
        return res.status(400).json({
          ok: false,
          error: 'Enter a valid email address.'
        });
      }

      if (
        rateLimited('reset-ip:' + req.ip) ||
        rateLimited('reset-email:' + email)
      ) {
        return res.status(429).json({
          ok: false,
          error:
            'Too many requests. Please try again later.'
        });
      }

      const user = users.find(
        item => item.email === email
      );

      if (!user) {
        return res.json({
          ok: true,
          message: genericMessage
        });
      }

      const token = randomBytes(32).toString('hex');

      user.passwordReset = {
        tokenHash: sessionHash(token),
        expiresAt: new Date(
          Date.now() + RESET_MINUTES * 60000
        ).toISOString()
      };

      await save();

      try {
        await sendResetEmail(
          user.email,
          user.name,
          token
        );
      } catch (mailError) {
        console.error(
          'Password recovery email delivery failed:',
          mailError.message
        );

        if (
          user.passwordReset?.tokenHash ===
          sessionHash(token)
        ) {
          delete user.passwordReset;
          await save();
        }

        return res.status(503).json({
          ok: false,
          error:
            'Password recovery email is temporarily unavailable. Please try later.'
        });
      }

      res.json({
        ok: true,
        message: genericMessage
      });
    } catch (error) {
      console.error(
        'Forgot password error:',
        error
      );

      res.status(500).json({
        ok: false,
        error:
          'Unable to process password recovery.'
      });
    }
  });

  router.post('/reset-password', async (req, res) => {
    try {
      const token = req.body?.token;
      const password = req.body?.password;

      if (rateLimited('reset-submit:' + req.ip)) {
        return res.status(429).json({
          ok: false,
          error:
            'Too many attempts. Please try later.'
        });
      }

      if (
        typeof token !== 'string' ||
        !/^[0-9a-f]{64}$/i.test(token)
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'Invalid or expired password reset link.'
        });
      }

      if (!validPassword(password)) {
        return res.status(400).json({
          ok: false,
          error:
            'Your new password must contain 12–128 characters.'
        });
      }

      const hashedToken = sessionHash(token);

      const user = users.find(item =>
        item.passwordReset?.tokenHash === hashedToken &&
        Date.parse(
          item.passwordReset.expiresAt
        ) > Date.now()
      );

      if (!user) {
        return res.status(400).json({
          ok: false,
          error:
            'Invalid or expired password reset link.'
        });
      }

      const newHash = await hashPassword(password);

      user.passwordHash = newHash;
      delete user.passwordReset;

      sessions = sessions.filter(
        item => item.userId !== user.id
      );

      await save();

      res.clearCookie(
        'zala_session',
        cookieOptions(req)
      );

      res.json({
        ok: true,
        message:
          'Your password has been changed. Please sign in.'
      });
    } catch (error) {
      console.error(
        'Password reset error:',
        error
      );

      res.status(500).json({
        ok: false,
        error:
          'Unable to reset your password.'
      });
    }
  });

  // Account-owned drafts: never use the administrator key for free creative work.
  // Do not store actual audio/photo bytes here. They must be selected again after refresh.
  function sameOrigin(req) {
    const origin = req.get('origin');
    if (!origin) return true; // Native clients may omit Origin; cookies still required.
    try { return new URL(origin).host === req.get('host') &&
      ['https:', 'http:'].includes(new URL(origin).protocol); }
    catch { return false; }
  }
  router.get('/studio/draft', (req, res) => {
    const session = findSession(req);
    if (!session) return res.status(401).json({ok:false,error:'Sign in to sync your draft.'});
    const entry = drafts.find(item => item.userId === session.user.id);
    res.json({ok:true,draft:entry?.draft || null,updatedAt:entry?.updatedAt || null});
  });
  router.put('/studio/draft', async (req, res) => {
    const session = findSession(req);
    if (!session) return res.status(401).json({ok:false,error:'Sign in to save your draft.'});
    if (!sameOrigin(req)) return res.status(403).json({ok:false,error:'Invalid request origin.'});
    const now = Date.now();
    const previous = draftAttempts.get(session.user.id);
    const item = !previous || now - previous.started > 900000 ? {started:now,count:1} : {started:previous.started,count:previous.count+1};
    draftAttempts.set(session.user.id,item);
    if(item.count>120)return res.status(429).json({ok:false,error:'Draft save limit reached. Try again later.'});
    const source = req.body?.draft;
    if (!source || typeof source!=='object' || Array.isArray(source))
      return res.status(400).json({ok:false,error:'Invalid project draft.'});
    const serialized = JSON.stringify(source);
    if (!serialized || Buffer.byteLength(serialized,'utf8')>240000)
      return res.status(413).json({ok:false,error:'Project draft exceeds 240 KB.'});
    // Strip unrecognized keys; never store client-supplied account identifiers.
    const allowed=['source','title','lyrics','songSeconds','sceneSeconds','style','format','direction',
      'songLink','songName','photoName','characterNotes','scenePage','page','scenes','musicResult',
      'analysisSourceKey','storyboardSourceKey'];
    const draft = Object.fromEntries(allowed.filter(key => Object.hasOwn(source,key)).map(key=>[key,source[key]]));
    try {
      drafts = drafts.filter(item=>item.userId!==session.user.id);
      const updatedAt = new Date().toISOString();
      drafts.push({userId:session.user.id,draft,updatedAt});
      await save();
      res.json({ok:true,updatedAt});
    } catch(error) {res.status(503).json({ok:false,error:'Draft storage unavailable.'});}
  });
  router.delete('/studio/draft', async(req,res)=>{
    const session=findSession(req);
    if(!session)return res.status(401).json({ok:false,error:'Sign in first.'});
    if(!sameOrigin(req))return res.status(403).json({ok:false,error:'Invalid request origin.'});
    try{drafts=drafts.filter(item=>item.userId!==session.user.id);await save();res.json({ok:true});}
    catch{res.status(503).json({ok:false,error:'Draft storage unavailable.'})}
  });

  // Artist-created public directory: metadata and OFF-SITE links only.
  // Images/audio/video are not accepted or copied into CutLoopz storage.
  const CREATOR_PLATFORMS = Object.freeze(['Suno','Udio','YouTube','Spotify','SoundCloud','Traditional Studio','Other']);
  const creatorSaveAttempts = new Map();
  const cleanText = (value, max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
  function cleanExternalUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
      // No internal, loopback or single-label hosts. These links are rendered as
      // anchors only; the service NEVER fetches content from external URLs.
      const host = url.hostname.toLowerCase();
      if (!host.includes('.') || host==='localhost' || /^(?:10|127|0|192\.168|169\.254)\./.test(host)) return null;
      return url.toString();
    } catch { return null; }
  }
  function publicCreator(user) {
    const profile=user.creatorProfile;
    if (!profile || profile.visibility !== 'public') return null;
    return { id:user.id, artistName:profile.artistName, bio:profile.bio,
      genre:profile.genre, platforms:profile.platforms, artistPageUrl:profile.artistPageUrl,
      socialLinks:profile.socialLinks, videoLinks:profile.videoLinks,
      updatedAt:profile.updatedAt };
  }
  router.get('/creator-profile', (req,res)=>{
    const identity=findSession(req);
    if (!identity) return res.status(401).json({ok:false,error:'Sign in to edit your artist profile.'});
    res.json({ok:true,profile:identity.user.creatorProfile||null});
  });
  router.put('/creator-profile', async (req,res)=>{
    const identity=findSession(req);
    if (!identity) return res.status(401).json({ok:false,error:'Sign in to edit your artist profile.'});
    if (!sameOrigin(req)) return res.status(403).json({ok:false,error:'Invalid request origin.'});
    const raw=req.body?.profile;
    if (!raw || typeof raw!=='object' || Array.isArray(raw)) return res.status(400).json({ok:false,error:'Invalid profile data.'});
    const now=Date.now(),key=identity.user.id, attempt=creatorSaveAttempts.get(key);
    const next=!attempt||now-attempt.start>900000?{start:now,count:1}:{start:attempt.start,count:attempt.count+1};
    creatorSaveAttempts.set(key,next);
    if(next.count>60)return res.status(429).json({ok:false,error:'Too many profile changes. Please try again later.'});
    const artistName=cleanText(raw.artistName,80);
    if(artistName.length<2)return res.status(400).json({ok:false,error:'Enter an artist name of at least 2 characters.'});
    const visibility=['public','private','hidden'].includes(raw.visibility)?raw.visibility:'private';
    if(!Array.isArray(raw.platforms) || raw.platforms.length>CREATOR_PLATFORMS.length)
      return res.status(400).json({ok:false,error:'Invalid music platform selection.'});
    const platforms=[...new Set(raw.platforms.filter(x=>CREATOR_PLATFORMS.includes(x)))];
    const linkEntries=(items,max)=>{
      if (!Array.isArray(items)||items.length>max) return null;
      const parsed=[];
      for(const value of items){const href=cleanExternalUrl(value);if(!href)return null;if(!parsed.includes(href))parsed.push(href);}
      return parsed;
    };
    const videoLinks=linkEntries(raw.videoLinks||[],8);
    const socialLinks=linkEntries(raw.socialLinks||[],6);
    if(!videoLinks||!socialLinks)return res.status(400).json({ok:false,error:'Links must be valid https:// public website addresses (8 videos and 6 social links maximum).'});
    const artistPageUrl=raw.artistPageUrl?cleanExternalUrl(raw.artistPageUrl):'';
    if(raw.artistPageUrl&&!artistPageUrl)return res.status(400).json({ok:false,error:'Artist page must be a valid https:// link.'});
    const profile={artistName,bio:cleanText(raw.bio,1000),genre:cleanText(raw.genre,100),
      platforms,visibility,artistPageUrl,socialLinks,videoLinks,
      updatedAt:new Date().toISOString()};
    identity.user.creatorProfile=profile;
    try{await save();res.json({ok:true,profile});}
    catch(error){console.error('Creator profile save failed:',error);res.status(503).json({ok:false,error:'Profile could not be saved.'});}
  });
  router.get('/creators', (_req,res)=>{
    const creators=users.map(publicCreator).filter(Boolean)
      .sort((a,b)=>String(a.artistName).localeCompare(String(b.artistName)))
      .slice(0,100);
    res.json({ok:true,creators});
  });
  router.get('/creators/:id', (req,res)=>{
    if(!/^[0-9a-f-]{36}$/i.test(req.params.id))return res.status(404).json({ok:false,error:'Artist not found.'});
    const user=users.find(u=>u.id===req.params.id);
    const profile=user?publicCreator(user):null;
    if(!profile)return res.status(404).json({ok:false,error:'Artist not found.'});
    res.json({ok:true,creator:profile});
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
      const token = getCookie(
        req,
        'zala_session'
      );

      if (token) {
        const hashed = sessionHash(token);

        sessions = sessions.filter(
          item => item.tokenHash !== hashed
        );

        await save();
      }

      res.clearCookie(
        'zala_session',
        cookieOptions(req)
      );

      res.json({
        ok: true,
        message: 'Signed out.'
      });
    } catch (error) {
      console.error(
        'Customer logout error:',
        error
      );

      res.status(500).json({
        ok: false,
        error: 'Could not sign out.'
      });
    }
  });

  // Private preview: allow a signed-in, explicitly configured owner to use the
  // local engine. Never infer ownership from the first registrant or a URL flag.
  router.authenticatedUser = async req => {
    await initialize();
    return findSession(req)?.user || null;
  };
  return router;
}
