# CutLoopz Studio — artist review corrections (November 13, 2026)

Changes from the Creator Directory / Cinema release:

- Lyrics editor restored to a compact 245px mobile / 260px desktop viewing area. The field scrolls internally for long songs; pasted or restored lyrics start at the top. Normal typing still scrolls with the caret; text is never truncated.
- Save Now, Download Storyboard, Download Project Backup and Restore Backup moved into Page 5 / Review Your Vision, after the creative summary and before the production panel. Auto-save remains enabled throughout.
- A small optional **Restore a backup** text button at the bottom of Page 1 allows artists to open older drafts without advancing through five pages.
- Backup downloads are still secure, portable `.json` project files (not readable scene documents); the UI now clearly explains this difference. Downloads with no creative content are blocked with helpful feedback.
- Artist Directory search filters only opt-in public CutLoopz artist profiles; it does not search or scrape Suno, Spotify, etc. Results appear only after artists publish profiles and include searchable details.
- No changes to public checkout, RunPod, generator ports, credentials, payments or media retention.

Verification: run the relevant test suite and mobile render inspection; then deploy to `cutloopz-production-test` and test on Android.
