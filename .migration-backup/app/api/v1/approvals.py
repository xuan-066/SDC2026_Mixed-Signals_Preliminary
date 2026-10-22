from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.api.v1.views import approval_out, incident_out
from app.core import approvals
from app.core.clock import Clock, get_clock
from app.core.rbac import Perm, require
from app.db import get_session
from app.enums import ApprovalStatus
from app.models import ApprovalRequest, Incident, User
from app.schemas import ApprovalOut, ApprovalResult, ApproveIn, RejectIn

router = APIRouter(prefix="/v1/approvals", tags=["approvals"])


@router.get("", response_model=list[ApprovalOut])
def list_approvals(status: ApprovalStatus | None = None,
                   user: User = Depends(require(Perm.DECIDE_APPROVAL)),
                   session: Session = Depends(get_session)):
    """Approval cards. `can_decide` says whether *this* user may approve it (amount limit)."""
    query = select(ApprovalRequest).where(ApprovalRequest.business_id == user.business_id)
    if status is not None:
        query = query.where(ApprovalRequest.status == status)
    return [approval_out(session, a, user)
            for a in session.exec(query.order_by(ApprovalRequest.created_at.desc()))]


def _decide(approval_id: str, approve: bool, note: str | None, user: User,
            session: Session, clock: Clock) -> ApprovalResult:
    approval = approvals.decide(session, approval_id=approval_id, user=user, approve=approve,
                                note=note, at=clock.now())
    session.commit()
    incident = (session.get(Incident, approval.subject_id)
                if approval.subject_type == "incident" else None)
    return ApprovalResult(approval=approval_out(session, approval, user),
                          incident=incident_out(session, incident, user) if incident else None)


@router.post("/{approval_id}/approve", response_model=ApprovalResult)
def approve(approval_id: str, body: ApproveIn | None = None,
            user: User = Depends(require(Perm.DECIDE_APPROVAL)),
            session: Session = Depends(get_session), clock: Clock = Depends(get_clock)):
    """Approve the call-out. Above the supervisor limit only the owner may (403 otherwise, logged)."""
    return _decide(approval_id, True, body.note if body else None, user, session, clock)


@router.post("/{approval_id}/reject", response_model=ApprovalResult)
def reject(approval_id: str, body: RejectIn,
           user: User = Depends(require(Perm.DECIDE_APPROVAL)),
           session: Session = Depends(get_session), clock: Clock = Depends(get_clock)):
    """Reject with a reason; staff are told it."""
    return _decide(approval_id, False, body.note, user, session, clock)
