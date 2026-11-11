# CutLoopz Studio V5 — Song Links + Search Preview

Release ID: CUTLOOPZ_STUDIO_V5_SONG_LINKS_55TESTS

## Added
- Paste and recognize HTTPS share links from Suno, Udio, YouTube, Spotify, and SoundCloud on My Studio Page 1.
- Validated share links persist with project drafts on the local browser and, if signed in, the customer account draft.
- One-click opening of the original share link in a separate tab.
- Direct link entry on the homepage leads into My Studio (not a duplicate video-creation form).
- More specific title, descriptions, social preview metadata and prominent supported-source labels.
- Preview X-Robots-Tag remains noindex until explicitly approved public launch (CUTLOOPZ_PUBLIC_LAUNCH=true).
- URL allowlisting rejects lookalike hosts and strips tracking parameters; no server-side arbitrary URL fetch.

## Important limitations
- Link-based project planning is functional, not automated audio extraction.
- For beat analysis or eventual actual video generation, users must provide an MP3/WAV downloaded through the source platform's approved channel, or use a future licensed provider integration.
- Suno's current terms restrict non-approved copying; YouTube similarly restricts downloading unapproved media. Do not implement stream ripping.
- CutLoopz video generation and customer payments remain disabled in this preview; this release does not change the production engine.
- No GPU or paid AI calls were made to build or test this release.

## Deployment
Upload the separate cutloopz-studio-v5-song-links-verified.yml first under GitHub .github/workflows on cutloopz-production-test; commit it. Then upload the uniquely named ZIP to the branch root and commit. Its workflow validates exact ZIP SHA256, extracts source, requires 55 offline tests and commits source files to the branch. Check the workflow and Render deployment before calling it live. Official Cutloopz.com remains untouched.
