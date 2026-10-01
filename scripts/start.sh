#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -x .venv/bin/python || { echo "Run ./scripts/setup.sh first."; exit 1; }
exec .venv/bin/python scripts/start.py
