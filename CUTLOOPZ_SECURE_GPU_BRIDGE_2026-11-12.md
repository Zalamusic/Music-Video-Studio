# CutLoopz Render ↔ existing RunPod GPU: Secure connection patch

**Status: Offline source patch and transport tests only. NOT deployed, NOT connected, NO GPU or spending triggered.**

## What is fixed

- The original CutLoopz adapter rejected all non-loopback URLs. The patched adapter retains that safe default while permitting **only** a specifically approved, authenticated HTTPS hostname on port 443 with a strong shared secret.
- All worker paths, including `/health`, media upload, job status, and private MP4 download, require `Authorization: Bearer <secret>` when the worker has `CUTLOOPZ_WORKER_SHARED_TOKEN` configured. Redirects are rejected and the server-side generated URLs have no user-controlled route target.
- The admin-only **Check local engine readiness** button now distinguishes **missing URL**, **bad connection setup**, **worker unreachable**, **worker running but model missing**, and **generation intentionally disabled**. The button does not start production.
- Existing loopback-only, five-second segment/assembly tests remain supported. No customer rendering or payments were enabled.

## Important limitations

1. **This is a secure transport implementation, not a trained video model.** The actual local executable that takes song + photo and produces a real five-second MP4 is not supplied in this ZIP. A visual-only Wan script is NOT a verified singing-performance pipeline.
2. **The RunPod pod is stopped.** This patch cannot contact or verify it until the owner explicitly authorizes restart costs.
3. **HTTPS reachability is still required.** A DNS name/private secured tunnel must be set up on the existing GPU, e.g. Cloudflare Tunnel with a controlled hostname, or Tailscale Funnel with a stable HTTPS hostname. Nothing here creates a tunnel automatically, and no new pod is required. An HTTPS proxy/tunnel may forward to **127.0.0.1:8765 on the pod**, but must never bypass worker bearer authentication. Prefer access controls at the tunnel edge as a second layer.
4. Render free services may use ephemeral storage. Do not rely on Render-local files for durable production/order storage without verifying persisted storage separately.
5. The ready signal currently checks for an executable runner, not whether weights are loaded, whether lip-sync is correct, or whether a full 30-second song is producible.

## Environment configuration — keep all generation switches OFF until verified

In **Render → cutloopz-preview → Environment** (do not post secret values or screenshots showing them):

| Key | Value |
| --- | --- |
| `VIDEO_ADMIN_KEY` | Existing *rotated* Render admin key; don't change again for this patch |
| `CUTLOOPZ_LOCAL_GENERATOR_URL` | `https://YOUR-PRIVATE-APPROVED-HOSTNAME/` |
| `CUTLOOPZ_REMOTE_GENERATOR_HOST` | Exactly `YOUR-PRIVATE-APPROVED-HOSTNAME` (without https:// or slash) |
| `CUTLOOPZ_WORKER_SHARED_TOKEN` | **Separate** randomly generated 48+ character alphanumeric/underscore/hyphen string (same as GPU worker) |
| `CUTLOOPZ_LOCAL_GENERATION_ENABLED` | `false` |
| `CUTLOOPZ_LOCAL_AUTORUN_ENABLED` | `false` |
| `ENABLE_PAID_GENERATION` | `false` |

On the **existing RunPod pod**, for the `cutloopz-local-model-service.mjs` process:

| Key | Value |
| --- | --- |
| `CUTLOOPZ_WORKER_SHARED_TOKEN` | Same secret as the Render worker token (never the admin password) |
| `CUTLOOPZ_WORKER_PORT` | `8765` |
| `CUTLOOPZ_MODEL_ENABLED` | `false` until a real model runner is verified |
| `CUTLOOPZ_MODEL_RUNNER` | Absolute executable path **only after the real audio+photo singing/video model runner exists** |
| `CUTLOOPZ_MODEL_ID` | Honest installed model identifier |

Run the worker behind the tunnel from the GPU at `127.0.0.1:8765`. **Do not** expose a raw public 8765 port, route it without TLS, or start the pod from these instructions. Starting the GPU incurs the rate shown in RunPod; the owner must explicitly authorize spending.

## Readiness sequence (no generating)

1. Stage/push this code on the CutLoopz production-test branch, review tests, and deploy the preview only when approved. Do NOT replace the main production site.
2. Authorize GPU resume only when ready to work on the live model and secure tunnel; the stopped pod was previously shown at $1.79/hour. Confirm the current rate before starting.
3. Set up the chosen HTTPS tunnel to the authenticated loopback worker. **Before** enabling the generation flags, check `GET /api/cutloopz-production/local/status` from the logged-in administrator Studio using **Check local engine readiness**.
4. Expect `connected:false` while GPU is stopped and `connected:true, modelLoaded:false` when the authenticated worker is reachable but model runner is absent.
5. Once the actual model runner exists and has passed a real output validation, verify audio-conditioned singing/video performance. Only then discuss explicitly authorizing a paid 30-second GPU test.

## Offline test

```bash
node --test test-cutloopz-secure-gpu-bridge.mjs test-cutloopz-local-status-diagnostics.mjs test-local-generator-adapter.mjs
```

The tests simulate network calls only. They do **not** contact RunPod, Cloudflare, Tailscale, or any paid provider.
