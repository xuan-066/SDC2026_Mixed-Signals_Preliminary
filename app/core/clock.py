"""The only source of "now" in the app (plan §14). In demo mode time is simulated."""
from datetime import UTC, datetime, timedelta

from fastapi import Request

DEMO_START = datetime(2026, 11, 12, 13, 0, tzinfo=UTC)   # 21:00 MYT


class Clock:
    def __init__(self, start: datetime | None = DEMO_START):
        # start=None means real wall-clock time (DEMO_MODE=false).
        self._start = start
        self._now = start

    def now(self) -> datetime:
        return self._now if self._now is not None else datetime.now(UTC)

    def set(self, dt: datetime) -> None:
        if dt.tzinfo is None:
            raise ValueError("Clock.set needs a timezone-aware datetime")
        self._now = dt.astimezone(UTC)

    def advance(self, minutes: int) -> None:
        self._now = self.now() + timedelta(minutes=minutes)

    def reset(self) -> None:
        self._now = self._start


def get_clock(request: Request) -> Clock:
    """FastAPI dependency."""
    return request.app.state.clock
