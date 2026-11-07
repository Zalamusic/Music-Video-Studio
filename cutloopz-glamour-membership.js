/**
 * CutLoopz Glamour Membership + Wardrobe Contract v1
 * Prepaid entitlements and five-look scheduling. No payment collection,
 * video generation, provider calls, or public membership activation.
 * Node.js ESM; the production server must supply verified payment events
 * and authenticated customer identities before customer launch.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export const GLAMOUR_TERMS = Object.freeze({
 month1: Object.freeze({ months: 1, cents: 2499 }),
 month3: Object.freeze({ months: 3, cents: 6999 }),
 month6: Object.freeze({ months: 6, cents: 12999 }),
 year1: Object.freeze({ months: 12, cents: 23999 })
});
export const VIDEO_PRICE_CENTS = 7999;
export const MAX_GLAMOUR_PHOTOS = 5;
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function timestamp(value) {
 const date = value instanceof Date ? new Date(value) : new Date(value);
 if (!Number.isFinite(date.getTime())) throw new Error('Invalid timestamp.');
 return date;
}
/** Uses calendar months, clamping the day to avoid March 31 -> May 1. */
export function addCalendarMonthsUTC(start, months) {
 const date = timestamp(start);
 if (!Number.isInteger(months) || months < 1 || months > 12) throw new Error('Invalid membership term.');
 const year = date.getUTCFullYear();
 const month = date.getUTCMonth();
 const day = date.getUTCDate();
 const first = new Date(Date.UTC(year, month + months, 1,
 date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
 const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
 first.setUTCDate(Math.min(day, lastDay));
 return first.toISOString();
}
export function quoteGlamourTerm(termId) {
 const term = GLAMOUR_TERMS[termId];
 if (!term) throw new Error('Unknown prepaid Glamour membership term.');
 return {
 termId, months: term.months, amountCents: term.cents, currency: 'USD',
 prepaid: true, automaticRenewal: false,
 videoGenerationIncluded: false, maxReferencePhotos: MAX_GLAMOUR_PHOTOS
 };
}
export function membershipActive(membership, at = new Date()) {
 const now = timestamp(at).getTime();
 return Boolean(membership && membership.status === 'active' &&
 Number.isFinite(Date.parse(membership.startsAt)) &&
 Number.isFinite(Date.parse(membership.expiresAt)) &&
 Date.parse(membership.startsAt) <= now && now < Date.parse(membership.expiresAt));
}
export function wardrobeAllowance(membership, at = new Date()) {
 return membershipActive(membership, at) ? MAX_GLAMOUR_PHOTOS : 1;
}
/**
 * Pure wardrobe planner. References are opaque asset IDs, NOT remote URLs.
 * Authorization and upload ownership checks must occur at the server boundary.
 */
export function buildWardrobeSchedule({ membership, referencePhotos, assignments, segments, at = new Date() } = {}) {
 if (!Array.isArray(referencePhotos) || referencePhotos.length === 0) { throw new Error('A lead artist photograph is required.');
 }
 const limit = wardrobeAllowance(membership, at);
 if (referencePhotos.length > limit) throw new Error(`Your membership allows up to ${limit} reference photo(s).`);
 const photoIds = new Set();
 for (const photo of referencePhotos) {
 if (!object(photo) || !safeId(photo.assetId) ||
 typeof photo.label !== 'string' || !photo.label.trim() || photo.label.length > 80 ||
 photoIds.has(photo.assetId)) throw new Error('Invalid or duplicate reference photo.');
 photoIds.add(photo.assetId);
 }
 if (!Array.isArray(segments) || segments.length === 0 || segments.length > 1000) {
 throw new Error('Approved timeline segments are required.');
 }
 if (!Array.isArray(assignments)) throw new Error('Wardrobe assignments must be an array.');
 if (assignments.length !== segments.length) throw new Error('Every segment needs one approved wardrobe assignment.');
 const map = new Map();
 for (const a of assignments) {
 if (!object(a) || !Number.isInteger(a.segmentNumber) ||
 !photoIds.has(a.assetId) || map.has(a.segmentNumber)) {
 throw new Error('Invalid, unknown, or duplicate wardrobe assignment.');
 }
 map.set(a.segmentNumber, a.assetId);
 }
 let previous = 0;
 const scheduled = segments.map((seg, i) => {
 const start = Math.round(Number(seg?.startSeconds) * 1000);
 const end = Math.round(Number(seg?.endSeconds) * 1000);
 if (seg?.number !== i + 1 || !Number.isSafeInteger(start) ||
 !Number.isSafeInteger(end) || start !== previous || end <= start) {
 throw new Error('Invalid or discontinuous approved timeline.');
 }
 previous = end;
 const assetId = map.get(seg.number);
 if (!assetId) throw new Error('Unassigned wardrobe segment.');
 const photo = referencePhotos.find(p => p.assetId === assetId);
 return {
 number: seg.number, startSeconds: start / 1000, endSeconds: end / 1000,
 wardrobeAssetId: assetId, wardrobeLabel: photo.label.trim(),
 instructions: `Use approved look "${photo.label.trim()}" from the assigned original reference. Preserve the artist identity and specified outfit. No unapproved costume substitution.`,
 visualIdentityVerification: 'required',
 approvedReferenceVerified: false
 };
 });
 return {
 version: 1, mode: 'planning-only', photoLimit: limit,
 photosUsed: referencePhotos.length, segments: scheduled,
 warning: 'Scene images must be prepared and identity/wardrobe reviewed before rendering.'
 };
}
/**
 * Read-only member storage and privileged payment activation.
 * The caller MUST verify payment server-side first and provide a unique
 * verified capture ID. Never invoke from untrusted browser request data.
 */
export function createGlamourMembershipStore({ directory }) {
 if (typeof directory !== 'string' || !path.isAbsolute(directory)) {
 throw new Error('An absolute persistent membership directory is required.');
 }
 const file = path.join(directory, 'memberships.json');
 const lock = path.join(directory, '.membership-write-lock');
 async function read() {
 try {
 const data = JSON.parse(await fs.readFile(file, 'utf8'));
 if (!object(data) || data.version !== 1 || !object(data.members) || !object(data.captures)) {
 throw new Error('Membership database invalid; activation blocked.');
 }
 return data;
 } catch (err) { if (err.code === 'ENOENT') return { version: 1, members: {}, captures: {} };
 throw err;
 }
 }
 async function write(data) {
 const temp = `${file}.${randomUUID()}.tmp`;
 try {
 await fs.writeFile(temp, JSON.stringify(data, null, 2), { flag: 'wx', mode: 0o600 });
 await fs.rename(temp, file);
 } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
 }
 async function withLock(fn) {
 await fs.mkdir(directory, { recursive: true });
 try { await fs.mkdir(lock); }
 catch (err) {
 if (err.code === 'EEXIST') throw new Error('Membership update locked; inspect before retrying.');
 throw err;
 }
 try { return await fn(); }
 finally { await fs.rmdir(lock).catch(() => {}); }
 }
 return {
 async get(customerId) {
 if (!safeId(customerId)) throw new Error('Invalid customer ID.');
 return (await read()).members[customerId] || null;
 },
 async recordVerifiedCapture({ customerId, termId, captureId, amountCents, currency = 'USD', capturedAt }) {
 if (!safeId(customerId) || !safeId(captureId)) throw new Error('Invalid customer or capture ID.');
 const quote = quoteGlamourTerm(termId);
 if (!Number.isInteger(amountCents) || amountCents !== quote.amountCents || currency !== 'USD') {
 throw new Error('Verified payment does not match Glamour term price.');
 }
 const paidAt = timestamp(capturedAt).toISOString();
 return withLock(async () => {
 const db = await read();
 if (db.captures[captureId]) {
 if (db.captures[captureId].customerId !== customerId || db.captures[captureId].termId !== termId) {
 throw new Error('Payment capture already associated with another membership.');
 }
 return { membership: db.members[customerId], duplicate: true };
 }
 const prior = db.members[customerId];
 const begins = prior && Date.parse(prior.expiresAt) > Date.parse(paidAt) ? prior.expiresAt : paidAt;
 const membership = {
 customerId, status: 'active', termId, startsAt: prior?.startsAt && Date.parse(prior.expiresAt) > Date.parse(paidAt) ? prior.startsAt : paidAt,
 expiresAt: addCalendarMonthsUTC(begins, quote.months),
 lastPaymentCaptureId: captureId, updatedAt: paidAt
 };
 db.captures[captureId] = { customerId, termId, amountCents, capturedAt: paidAt };
 db.members[customerId] = membership;
 await write(db);
 return { membership, duplicate: false };
 });
 }
 };
}
