
#!/usr/bin/env bash
set -Eeuo pipefail

echo "Preparing Zala QI's World GPU environment..."

WORKSPACE="${ZALA_WORKSPACE:-/workspace/zala-world}"

mkdir -p "$WORKSPACE/models"
mkdir -p "$WORKSPACE/outputs"
mkdir -p "$WORKSPACE/logs"

echo "Checking GPU..."
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi
else
  echo "No NVIDIA GPU detected yet."
fi

echo "Checking Python..."
if command -v python3 >/dev/null 2>&1; then
  python3 --version
else
  echo "Python 3 must be installed before model setup."
fi

echo "Workspace prepared: $WORKSPACE"
echo "No model downloaded or GPU generation started."
