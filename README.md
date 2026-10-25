# One-Click Music Video Studio (starter app)

This is a runnable web-app starter for turning a full uploaded song into one assembled MP4. It generates multiple video segments through fal.ai, normalizes/concatenates them with FFmpeg, then replaces the segments' audio with the original uploaded track. It offers vertical 9:16 and landscape 16:9 output.

## Requirements
- Node.js 20+
- FFmpeg and ffprobe installed on the server
- A fal.ai API key and billing enabled
- Verify that `bytedance/seedance-2.5/text-to-video` is available to your fal account and confirm its current request schema/pricing before production.

## Run locally
1. Extract this project.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set `FAL_KEY` to your private key. Never put the key in browser code or share it publicly.
4. Install FFmpeg so `ffmpeg` and `ffprobe` are available on PATH.
5. Run `npm start`.
6. Open `http://localhost:3000`.

## Important limitations
- The API model name/schema can change; verify it against current fal.ai docs and adjust `FAL_MODEL` and request inputs as needed.
- Each scene is generated separately. Character continuity depends on the model and prompts; this starter does not yet use persistent character reference images.
- API generation is paid and cost depends on track length and selected model. Review pricing before running a full song.
- Production deployment should add authentication, rate limiting, job queue/status persistence, storage cleanup, retries, cancellation, cost caps, and per-user billing controls.
- The starter expects FFmpeg/ffprobe installed on the server and is not a one-click hosted deployment by itself.
