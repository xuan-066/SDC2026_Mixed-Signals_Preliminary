from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.rbac import get_current_user, permissions_for
from app.db import get_session
from app.models import Business, User
from app.schemas import MeOut

router = APIRouter(prefix="/v1", tags=["me"])


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> MeOut:
    """The logged-in user (from X-User-Id) and what they are allowed to do."""
    business = session.get(Business, user.business_id)
    return MeOut(id=user.id, name=user.name, role=user.role, business_id=user.business_id,
                 business_name=business.name, permissions=permissions_for(user.role))
