# My Studio V3 fixes

- The homepage Director tab opens `/my-studio.html?step=director` (Page 3), distinct from the My Studio tab.
- Deep links take precedence over saved page numbers without discarding project data.
- Audio and artist photo upload remain together on Page 1.
- Selected audio and photo may persist in browser-local IndexedDB across refreshes. Raw files are never sent to the text draft account endpoint. If browser storage is unavailable, the current-session file still works and the user is told when reselection is needed.
- Page 2 explicitly shows the selected audio name and uses that same File object to analyze. No second file picker.
- New Project clears the browser-stored media for the current draft.
- Payments and GPU generation stay disabled; no changes to admin or deployment credentials.
- Before deployment, run `node --test test-*.mjs` in a CI environment with FFmpeg available. Browser behavior also needs live QA.
