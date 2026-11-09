# CutLoopz V3 — Paid-provider price safety lock

## Verified change
The external-provider production router now refuses to create paid production jobs or advance paid clips when `CUTLOOPZ_PROVIDER_PRICE_VERIFIED=true` and a positive numeric `CUTLOOPZ_VERIFIED_CLIP_PRICE_USD` are not BOTH configured. Previously it used an unverified $0.50 fallback estimate that could permit paid clip submissions. `/status` exposes `paidGenerationLocked`.

## Tests
`node --test test-production-router-no-deps.mjs test-production-price-lock.mjs` — both pass offline, without invoking external providers. The existing router test now supplies explicit simulated verified pricing; the new test verifies the lock when pricing is unknown.

## Limitations
This is a cost-safety repair, not an independent generation engine. It does not validate realistic motion, singing, deployment, or full production readiness. Do not deploy as a completed independent backend. No paid generation or deployment was performed.
