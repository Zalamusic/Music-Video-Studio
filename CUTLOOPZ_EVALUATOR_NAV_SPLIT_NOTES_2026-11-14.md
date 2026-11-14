# CutLoopz free evaluation / video Studio separation (November 14, 2026)

- The homepage shows Free Song Evaluation first. Video creation is a separate top-navigation link; the extra video-creation promo section no longer interrupts the evaluator journey.
- Home evaluation links enter `/my-studio.html?mode=evaluator&source=link&step=song` in a dedicated link-only interface. Upload/photo/GPU controls are hidden throughout the evaluator, including final review.
- The Free Song Evaluation and Create Video Studio use separate browser draft namespaces. Evaluator drafts do not overwrite the signed-in account's production Studio draft. Evaluation remains local-device-only; download the project backup for portability.
- Video creation remains `/my-studio.html?source=upload`, supporting MP3/WAV, reference photo, Director, storyboard, and existing private owner test controls.
- Third-party links are references only. No audio is extracted, analyzed, or generated from URLs. Beat analysis requires a rights-cleared local MP3/WAV in the video workflow.
- No GPU or paid-generation changes were made. Test on mobile/Render after deploying.
