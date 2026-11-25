import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHybridVideo } from './hybrid-video-engine.js';

const exec = promisify(execFile);

export const MODEL =
  'fal-ai/minimax-h3-turbo/reference-to-video';

const FPS = 24;

export function validateShots(shots) {
  if (
    !Array.isArray(shots) ||
    ![1, 8].includes(shots.length) ||
    shots.some(s =>
      !s ||
      ![7, 8].includes(s.duration) ||
      typeof s.prompt !== 'string' ||
      s.prompt.trim().length < 12 ||
      s.prompt.length > 3000
    )
  ) {
    throw Error('Invalid shot configuration');
  }

  const total = shots.reduce(
    (n, s) => n + s.duration, 0
  );

  if (
    (shots.length === 1 && total !== 7) ||
    (shots.length === 8 && total !== 60)
  ) {
    throw Error('Expected 7 or 60 seconds');
  }

  return shots;
}

export function shotInput(
  shot,
  reference,
  previous,
  audioUrl
) {
  return {
    prompt: shot.prompt,
    reference_image_urls: [reference],
    ...(previous
      ? { reference_video_urls: [previous] }
      : {}),
    ...(audioUrl
      ? { target_audio_url: audioUrl }
      : {}),
    prompt_expansion_mode: 'quality',
    duration: shot.duration,
    aspect_ratio: '9:16',
    resolution: '768P'
  };
}

async function probe(file) {
  const { stdout } = await exec('ffprobe', [
    '-v', 'error',
    '-show_streams',
    '-show_format',
    '-of', 'json',
    file
  ]);

  return JSON.parse(stdout);
}

async function prepareAudio(
  song,
  output,
  start,
  duration
) {
  await exec('ffmpeg', [
    '-y',
    '-v', 'error',
    '-i', song,
    '-ss', String(start),
    '-t', String(duration),
    '-vn',
    '-ar', '32000',
    '-ac', '2',
    '-c:a', 'pcm_s16le',
    output
  ]);

  const info = await probe(output);

  if (
    !info.streams.some(
      s => s.codec_type === 'audio'
    ) ||
    Math.abs(
      Number(info.format.duration) - duration
    ) > 0.1
  ) {
    throw Error('Audio segment validation failed');
  }

  return output;
}

async function normalizeClip(
  source,
  output,
  duration
) {
  const info = await probe(source);

  const video = info.streams.find(
    s => s.codec_type === 'video'
  );

  if (!video) {
    throw Error('Provider returned no video');
  }

  const actual = Number(
    video.duration || info.format.duration
  );

  if (
    !Number.isFinite(actual) ||
    actual < duration - 0.1 ||
    actual > duration + 1
  ) {
    throw Error(
      `Unexpected provider duration: ${actual}`
    );
  }

  const frames = Math.round(duration * FPS);

  await exec('ffmpeg', [
    '-y',
    '-v', 'error',
    '-i', source,
    '-map', '0:v:0',
    '-an',
    '-vf',
    `fps=${FPS},tpad=stop_mode=clone:stop_duration=0.15`,
    '-frames:v', String(frames),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    output
  ]);

  const checked = await probe(output);

  if (
    !checked.streams.some(
      s => s.codec_type === 'video'
    ) ||
    Math.abs(
      Number(checked.format.duration) - duration
    ) > 0.05
  ) {
    throw Error('Normalized clip validation failed');
  }

  return output;
}

export function registerCinematicRecovery({
  app,
  isVideoAdmin,
  outputDirectory,
  fal,
  upload
}) {
  const jobs = new Map();

  const root = path.resolve(
    outputDirectory,
    'cinematic-recovery'
  );

  let activeJob = null;

  const enabled = () =>
    process.env.CUTLOOPZ_CINEMATIC_RECOVERY_ENABLED === 'true' &&
    !!process.env.FAL_KEY;

  const auth = (req, res, next) =>
    isVideoAdmin(req)
      ? next()
      : res.status(403).json({
          error: 'Administrator required'
        });

  const validId = id =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  async function saveState(folder, state) {
    const temporary = path.join(
      folder,
      'state.tmp'
    );

    await fs.writeFile(
      temporary,
      JSON.stringify(state, null, 2)
    );

    await fs.rename(
      temporary,
      path.join(folder, 'state.json')
    );
  }

  app.get(
    '/api/cinematic-recovery/preflight',
    auth,
    (_req, res) => res.json({
      version: 'recovery-v3',
      model: MODEL,
      enabled: enabled(),
      availableDurations: [7, 60],
      openingTestSeconds: 7,
      fullMinuteEnabled: true,
      precisionDirector: false,
      targetAudioSupported: true,
      audioDrivenLipSyncVerified: false,
      frameRate: FPS,
      activeJob
    })
  );

  app.post(
    '/api/cinematic-recovery/render',
    auth,
    upload.fields([
      { name: 'photo', maxCount: 1 },
      { name: 'audio', maxCount: 1 }
    ]),
    async (req, res) => {
      if (!enabled()) {
        return res.status(503).json({
          error: 'Recovery rendering disabled'
        });
      }

      if (activeJob) {
        return res.status(409).json({
          error: 'Another recovery job is active',
          id: activeJob
        });
      }

      let folder;
      let id;
      let accepted = false;

      try {
        const shots = validateShots(
          JSON.parse(req.body.shots)
        );

        const totalSeconds = shots.reduce(
          (n, s) => n + s.duration,
          0
        );

        const confirmation =
          totalSeconds === 7
            ? 'APPROVE_7_SECONDS_FAL_COST'
            : 'APPROVE_60_SECONDS_FAL_COST';

        if (req.body.confirm !== confirmation) {
          throw Error(
            'Explicit paid-render approval required'
          );
        }

        const photo = req.files?.photo?.[0];
        const audio = req.files?.audio?.[0];

        if (
          !photo ||
          !audio ||
          !['image/png', 'image/jpeg', 'image/webp']
            .includes(photo.mimetype)
        ) {
          throw Error(
            'Original audio and approved identity image required'
          );
        }

        id = randomUUID();
        activeJob = id;

        folder = path.join(root, id);

        await fs.mkdir(folder, {
          recursive: true,
          mode: 0o700
        });

        const song = path.join(folder, 'song');

        await fs.writeFile(song, audio.buffer);

        const info = await probe(song);

        const audioDuration = Number(
          info.format.duration
        );

        if (
          !info.streams.some(
            s => s.codec_type === 'audio'
          ) ||
          !Number.isFinite(audioDuration) ||
          audioDuration < totalSeconds
        ) {
          throw Error(
            `Original audio must contain at least ${totalSeconds} seconds`
          );
        }

        const state = {
          id,
          status: 'running',
          model: MODEL,
          seconds: totalSeconds,
          finished: 0,
          totalShots: shots.length,
          precisionDirector: false,
          lipSyncVerified: false,
          createdAt: new Date().toISOString()
        };

        await saveState(folder, state);

        await fs.writeFile(
          path.join(folder, 'shot-plan.json'),
          JSON.stringify(shots, null, 2)
        );

        jobs.set(id, state);

        res.status(202).json(state);
        accepted = true;

        void (async () => {
          try {
            const reference =
              await fal.storage.upload(
                new Blob([photo.buffer], {
                  type: photo.mimetype
                })
              );

            let previous;
            let offset = 0;

            const clips = [];

            for (
              const [i, shot] of shots.entries()
            ) {
              const audioFile = path.join(
                folder,
                `audio-${i + 1}.wav`
              );

              await prepareAudio(
                song,
                audioFile,
                offset,
                shot.duration
              );

              const audioUrl =
                await fal.storage.upload(
                  new Blob(
                    [await fs.readFile(audioFile)],
                    { type: 'audio/wav' }
                  )
                );

              const input = shotInput(
                shot,
                reference,
                previous,
                audioUrl
              );

              state.currentShot = i + 1;

              await saveState(folder, state);

              const result = await fal.subscribe(
                MODEL,
                { input }
              );

              previous = result.data?.video?.url;

              if (
                typeof previous !== 'string' ||
                !previous.startsWith('https://')
              ) {
                throw Error(
                  'Missing provider video'
                );
              }

              const response = await fetch(
                previous,
                {
                  signal:
                    AbortSignal.timeout(120000)
                }
              );

              if (!response.ok) {
                throw Error(
                  'Clip download failed'
                );
              }

              const raw = path.join(
                folder,
                `raw-${i + 1}.mp4`
              );

              await fs.writeFile(
                raw,
                Buffer.from(
                  await response.arrayBuffer()
                )
              );

              const normalized = path.join(
                folder,
                `shot-${i + 1}.mp4`
              );

              await normalizeClip(
                raw,
                normalized,
                shot.duration
              );

              clips.push(normalized);

              offset += shot.duration;

              state.finished = clips.length;
              state.renderedSeconds = offset;

              await saveState(folder, state);
            }

            const outputFile = path.join(
              folder,
              'final.mp4'
            );

            await createHybridVideo({
              clips,
              songFile: song,
              outputFile,
              format: 'vertical',
              songSeconds: totalSeconds,
              workDirectory: folder
            });

            const final = await probe(outputFile);

            if (
              !Number.isFinite(
                Number(final.format.duration)
              ) ||
              Math.abs(
                Number(final.format.duration) -
                totalSeconds
              ) > 0.25 ||
              !final.streams.some(
                s => s.codec_type === 'audio'
              ) ||
              !final.streams.some(
                s => s.codec_type === 'video'
              )
            ) {
              throw Error(
                'Final media validation failed'
              );
            }

            state.status = 'review_required';

            state.note =
              'Technical checks passed. Review identity, anatomy, realism, movement, scene continuity and lip sync before approval.';

          } catch (e) {
            state.status = 'failed';

            state.error = String(
              e.message || e
            ).slice(0, 300);

          } finally {
            state.completedAt =
              new Date().toISOString();

            await saveState(
              folder,
              state
            ).catch(() => {});

            activeJob = null;
          }
        })();

      } catch (e) {
        if (activeJob === id) {
          activeJob = null;
        }

        if (folder && !accepted) {
          await fs.rm(folder, {
            recursive: true,
            force: true
          }).catch(() => {});
        }

        if (!res.headersSent) {
          return res.status(400).json({
            error: String(
              e.message || e
            ).slice(0, 300)
          });
        }
      }
    }
  );

  app.get(
    '/api/cinematic-recovery/jobs/:id',
    auth,
    async (req, res) => {
      if (!validId(req.params.id)) {
        return res.sendStatus(404);
      }

      try {
        const state =
          jobs.get(req.params.id) ||
          JSON.parse(
            await fs.readFile(
              path.join(
                root,
                req.params.id,
                'state.json'
              ),
              'utf8'
            )
          );

        res.json(state);

      } catch {
        res.sendStatus(404);
      }
    }
  );

  app.get(
    '/api/cinematic-recovery/jobs/:id/video',
    auth,
    async (req, res) => {
      if (!validId(req.params.id)) {
        return res.sendStatus(404);
      }

      try {
        const dir = path.join(
          root,
          req.params.id
        );

        const state = JSON.parse(
          await fs.readFile(
            path.join(dir, 'state.json'),
            'utf8'
          )
        );

        if (
          state.status !== 'review_required'
        ) {
          return res.sendStatus(409);
        }

        res.sendFile(
          path.join(dir, 'final.mp4')
        );

      } catch {
        res.sendStatus(404);
      }
    }
  );
}
