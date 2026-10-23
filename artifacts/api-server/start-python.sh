#!/usr/bin/env bash
set -euo pipefail
backend_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
workspace_dir="$(cd "$backend_dir/../.." && pwd)"
# Keep the original working directory: relative SQLite URLs still refer to the
# workspace root, not a newly created database inside the backend artifact.
cd "$workspace_dir"
source "$backend_dir/python-env.sh"
export PYTHONPATH="$backend_dir/python${PYTHONPATH:+:$PYTHONPATH}"
if command -v python3.12 >/dev/null 2>&1; then
  exec python3.12 -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:?PORT must be supplied by the artifact workflow}"
elif command -v py >/dev/null 2>&1; then
  exec py -3.12 -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:?PORT must be supplied by the artifact workflow}"
else
  printf '%s\n' 'Python 3.12 is required. Install Python 3.12 and ensure the py launcher is available.' >&2
  exit 1
fi

