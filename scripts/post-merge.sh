#!/bin/bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
pnpm install --frozen-lockfile
bash scripts/install-python.sh
# SejukGuard retains SQLite. Never push the unused scaffold Postgres schema.
