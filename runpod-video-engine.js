
import { promises as fs } from 'node:fs';
import path from 'node:path';

const MAX_SECONDS = 360;
const MAX_CLIP_SECONDS = 15;

const SUPPORTED_FORMATS = new Set([
  'vertical',
  'landscape'
]);

function getConfiguration() {
  const endpoint = (
    process.env.ZALA_GPU_ENDPOINT || ''
  ).trim();

  const apiKey = (
    process.env.ZALA_GPU_API_KEY || ''
  ).trim();

  if (!endpoint || !apiKey) {
    throw new Error(
      'Zala GPU engine is not configured yet.'
    );
  }

  const url = new URL(endpoint);

  if (url.protocol !== 'https:') {
    throw new Error(
      'GPU endpoint must use HTTPS.'
    );
  }

  return { endpoint: url.toString(), apiKey };
}

function validateInput(options) {
  const seconds = Number(options.seconds ?? 5);

  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    seconds > MAX_SECONDS
  ) {
    throw new Error(
      'Video duration must be between 0 and 360 seconds.'
    );
  }

  if (seconds > MAX_CLIP_SECONDS) {
    throw new Error(
      'This engine currently accepts clips up to 15 seconds. ' +
      'Full-length videos will require multiple clips.'
    );
  }

  if (
    !SUPPORTED_FORMATS.has(
      options.format || 'vertical'
    )
  ) {
    throw new Error('Unsupported video format.');
  }

  if (
    typeof options.prompt !== 'string' ||
    !options.prompt.trim()
  ) {
    throw new Error(
      'A video-generation prompt is required.'
    );
  }

  if (!options.outputPath) {
    throw new Error('Output path is required.');
  }

  return seconds;
}

export function getRunPodEngineStatus() {
  return {
    engine: 'Zala GPU Video Engine v1',
    configured: Boolean(
      process.env.ZALA_GPU_ENDPOINT &&
      process.env.ZALA_GPU_API_KEY
    ),
    maxClipSeconds: MAX_CLIP_SECONDS,
    supportsFullLengthAssembly: false,
    message:
      'GPU generation requires a compatible ' +
      'video-generation service.'
  };
}

export async function createRunPodVideo(options) {
  const seconds = validateInput(options);
  const { endpoint, apiKey } = getConfiguration();

  const format = options.format || 'vertical';
  const outputPath = path.resolve(
    options.outputPath
  );

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    10 * 60 * 1000
  );

  try {
    const response = await fetch(
      new URL('/generate', endpoint),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: options.prompt.trim(),
          seconds,
          format,
          imageUrl: options.imageUrl || null
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(
        `GPU service returned HTTP ${response.status}.`
      );
    }

    const contentType = (
      response.headers.get('content-type') || ''
    ).toLowerCase();

    if (!contentType.includes('video/mp4')) {
      throw new Error(
        'GPU service did not return an MP4 video. ' +
        'The service must implement the agreed API.'
      );
    }

    const videoBytes = Buffer.from(
      await response.arrayBuffer()
    );

    if (!videoBytes.length) {
      throw new Error(
        'GPU service returned an empty video.'
      );
    }

    await fs.mkdir(
      path.dirname(outputPath),
      { recursive: true }
    );

    const temporaryPath =
      outputPath + '.partial.mp4';

    try {
      await fs.writeFile(
        temporaryPath,
        videoBytes
      );

      await fs.rename(
        temporaryPath,
        outputPath
      );
    } catch (error) {
      await fs.rm(
        temporaryPath,
        { force: true }
      ).catch(() => {});

      throw error;
    }

    return {
      ok: true,
      engine: 'Zala GPU Video Engine v1',
      outputPath,
      seconds,
      format,
      bytes: videoBytes.length
    };
  } finally {
    clearTimeout(timeout);
  }
}
