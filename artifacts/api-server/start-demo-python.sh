#!/usr/bin/env bash
set -euo pipefail
backend_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
unset SEJUKGUARD_DATABASE_URL
export DEMO_MODE=true
export DATABASE_URL="${DEMO_DATABASE_URL:-sqlite:///./sejukguard-demo.db}"
export PORT="${PORT:-8000}"
exec bash "$backend_dir/start-python.sh"

