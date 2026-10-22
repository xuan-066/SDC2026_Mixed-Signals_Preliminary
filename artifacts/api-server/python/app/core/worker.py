"""Periodic real-clock checks, independent of browser activity.

SQLite BEGIN IMMEDIATE claims the entire due-check transaction before any reads;
chase counters, notification rows and audits commit together. Restart or a second
worker cannot send the same chase twice.
"""
import asyncio
import logging
from datetime import UTC, datetime

from sqlmodel import Session

from app.coldchain.scheduler import run_scheduled_checks


def run_once(engine):
    with Session(engine) as session:
        if engine.dialect.name == "sqlite":
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
        actions = run_scheduled_checks(session, datetime.now(UTC))
        session.commit()
        return actions


async def reminder_worker(engine, stop: asyncio.Event):
    logger = logging.getLogger("uvicorn.error")
    while not stop.is_set():
        try:
            await asyncio.to_thread(run_once, engine)
        except Exception:
            logger.exception("Reminder check failed; transaction rolled back; retrying next interval")
        try:
            await asyncio.wait_for(stop.wait(), timeout=30)
        except TimeoutError:
            pass
