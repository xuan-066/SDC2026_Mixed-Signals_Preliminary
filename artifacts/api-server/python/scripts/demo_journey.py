"""Run the demo (plan §19) against a live server and print each step. Exit 0 = demo works.

    python scripts/demo_journey.py                                   # local: http://127.0.0.1:8000
    python scripts/demo_journey.py --base-url https://<your-app>.replit.app
    python scripts/demo_journey.py --base-url ... --pause            # wait for Enter between steps

This is the CLI fallback for judging (plan §20): if the UI breaks, run this instead.
It starts with POST /v1/sim/reset, so it wipes the demo data on that server.
"""
import argparse
import sys
from datetime import datetime, timedelta, timezone

import httpx

sys.stdout.reconfigure(encoding="utf-8")      # Windows consoles choke on ✅ and →
MYT = timezone(timedelta(hours=8))


class StepFailed(Exception):
    pass


class Demo:
    def __init__(self, base_url: str, pause: bool):
        self.http = httpx.Client(base_url=base_url.rstrip("/"), timeout=30)
        self.pause = pause

    def call(self, method: str, path: str, user: str | None = None, expect: int = 200, **json):
        headers = {"X-User-Id": user} if user else {}
        r = self.http.request(method, path, headers=headers, json=json or None)
        if r.status_code != expect:
            raise StepFailed(f"{method} {path} as {user or '-'}: expected {expect}, "
                             f"got {r.status_code}: {r.text[:300]}")
        return r.json()

    def step(self, number: str, title: str, say: str, fn):
        try:
            detail = fn()
        except (StepFailed, KeyError, TypeError, AssertionError) as exc:
            print(f"❌ {number}. {title}\n      {exc}")
            raise SystemExit(1)
        print(f"✅ {number}. {title}")
        if detail:
            print(f"      {detail}")
        print(f"      say: {say}")
        if self.pause:
            input("      [Enter] for the next step ")

    def reading(self, temp_c: float):
        return self.call("POST", "/v1/readings", "u_aina",
                         asset_id="a_fz2", temp_c=temp_c, source="sim")["incident"]

    def advance(self, minutes: int):
        return self.call("POST", "/v1/sim/advance", minutes=minutes)


def run(demo: Demo) -> None:
    s = {}

    def check(ok: bool, what: str):
        if not ok:
            raise AssertionError(what)

    def step1():
        now = demo.call("POST", "/v1/sim/reset")["now"]
        check(now == "2026-11-12T13:00:00Z", f"clock is {now}")
        return "clock 21:00 MYT"

    def step2():
        check(demo.reading(-18.0) is None, "incident opened on a normal reading")
        return "Freezer 2 at -18.0°C → normal"

    def step3():
        demo.advance(15)
        check(demo.reading(-13.0) is None, "incident opened on a single warm reading")
        return "Freezer 2 at -13.0°C → WATCH, nobody messaged"

    def step4():
        demo.advance(15)
        inc = demo.reading(-11.0)
        check(inc is not None and inc["severity"] == "CRITICAL", f"got {inc}")
        s["inc"] = inc["id"]
        owner = demo.call("GET", f"/v1/incidents/{s['inc']}", "u_rina")
        s["apr"] = owner["approval"]["id"]
        check(owner["stock_at_risk_rm"] == "1850.00", "stock at risk")
        check(owner["decision"]["backup_unit"]["id"] == "a_fz1", "backup unit")
        check(owner["decision"]["vendor"]["id"] == "v_cooltech", "vendor")
        check(owner["approval"]["amount_rm"] == "180.00", "approval amount")
        return "CRITICAL, RM1,850 at risk. Reasons:\n" + "\n".join(
            f"        {i}. {r}" for i, r in enumerate(owner["decision"]["reasons"], 1))

    def step5():
        err = demo.call("POST", f"/v1/approvals/{s['apr']}/approve", "u_daniel", expect=403)
        return f"Daniel → 403 \"{err['error']['message']}\" (and it's logged)"

    def step6():
        inc = demo.call("POST", f"/v1/approvals/{s['apr']}/approve", "u_rina")["incident"]
        check(inc["status"] == "DISPATCHED", f"status {inc['status']}")
        s["job"] = inc["job"]["id"]
        return "Rina approves → DISPATCHED, job request sent to CoolTech"

    def step7():
        actions = demo.advance(60)["actions"]
        check(any("Chased CoolTech" in a for a in actions), f"actions {actions}")
        return f"+60 min: {actions[0]}"

    def step8():
        job = demo.call("POST", f"/v1/jobs/{s['job']}/confirm", "u_daniel")["job"]
        check(job["status"] == "CONFIRMED", job["status"])
        eta = datetime.fromisoformat(job["eta"].replace("Z", "+00:00")).astimezone(MYT)
        return f"CoolTech confirmed, technician by {eta:%H:%M} MYT"

    def step9():
        demo.reading(-17.5)
        inc = demo.call("POST", f"/v1/jobs/{s['job']}/complete", "u_daniel")["incident"]
        check(inc["status"] == "RESOLVED", inc["status"])
        return "Freezer 2 back at -17.5°C, job done → RESOLVED"

    def step10():
        m = demo.call("GET", "/v1/metrics", "u_rina")
        check(m["incidents_resolved"] == 1 and m["stock_protected_rm"] == "1850.00", str(m))
        return (f"resolved {m['incidents_resolved']}, "
                f"stock protected RM{float(m['stock_protected_rm']):,.2f}, "
                f"automated actions {m['automated_actions']}")

    def step11():
        events = demo.call("GET", f"/v1/audit?entity_id={s['inc']}", "u_rina")
        story = [e["action"] for e in events if e["action"] != "MESSAGE_SENT"]
        want = ["INCIDENT_OPENED", "APPROVAL_REQUESTED", "APPROVAL_FORBIDDEN", "APPROVED",
                "JOB_CREATED", "VENDOR_CHASED", "VENDOR_CONFIRMED", "JOB_DONE",
                "INCIDENT_RESOLVED"]
        check(story == want, f"audit {story}")
        return " → ".join(story)

    demo.step("1", "Reset", "It's 9 pm. The owner, Rina, is at home.", step1)
    demo.step("2", "Normal reading", "Freezer 2 is fine.", step2)
    demo.step("3", "One warm reading",
              "One warm reading could just be the door opening. We don't wake the owner.", step3)
    demo.step("4", "Freezer 2 fails", "Trigger → connected data → decision. Read the reasons.", step4)
    demo.step("5", "Supervisor tries to approve",
              "People stay in control: RM180 is above Daniel's RM150 limit.", step5)
    demo.step("6", "Owner approves", "Human approval → outcome.", step6)
    demo.step("7", "Vendor chased", "No more owners chasing technicians at night.", step7)
    demo.step("8", "Vendor confirms", "The reply is recorded.", step8)
    demo.step("9", "Repaired", "Back in range, incident closed.", step9)
    demo.step("10", "Metrics", "Measurable benefit.", step10)
    demo.step("11", "Activity log", "Every step is on record.", step11)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--base-url", default="http://127.0.0.1:8000")
    ap.add_argument("--pause", action="store_true", help="wait for Enter after each step")
    args = ap.parse_args()

    demo = Demo(args.base_url, args.pause)
    try:
        health = demo.call("GET", "/health")
    except httpx.HTTPError as exc:
        print(f"❌ cannot reach {args.base_url}: {exc}\n   Is the server running / awake?")
        return 1
    print(f"Server {args.base_url} is up ({health['status']}).\n")
    run(demo)
    print("\nAll 11 steps passed. The demo works on this server.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
