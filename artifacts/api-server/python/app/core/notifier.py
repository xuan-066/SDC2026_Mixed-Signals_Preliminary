"""Mock WhatsApp: messages go to an outbox table instead of a real phone."""
from datetime import datetime

from sqlmodel import Session

from app.core import audit
from app.models import Message, Notification, User, Identity
from sqlmodel import select


def send(session: Session, *, business_id: str, to_type: str, to_id: str, body: str,
         at: datetime, incident_id: str | None = None) -> Message:
    """Write an outbox row plus a MESSAGE_SENT audit event. The caller commits."""
    message = Message(business_id=business_id, to_type=to_type, to_id=to_id, body=body,
                      incident_id=incident_id, created_at=at)
    session.add(message)
    if to_type == "user":
        recipient = session.get(User, to_id)
        identity = session.exec(select(Identity).where(Identity.user_id == to_id)).first()
        if recipient and recipient.business_id == business_id and (identity is None or identity.active):
            session.add(Notification(business_id=business_id, user_id=to_id, body=body,
                                     incident_id=incident_id, created_at=at))
    audit.record(session, business_id=business_id, actor_id="system", action="MESSAGE_SENT",
                 entity_type="message", entity_id=message.id, at=at,
                 details={"to_type": to_type, "to": to_id, "incident_id": incident_id})
    return message
