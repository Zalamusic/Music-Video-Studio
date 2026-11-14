# CutLoopz Creator Profile Simplification

- Removed Profile Photo URL field from the artist profile form.
- Removed associated client-side field handling, validation, API persistence, public API exposure, directory remote-image rendering, and avatar-image CSS.
- Older profiles with a photoUrl property are still readable, but the public directory does not expose the URL; the next artist profile save replaces it with the current photo-free schema.
- Artist bio, genres, platforms, artist website, social links, and offsite video links remain unchanged. No videos are hosted in the Creator Directory.
- Studio artist reference photo upload for private video generation is **unchanged**; this change only affects public Creator Directory profile photo URLs.
- The change is not deployed until GitHub and Render apply the new release.
