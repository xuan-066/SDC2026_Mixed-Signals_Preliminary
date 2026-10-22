import pytest
from sqlmodel import select

from app.core import audit
from app.enums import IncidentStatus, JobStatus
from app.models import AuditEvent, Incident, Message, ServiceJob


@pytest.fixture
def journey(app, client, as_user):
    """Runs demo steps 1–4 (Freezer 2 goes CRITICAL) and returns helpers for the rest."""
    def reading(temp_c, user="u_aina"):
        return client.post("/v1/readings", headers=as_user(user),
                           json={"asset_id": "a_fz2", "temp_c": temp_c, "source": "sim"})

    def advance(minutes):
        app.state.clock.advance(minutes)

    reading(-18.0)
    advance(15)
    reading(-13.0)
    advance(15)
    incident = reading(-11.0).json()["incident"]

    class J:
        incident_id = incident["id"]
        approval_id = incident["approval"]["id"]

        @staticmethod
        def approve(user="u_rina", **body):
            return client.post(f"/v1/approvals/{J.approval_id}/approve", headers=as_user(user),
                               json=body)

        @staticmethod
        def reject(note, user="u_rina"):
            return client.post(f"/v1/approvals/{J.approval_id}/reject", headers=as_user(user),
                               json={"note": note})

        @staticmethod
        def job_action(job_id, action, user="u_daniel", **body):
            return client.post(f"/v1/jobs/{job_id}/{action}", headers=as_user(user), json=body)

    J.reading = staticmethod(reading)
    J.advance = staticmethod(advance)
    return J


def _messages_to(session, to_id):
    return [m.body for m in session.exec(select(Message).where(Message.to_id == to_id)
                                         .order_by(Message.created_at))]


def _actions(session, entity_id):
    return [e.action for e in audit.list_events(session, business_id="b_seripagi",
                                                entity_id=entity_id)]


def test_owner_approval_dispatches_vendor(journey, session):
    r = journey.approve(note="Go ahead")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["approval"]["status"] == "APPROVED"
    assert body["incident"]["status"] == "DISPATCHED"
    assert body["incident"]["job"]["status"] == "REQUESTED"
    assert body["incident"]["job"]["vendor_id"] == "v_cooltech"

    job = session.exec(select(ServiceJob)).one()
    assert job.vendor_id == "v_cooltech" and job.status == JobStatus.REQUESTED
    [vendor_msg] = _messages_to(session, "v_cooltech")
    assert "Freezer 2" in vendor_msg and "Seri Pagi" in vendor_msg and "CRITICAL" in vendor_msg
    actions = _actions(session, journey.incident_id)
    assert "APPROVED" in actions and "JOB_CREATED" in actions


def test_supervisor_forbidden_over_limit_http(journey, session):
    r = journey.approve(user="u_daniel")
    assert r.status_code == 403
    assert r.json()["error"] == {"code": "FORBIDDEN",
                                 "message": "Owner approval required for RM180.00"}
    assert "APPROVAL_FORBIDDEN" in _actions(session, journey.incident_id)
    assert session.get(Incident, journey.incident_id).status == IncidentStatus.PENDING_APPROVAL


def test_staff_cannot_approve(journey):
    assert journey.approve(user="u_aina").status_code == 403


def test_approve_after_reject_conflict(journey):
    assert journey.reject("Too expensive tonight").status_code == 200
    r = journey.approve()
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "CONFLICT"
    assert journey.approve().status_code == 409


def test_approve_twice_dispatches_once(journey, session):
    assert journey.approve().status_code == 200
    assert journey.approve().status_code == 409
    assert len(session.exec(select(ServiceJob)).all()) == 1


def test_reject_needs_a_note(journey):
    assert journey.reject("").status_code == 422


def test_reject_notifies_staff_and_declines(journey, session):
    r = journey.reject("I'll call my usual technician")
    assert r.json()["incident"]["status"] == "DECLINED"
    assert session.exec(select(ServiceJob)).first() is None
    last = _messages_to(session, "u_aina")[-1]
    assert "Rina declined" in last and "I'll call my usual technician" in last
    assert "Freezer 1" in last                                  # keep stock in the backup unit


def test_other_business_cannot_see_or_decide(journey, client, as_user):
    assert journey.approve(user="u_lim").status_code == 404
    assert client.get(f"/v1/incidents/{journey.incident_id}",
                      headers=as_user("u_lim")).status_code == 404


def test_confirm_sets_eta_from_sla(journey, session):
    job_id = journey.approve().json()["incident"]["job"]["id"]
    r = journey.job_action(job_id, "confirm")
    assert r.status_code == 200
    job = r.json()["job"]
    assert job["status"] == "CONFIRMED"
    assert job["eta"] == "2026-11-12T17:30:00Z"                 # 13:30 + CoolTech's 4 h SLA
    assert "by 01:30" in _messages_to(session, "u_aina")[-1]    # shown in MYT
    assert journey.job_action(job_id, "confirm").status_code == 409


def test_complete_resolves_when_temp_normal(journey, session):
    job_id = journey.approve().json()["incident"]["job"]["id"]
    journey.job_action(job_id, "confirm")
    journey.advance(90)
    journey.reading(-17.5)
    r = journey.job_action(job_id, "complete")
    assert r.status_code == 200
    incident = r.json()["incident"]
    assert incident["status"] == "RESOLVED"
    assert incident["resolved_at"] == "2026-11-12T15:00:00Z"
    assert "fixed and back at -17.5°C" in _messages_to(session, "u_aina")[-1]
    assert journey.job_action(job_id, "complete").status_code == 409


def test_complete_while_still_warm_stays_dispatched(journey, session):
    job_id = journey.approve().json()["incident"]["job"]["id"]
    journey.advance(30)
    journey.reading(-12.0)
    r = journey.job_action(job_id, "complete")
    assert r.json()["incident"]["status"] == "DISPATCHED"
    assert "still out of range after repair" in _messages_to(session, "u_rina")[-1]

    journey.advance(30)                                         # §8.4: a later normal reading
    journey.reading(-18.0)                                      # resolves it
    session.expire_all()
    assert session.get(Incident, journey.incident_id).status == IncidentStatus.RESOLVED


def test_normal_reading_before_repair_does_not_resolve(journey, session):
    journey.approve()
    journey.advance(15)
    journey.reading(-18.0)
    session.expire_all()
    assert session.get(Incident, journey.incident_id).status == IncidentStatus.DISPATCHED


def test_job_actions_need_supervisor(journey):
    job_id = journey.approve().json()["incident"]["job"]["id"]
    assert journey.job_action(job_id, "confirm", user="u_aina").status_code == 403
    assert journey.job_action(job_id, "confirm", user="u_lim").status_code == 404


def test_full_story_in_audit_order(journey, session):
    """Demo steps 5–11 without the T9 vendor chase (added by T9 / T10)."""
    journey.approve(user="u_daniel")
    job_id = journey.approve().json()["incident"]["job"]["id"]
    journey.job_action(job_id, "confirm")
    journey.advance(60)
    journey.reading(-17.5)
    journey.job_action(job_id, "complete")
    story = [a for a in _actions(session, journey.incident_id) if a != "MESSAGE_SENT"]
    assert story == ["INCIDENT_OPENED", "APPROVAL_REQUESTED", "APPROVAL_FORBIDDEN", "APPROVED",
                     "JOB_CREATED", "VENDOR_CONFIRMED", "JOB_DONE", "INCIDENT_RESOLVED"]
    assert session.exec(select(AuditEvent).where(AuditEvent.action == "APPROVAL_FORBIDDEN")
                        ).one().actor_id == "u_daniel"


def test_journey_with_clock_standing_still(client, as_user):
    """Manual /docs testing posts every reading at the same simulated minute: the reading
    posted last must count as the latest (bug found in a live run)."""
    def reading(t):
        return client.post("/v1/readings", headers=as_user("u_aina"),
                           json={"asset_id": "a_fz2", "temp_c": t}).json()

    for t in (-18.0, -13.0):
        assert reading(t)["incident"] is None
    incident = reading(-11.0)["incident"]
    assert incident["severity"] == "CRITICAL"
    approval_id = incident["approval"]["id"]
    job_id = client.post(f"/v1/approvals/{approval_id}/approve", headers=as_user("u_rina"),
                         json={}).json()["incident"]["job"]["id"]
    reading(-17.5)
    r = client.post(f"/v1/jobs/{job_id}/complete", headers=as_user("u_daniel"))
    assert r.json()["incident"]["status"] == "RESOLVED"
    assets = {a["id"]: a for a in client.get("/v1/assets", headers=as_user("u_aina")).json()}
    assert assets["a_fz2"]["latest_temp_c"] == -17.5
