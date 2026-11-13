# CutLoopz Owner Studio — private production flow (2026-11-13)

## Completed in source

- Page 5 now offers a real Generate My Video action using the same saved MP3/WAV, artist photo, direction, format and scenes from pages 1–4. No separate admin form or per-clip approval.
- Once the local worker confirms its model is loaded, one click queues the job and automatically advances its five-second clips, assembles the original audio and displays a private video player and download link.
- Scene prompts accompany individual clips to the worker; the supplied Wan visual-only runner can read the `CUTLOOPZ_VISUAL_PROMPT` environment variable. This does **not** create lip sync or emotional performance by itself.
- Owner access is granted only to the existing signed-in account whose email matches `CUTLOOPZ_OWNER_EMAIL` (Render environment). The existing X-Video-Admin-Key remains compatible with legacy admin pages.
- `CUTLOOPZ_LOCAL_GENERATION_ENABLED=true` enables the local generation path **after** an actual executable model runner is available; `CUTLOOPZ_LOCAL_AUTORUN_ENABLED` and `confirmLocalFullJob`, `approveLocalGeneration`, `confirmLocalClip` are no longer needed.
- External FAL provider money controls remain restricted and off. There is no automatic provider fallback.
- Source changes were made offline, not deployed to GitHub/Render/RunPod. Requires a reachable authenticated worker at `CUTLOOPZ_LOCAL_GENERATOR_URL`, optional approved HTTPS hostname & bearer token (as documented in the secure GPU bridge), writable persistent `OUTPUT_DIR`, owner email, and a verified installed runnable model.

## Release gates that are deliberately retained

1. Private owner account session (do not publicly expose generation).
2. Real worker/model readiness; a reachable worker alone cannot generate video.
3. Uploaded valid MP3/WAV + photo, rights confirmation, and 15–360 second duration in five-second increments.
4. No automatic retry of uncertain network submissions, preventing surprise duplicate work.

## Not yet proven

- No real GPU generation was invoked by this patch; full singing realism or mouth accuracy has not been independently validated.
- Checkout, payment processing and public customer auto-fulfillment are separate work and are not switched on here.

The worker now detects executable `CUTLOOPZ_MODEL_RUNNER` directly rather than also requiring redundant `CUTLOOPZ_MODEL_ENABLED=true`. A visual-only Wan adapter no longer requires a separate visual-test approval flag, but is still not a singing-performance model.
