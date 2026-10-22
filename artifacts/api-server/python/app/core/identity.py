"""Verified Clerk sessions, without trusting caller-supplied application roles."""
import base64
import os
import logging
import ssl
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import urlsplit

import httpx
import jwt
from fastapi import Request

from app.errors import AppError, Forbidden, Unauthorized


@dataclass(frozen=True)
class Principal:
    subject: str
    email: str
    verified: bool
    name: str


def allowed_origins(request: Request) -> set[str]:
    configured = os.getenv("APP_ORIGINS", "").split(",")
    domains = os.getenv("REPLIT_DOMAINS", "").split(",")
    return {s.strip().rstrip("/") for s in configured if s.strip()} | {
        f"https://{s.strip()}" for s in domains if s.strip()
    } | {str(request.base_url).rstrip("/")}


@lru_cache
def clerk_issuer() -> str:
    key = os.environ.get("CLERK_PUBLISHABLE_KEY", "")
    try:
        raw = key.split("_", 2)[2]
        host = base64.b64decode(raw + "=" * (-len(raw) % 4)).decode().rstrip("$")
        if not host or "/" in host or "@" in host:
            raise ValueError()
        return f"https://{host}"
    except Exception:
        raise Unauthorized("Identity provider is not configured")


@lru_cache
def jwks() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{clerk_issuer()}/.well-known/jwks.json", timeout=10)


def authenticate(request: Request) -> Principal:
    """Validate signature, issuer, expiry and authorized party before email lookup.

    Email verification is fetched from Clerk, never inferred from an unverified
    caller claim. No identity or role is created by this function.
    """
    token = request.cookies.get("__session")
    if not token:
        raise Unauthorized("Sign in to continue")
    try:
        stage = "signing-key"
        signing_key = jwks().get_signing_key_from_jwt(token)
        stage = "claims"
        claims = jwt.decode(token, signing_key.key, algorithms=["RS256"],
                            issuer=clerk_issuer(), options={
                                "require": ["exp", "iat", "nbf", "sub", "iss"],
                                "verify_aud": False,
                            }, leeway=5)
        if claims.get("azp") and claims["azp"].rstrip("/") not in allowed_origins(request):
            raise Unauthorized("Session origin is not authorized")
        subject = claims["sub"]
        secret = os.environ.get("CLERK_SECRET_KEY")
        if not secret:
            raise Unauthorized("Identity provider is not configured")
        stage = "provider-profile"
        response = httpx.get(f"https://api.clerk.com/v1/users/{subject}",
                             headers={"Authorization": f"Bearer {secret}"}, timeout=10,
                             verify=ssl.create_default_context())
        response.raise_for_status()
        data = response.json()
        primary = next((e for e in data.get("email_addresses", [])
                        if e["id"] == data.get("primary_email_address_id")), {})
        email = primary.get("email_address", "").strip().lower()
        verified = primary.get("verification", {}).get("status") == "verified"
        return Principal(subject, email, verified,
                         " ".join(filter(None, [data.get("first_name"), data.get("last_name")])) or email)
    except Unauthorized:
        raise
    except (httpx.HTTPError, jwt.PyJWKClientConnectionError) as exc:
        logging.getLogger("uvicorn.error").warning("Identity provider unavailable: stage=%s error=%s", stage, type(exc).__name__)
        raise AppError("IDENTITY_UNAVAILABLE", "Identity verification is temporarily unavailable. Please try again.", 503)
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        # Diagnostics never contain cookies, JWTs, credentials or user profiles.
        logging.getLogger("uvicorn.error").warning("Session verification rejected: stage=%s error=%s missing_claim=%s",
                                                   stage, type(exc).__name__, getattr(exc, "claim", None))
        raise Unauthorized("Your session expired or could not be verified. Please sign in again.")


def verified_principal(request: Request) -> Principal:
    principal = authenticate(request)
    if not principal.verified or not principal.email:
        raise Forbidden("Verify your primary email before joining a business")
    return principal
