from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from sqlmodel import Session

from app.api.v1 import activity, approvals, assets, incidents, jobs, me, readings, sim
from app.config import Settings
from app.core.clock import DEMO_START, Clock
from app.db import init_db, make_engine
from app.errors import install_error_handlers
from app.seed import is_empty, seed


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Seed on startup so a fresh deploy always has the demo world (plan §20).
        init_db(app.state.engine)
        with Session(app.state.engine) as session:
            if is_empty(session):
                seed(session)
        yield

    app = FastAPI(title="SejukGuard API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.clock = Clock(DEMO_START if settings.demo_mode else None)

    # Demo: the UI team's frontend can be hosted anywhere.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)

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

    for module in (me, readings, assets, incidents, approvals, jobs, activity):
        app.include_router(module.router)
    if settings.demo_mode:
        app.include_router(sim.router)

    return app


app = create_app()
