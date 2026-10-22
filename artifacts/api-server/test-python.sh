#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/python-env.sh"
cd "$(dirname "${BASH_SOURCE[0]}")/python"
exec python3.12 -m pytest -q "$@"
