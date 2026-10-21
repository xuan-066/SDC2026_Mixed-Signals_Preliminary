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

To run the tests with the same database configuration:

```bash
DATABASE_URL=sqlite:///./sejukguard.db pytest -q
```
