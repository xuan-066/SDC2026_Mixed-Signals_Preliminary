from datetime import UTC

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.v1.views import incident_out, job_out
from app.coldchain import workflow
from app.core.clock import Clock, get_clock
from app.core.rbac import Perm, require
from app.db import get_session
from app.models import Incident, User
from app.schemas import ConfirmIn, JobResult

router = APIRouter(prefix="/v1/jobs", tags=["jobs"])


def _result(session: Session, job, user: User) -> JobResult:
    return JobResult(job=job_out(session, job),
                     incident=incident_out(session, session.get(Incident, job.incident_id), user))


@router.post("/{job_id}/confirm", response_model=JobResult)
def confirm(job_id: str, body: ConfirmIn | None = None,
            user: User = Depends(require(Perm.MANAGE_JOBS)),
            session: Session = Depends(get_session), clock: Clock = Depends(get_clock)):
    """The vendor's reply (entered on their behalf in the demo)."""
    eta = body.eta if body else None
    if eta is not None and eta.tzinfo is None:
        eta = eta.replace(tzinfo=UTC)
    job = workflow.confirm_job(session, job_id=job_id, eta=eta, user=user, now=clock.now())
    session.commit()
    return _result(session, job, user)


@router.post("/{job_id}/complete", response_model=JobResult)
def complete(job_id: str, user: User = Depends(require(Perm.MANAGE_JOBS)),
             session: Session = Depends(get_session), clock: Clock = Depends(get_clock)):
    """Technician finished. Resolves the incident unless the unit is still warm."""
    job = workflow.complete_job(session, job_id=job_id, user=user, now=clock.now())
    session.commit()
    return _result(session, job, user)
