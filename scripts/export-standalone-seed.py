"""Export ONLY the fresh fictional world, never a configured/operational database."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "artifacts/api-server/python"))

from fastapi.testclient import TestClient
from app.demo import create_demo_app

world = {"version": 1, "users": [], "businesses": {}, "profiles": {}, "notifications": {}, "tokens": {}, "transfers": {}}
app = create_demo_app()
with TestClient(app) as client:
    for user in client.get("/v1/access").json()["demo_users"]:
        headers = {"X-User-Id": user["id"]}

        def get(path):
            response = client.get("/v1" + path, headers=headers)
            response.raise_for_status()
            return response.json()

        me = get("/me")
        world["users"].append(me)
        world["profiles"][me["id"]] = get("/profile")
        world["notifications"][me["id"]] = get("/notifications")
        if me["role"] == "owner":
            world["businesses"][me["business_id"]] = {
                "settings": get("/settings"),
                "assets": [get("/assets/" + asset["id"]) for asset in get("/assets")],
                "incidents": get("/incidents"),
                "vendors": get("/vendors"),
                "jobs": get("/jobs"),
                "audit": get("/audit"),
                "messages": get("/messages"),
                "team": get("/team"),
                "invitations": [],
            }
    world["seed_time"] = app.state.clock.now().isoformat()

destination = root / "artifacts/sejukguard/src/standalone/seed.json"
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(world, ensure_ascii=False, indent=2) + "\n")
print(f"Exported fictional sample data to {destination.relative_to(root)}")
