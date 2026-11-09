# CutLoopz local model worker integration

`cutloopz-local-model-service.mjs` now implements the actual `/health`, `POST /jobs`, `GET /jobs/:id`, and `GET /jobs/:id/video` API expected by `cutloopz-local-generator-adapter.mjs`. It accepts real audio/photo uploads, queues a five-second job, invokes a local model executable, validates the returned MP4 and serves it for the existing production assembler.

## Required local model executable (NOT included)

Set `CUTLOOPZ_MODEL_RUNNER` to the absolute path of an installed executable. It receives `--song FILE --photo FILE --start SECONDS --seconds 5 --output FILE` and MUST create a genuine MP4 at the output path. It must use the audio as an input to singing-performance generation, not merely add it afterward, to meet the product goal. The existing Wan `/generate` endpoint does NOT implement this contract; do not point this worker at it without an adapted, verified model runner.

Run worker and main site on the same machine/network namespace. Set `CUTLOOPZ_MODEL_ENABLED=true`, `CUTLOOPZ_MODEL_ID=<installed-model-name>`, `CUTLOOPZ_LOCAL_GENERATOR_URL=http://127.0.0.1:8765/`, `CUTLOOPZ_LOCAL_GENERATION_ENABLED=true`. Keep flags off until the executable, GPU drivers, model weights, and output have been verified. Worker listens only on loopback. No external provider fallback.

## Honest readiness status

The worker API is now implemented, but **no trained model weights, GPU, singing model, or real 30-second generation are included or verified**. The current environment cannot produce a genuine singing performance. Do not enable paid production or deploy as a finished video engine.
