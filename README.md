# Glacier Link
> Glacier Link catches failing freezers in small food businesses early and turns a night-time emergency into one approval tap: it works out what's at risk, picks the technician, and chases the repair to completion.

---

## Team Information

| Field                  | Details                                     |
| ---------------------- | ------------------------------------------- |
| **Team Name**          | Mixed Signals                               |
| **Team Domain**        | Domain 2                                    |
| **SDG Track (1–17)**   | SDG 8 - Decent Work and Economic Growth (targets 8.2, 8.3) |
| **Team Leader**        | Soh Ning Xuan                               |
| **University**         | University of Nottingham Malaysia, University of Southampton Malaysia (UoSM) and Monash University |
| **Number of Members**  | 5                                           |

## Links

| Resource          | Link                                           |
| ----------------- | ---------------------------------------------- |
| GitHub Repository | TODO           |
| Live Demo         | TODO: Replit URL                               |
| RunPod Endpoint   | TODO (not used yet — see [How We Use RunPod](#how-we-use-runpod-required)) |
| Slide Deck        | TODO                                           |
| Demo Video        | TODO                                           |

---

## Overview

### Problem

Small food businesses — bakeries, cafés, frozen-food sellers, mini-marts — keep thousands of ringgit of stock in a few fridges and freezers. When a unit starts failing, nobody notices until stock is already soft. The owner, often at home in the evening, then has to work out which unit it is, what's inside, whether it's under warranty and which technician to call, and then keep chasing them. It's slow, stressful manual work for businesses that can't afford the loss or the lost time.

### Solution

Glacier Link watches temperature readings and staff fault messages. When a unit fails it works out how much stock is at risk and where to move it, picks the right vendor (warranty partner first, then fastest or cheapest), and asks **the right person** to approve the call-out based on cost. Then it dispatches the job, chases the vendor if they don't reply, and logs every step.

Every decision comes from **deterministic rules that explain themselves in plain language**, so owners can trust and check them. AI is used only where it adds value: optionally reading informal Malay/English staff messages ("fz2 tak sejuk, ais cair"), always with a rules fallback.

### Key Features

- **No false alarms** — one warm reading (a door opening) is only watched; two in a row raise a warning, ≥3 °C over or 60 minutes out of range is critical.
- **Explainable decisions** — each incident lists its reasons, e.g. "RM1,850.00 of stock inside → move it to Freezer 1 → CoolTech is fastest → above RM150, owner approval required".
- **People stay in control** — staff, supervisor and owner roles; a supervisor can approve up to RM150, the owner above that; refused attempts are logged.
- **Automatic follow-up** — vendors are chased after 60 minutes without a reply; recovery is only recorded once the unit is back in range.
- **Staff messages** — "Freezer 2 tak sejuk" opens the same journey; unclear messages get a "Which unit?" reply.
- **Business administration** — real sign-in, team invitations, equipment, stock, vendors and transfers, with each business's data isolated.
- **Activity log and metrics** — every step is on record; detection-to-dispatch time and stock protected are measured, not typed in.

### Tech Stack

| Layer         | Technology |
| ------------- | ---------- |
| Frontend      | React, TypeScript, Vite, Tailwind CSS, Radix UI, TanStack Query, Recharts |
| Backend       | Python 3.12, FastAPI, Pydantic, Uvicorn |
| Database      | SQLite via SQLModel / SQLAlchemy |
| Identity      | Clerk (verified email sign-in) |
| AI            | Anthropic Claude API (optional message parser, off by default) |
| Testing / CI  | pytest, Vitest, Playwright, GitHub Actions |
| Hosting / Dev | Replit |

---

## Project Structure

```
.
├── artifacts/
│   ├── api-server/
│   │   ├── python/              # FastAPI backend (the product's source of truth)
│   │   │   ├── app/
│   │   │   │   ├── coldchain/   # Decision rules, workflow, scheduler, parser, metrics
│   │   │   │   ├── core/        # Reusable blocks: roles, approvals, audit log, notifier, clock, identity
│   │   │   │   └── api/v1/      # REST endpoints
│   │   │   ├── tests/           # pytest suite incl. the golden demo journey
│   │   │   └── scripts/         # demo_journey.py, try_rules.py, eval_parser.py
│   │   └── start-python.sh      # How Replit starts the backend
│   └── sejukguard/              # React web app (pages, components, e2e tests)
├── docs/                        # Build plan, web contract, operations guide
├── scripts/                     # Workspace setup (install-python.sh, post-merge.sh)
├── lib/                         # Workspace scaffold packages (not authoritative)
├── .migration-backup/           # Snapshot of the backend before the web-app port
├── .replit                      # Replit workflows and deployment configuration
├── LICENSE
└── README.md
```

### Architecture

```
  Owner / Supervisor / Staff (phone or laptop)
                   │ HTTPS
        ┌──────────▼──────────┐       ┌─────────────────┐
        │  React web app       │◄─────►│ Clerk (sign-in) │
        └──────────┬──────────┘       └─────────────────┘
                   │ REST /v1 (JSON)
        ┌──────────▼──────────────────────────────────────┐
        │  FastAPI backend                                 │
        │  Trigger → Connected data → Decision rules       │
        │        → Human approval → Dispatch & chase       │
        │  Message parser ──(optional)──► Claude API       │
        └──────┬───────────────────────────────┬──────────┘
               │                               │
        ┌──────▼───────┐               ┌───────▼──────────────┐
        │ SQLite        │               │ Notification outbox  │
        │ database      │               │ (mock WhatsApp)      │
        └──────────────┘               └──────────────────────┘
```

---

## How to Run

### Option 1 — Run on Replit (Recommended)

1. Import this repository via **Create App → Import from GitHub**.
2. Open **Secrets** and add `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (needed for real sign-in). See `artifacts/api-server/python/.env.example` for optional settings.
3. In the Shell:
   ```sh
   pnpm install --frozen-lockfile
   bash scripts/install-python.sh
   ```
4. Start the **artifacts/api-server: API Server** and **artifacts/sejukguard: web** workflows, then open the web preview at `/`. The API docs are at `/docs`.

**Normal mode** (default) uses real accounts: sign up, verify your email, then create a business or accept an invitation.

**Demo mode** loads a fictional bakery (Seri Pagi Bakery & Café), a simulated clock and four demo logins (Rina — owner, Daniel — supervisor, Aina — staff, Lim — owner of a second business). Set `DEMO_MODE=true` and use a separate database file; never point demo mode at real data. Details: [docs/operations.md](docs/operations.md) → *Legacy demo*.

### Option 2 — Run the backend locally

```bash
# 1. Clone the repository
git clone https://github.com/xuan-066/test-2.git
cd test-2/artifacts/api-server/python

# 2. Create and activate a virtual environment (Python 3.12)
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start in demo mode
DEMO_MODE=true uvicorn app.main:app --reload     # Windows PowerShell: $env:DEMO_MODE="true"; uvicorn app.main:app --reload
# then open http://127.0.0.1:8000/docs

# 5. In a second terminal: run the whole demo journey (✅ per step)
python scripts/demo_journey.py
```

### Run Tests

```bash
pnpm --filter @workspace/api-server test       # backend (pytest)
pnpm --filter @workspace/sejukguard typecheck
pnpm --filter @workspace/sejukguard test       # web unit tests
pnpm --filter @workspace/sejukguard build
```

Backend only: `cd artifacts/api-server/python && pytest -q`. The suite includes `test_golden_journey.py`, the full demo as one test. Authenticated browser tests are described in [docs/operations.md](docs/operations.md).

---

## How We Use Replit *(Required)*

- **Development:** the team develops in a shared Replit workspace, with the Replit Agent assisting on the web-app port and configuration.
- **Workflows:** the `.replit` file defines the backend and web services and runs backend tests, web type-checks, web tests and the build as validation workflows.
- **Secrets:** Clerk keys (and the optional Claude API key) are stored in Replit Secrets, never in the code.
- **Hosting:** TODO — confirm the deployment. Publishing is currently blocked on purpose because Replit's published filesystem is not durable for SQLite (see *Readiness* below).

📄 Proof of use: TODO [`submission/SDC2026_MixedSignals_Replit_POU.pdf`](submission/SDC2026_MixedSignals_Replit_POU.pdf)

## How We Use RunPod *(Required)*

TODO — RunPod is not used in the current build. Describe the planned use here once decided, or remove this section if it is not required.

📄 Proof of use: TODO [`submission/SDC2026_MixedSignals_Runpod_POU.pdf`](submission/SDC2026_MixedSignals_Runpod_POU.pdf)


## Challenges & Learnings

- **Rules before AI.** Money, approvals and vendor choice had to be explainable and testable, so we kept them deterministic and used AI only for reading messy staff messages, always with a fallback.
- **Testing the demo itself.** Turning the whole demo script into one automated test caught real bugs, including readings posted in the same simulated minute being ordered randomly.
- **Deployment surprises.** Replit's preview, port and database settings each broke publishing once; logging the database type at startup made the last one quick to diagnose.
- **Demo vs. real product.** Real sign-in and real data needed different safety rules than the fictional demo, so the two modes are kept strictly separate.

## Future Improvements
- [ ] Durable hosted database for real business deployments
- [ ] Re-decide vendor and approver when severity rises; suggest the next vendor after 2 unanswered chases
- [ ] Make a user interface (UI) more organized, streamline the layout by reducing clutter, grouping related items, and establishing a clear visual hierarchy.

## Team

| Name          | Role             | GitHub |
| ------------- | ---------------- | ------ |
| Soh Ning Xuan | Team Lead — TODO | TODO   |
| Yap En Qi          | Backend / AI          | [@enqii27](https://github.com/enqii27) |
| TODO          | Frontend         | TODO   |
| TODO          | Demo Testing / AI             | @xr-ye   |
| TODO          | TODO             | TODO   |

---

## Submission Checklist

- [x] Team name, domain (Domain 1 / Domain 2) and SDG track filled in
- [ ] Slide deck link added
- [ ] Demo video link added
- [ ] Replit used, with proof of use in `submission/`
- [ ] RunPod used, with proof of use in `submission/`
- [ ] Preliminary submission completed (`SDC2026_MixedSignals_Preliminary.pdf`) *confirm the pdf name 
- [ ] Technology declaration completed (`SDC2026_MixedSignals_TechDeclaration.pdf`)*confirm the pdf name 
- [ ] Submission files renamed with your team name (replace `TeamName`)
- [ ] "How to Run" steps verified
- [ ] No API keys or secrets committed to the repository

## License

This project is licensed under the [Apache License 2.0](LICENSE).
