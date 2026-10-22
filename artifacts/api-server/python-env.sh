#!/usr/bin/env bash
# The workspace injects a managed Postgres DATABASE_URL even though this legacy
# application uses SQLite. Keep explicit SQLite URLs; never migrate to scaffold DB.
if [[ -n "${SEJUKGUARD_DATABASE_URL:-}" ]]; then
  export DATABASE_URL="$SEJUKGUARD_DATABASE_URL"
elif [[ "${DATABASE_URL:-}" == postgres* ]]; then
  printf '%s\n' "SejukGuard: ignoring the workspace Postgres setting; retaining the original SQLite default. Use SEJUKGUARD_DATABASE_URL to configure the product database." >&2
  unset DATABASE_URL
fi
