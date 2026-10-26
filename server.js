




import express from 'express';
import multer from 'multer';
import { fal } from '@fal-ai/client';

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = 'bytedance/seedance-2.5/us/image-to-video';

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024
  }
});

app.use(express.static('public'));

app.post(
  '/api/create',
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'photo', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      if (!process.env.FAL_KEY) {
        return res.status(400).json({
          error: 'FAL_KEY is missing in Render environment settings.'
        });
      }

      const photo = req.files?.photo?.[0];

      if (!photo) {
        return res.status(400).json({
          error: 'Please upload a photo first.'
        });
      }

      if (!photo.mimetype.startsWith('image/')) {
        return res.status(400).json({
          error: 'Please upload a valid image.'
        });
      }

      const title = String(
        req.body.title || 'Untitled Song'
      ).slice(0, 120);

      const concept = String(
        req.body.prompt || ''
      ).trim();

      if (!concept) {
        return res.status(400).json({
          error: 'Please enter a video prompt.'
        });
      }

      const imageUrl =
        `data:${photo.mimetype};base64,` +
        photo.buffer.toString('base64');

      const format =
        req.body.format === 'landscape'
          ? 'landscape'
          : 'vertical';

      const prompt =
        `Create a cinematic music video shot for the song "${title}". ` +
        `${concept}. Animate the uploaded photo naturally, preserving ` +
        `the person's recognizable appearance. Use believable movement, ` +
        `polished cinematic lighting and smooth camera motion. ` +
        `No captions, logos or watermarks. ` +
        `Composition: ${format === 'vertical'
          ? 'portrait, suitable for TikTok and Reels'
          : 'widescreen, suitable for YouTube'}.`;

      const result = await fal.subscribe(MODEL, {
        input: {
          image_url: imageUrl,
          prompt,
          duration: '4',
          resolution: '480p',
          aspect_ratio: 'auto',
          generate_audio: false
        },
        logs: false
      });

      const videoUrl =
        result?.data?.video?.url ||
        result?.video?.url;

      if (!videoUrl) {
        throw new Error(
          'FAL did not return a video URL.'
        );
      }

      res.json({
        ok: true,
        url: videoUrl,
        message: 'Photo animation test completed.'
      });
    } catch (error) {
      console.error('Video generation error:', error);

      res.status(500).json({
        error: error.message ||
          'Video generation failed.'
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(
    `Music Video Studio running on port ${PORT}`
  );
});











































































































































































































