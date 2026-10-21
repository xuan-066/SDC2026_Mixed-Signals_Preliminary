from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlmodel import Session, func, select

from app.config import Settings
from app.core.clock import DEMO_START
from app.main import create_app
from app.models import Asset, Business, Reading, StockItem, User, Vendor


def _count(session, model) -> int:
    return session.exec(select(func.count()).select_from(model)).one()


def _counts(engine) -> dict:
    with Session(engine) as s:
        return {m.__name__: _count(s, m) for m in (Business, User, Asset, Vendor, StockItem, Reading)}


def test_seed_counts(session):
    assert _count(session, Business) == 2
    assert _count(session, User) == 4
    assert _count(session, Asset) == 6
    assert _count(session, Vendor) == 3


def test_freezer2_stock_value(session):
    items = session.exec(select(StockItem).where(StockItem.asset_id == "a_fz2")).all()
    assert sum(i.qty * i.unit_cost_sen for i in items) == 185000
    assert sum(i.volume_l for i in items) == 120


def test_freezer1_free_capacity(session):
    fz1 = session.get(Asset, "a_fz1")
    used = sum(i.volume_l for i in session.exec(select(StockItem).where(StockItem.asset_id == "a_fz1")))
    assert fz1.capacity_l - used == 180


def test_stock_volume_matches_plan_for_every_unit(session):
    expected = {"a_fz1": 220, "a_fz2": 120, "a_ch1": 90, "a_ch2": 140}
    for asset_id, volume in expected.items():
        items = session.exec(select(StockItem).where(StockItem.asset_id == asset_id)).all()
        assert sum(i.volume_l for i in items) == volume, asset_id


def test_stock_items_belong_to_their_assets_business(session):
    for item in session.exec(select(StockItem)):
        assert item.business_id == session.get(Asset, item.asset_id).business_id


def test_reset_is_idempotent(app, client):
    before = _counts(app.state.engine)
    with Session(app.state.engine) as s:          # dirty the DB and move the clock
        s.add(Reading(asset_id="a_fz2", temp_c=-11.0, recorded_at=app.state.clock.now(), source="sim"))
        s.commit()
    app.state.clock.advance(90)

    for _ in range(2):
        r = client.post("/v1/sim/reset")
        assert r.status_code == 200
        assert r.json()["now"] == "2026-11-12T13:00:00+00:00"

    assert _counts(app.state.engine) == before    # the added Reading is gone too
    assert app.state.clock.now() == DEMO_START


def test_datetimes_come_back_timezone_aware(session, app):
    at = datetime(2026, 11, 12, 13, 15, tzinfo=UTC)
    session.add(Reading(id="rd_tz", asset_id="a_fz2", temp_c=-18.0, recorded_at=at, source="sim"))
    session.commit()
    session.expire_all()
    assert session.get(Reading, "rd_tz").recorded_at == at


def test_sim_routes_absent_when_demo_mode_off():
    app = create_app(Settings(database_url="sqlite://", demo_mode=False))
    with TestClient(app) as c:
        assert c.post("/v1/sim/reset").status_code == 404
