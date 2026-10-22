#!/usr/bin/env bash
# Replit's Python uses .pythonlibs as its user site, not a virtual environment.
# Never let uv sync infer a target from sys.prefix: that is the read-only Nix store.
set -euo pipefail
workspace_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$workspace_dir"
target="$workspace_dir/.pythonlibs/lib/python3.12/site-packages"
uv export --frozen --no-dev --no-emit-project --format requirements-txt |
  uv pip install --python python3.12 --target "$target" --requirements -
