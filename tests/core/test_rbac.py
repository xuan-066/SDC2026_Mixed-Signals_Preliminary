import pytest
from fastapi import Depends
from sqlmodel import Session

from app.core.rbac import Perm, get_owned, has_perm, require
from app.db import get_session
from app.enums import Role
from app.errors import NotFound
from app.models import Asset, User

S, V, O = Role.STAFF, Role.SUPERVISOR, Role.OWNER

# Plan §9, one row per permission: which roles are allowed.
MATRIX = [
    (Perm.SUBMIT_READING,  {S, V, O}),
    (Perm.VIEW_OPERATIONS, {S, V, O}),
    (Perm.VIEW_MONEY,      {V, O}),
    (Perm.VIEW_VENDORS,    {V, O}),
    (Perm.VIEW_MESSAGES,   {V, O}),
    (Perm.DECIDE_APPROVAL, {V, O}),
    (Perm.MANAGE_JOBS,     {V, O}),
    (Perm.VIEW_AUDIT,      {O}),
    (Perm.VIEW_METRICS,    {O}),
]


def test_matrix_covers_every_permission():
    assert {perm for perm, _ in MATRIX} == set(Perm)


@pytest.mark.parametrize("perm,allowed", MATRIX)
@pytest.mark.parametrize("role", list(Role))
def test_has_perm_matrix(role, perm, allowed):
    assert has_perm(role, perm) == (role in allowed)


def test_missing_user_header_401(client):
    r = client.get("/v1/me")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHORIZED"


def test_unknown_user_401(client, as_user):
    assert client.get("/v1/me", headers=as_user("u_nobody")).status_code == 401


def test_me_lists_permissions(client, as_user):
    body = client.get("/v1/me", headers=as_user("u_daniel")).json()
    assert body["role"] == "supervisor"
    assert body["business_name"] == "Seri Pagi Bakery & Café"
    assert "decide_approval" in body["permissions"]
    assert "view_audit" not in body["permissions"]


def test_require_forbids_low_role_403(app, client, as_user):
    @app.get("/_audit_only")
    def audit_only(user: User = Depends(require(Perm.VIEW_AUDIT))):
        return {"ok": user.id}

    assert client.get("/_audit_only", headers=as_user("u_rina")).status_code == 200
    r = client.get("/_audit_only", headers=as_user("u_daniel"))
    assert r.status_code == 403
    assert r.json()["error"] == {"code": "FORBIDDEN", "message": "Owner role required"}


def test_cross_business_access_404(app, client, as_user):
    # T8 adds the real GET /v1/assets/{id}; this stand-in uses the same get_owned helper.
    @app.get("/_assets/{asset_id}")
    def one_asset(asset_id: str, user: User = Depends(require(Perm.VIEW_OPERATIONS)),
                  session: Session = Depends(get_session)):
        return {"id": get_owned(session, Asset, asset_id, user).id}

    assert client.get("/_assets/a_fz2", headers=as_user("u_rina")).status_code == 200
    r = client.get("/_assets/a_fz2", headers=as_user("u_lim"))
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


def test_get_owned_missing_and_other_business(session):
    rina, lim = session.get(User, "u_rina"), session.get(User, "u_lim")
    assert get_owned(session, Asset, "a_fz2", rina).name == "Freezer 2"
    with pytest.raises(NotFound):
        get_owned(session, Asset, "a_fz2", lim)
    with pytest.raises(NotFound):
        get_owned(session, Asset, "a_nope", rina)
