# CutLoopz V9 — local production route integration

Adds administrator-protected `/local/status`, `/local/jobs`, `/local/jobs/:id`, `/local/jobs/:id/advance`, `/local/jobs/:id/assemble`, and `/local/jobs/:id/video` under the existing production router mount.

Requires `CUTLOOPZ_LOCAL_GENERATION_ENABLED=true` and a loopback-only `CUTLOOPZ_LOCAL_GENERATOR_URL`, plus a running service implementing the adapter contract. No external provider fallback. Each clip advance requires explicit confirmation.

**Not a working video model:** No generation model or GPU service is bundled. Local job accounting uses a nominal $0.01 per clip solely to satisfy the coordinator's budget validation; it is NOT a verified GPU cost. Video realism, singing synchronization and model quality are untested. Do not deploy without further end-to-end verification.
