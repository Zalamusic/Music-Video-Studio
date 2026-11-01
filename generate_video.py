
#!/usr/bin/env python3

"""
Zala QI's World
Wan 2.2 TI2V-5B Video Generator

Generates a short image-to-video clip using
the official Wan 2.2 inference program.

Requires a configured NVIDIA GPU, installed
dependencies, and downloaded model weights.
"""

import argparse
import ipaddress
import os
import socket
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

from pathlib import Path
from urllib.parse import urlparse


WORKSPACE = Path(
    os.environ.get(
        "ZALA_WORKSPACE",
        "/workspace/zala-world"
    )
)

WAN_DIR = Path(
    os.environ.get(
        "ZALA_WAN_SOURCE_DIR",
        str(WORKSPACE / "Wan2.2")
    )
)

MODEL_DIR = Path(
    os.environ.get(
        "ZALA_WAN_MODEL_DIR",
        str(WORKSPACE / "models" / "Wan2.2-TI2V-5B")
    )
)

MAX_SECONDS = 5
MAX_IMAGE_BYTES = 10 * 1024 * 1024


def download_image(url, destination):
    parsed = urlparse(url)

    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
    ):
        raise ValueError(
            "A standard HTTPS image URL is required."
        )

    allowed_hosts = {
        host.strip().lower()
        for host in os.environ.get(
            "ZALA_ALLOWED_IMAGE_HOSTS", ""
        ).split(",")
        if host.strip()
    }

    hostname = parsed.hostname.lower()

    if not allowed_hosts or hostname not in allowed_hosts:
        raise ValueError(
            "Image host is not approved. Configure "
            "ZALA_ALLOWED_IMAGE_HOSTS with your trusted "
            "image storage hostname."
        )

    addresses = socket.getaddrinfo(
        hostname, 443, type=socket.SOCK_STREAM
    )

    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])

        if not ip.is_global:
            raise ValueError(
                "Private or restricted image address."
            )

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    opener = urllib.request.build_opener(NoRedirect())

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ZalaWorldVideoEngine/1.0",
            "Accept": "image/jpeg,image/png,image/webp"
        }
    )

    with opener.open(request, timeout=30) as response:
        content_type = response.headers.get(
            "Content-Type", ""
        ).split(";")[0].strip().lower()

        if content_type not in (
            "image/jpeg",
            "image/png",
            "image/webp"
        ):
            raise ValueError(
                "Unsupported image content type."
            )

        data = response.read(MAX_IMAGE_BYTES + 1)

        if len(data) > MAX_IMAGE_BYTES:
            raise ValueError(
                "Image exceeds the 10 MB limit."
            )

        if not data:
            raise ValueError("Image is empty.")

    from PIL import Image

    import io

    with Image.open(io.BytesIO(data)) as image:
        image.verify()

    with Image.open(io.BytesIO(data)) as image:
        image = image.convert("RGB")
        image.save(destination, format="JPEG")


def main():
    parser = argparse.ArgumentParser(
        description="Zala QI's World Wan Video Generator"
    )

    parser.add_argument("--prompt", required=True)
    parser.add_argument("--seconds", type=int, required=True)
    parser.add_argument(
        "--format",
        choices=["vertical", "landscape"],
        required=True
    )
    parser.add_argument("--image-url", required=True)
    parser.add_argument("--output", required=True)

    args = parser.parse_args()

    if not args.prompt.strip() or len(args.prompt) > 2000:
        parser.error("Invalid video prompt.")

    if not 1 <= args.seconds <= MAX_SECONDS:
        parser.error(
            "Initial GPU testing supports 1–5 seconds."
        )

    output = Path(args.output).resolve()

    if output.suffix.lower() != ".mp4":
        parser.error("Output must be an MP4 file.")

    if os.environ.get(
        "ZALA_GPU_GENERATION_ENABLED"
    ) != "true":
        print(
            "GPU generation is disabled.",
            file=sys.stderr
        )
        return 2

    wan_script = WAN_DIR / "generate.py"

    if not wan_script.is_file():
        print(
            "Official Wan generation script is missing.",
            file=sys.stderr
        )
        return 2

    if not MODEL_DIR.is_dir() or not any(
        MODEL_DIR.iterdir()
    ):
        print(
            "Wan model weights are missing.",
            file=sys.stderr
        )
        return 2

    try:
        import torch

        if not torch.cuda.is_available():
            print(
                "No CUDA GPU is available.",
                file=sys.stderr
            )
            return 2

    except ImportError:
        print(
            "PyTorch is not installed.",
            file=sys.stderr
        )
        return 2

    # Wan requires frame counts in the form 4n+1.
    # Initial test clips are capped at 121 frames.
    frames = min(
        121,
        4 * round(args.seconds * 24 / 4) + 1
    )

    # Wan's TI2V image-to-video output aspect ratio
    # follows the uploaded reference image.
    size = "704*1280" if args.format == "vertical" \
        else "1280*704"

    output.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    with tempfile.TemporaryDirectory(
        prefix="zala-wan-"
    ) as temp_dir:

        image_path = Path(temp_dir) / "reference.jpg"

        print("Preparing artist reference image...")
        download_image(args.image_url, image_path)

        command = [
            sys.executable,
            str(wan_script),
            "--task", "ti2v-5B",
            "--size", size,
            "--ckpt_dir", str(MODEL_DIR),
            "--offload_model", "True",
            "--convert_model_dtype",
            "--t5_cpu",
            "--frame_num", str(frames),
            "--image", str(image_path),
            "--prompt", args.prompt.strip(),
            "--save_file", str(output)
        ]

        print("Starting Wan 2.2 generation...")
        print("Frames:", frames)
        print("Output:", output)

        subprocess.run(
            command,
            cwd=str(WAN_DIR),
            check=True,
            timeout=25 * 60
        )

    if not output.is_file():
        raise RuntimeError(
            "Wan completed without producing a video."
        )

    if output.stat().st_size < 1024:
        raise RuntimeError(
            "Wan produced an invalid video."
        )

    print("Video generation completed.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(
            "Generation failed:",
            str(error),
            file=sys.stderr
        )
        sys.exit(1)
