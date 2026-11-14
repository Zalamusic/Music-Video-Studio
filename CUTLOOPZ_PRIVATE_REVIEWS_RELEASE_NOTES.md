
# CutLoopz private scroll reviews — November 2026

- Reviews brand: **CutLoopz** (not SoundLoopz).
- Customer page: `/cutloopz-reviews.html` with parchment scroll, leaning serif headings, five stars, and private written review.
- Reviews require a signed-in customer account. Fields validated server-side; 1–5 stars, 10–2500 characters, 10-minute in-process cooldown.
- Stored in small individual JSON records under `OUTPUT_DIR/cutloopz-private-reviews` (set `OUTPUT_DIR` to persistent writable disk). Neither audio nor videos are saved.
- Only signed-in email matching the server's `CUTLOOPZ_OWNER_EMAIL` may GET or DELETE reviews at `/api/cutloopz-reviews/admin`.
- Private owner dashboard `/cutloopz-private-feedback.html`. This HTML path is public but data is protected by the server endpoint.
- No public feed, testimonials, or directory exposure. User text rendered with `textContent` rather than HTML.
- This work does not start or reconfigure any GPU, payment flow, or paid generation.
- Not deployed. Verify login, submissions, persistence, owner-only access, and mobile typography in the Render preview before launch.
