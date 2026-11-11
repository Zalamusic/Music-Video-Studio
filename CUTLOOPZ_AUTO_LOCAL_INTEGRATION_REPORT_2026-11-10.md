# CutLoopz Media — local full-job automation engineering update

Date: November 10, 2026
Input baseline: `CutLoopz_Production_Repaired_Verified_2026-11-10.zip`
Mode: source changes and zero-charge offline tests ONLY

## Implemented in this update

1. Added `cutloopz-local-auto-runner.mjs`: one explicitly approved admin action steps through a full local job, polls the model, stops on uncertain status or missing model, and assembles when all clips are ready. No external paid provider calls and no auto-start on deploy or process restart.
2. Added administrator-protected `POST /local/jobs/:id/auto-run` and `GET /local/jobs/:id/automation`, under `/api/cutloopz-production`. The automation endpoint is gated by `CUTLOOPZ_LOCAL_AUTORUN_ENABLED=true` (OFF by default) and exact `confirmLocalFullJob=yes`. Existing local-generator gate and administrator key remain mandatory.
3. Updated the admin Studio to include a single full-job button, local 9:16/16:9 selector, progress polling, and disabled manual controls while automation runs. A standalone local job still requires the administrator to create the job first and then approve its full run.
4. Preserved portrait orientation through the coordinator and generator adapter. Fixed FFmpeg assembly to use 360×640 for portrait or 640×360 for widescreen.
5. Added actual media signature checks in the worker and preserved MP3/WAV and JPG/PNG/WebP extensions for the runner. Worker executable readiness now also checks executable access; runner contract adds `--format`.
6. Updated CI workflows to keep automatic generation explicitly off during all startup/integration tests.

## Verified locally

- `node --test test-*.mjs`: **36 passed, 0 failed**.
- 30-second synthetic video pipeline through real HTTP multipart transport, six sequential mock requests and MP4 downloads, FFmpeg assembly, original audio, 360×640 portrait output, 30-second runtime, and receipt marked *not authorized for customer delivery*.
- Automatic runner tests cover six-clip sequence, failure without retry, no-model rejection, duplicate-start prevention, and disabled or missing approval request rejection.
- All inline browser scripts parse in the static test. A fresh live-browser smoke test was attempted but the browser environment blocked local navigation (`ERR_BLOCKED_BY_ADMINISTRATOR`), so it is **not** recorded as passed.

## Not yet verified / launch blockers

- No actual GPU model weights or executable runner supplied by this repository. Its apparent model health alone is NOT proof of singing, motion, identity, or video quality.
- Existing Render-to-RunPod connection is not established or verified. This code's adapter intentionally requires loopback; a GPU on a separate host needs a secure operator-approved connection.
- Customer Studio is preview-only. Paid-order automation, customer ownership and delivery are NOT implemented end-to-end.
- External-provider clip advancement still requires per-clip approval; these changes affect the independent local path only.
- Duration remains 15–360 seconds in 5-second increments (precise arbitrary lengths such as 3:46 remain a later release blocker).
- We did not connect, start, resume, rent or run a GPU; install packages on a GPU; spend money; modify GitHub; or deploy to Render.

## Operator checkpoints before a real 30-second test

1. Safely confirm the current RunPod instance state, without creating or renting a new pod.
2. Confirm an actual singing-capable runner, required model weights and GPU resources, including `--format` input support.
3. Establish a secure private route from the server to the worker, then verify transport without generating video.
4. Operator-enable the local gates and explicitly approve a single 30-second generation. Review the resulting performance privately before any customer release.
