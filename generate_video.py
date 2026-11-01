
#!/usr/bin/env python3

"""
Zala QI's World
Wan 2.2 TI2V-5B Video Generator

Prepares a reference image locally and generates
a short image-to-video clip using official Wan 2.2.

Requires NVIDIA CUDA, model weights, and installed
Wan dependencies. No FAL services are used.
"""

import argparse
import io
import ipaddress
import os
import socket
import subprocess
import sys
import tempfile
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
        str(WORKSPACE / "models/Wan2.2-TI2V-5B")
    )
)

MAX_SECONDS = 5
MAX_IMAGE_BYTES = 10 * 1024 * 1024

IMAGE_SIZES = {
    "vertical": (704, 1280),
    "landscape": (1280, 704)
}


def download_image(url, destination, video_format):
    from PIL import Image, ImageOps, UnidentifiedImageError

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
            "ZALA_ALLOWED_IMAGE_HOSTS."
        )

    addresses = socket.getaddrinfo(
        hostname,
        443,
        type=socket.SOCK_STREAM
    )

    if not addresses:
        raise ValueError(
            "Could not resolve image hostname."
        )

    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])

        if not ip.is_global:
            raise ValueError(
                "Private or restricted image address."
            )

    class NoRedirect(
        urllib.request.HTTPRedirectHandler
    ):
        def redirect_request(self, *args, **kwargs):
            return None

    opener = urllib.request.build_opener(
        NoRedirect()
    )

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ZalaWorldVideoEngine/1.0",
            "Accept": "image/jpeg,image/png,image/webp"
        }
    )

    with opener.open(
        request,
        timeout=30
    ) as response:

        content_type = (
            response.headers.get(
                "Content-Type", ""
            ).split(";")[0].strip().lower()
        )

        if content_type not in (
            "image/jpeg",
            "image/png",
            "image/webp"
        ):
            raise ValueError(
                "Unsupported image content type."
            )

        data = response.read(
            MAX_IMAGE_BYTES + 1
        )

        if not data:
            raise ValueError(
                "Reference image is empty."
            )

        if len(data) > MAX_IMAGE_BYTES:
            raise ValueError(
                "Image exceeds the 10 MB limit."
            )

    target_size = IMAGE_SIZES[video_format]

    try:
        with Image.open(io.BytesIO(data)) as image:
            image.verify()

        with Image.open(io.BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image)
            image = image.convert("RGB")

            # Fit the image to the requested orientation
            # without stretching faces or body proportions.
            # A blurred background fills unused space,
            # preserving the entire reference photograph.
            background = ImageOps.fit(
                image,
                target_size,
                method=Image.Resampling.LANCZOS
            )

            from PIL import ImageFilter

            background = background.filter(
                ImageFilter.GaussianBlur(radius=35)
            )

            foreground = ImageOps.contain(
                image,
                target_size,
                method=Image.Resampling.LANCZOS
            )

            x = (
                target_size[0] - foreground.width
            ) // 2

            y = (
                target_size[1] - foreground.height
            ) // 2

            background.paste(
                foreground,
                (x, y)
            )

            background.save(
                destination,
                format="JPEG",
                quality=95,
                optimize=True
            )

    except (
        UnidentifiedImageError,
        OSError,
        ValueError
    ) as error:
        raise ValueError(
            "Could not prepare reference image."
        ) from error


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Zala QI's World Wan Video Generator"
        )
    )

    parser.add_argument(
        "--prompt",
        required=True
    )

    parser.add_argument(
        "--seconds",
        type=int,
        required=True
    )

    parser.add_argument(
        "--format",
        choices=[
            "vertical",
            "landscape"
        ],
        required=True
    )

    parser.add_argument(
        "--image-url",
        required=True
    )

    parser.add_argument(
        "--output",
        required=True
    )

    args = parser.parse_args()

    if (
        not args.prompt.strip()
        or len(args.prompt) > 2000
    ):
        parser.error(
            "Invalid video prompt."
        )

    if not 1 <= args.seconds <= MAX_SECONDS:
        parser.error(
            "Testing supports 1–5 second clips."
        )

    output = Path(
        args.output
    ).resolve()

    if output.suffix.lower() != ".mp4":
        parser.error(
            "Output must be an MP4 file."
        )

    if (
        os.environ.get(
            "ZALA_GPU_GENERATION_ENABLED"
        ) != "true"
    ):
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

    if (
        not MODEL_DIR.is_dir()
        or not any(MODEL_DIR.iterdir())
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

    # Wan uses frame counts of 4n + 1.
    frames = min(
        121,
        4 * round(
            args.seconds * 24 / 4
        ) + 1
    )

    size = (
        "704*1280"
        if args.format == "vertical"
        else "1280*704"
    )

    output.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    with tempfile.TemporaryDirectory(
        prefix="zala-wan-"
    ) as temp_dir:

        image_path = (
            Path(temp_dir) / "reference.jpg"
        )

        print(
            "Preparing artist reference image..."
        )

        download_image(
            args.image_url,
            image_path,
            args.format
        )

        command = [
            sys.executable,
            str(wan_script),
            "--task",
            "ti2v-5B",
            "--size",
            size,
            "--ckpt_dir",
            str(MODEL_DIR),
            "--offload_model",
            "True",
            "--convert_model_dtype",
            "--t5_cpu",
            "--frame_num",
            str(frames),
            "--image",
            str(image_path),
            "--prompt",
            args.prompt.strip(),
            "--save_file",
            str(output)
        ]

        print(
            "Starting Wan 2.2 generation..."
        )

        print(
            "Frames:",
            frames
        )

        print(
            "Output:",
            output
        )

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

    print(
        "Video generation completed."
    )

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
