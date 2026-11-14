# CutLoopz — Artist Pages, Cinema Premiere and Scroll Navigation

This release builds on the deployed two-tab evaluator release. No RunPod or payment changes.

- Main and floating homepage tab bars: a responsive Scroll → / ← Scroll hint appears only when tabs overflow. Tap or swipe to browse the bar.
- Creator Directory: compact, entire-card links to individual public artist profiles.
- New `/artist.html?id=<public creator ID>`: full public artist biography, platforms, and external music/video/social links, without storing media.
- Artist profile editor: View Public Profile opens the exact artist page when public. Added My Hit Maker Rewards link to the signed-in account loyalty panel.
- Cinema: luxury black, burgundy and gold private-premiere appearance with “Every Artist Deserves a Premiere.” and a helpful expired-preview message. Playback/download/share authorization is unchanged.

## Validation
- JavaScript syntax checks passed.
- Navigation, Creator Directory, profile, Cinema, and security test scripts passed.
- Browser-based local screenshot navigation was blocked by the test environment, so mobile visual verification remains necessary on Render.
- Full `node --test` suite: 116 passed, one test could not load because `express` is not installed in this offline test environment. No known application assertion failure.

## Deployment
Upload ZIP to `cutloopz-production-test`. Set `archive = Path("CUTLOOPZ_NAV_ARTIST_CINEMA_READY.zip")` in `.github/workflows/install-cutloopz-release.yml` and commit. Verify GitHub install and Render deployment. Do not put the site into public production or enable paid GPU jobs.
