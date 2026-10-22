"""Roles and permissions (plan §9). Login is simulated with the X-User-Id header."""
from enum import StrEnum
from typing import TypeVar

from fastapi import Depends, Header, Request
from sqlmodel import Session, SQLModel

from app.db import get_session
from app.enums import Role
from app.errors import Forbidden, NotFound, Unauthorized
from app.models import User, Identity
from app.core.identity import verified_principal

ROLE_RANK = {Role.STAFF: 1, Role.SUPERVISOR: 2, Role.OWNER: 3}


class Perm(StrEnum):
    SUBMIT_READING = "submit_reading"        # also [S] report fault / clarify
    VIEW_OPERATIONS = "view_operations"      # assets, incidents, decision reasons
    VIEW_MONEY = "view_money"                # RM values; staff see null
    VIEW_VENDORS = "view_vendors"
    VIEW_MESSAGES = "view_messages"
    DECIDE_APPROVAL = "decide_approval"      # the amount limit is checked in core/approvals
    MANAGE_JOBS = "manage_jobs"              # confirm / complete on the vendor's behalf
    VIEW_AUDIT = "view_audit"
    VIEW_METRICS = "view_metrics"
    MANAGE_EQUIPMENT = "manage_equipment"
    MANAGE_STOCK = "manage_stock"
    MANAGE_VENDORS = "manage_vendors"
    MANAGE_TEAM = "manage_team"
    MANAGE_SETTINGS = "manage_settings"


# Minimum role per permission (one row of §9 each).
PERMISSIONS: dict[Perm, Role] = {
    Perm.SUBMIT_READING: Role.STAFF,
    Perm.VIEW_OPERATIONS: Role.STAFF,
    Perm.VIEW_MONEY: Role.SUPERVISOR,
    Perm.VIEW_VENDORS: Role.SUPERVISOR,
    Perm.VIEW_MESSAGES: Role.SUPERVISOR,
    Perm.DECIDE_APPROVAL: Role.SUPERVISOR,
    Perm.MANAGE_JOBS: Role.SUPERVISOR,
    Perm.VIEW_AUDIT: Role.OWNER,
    Perm.VIEW_METRICS: Role.OWNER,
    Perm.MANAGE_EQUIPMENT: Role.OWNER,
    Perm.MANAGE_STOCK: Role.SUPERVISOR,
    Perm.MANAGE_VENDORS: Role.OWNER,
    Perm.MANAGE_TEAM: Role.OWNER,
    Perm.MANAGE_SETTINGS: Role.OWNER,
}


def role_at_least(role: Role, minimum: Role) -> bool:
    return ROLE_RANK[role] >= ROLE_RANK[minimum]


def has_perm(role: Role, perm: Perm) -> bool:
    return role_at_least(role, PERMISSIONS[perm])


def permissions_for(role: Role) -> list[Perm]:
    return [p for p in Perm if has_perm(role, p)]


def get_current_user(
    request: Request,
    x_user_id: str | None = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    """Identity is verified in normal mode; membership is reloaded every request."""
    if not request.app.state.settings.demo_mode:
        if x_user_id:
            raise Unauthorized("Demo identity headers are disabled")
        principal = verified_principal(request)
        identity = session.get(Identity, principal.subject)
        if identity is None:
            raise Forbidden("Business onboarding required")
        if not identity.active:
            raise Forbidden("Your business membership is inactive. Contact the owner.")
        user = session.get(User, identity.user_id)
        if user is None:
            raise Unauthorized("Membership not found")
        return user
    if not x_user_id:
        raise Unauthorized("Missing X-User-Id header")
    user = session.get(User, x_user_id)
    if user is None:
        raise Unauthorized(f"Unknown user {x_user_id}")
    return user


def require(perm: Perm):
    """Dependency factory: `user: User = Depends(require(Perm.VIEW_AUDIT))` → 403 if role too low."""
    def _dependency(user: User = Depends(get_current_user)) -> User:
        if not has_perm(user.role, perm):
            raise Forbidden(f"{PERMISSIONS[perm].value.capitalize()} role required")
        return user
    return _dependency


M = TypeVar("M", bound=SQLModel)


def get_owned(session: Session, model: type[M], id: str, user: User) -> M:
    """Load a row of the user's own business. Another business's row is a 404, never a 403,
    so the API doesn't reveal that it exists."""
    row = session.get(model, id)
    if row is None or getattr(row, "business_id", None) != user.business_id:
        raise NotFound(f"{model.__name__} {id} not found")
    return row
