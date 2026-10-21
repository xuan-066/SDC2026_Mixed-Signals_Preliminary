from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings
from app.errors import install_error_handlers


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()

    app = FastAPI(title="SejukGuard API", version="0.1.0")
    app.state.settings = settings

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

    # T2+: init_db, seed-if-empty and the /v1 routers are added here.
    return app


app = create_app()
