import pytest
from sqlmodel import func, select

from app.core import audit
from app.enums import IncidentStatus, Role, Severity
from app.models import ApprovalRequest, AuditEvent, Incident, Message, Reading


@pytest.fixture
def post(app, client, as_user):
    """post(temp) sends a Freezer 2 reading as Aina, 15 simulated minutes after the last one."""
    state = {"first": True}

    def _post(temp_c, asset_id="a_fz2", user="u_aina", step_min=15):
        if not state["first"]:
            app.state.clock.advance(step_min)
        state["first"] = False
        return client.post("/v1/readings", headers=as_user(user),
                           json={"asset_id": asset_id, "temp_c": temp_c, "source": "sim"})
    return _post


def _count(session, model, *where) -> int:
    return session.exec(select(func.count()).select_from(model).where(*where)).one()


def _messages_to(session, user_id) -> list[str]:
    return [m.body for m in session.exec(select(Message).where(Message.to_id == user_id))]


def _actions(session) -> list[str]:
    return [e.action for e in audit.list_events(session, business_id="b_seripagi")]


def _golden(post):
    for t in (-18.0, -13.0, -11.0):
        r = post(t)
        assert r.status_code == 200, r.text
    return r


def test_in_range_reading_no_incident(post, session):
    r = post(-18.0)
    assert r.status_code == 200
    body = r.json()
    assert body["incident"] is None
    assert body["reading"]["temp_c"] == -18.0
    assert body["reading"]["recorded_at"] == "2026-11-12T13:00:00Z"
    assert _count(session, Reading) == 1


def test_single_excursion_no_incident_then_watch_cleared_logged(post, session):
    assert post(-18.0).json()["incident"] is None
    assert post(-13.0).json()["incident"] is None           # WATCH: maybe the door opened
    assert post(-18.0).json()["incident"] is None
    assert _count(session, Incident) == 0
    assert _count(session, Message) == 0                    # nobody was woken up
    assert _actions(session) == ["WATCH_CLEARED"]


def test_critical_reading_opens_incident(post, session):
    inc = _golden(post).json()["incident"]
    assert inc["severity"] == "CRITICAL"
    assert inc["status"] == "PENDING_APPROVAL"
    assert inc["required_role"] == "owner"
    assert len(inc["reasons"]) == 6
    stored = session.get(Incident, inc["id"])
    assert stored.stock_at_risk_sen == 185000
    assert stored.decision["backup_unit"]["id"] == "a_fz1"
    assert stored.decision["vendor"]["id"] == "v_cooltech"
    assert stored.created_at.isoformat() == "2026-11-12T13:30:00+00:00"


def test_staff_instruction_sent_immediately(post, session):
    _golden(post)
    [body] = _messages_to(session, "u_aina")
    assert "Freezer 1" in body and "door shut" in body


def test_approval_requested_for_owner(post, session):
    inc_id = _golden(post).json()["incident"]["id"]
    approval = session.exec(select(ApprovalRequest)).one()
    assert (approval.amount_sen, approval.required_role) == (18000, Role.OWNER)
    assert approval.subject_id == inc_id
    [body] = _messages_to(session, "u_rina")
    assert "CoolTech Refrigeration" in body and "RM180.00" in body
    assert _messages_to(session, "u_daniel") == []          # not his call above RM150


def test_repeated_readings_do_not_duplicate_incident(post, session):
    _golden(post)
    for t in (-11.0, -10.5, -10.0, -9.5):
        assert post(t).json()["incident"]["status"] == "PENDING_APPROVAL"
    assert _count(session, Incident) == 1
    assert _count(session, ApprovalRequest) == 1
    assert len(_messages_to(session, "u_rina")) == 1


def test_severity_rise_logged_once(post, session):
    post(-14.0)
    inc = post(-13.5).json()["incident"]
    assert inc["severity"] == "WARNING" and inc["required_role"] == "supervisor"
    assert len(_messages_to(session, "u_daniel")) == 1      # Sejuk Jaya RM120 → Daniel

    assert post(-11.0).json()["incident"]["severity"] == "CRITICAL"
    post(-10.5)                                             # still CRITICAL: no second rise
    session.expire_all()
    assert session.get(Incident, inc["id"]).severity == Severity.CRITICAL
    assert _count(session, AuditEvent, AuditEvent.action == "SEVERITY_CHANGED") == 1
    approval = session.exec(select(ApprovalRequest)).one()  # pending approval unchanged
    assert (approval.amount_sen, approval.required_role) == (12000, Role.SUPERVISOR)
    assert len(_messages_to(session, "u_daniel")) == 2      # one update, once


@pytest.mark.parametrize("glitch", [85.0, -127.0])
def test_glitch_readings_rejected(post, session, glitch):
    r = post(glitch)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert _count(session, Reading) == 0
    assert _count(session, Incident) == 0


def test_reading_for_other_business_asset_404(post, session):
    r = post(-11.0, user="u_lim")
    assert r.status_code == 404
    assert _count(session, Reading) == 0


def test_reading_for_unknown_asset_404(post, session):
    assert post(-18.0, asset_id="a_nope").status_code == 404


def test_reading_needs_login(client):
    r = client.post("/v1/readings", json={"asset_id": "a_fz2", "temp_c": -18.0})
    assert r.status_code == 401


def test_staff_sees_null_money_supervisor_sees_rm(post, client, as_user):
    assert _golden(post).json()["incident"]["stock_at_risk_rm"] is None    # Aina
    r = client.post("/v1/readings", headers=as_user("u_daniel"),
                    json={"asset_id": "a_fz2", "temp_c": -11.0})
    assert r.json()["incident"]["stock_at_risk_rm"] == "1850.00"


def test_timeline_by_incident_id(post, session):
    inc_id = _golden(post).json()["incident"]["id"]
    actions = [e.action for e in audit.list_events(session, business_id="b_seripagi",
                                                   entity_id=inc_id)]
    assert actions == ["INCIDENT_OPENED", "MESSAGE_SENT", "APPROVAL_REQUESTED", "MESSAGE_SENT"]


def test_no_vendor_needs_human_messages_owner(post, session):
    from app.models import Vendor
    for v in session.exec(select(Vendor)):
        session.delete(v)
    session.commit()
    inc = _golden(post).json()["incident"]
    assert inc["needs_human"] == "No vendor services freezer units — assign one"
    assert _count(session, ApprovalRequest) == 0
    assert any("assign one" in b for b in _messages_to(session, "u_rina"))


def test_backup_unit_must_be_in_range(post, client, as_user, session):
    # Freezer 1 is warm too → it can't take Freezer 2's stock.
    client.post("/v1/readings", headers=as_user("u_aina"), json={"asset_id": "a_fz1", "temp_c": -10.0})
    _golden(post)
    incident = session.exec(select(Incident).where(Incident.asset_id == "a_fz2")).one()
    assert incident.decision["backup_unit"] is None
    assert any("ice box" in b for b in _messages_to(session, "u_aina"))


def test_status_values_stored(post, session):
    _golden(post)
    assert session.exec(select(Incident)).one().status == IncidentStatus.PENDING_APPROVAL
