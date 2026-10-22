from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Engine, event, inspect, text
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import app.models  # noqa: F401  (registers the tables on SQLModel.metadata)


def make_engine(database_url: str) -> Engine:
    if database_url in ("sqlite://", "sqlite:///:memory:"):
        # One shared in-memory DB for every session (tests); see plan §16.4.
        return create_engine(database_url, connect_args={"check_same_thread": False},
                             poolclass=StaticPool)
    if database_url.startswith("sqlite"):
        engine = create_engine(database_url, connect_args={"check_same_thread": False, "timeout": 30})
        @event.listens_for(engine, "connect")
        def sqlite_options(connection, _):
            connection.execute("PRAGMA busy_timeout=30000")
            connection.execute("PRAGMA journal_mode=WAL")
        return engine
    return create_engine(database_url)


def init_db(engine: Engine) -> None:
    SQLModel.metadata.create_all(engine)
    # Additive upgrades for databases created by the original demo. No resets.
    with engine.begin() as connection:
        for table in ("asset", "vendor"):
            columns = {c["name"] for c in inspect(connection).get_columns(table)}
            if "archived" not in columns:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN archived BOOLEAN NOT NULL DEFAULT 0"))


def reset_db(engine: Engine) -> None:
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)


def get_session(request: Request) -> Iterator[Session]:
    """FastAPI dependency: one session per request, on the app's engine."""
    with Session(request.app.state.engine) as session:
        # Acquire SQLite's write reservation before reading mutable state. This
        # serializes read/check/write operations across requests and processes.
        if request.method not in {"GET", "HEAD", "OPTIONS"} and session.bind.dialect.name == "sqlite":
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
        yield session
