import logging
import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from sqlmodel import Session, select

from app.api.v1 import activity, approvals, assets, incidents, jobs, me, readings, sim
from app.api.v1 import accounts, management, notifications
from app.core import clerk_proxy
from app.core.identity import allowed_origins, clerk_issuer
from app.core.worker import reminder_worker
from app.config import Settings
from app.core.clock import DEMO_START, Clock
from app.db import init_db, make_engine
from app.errors import install_error_handlers
from app.seed import is_empty, seed
from app.models import Identity


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Which kind of database, never the URL itself (it can hold a password).
        logging.getLogger("uvicorn.error").info(
            "SejukGuard database: %s", app.state.engine.url.get_backend_name())
        published = os.getenv("REPLIT_DEPLOYMENT") == "1" or bool(os.getenv("REPLIT_DEPLOYMENT_ID"))
        if published:
            if settings.demo_mode:
                raise RuntimeError("Demo mode may not run as a production service")
            if settings.database_url.startswith("sqlite"):
                raise RuntimeError("Replit deployment filesystems are ephemeral. This SQLite app cannot be published for real businesses until an explicitly approved durable storage architecture is configured. See docs/operations.md.")
        if os.getenv("NODE_ENV") == "production":
            if (not settings.database_url.startswith("sqlite:////")
                    or os.getenv("SQLITE_PERSISTENT_STORAGE_CONFIRMED") != "true"):
                raise RuntimeError("Durable SQLite storage is not confirmed. Configure an absolute persistent path and single-instance hosting before publishing.")
        if not settings.demo_mode:
            clerk_issuer()  # Fail clearly when identity setup is missing.
            if not os.environ.get("CLERK_SECRET_KEY"):
                raise RuntimeError("CLERK_SECRET_KEY is required in normal mode")
        init_db(app.state.engine)
        with Session(app.state.engine) as session:
            if settings.demo_mode and session.exec(select(Identity)).first():
                raise RuntimeError("Refusing demo mode against a database containing real memberships")
            if settings.demo_mode and is_empty(session):
                seed(session)
        stop = asyncio.Event()
        worker = (asyncio.create_task(reminder_worker(app.state.engine, stop))
                  if not settings.demo_mode and settings.run_worker else None)
        yield
        stop.set()
        if worker:
            await worker
        app.state.engine.dispose()

    app = FastAPI(title="SejukGuard API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.clock = Clock(DEMO_START if settings.demo_mode else None)

    if settings.demo_mode:
        app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    install_error_handlers(app)

    @app.middleware("http")
    async def normal_mode_guard(request, call_next):
        if not settings.demo_mode and request.url.path.startswith("/v1"):
            if "x-user-id" in request.headers:
                return JSONResponse({"error": {"code": "UNAUTHORIZED", "message": "Demo identity headers are disabled"}}, status_code=401)
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                origin = request.headers.get("origin")
                if origin and origin.rstrip("/") not in allowed_origins(request):
                    return JSONResponse({"error": {"code": "FORBIDDEN", "message": "Cross-origin changes are not allowed"}}, status_code=403)
                if request.cookies.get("__session") and not origin:
                    return JSONResponse({"error": {"code": "FORBIDDEN", "message": "An Origin header is required for cookie-authenticated changes"}}, status_code=403)
        response = await call_next(request)
        if request.url.path.startswith("/v1"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        return response

    @app.get("/health", tags=["meta"])
    def health() -> dict:
        return {"status": "ok"}

    @app.get("/", include_in_schema=False, response_class=HTMLResponse)
    def home() -> str:
        # Hosting previews (Replit) wait for "/" to answer 200; people land on the API docs.
        return ('<!doctype html><meta charset="utf-8"><title>SejukGuard API</title>'
                '<meta http-equiv="refresh" content="0; url=/docs">'
                '<p>SejukGuard API is running. <a href="/docs">Open the API docs</a> · '
                '<a href="/health">health</a></p>')

    for module in (me, readings, assets, incidents, approvals, jobs, activity,
                   accounts, management, notifications, clerk_proxy):
        app.include_router(module.router)
    if settings.demo_mode:
        app.include_router(sim.router)

    return app


app = create_app()
