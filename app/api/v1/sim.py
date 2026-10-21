"""Demo-only controls. Only mounted when DEMO_MODE=true (otherwise these paths 404)."""
from fastapi import APIRouter, Request
from sqlmodel import Session

from app.db import reset_db
from app.seed import seed

router = APIRouter(prefix="/v1/sim", tags=["demo"])


@router.post("/reset")
def reset(request: Request) -> dict:
    """Wipe everything, reseed the demo world and put the clock back to 21:00 MYT."""
    engine = request.app.state.engine
    reset_db(engine)
    with Session(engine) as session:
        seed(session)
    clock = request.app.state.clock
    clock.reset()
    return {"status": "reset", "now": clock.now().isoformat()}
