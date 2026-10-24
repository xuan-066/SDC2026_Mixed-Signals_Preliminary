#!/usr/bin/env bash
set -euo pipefail
backend_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
workspace_dir="$(cd "$backend_dir/../.." && pwd)"
# Keep the original working directory: relative SQLite URLs still refer to the
# workspace root, not a newly created database inside the backend artifact.
cd "$workspace_dir"
source "$backend_dir/python-env.sh"
export PYTHONPATH="$backend_dir/python${PYTHONPATH:+:$PYTHONPATH}"
exec python3.12 -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:?PORT must be supplied by the artifact workflow}"
