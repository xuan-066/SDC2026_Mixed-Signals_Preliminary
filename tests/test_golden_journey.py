"""The demo script (plan §19) as one test. If this is red, the demo is broken.

Step numbers match the table in §19. Everything goes over HTTP, like the UI and the judges.
"""


def test_golden_journey_freezer_failure(client, as_user):
    def post(url, user=None, **body):
        r = client.post(url, headers=as_user(user) if user else {}, json=body or None)
        return r

    def get(url, user):
        r = client.get(url, headers=as_user(user))
        assert r.status_code == 200, r.text
        return r.json()

    def reading(temp_c):
        r = post("/v1/readings", "u_aina", asset_id="a_fz2", temp_c=temp_c, source="sim")
        assert r.status_code == 200, r.text
        return r.json()

    def advance(minutes):
        r = post("/v1/sim/advance", minutes=minutes)
        assert r.status_code == 200, r.text
        return r.json()

    # 1 — "It's 9 pm. The owner, Rina, is at home."
    r = post("/v1/sim/reset")
    assert r.status_code == 200
    assert r.json()["now"] == "2026-11-12T13:00:00Z"                    # 21:00 MYT

    # 2 — normal reading
    assert reading(-18.0)["incident"] is None

    # 3 — one warm reading could just be the door: WATCH, nobody woken
    advance(15)
    assert reading(-13.0)["incident"] is None
    assert get("/v1/messages", "u_rina") == []

    # 4 — trigger → connected data → decision
    advance(15)
    incident = reading(-11.0)["incident"]
    assert incident["severity"] == "CRITICAL"
    assert incident["status"] == "PENDING_APPROVAL"
    inc_id = incident["id"]

    owner_view = get(f"/v1/incidents/{inc_id}", "u_rina")
    assert owner_view["stock_at_risk_rm"] == "1850.00"
    assert owner_view["decision"]["backup_unit"]["id"] == "a_fz1"
    assert owner_view["decision"]["vendor"]["id"] == "v_cooltech"
    assert owner_view["decision"]["reasons"] == [
        "Freezer 2 is at -11.0°C, 4.0°C above its -15.0°C limit → CRITICAL (≥3.0°C)",
        "RM1,850.00 of stock inside (4 items, 120 L)",
        "Freezer 1 has 180 L free ≥ 120 L needed → move stock there now",
        "Warranty expired 2026-03-01 → paid call-out",
        "CRITICAL → fastest vendor: CoolTech Refrigeration (4 h, RM180.00)",
        "RM180.00 > RM150.00 supervisor limit → owner approval required",
    ]
    approval = owner_view["approval"]
    assert (approval["required_role"], approval["amount_rm"]) == ("owner", "180.00")
    [to_staff] = get("/v1/messages?to_id=u_aina", "u_rina")
    assert "Freezer 1" in to_staff["body"]

    # 5 — people stay in control: RM180 is above Daniel's RM150 limit
    r = post(f"/v1/approvals/{approval['id']}/approve", "u_daniel")
    assert r.status_code == 403
    assert r.json()["error"]["message"] == "Owner approval required for RM180.00"

    # 6 — Rina approves on her phone → outcome
    r = post(f"/v1/approvals/{approval['id']}/approve", "u_rina")
    assert r.status_code == 200, r.text
    incident = r.json()["incident"]
    assert incident["status"] == "DISPATCHED"
    assert incident["job"]["status"] == "REQUESTED"
    job_id = incident["job"]["id"]
    assert len(get("/v1/messages?to_id=v_cooltech", "u_rina")) == 1

    # 7 — no more owners chasing technicians at night
    actions = advance(60)["actions"]
    assert any("Chased CoolTech Refrigeration" in a for a in actions)
    assert get(f"/v1/incidents/{inc_id}", "u_rina")["job"]["chase_count"] == 1

    # 8 — vendor reply (entered by Daniel)
    r = post(f"/v1/jobs/{job_id}/confirm", "u_daniel")
    assert r.status_code == 200, r.text
    assert r.json()["job"]["status"] == "CONFIRMED"

    # 9 — back in range, technician done
    reading(-17.5)
    r = post(f"/v1/jobs/{job_id}/complete", "u_daniel")
    assert r.status_code == 200, r.text
    assert r.json()["incident"]["status"] == "RESOLVED"

    # 10 — measurable benefit
    metrics = get("/v1/metrics", "u_rina")
    assert metrics["incidents_resolved"] == 1
    assert metrics["stock_protected_rm"] == "1850.00"
    assert metrics["false_alarms_avoided"] == 0

    # 11 — activity record, in order
    story = [e["action"] for e in get(f"/v1/audit?entity_id={inc_id}", "u_rina")
             if e["action"] != "MESSAGE_SENT"]
    assert story == ["INCIDENT_OPENED", "APPROVAL_REQUESTED", "APPROVAL_FORBIDDEN", "APPROVED",
                     "JOB_CREATED", "VENDOR_CHASED", "VENDOR_CONFIRMED", "JOB_DONE",
                     "INCIDENT_RESOLVED"]
