from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.coldchain import workflow
from app.core.clock import Clock, get_clock
from app.core.rbac import Perm, has_perm, require
from app.db import get_session
from app.models import Incident, User
from app.money import rm_str
from app.schemas import IncidentBrief, ReadingIn, ReadingOut, ReadingResult

router = APIRouter(prefix="/v1", tags=["readings"])


def incident_brief(incident: Incident, viewer: User) -> IncidentBrief:
    see_money = has_perm(viewer.role, Perm.VIEW_MONEY)
    decision = incident.decision or {}
    return IncidentBrief(
        id=incident.id, status=incident.status, severity=incident.severity,
        trigger=incident.trigger, asset_id=incident.asset_id,
        stock_at_risk_rm=rm_str(incident.stock_at_risk_sen) if see_money else None,
        required_role=decision.get("required_role"), reasons=decision.get("reasons", []),
        needs_human=decision.get("needs_human"), created_at=incident.created_at,
    )


@router.post("/readings", response_model=ReadingResult)
def post_reading(body: ReadingIn, user: User = Depends(require(Perm.SUBMIT_READING)),
                 session: Session = Depends(get_session),
                 clock: Clock = Depends(get_clock)) -> ReadingResult:
    """A temperature reading from staff or a sensor. This is the trigger of the whole journey."""
    reading, incident = workflow.process_reading(
        session, asset_id=body.asset_id, temp_c=body.temp_c, source=body.source,
        actor=user, now=clock.now())
    session.commit()
    return ReadingResult(reading=ReadingOut.model_validate(reading, from_attributes=True),
                         incident=incident_brief(incident, user) if incident else None)
