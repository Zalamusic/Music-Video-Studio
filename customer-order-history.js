
import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';

const QUALIFYING_VIDEOS = 6;

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');

  for (const cookie of cookies) {
    const index = cookie.indexOf('=');

    if (index < 0) continue;

    if (cookie.slice(0, index).trim() === name) {
      return cookie.slice(index + 1).trim();
    }
  }

  return null;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function safeEqual(a, b) {
  if (
    typeof a !== 'string' ||
    typeof b !== 'string' ||
    a.length !== b.length
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(a),
    Buffer.from(b)
  );
}

function isVerifiedPaidCompletedOrder(order) {
  if (!order || typeof order !== 'object') {
    return false;
  }

  return (
    order.paymentEnvironment === 'live' &&
    order.paymentStatus === 'completed' &&
    order.paymentVerifiedByServer === true &&
    order.videoStatus === 'completed' &&
    order.videoCompletedVerifiedByServer === true &&
    typeof order.paypalCaptureId === 'string' &&
    order.paypalCaptureId.length > 0
  );
}

export function createCustomerOrderHistoryRouter({
  storageDirectory = '/app/outputs'
} = {}) {
  const router = express.Router();

  const accountsDirectory = path.join(
    storageDirectory,
    'customer-accounts'
  );

  const ordersDirectory = path.join(
    storageDirectory,
    'customer-orders'
  );

  router.get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');

    try {
      const token = getCookie(req, 'zala_session');

      if (
        !token ||
        !/^[0-9a-f]{64}$/i.test(token)
      ) {
        return res.status(401).json({
          ok: false,
          error: 'Please sign in.'
        });
      }

      const tokenHash = createHash('sha256')
        .update(token)
        .digest('hex');

      const users = await readJson(
        path.join(accountsDirectory, 'users.json'),
        []
      );

      const sessions = await readJson(
        path.join(accountsDirectory, 'sessions.json'),
        []
      );

      if (
        !Array.isArray(users) ||
        !Array.isArray(sessions)
      ) {
        throw new Error('Invalid account storage.');
      }

      const session = sessions.find(item =>
        safeEqual(item?.tokenHash, tokenHash) &&
        Date.parse(item.expiresAt) > Date.now()
      );

      const customer = session
        ? users.find(user => user.id === session.userId)
        : null;

      if (!customer) {
        return res.status(401).json({
          ok: false,
          error: 'Please sign in again.'
        });
      }

      const filenames = await fs.readdir(
        ordersDirectory
      ).catch(error => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });

      const orders = [];

      for (const filename of filenames) {
        if (!/^[0-9a-f-]{36}\.json$/i.test(filename)) {
          continue;
        }

        const order = await readJson(
          path.join(ordersDirectory, filename),
          null
        );

        if (
          !order ||
          order.customerId !== customer.id
        ) {
          continue;
        }

        orders.push(order);
      }

      orders.sort(
        (a, b) =>
          (Date.parse(b.createdAt) || 0) -
          (Date.parse(a.createdAt) || 0)
      );

      const qualifyingOrders = orders.filter(
        isVerifiedPaidCompletedOrder
      );

      const uniquePayments = new Set(
        qualifyingOrders.map(order => order.paypalCaptureId)
      );

      const qualifyingCount = uniquePayments.size;

      const platinumUnlocked =
        qualifyingCount >= QUALIFYING_VIDEOS;

      const publicOrders = orders.map(order => ({
        id: order.id,
        title: order.title || 'Music Video',
        createdAt: order.createdAt || null,
        paymentStatus: order.paymentStatus || 'pending',
        videoStatus: order.videoStatus || 'pending',
        qualifiesForPlatinum:
          isVerifiedPaidCompletedOrder(order)
      }));

      return res.json({
        ok: true,
        orders: publicOrders,
        loyalty: {
          program: 'Platinum Hitmaker',
          qualifyingVideos: qualifyingCount,
          requiredVideos: QUALIFYING_VIDEOS,
          progress: Math.min(
            qualifyingCount,
            QUALIFYING_VIDEOS
          ),
          platinumUnlocked,
          rewardStatus: platinumUnlocked
            ? 'Eligibility reached; reward not activated'
            : 'In progress',
          discountActive: false,
          discountPercent: 0
        }
      });
    } catch (error) {
      console.error(
        'Customer order history error:',
        error
      );

      return res.status(503).json({
        ok: false,
        error: 'Order history is temporarily unavailable.'
      });
    }
  });

  return router;
}
