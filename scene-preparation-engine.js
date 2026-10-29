
/**
 * Zala QI's World
 * Automatic Scene Preparation Engine
 *
 * Creates a scene-specific starting image from
 * the customer's uploaded reference photograph.
 *
 * Uses the existing FAL_KEY configuration.
 */

import { fal } from '@fal-ai/client';

const SCENE_IMAGE_MODEL = 'fal-ai/flux-kontext/dev';

export async function prepareSceneImage({
  referenceImageUrl,
  sceneDescription,
  format = 'portrait'
}) {
  if (!referenceImageUrl) {
    throw new Error('Character reference image is missing.');
  }

  if (!sceneDescription?.trim()) {
    throw new Error('Scene description is missing.');
  }

  const prompt = [
    'Edit the provided photograph into a completely new',
    'photorealistic cinematic music video scene.',
    'Keep the same person recognizable.',
    'Preserve facial features, skin tone, hairstyle,',
    'body proportions and overall identity.',
    'Requested scene:',
    sceneDescription,
    'Completely replace the original background.',
    'Remove microphones, microphone stands,',
    'stage equipment and unwanted original objects',
    'unless explicitly requested in the scene.',
    'Use realistic cinematic lighting.',
    'The person should appear naturally integrated',
    'into the requested environment.',
    'No split screens, collages or transition effects.',
    format === 'landscape'
      ? 'Use a cinematic horizontal composition.'
      : 'Use a cinematic vertical composition.'
  ].join(' ');

  const result = await fal.subscribe(SCENE_IMAGE_MODEL, {
    input: {
      image_url: referenceImageUrl,
      prompt,
      num_images: 1,
      output_format: 'jpeg'
    },
    logs: false
  });

  const imageUrl =
    result?.data?.images?.[0]?.url ||
    result?.images?.[0]?.url;

  if (!imageUrl) {
    throw new Error(
      'Scene Preparation Engine returned no image.'
    );
  }

  return {
    imageUrl,
    model: SCENE_IMAGE_MODEL
  };
}
