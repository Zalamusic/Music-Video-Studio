#!/usr/bin/env python3
"""CutLoopz visual-only Wan 2.2 adapter. Not a singing-performance model.

Does not use audio for performance. Only use as a non-singing visual test. Not suitable for paid customer generation or vocal-sync tests.
"""
import argparse
import os
from pathlib import Path
import subprocess
import sys


def build_command(args):
    if args.seconds != 5 or args.start < 0 or args.start > 355 or args.start % 5:
        raise ValueError("Only aligned five-second visual clips supported")
    for name in ("song", "photo"):
        p = Path(getattr(args, name)).resolve(strict=True)
        if not p.is_file() or p.stat().st_size == 0:
            raise ValueError(f"Invalid {name} input")
    output = Path(args.output).resolve()
    if output.suffix.lower() != ".mp4":
        raise ValueError("Output must be MP4")
    generator = Path(os.environ.get("CUTLOOPZ_WAN_GENERATOR", str(Path(__file__).with_name("generate_video.py")))).resolve(strict=True)
    if not generator.is_file():
        raise ValueError("Wan generator missing")
    prompt = os.environ.get("CUTLOOPZ_VISUAL_PROMPT", "Cinematic close-up of the artist, subtle natural movement, realistic lighting")
    if len(prompt) > 2000 or not prompt.strip():
        raise ValueError("Invalid prompt")
    return [sys.executable, str(generator), "--prompt", prompt, "--seconds", "5", "--format", os.environ.get("CUTLOOPZ_VIDEO_FORMAT", "landscape"), "--image-file", str(Path(args.photo).resolve()), "--output", str(output)]


def main():
    parser = argparse.ArgumentParser()
    for flag in ("song", "photo", "start", "seconds", "output"):
        parser.add_argument("--" + flag, required=True, type=int if flag in ("start", "seconds") else str)
    args = parser.parse_args()
    try:
        command = build_command(args)
        result = subprocess.run(command, check=False, timeout=28 * 60)
        return result.returncode
    except (ValueError, OSError, subprocess.TimeoutExpired) as exc:
        print(str(exc), file=sys.stderr)
        return 2

if __name__ == "__main__":
    sys.exit(main())
