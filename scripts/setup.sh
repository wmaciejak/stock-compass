#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
PYTHON_BIN="${STOCK_COMPASS_PYTHON:-python3.12}"
command -v "$PYTHON_BIN" >/dev/null || { echo "Install Python 3.12 (for example: brew install python@3.12), then rerun."; exit 1; }
command -v npm >/dev/null || { echo "Install Node.js 20 or later, then rerun."; exit 1; }
"$PYTHON_BIN" -m venv .venv
.venv/bin/python -m pip install --only-binary=ta-lib -r requirements.lock
npm ci --prefix frontend --package-lock=true --registry=https://registry.npmjs.org
npm run build --prefix frontend
echo "Ready. Run ./scripts/start.sh and open http://127.0.0.1:8765"
