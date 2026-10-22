"""Explicit empty-business onboarding and recipient-bound, single-use invitations."""
import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from app.api.v1.me import me
from app.core import audit
from app.core.identity import Principal, verified_principal, authenticate
from app.core.rbac import Perm, get_current_user, get_owned, require
from app.db import get_session
from app.enums import Role
from app.errors import Conflict, Forbidden, InvalidInput, NotFound
from app.models import Business, Identity, Invitation, User, new_id

router = APIRouter(prefix="/v1", tags=["accounts"])


def now():
    return datetime.now(UTC)


class BusinessIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: str = Field(min_length=1, max_length=80)

    @field_validator("name", "kind")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("must not be blank")
        return value.strip()


class SettingsIn(BusinessIn):
    supervisor_limit_sen: int = Field(ge=0, le=100_000_000)


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=40)


class InviteIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    role: Literal["staff", "supervisor"]

    @field_validator("email")
    @classmethod
    def email_address(cls, value):
        value = value.strip().lower()
        if value.count("@") != 1 or "." not in value.split("@")[1] or any(c.isspace() for c in value):
            raise ValueError("a valid recipient email is required")
        return value


class AcceptIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class MemberIn(BaseModel):
    role: Literal["staff", "supervisor"]
    active: bool


def log(session, user, action, entity_type, entity_id):
    audit.record(session, business_id=user.business_id, actor_id=user.id,
                 action=action, entity_type=entity_type, entity_id=entity_id, at=now())


@router.get("/access")
def access(request: Request, session: Session = Depends(get_session)):
    if request.app.state.settings.demo_mode:
        return {"mode": "demo", "authenticated": False, "member": False,
                "demo_users": [{"id": u.id, "name": u.name, "role": u.role}
                               for u in session.exec(select(User))]}
    if not request.cookies.get("__session"):
        return {"mode": "normal", "authenticated": False, "member": False}
    principal = authenticate(request)
    identity = session.get(Identity, principal.subject)
    return {"mode": "normal", "authenticated": True, "member": identity is not None,
            "email": principal.email, "verified": principal.verified,
            "inactive": bool(identity and not identity.active)}


def create_member(session, principal, business_id, role):
    if session.get(Identity, principal.subject):
        raise Conflict("One business membership per account is supported. Use your existing business.")
    user = User(id=new_id("user"), business_id=business_id, name=principal.name,
                phone="", role=role)
    session.add(user)
    session.flush()
    session.add(Identity(subject=principal.subject, user_id=user.id, email=principal.email))
    session.flush()
    return user


@router.post("/onboarding")
def onboarding(body: BusinessIn, request: Request, principal: Principal = Depends(verified_principal),
               session: Session = Depends(get_session)):
    if request.app.state.settings.demo_mode:
        raise Forbidden("Business registration is disabled in isolated demo mode")
    if session.get(Identity, principal.subject):
        raise Conflict("This account already belongs to one business")
    # An outstanding invitation must be explicitly accepted, not bypassed into a
    # synthetic membership. Creating a separate business is an explicit owner action.
    business = Business(id=new_id("business"), name=body.name, kind=body.kind)
    session.add(business)
    session.flush()
    user = create_member(session, principal, business.id, Role.OWNER)
    log(session, user, "BUSINESS_CREATED", "business", business.id)
    session.commit()
    return me(user, session)


@router.get("/profile")
def profile(user: User = Depends(get_current_user)):
    return {"name": user.name, "phone": user.phone}


@router.put("/profile")
def update_profile(body: ProfileIn, user: User = Depends(get_current_user),
                   session: Session = Depends(get_session)):
    if not body.name.strip():
        raise InvalidInput("Name must not be blank")
    user.name, user.phone = body.name.strip(), body.phone.strip()
    session.add(user)
    log(session, user, "PROFILE_UPDATED", "user", user.id)
    session.commit()
    return profile(user)


@router.get("/settings")
def settings(user: User = Depends(require(Perm.MANAGE_SETTINGS)),
             session: Session = Depends(get_session)):
    return session.get(Business, user.business_id)


@router.put("/settings")
def update_settings(body: SettingsIn, user: User = Depends(require(Perm.MANAGE_SETTINGS)),
                    session: Session = Depends(get_session)):
    business = session.get(Business, user.business_id)
    for key, value in body.model_dump().items():
        setattr(business, key, value)
    session.add(business)
    log(session, user, "BUSINESS_UPDATED", "business", business.id)
    session.commit()
    return business


def member_out(session, user):
    identity = session.exec(select(Identity).where(Identity.user_id == user.id)).first()
    return {"id": user.id, "name": user.name, "role": user.role,
            "active": identity.active if identity else True,
            "email": identity.email if identity else None}


@router.get("/team")
def team(user: User = Depends(require(Perm.MANAGE_TEAM)),
         session: Session = Depends(get_session)):
    return [member_out(session, u) for u in session.exec(
        select(User).where(User.business_id == user.business_id).order_by(User.name))]


@router.put("/team/{member_id}")
def update_member(member_id: str, body: MemberIn,
                  user: User = Depends(require(Perm.MANAGE_TEAM)),
                  session: Session = Depends(get_session)):
    member = get_owned(session, User, member_id, user)
    if member.role == Role.OWNER:
        raise Conflict("Use ownership transfer before changing an owner's access")
    identity = session.exec(select(Identity).where(Identity.user_id == member.id)).first()
    if not identity and not body.active:
        raise Conflict("Demo members cannot be deactivated")
    member.role = Role(body.role)
    session.add(member)
    if identity:
        identity.active = body.active
        session.add(identity)
    log(session, user, "MEMBER_UPDATED", "user", member.id)
    session.commit()
    return member_out(session, member)


@router.post("/team/{member_id}/transfer-ownership")
def transfer_owner(member_id: str, user: User = Depends(require(Perm.MANAGE_TEAM)),
                   session: Session = Depends(get_session)):
    member = get_owned(session, User, member_id, user)
    if member.id == user.id or not member_out(session, member)["active"]:
        raise Conflict("Choose a different active member")
    member.role, user.role = Role.OWNER, Role.SUPERVISOR
    session.add(member)
    session.add(user)
    log(session, user, "OWNERSHIP_TRANSFERRED", "user", member.id)
    session.commit()
    return {"status": "transferred"}


def invitation_out(invitation, token=None):
    status = invitation.status
    if status == "pending" and invitation.expires_at <= now():
        status = "expired"
    result = {"id": invitation.id, "email": invitation.email, "role": invitation.role,
              "status": status, "created_at": invitation.created_at,
              "expires_at": invitation.expires_at}
    if token:
        result["token"] = token
    return result


@router.get("/invitations")
def invitations(user: User = Depends(require(Perm.MANAGE_TEAM)),
                session: Session = Depends(get_session)):
    return [invitation_out(i) for i in session.exec(select(Invitation).where(
        Invitation.business_id == user.business_id).order_by(Invitation.created_at.desc()))]


def issue(session, user, email, role):
    # Revoke previous pending tokens for this recipient in the same business.
    for old in session.exec(select(Invitation).where(
            Invitation.business_id == user.business_id, Invitation.email == email,
            Invitation.status == "pending")):
        old.status = "revoked"
        session.add(old)
    token = secrets.token_urlsafe(32)
    invitation = Invitation(business_id=user.business_id, email=email, role=Role(role),
                            token_hash=hashlib.sha256(token.encode()).hexdigest(),
                            created_at=now(), expires_at=now() + timedelta(days=7))
    session.add(invitation)
    log(session, user, "INVITATION_ISSUED", "invitation", invitation.id)
    session.commit()
    return invitation_out(invitation, token)


@router.post("/invitations")
def invite(body: InviteIn, user: User = Depends(require(Perm.MANAGE_TEAM)),
           session: Session = Depends(get_session)):
    return issue(session, user, body.email, body.role)


@router.post("/invitations/accept")
def accept(body: AcceptIn, request: Request, principal: Principal = Depends(verified_principal),
           session: Session = Depends(get_session)):
    if request.app.state.settings.demo_mode:
        raise Forbidden("Joining a real account is disabled in isolated demo mode")
    invitation = session.exec(select(Invitation).where(
        Invitation.token_hash == hashlib.sha256(body.token.encode()).hexdigest())).first()
    if not invitation:
        raise NotFound("Invitation not found")
    if invitation.status != "pending" or invitation.expires_at <= now():
        raise Conflict("This invitation was used, revoked or has expired. Ask the owner to reissue it.")
    if invitation.email != principal.email:
        raise Forbidden("Sign in with the verified email this invitation was sent to")
    user = create_member(session, principal, invitation.business_id, invitation.role)
    invitation.status, invitation.accepted_by = "accepted", principal.subject
    session.add(invitation)
    log(session, user, "INVITATION_ACCEPTED", "invitation", invitation.id)
    session.commit()
    return me(user, session)


@router.post("/invitations/{invitation_id}/revoke")
def revoke(invitation_id: str, user: User = Depends(require(Perm.MANAGE_TEAM)),
           session: Session = Depends(get_session)):
    invitation = get_owned(session, Invitation, invitation_id, user)
    if invitation.status != "pending":
        raise Conflict("Only pending invitations can be revoked")
    invitation.status = "revoked"
    session.add(invitation)
    log(session, user, "INVITATION_REVOKED", "invitation", invitation.id)
    session.commit()
    return {"status": "revoked"}


@router.post("/invitations/{invitation_id}/reissue")
def reissue(invitation_id: str, user: User = Depends(require(Perm.MANAGE_TEAM)),
            session: Session = Depends(get_session)):
    invitation = get_owned(session, Invitation, invitation_id, user)
    if invitation.status == "accepted":
        raise Conflict("Accepted invitations cannot be reissued")
    invitation.status = "revoked"
    session.add(invitation)
    return issue(session, user, invitation.email, invitation.role)
