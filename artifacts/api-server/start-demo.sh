#!/usr/bin/env bash
set -euo pipefail
backend_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
workspace_dir="$(cd "$backend_dir/../.." && pwd)"
cd "$workspace_dir"
export PYTHONPATH="$backend_dir/python${PYTHONPATH:+:$PYTHONPATH}"
exec python3.12 -m uvicorn app.demo:app --host 0.0.0.0 --port "${PORT:?PORT must be supplied by the artifact workflow}"
