# SejukGuard

Cold-chain and equipment guardian for small food businesses (SDC2026 · Mixed Signals · Preliminary round).
When a freezer starts failing, SejukGuard works out what's at risk, where to move the stock, which
technician to call and who must approve it, then dispatches, chases and logs every step.
The build plan is in [docs/plan.md](docs/plan.md). All data in this project is synthetic.

## Run

```bash
python -m venv .venv
# Windows:      .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
pytest -q                            # includes the golden demo journey
uvicorn app.main:app --reload        # then open http://127.0.0.1:8000/docs
```

Simulated login: send the header `X-User-Id` as one of `u_aina` (staff), `u_daniel` (supervisor),
`u_rina` (owner), or `u_lim` (owner of a second business).

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./sejukguard.db` | Where data is kept |
| `DEMO_MODE` | `true` | Enables `/v1/sim/*` (reset, advance clock, fake sensor) and the simulated clock |
| `LLM_ENABLED` | `false` | Parse staff messages with Claude, falling back to the rules parser |
| `LLM_MODEL` | `claude-opus-5-5` | Model for the parser |
| `ANTHROPIC_API_KEY` | – | Only when `LLM_ENABLED=true`. Put it in Replit **Secrets**, never in git |

## Deploy (Replit)

1. Replit → **Create App → Import from GitHub** → this repo. `.replit` installs the requirements and starts uvicorn.
2. **Run**, then open `<dev-url>/health` → `{"status":"ok"}`.
3. For a URL that stays up for the UI team and judges: **Deploy → Autoscale** (`<name>.replit.app`).
   The dev URL (`.replit.dev`) only works while the workspace is open.
4. After every merge: Git tab → **Pull** → **Run** → **Redeploy** → `POST /v1/sim/reset`.

Alternative host: a Render free web service with start command
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Free instances sleep when idle: open the URL
5 minutes before judging.

## Demo

The golden journey (plan §19) — Freezer 2 fails at 9 pm, RM1,850 of stock at risk:

```bash
python scripts/demo_journey.py --base-url https://<your-app>.replit.app          # ✅ per step
python scripts/demo_journey.py --base-url https://<your-app>.replit.app --pause  # Enter between steps
```

It resets the demo data first. Exit code 0 means every step passed.

**Fallbacks on the day**, in order: the UI → Swagger `/docs` → `scripts/demo_journey.py` →
the same script against a local `uvicorn` on a phone hotspot → the recorded video.

Useful scripts:

| Script | What it shows |
|---|---|
| `scripts/demo_journey.py` | The whole demo against any server |
| `scripts/try_rules.py` | The decision rules on Freezer 2, no server needed |
| `scripts/peek_db.py` | What's in the local database |
| `scripts/eval_parser.py tests/data/fault_messages.csv [--llm]` | Staff-message parser accuracy (rules vs Claude); `--llm` uses the API |
