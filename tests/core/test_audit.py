from datetime import timedelta

from fastapi.routing import APIRoute

from app.core import audit
from app.core.clock import DEMO_START


def _record(session, action, entity_id="inc_1", minutes=0, business_id="b_seripagi"):
    return audit.record(session, business_id=business_id, actor_id="system", action=action,
                        entity_type="incident", entity_id=entity_id,
                        at=DEMO_START + timedelta(minutes=minutes), details={"n": minutes})


def test_audit_record_and_list_in_order(session):
    _record(session, "INCIDENT_OPENED", minutes=0)
    _record(session, "APPROVAL_REQUESTED", minutes=0)
    _record(session, "APPROVED", minutes=5)
    _record(session, "MESSAGE_SENT", entity_id="inc_2", minutes=1)
    _record(session, "INCIDENT_OPENED", business_id="b_bekumaju")
    session.commit()

    events = audit.list_events(session, business_id="b_seripagi", entity_id="inc_1")
    assert [e.action for e in events] == ["INCIDENT_OPENED", "APPROVAL_REQUESTED", "APPROVED"]
    assert events[2].details == {"n": 5}
    assert events[0].at.tzinfo is not None

    everything = audit.list_events(session, business_id="b_seripagi")
    assert [e.action for e in everything] == [
        "INCIDENT_OPENED", "APPROVAL_REQUESTED", "MESSAGE_SENT", "APPROVED"]   # by time


def test_audit_not_saved_until_caller_commits(app, session):
    from sqlmodel import Session
    _record(session, "INCIDENT_OPENED")
    session.rollback()                              # state change failed → no log entry
    with Session(app.state.engine) as other:
        assert audit.list_events(other, business_id="b_seripagi") == []


def test_audit_has_no_write_routes(app):
    for route in app.routes:
        if isinstance(route, APIRoute) and route.path.startswith("/v1/audit"):
            assert not route.methods & {"PUT", "PATCH", "DELETE", "POST"}, route.path
    assert not hasattr(audit, "update") and not hasattr(audit, "delete")
