"""Cryptographic boundary tests: no unsigned, wrong-issuer or expired sessions."""
import base64
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from starlette.requests import Request

from app.core import identity
from app.errors import AppError, Forbidden, Unauthorized


@pytest.fixture
def signed_session(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    issuer = "https://fixture.clerk.accounts.dev"
    monkeypatch.setenv("CLERK_PUBLISHABLE_KEY", "pk_test_" + base64.b64encode(b"fixture.clerk.accounts.dev$").decode())
    monkeypatch.setenv("CLERK_SECRET_KEY", "fixture-only-not-real")
    identity.clerk_issuer.cache_clear()
    identity.jwks.cache_clear()
    monkeypatch.setattr(identity, "jwks", lambda: SimpleNamespace(
        get_signing_key_from_jwt=lambda _: SimpleNamespace(key=key.public_key())))
    monkeypatch.setattr(identity.httpx, "get", lambda *args, **kwargs: SimpleNamespace(
        raise_for_status=lambda: None,
        json=lambda: {"primary_email_address_id": "email1", "first_name": "Fixture",
                      "email_addresses": [{"id": "email1", "email_address": "fixture@example.test",
                                           "verification": {"status": "verified"}}]}))
    now = datetime.now(UTC)

    def request(**changes):
        claims = {"iss": issuer, "sub": "user_fixture", "iat": now, "nbf": now,
                  "exp": now + timedelta(minutes=5), "azp": "http://testserver", **changes}
        token = jwt.encode(claims, key, algorithm="RS256")
        return Request({"type": "http", "method": "GET", "path": "/v1/me",
                        "scheme": "http", "server": ("testserver", 80),
                        "headers": [(b"host", b"testserver"), (b"cookie", f"__session={token}".encode())]})
    yield request
    identity.clerk_issuer.cache_clear()


def test_valid_signed_session(signed_session):
    principal = identity.verified_principal(signed_session())
    assert principal.subject == "user_fixture"
    assert principal.verified and principal.email == "fixture@example.test"


@pytest.mark.parametrize("claims", [
    {"exp": datetime.now(UTC) - timedelta(minutes=1)},
    {"iss": "https://attacker.invalid"},
    {"azp": "https://attacker.invalid"},
    {"nbf": datetime.now(UTC) + timedelta(hours=1)},
])
def test_bad_claims_rejected(signed_session, claims):
    with pytest.raises(Unauthorized):
        identity.authenticate(signed_session(**claims))


def test_unverified_provider_email_cannot_join(signed_session, monkeypatch):
    monkeypatch.setattr(identity.httpx, "get", lambda *args, **kwargs: SimpleNamespace(
        raise_for_status=lambda: None,
        json=lambda: {"primary_email_address_id": "email1", "email_addresses": [
            {"id": "email1", "email_address": "fixture@example.test", "verification": {"status": "unverified"}}]}))
    with pytest.raises(Forbidden):
        identity.verified_principal(signed_session())


def test_tampered_and_unsigned_cookies_rejected(signed_session):
    request = signed_session()
    cookie = request.cookies["__session"]
    tampered = cookie.rsplit(".", 1)[0] + ".ZmFrZS1zaWduYXR1cmU"
    request = Request({**request.scope, "headers": [(b"host", b"testserver"),
                                                  (b"cookie", f"__session={tampered}".encode())]})
    with pytest.raises(Unauthorized):
        identity.authenticate(request)


def test_provider_unavailable_fails_closed(signed_session, monkeypatch):
    def unavailable(*args, **kwargs):
        raise identity.httpx.ConnectError("unavailable")
    monkeypatch.setattr(identity.httpx, "get", unavailable)
    with pytest.raises(AppError) as exc:
        identity.authenticate(signed_session())
    assert exc.value.status == 503
