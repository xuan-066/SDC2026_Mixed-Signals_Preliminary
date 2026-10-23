"""Demo-only controls. Only mounted when DEMO_MODE=true (otherwise these paths 404)."""
from fastapi import APIRouter, Depends, Request
from sqlmodel import Session, select

from app.api.v1.views import incident_out
from app.coldchain import scheduler, workflow
from app.core.clock import Clock, get_clock
from app.db import get_session, reset_db
from app.enums import Role
from app.errors import NotFound
from app.models import Asset, User
from app.schemas import AdvanceIn, AdvanceOut, ClockOut, ReadingOut, ResetOut, SensorIn, SensorOut
from app.seed import seed

router = APIRouter(prefix="/v1/sim", tags=["demo"])


@router.get("/clock", response_model=ClockOut)
def current_time(clock: Clock = Depends(get_clock)) -> ClockOut:
    """Read the simulated clock for the demo controls."""
    return ClockOut(now=clock.now())


@router.post("/reset", response_model=ResetOut)
def reset(request: Request) -> ResetOut:
    """Wipe everything, reseed the demo world and put the clock back to 21:00 MYT."""
    engine = request.app.state.engine
    reset_db(engine)
    with Session(engine) as session:
        seed(session)
    clock = request.app.state.clock
    clock.reset()
    return ResetOut(status="reset", now=clock.now())


@router.post("/advance", response_model=AdvanceOut)
def advance(body: AdvanceIn, session: Session = Depends(get_session),
            clock: Clock = Depends(get_clock)) -> AdvanceOut:
    """Move the demo clock forward, then run what is due (e.g. chase a silent vendor)."""
    clock.advance(body.minutes)
    actions = scheduler.run_scheduled_checks(session, clock.now())
    session.commit()
    return AdvanceOut(now=clock.now(), actions=actions)


@router.post("/sensor", response_model=SensorOut)
def sensor(body: SensorIn, session: Session = Depends(get_session),
           clock: Clock = Depends(get_clock)) -> SensorOut:
    """A fake sensor posts a pattern of readings 15 minutes apart (the clock moves with it)."""
    asset = session.get(Asset, body.asset_id)
    if asset is None:
        raise NotFound(f"Asset {body.asset_id} not found")
    # The device reports for its own business, acting as a staff account (staff may submit
    # readings); the result is shown as the owner sees it.
    users = session.exec(select(User).where(User.business_id == asset.business_id)
                         .order_by(User.id)).all()
    device_user = next((u for u in users if u.role == Role.STAFF), users[0])
    owner = next((u for u in users if u.role == Role.OWNER), device_user)

    readings = scheduler.simulate_sensor(session, asset_id=asset.id, pattern=body.pattern,
                                         clock=clock, actor=device_user)
    session.commit()
    incident = workflow.active_incident(session, asset.id)
    return SensorOut(
        now=clock.now(),
        readings=[ReadingOut.model_validate(r, from_attributes=True) for r in readings],
        incident=incident_out(session, incident, owner) if incident else None,
    )

