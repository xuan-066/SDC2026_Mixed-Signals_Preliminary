import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.config import Settings
from app.main import create_app


@pytest.fixture
def app():
    # Fresh in-memory DB per test; the clock starts at 2026-11-12T13:00:00Z (plan §16.4).
    return create_app(Settings(database_url="sqlite://", demo_mode=True))


@pytest.fixture
def client(app):
    # Entering the TestClient runs startup, which creates the tables and seeds them.
    with TestClient(app) as c:
        yield c


@pytest.fixture
def session(app, client):
    with Session(app.state.engine) as s:
        yield s


@pytest.fixture
def as_user():
    """Headers for a simulated login, e.g. client.get(url, headers=as_user("u_rina"))."""
    def _headers(user_id: str) -> dict[str, str]:
        return {"X-User-Id": user_id}
    return _headers
