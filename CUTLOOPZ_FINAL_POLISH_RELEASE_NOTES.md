# CutLoopz final website polish (2026-11-14)

Based on the most recent packaged CutLoopz production-test source with rounded navigation and artist pages.

## Included
- My Hit Maker Rewards has its own **private** page (`/hit-maker-rewards.html`) with server-verified progress and different milestone colors (bright green at six). The account/order API currently reports redemption inactive, so the page does **not** claim a discount is already redeemable.
- The artist can preview their own saved private or hidden artist profile at `/artist.html?preview=mine`, using a signed-in authenticated endpoint. The public Creator Directory still lists **only** profiles explicitly set to Public.
- Optional profile avatar is uploaded from the artist's device, resized in the browser to 160 × 160 JPEG, and saved in the existing artist profile record. No profile image URL is required. Large or non-JPEG data URLs are rejected by the server.
- Reviews footer styling moved to its own centered mobile-friendly row. The link remains available without text wrapping behind floating buttons.
- Black/gold sign-in and sign-up styling; distinct branded Forgot Password page and non-enumerating request confirmation; polished password reset screen; branded password reset email. Uses `CUTLOOPZ_APP_URL` or Render's `RENDER_EXTERNAL_URL`, falling back to `https://cutloopz-preview.onrender.com` instead of the old studio address.
- No changes to video generation, GPU, payment gates, or current streaming retention logic.

## Known testing limitations
- 23 automated tests passed, including simulated private-owner preview and validation of public visibility.
- A local Chromium-based visual test was attempted but blocked by the environment's browser access policy. Test visual layout on the private Render preview and check authentication email delivery on the actual configured SMTP account.
- Public profiles and avatar persistence use the existing account JSON storage. Confirm persistent storage before official launch; free/ephemeral Render filesystems can be lost on restart or redeploy.
- Payment checkout and automatic discount redemption remain inactive according to the existing backend. The rewards page shows eligibility without pretending a discount is active.

## GitHub installation
- The current GitHub `install-cutloopz-release.yml` workflow expects a ZIP and, on Nov 14, still points at `CUTLOOPZ_EVALUATOR_TWO_TABS_READY.zip`.
- Upload `CUTLOOPZ_FINAL_POLISH_NOV14_2026.zip` to the `cutloopz-production-test` branch, then update ONLY the existing `archive = Path(...)` assignment in the GitHub installer to `archive = Path("CUTLOOPZ_FINAL_POLISH_NOV14_2026.zip")`, committing directly to the same branch.
- The `.tar.gz` download is an alternate backup format and **cannot** be read by the current ZIP-only workflow without modifying the installer.
- Confirm green GitHub Actions and the correct Render commit before testing. No GPU required.
