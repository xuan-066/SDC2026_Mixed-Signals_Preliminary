#!/bin/bash
set -e
pnpm install --frozen-lockfile
uv sync --frozen
# SejukGuard retains SQLite. Never push the unused scaffold Postgres schema.
