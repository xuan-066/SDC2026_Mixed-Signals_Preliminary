import pytest
from fastapi.testclient import TestClient
from sqlmodel import func, select

from app.config import Settings
from app.core import audit
from app.main import create_app
from app.models import Incident, Message, Reading, ServiceJob


@pytest.fixture
def dispatched(app, client, as_user):
    """Freezer 2 CRITICAL, Rina approved → a REQUESTED CoolTech job. Returns the job id."""
    client.post("/v1/sim/sensor", json={"asset_id": "a_fz2", "pattern": "compressor_fail"})
    [approval] = client.get("/v1/approvals?status=PENDING", headers=as_user("u_rina")).json()
    r = client.post(f"/v1/approvals/{approval['id']}/approve", headers=as_user("u_rina"), json={})
    return r.json()["incident"]["job"]["id"]


def advance(client, minutes):
    r = client.post("/v1/sim/advance", json={"minutes": minutes})
    assert r.status_code == 200, r.text
    return r.json()


def chases(session, job_id) -> int:
    session.expire_all()
    return session.get(ServiceJob, job_id).chase_count


def test_no_chase_before_60_min(client, session, dispatched):
    assert advance(client, 59)["actions"] == []
    assert chases(session, dispatched) == 0


def test_vendor_chased_after_60_min(client, session, dispatched):
    body = advance(client, 60)
    assert body["now"] == "2026-11-12T14:30:00Z"            # sensor ended 13:30, +60 min
    [action] = body["actions"]
    assert "Chased CoolTech Refrigeration" in action and "Freezer 2" in action
    assert chases(session, dispatched) == 1
    vendor_msgs = [m.body for m in session.exec(select(Message).where(Message.to_id == "v_cooltech"))]
    assert len(vendor_msgs) == 2 and "Reminder" in vendor_msgs[-1]
    [event] = [e for e in audit.list_events(session, business_id="b_seripagi", entity_id=dispatched)
               if e.action == "VENDOR_CHASED"]
    assert event.details["chase_count"] == 1


def test_advance_twice_does_not_double_chase(client, session, dispatched):
    advance(client, 60)
    assert advance(client, 0)["actions"] == []
    assert chases(session, dispatched) == 1


def test_big_jump_chases_once(client, session, dispatched):
    assert len(advance(client, 180)["actions"]) == 1
    assert chases(session, dispatched) == 1


def test_max_two_chases(client, session, dispatched):
    for _ in range(3):
        advance(client, 60)
    assert chases(session, dispatched) == 2
    assert advance(client, 600)["actions"] == []


def test_confirmed_job_not_chased(client, as_user, session, dispatched):
    client.post(f"/v1/jobs/{dispatched}/confirm", headers=as_user("u_daniel"), json={})
    assert advance(client, 120)["actions"] == []


def test_advance_rejects_negative_minutes(client):
    assert client.post("/v1/sim/advance", json={"minutes": -5}).status_code == 422


def test_sim_hidden_when_demo_mode_false(normal_mode_app):
    with TestClient(normal_mode_app) as c:
        assert c.post("/v1/sim/reset").status_code == 404
        assert c.post("/v1/sim/advance", json={"minutes": 60}).status_code == 404
        assert c.post("/v1/sim/sensor", json={"asset_id": "a_fz2",
                                              "pattern": "door_open"}).status_code == 404


def test_sensor_door_open_no_incident(client, session):
    r = client.post("/v1/sim/sensor", json={"asset_id": "a_fz2", "pattern": "door_open"})
    assert r.status_code == 200
    body = r.json()
    assert [x["temp_c"] for x in body["readings"]] == [-18.0, -13.0, -18.0]
    assert [x["recorded_at"] for x in body["readings"]] == [
        "2026-11-12T13:00:00Z", "2026-11-12T13:15:00Z", "2026-11-12T13:30:00Z"]
    assert body["incident"] is None
    assert session.exec(select(func.count()).select_from(Incident)).one() == 0
    assert any(e.action == "WATCH_CLEARED" for e in audit.list_events(session, business_id="b_seripagi"))


def test_sensor_compressor_fail_opens_incident(client, session):
    body = client.post("/v1/sim/sensor", json={"asset_id": "a_fz2",
                                               "pattern": "compressor_fail"}).json()
    assert body["incident"]["severity"] == "CRITICAL"
    assert body["incident"]["status"] == "PENDING_APPROVAL"
    assert body["incident"]["stock_at_risk_rm"] == "1850.00"
    assert {r.source for r in session.exec(select(Reading))} == {"sim"}


def test_sensor_recover_after_repair_resolves(client, as_user, session, dispatched):
    client.post(f"/v1/jobs/{dispatched}/complete", headers=as_user("u_daniel"))   # still -11 → open
    advance(client, 30)
    body = client.post("/v1/sim/sensor", json={"asset_id": "a_fz2", "pattern": "recover"}).json()
    assert body["incident"] is None                         # no active incident any more
    assert session.exec(select(Incident)).one().status == "RESOLVED"


def test_sensor_unknown_asset_or_pattern(client):
    assert client.post("/v1/sim/sensor", json={"asset_id": "a_nope",
                                               "pattern": "door_open"}).status_code == 404
    assert client.post("/v1/sim/sensor", json={"asset_id": "a_fz2",
                                               "pattern": "explode"}).status_code == 422


def test_sensor_patterns_fit_the_unit(client):
    """Patterns follow the unit's own limit: a chiller isn't sent freezer temperatures."""
    body = client.post("/v1/sim/sensor", json={"asset_id": "a_ch1", "pattern": "door_open"}).json()
    assert [r["temp_c"] for r in body["readings"]] == [2.0, 7.0, 2.0]
    assert body["incident"] is None
    body = client.post("/v1/sim/sensor", json={"asset_id": "a_ch2",
                                               "pattern": "compressor_fail"}).json()
    assert [r["temp_c"] for r in body["readings"]] == [2.0, 7.0, 9.0]
    assert body["incident"]["severity"] == "CRITICAL"
