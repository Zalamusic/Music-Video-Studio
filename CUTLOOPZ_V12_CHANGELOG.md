# CutLoopz V12 — bounded local generator downloads

The local generator adapter now reads MP4 response streams with a strict 120 MiB byte cap, including when Content-Length is absent or inaccurate. It cancels oversized streams before buffering the remainder. Existing MP4 signature validation and atomic output-file replacement remain intact.

Verification: `node --test test-local-generator-*.mjs` — 9 tests passed, including a new oversized-stream regression test.

This is a transport safety improvement only. No operational independent video model is included, and no end-to-end singing/movement generation is verified. No deployment or paid generation occurred.
