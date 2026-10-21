import pytest

from app.schemas import IncidentOut

# Every [M] route of plan §10.
MUST_ROUTES = [
    ("get", "/health"), ("get", "/v1/me"), ("post", "/v1/readings"),
    ("get", "/v1/assets"), ("get", "/v1/assets/{asset_id}"), ("get", "/v1/vendors"),
    ("get", "/v1/incidents"), ("get", "/v1/incidents/{incident_id}"),
    ("get", "/v1/approvals"), ("post", "/v1/approvals/{approval_id}/approve"),
    ("post", "/v1/approvals/{approval_id}/reject"),
    ("post", "/v1/jobs/{job_id}/confirm"), ("post", "/v1/jobs/{job_id}/complete"),
    ("get", "/v1/messages"), ("get", "/v1/audit"), ("get", "/v1/metrics"),
    ("post", "/v1/sim/reset"),
]
# T9 adds ("post", "/v1/sim/advance") and ("post", "/v1/sim/sensor") to MUST_ROUTES.


@pytest.fixture
def critical(app, client, as_user):
    """Demo steps 2–4: Freezer 2 goes CRITICAL. Returns the incident id."""
    for i, t in enumerate((-18.0, -13.0, -11.0)):
        if i:
            app.state.clock.advance(15)
        r = client.post("/v1/readings", headers=as_user("u_aina"),
                        json={"asset_id": "a_fz2", "temp_c": t})
    return r.json()["incident"]["id"]


def get(client, as_user, url, user):
    return client.get(url, headers=as_user(user))


def test_openapi_lists_all_must_routes(app):
    paths = app.openapi()["paths"]
    missing = [(m, p) for m, p in MUST_ROUTES if m not in paths.get(p, {})]
    assert missing == []


def test_incident_detail_matches_contract(client, as_user, critical):
    body = get(client, as_user, f"/v1/incidents/{critical}", "u_rina").json()
    IncidentOut.model_validate(body)
    assert body["asset"] == {"id": "a_fz2", "name": "Freezer 2", "latest_temp_c": -11.0,
                             "range_c": [-35.0, -15.0]}
    assert body["stock_at_risk_rm"] == "1850.00"
    assert body["decision"]["backup_unit"] == {"id": "a_fz1", "name": "Freezer 1", "free_l": 180}
    assert body["decision"]["vendor"] == {"id": "v_cooltech", "name": "CoolTech Refrigeration",
                                          "callout_rm": "180.00", "sla_hours": 4}
    assert body["approval"]["amount_rm"] == "180.00" and body["approval"]["can_decide"] is True
    assert body["job"] is None
    times = [e["at"] for e in body["timeline"]]
    assert times == sorted(times)
    assert body["timeline"][0]["action"] == "INCIDENT_OPENED"


def test_staff_sees_null_money(client, as_user, critical):
    staff = get(client, as_user, f"/v1/incidents/{critical}", "u_aina").json()
    assert staff["stock_at_risk_rm"] is None
    assert staff["approval"]["amount_rm"] is None
    assert staff["decision"]["vendor"]["callout_rm"] is None
    assert all(e["details"] == {} for e in staff["timeline"])
    assert staff["decision"]["reasons"]                         # reasons are still shown
    sup = get(client, as_user, f"/v1/incidents/{critical}", "u_daniel").json()
    assert sup["stock_at_risk_rm"] == "1850.00"

    detail = get(client, as_user, "/v1/assets/a_fz2", "u_aina").json()
    assert detail["stock_value_rm"] is None
    assert all(s["value_rm"] is None for s in detail["stock"])
    assert get(client, as_user, "/v1/assets/a_fz2", "u_rina").json()["stock_value_rm"] == "1850.00"


def test_pending_approvals_can_decide_flag(client, as_user, critical):
    [sup] = get(client, as_user, "/v1/approvals?status=PENDING", "u_daniel").json()
    assert sup["amount_rm"] == "180.00" and sup["can_decide"] is False
    assert sup["summary"] == "CoolTech Refrigeration call-out for Freezer 2 (CRITICAL)"
    [owner] = get(client, as_user, "/v1/approvals?status=PENDING", "u_rina").json()
    assert owner["can_decide"] is True
    assert get(client, as_user, "/v1/approvals", "u_aina").status_code == 403
    assert get(client, as_user, "/v1/approvals?status=APPROVED", "u_rina").json() == []


def test_audit_owner_only(client, as_user, critical):
    assert get(client, as_user, "/v1/audit", "u_daniel").status_code == 403
    assert get(client, as_user, "/v1/metrics", "u_daniel").status_code == 403
    events = get(client, as_user, f"/v1/audit?entity_id={critical}", "u_rina").json()
    assert events[0]["action"] == "INCIDENT_OPENED"


def test_assets_status_after_bad_reading(client, as_user, critical):
    assets = {a["id"]: a for a in get(client, as_user, "/v1/assets", "u_aina").json()}
    assert set(assets) == {"a_fz1", "a_fz2", "a_ch1", "a_ch2"}       # not Beku Maju's
    assert assets["a_fz2"]["status"] == "CRITICAL"
    assert assets["a_fz2"]["latest_temp_c"] == -11.0
    assert assets["a_fz2"]["active_incident_id"] == critical
    assert assets["a_fz1"]["status"] == "NORMAL" and assets["a_fz1"]["free_l"] == 180


def test_asset_detail_readings_oldest_first(client, as_user, critical):
    detail = get(client, as_user, "/v1/assets/a_fz2", "u_aina").json()
    assert [r["temp_c"] for r in detail["readings"]] == [-18.0, -13.0, -11.0]
    assert len(detail["stock"]) == 4 and detail["warranty_until"] == "2026-03-01"


def test_cross_business_asset_404(client, as_user):
    assert get(client, as_user, "/v1/assets/a_fz2", "u_lim").status_code == 404
    assert [a["id"] for a in get(client, as_user, "/v1/assets", "u_lim").json()] == \
        ["a_bm_fz1", "a_bm_fz2"]


def test_vendors_supervisor_only(client, as_user):
    assert get(client, as_user, "/v1/vendors", "u_aina").status_code == 403
    vendors = {v["id"]: v for v in get(client, as_user, "/v1/vendors", "u_daniel").json()}
    assert vendors["v_cooltech"]["callout_rm"] == "180.00"
    assert vendors["v_brandcare"]["warranty_only"] is True


def test_messages_outbox_filter(client, as_user, critical):
    assert get(client, as_user, "/v1/messages", "u_aina").status_code == 403
    [to_rina] = get(client, as_user, "/v1/messages?to_id=u_rina", "u_daniel").json()
    assert "Approval needed" in to_rina["body"] and to_rina["channel"] == "whatsapp_mock"
    assert len(get(client, as_user, "/v1/messages", "u_daniel").json()) == 2


def test_incident_list_filter(client, as_user, critical):
    assert [i["id"] for i in get(client, as_user, "/v1/incidents", "u_aina").json()] == [critical]
    assert get(client, as_user, "/v1/incidents?status=RESOLVED", "u_aina").json() == []
    assert get(client, as_user, "/v1/incidents", "u_lim").json() == []


def test_metrics_after_resolved_journey(app, client, as_user, critical):
    approval_id = get(client, as_user, f"/v1/incidents/{critical}", "u_rina").json()["approval"]["id"]
    app.state.clock.advance(10)                                  # Rina approves 10 min later
    job_id = client.post(f"/v1/approvals/{approval_id}/approve", headers=as_user("u_rina"),
                         json={}).json()["incident"]["job"]["id"]
    client.post(f"/v1/jobs/{job_id}/confirm", headers=as_user("u_daniel"), json={})
    app.state.clock.advance(120)
    client.post("/v1/readings", headers=as_user("u_aina"), json={"asset_id": "a_fz2", "temp_c": -17.5})
    client.post(f"/v1/jobs/{job_id}/complete", headers=as_user("u_daniel"))

    m = get(client, as_user, "/v1/metrics", "u_rina").json()
    assert m["incidents_total"] == 1
    assert m["incidents_resolved"] == 1
    assert m["stock_protected_rm"] == "1850.00"
    assert m["median_min_detect_to_dispatch"] == 10.0
    assert m["automated_actions"] > 0
    assert m["false_alarms_avoided"] == 0


def test_metrics_counts_false_alarm(app, client, as_user):
    for i, t in enumerate((-18.0, -13.0, -18.0)):
        app.state.clock.advance(15 if i else 0)
        client.post("/v1/readings", headers=as_user("u_aina"), json={"asset_id": "a_fz2", "temp_c": t})
    m = get(client, as_user, "/v1/metrics", "u_rina").json()
    assert m["false_alarms_avoided"] == 1 and m["incidents_total"] == 0
    assert m["median_min_detect_to_dispatch"] is None and m["stock_protected_rm"] == "0.00"
