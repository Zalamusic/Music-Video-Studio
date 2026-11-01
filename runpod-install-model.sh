
#!/usr/bin/env bash
set -Eeuo pipefail

echo "Zala QI's World — Wan 2.2 Model Setup"

WORKSPACE="/workspace/zala-world"
MODEL_DIR="$WORKSPACE/models/Wan2.2-TI2V-5B"
SOURCE_DIR="$WORKSPACE/Wan2.2"

mkdir -p "$WORKSPACE/models"
mkdir -p "$WORKSPACE/outputs"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: Python 3 is required."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: Git is required."
  exit 1
fi

echo "Checking GPU availability..."

if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi
else
  echo "WARNING: No NVIDIA GPU detected."
fi

echo "Checking model source..."

if [ ! -d "$SOURCE_DIR/.git" ]; then
  git clone \
    https://github.com/Wan-Video/Wan2.2.git \
    "$SOURCE_DIR"
fi

echo "Creating isolated Python environment..."

python3 -m venv "$WORKSPACE/venv"

source "$WORKSPACE/venv/bin/activate"

python -m pip install --upgrade pip

echo "Installing Hugging Face download tools..."

python -m pip install huggingface_hub

echo "Preparation complete."
echo "Wan source: $SOURCE_DIR"
echo "Model destination: $MODEL_DIR"
echo ""
echo "Model weights have NOT been downloaded."
echo "PyTorch and Wan dependencies have NOT been installed."
echo "No video generation has started."
echo ""
echo "Next: verify GPU, CUDA, Python and disk space"
echo "before installing the model dependencies."
