# SejukGuard operating guide

## Architecture and configuration

The existing FastAPI service remains under `artifacts/api-server/python`.
The web app is `artifacts/sejukguard`. Both run through managed artifact
workflows. API requests are same-origin and include the Clerk session cookie;
normal mode never accepts `X-User-Id`. FastAPI validates the JWT signature,
issuer, expiry, not-before and authorized party, then checks the primary email
against Clerk. Role and active membership are read from SQLite on every request.
Provider/network failure fails closed with a temporary error, not demo access.

Configuration:

| Setting | Meaning |
|---|---|
| `DEMO_MODE` | Defaults false; explicitly true only for an isolated legacy demo |
| `SEJUKGUARD_DATABASE_URL` | Product database override, recommended over managed `DATABASE_URL` |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` | Provisioned by Replit auth setup; never commit or print |
| `VITE_CLERK_PROXY_URL` | Managed production auth proxy URL; empty in development |
| `APP_ORIGINS` | Optional comma-separated exact trusted browser origins for non-Replit hosts |
| `LLM_ENABLED` | Defaults false; deterministic bilingual parser remains functional |
| `SQLITE_PERSISTENT_STORAGE_CONFIRMED` | Required acknowledgment for a **self-hosted** production persistent mount; not a persistence mechanism |

Managed workflows supply `PORT` and `BASE_PATH`. Standalone web builds use root
as their default base. Python serves API routes; the web artifact serves built
static files with SPA rewrites. `/api/__clerk` goes to a fixed Clerk upstream,
not the SPA. The proxy preserves response cookies and supplies Content-Length.
No temporary SQLite database command is used for normal operation.

Normal workspace data survives process restarts at the same file location.
Startup uses additive upgrades (currently archived flags plus new tables), never
drop/reset. Back up before upgrades. Do not run multiple instances against
independent copies of a SQLite file.

## Accounts, invitations and roles

Registration, verified email, sign-in, password recovery, identity profile and
sign-out use Clerk's supported UI. Operational name and phone have separate
application forms. Identity-account settings do not grant business permissions.
Deactivated members retain their identity account but cannot use business APIs.
One membership per identity is supported; there is no business-switching UI.

Owners create an empty business explicitly. Invite colleagues from Team, copy
the one-time link and send it yourself. There is no transactional invitation
email service. Tokens are cryptographically random, stored only as hashes, expire
after seven days and are single-use. The signed-in, verified primary email must
match the intended recipient. Reissue invalidates the old token; listing does
not expose tokens. Ownership cannot be granted by an invitation.

| Action | Staff | Supervisor | Owner |
|---|---|---|---|
| View equipment/incidents; fault report; manual reading; clarify | Yes | Yes | Yes |
| Read own in-app notifications | Yes | Yes | Yes |
| View financial values and vendors | No | Yes | Yes |
| Maintain operational stock; record transfers | No | Yes | Yes |
| Decide approvals | No | Returned capability and current limit | Yes |
| Confirm ETA and complete repair jobs | No | Yes | Yes |
| Create/edit/archive/delete equipment and vendors | No | No | Yes |
| Team, invitations, business settings, ownership transfer | No | No | Yes |
| Business metrics, full audit and external outbox screen | No | No | Yes |

The underlying legacy API still permits supervisors to read the mock outbox,
but not the owner-only Activity screen. No staff financial values are exposed
through stock, decisions, timelines or notification narrative. Role changes and
deactivation affect subsequent requests in an existing identity session.
Ownership transfer atomically makes an active colleague owner and demotes the
caller to supervisor. The active owner cannot simply be removed or demoted.

## Operations, stock and recovery

- Equipment supports aliases, safe limits, warranty vendor/date, capacity,
  real reading history and stock. Missing readings and readings older than
  60 minutes are labelled separately from healthy readings.
- Charts show only the latest 24 stored readings and break gaps over 60 minutes.
  Periodic refresh is every 30 seconds plus window focus, not real-time sensors.
- Manual readings accept only the `staff` source in normal mode. Demo sensors
  remain isolated in explicit demo mode.
- Fault reports use the retained bilingual rules. Unclear equipment opens a
  clarification flow. No backup/no vendor and rejected/unresolved states remain
  visible. After updating vendors, authorized users can reassess an unresolved
  incident without a job or pending approval.
- Approve/reject honors the server's `can_decide` plus fresh server checks;
  lowering the approval limit also restricts an existing pending request.
- Marking a repair done while its latest recent reading is out of range does
  not resolve the incident. A later healthy reading completes recovery.
  The preserved legacy rule resolves if there is no recent reading; operators
  should record a current temperature before completing a repair. This is not
  automatic food-safety certification.
- Transfers are **records of physical moves**: select quantities and a
  same-type destination. Source quantity and destination capacity are checked
  in a serialized transaction; volume moves proportionally. A persisted audit
  event and inventory updates commit together. The optional `Idempotency-Key`
  makes network retries safe; the UI reuses its key after a lost response.
- Stock-line `volume_l` is total occupied volume, not volume per unit.
  Quantities, costs and capacity are validated. Editing stock never rewrites
  the incident's original risk snapshot.
- Financial storage is integer sen. `null` output means restricted, not zero.
  The legacy `stock_protected_rm` metric is labelled **recorded risk on resolved
  incidents**, not savings or proof of stock transfer.
- Equipment with readings, stock, incidents or recommendation references cannot
  be destroyed; archive it after removing stock/resolving active incidents.
  Vendors referenced by warranties, incident decisions or jobs must be archived.
  Safe deletion retains identifying snapshots in the append-only audit.

## Notifications and reminders

In-app notifications are recipient- and tenant-scoped and have unread/read
state and incident links. Existing mock WhatsApp outbox entries remain marked
`whatsapp_mock`. A saved request/chase is **not delivery to the vendor**.
Contact the vendor yourself and record the reply/ETA.

In normal mode the application starts a real-clock periodic worker, independent
of browser traffic. It checks immediately and every 30 seconds, retaining the
existing chase interval and maximum-chase policy. SQLite `BEGIN IMMEDIATE`
claims the due-check transaction before reading counters. Counter, outbox and
audit writes commit together, preventing duplicate chases across overlapping
workers or process restarts. Failures roll back and are logged for retry.
This is a single-instance SQLite deployment model, not distributed scheduling.

## Tests and browser evidence

```sh
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/sejukguard typecheck
pnpm --filter @workspace/sejukguard test
pnpm --filter @workspace/sejukguard build
```

Backend tests use isolated fixtures and do not reset the running database.
They include the retained golden freezer journey, all roles, two-tenant isolation,
verified-session cryptography, onboarding, single-use/expired/reissued invitations,
management CRUD, transfers and concurrent writes, recovery, recipient authorization,
worker claims, additive upgrades and restart persistence.

The Playwright suite uses **real Clerk development accounts and sessions**, not
an authentication bypass. It creates temporary test identities without shared
passwords, obtains development sign-in tickets in memory and deletes those
provider identities afterwards. Do not enable tracing or save browser storage
state containing session cookies.

Before browser tests:
1. Select a separate ignored database file using the development-only
   `SEJUKGUARD_DATABASE_URL` setting, for example an absolute SQLite path inside
   `generated-artifacts/`. Create that directory before restarting the API.
2. Restart the existing API and web workflows. Never run this suite against
   a real-business database; it explicitly creates test businesses and records.
3. Install the browser dependency (`pnpm --filter @workspace/sejukguard exec
   playwright install chromium`). On Nix use the system `chromium` package
   instead when downloaded Chromium is missing shared libraries.
4. Run:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)" \
E2E_BASE_URL="https://$REPLIT_DEV_DOMAIN" E2E_ALLOW_WRITE=true \
pnpm --filter @workspace/sejukguard exec playwright test
```

Use the shared origin, never a service port. On another machine set
`E2E_BASE_URL` to its configured trusted development origin. If no system
Chromium is needed, omit `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
Afterwards remove the development database override and restart the API to return
to normal storage. Browser outputs/screenshots live in ignored
`generated-artifacts/`. No sessions or provider tickets are written there.

The suite verifies authenticated phone/tablet/desktop workflows, actual persisted
mutations, owner/staff/supervisor permissions, invitation acceptance, two-business
isolation, quantities/risk preservation, full repair/recovery, unread/read state,
team deactivation/reactivation and role/ownership changes, settings/profile,
keyboard navigation, offline and session-expiry handling. Screenshots complement
those assertions; loading screenshots or public screenshots alone are not proof.

## Legacy demo

For explicitly isolated demonstrations set `DEMO_MODE=true` and use a separate
SQLite file (`./sejukguard-demo.db` is the default for that mode). Synthetic
seed data, `X-User-Id`, simulated time and `/v1/sim` are available only there.
Use the original scripts under `artifacts/api-server/python` with `PYTHONPATH=.`;
pass the shared origin. `demo_journey.py` resets **that demo database**.
Never run it against data you intend to keep. Real-account onboarding/acceptance
is disabled in demo mode, and startup refuses demo mode against real memberships.
Demo mode is rejected in production.

## Backups and restore (SQLite host with durable storage)

Use SQLite's online backup API, not a plain copy while WAL writes are active:

```sh
python3.12 - /absolute/path/sejukguard.db /secure/backup/sejukguard-backup.db <<'PY'
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as source, sqlite3.connect(sys.argv[2]) as target:
    source.backup(target)
print("Backup completed")
PY
```

Keep encrypted/access-controlled backups off the serving disk; test restore on
an isolated copy. For restore, stop the application, preserve the current file
and its WAL/SHM sidecars, restore a verified backup to a **new filename**, point
the database setting at it, start once, then verify integrity and the business
records. Do not merge an old WAL into the restored file. Never reset as recovery.

## Production readiness: blocked pending a storage decision

Replit's published filesystems are ephemeral, including Reserved VM; redeploying
can discard local SQLite writes. Switching deployment type does not fix this.
References: [publishing troubleshooting](https://docs.replit.com/build/troubleshooting),
[SQL Database](https://docs.replit.com/features/data-and-storage/sql-database),
[App Storage](https://docs.replit.com/features/data-and-storage/object-storage).

The normal published launch no longer creates a disposable temporary database,
but a local path is still **not a durable deployment solution**. Startup rejects
SQLite in a Replit published environment. The existing autoscale deployment
metadata has not been activated or treated as a supported real-business setup.

The owner must explicitly choose and configure either:
- a hosting arrangement with a genuinely persistent SQLite mount, one serving
  instance, tested backups/restore and a verified Clerk production/custom-domain
  configuration; or
- a separately approved database migration to a durable external database,
  followed by migration, authorization and recovery tests.

Do not place a live SQLite database in object storage and pretend it is a mounted
transactional filesystem. Do not set an acknowledgment to bypass the absence of
durable storage. No database replacement, external hosting purchase or publication
was performed. For a self-hosted persistent SQLite deployment, set an absolute
SQLite path, `NODE_ENV=production`, `APP_ORIGINS` and the persistence acknowledgment
only after verifying the mount and single-instance setup.

Remaining integration checklist:
- [ ] Owner-approved durable hosting/storage architecture and restore test.
- [ ] Verified production Clerk keys/proxy/domain and production registration,
      verification/recovery tests. Development accounts do not become live users.
- [ ] Optional chosen operational message/email provider and genuine delivery
      status/retries; none is connected today.
- [ ] Optional authenticated physical-sensor ingestion; no hardware is connected.
- [ ] User approval before any publishing action.
