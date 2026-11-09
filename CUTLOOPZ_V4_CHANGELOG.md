# CutLoopz V4 offline engineering update

- Audio metadata inspection now has a 15-second timeout, preventing malformed uploads from indefinitely holding a request.
- ffprobe output is parsed as JSON and explicitly checked for an audio stream and positive finite duration.
- ffprobe output size is bounded, and failed processes are handled without double-settling the request.
- Existing external-provider price verification and per-clip approval safeguards remain unchanged.

## Checks executed
- `node --check cutloopz-production-router.mjs` — pass
- `node test-production-router-no-deps.mjs` — pass
- `node test-production-price-lock.mjs` — pass

## Remaining blocker
Independent video generation is not integrated or verified. This ZIP is an offline backup, not a production-ready release. No paid generation or deployment was performed.
