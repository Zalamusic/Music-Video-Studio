
/**
 * Zala QI's World — Cinematic Scene Preparation Engine
 *
 * Prepares one scene-specific reference frame for image-to-video generation.
 * Respects explicitly requested animated/illustrated styles while defaulting
 * to naturalistic, photographic live action.
 *
 * Compatible with the existing prepareSceneImage({ referenceImageUrl,
 * sceneDescription, format }) call in server.js.
 */
import { fal } from '@fal-ai/client';

const SCENE_IMAGE_MODEL = 'fal-ai/flux-kontext/dev';

function wantsStylization(description) {
  return /\b(anime|animated|animation|cartoon|pixar|claymation|stop[ -]?motion|cel[ -]?shaded|illustration|comic[ -]?book|3d[ -]?render|cgi|video[ -]?game|stylized|non[ -]?photorealistic)\b/i.test(description);
}

function normalizeFormat(format) {
  return format === 'landscape' ? 'landscape' : 'portrait';
}

export async function prepareSceneImage({
  referenceImageUrl,
  sceneDescription,
  format = 'portrait'
}) {
  if (typeof referenceImageUrl !== 'string' ||
      !/^https:\/\//i.test(referenceImageUrl)) {
    throw new Error('A valid HTTPS character reference image is required.');
  }

  if (typeof sceneDescription !== 'string' || !sceneDescription.trim()) {
    throw new Error('Scene description is missing.');
  }

  const style = wantsStylization(sceneDescription)
    ? [
        'ART DIRECTION: Follow the explicitly requested visual style.',
        'Preserve a coherent environment, believable spatial relationships,',
        'consistent character design, expressive lighting and cinematic framing.'
      ]
    : [
        'ART DIRECTION: Photographic, live-action cinema; not animation or CGI.',
        'The result must resemble a real frame photographed on location',
        'with a professional cinema camera.',
        'Render naturally detailed surfaces: authentic skin and hair,',
        'fabric texture, vegetation, stone, wood, glass and architecture.',
        'For beaches or oceans, use physically plausible water reflections,',
        'translucency, wave patterns, foam, wet sand and atmospheric haze.',
        'For cities or interiors, use realistic materials, perspective,',
        'practical lighting, shadow falloff and convincing depth.',
        'Use consistent light direction, natural contrast, realistic color',
        'and photographic depth of field without excessive blur.',
        'Avoid plastic skin, painterly scenery, artificial gradients,',
        'toy-like buildings, fantasy textures, obvious compositing',
        'and unnaturally smooth surfaces.'
      ];

  const composition = normalizeFormat(format) === 'landscape'
    ? 'Compose as a horizontal widescreen cinematic frame.'
    : 'Compose as a vertical cinematic frame for mobile viewing.';

  const prompt = [
    'Transform the provided reference photograph into ONE coherent',
    'scene-specific opening frame for a professional music video.',
    'Keep the same recognizable person from the reference photograph.',
    'Preserve facial structure, skin tone, hairstyle, hair length,',
    'natural proportions and distinguishing visual features.',
    'Keep the person anatomically plausible and naturally integrated',
    'into the scene, with matching perspective, contact shadows,',
    'environmental light and realistic scale.',
    'SCENE DIRECTION:',
    sceneDescription.trim(),
    ...style,
    'Replace the original background to match the requested location.',
    'Remove microphones, stands, stage equipment and unrelated objects',
    'unless the customer specifically requests them.',
    'Respect requested clothing, setting, action and time of day.',
    'Do not invent a conflicting location or add unrelated props.',
    'Create one clean, fully composed image with no split screen,',
    'collage, duplicate character, text, watermark or transition overlay.',
    composition
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

  const imageUrl = result?.data?.images?.[0]?.url ||
    result?.images?.[0]?.url;

  if (typeof imageUrl !== 'string' || !/^https:\/\//i.test(imageUrl)) {
    throw new Error('Scene Preparation Engine returned no valid image URL.');
  }

  return { imageUrl, model: SCENE_IMAGE_MODEL };
}
