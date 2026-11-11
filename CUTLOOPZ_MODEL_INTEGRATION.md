# CutLoopz local model worker integration

`cutloopz-local-model-service.mjs` now implements the actual `/health`, `POST /jobs`, `GET /jobs/:id`, and `GET /jobs/:id/video` API expected by `cutloopz-local-generator-adapter.mjs`. It accepts real audio/photo uploads, queues a five-second job, invokes a local model executable, validates the returned MP4 and serves it for the existing production assembler.

## Required local model executable (NOT included)

Set `CUTLOOPZ_MODEL_RUNNER` to the absolute path of an installed executable. It receives `--song FILE --photo FILE --start SECONDS --seconds 5 --output FILE` and MUST create a genuine MP4 at the output path. It must use the audio as an input to singing-performance generation, not merely add it afterward, to meet the product goal. The existing Wan `/generate` endpoint does NOT implement this contract; do not point this worker at it without an adapted, verified model runner.

Run worker and main site on the same machine/network namespace. Set `CUTLOOPZ_MODEL_ENABLED=true`, `CUTLOOPZ_MODEL_ID=<installed-model-name>`, `CUTLOOPZ_LOCAL_GENERATOR_URL=http://127.0.0.1:8765/`, `CUTLOOPZ_LOCAL_GENERATION_ENABLED=true`. Keep flags off until the executable, GPU drivers, model weights, and output have been verified. Worker listens only on loopback. No external provider fallback.

## Honest readiness status

The worker API is now implemented, but **no trained model weights, GPU, singing model, or real 30-second generation are included or verified**. The current environment cannot produce a genuine singing performance. Do not enable paid production or deploy as a finished video engine.

## 2026-11-10: administrator-controlled full-job local automation (added)

- The administrator page offers **Run entire local job automatically** after a local job is created. It defaults to locked until `CUTLOOPZ_LOCAL_GENERATION_ENABLED=true`, `CUTLOOPZ_LOCAL_AUTORUN_ENABLED=true`, and the model worker reports a loaded runner. The administrator must also supply the private key and confirm the full job.
- `POST /api/cutloopz-production/local/jobs/:id/auto-run` runs existing sequential five-second clips and assembles on completion. `GET /api/cutloopz-production/local/jobs/:id/automation` exposes private progress. Manual advance/assembly endpoints reject requests while that job is running automatically.
- No paid-provider fallback, no silent retries on uncertain submissions, and **no auto-restart** after service restart. Persisted clip state supports operator investigation and explicit resume. Restarted or uncertain submissions must never be blindly repeated.
- Source file staging preserves real MP3/WAV and JPEG/PNG/WebP extensions. The model runner command includes `--format vertical|landscape` in addition to the previous parameters. A compatible, installed executable remains REQUIRED; old runners without `--format` support must be adapted before enabling these flags.
- `format=vertical` is supported by the local job API and produces a 360×640 portrait final assembly; `format=landscape` produces 640×360. This is a technical canvas fix, not a claim that the underlying model creates appropriately framed footage or accurate singing.
- The current generator transport accepts **only HTTP loopback on the same network namespace**. A separate RunPod host is NOT automatically reachable from Render via `127.0.0.1`; an authenticated, narrowly scoped private connection would need explicit setup and verification. Do not expose an unauthenticated GPU worker publicly or silently change this security rule.
- The worker's `modelLoaded` signal reports configured local runner availability; it does NOT verify trained model weights, singing quality, or GPU capacity. Do not turn on generation merely because `/health` reports success.
- Offline verification now includes a full **synthetic 30-second HTTP adapter → six clips → download → portrait FFmpeg assembly → original audio → private assembly receipt** test. This test uses synthetic color clips and a sine-wave track, not the user's song or an actual singing-capable model.
- **Not customer-ready:** customer Studio remains a preview-only experience. Owner-only automated testing is not customer paid-order automation. Real inference, GPU access, persistence across deployments, and payment-to-production remain unverified.
