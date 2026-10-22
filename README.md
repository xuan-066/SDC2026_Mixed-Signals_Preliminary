# SejukGuard

A responsive cold-chain response application for small Malaysian food businesses.
React/TypeScript is the frontend; the retained Python FastAPI/SQLModel service and
SQLite database own identity mapping, business permissions and operational rules.

## Run in this workspace

```sh
pnpm install --frozen-lockfile
bash scripts/install-python.sh
```

Start the managed **artifacts/api-server: API Server** and
**artifacts/sejukguard: web** workflows, then open the web preview at `/`.
The shared proxy routes `/v1`, `/api/__clerk`, `/health`, `/docs`, `/openapi.json`
and `/redoc` to Python. `/docs` is the authoritative API contract, not the scaffold
Express client. Do not run scaffold database-push commands or replace SQLite.

Clerk is configured for development. Create and verify an account through the
app, then explicitly create an empty business or open an owner's invitation link.
Signing up never grants access to a demo business. Each account has one membership.
Account email, password recovery and identity security belong to Clerk; business
roles and operational profile details belong to SejukGuard.

Normal mode is the default: real clock, no automatic synthetic records, no demo
identity headers or simulation/reset routes. SQLite defaults to `./sejukguard.db`.
`SEJUKGUARD_DATABASE_URL` overrides the managed scaffold database address.

## Verify

```sh
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/sejukguard typecheck
pnpm --filter @workspace/sejukguard test
pnpm --filter @workspace/sejukguard build
```

The backend suite includes the original 200 regressions and new accounts,
permissions, isolation, invitation, CRUD, transfer/concurrency, signature, worker
and persistence checks. See [operations](docs/operations.md) for **authenticated
browser tests**, prerequisites, role matrix, reminders, backups and the legacy demo.

## Readiness and honest boundaries

- In-app notifications and copy-link invitations work. WhatsApp/Telegram/SMS and
  business-invitation email are **not connected**; the external outbox is mock.
- Clerk handles identity verification/recovery email, not operational delivery.
- Transfers record actual item quantities and volume, atomically. A recommendation
  or resolved incident is **not proof that stock moved or was saved**.
- Missing/stale readings are explicit; temperature history uses real readings and
  breaks gaps over an hour. No sensor installation or automatic food-safety
  certification is claimed.
- Data survives application-process restarts on the same SQLite storage. **The
  app is not production-ready on Replit's ephemeral deployment filesystem.**
  Publishing is blocked for SQLite on Replit. A durable-storage/hosting decision
  and configuration need the owner's explicit approval; no provider replacement
  or publishing has been performed.
