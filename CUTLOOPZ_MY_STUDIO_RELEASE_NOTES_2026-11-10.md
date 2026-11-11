# CutLoopz Media — My Studio Integration Preview

Release candidate date: 2026-11-10. Prepared for Render preview branch `cutloopz-production-test`; NOT deployed by this build step.

## Changes
- Added `/my-studio.html`: a 5-page stationary, numbered Artist Studio wizard with Back/Next, review, and editable numbered storyboard scenes.
- Created `/my-studio.css` and `/my-studio.js`: black-and-gold mobile/desktop UI; drafts saved locally and (when signed in) through the customer-auth account endpoint.
- Saved drafts include text settings, music analysis summary, and scene edits. Actual audio/photo bytes are **not** persisted in drafts; users must reselect uploads after refresh.
- Added authenticated account-owned draft endpoints at `/api/customer-auth/studio/draft` (GET/PUT/DELETE). Their durability depends on the Render service `OUTPUT_DIR` having persistent storage; verify this in staging before promising cross-device recovery.
- Added `/api/creative-preview/music-analysis` and `/api/creative-preview/storyboard` with no administrator-password requirement. No provider/API billing, payment, or GPU calls are triggered by these routes. Audio analysis requires installed `ffmpeg`; upload size/rate/concurrency controls are enabled.
- Preserved administrator authentication for paid generation, GPU endpoints, and privileged operations. Do **not** disable backend authentication to facilitate preview.
- Homepage no longer contains a separate creation form. Main buttons lead to My Studio. Existing 25-second muted five-style loop retained with fallback poster and pause button.
- Replaced older free Director public pages with redirects into the unified Studio to avoid admin-password prompts.
- Reduced the How It Works card padding while increasing description text; horizontal scrolling navigation preserved.
- Added custom exact video duration using M:SS (15s through 6:00), alongside presets.
- Glamour Membership stays an optional, separate subscription area; no premium entitlements are unlocked without verification.

## Validation
- `node --test test-*.mjs`: 43 passed, 0 failed (existing 36 + new 7), with FFmpeg installed.
- `node --check`: passed on server and new JavaScript.
- Playwright Chromium scripted mobile UI smoke: navigation, generated mock storyboard display, edits, review, compact mobile layout and no JavaScript errors; **backend requests were mocked in this browser check**.
- Validation did not establish live Render route compatibility or persistent storage availability. No GPU inference was run.

## Deployment and limitations
- Leave Cutloopz.com in GoDaddy without DNS changes.
- Preview deployment only after the user commits this source to `cutloopz-production-test` via the verified GitHub restore workflow.
- Existing `.github/workflows/cutloopz-site-review-recovery.yml` expects ZIP name `CUTLOOPZ_SITE_REVIEW_RELEASE.zip` in the repository root. The release archive is named exactly that and keeps the established top-level directory prefix.
- The verified workflow extracts the ZIP, tests the Node files, commits to the preview branch, and Render can auto-deploy that branch. The package itself does not deploy or spend GPU funds.
- Production media generation and customer payments remain disabled. The five-page wizard ends at a clearly disabled Generate button.
- Music analysis is approximate beat/energy inference, not vocal transcription. Story Director is deterministic rule-based analysis, not a generative model.
