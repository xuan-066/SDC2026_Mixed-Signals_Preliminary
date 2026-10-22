"""Startup, additive migration and independently scheduled real-clock checks."""
import asyncio
from datetime import UTC, datetime, timedelta
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlmodel import Session, select

from app.config import Settings
from app.db import init_db, make_engine
from app.main import create_app
from app.models import Business, Asset, Incident, ServiceJob, Vendor, User, Identity
from app.enums import IncidentStatus, JobStatus, Role, Severity
from app.core.worker import reminder_worker
from app.core.identity import Principal, verified_principal


def test_additive_archival_upgrade_keeps_existing_rows(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path}/legacy.sqlite")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE asset (id TEXT PRIMARY KEY, name TEXT NOT NULL)")
        connection.exec_driver_sql("CREATE TABLE vendor (id TEXT PRIMARY KEY, name TEXT NOT NULL)")
        connection.exec_driver_sql("INSERT INTO asset VALUES ('legacy-a', 'Original freezer')")
        connection.exec_driver_sql("INSERT INTO vendor VALUES ('legacy-v', 'Original vendor')")
    init_db(engine)
    init_db(engine)  # Repeat startup is safe.
    with engine.connect() as connection:
        assert "archived" in {c["name"] for c in inspect(connection).get_columns("asset")}
        assert connection.exec_driver_sql("SELECT name, archived FROM asset").one() == ("Original freezer", 0)
        assert connection.exec_driver_sql("SELECT name, archived FROM vendor").one() == ("Original vendor", 0)
    engine.dispose()


def test_real_worker_runs_without_browser_and_keeps_claim_on_restart(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path}/worker.sqlite")
    init_db(engine)
    now = datetime.now(UTC)
    with Session(engine) as session:
        session.add(Business(id="b", name="Worker fixture", kind="bakery"))
        session.add(Asset(id="a", business_id="b", name="Freezer", type="freezer",
                          min_c=-24, max_c=-15, capacity_l=200))
        session.add(Vendor(id="v", business_id="b", name="Vendor", services=["freezer"],
                           callout_fee_sen=100, sla_hours=2, phone="000"))
        session.add(Incident(id="i", business_id="b", asset_id="a", trigger="report",
                             severity=Severity.CRITICAL, status=IncidentStatus.DISPATCHED, created_at=now))
        session.add(ServiceJob(id="j", business_id="b", incident_id="i", vendor_id="v",
                               requested_at=now - timedelta(hours=1)))
        session.commit()

    async def lifecycle():
        stop = asyncio.Event()
        worker = asyncio.create_task(reminder_worker(engine, stop))
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            with Session(engine) as session:
                if session.get(ServiceJob, "j").chase_count == 1:
                    break
            await asyncio.sleep(.05)
        stop.set()
        await worker
    asyncio.run(lifecycle())
    engine.dispose()
    reopened = make_engine(f"sqlite:///{tmp_path}/worker.sqlite")
    from app.core.worker import run_once
    assert run_once(reopened) == []
    with Session(reopened) as session:
        assert session.get(ServiceJob, "j").chase_count == 1
    reopened.dispose()


def test_published_sqlite_is_blocked_even_with_acknowledgment(monkeypatch, tmp_path):
    monkeypatch.setenv("REPLIT_DEPLOYMENT", "1")
    monkeypatch.setenv("SQLITE_PERSISTENT_STORAGE_CONFIRMED", "true")
    app = create_app(Settings(database_url=f"sqlite:///{tmp_path}/published.sqlite", run_worker=False))
    with pytest.raises(RuntimeError, match="ephemeral"):
        with TestClient(app):
            pass


def test_demo_refuses_real_membership_and_registration(tmp_path):
    database_url = f"sqlite:///{tmp_path}/mixed.sqlite"
    engine = make_engine(database_url)
    init_db(engine)
    with Session(engine) as session:
        session.add(Business(id="b", name="Real business fixture", kind="cafe"))
        session.add(User(id="u", business_id="b", name="Real member", phone="", role=Role.OWNER))
        session.flush()
        session.add(Identity(subject="provider-user", user_id="u", email="fixture@example.test"))
        session.commit()
    engine.dispose()
    with pytest.raises(RuntimeError, match="real memberships"):
        with TestClient(create_app(Settings(database_url=database_url, demo_mode=True))):
            pass
    app = create_app(Settings(database_url="sqlite://", demo_mode=True))
    app.dependency_overrides[verified_principal] = lambda: Principal("provider-user", "fixture@example.test", True, "Fixture")
    with TestClient(app) as client:
        assert client.post("/v1/onboarding", json={"name": "No mixed data", "kind": "cafe"}).status_code == 403
