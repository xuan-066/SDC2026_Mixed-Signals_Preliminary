from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.v1.views import incident_out
from app.coldchain import workflow
from app.core.clock import Clock, get_clock
from app.core.rbac import Perm, require
from app.db import get_session
from app.models import User
from app.schemas import ReadingIn, ReadingOut, ReadingResult

router = APIRouter(prefix="/v1", tags=["readings"])


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
                         incident=incident_out(session, incident, user) if incident else None)
