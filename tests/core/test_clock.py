from datetime import UTC, datetime, timedelta, timezone

import pytest

from app.core.clock import DEMO_START, Clock


def test_clock_advance():
    clock = Clock()
    clock.set(datetime(2026, 11, 12, 13, 0, tzinfo=UTC))
    clock.advance(60)
    assert clock.now() == datetime(2026, 11, 12, 14, 0, tzinfo=UTC)


def test_clock_starts_at_demo_time_and_resets():
    clock = Clock()
    assert clock.now() == DEMO_START
    clock.advance(180)
    clock.reset()
    assert clock.now() == DEMO_START


def test_clock_set_converts_to_utc_and_rejects_naive():
    clock = Clock()
    clock.set(datetime(2026, 11, 12, 21, 0, tzinfo=timezone(timedelta(hours=8))))   # 21:00 MYT
    assert clock.now() == DEMO_START and clock.now().tzinfo == UTC
    with pytest.raises(ValueError):
        clock.set(datetime(2026, 11, 12, 13, 0))


def test_real_clock_when_not_in_demo_mode():
    before = datetime.now(UTC)
    assert Clock(start=None).now() >= before
