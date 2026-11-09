# CutLoopz consolidated administrator site integration

## Implemented
- Added an independent-production panel directly to `public/admin-unified-production.html`.
- Connected administrator controls to the existing `/api/cutloopz-production/local/*` backend routes.
- Added local model readiness, job creation, progress refresh, explicit per-clip approval, assembly and private playback.
- Duration selector supports 15–360 seconds in five-second increments, default 30 seconds.
- Local generation remains disabled until a real model service is configured and reports loaded; no external fallback.
- Existing paid-provider controls remain separate and unchanged.

## Not yet finished / cannot claim verified
- A real GPU-hosted singing-capable video model is not bundled with this repository.
- `cutloopz-local-model-service.mjs` requires `CUTLOOPZ_MODEL_RUNNER` pointing to an installed executable and `CUTLOOPZ_MODEL_ENABLED=true`.
- Production server requires `CUTLOOPZ_LOCAL_GENERATOR_URL=http://127.0.0.1:8765` and `CUTLOOPZ_LOCAL_GENERATION_ENABLED=true` (only after a real model is installed).
- No live end-to-end 30-second video generation or singing/body realism test was performed.
- No deployment or cloud charges were initiated.

## Verification
- Existing local generator adapter, media format, MP4 validation and upload limit tests pass.
- HTML controls and API routes were inspected for matching names.
