# CutLoopz Account Flow + Avatar Adjustment · 2026-11-14

- Account signed-in view now offers one central **My Creative Home** hub with Artist Profile, My Videos (verified order-history area), and Create Video.
- Removed the visible duplicate Hit Maker progress panel from Account; the existing **My Hit Maker Rewards** page remains the sole progress display and is linked discreetly from the signed-in Artist Profile editor.
- Removed duplicated direct profile/directory links from Account footer. The public artist profile stays about the artist only; no private rewards data is exposed to visitors.
- Optional profile picture now opens a circular cropping editor before saving. Drag by touch/mouse or arrow keys, pinch-to-zoom or use the zoom slider, then choose **Use This Photo**. Only the 160×160 JPEG avatar is stored in the artist record, not the original upload.
- No changes to production, GPU, payment, retention, or customer authentication endpoints.
- Known limitation: browser rendering and live Render behavior must still be verified before declaring deployed.
