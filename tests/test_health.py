from fastapi.testclient import TestClient

from app.errors import NotFound


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_error_shape(app):
    @app.get("/_boom")
    def boom():
        raise NotFound("Incident inc_x not found")

    r = TestClient(app).get("/_boom")
    assert r.status_code == 404
    assert r.json() == {"error": {"code": "NOT_FOUND", "message": "Incident inc_x not found"}}


def test_unknown_route_uses_error_shape(client):
    r = client.get("/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"
