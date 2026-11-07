/**
 * CutLoopz Glamour integration v1.
 * Connects pricing, admin-only account inspection, and wardrobe planning.
 * No public membership activation, payment capture, photo uploads,
 * emails, or generation. Those require separately verified integrations.
 */
import path from 'node:path';
import {
 quoteGlamourTerm,
 createGlamourMembershipStore,
 buildWardrobeSchedule
} from './cutloopz-glamour-membership.js';
const TERMS = ['month1', 'month3', 'month6', 'year1'];
const customerIdValid = id =>
 typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
export function registerCutLoopzGlamourRoutes({ app, isVideoAdmin, outputDirectory }) {
 if (!app || typeof app.get !== 'function' ||
 typeof app.post !== 'function' ||
 typeof isVideoAdmin !== 'function' ||
 typeof outputDirectory !== 'string' ||
 !path.isAbsolute(outputDirectory)) {
 throw new Error('Glamour routes require app, admin authentication and persistent storage.');
 }
 const store = createGlamourMembershipStore({
 directory: path.join(outputDirectory, 'glamour-memberships')
 });
 const adminOnly = (req, res, next) => {
 if (!isVideoAdmin(req)) {
 return res.status(403).json({ ok: false, error: 'Administrator access required.' });
 }
 return next();
 };
 // Public pricing is informational; no purchase or activation is possible here.
 app.get('/api/glamour/plans', (_req, res) => {
 res.set('Cache-Control', 'no-store');
 return res.json({
 ok: true,
 name: 'CutLoopz Glamour',
 prepaid: true,
 autoRenewal: false,
 videoGenerationIncluded: false,
 photosBasic: 1,
 photosGlamour: 5,
 membershipCheckoutEnabled: false,
 plans: TERMS.map(quoteGlamourTerm)
 });
 });
 // Until customer sessions are integrated, NEVER expose another person's
 // subscription details through a public endpoint.
 app.get('/api/glamour/admin/member/:customerId', adminOnly, async (req, res) => {
 if (!customerIdValid(req.params.customerId)) {
 return res.status(400).json({ ok: false, error: 'Invalid customer ID.' });
 }
 try {
 const member = await store.get(req.params.customerId);
 res.set('Cache-Control', 'private, no-store');
 return res.json({ ok: true, membership: member });
 } catch (error) {
 console.error('Glamour membership read:', error);
 return res.status(503).json({ ok: false, error: 'Membership status unavailable.' });
 }
 });
 // Planning only: the admin supplies asset IDs from approved uploads.
 // This does NOT verify an upload, create a preview image, or render video.
 app.post('/api/glamour/admin/wardrobe-preview', adminOnly, async (req, res) => {
 try {
 const { customerId, referencePhotos, assignments, segments } = req.body || {};
 if (!customerIdValid(customerId)) {
 return res.status(400).json({ ok: false, error: 'Invalid customer ID.' });
 } const membership = await store.get(customerId);
 const schedule = buildWardrobeSchedule({
 membership, referencePhotos, assignments, segments
 });
 res.set('Cache-Control', 'private, no-store');
 return res.json({ ok: true, customerId, schedule });
 } catch (error) {
 if (error.message === 'Membership database invalid; activation blocked.') {
 return res.status(503).json({ ok: false, error: 'Membership store unavailable.' });
 }
 return res.status(400).json({ ok: false, error: error.message });
 }
 });
}
