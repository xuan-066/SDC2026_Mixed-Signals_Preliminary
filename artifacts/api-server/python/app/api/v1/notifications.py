from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.api.v1.accounts import now
from app.core.rbac import get_current_user
from app.core.rbac import has_perm, Perm
import re
from app.db import get_session
from app.errors import NotFound
from app.models import Notification, User

router = APIRouter(prefix="/v1/notifications", tags=["notifications"])


def notification_out(item, user):
    body = item.body if has_perm(user.role, Perm.VIEW_MONEY) else re.sub(r"RM\s*[\d,.]+", "[restricted]", item.body)
    return {"id": item.id, "body": body, "incident_id": item.incident_id,
            "created_at": item.created_at, "read_at": item.read_at, "delivery": "in_app"}


@router.get("")
def list_notifications(user: User = Depends(get_current_user),
                       session: Session = Depends(get_session)):
    return [notification_out(n, user) for n in session.exec(select(Notification).where(
        Notification.business_id == user.business_id, Notification.user_id == user.id)
        .order_by(Notification.created_at.desc()))]


@router.post("/{notification_id}/read")
def read_notification(notification_id: str, user: User = Depends(get_current_user),
                      session: Session = Depends(get_session)):
    item = session.get(Notification, notification_id)
    if item is None or item.business_id != user.business_id or item.user_id != user.id:
        raise NotFound("Notification not found")
    item.read_at = item.read_at or now()
    session.add(item)
    session.commit()
    return {"id": item.id, "read_at": item.read_at}
