
import { promises as fs } from 'node:fs';
import path from 'node:path';

const MAX_CLIP_SECONDS = 5;
const MAX_PROMPT_LENGTH = 2000;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

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

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'GPU endpoint must be a valid HTTPS service URL.'
    );
  }

  return {
    endpoint: url,
    apiKey
  };
}

function validateInput(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('Video options are required.');
  }

  const seconds = Number(options.seconds ?? 5);
  const format = options.format || 'vertical';

  if (
    !Number.isInteger(seconds) ||
    seconds < 1 ||
    seconds > MAX_CLIP_SECONDS
  ) {
    throw new Error(
      'Wan 2.2 testing supports 1–5 second clips.'
    );
  }

  if (!SUPPORTED_FORMATS.has(format)) {
    throw new Error('Unsupported video format.');
  }

  if (
    typeof options.prompt !== 'string' ||
    !options.prompt.trim() ||
    options.prompt.length > MAX_PROMPT_LENGTH
  ) {
    throw new Error(
      'A valid prompt of up to 2000 characters is required.'
    );
  }

  if (
    typeof options.imageUrl !== 'string' ||
    options.imageUrl.length > 4096
  ) {
    throw new Error(
      'An HTTPS artist photo URL is required.'
    );
  }

  const imageUrl = new URL(options.imageUrl);

  if (
    imageUrl.protocol !== 'https:' ||
    imageUrl.username ||
    imageUrl.password ||
    (imageUrl.port && imageUrl.port !== '443')
  ) {
    throw new Error(
      'A standard HTTPS artist photo URL is required.'
    );
  }

  if (
    typeof options.outputPath !== 'string' ||
    !options.outputPath.trim()
  ) {
    throw new Error('Output path is required.');
  }

  return {
    seconds,
    format,
    imageUrl: imageUrl.toString()
  };
}

export function getRunPodEngineStatus() {
  return {
    engine: 'Zala GPU Video Engine v1',
    configured: Boolean(
      process.env.ZALA_GPU_ENDPOINT &&
      process.env.ZALA_GPU_API_KEY
    ),
    maxClipSeconds: MAX_CLIP_SECONDS,
    requiresReferenceImage: true,
    supportsFullLengthAssembly: false,
    message:
      'Wan 2.2 GPU clip generation is in testing. ' +
      'Full-length assembly will be integrated separately.'
  };
}

export async function createRunPodVideo(options) {
  const {
    seconds,
    format,
    imageUrl
  } = validateInput(options);

  const {
    endpoint,
    apiKey
  } = getConfiguration();

  const outputPath = path.resolve(options.outputPath);

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    30 * 60 * 1000 + 60000
  );

  let temporaryPath;

  try {
    const generateUrl = new URL(endpoint);
    generateUrl.pathname =
      generateUrl.pathname.replace(/\/$/, '') +
      '/generate';

    const response = await fetch(generateUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: options.prompt.trim(),
        seconds,
        format,
        imageUrl
      }),
      signal: controller.signal
    });

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
        'GPU service did not return an MP4 video.'
      );
    }

    const declaredLength = Number(
      response.headers.get('content-length')
    );

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_VIDEO_BYTES
    ) {
      throw new Error(
        'Generated video exceeds the size limit.'
      );
    }

    const chunks = [];
    let totalBytes = 0;

    for await (const chunk of response.body) {
      totalBytes += chunk.length;

      if (totalBytes > MAX_VIDEO_BYTES) {
        throw new Error(
          'Generated video exceeds the size limit.'
        );
      }

      chunks.push(chunk);
    }

    if (!totalBytes) {
      throw new Error(
        'GPU service returned an empty video.'
      );
    }

    await fs.mkdir(
      path.dirname(outputPath),
      { recursive: true }
    );

    temporaryPath = outputPath + '.partial.mp4';

    await fs.writeFile(
      temporaryPath,
      Buffer.concat(chunks)
    );

    await fs.rename(
      temporaryPath,
      outputPath
    );

    return {
      ok: true,
      engine: 'Zala GPU Video Engine v1',
      outputPath,
      seconds,
      format,
      bytes: totalBytes
    };
  } finally {
    clearTimeout(timeout);

    if (temporaryPath) {
      await fs.rm(temporaryPath, {
        force: true
      }).catch(() => {});
    }
  }
}
