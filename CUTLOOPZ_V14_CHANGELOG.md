# CutLoopz V14 — Local generator upload bounds

- Validate local song and photo file sizes before reading either into memory.
- Maximum local-generator song upload: 32 MiB; photo upload: 12 MiB.
- Reject nonregular files and detect size changes after reading.
- Add regression tests for oversized song and photo submissions; verify no network submission occurs.
- 11 local-generator tests pass (`node --test test-local-generator-*.mjs`).

**Important:** This release does not install or run an independent generative video model. The adapter remains a transport interface only. No end-to-end singing/video quality claims are made.
