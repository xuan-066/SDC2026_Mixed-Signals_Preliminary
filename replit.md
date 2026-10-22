# SejukGuard project instructions

SejukGuard serves small food businesses. Preserve the Python 3.12 FastAPI/SQLModel
backend, SQLite, existing `/v1` contracts and cold-chain decision/recovery rules.
Do not replace the backend with the Express/Postgres scaffold. The unused
`lib/db`, `lib/api-spec` and generated scaffold clients are not authoritative.

## Run and verify

- `pnpm install --frozen-lockfile`, then `bash scripts/install-python.sh`.
  Python dependencies install into the writable `.pythonlibs` target. Do not use
  `uv sync`: its inferred target can be the read-only Nix system prefix.
- Use the existing managed API and web workflows, not duplicate processes.
- `/` serves the React app; `/v1`, `/api/__clerk`, `/health`, `/docs`,
  `/openapi.json`, `/redoc` are Python routes. Calls are same-origin.
- FastAPI `/openapi.json` is authoritative. Keep web types and the documented
  contracts aligned with Python changes.
- Run backend tests, web typecheck, web tests and web build using the commands
  in README.md. Browser tests and storage instructions are in docs/operations.md.
- Post-merge setup installs dependencies only. It never resets data or runs the
  unused scaffold schema-push commands.

## Accounts and data safety

- Normal mode is the default, with Clerk-verified session cookies. Never trust
  a caller-supplied demo identity in normal mode.
- Application database membership and roles are authoritative; do not use
  provider organizations. One business membership per account for this release.
- New accounts explicitly onboard an empty business or accept a verified,
  intended-recipient invitation. Never automatically attach them to seeded data.
- SQLite remains the product database. The launcher ignores scaffold Postgres
  `DATABASE_URL`; configure `SEJUKGUARD_DATABASE_URL` for the product explicitly.
- Normal storage defaults to `./sejukguard.db`. Explicit demo mode defaults to
  `./sejukguard-demo.db`; never point demo mode or reset scripts at real data.
- Only additive schema upgrades run at startup. Keep historical incident risk
  snapshots intact when changing inventory or recording a transfer.
- Money inputs/storage are integer sen; output amounts are formatted RM strings
  or null for restricted viewers. Redact financial amounts in narrative reasons
  and notifications, too, rather than exposing them through another field.
- Readiness is intentionally blocked for SQLite on Replit published filesystems.
  Do not claim that switching to Reserved VM or setting an acknowledgment makes
  those files durable. Do not migrate databases or publish without user approval.
- External operational messages are a mock outbox, not delivered messages.
  Identity verification/recovery is provider-owned; team invites use copy links.
