# CutLoopz — Free beat-analysis upload (November 14, 2026)

## Customer behavior
- Free Song Evaluation displays the link field first and a clearly labeled optional section immediately underneath: **For Beat Analysis, Upload an MP3 File** (MP3/WAV supported).
- With **link + lyrics**, CutLoopz uses the link only as a song reference for free creative-storyboard planning. It **does not** download or hear the streaming audio, and does not extract streaming-site lyrics.
- With an authorized **MP3 or WAV (25 MB maximum)**, artists can tap **Analyze Beats — Free** and receive estimated BPM, duration and scene-level energy on the same page. The backend is the existing `POST /api/creative-preview/music-analysis` route (local ffmpeg, no GPU and no paid-generation calls).
- An artist can use **either a supported link or an MP3/WAV** to continue into the Listening Director; an audio upload is optional. No video can be generated through the free evaluation journey.
- Evaluation draft and uploaded media remain isolated from the separate video-creation Studio draft. On-device media retention is browser-dependent. Server analysis uses temporary files removed after each request.
- A song-link reference alone can never honestly claim to have computed BPM. All beat-analysis values are estimates, not genre identification or vocal transcription.

## Deployment
- ZIP contains the complete GitHub project under the `Music-Video-Studio-cutloopz-production-test/` prefix, preserving existing release-install workflow compatibility.
- Upload the ZIP to the `cutloopz-production-test` branch, then update the existing installer workflow's `archive = Path(...)` to the actual uploaded ZIP filename and commit. Verify the workflow and Render deployment before using.
- RunPod, customer checkout, paid-generation flags and production routes were **not changed**.

## Verification
- Node source / test checks performed in the build environment; browser navigation was blocked, so visual mobile verification on the deployed preview is still required.
