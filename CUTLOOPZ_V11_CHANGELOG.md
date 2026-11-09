# CutLoopz V11 — local generator output validation

- Rejects a local generator response that is not an MP4-family file (checks ISO BMFF `ftyp` box and valid initial box length) before saving it as a finished video.
- Preserves atomic temporary-file write and rename behavior.
- Adds regression tests for invalid bytes and a valid MP4 file header.

This is a container-signature sanity check, not full media decoding. Real generation, synchronization, and movement remain unverified. No live deployment or paid generation.
