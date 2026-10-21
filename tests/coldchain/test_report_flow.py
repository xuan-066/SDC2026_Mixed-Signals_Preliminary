from sqlmodel import func, select

from app.core import audit
from app.models import ApprovalRequest, Incident, Message


def report(client, as_user, text, user="u_aina"):
    r = client.post("/v1/reports", headers=as_user(user), json={"text": text})
    assert r.status_code == 200, r.text
    return r.json()


def _count(session, model) -> int:
    return session.exec(select(func.count()).select_from(model)).one()


def _messages_to(session, user_id) -> list[str]:
    return [m.body for m in session.exec(select(Message).where(Message.to_id == user_id)
                                         .order_by(Message.created_at))]


def test_report_opens_critical_incident(client, as_user):
    body = report(client, as_user, "Freezer 2 tak sejuk, ais dah cair")
    assert body["parser_source"] == "rules"
    assert body["parsed"] == {"asset_name": "Freezer 2", "symptom": "not_cooling",
                              "confidence": 0.9}
    owner = client.get(f"/v1/incidents/{body['incident']['id']}", headers=as_user("u_rina")).json()
    assert (owner["severity"], owner["status"], owner["trigger"]) == \
        ("CRITICAL", "PENDING_APPROVAL", "report")
    # Same decision as test_decide_freezer2_critical; only the first reason (the trigger) differs.
    assert owner["stock_at_risk_rm"] == "1850.00"
    assert owner["decision"]["backup_unit"]["id"] == "a_fz1"
    assert owner["decision"]["vendor"]["id"] == "v_cooltech"
    assert owner["approval"]["required_role"] == "owner"
    assert owner["approval"]["amount_rm"] == "180.00"
    assert owner["decision"]["reasons"][0] == "Staff report: Freezer 2 is not cooling → CRITICAL"
    assert owner["decision"]["reasons"][1:] == [
        "RM1,850.00 of stock inside (4 items, 120 L)",
        "Freezer 1 has 180 L free ≥ 120 L needed → move stock there now",
        "Warranty expired 2026-03-01 → paid call-out",
        "CRITICAL → fastest vendor: CoolTech Refrigeration (4 h, RM180.00)",
        "RM180.00 > RM150.00 supervisor limit → owner approval required",
    ]
    assert owner["report_text"] == "Freezer 2 tak sejuk, ais dah cair"
    assert owner["reporter_id"] == "u_aina"


def test_unknown_unit_needs_info(client, as_user, session):
    body = report(client, as_user, "Fridge mati, semua lampu off")
    incident = body["incident"]
    assert incident["status"] == "NEEDS_INFO"
    assert incident["asset"] is None and incident["decision"] is None
    assert session.get(Incident, incident["id"]).asset_id is None
    [reply] = _messages_to(session, "u_aina")
    assert reply == "Which unit? Display Chiller / Freezer 1 / Freezer 2 / Kitchen Chiller"
    assert _count(session, ApprovalRequest) == 0
    assert _messages_to(session, "u_rina") == []            # nobody senior woken yet


def test_clarify_continues_journey(client, as_user, session):
    inc_id = report(client, as_user, "Fridge mati, semua lampu off")["incident"]["id"]
    r = client.post(f"/v1/incidents/{inc_id}/clarify", headers=as_user("u_aina"),
                    json={"asset_id": "a_fz2"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["status"], body["severity"]) == ("PENDING_APPROVAL", "CRITICAL")   # power_off
    assert body["asset"]["id"] == "a_fz2"
    assert body["decision"]["reasons"][0] == "Staff report: Freezer 2 has no power → CRITICAL"
    actions = [e.action for e in audit.list_events(session, business_id="b_seripagi",
                                                   entity_id=inc_id)]
    assert actions[:3] == ["NEEDS_INFO", "MESSAGE_SENT", "CLARIFIED"]
    assert "APPROVAL_REQUESTED" in actions
    assert _count(session, ApprovalRequest) == 1


def test_clarify_only_once_and_only_own_units(client, as_user):
    inc_id = report(client, as_user, "hello")["incident"]["id"]
    url = f"/v1/incidents/{inc_id}/clarify"
    assert client.post(url, headers=as_user("u_aina"), json={"asset_id": "a_bm_fz1"}).status_code == 404
    assert client.post(url, headers=as_user("u_lim"), json={"asset_id": "a_bm_fz1"}).status_code == 404
    assert client.post(url, headers=as_user("u_aina"), json={"asset_id": "a_ch1"}).status_code == 200
    assert client.post(url, headers=as_user("u_aina"), json={"asset_id": "a_ch1"}).status_code == 409


def test_low_confidence_with_unit_still_asks(client, as_user):
    # Unit found but no symptom → confidence 0.5 < 0.6 → ask first (plan T12).
    body = report(client, as_user, "Freezer 2 ada masalah")
    assert body["parsed"]["confidence"] == 0.5
    assert body["incident"]["status"] == "NEEDS_INFO"


def test_report_on_unit_with_open_incident_reuses_it(client, as_user, session):
    first = report(client, as_user, "fz2 not cold")["incident"]["id"]
    second = report(client, as_user, "Freezer 2 still warm, ais cair")["incident"]["id"]
    assert first == second
    assert _count(session, Incident) == 1 and _count(session, ApprovalRequest) == 1


def test_pii_never_stored(client, as_user, session):
    report(client, as_user, "fz2 tak sejuk, call me 012-345 6789")
    stored = session.exec(select(Incident)).one().report_text
    assert stored == "fz2 tak sejuk, call me [phone]"


def test_warning_symptom_goes_to_supervisor(client, as_user, session):
    body = report(client, as_user, "Kitchen chiller bocor air kat bawah")
    sup = client.get(f"/v1/incidents/{body['incident']['id']}", headers=as_user("u_daniel")).json()
    assert sup["severity"] == "WARNING"
    assert sup["decision"]["vendor"]["id"] == "v_sejukjaya"       # cheapest, RM120
    assert sup["approval"]["required_role"] == "supervisor"


def test_report_needs_login_and_text(client, as_user):
    assert client.post("/v1/reports", json={"text": "fz2 mati"}).status_code == 401
    assert client.post("/v1/reports", headers=as_user("u_aina"), json={"text": ""}).status_code == 422
