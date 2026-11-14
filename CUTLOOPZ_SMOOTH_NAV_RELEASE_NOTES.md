# CutLoopz smooth-navigation finishing pass (2026-11-14)

- No longer flashes the Sign In form to already signed-in artists while `My Profile` session loads. Branded loading panel is shown instead; failed/guest sessions receive the right login or signup form.
- Removed duplicated floating Home script from account page and unnecessary `#home` fragment on the floating shortcut.
- Studio Back/Next step navigation aligns its target after the new step renders and scrolls smoothly (unless reduced motion is preferred); cancels superseded scroll operations.
- Prevents wizard content scroll anchoring from shifting the viewport while a step is replaced.
- Saved artist music/social links are labeled with recognizable platform names on My Profile and artist public pages, with unknown hosts identified by their real hostnames. HTTPS-only link validation stays in place.
- No routes, authentication rules, account data, video models, payments, GPU configuration, or draft-storage contracts were changed.
- Automated validation is not a substitute for on-device visual and back/forward browser testing.
