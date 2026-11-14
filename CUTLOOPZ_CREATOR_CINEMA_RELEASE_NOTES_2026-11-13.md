# CutLoopz Media — Creator Directory + Cinema + Studio Helper

**Release:** November 13, 2026 working release for the `cutloopz-production-test` branch.
**Status:** Code updated and offline tests passing. NOT deployed to Render; not yet tested against live customer accounts or a GPU.

## What changed

1. Home music-source links are compact, evenly aligned **rectangular** labels; existing SUNO/Udio/YouTube/Spotify/MP3 routing is unchanged.
2. Accessibility/typography refinements preserve readable Studio text while reducing oversized homepage source controls.
3. A small floating, keyboard-accessible **Studio Helper** offers page-aware guidance, Save/Download help, and Creator Profile navigation. It runs locally; it is not an AI chatbot and never calls a paid service.
4. **Artist Cinema** `/cinema.html`: jet-black, large responsive playback, download, and short-lived private review-link sharing. The finished video is served from the existing local production location without creating a public video library or duplicate video files. An expiring bearer token can be shared with other viewers. Anyone holding that link may view it until expiration; treat it as private. The review screen appears empty until an actual finished video is available.
5. **Creator Directory** `/creator-directory.html`: optional public listings, searchable by artist, genre, or music platforms. External music and video links open on the original platforms. No showcase videos are uploaded to CutLoopz.
6. **My Artist Profile** `/creator-profile.html`: signed-in customers can edit artist name, biography, genre, platform tags (Suno, Udio, YouTube, Spotify, SoundCloud, traditional studio, other), artist page, social links, and external video links. Listings default to private. Public/private/hidden visibility is controlled by the owner. Public records contain no email, session credentials, orders, private drafts, or photos/videos uploaded to CutLoopz.
7. The existing Home shortcut, expanding lyrics board, Save/Storyboard Download/Backup/Restore controls, customer sign-in, and Studio work are preserved.

## Security and scope

- Artist profile updates require a current customer-account session, same-origin submission, strict URL validation, and a rate limit. All submitted URLs must be HTTPS and are never fetched by the server.
- Private owner Cinema sharing uses the existing authorized account gate and verifies the assembled local video receipt and file, then stores only a 7-day bearer-token record.
- Video playback links also stop working when the underlying file is removed (for example under retention policy). The Creator Directory has no video storage.
- Payments, customer-order automation, production model installation, RunPod startup, and paid-generation flags **have not been changed** by this release. The GPU remains disconnected/unavailable until authorized testing.
- No claim is made that public checkout works or that a real video has been rendered.

## Testing

- 24 selected Node tests passed, including 4 new account-level/security/contract tests for the Creator Directory and Cinema link flow.
- All `server.js`, `customer-auth.js`, and public JavaScript passed `node --check`.
- All new and modified HTML pages parsed with unique IDs; local script and CSS references exist.
- Automated Chromium visual navigation was attempted but was blocked by environment policy (`ERR_BLOCKED_BY_ADMINISTRATOR`); **mobile appearance and live Render integration still require verification**.

## Deployment

This ZIP retains the **same root folder** expected by the existing GitHub installer:
`Music-Video-Studio-cutloopz-production-test/`.

Upload the ZIP as **`CutLoopz_GitHub_Ready_Nov13.zip`** to `cutloopz-production-test`, then run **Install CutLoopz Release** from GitHub Actions. The current installer requires this exact ZIP name. Inspect the workflow result, Render deploy and live mobile pages before enabling public access. No GitHub or Render deployment has been performed automatically.
