# CutLoopz Media — Private Preview Studio

**Your Music. Your Vision. Your Video.**  
**A Director That Listens. A Video That Performs.**

This repository contains the CutLoopz Media site and a private owner-testing flow. Its Studio stages cover music intake (MP3/WAV or supported share link), free rhythm analysis, a Listening Director, editable storyboards, and a private local-GPU production interface. Public payment and customer-generation launch are not enabled.

## Start the application

Requires Node.js 22+ and FFmpeg/FFprobe. Run `npm install` and `npm start`. By default the site serves on port 3000. Set a writable, persistent `OUTPUT_DIR` for production tests. Never commit credentials to the repository.

## One-click owner GPU testing

In the Render **environment**, configure:

- `CUTLOOPZ_OWNER_EMAIL` — email of the already-created CutLoopz Studio account that owns the private preview.
- `CUTLOOPZ_LOCAL_GENERATOR_URL` — the existing worker's root URL, ending with `/`. For a separate GPU worker, use an authenticated HTTPS tunnel, not an exposed raw port.
- `CUTLOOPZ_REMOTE_GENERATOR_HOST` — exact approved HTTPS hostname (without scheme or slash) if remote.
- `CUTLOOPZ_WORKER_SHARED_TOKEN` — same strong token as the existing GPU worker; never put it in client JS or commit it. Required for authenticated remote worker access.
- `CUTLOOPZ_LOCAL_GENERATION_ENABLED=true` — turn on **only after** the worker really has an installed executable generator and is reachable. This is one private production on/off setting, not a per-job permission form.
- `CUTLOOPZ_PUBLIC_LAUNCH=false` — keep the project private/non-indexed until launch authorization.

On the GPU worker, set `CUTLOOPZ_MODEL_RUNNER` to the installed executable implementing the worker contract; `CUTLOOPZ_MODEL_ID` may label it. Start `cutloopz-local-model-service.mjs` behind the authenticated HTTPS connection. No redundant `CUTLOOPZ_MODEL_ENABLED`, `CUTLOOPZ_LOCAL_AUTORUN_ENABLED`, or clip-by-clip owner approval is needed. Old administrator test routes retain access restrictions and external-provider spending limits.

In **My Studio**, sign in with the owner account, upload an authorized song and artist photo, generate and edit a storyboard, open the final review page, select **Check GPU Connection**, accept the rights confirmation, then choose **Generate My Video**. The system stores a local job ID for recovering progress after a page reload. Clip results remain privately authenticated. The worker never automatically falls back to a paid third-party provider.

## Checks

Run `node --test test-*.mjs` to execute the offline regression suite. To run additional `.js` tests, install declared Node dependencies with `npm install` first. `test-local-30s-integration.mjs` uses synthetic clips and real FFmpeg assembly, **not** a GPU or singing model. No code-only test proves live visual quality, lip sync or worker capacity.

## Important limitations

A configured executable is necessary but does not guarantee model weights are correctly loaded. The bundled `cutloopz-wan-visual-runner.py` is visual-only and cannot independently claim realistic singing or accurate lip sync. Checkout, customer order fulfillment, durable object storage, retention cleanup, and real video quality must be verified before a public launch. For a change-by-change summary, see `CUTLOOPZ_OWNER_STUDIO_RELEASE.md`.

**Do not re-run historical one-off GitHub installer workflows; many are older code replacements.** Use the read-only branch audit or integration test workflows when checking this release.
