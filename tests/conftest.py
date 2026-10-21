import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def app():
    # T2 switches this to an in-memory, seeded SQLite DB (see plan §16.4).
    return create_app(Settings(database_url="sqlite://", demo_mode=True))


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def as_user():
    """Headers for a simulated login, e.g. client.get(url, headers=as_user("u_rina"))."""
    def _headers(user_id: str) -> dict[str, str]:
        return {"X-User-Id": user_id}
    return _headers
