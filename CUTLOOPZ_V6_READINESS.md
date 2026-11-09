# CutLoopz V6: Independent generator readiness gate

Added `cutloopz-independent-readiness.mjs` and `test-independent-readiness.mjs`.

Run `node cutloopz-independent-readiness.mjs` to get a JSON, **read-only** preflight report. It does not start a server, deploy anything, make paid requests, or modify job data. Exit status 2 means not ready.

The checks deliberately fail closed. Even with a local endpoint, model path and ffmpeg installed, readiness stays false until the production router is actually integrated with a local backend and tested. This prevents treating environment configuration as evidence of completed video generation.

Current finding: `cutloopz-production-router.mjs` still imports `createPilotHttpAdapter` and reports `generationBackend: external-performance-pilot`. This V6 package does **not** claim independent video generation is operational. Realistic singing, body motion and full end-to-end production remain unverified.

Verification: `node test-independent-readiness.mjs` (3 tests passed). No charges or deployment.
