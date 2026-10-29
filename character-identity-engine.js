
/**
 * Zala QI's World — Character Identity Engine
 * Foundation v1
 *
 * No additional npm packages or paid API calls.
 *
 * This module prepares a persistent reference-photo
 * manifest and adds identity-preservation instructions.
 *
 * It does not yet perform facial recognition,
 * face replacement, or verified identity matching.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

function characterIdentityInstructions({
  hasReferencePhoto = false
} = {}) {
  if (!hasReferencePhoto) {
    return (
      'Keep the appearance of recurring characters ' +
      'consistent within each shot and across scenes. '
    );
  }

  return [
    'CHARACTER IDENTITY — HIGHEST PRIORITY:',
    'The supplied reference image defines the main character.',
    'Preserve the same recognizable person in every frame',
    'and every scene.',
    'Keep the same facial structure, eyes, nose, lips,',
    'jawline, skin tone, hair color, hair length,',
    'hairstyle, and apparent age.',
    'Never replace the actor or invent a different face',
    'when moving between exterior and interior shots.',
    'Maintain identity through changes in camera angle,',
    'lighting, pose, emotion, and environment.',
    'Keep wardrobe consistent unless explicitly changed.',
    'Avoid face morphing, hairstyle drift, and sudden',
    'appearance changes.',
    'When identity and visual spectacle conflict,',
    'prioritize preserving the reference person.'
  ].join(' ') + ' ';
}

async function prepareCharacterReference({
  jobDirectory,
  mimeType = 'image/jpeg'
}) {
  if (!jobDirectory || typeof jobDirectory !== 'string') {
    throw new Error('jobDirectory is required');
  }

  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error('Unsupported reference photo type');
  }

  const sourcePath = path.join(jobDirectory, 'reference');
  const bytes = await fs.readFile(sourcePath);

  if (bytes.length === 0 || bytes.length > 30 * 1024 * 1024) {
    throw new Error('Reference photo is empty or exceeds 30 MB');
  }

  const sha256 = createHash('sha256')
    .update(bytes)
    .digest('hex');

  const manifest = {
    version: 1,
    type: 'character-reference',
    source: 'uploaded-photo',
    mimeType,
    sha256,
    byteLength: bytes.length,
    referenceFile: 'reference',
    identityVerified: false,
    verificationNote:
      'Image fingerprint confirms file integrity, ' +
      'not facial identity.'
  };

  const target = path.join(
    jobDirectory,
    'character-identity.json'
  );

  await fs.writeFile(
    target + '.tmp',
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 }
  );

  await fs.rename(target + '.tmp', target);

  return {
    manifest,
    imageUrl:
      `data:${mimeType};base64,` +
      bytes.toString('base64'),
    instructions: characterIdentityInstructions({
      hasReferencePhoto: true
    })
  };
}

function applyCharacterIdentityToPrompt(
  prompt,
  { hasReferencePhoto = false } = {}
) {
  if (typeof prompt !== 'string') {
    throw new Error('prompt must be a string');
  }

  return characterIdentityInstructions({
    hasReferencePhoto
  }) + prompt;
}

export {
  prepareCharacterReference,
  characterIdentityInstructions,
  applyCharacterIdentityToPrompt
};
