"""New product workflows. Identity substitution exists only in this test fixture.

Clerk verification itself has separate signed-JWT tests; no test header is
recognized by the application.
"""
from datetime import UTC, datetime, timedelta
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.config import Settings
from app.core.identity import Principal, verified_principal
from app.core import rbac
from app.core.worker import run_once
from app.errors import Forbidden, Unauthorized
from app.main import create_app
from app.models import Asset, AuditEvent, Business, Identity, Incident, Invitation, Notification, ServiceJob, StockItem, User


def principal(request: Request):
    subject = request.headers.get("x-test-subject")
    if not subject:
        raise Unauthorized("Sign in to continue")
    if request.headers.get("x-test-unverified"):
        raise Forbidden("Verify your primary email")
    return Principal(subject, f"{subject}@example.test", True, subject.capitalize())


@pytest.fixture
def normal(monkeypatch, tmp_path):
    # Never use a real provider credential in unit/integration fixtures.
    monkeypatch.setenv("CLERK_SECRET_KEY", "test-placeholder")
    monkeypatch.setattr("app.application.clerk_issuer", lambda: "https://test.clerk.accounts.dev")
    monkeypatch.setattr(rbac, "verified_principal", principal)
    app = create_app(Settings(database_url=f"sqlite:///{tmp_path}/product.sqlite", demo_mode=False, run_worker=False))
    app.dependency_overrides[verified_principal] = principal
    with TestClient(app) as client:
        yield app, client


def headers(subject="owner"):
    return {"x-test-subject": subject}


def onboard(client, subject="owner"):
    response = client.post("/v1/onboarding", headers=headers(subject),
                           json={"name": f"{subject} business", "kind": "bakery"})
    assert response.status_code == 200, response.text
    return response.json()


def invite_member(client, subject, role="staff", owner="owner"):
    issued = client.post("/v1/invitations", headers=headers(owner),
                         json={"email": f"{subject}@example.test", "role": role})
    assert issued.status_code == 200, issued.text
    accepted = client.post("/v1/invitations/accept", headers=headers(subject),
                           json={"token": issued.json()["token"]})
    assert accepted.status_code == 200, accepted.text
    return accepted.json(), issued.json()


def asset_body(**changes):
    return {"name": "Freezer A", "type": "freezer", "aliases": ["fz a"],
            "min_c": -24, "max_c": -15, "capacity_l": 200,
            "warranty_vendor_id": None, "warranty_until": None, **changes}


def vendor_body(**changes):
    return {"name": "Cooling Tech", "services": ["freezer"], "callout_fee_sen": 12000,
            "sla_hours": 2, "phone": "012345", "warranty_only": False, **changes}


def stock_body(**changes):
    return {"name": "Chicken", "qty": 10, "unit": "kg", "unit_cost_sen": 1500,
            "volume_l": 50, **changes}


def create_asset(client, owner="owner", **changes):
    response = client.post("/v1/assets", headers=headers(owner), json=asset_body(**changes))
    assert response.status_code == 200, response.text
    return response.json()


def test_normal_is_empty_and_demo_headers_and_sim_are_disabled(normal):
    app, client = normal
    assert client.get("/v1/access").json() == {"mode": "normal", "authenticated": False, "member": False}
    assert client.get("/v1/me", headers={"x-user-id": "u_rina"}).status_code == 401
    assert client.post("/v1/sim/reset").status_code == 404
    with Session(app.state.engine) as session:
        assert session.exec(select(Business)).all() == []
        assert session.exec(select(User)).all() == []
    onboard(client)
    assert client.get("/v1/assets", headers=headers()).json() == []
    assert client.post("/v1/onboarding", headers=headers(), json={"name": "Again", "kind": "cafe"}).status_code == 409


def test_verified_identity_required(normal):
    _, client = normal
    assert client.post("/v1/onboarding", json={"name": "x", "kind": "cafe"}).status_code == 401
    assert client.post("/v1/onboarding", headers={**headers(), "x-test-unverified": "1"},
                       json={"name": "x", "kind": "cafe"}).status_code == 403
    assert client.get("/v1/me", headers=headers()).status_code == 403


def test_invitation_recipient_replay_and_one_membership(normal):
    _, client = normal
    owner = onboard(client)
    issued = client.post("/v1/invitations", headers=headers(), json={
        "email": "colleague@example.test", "role": "supervisor"}).json()
    token = issued["token"]
    assert client.post("/v1/invitations/accept", headers=headers("wrong"), json={"token": token}).status_code == 403
    colleague = client.post("/v1/invitations/accept", headers=headers("colleague"), json={"token": token}).json()
    assert colleague["business_id"] == owner["business_id"]
    assert colleague["role"] == "supervisor"
    assert client.post("/v1/invitations/accept", headers=headers("colleague"), json={"token": token}).status_code == 409
    assert client.post("/v1/onboarding", headers=headers("colleague"), json={"name": "No", "kind": "cafe"}).status_code == 409
    assert "token" not in client.get("/v1/invitations", headers=headers()).json()[0]
    assert client.post("/v1/invitations", headers=headers(), json={"email": "bad", "role": "staff"}).status_code == 422
    assert client.post("/v1/invitations", headers=headers(), json={"email": "x@example.test", "role": "owner"}).status_code == 422


def test_invite_revoke_reissue_expiry(normal):
    app, client = normal
    onboard(client)
    issued = client.post("/v1/invitations", headers=headers(), json={"email": "new@example.test", "role": "staff"}).json()
    assert client.post(f"/v1/invitations/{issued['id']}/revoke", headers=headers()).status_code == 200
    assert client.post("/v1/invitations/accept", headers=headers("new"), json={"token": issued["token"]}).status_code == 409
    reissued = client.post(f"/v1/invitations/{issued['id']}/reissue", headers=headers()).json()
    assert reissued["token"] != issued["token"]
    with Session(app.state.engine) as session:
        invitation = session.get(Invitation, reissued["id"])
        invitation.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        session.add(invitation)
        session.commit()
    assert client.get("/v1/invitations", headers=headers()).json()[0]["status"] == "expired"
    assert client.post("/v1/invitations/accept", headers=headers("new"), json={"token": reissued["token"]}).status_code == 409


def test_role_change_deactivation_and_transfer_owner(normal):
    _, client = normal
    owner = onboard(client)
    colleague, _ = invite_member(client, "colleague")
    member_id = colleague["id"]
    assert client.get("/v1/vendors", headers=headers("colleague")).status_code == 403
    assert client.put(f"/v1/team/{member_id}", headers=headers(), json={"role": "supervisor", "active": True}).status_code == 200
    assert client.get("/v1/vendors", headers=headers("colleague")).status_code == 200
    assert client.put(f"/v1/team/{member_id}", headers=headers(), json={"role": "supervisor", "active": False}).status_code == 200
    assert client.get("/v1/assets", headers=headers("colleague")).status_code == 403
    assert client.post(f"/v1/team/{member_id}/transfer-ownership", headers=headers()).status_code == 409
    assert client.put(f"/v1/team/{owner['id']}", headers=headers(), json={"role": "staff", "active": False}).status_code == 409
    client.put(f"/v1/team/{member_id}", headers=headers(), json={"role": "supervisor", "active": True})
    assert client.post(f"/v1/team/{member_id}/transfer-ownership", headers=headers()).status_code == 200
    assert client.get("/v1/team", headers=headers()).status_code == 403
    assert client.get("/v1/me", headers=headers("colleague")).json()["role"] == "owner"


@pytest.mark.parametrize("route,method,body", [
    ("/v1/assets", "post", asset_body()),
    ("/v1/vendors", "post", vendor_body()),
    ("/v1/settings", "put", {"name": "Shop", "kind": "cafe", "supervisor_limit_sen": 100}),
    ("/v1/invitations", "post", {"email": "other@example.test", "role": "staff"}),
])
@pytest.mark.parametrize("role", ["staff", "supervisor"])
def test_management_owner_only(normal, route, method, body, role):
    _, client = normal
    onboard(client)
    invite_member(client, "member", role)
    assert getattr(client, method)(route, headers=headers("member"), json=body).status_code == 403
    assert client.get("/v1/metrics", headers=headers("member")).status_code == 403
    assert client.get("/v1/audit", headers=headers("member")).status_code == 403


def test_two_businesses_isolated_for_references_and_reads(normal):
    _, client = normal
    onboard(client)
    onboard(client, "other")
    asset = create_asset(client)
    other_asset = create_asset(client, "other")
    vendor = client.post("/v1/vendors", headers=headers("other"), json=vendor_body()).json()
    stock = client.post(f"/v1/assets/{asset['id']}/stock", headers=headers(), json=stock_body()).json()
    for route in [f"/v1/assets/{asset['id']}", f"/v1/vendors/{vendor['id']}"]:
        subject = "other" if "/assets/" in route else "owner"
        assert client.get(route, headers=headers(subject)).status_code == 404
    assert client.post("/v1/assets", headers=headers(), json=asset_body(warranty_vendor_id=vendor["id"])).status_code == 404
    assert client.post("/v1/transfers", headers=headers(), json={
        "destination_asset_id": other_asset["id"], "items": [{"stock_item_id": stock["id"], "qty": 1}]}).status_code == 404
    assert client.put(f"/v1/stock/{stock['id']}", headers=headers("other"), json=stock_body()).status_code == 404
    team_id = client.get("/v1/me", headers=headers("other")).json()["id"]
    assert client.put(f"/v1/team/{team_id}", headers=headers(), json={"role": "staff", "active": False}).status_code == 404


@pytest.mark.parametrize("change", [{"capacity_l": -1}, {"min_c": 10, "max_c": 0}, {"name": " "}, {"min_c": -200}])
def test_equipment_validation(normal, change):
    _, client = normal
    onboard(client)
    assert client.post("/v1/assets", headers=headers(), json=asset_body(**change)).status_code == 422


def test_equipment_vendor_crud_archive_and_safe_deletes(normal):
    _, client = normal
    onboard(client)
    vendor = client.post("/v1/vendors", headers=headers(), json=vendor_body()).json()
    asset = create_asset(client, warranty_vendor_id=vendor["id"], warranty_until="2028-01-01")
    assert asset["warranty_vendor_id"] == vendor["id"]
    assert client.put(f"/v1/assets/{asset['id']}", headers=headers(), json=asset_body(name="Changed")).json()["name"] == "Changed"
    client.post(f"/v1/assets/{asset['id']}/archive", headers=headers(), json={"archived": True})
    assert client.get("/v1/assets", headers=headers()).json() == []
    assert client.get("/v1/assets?include_archived=true", headers=headers()).json()[0]["archived"]
    assert client.post("/v1/readings", headers=headers(), json={"asset_id": asset["id"], "temp_c": -18}).status_code == 409
    client.post(f"/v1/assets/{asset['id']}/archive", headers=headers(), json={"archived": False})
    client.post("/v1/readings", headers=headers(), json={"asset_id": asset["id"], "temp_c": -18})
    assert client.delete(f"/v1/assets/{asset['id']}", headers=headers()).status_code == 409
    empty = create_asset(client, name="Delete me")
    assert client.delete(f"/v1/assets/{empty['id']}", headers=headers()).status_code == 200
    client.put(f"/v1/vendors/{vendor['id']}", headers=headers(), json=vendor_body(name="Updated"))
    assert client.get(f"/v1/vendors/{vendor['id']}", headers=headers()).json()["name"] == "Updated"
    assert client.delete(f"/v1/vendors/{vendor['id']}", headers=headers()).status_code == 200


def test_stock_transfers_capacity_history_and_idempotency(normal):
    app, client = normal
    onboard(client)
    invite_member(client, "supervisor", "supervisor")
    invite_member(client, "staff")
    source, dest = create_asset(client), create_asset(client, name="Backup", capacity_l=20)
    stock = client.post(f"/v1/assets/{source['id']}/stock", headers=headers("supervisor"), json=stock_body()).json()
    assert client.post(f"/v1/assets/{source['id']}/stock", headers=headers("staff"), json=stock_body()).status_code == 403
    assert client.post(f"/v1/assets/{source['id']}/stock", headers=headers(), json=stock_body(qty=-1)).status_code == 422
    assert client.post(f"/v1/assets/{dest['id']}/stock", headers=headers(), json=stock_body()).status_code == 409
    assert client.put(f"/v1/assets/{source['id']}", headers=headers(), json=asset_body(capacity_l=10)).status_code == 409
    report = client.post("/v1/reports", headers=headers("staff"), json={"text": "Freezer A not cooling"}).json()["incident"]
    initial_risk = report["stock_at_risk_rm"]
    body = {"incident_id": report["id"], "destination_asset_id": dest["id"],
            "items": [{"stock_item_id": stock["id"], "qty": 5}]}
    assert client.post("/v1/transfers", headers=headers("supervisor"), json=body).status_code == 409
    body["items"][0]["qty"] = 4
    response = client.post("/v1/transfers", headers={**headers("supervisor"), "Idempotency-Key": "transfer-one"}, json=body)
    assert response.status_code == 200, response.text
    assert client.post("/v1/transfers", headers={**headers("supervisor"), "Idempotency-Key": "transfer-one"}, json=body).json() == response.json()
    detail = client.get(f"/v1/assets/{source['id']}", headers=headers()).json()
    assert detail["stock"][0]["qty"] == 6 and detail["stock"][0]["volume_l"] == 30
    assert client.get(f"/v1/assets/{dest['id']}", headers=headers()).json()["free_l"] == 0
    assert client.get(f"/v1/incidents/{report['id']}", headers=headers()).json()["stock_at_risk_rm"] == "150.00"
    staff_detail = client.get(f"/v1/assets/{source['id']}", headers=headers("staff")).json()
    assert staff_detail["stock_value_rm"] is None
    assert staff_detail["stock"][0]["unit_cost_rm"] is None
    staff_incident = client.get(f"/v1/incidents/{report['id']}", headers=headers("staff")).json()
    assert all("RM" not in reason for reason in staff_incident["decision"]["reasons"])
    with Session(app.state.engine) as session:
        events = session.exec(select(AuditEvent).where(AuditEvent.action == "STOCK_TRANSFERRED")).all()
        assert len(events) == 1


def test_approval_recovery_notifications_and_reassessment(normal):
    app, client = normal
    onboard(client)
    invite_member(client, "supervisor", "supervisor")
    invite_member(client, "staff")
    asset = create_asset(client)
    incident = client.post("/v1/reports", headers=headers("staff"), json={"text": "Freezer A not cooling"}).json()["incident"]
    assert incident["decision"]["vendor"] is None and incident["approval"] is None
    client.post("/v1/vendors", headers=headers(), json=vendor_body())
    reassessed = client.post(f"/v1/incidents/{incident['id']}/reassess", headers=headers("supervisor")).json()
    approval_id = reassessed["approval"]["id"]
    assert reassessed["approval"]["can_decide"]
    assert client.post(f"/v1/approvals/{approval_id}/approve", headers=headers("staff")).status_code == 403
    # A changed business limit is enforced on subsequent requests, not only at creation.
    client.put("/v1/settings", headers=headers(), json={"name": "Shop", "kind": "cafe", "supervisor_limit_sen": 0})
    assert not client.get("/v1/approvals", headers=headers("supervisor")).json()[0]["can_decide"]
    assert client.post(f"/v1/approvals/{approval_id}/approve", headers=headers("supervisor")).status_code == 403
    approved = client.post(f"/v1/approvals/{approval_id}/approve", headers=headers()).json()
    assert client.post(f"/v1/approvals/{approval_id}/approve", headers=headers()).status_code == 409
    job_id = approved["incident"]["job"]["id"]
    assert len(client.get("/v1/jobs", headers=headers()).json()) == 1
    assert client.get(f"/v1/jobs/{job_id}", headers=headers()).status_code == 200
    assert client.post(f"/v1/jobs/{job_id}/confirm", headers=headers("supervisor"), json={}).status_code == 200
    assert client.post(f"/v1/jobs/{job_id}/confirm", headers=headers("supervisor"), json={}).status_code == 409
    client.post("/v1/readings", headers=headers("staff"), json={"asset_id": asset["id"], "temp_c": -10})
    assert client.post(f"/v1/jobs/{job_id}/complete", headers=headers("supervisor")).json()["incident"]["status"] == "DISPATCHED"
    recovered = client.post("/v1/readings", headers=headers("staff"), json={"asset_id": asset["id"], "temp_c": -18}).json()
    assert recovered["incident"]["status"] == "RESOLVED"
    notifications = client.get("/v1/notifications", headers=headers("staff")).json()
    assert notifications and notifications[0]["delivery"] == "in_app"
    notification_id = notifications[0]["id"]
    assert client.post(f"/v1/notifications/{notification_id}/read", headers=headers()).status_code == 404
    assert client.post(f"/v1/notifications/{notification_id}/read", headers=headers("staff")).json()["read_at"]
    assert client.get("/v1/messages", headers=headers()).json()[0]["channel"] == "whatsapp_mock"


def test_profile_settings_and_origin_protection(normal):
    _, client = normal
    onboard(client)
    assert client.put("/v1/profile", headers=headers(), json={"name": "New name", "phone": "123"}).json()["name"] == "New name"
    assert client.get("/v1/profile", headers=headers()).json()["phone"] == "123"
    assert client.put("/v1/profile", headers={**headers(), "origin": "https://attacker.invalid"},
                       json={"name": "Bad", "phone": ""}).status_code == 403
    assert client.get("/v1/me", headers=headers()).headers["cache-control"] == "no-store"


def test_reading_states_and_normal_sources(normal):
    app, client = normal
    onboard(client)
    asset = create_asset(client)
    assert asset["reading_state"] == "missing"
    assert client.post("/v1/readings", headers=headers(), json={"asset_id": asset["id"], "temp_c": -18, "source": "sim"}).status_code == 422
    client.post("/v1/readings", headers=headers(), json={"asset_id": asset["id"], "temp_c": -18})
    assert client.get(f"/v1/assets/{asset['id']}", headers=headers()).json()["reading_state"] == "current"
    from app.models import Reading
    with Session(app.state.engine) as session:
        reading = session.exec(select(Reading)).first()
        reading.recorded_at = datetime.now(UTC) - timedelta(hours=2)
        session.add(reading)
        session.commit()
    assert client.get(f"/v1/assets/{asset['id']}", headers=headers()).json()["reading_state"] == "stale"


def test_worker_claims_duplicate_safely_and_after_restart(normal):
    app, client = normal
    onboard(client)
    create_asset(client)
    client.post("/v1/vendors", headers=headers(), json=vendor_body())
    incident = client.post("/v1/reports", headers=headers(), json={"text": "Freezer A not cooling"}).json()["incident"]
    approved = client.post(f"/v1/approvals/{incident['approval']['id']}/approve", headers=headers()).json()
    job_id = approved["incident"]["job"]["id"]
    with Session(app.state.engine) as session:
        job = session.get(ServiceJob, job_id)
        job.requested_at = datetime.now(UTC) - timedelta(hours=1)
        session.add(job)
        session.commit()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: run_once(app.state.engine), range(2)))
    assert sum(map(len, results)) == 1
    from app.db import make_engine, init_db
    restarted = make_engine(str(app.state.engine.url))
    init_db(restarted)
    assert run_once(restarted) == []
    with Session(restarted) as session:
        assert session.get(ServiceJob, job_id).chase_count == 1
        assert session.exec(select(Business)).first().name == "owner business"
    restarted.dispose()


def test_simultaneous_stock_transfers_cannot_overspend(normal):
    _, client = normal
    onboard(client)
    source, dest = create_asset(client), create_asset(client, name="Destination")
    stock = client.post(f"/v1/assets/{source['id']}/stock", headers=headers(), json=stock_body()).json()
    body = {"destination_asset_id": dest["id"], "items": [{"stock_item_id": stock["id"], "qty": 7}]}
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.post("/v1/transfers", headers=headers(), json=body), range(2)))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert client.get(f"/v1/assets/{source['id']}", headers=headers()).json()["stock"][0]["qty"] == 3


def test_simultaneous_invitation_acceptance_is_single_use(normal):
    _, client = normal
    onboard(client)
    invitation = client.post("/v1/invitations", headers=headers(), json={"email": "new@example.test", "role": "staff"}).json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.post("/v1/invitations/accept", headers=headers("new"),
                            json={"token": invitation["token"]}), range(2)))
    assert sorted(r.status_code for r in results) == [200, 409]
