# CutLoopz Production V13

## Change
- Stream local generator MP4 downloads directly to a temporary file instead of buffering the full video in memory.
- Enforce the existing 120 MB cap during streaming, including when Content-Length is absent.
- Validate the MP4 signature before atomically renaming the temporary file to the final destination.
- Clean up partial downloads on failures.

## Verification
- `node --check cutloopz-local-generator-adapter.mjs`: passed.
- `node --test test-local-generator-*.mjs`: 9 passed, 0 failed.
- No live deployment, paid generation, or model inference was performed.

## Outstanding
The adapter still requires a real, independently operated video-generation model service. Singing, motion realism, and full 30-second generation remain unverified.
