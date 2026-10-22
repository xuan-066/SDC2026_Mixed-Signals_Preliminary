# Running SejukGuard on Replit

Use the **Run** button to start the FastAPI server from `app.main:app` with the
documented SQLite database. The Replit preview opens the API landing page; use
`/docs` for the interactive API and `/health` to check server status.

The app seeds its synthetic demo data on first startup. No API key is required
for the default rules-based parser. Claude-powered parsing is optional and
requires `ANTHROPIC_API_KEY` in Replit Secrets with `LLM_ENABLED=true`.

To run the server manually:

```bash
DATABASE_URL=sqlite:///./sejukguard.db uvicorn app.main:app --host 0.0.0.0 --port 5000
```

## Publishing

- The publish command in `.replit` sets `DATABASE_URL=sqlite:////tmp/sejukguard.db` itself.
  This is deliberate: the demo data is synthetic and reseeds on startup, so no managed
  PostgreSQL database is needed. Replit's own `DATABASE_URL` is ignored when publishing.
- Publish as a **single instance** (Reserved VM, or Autoscale with max 1 instance). The demo
  clock lives in the app's memory; with several instances, `/v1/sim/advance` and the other
  requests can land on different copies and the demo breaks.
- Data resets whenever the published app restarts. Run `POST /v1/sim/reset` before every demo.

To run the tests with the same database configuration:

```bash
DATABASE_URL=sqlite:///./sejukguard.db pytest -q
```
