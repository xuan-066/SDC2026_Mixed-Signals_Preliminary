from fastapi import APIRouter, Depends, Request
from sqlmodel import Session, select

from app.api.v1.views import incident_out
from app.coldchain import report_flow
from app.core.clock import Clock, get_clock
from app.core.rbac import Perm, get_owned, require
from app.db import get_session
from app.enums import IncidentStatus
from app.models import Incident, User
from app.schemas import ClarifyIn, IncidentOut, ReportIn, ReportResult

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


@router.post("/incidents/{incident_id}/clarify", response_model=IncidentOut)
def clarify(incident_id: str, body: ClarifyIn, user: User = Depends(require(Perm.SUBMIT_READING)),
            session: Session = Depends(get_session), clock: Clock = Depends(get_clock)):
    """[S] Answer "which unit?" for a NEEDS_INFO report; the journey continues from there."""
    incident = report_flow.clarify_incident(session, incident_id=incident_id,
                                            asset_id=body.asset_id, user=user, now=clock.now())
    session.commit()
    return incident_out(session, incident, user)


def _llm(request: Request):
    """The Anthropic client when LLM_ENABLED=true, else None (rules only)."""
    settings = request.app.state.settings
    if not settings.llm_enabled:
        return None, None
    if getattr(request.app.state, "llm_client", None) is None:
        import anthropic
        request.app.state.llm_client = anthropic.Anthropic()
    return request.app.state.llm_client, settings.llm_model


@router.post("/reports", response_model=ReportResult, tags=["reports"])
def post_report(body: ReportIn, request: Request,
                user: User = Depends(require(Perm.SUBMIT_READING)),
                session: Session = Depends(get_session), clock: Clock = Depends(get_clock)):
    """[S] A staff message like "fz2 tak sejuk, ais dah cair" opens the same journey as a
    bad reading. If the unit isn't clear, staff are asked "Which unit?" first."""
    client, model = _llm(request)
    incident, parsed, source = report_flow.process_report(
        session, text=body.text, reporter=user, now=clock.now(), llm_client=client, llm_model=model)
    session.commit()
    return ReportResult(incident=incident_out(session, incident, user), parsed=parsed,
                        parser_source=source)
