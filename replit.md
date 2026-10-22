# SejukGuard

Cold-chain and equipment guardian for small food businesses. All demo data is synthetic.

## Migration scope

Preserve the Python 3.12 FastAPI/SQLModel application, SQLite, `/v1` routes,
simulated demo behavior and optional LLM parser. Do not replace these with the
Express/Postgres scaffold. The customer frontend is separate follow-up work;
this foundation deliberately retains the existing API-documentation landing.

## Run & routing

- Install workspace dependencies with `pnpm install --frozen-lockfile` and Python
  dependencies with `bash scripts/install-python.sh`. This exports the frozen
  `uv.lock` and installs explicitly into Replit's writable `.pythonlibs` user site;
  do not use `uv sync`, which can resolve to the read-only Nix system prefix here.
- Start the managed `artifacts/api-server: API Server` workflow. It runs the
  original Python app using `artifacts/api-server/start-python.sh`, not Express.
- Start `artifacts/sejukguard: web` for the registered React/TypeScript frontend.
- The shared proxy sends `/v1`, `/health`, `/docs`, `/openapi.json` and `/redoc`
  directly to Python; `/` goes to the web artifact and immediately opens `/docs`,
  matching the original landing behavior. No Vite API proxy is needed.
- `/docs` is the original interactive FastAPI Swagger UI, including simulated
  `X-User-Id` header authentication. `/redoc` is also retained.
- Regression suite: `pnpm --filter @workspace/api-server test`. Tests use isolated
  in-memory SQLite fixtures; they do not reset the running database.
- Full original product/API instructions and demo scripts live under
  `artifacts/api-server/python/`. Run Python utility scripts from that directory
  with `PYTHONPATH=.`; pass the shared preview origin as their base URL when needed.
  `demo_journey.py` explicitly resets demo data, so do not run it against data you
  intend to keep.

## Data & environment

- Application source, requirements, tests and demo scripts were copied unchanged
  from the previous project. The backup remains available in `.migration-backup`.
- The server launches with the workspace root as its working directory to preserve
  the original default `sqlite:///./sejukguard.db` location. No existing database
  file was present in this checkout at migration time. Startup retains the original
  create-if-missing and seed-if-empty behavior; it does not reset existing data.
- `DATABASE_URL`, `DEMO_MODE`, `LLM_ENABLED`, `LLM_MODEL` and optional
  `ANTHROPIC_API_KEY` retain their original meanings. See the Python `.env.example`.
  The default is demo mode on and LLM off. No new credentials are required.
- The scaffold automatically supplies a Postgres `DATABASE_URL`. The launch/test
  adapter explicitly ignores that with a warning to preserve SQLite. Existing
  SQLite `DATABASE_URL` values are honored unchanged. Use `SEJUKGUARD_DATABASE_URL`
  to configure the product database independently of the managed scaffold value;
  all other app environment settings pass through unchanged.
- Python requirements remain pinned in `artifacts/api-server/python/requirements.txt`
  and the root `pyproject.toml`/`uv.lock` support repeatable workspace installation.
- `lib/db`, `lib/api-spec` and the generated client packages are unused scaffold,
  not the application's database or authoritative contract. FastAPI's
  `/openapi.json` remains the authoritative live API contract. Do not run DB push.
- Post-merge setup installs dependencies only; it never resets or migrates data.
