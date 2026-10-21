"""Append-only activity log. There are deliberately no update or delete functions (plan §14)."""
from datetime import datetime

from sqlmodel import Session, select

from app.models import AuditEvent


def record(session: Session, *, business_id: str, actor_id: str, action: str,
           entity_type: str, entity_id: str, at: datetime,
           details: dict | None = None) -> AuditEvent:
    """Add an event to the caller's transaction. The caller commits, together with the
    state change it describes, so the log and the data can never disagree."""
    event = AuditEvent(business_id=business_id, at=at, actor_id=actor_id, action=action,
                       entity_type=entity_type, entity_id=entity_id, details=details or {})
    session.add(event)
    session.flush()             # assigns the autoincrement id
    return event


def list_events(session: Session, *, business_id: str,
                entity_id: str | None = None) -> list[AuditEvent]:
    """Oldest first."""
    query = select(AuditEvent).where(AuditEvent.business_id == business_id)
    if entity_id is not None:
        query = query.where(AuditEvent.entity_id == entity_id)
    return list(session.exec(query.order_by(AuditEvent.at, AuditEvent.id)))
