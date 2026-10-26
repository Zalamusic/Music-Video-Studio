
import express from 'express';
import multer from 'multer';
import { fal } from '@fal-ai/client';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const app = express();
const PORT = process.env.PORT || 3000;
const OUT = path.resolve('outputs');
const MODEL = 'minimax/h3-max-turbo/image-to-video';
const MAX_SONG_SECONDS = 360;
const SCENE_SECONDS = 15;

await fs.mkdir(OUT, { recursive: true });

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }
});

app.use(express.static('public'));
app.use('/outputs', express.static(OUT));

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let errors = '';

    child.stderr.on('data', data => {
      errors += data.toString();
    });

    child.on('error', reject);

    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(
        errors.slice(-2000) || `${command} failed`
      ));
    });
  });
}

function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('error', reject);

    child.on('close', code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.slice(-1000)));
    });
  });
}

async function getDuration(file) {
  const result = await capture('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file
  ]);

  const duration = Number(result);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Could not read the song duration.');
  }

  return duration;
}

async function downloadFile(url, destination) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Could not download the generated scene.');
  }

  await fs.writeFile(
    destination,
    Buffer.from(await response.arrayBuffer())
  );
}

const sceneIdeas = [
  'Performance close-up, looking into the camera with expressive singing-style mouth movement and dramatic studio lighting.',
  'Wide performance shot on a concert stage with moving spotlights and a slow camera push-in.',
  'Cinematic nighttime city scene with the artist walking beneath colorful lights.',
  'Emotional performance shot in a luxurious dark studio, with a slow side-to-side camera move.',
  'Romantic story scene beside a rain-covered window, with thoughtful expressions and gentle movement.',
  'Full-body performance shot in a stylish modern interior, with elegant camera movement.',
  'Nighttime rooftop scene with a city skyline and wind moving naturally through the scene.',
  'Intimate performance shot with warm lighting, expressive eyes and subtle camera movement.',
  'Cinematic driving scene at night, with reflections of city lights across the windows.',
  'Dramatic story scene in a beautiful hallway, with the artist walking toward the camera.',
  'Stage performance from a different camera angle, with a changing light pattern and confident movement.',
  'Emotional outdoor scene at sunset, with a slow tracking shot and a reflective mood.'
];

app.post(
  '/api/create',
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'photo', maxCount: 1 }
  ]),
  async (req, res) => {
    const id = randomUUID();
    const work = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zala-video-')
    );

    try {
      if (!process.env.FAL_KEY) {
        throw new Error('FAL_KEY is missing in Render settings.');
      }

      const audio = req.files?.audio?.[0];
      const photo = req.files?.photo?.[0];

      if (!audio || !photo) {
        throw new Error('Please upload your song and a photo.');
      }

      if (!photo.mimetype.startsWith('image/')) {
        throw new Error('Please upload a valid image.');
      }

      const title = String(
        req.body.title || 'Untitled Song'
      ).slice(0, 120);

      const concept = String(req.body.prompt || '').trim();

      if (!concept) {
        throw new Error('Please describe your music video.');
      }

      const audioPath = path.join(work, 'song');
      const photoPath = path.join(work, 'reference');
      const listPath = path.join(work, 'scenes.txt');
      const finalPath = path.join(OUT, `${id}.mp4`);

      await fs.writeFile(audioPath, audio.buffer);
      await fs.writeFile(photoPath, photo.buffer);

      const audioDuration = await getDuration(audioPath);

      if (audioDuration > MAX_SONG_SECONDS) {
        throw new Error(
          'For this version, songs must be 6 minutes or shorter.'
        );
      }

      const imageUrl =
        `data:${photo.mimetype};base64,` +
        photo.buffer.toString('base64');

      const format =
        req.body.format === 'landscape' ? 'landscape' : 'vertical';

      const width = format === 'landscape' ? 1280 : 720;
      const height = format === 'landscape' ? 720 : 1280;

      const clips = [];
      let totalDuration = 0;
      let sceneNumber = 0;

      // Generate fresh clips until there is enough unique footage.
      while (totalDuration < audioDuration) {
        sceneNumber++;

        if (sceneNumber > 25) {
          throw new Error(
            'Scene limit reached. Please use a shorter song.'
          );
        }

        const idea = sceneIdeas[
          (sceneNumber - 1) % sceneIdeas.length
        ];

        const prompt =
          `Music video for "${title}". Scene ${sceneNumber}. ` +
          `Creative direction: ${concept}. ` +
          `${idea} ` +
          `Preserve the uploaded person's recognizable identity, ` +
          `face and hairstyle. Create a visually distinct new shot. ` +
          `Use natural movement, cinematic composition and professional ` +
          `lighting. No text, captions, logos or watermarks. ` +
          `Do not add music or dialogue.`;

        console.log(
          `Generating unique scene ${sceneNumber} for ${title}`
        );

        const result = await fal.subscribe(MODEL, {
          input: {
            prompt,
            image_url: imageUrl,
            duration: SCENE_SECONDS,
            resolution: '480P',
            prompt_expansion_mode: 'disabled'
          },
          logs: false
        });

        const videoUrl =
          result?.data?.video?.url ||
          result?.video?.url;

        if (!videoUrl) {
          throw new Error(
            `The service returned no video for scene ${sceneNumber}.`
          );
        }

        const rawPath = path.join(
          work, `raw-${sceneNumber}.mp4`
        );

        const clipPath = path.join(
          work, `scene-${sceneNumber}.mp4`
        );

        await downloadFile(videoUrl, rawPath);

        // Normalize each clip so all scenes can be joined.
        const filter =
          `scale=${width}:${height}:` +
          'force_original_aspect_ratio=increase,' +
          `crop=${width}:${height},setsar=1,fps=24`;

        await run('ffmpeg', [
          '-y',
          '-i', rawPath,
          '-vf', filter,
          '-an',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          clipPath
        ]);

        const clipDuration = await getDuration(clipPath);

        if (clipDuration < 2) {
          throw new Error(
            `Generated scene ${sceneNumber} was too short.`
          );
        }

        clips.push(clipPath);
        totalDuration += clipDuration;

        console.log(
          `Scene ${sceneNumber} complete. ` +
          `${clips.length} unique scenes generated.`
        );
      }

      // Build the ordered list of unique clips. No scene looping.
      const listContent = clips.map(file =>
        `file '${file.replace(/'/g, "'\\''")}'`
      ).join('\n') + '\n';

      await fs.writeFile(listPath, listContent);

      const joinedPath = path.join(work, 'joined.mp4');

      await run('ffmpeg', [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-c', 'copy',
        joinedPath
      ]);

      // Keep the original song and trim the video to its duration.
      await run('ffmpeg', [
        '-y',
        '-i', joinedPath,
        '-i', audioPath,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-t', String(audioDuration),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        '-shortest',
        finalPath
      ]);

      res.json({
        ok: true,
        url: `/outputs/${id}.mp4`,
        message:
          `Your video is ready with ${clips.length} unique scenes.`
      });
    } catch (error) {
      console.error('Video generation error:', error);

      res.status(500).json({
        error: error.message || 'Video creation failed.'
      });
    } finally {
      await fs.rm(work, {
        recursive: true,
        force: true
      }).catch(() => {});
    }
  }
);

app.listen(PORT, () => {
  console.log(`Zala QI's World running on port ${PORT}`);
});









































































































































































































