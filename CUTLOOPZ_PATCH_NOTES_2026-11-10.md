# CutLoopz production ZIP: verified local repair (2026-11-10)

**Source:** `Music-Video-Studio-cutloopz-production-test (5).zip` as uploaded.

## Code changes

1. Fixed the administrator Studio local-GPU readiness handshake: the `/local/status` endpoint returns `readyToSubmit`, whereas the page incorrectly checked `modelLoaded`. Now uses `readyToSubmit` so the production controls can be unlocked only when the service reports a loaded model.
2. Protected **all** CutLoopz production API routes with the existing admin-key authorization middleware, including the read-only `/local/status` readiness endpoint. The earlier public exception was inconsistent with the site's administrator-only rule.
3. Updated static release-contract tests to detect both problems and added a route middleware regression test for anonymous and authenticated access.

## Verification and limitations

- No GPU job was started, no external paid generation used, and no Render or GitHub deployment was performed.
- The ZIP does **not** include a trained vocal-performance model runner or verified model weights; `CUTLOOPZ_MODEL_RUNNER` is a required external executable.
- A passing Express startup check only proves server startup and page serving, **not** end-to-end generation.
- Customer `public/customer.html` remains a preview-only form and still cannot order or produce videos.
- Do not enable public payments or claim customer launch readiness.

## Next production gates

1. Confirm which deployed Render revision corresponds to this ZIP and update only after reviewing the change set.
2. Verify the existing GPU pod, model executable and service reachability; do not start or rent a new GPU without approval.
3. Validate a real 30-second end-to-end singing-performance output, then add customer autonomous processing with private delivery and payment linkage.

## Additional critical UI repair

4. **Restored the administrator Director's malformed inline JavaScript.** The supplied HTML had a truncated string and missing shot-card construction logic. As a result, its entire first script failed parsing, leaving the six-shot planning interface inoperative. Restored the six expandable five-second shot cards, direction controls, human-review completion indicators, and uploaded-file labels. The repaired browser UI was smoke-tested in headless Chromium: six shot cards, 66 direction controls, no JavaScript page errors, local generation disabled until model readiness. No backend calls or GPU activity were made.
5. Added `test-admin-script-contract.mjs` to detect JavaScript syntax breakages in any inline scripts across the `public/*.html` pages and to protect the six-shot and local-readiness wiring.

6. Updated `.github/workflows/cutloopz-integration-tests.yml` so the test suite, including HTML inline-script syntax, automatically runs on pushes to the `cutloopz-production-test` branch and can also run manually. Its generation flags are disabled.
