"""Public sample-data-only entrypoint. Never reads database environment variables."""
from app.config import Settings
from app.application import create_app


def create_demo_app(*, read_only: bool = False):
    return create_app(Settings(
        database_url="sqlite://",
        demo_mode=True,
        view_only_demo=read_only,
        public_demo=True,
        llm_enabled=False,
        run_worker=False,
    ))


app = create_demo_app()
