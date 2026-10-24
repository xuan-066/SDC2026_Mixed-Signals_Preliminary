import pytest
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError
from sqlmodel import Session

from app.config import Settings
from app.demo import create_demo_app
from app.main import create_app
from app.models import User


def test_public_demo_starts_in_production_without_opening_configured_database(monkeypatch, tmp_path):
    unused = tmp_path / "must-not-open.sqlite"
    monkeypatch.setenv("REPLIT_DEPLOYMENT", "1")
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{unused}")
    app = create_demo_app(read_only=True)
    with TestClient(app) as client:
        access = client.get("/v1/access").json()
        assert access["read_only"] is True
        assert len(access["demo_users"]) == 4
        assert client.get("/health").json() == {"status": "ok"}
        owner = {"X-User-Id": "u_rina"}
        assert client.get("/v1/me", headers=owner).json()["name"] == "Rina"
        incidents = client.get("/v1/incidents", headers=owner).json()
        assert incidents[0]["severity"] == "CRITICAL"
        assert incidents[0]["approval"]["status"] == "PENDING"
        assert client.get("/v1/me", headers={"X-User-Id": "u_lim"}).json()["business_id"] == "b_bekumaju"
        assert not unused.exists()


@pytest.mark.parametrize("method,path", [
    ("POST", "/v1/reports"),
    ("POST", "/v1/readings"),
    ("POST", "/v1/sim/reset"),
    ("POST", "/v1/sim/advance"),
    ("POST", "/v1/approvals/anything/approve"),
    ("POST", "/v1/transfers"),
    ("PUT", "/v1/profile"),
    ("PATCH", "/v1/team/u_aina"),
    ("DELETE", "/v1/assets/a_fz2"),
    ("POST", "/api/__clerk/v1/client"),
])
def test_public_demo_rejects_all_changes(method, path):
    with TestClient(create_demo_app(read_only=True)) as client:
        result = client.request(method, path, headers={"X-User-Id": "u_rina"}, json={})
        assert result.status_code == 403
        assert result.json()["error"]["code"] == "DEMO_READ_ONLY"
        assert client.get("/v1/profile", headers={"X-User-Id": "u_rina"}).json()["name"] == "Rina"


def test_database_itself_is_query_only_after_snapshot():
    app = create_demo_app(read_only=True)
    with TestClient(app):
        with Session(app.state.engine) as session:
            user = session.get(User, "u_rina")
            user.name = "Not allowed"
            session.add(user)
            with pytest.raises(OperationalError, match="readonly"):
                session.commit()


def test_read_only_mode_cannot_be_used_with_a_real_database():
    with pytest.raises(RuntimeError, match="isolated in-memory"):
        create_app(Settings(
            database_url="sqlite:///existing.sqlite", demo_mode=True,
            view_only_demo=True, run_worker=False,
        ))


def test_demo_import_never_uses_an_operational_database_setting():
    result = subprocess.run(
        [sys.executable, "-c", "from app.demo import app; assert str(app.state.engine.url) == 'sqlite://'"],
        env={**os.environ, "DATABASE_URL": "unsupported-database-driver://must-not-be-used"},
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr


def test_interactive_demo_is_still_blocked_in_production(monkeypatch):
    monkeypatch.setenv("REPLIT_DEPLOYMENT", "1")
    with pytest.raises(RuntimeError, match="Demo mode may not"):
        with TestClient(create_app(Settings(database_url="sqlite://", demo_mode=True))):
            pass


def test_isolated_public_demo_can_edit_sample_records_and_restarts_clean(monkeypatch):
    monkeypatch.setenv("REPLIT_DEPLOYMENT", "1")
    monkeypatch.setenv("NODE_ENV", "production")
    with TestClient(create_demo_app()) as client:
        owner = {"X-User-Id": "u_rina"}
        access = client.get("/v1/access").json()
        assert access["read_only"] is False
        assert access["public_demo"] is True
        result = client.put("/v1/profile", headers=owner, json={"name": "Demo visitor", "phone": "demo"})
        assert result.status_code == 200
        assert client.get("/v1/profile", headers=owner).json()["name"] == "Demo visitor"
        # Other browser sessions using this sample account see the same record.
        assert client.get("/v1/me", headers=owner).json()["name"] == "Demo visitor"
        approval = client.get("/v1/incidents", headers=owner).json()[0]["approval"]
        result = client.post(f"/v1/approvals/{approval['id']}/approve", headers=owner, json={})
        assert result.status_code == 200
        assert client.get("/v1/jobs", headers=owner).json()
        assert client.post("/api/__clerk/v1/client", json={}).status_code == 403
    with TestClient(create_demo_app()) as client:
        assert client.get("/v1/profile", headers=owner).json()["name"] == "Rina"
        assert client.get("/v1/incidents", headers=owner).json()[0]["approval"]["status"] == "PENDING"


def test_parallel_demo_visitors_do_not_share_overlapping_sqlite_transactions():
    with TestClient(create_demo_app()) as client:
        def visit(index):
            headers = {"X-User-Id": "u_rina"}
            if index % 5 == 0:
                return client.put("/v1/profile", headers=headers, json={"name": "Rina", "phone": "demo"}).status_code
            path = ["/v1/me", "/v1/metrics", "/v1/assets", "/v1/profile"][index % 4]
            return client.get(path, headers=headers).status_code
        with ThreadPoolExecutor(max_workers=12) as executor:
            assert list(executor.map(visit, range(60))) == [200] * 60
