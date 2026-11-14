# CutLoopz Media — Studio save, storyboard download & portable backup release

## Changes
- Added four visible project actions, available on all five Studio pages: **Save Now**, **Download Storyboard**, **Download Project Backup**, and **Restore Backup**.
- Save Now immediately persists the creative draft in browser storage and also attempts account sync when signed in; it reports account-sync failure accurately.
- Storyboard export downloads a UTF-8 plain-text file with song details, lyrics, creative direction, artist continuity, and **every** editable scene.
- Project export downloads a versioned JSON file. It contains only creative planning text and scenes — **no MP3/WAV, artist images, secrets, access tokens, or generated videos**.
- Project restore validates version and maximum file size, asks before replacing the current project, clears local media selections, and restores scenes for viewing/editing. Audio/photo uploads must be reselected before production. If the song source is changed, the storyboard is intentionally invalidated for safety.
- Storyboard navigation moves in groups of two scenes on both desktop and mobile (stacked vertically on narrow screens).
- Fixed missing `source` in the account draft allow-list; expanded account draft payload to 240 KB (and server JSON parser to 256 KB) to support longer storyboards.
- Added offline unit and contract tests for backup integrity and safety.

## Verification
- Node syntax checks pass on changed `.js` / `.mjs` files.
- `node --test test-*.mjs` passes (87 tests at final version, subject to repeat result).
- Browser end-to-end testing has not been completed in this working environment; test on Render preview after deployment.
- The Express-based `test-cutloopz-unified-production.js` requires installed npm dependencies and cannot run here without them. No GPU, paid model, Render deploy, or external storage access is used in this release work.

## Release installation (existing GitHub installer)
The existing GitHub Actions workflow `Install CutLoopz Release` expects `CutLoopz_GitHub_Ready_Nov13.zip` at the **repository root** on the `cutloopz-production-test` branch. Upload the ZIP as a normal repository file without extracting it, commit it, then manually run the existing installer workflow using **Actions → Install CutLoopz Release → Run workflow** (select `cutloopz-production-test`). The installer checks `server.js`, extracts the website files, and commits those files; monitor the run before testing the new Studio on Render.

If Android adds `(1)` or another number to the file name, rename the downloaded ZIP to exactly `CutLoopz_GitHub_Ready_Nov13.zip` before uploading. Do not accidentally upload an older copy of the archive.

This is an **updated source ZIP**, not a deployed website or a completed checkout-to-video release. Public payment and GPU video generation remain unverified and should not be enabled by this change.
