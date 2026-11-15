# CutLoopz — persistent customer account storage fix (November 15, 2026)

## Scope

- Uses the already-configured `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` server environment variables.
- Persists customer account identifiers, password hashes, login sessions, artist-profile metadata, password-reset state, and Studio drafts in Upstash Redis instead of the Render instance's ephemeral local filesystem.
- Reads surviving legacy `/app/outputs/customer-accounts/*.json` files **only on first Redis initialization**, preserving their existing IDs and hashes, if any. Does not overwrite existing Redis records during initial import.
- The order-history endpoint checks customer identities through the same account store. Other order files and video media remain on their existing paths; this patch does not make those files persistent.
- Fails closed if Upstash is configured but unavailable; never silently substitutes empty accounts during an outage.
- Keeps the existing local-file behavior only when **both** Upstash variables are absent (local development).
- Does not change GPU code, pricing, video generation, storyboards, or password hashing.

## Important data recovery limitation

If a Render redeploy already deleted an old `users.json`, this patch cannot regenerate that account or password hash. It prevents future losses after the Redis backend is configured and deployed. A surviving old account file can be imported automatically, otherwise restore from a prior backed-up account record or create a new account intentionally once loss is confirmed.

## No credentials in release

Never put the Redis token in GitHub, the ZIP, a screenshot, or the browser. The token is loaded only by the Render server process from environment variables. This release doesn't include actual credentials.

## Installation

Use the existing `cutloopz-production-test` branch and `Install CutLoopz Release` workflow. The zip must be uploaded to the repository root, and the workflow's `archive = Path(...)` entry must point to its **exact GitHub filename**. Editing that workflow file triggers the installer; verify the install run and then the Render redeploy.

## Tests

`node test-cutloopz-upstash-accounts.mjs`
`node --check customer-auth.js`
`node --check customer-order-history.js`

All are offline and do not incur RunPod/GPU usage.
