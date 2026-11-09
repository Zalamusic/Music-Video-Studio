# V7 — Independent local generator transport (offline)

Added `cutloopz-local-generator-adapter.mjs`, a strict loopback-only HTTP transport with health, submit, status and download methods. Rejects external URLs, malformed job IDs and unauthorized submissions; never retries submission or falls back to a paid provider. Added four offline tests in `test-local-generator-adapter.mjs`.

**Not connected to the live production router.** The adapter is a protocol boundary only; it does not implement video synthesis, singing, model inference or GPU hosting. A separately running, compatible local generator is required. The current production router still uses the external Performance Pilot and must not be described as independent. No deployment or paid calls performed.
