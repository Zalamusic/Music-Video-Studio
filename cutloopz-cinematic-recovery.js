
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHybridVideo } from './hybrid-video-engine.js';

const exec = promisify(execFile);

export const MODEL =
  'fal-ai/minimax-h3-turbo/reference-to-video';

export function validateShots(shots) {
  if (
    !Array.isArray(shots) ||
    shots.length !== 8 ||
    shots.some(s =>
      !s ||
      ![7, 8].includes(s.duration) ||
      typeof s.prompt !== 'string' ||
      s.prompt.trim().length < 12 ||
      s.prompt.length > 3000
    ) ||
    shots.reduce((n, s) => n + s.duration, 0) !== 60
  ) {
    throw Error(
      'Provide eight approved 7–8 second shots totaling 60 seconds.'
    );
  }
  return shots;
}

export function shotInput(shot, reference, previous) {
  return {
    prompt: shot.prompt,
    reference_image_urls: [reference],
    ...(previous
      ? { reference_video_urls: [previous] }
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

export function registerCinematicRecovery({
  app,
  isVideoAdmin,
  outputDirectory,
  fal,
  upload
}) {
  const jobs = new Map();

  const auth = (req, res, next) =>
    isVideoAdmin(req)
      ? next()
      : res.status(403).json({
          error: 'Administrator required'
        });

  app.get(
    '/api/cinematic-recovery/preflight',
    auth,
    (_req, res) => res.json({
      model: MODEL,
      enabled:
        process.env.CUTLOOPZ_CINEMATIC_RECOVERY_ENABLED === 'true' &&
        !!process.env.FAL_KEY,
      seconds: 60,
      precisionDirector: false,
      audioDrivenLipSync: false
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
      if (
        process.env.CUTLOOPZ_CINEMATIC_RECOVERY_ENABLED !== 'true' ||
        !process.env.FAL_KEY
      ) {
        return res.status(503).json({
          error: 'Recovery rendering disabled'
        });
      }

      if (
        req.body.confirm !== 'APPROVE_60_SECONDS_FAL_COST'
      ) {
        return res.status(400).json({
          error: 'Explicit paid-render approval required'
        });
      }

      let folder;

      try {
        const shots = validateShots(
          JSON.parse(req.body.shots)
        );

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

        const id = randomUUID();

        folder = path.join(
          outputDirectory,
          'cinematic-recovery',
          id
        );

        await fs.mkdir(folder, {
          recursive: true,
          mode: 0o700
        });

        const song = path.join(folder, 'song');

        await fs.writeFile(song, audio.buffer);

        const info = await probe(song);

        if (
          !info.streams.some(
            s => s.codec_type === 'audio'
          ) ||
          Number(info.format.duration) < 60
        ) {
          throw Error(
            'Original audio must contain at least 60 seconds'
          );
        }

        const state = {
          id,
          status: 'running',
          finished: 0
        };

        jobs.set(id, state);

        res.status(202).json(state);

        void (async () => {
          try {
            const reference = await fal.storage.upload(
              new Blob([photo.buffer], {
                type: photo.mimetype
              })
            );

            let previous;
            const clips = [];

            for (const [i, shot] of shots.entries()) {
              const input = shotInput(
                shot,
                reference,
                previous
              );

              const result = await fal.subscribe(
                MODEL,
                { input }
              );

              previous = result.data?.video?.url;

              if (
                !previous ||
                !previous.startsWith('https://')
              ) {
                throw Error('Missing provider video');
              }

              const response = await fetch(previous, {
                signal: AbortSignal.timeout(120000)
              });

              if (!response.ok) {
                throw Error('Clip download failed');
              }

              const file = path.join(
                folder,
                `shot-${i + 1}.mp4`
              );

              await fs.writeFile(
                file,
                Buffer.from(
                  await response.arrayBuffer()
                )
              );

              const p = await probe(file);

              if (
                !p.streams.some(
                  s => s.codec_type === 'video'
                ) ||
                Math.abs(
                  Number(p.format.duration) -
                  shot.duration
                ) > 0.25
              ) {
                throw Error(
                  'Clip duration or video stream failed'
                );
              }

              clips.push(file);

              state.finished = clips.length;

              await fs.writeFile(
                path.join(folder, 'state.json'),
                JSON.stringify(state)
              );
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
              songSeconds: 60,
              workDirectory: folder
            });

            const p = await probe(outputFile);

            if (
              Math.abs(
                Number(p.format.duration) - 60
              ) > 0.25 ||
              !p.streams.some(
                s => s.codec_type === 'audio'
              ) ||
              !p.streams.some(
                s => s.codec_type === 'video'
              )
            ) {
              throw Error(
                'Final media validation failed'
              );
            }

            state.status = 'review_required';

            state.note =
              'Technical checks only; anatomy, continuity and lip sync require review';

          } catch (e) {
            state.status = 'failed';
            state.error = String(e.message).slice(0, 300);
          } finally {
            await fs.writeFile(
              path.join(folder, 'state.json'),
              JSON.stringify(state)
            ).catch(() => {});
          }
        })();

      } catch (e) {
        return res.status(400).json({
          error: String(e.message).slice(0, 300)
        });
      }
    }
  );

  app.get(
    '/api/cinematic-recovery/jobs/:id',
    auth,
    async (req, res) => {
      if (
        !/^[0-9a-f-]{36}$/.test(req.params.id)
      ) {
        return res.sendStatus(404);
      }

      try {
        res.json(
          jobs.get(req.params.id) ||
          JSON.parse(
            await fs.readFile(
              path.join(
                outputDirectory,
                'cinematic-recovery',
                req.params.id,
                'state.json'
              ),
              'utf8'
            )
          )
        );
      } catch {
        res.sendStatus(404);
      }
    }
  );

  app.get(
    '/api/cinematic-recovery/jobs/:id/video',
    auth,
    async (req, res) => {
      if (
        !/^[0-9a-f-]{36}$/.test(req.params.id)
      ) {
        return res.sendStatus(404);
      }

      try {
        const dir = path.join(
          outputDirectory,
          'cinematic-recovery',
          req.params.id
        );

        const s = JSON.parse(
          await fs.readFile(
            path.join(dir, 'state.json'),
            'utf8'
          )
        );

        if (s.status !== 'review_required') {
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
