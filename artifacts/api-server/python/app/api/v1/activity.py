"""Outbox, audit log and metrics."""
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.api.v1.views import audit_event_out, message_out
from app.coldchain.metrics import compute_metrics
from app.core import audit
from app.core.rbac import Perm, require
from app.db import get_session
from app.models import Message, User
from app.schemas import AuditEventOut, MessageOut, MetricsOut

router = APIRouter(prefix="/v1")


@router.get("/messages", response_model=list[MessageOut], tags=["messages"])
def list_messages(to_id: str | None = None, user: User = Depends(require(Perm.VIEW_MESSAGES)),
                  session: Session = Depends(get_session)):
    """The mock WhatsApp outbox, oldest first. Filter with ?to_id=u_rina or ?to_id=v_cooltech."""
    query = select(Message).where(Message.business_id == user.business_id)
    if to_id is not None:
        query = query.where(Message.to_id == to_id)
    return [message_out(m) for m in session.exec(query.order_by(Message.created_at))]


@router.get("/audit", response_model=list[AuditEventOut], tags=["audit"])
def list_audit(entity_id: str | None = None, user: User = Depends(require(Perm.VIEW_AUDIT)),
               session: Session = Depends(get_session)):
    """Activity log, oldest first. ?entity_id=<incident id> gives that incident's whole story."""
    return [audit_event_out(e)
            for e in audit.list_events(session, business_id=user.business_id, entity_id=entity_id)]


@router.get("/metrics", response_model=MetricsOut, tags=["audit"])
def metrics(user: User = Depends(require(Perm.VIEW_METRICS)),
            session: Session = Depends(get_session)):
    """Business-benefit numbers, computed from what actually happened."""
    return compute_metrics(session, user.business_id)
