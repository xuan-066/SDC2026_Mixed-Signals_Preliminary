"""Generic approval requests, routed by amount (plan §8.3, §9).

Domain packs register a handler per subject_type; it runs when a request is decided.
"""
from collections.abc import Callable
from datetime import datetime

from sqlmodel import Session

from app.core import audit
from app.core.rbac import role_at_least
from app.enums import ApprovalStatus, Role
from app.errors import Conflict, Forbidden, NotFound
from app.models import ApprovalRequest, User
from app.money import rm_label

Handler = Callable[[Session, ApprovalRequest, User, datetime], None]
_handlers: dict[str, Handler] = {}


def register_handler(subject_type: str, fn: Handler) -> None:
    _handlers[subject_type] = fn


def _log(session: Session, approval: ApprovalRequest, *, action: str, actor_id: str,
         at: datetime, **details) -> None:
    audit.record(session, business_id=approval.business_id, actor_id=actor_id, action=action,
                 entity_type="approval", entity_id=approval.id, at=at,
                 details={"subject_type": approval.subject_type, "subject_id": approval.subject_id,
                          "amount_sen": approval.amount_sen,
                          "required_role": approval.required_role.value, **details})


def create_request(session: Session, *, business_id: str, subject_type: str, subject_id: str,
                   action: str, amount_sen: int, required_role: Role,
                   at: datetime) -> ApprovalRequest:
    """PENDING request + APPROVAL_REQUESTED. The caller commits."""
    approval = ApprovalRequest(business_id=business_id, subject_type=subject_type,
                               subject_id=subject_id, action=action, amount_sen=amount_sen,
                               required_role=required_role, created_at=at)
    session.add(approval)
    _log(session, approval, action="APPROVAL_REQUESTED", actor_id="system", at=at)
    return approval


def decide(session: Session, *, approval_id: str, user: User, approve: bool,
           note: str | None, at: datetime) -> ApprovalRequest:
    approval = session.get(ApprovalRequest, approval_id)
    if approval is None or approval.business_id != user.business_id:
        raise NotFound(f"Approval {approval_id} not found")

    if not role_at_least(user.role, approval.required_role):
        # The refusal itself is evidence, so it is saved even though the request fails.
        _log(session, approval, action="APPROVAL_FORBIDDEN", actor_id=user.id, at=at,
             user_role=user.role.value)
        session.commit()
        raise Forbidden(f"{approval.required_role.value.capitalize()} approval required "
                        f"for {rm_label(approval.amount_sen)}")

    if approval.status != ApprovalStatus.PENDING:
        raise Conflict(f"Approval {approval_id} is already {approval.status.value}")

    approval.status = ApprovalStatus.APPROVED if approve else ApprovalStatus.REJECTED
    approval.decided_by = user.id
    approval.decided_at = at
    approval.note = note
    session.add(approval)
    _log(session, approval, action=approval.status.value, actor_id=user.id, at=at, note=note)

    handler = _handlers.get(approval.subject_type)
    if handler is not None:
        handler(session, approval, user, at)
    return approval
