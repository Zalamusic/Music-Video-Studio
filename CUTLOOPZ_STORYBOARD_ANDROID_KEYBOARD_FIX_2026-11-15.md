# CutLoopz — Android storyboard editor fixes (November 15, 2026)

## Fixed

- Removed `window.resize → renderScenes()` from `public/my-studio.js`. On Android, showing the on-screen keyboard resizes the viewport; replacing all scene DOM elements on every resize caused the input to lose focus and the keyboard to flash closed. Scene layout remains responsive via existing CSS media queries.
- Scene action, prompt and per-scene lyric cue editors now automatically expand to fit their content, so vertical finger swipes reach the document rather than being trapped in nested textareas. The Location field remains compact. No extra tabs were added.
- Included the Director's `lyricExcerpt` in the on-screen storyboard and retained it across local/account draft hydration, JSON project backups, and readable storyboard downloads. The per-scene cue is approximate (not vocal timing or a change to the original audio).
- Lyrics on Song Details remain compact when idle but expand to show the full text while focused, then collapse when editing finishes. Director creative direction and artist-continuity notes grow with their contents. These fields no longer trap page swipes inside a separate scrollbar.

## Scope and safety

No changes to server-side generation, GPU controls, payments, credentials, media retention, or deployment. This ZIP is a source-code backup/patch. Uploading it to GitHub and deploying the branch is a separate action.

## Android verification

1. Open My Studio, create a storyboard, tap Action / Director Prompt / Lyric cue and type while the keyboard is open. The keyboard should stay open and entered text must remain visible.
2. Swipe up/down over scene text fields; the page should scroll and scene edits should remain intact.
3. Use Previous/Next Scenes, Save/Download, refresh/restore a project and confirm scene lyric cues and manual edits persist.
4. Rotate the phone with the editor focused and confirm the scene editor remains editable.
