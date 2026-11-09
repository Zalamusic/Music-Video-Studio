# CutLoopz V10 — Local generator media compatibility

- Corrected the local generation adapter's multipart upload metadata. WAV is transmitted as audio/wav with a .wav filename; MP3 as audio/mpeg with .mp3. PNG, WebP, and JPEG are transmitted with matching image MIME types and filenames.
- Format detection uses file signatures, not untrusted extensions.
- Rejects unsupported media before attempting local generator submission.
- Added two regression tests in test-local-generator-media-types.mjs.
- Verified seven targeted tests pass (local adapter, media types, and independent health).

Not a live model test. No generation model was installed, deployed, or charged. The independent model service remains a blocker.
