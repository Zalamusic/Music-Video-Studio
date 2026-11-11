# CutLoopz — Private Website Review Release
Prepared November 10, 2026

Purpose: deploy the current verified code so the owner can review website
navigation, typography, content, account pages, and protected admin controls.
This is NOT an authorization to turn on live payment or GPU generation.

Source: CutLoopz_Production_30s_AutoRunner_Verified_2026-11-10.zip
Review checks completed:
- 36 Node regression tests passed, 0 failed (local source test)
- All HTML inline scripts pass JavaScript syntax checks
- Existing internal HTML/CSS/JS/image link references resolved to files
- Mobile customer HTML tested at 393px viewport without horizontal page overflow
- Customer.html is the server's root destination (/ redirects there)

Not yet verified:
- Current Render deploy (requires repo push and Render service access)
- Full browser flows using a running Express backend
- Sign-up, sign-in, password reset emails using actual Render credentials
- GPU generator, paid video production, PayPal live payment

Recommended private review:
1. Home: logo, brand/tagline, navigation, how it works, pricing, footer
2. Create: verify clear notice that ordering is not enabled
3. Director: song analysis, lyrics field, responsive layout, generated prompt
4. Account: sign-in, sign-up, sign-out, return-to-Studio navigation
5. Admin: password gate, model-unavailable status, safety indicators
6. Mobile: buttons readable/tappable, no text overflow, back-to-top
7. Refresh: verify no unexpected session loops or lost state
8. Network: confirm no 404s on internal links and no unexpected paid calls

Keep Render test environment variables explicitly false:
ENABLE_PAID_GENERATION=false
CUTLOOPZ_FULL_PRODUCTION_ENABLED=false
CUTLOOPZ_PERFORMANCE_PILOT_ENABLED=false
ZALA_GPU_GENERATION_ENABLED=false
CUTLOOPZ_LOCAL_GENERATION_ENABLED=false
CUTLOOPZ_LOCAL_AUTORUN_ENABLED=false
CUTLOOPZ_MODEL_ENABLED=false

No file in this package enables these flags. Never paste secret keys into
GitHub or ChatGPT messages. Do not change an existing Render persistent disk.
