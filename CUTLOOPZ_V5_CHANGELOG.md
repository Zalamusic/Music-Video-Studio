# CutLoopz V5 — Budget validation hardening

- Reject non-finite, zero, or negative provider clip prices at coordinator initialization.
- Reject NaN, Infinity, zero, negative, and insufficient approved budgets before writing a job.
- Added `test-production-budget-validation.mjs` covering those conditions.
- No change to generation provider: current backend remains the external Performance Pilot.
- Offline tests do not establish live independent video generation or performance realism.
- No live deployment or paid generation performed.
