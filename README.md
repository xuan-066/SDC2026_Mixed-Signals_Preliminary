# SejukGuard

Cold-chain and equipment guardian for small food businesses (SDC2026 · Mixed Signals · Preliminary round).
The build plan is in [docs/plan.md](docs/plan.md).

## Run locally

```bash
python -m venv .venv
# Windows:      .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
pytest -q
uvicorn app.main:app --reload      # then open http://127.0.0.1:8000/docs
```

Configuration is read from environment variables; see `.env.example`.
All data in this project is synthetic.
