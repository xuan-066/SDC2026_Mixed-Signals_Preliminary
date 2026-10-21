from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.api.v1.views import incident_out
from app.core.rbac import Perm, get_owned, require
from app.db import get_session
from app.enums import IncidentStatus
from app.models import Incident, User
from app.schemas import IncidentOut

router = APIRouter(prefix="/v1", tags=["incidents"])


@router.get("/incidents", response_model=list[IncidentOut])
def list_incidents(status: IncidentStatus | None = None,
                   user: User = Depends(require(Perm.VIEW_OPERATIONS)),
                   session: Session = Depends(get_session)):
    """Newest first. Filter with ?status=PENDING_APPROVAL etc."""
    query = select(Incident).where(Incident.business_id == user.business_id)
    if status is not None:
        query = query.where(Incident.status == status)
    return [incident_out(session, i, user)
            for i in session.exec(query.order_by(Incident.created_at.desc()))]


@router.get("/incidents/{incident_id}", response_model=IncidentOut)
def get_incident(incident_id: str, user: User = Depends(require(Perm.VIEW_OPERATIONS)),
                 session: Session = Depends(get_session)):
    """Full detail: reasons, RM at risk, approval, job and timeline (plan §10)."""
    return incident_out(session, get_owned(session, Incident, incident_id, user), user)
