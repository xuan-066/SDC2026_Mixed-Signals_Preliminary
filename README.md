# SejukGuard workspace

The existing Python 3.12 FastAPI/SQLModel service is retained under
[`artifacts/api-server/python`](artifacts/api-server/python). Its requirements,
tests, demo scripts, SQLite engine and `/v1` API are unchanged.

## Run on Replit

1. Install dependencies: `pnpm install --frozen-lockfile` and `uv sync --frozen`.
2. Start **artifacts/api-server: API Server** and **artifacts/sejukguard: web**
   using the managed workflows.
3. Open the web preview. `/` opens the original Swagger documentation at `/docs`.
   `/health` returns `{"status":"ok"}`.

The shared proxy forwards `/v1/*`, `/health`, `/docs`, `/openapi.json` and `/redoc`
to the Python service. The separate React/TypeScript artifact owns `/`; it is
only a frontend foundation at this stage, not a new customer application.
Python receives its port from the managed workflow and runs from the workspace
root, preserving the default SQLite location `./sejukguard.db`.

## Verify

```bash
pnpm --filter @workspace/api-server test
```

This runs the existing regression suite with isolated in-memory SQLite databases.
For HTTP checks, use the shared preview origin (or `http://localhost:80` in the
workspace), not a service port.

Environment behavior is unchanged: `DEMO_MODE=true`, `LLM_ENABLED=false` by default;
`DATABASE_URL`, `LLM_MODEL` and the optional Anthropic credential remain supported.
See [run and data notes](replit.md) and the
[original product documentation](artifacts/api-server/python/README.md).
Do not run the scaffold database push commands: the product still uses SQLite.
The launch adapter warns and ignores the scaffold's automatic Postgres address.
Existing SQLite `DATABASE_URL` settings still work; `SEJUKGUARD_DATABASE_URL` can
override the workspace-managed address without changing the Python application.
