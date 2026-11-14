# CutLoopz Free Evaluator — Two Exclusive Source Tabs

Release scope: user-interface and source-selection behavior only. This release does not deploy the website, enable paid generation, start RunPod, or change checkout.

- Free Song Evaluation now presents **Song Link** and **MP3 / WAV** side by side as accessible, keyboard-operable tabs.
- Selecting Song Link displays only its link input, source status, and an honest explanation that the streaming link is not audio analysis.
- Selecting MP3 / WAV displays only the authorized audio upload and Free Beat Analysis control with existing estimated tempo/duration/energy outputs.
- Switching tabs preserves the text of both source inputs and the artist's lyrics and creative notes while invalidating analysis and storyboard output from the other source.
- The selected source is saved in the draft and reflected in the page URL to restore the chosen tab after a refresh.
- Song-link-only evaluation never treats a previously selected, inactive MP3 as analyzed audio. MP3 evaluation does not treat the inactive link as the song being analyzed.
- Video creation remains separate in the existing **Create Video** navigation and production Studio. No new audio download or third-party ripping capability was added.

Verification: 103 node:test .mjs tests passed; phone-width in-memory Chromium check passed for exclusive visibility, switching, lyric preservation, file selection, mocked beat result, and no JS errors. A network-navigated live mobile test is still required after deployment.

Installation: upload this full project ZIP to GitHub branch `cutloopz-production-test`. Point the existing Install CutLoopz Release workflow's `archive = Path(...)` line to the uploaded ZIP's exact name, then commit that one workflow change. Confirm GitHub Actions success and the subsequent Render `cutloopz-preview` deployment before live testing.
