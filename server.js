






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
const MODEL = 'bytedance/seedance-2.5/us/image-to-video';
const OUT = path.resolve('outputs');

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
    let errorText = '';

    child.stderr.on('data', data => {
      errorText += data.toString();
    });

    child.on('error', reject);

    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(
          errorText.slice(-2000) || `${command} failed`
        ));
      }
    });
  });
}

async function downloadFile(url, destination) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Could not download the generated video.');
  }

  await fs.writeFile(
    destination,
    Buffer.from(await response.arrayBuffer())
  );
}

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
        throw new Error('Please upload both your song and a photo.');
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

      const format =
        req.body.format === 'landscape' ? 'landscape' : 'vertical';

      const audioPath = path.join(work, 'song');
      const photoPath = path.join(work, 'photo');
      const clipPath = path.join(work, 'scene.mp4');

      await fs.writeFile(audioPath, audio.buffer);
      await fs.writeFile(photoPath, photo.buffer);

      const imageUrl =
        `data:${photo.mimetype};base64,` +
        photo.buffer.toString('base64');

      const prompt =
        `Create a cinematic music video scene for "${title}". ` +
        `${concept}. Animate the uploaded image naturally. ` +
        `Preserve the singer's appearance and facial features. ` +
        `Use smooth camera movement, believable motion, and ` +
        `professional music-video lighting. No captions, logos, ` +
        `or watermarks. Compose for ${format === 'vertical' ? '9:16 vertical video' : '16:9 widescreen video'}.`;

      const result = await fal.subscribe(MODEL, {
        input: {
          image_url: imageUrl,
          prompt,
          duration: '4',
          resolution: '480p',
          aspect_ratio: format === 'vertical' ? '9:16' : '16:9',
          generate_audio: false
        },
        logs: false
      });

      const videoUrl =
        result?.data?.video?.url || result?.video?.url;

      if (!videoUrl) {
        throw new Error('The video service returned no video.');
      }

      await downloadFile(videoUrl, clipPath);

      const outputName = `${id}.mp4`;
      const outputPath = path.join(OUT, outputName);

      // Repeat the generated scene and stop when the song ends.
      // The app produces one finished MP4 automatically.
      await run('ffmpeg', [
        '-y',
        '-stream_loop', '-1',
        '-i', clipPath,
        '-i', audioPath,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
        outputPath
      ]);

      res.json({
        ok: true,
        url: `/outputs/${outputName}`,
        message: 'Your full-song video is ready.'
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
  console.log(`Zala Music Video Studio running on port ${PORT}`);
});









































































































































































































