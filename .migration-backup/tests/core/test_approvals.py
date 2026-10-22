import pytest
from sqlmodel import Session, select

from app.core import approvals, audit
from app.core.clock import DEMO_START
from app.enums import ApprovalStatus, Role
from app.errors import Conflict, Forbidden, NotFound
from app.models import AuditEvent, User

SUBJECT = "test_subject"        # not "incident", so the real workflow handler isn't involved


@pytest.fixture
def calls():
    seen = []
    approvals.register_handler(SUBJECT, lambda s, a, u, at: seen.append((a.id, a.status, u.id)))
    yield seen
    approvals._handlers.pop(SUBJECT, None)


def _request(session, amount_sen=18000, role=Role.OWNER):
    approval = approvals.create_request(
        session, business_id="b_seripagi", subject_type=SUBJECT, subject_id="inc_1",
        action="dispatch_vendor", amount_sen=amount_sen, required_role=role, at=DEMO_START)
    session.commit()
    return approval


def _decide(session, approval, user_id, approve=True, note=None):
    return approvals.decide(session, approval_id=approval.id, user=session.get(User, user_id),
                            approve=approve, note=note, at=DEMO_START)


def _actions(session, entity_id):
    return [e.action for e in audit.list_events(session, business_id="b_seripagi",
                                                entity_id=entity_id)]


def test_create_is_pending_and_logged(session):
    a = _request(session)
    assert a.status == ApprovalStatus.PENDING
    assert _actions(session, a.id) == ["APPROVAL_REQUESTED"]
    assert _actions(session, "inc_1") == ["APPROVAL_REQUESTED"]     # findable by its subject too


def test_supervisor_cannot_decide_owner_level(app, session, calls):
    a = _request(session)
    with pytest.raises(Forbidden, match="Owner approval required for RM180.00"):
        _decide(session, a, "u_daniel")
    session.rollback()
    with Session(app.state.engine) as fresh:        # committed even though the call failed
        assert _actions(fresh, a.id) == ["APPROVAL_REQUESTED", "APPROVAL_FORBIDDEN"]
        assert fresh.exec(select(AuditEvent).where(AuditEvent.action == "APPROVAL_FORBIDDEN")
                          ).one().actor_id == "u_daniel"
    assert calls == []


def test_staff_cannot_decide_supervisor_level(session):
    a = _request(session, amount_sen=12000, role=Role.SUPERVISOR)
    with pytest.raises(Forbidden, match="Supervisor approval required for RM120.00"):
        _decide(session, a, "u_aina")


def test_supervisor_decides_within_limit(session, calls):
    a = _request(session, amount_sen=12000, role=Role.SUPERVISOR)
    _decide(session, a, "u_daniel")
    assert calls == [(a.id, ApprovalStatus.APPROVED, "u_daniel")]


def test_owner_approves_calls_handler_once(session, calls):
    a = _request(session)
    decided = _decide(session, a, "u_rina", note="go")
    session.commit()
    assert decided.status == ApprovalStatus.APPROVED
    assert decided.decided_by == "u_rina" and decided.decided_at == DEMO_START
    assert calls == [(a.id, ApprovalStatus.APPROVED, "u_rina")]
    assert _actions(session, a.id) == ["APPROVAL_REQUESTED", "APPROVED"]


def test_decide_twice_conflict(session, calls):
    a = _request(session)
    _decide(session, a, "u_rina")
    session.commit()
    with pytest.raises(Conflict):
        _decide(session, a, "u_rina")
    with pytest.raises(Conflict):
        _decide(session, a, "u_rina", approve=False)
    assert len(calls) == 1


def test_reject_records_note(session, calls):
    a = _request(session)
    _decide(session, a, "u_rina", approve=False, note="Call my usual technician instead")
    session.commit()
    assert a.status == ApprovalStatus.REJECTED and a.note == "Call my usual technician instead"
    [event] = [e for e in audit.list_events(session, business_id="b_seripagi", entity_id=a.id)
               if e.action == "REJECTED"]
    assert event.details["note"] == "Call my usual technician instead"
    assert calls == [(a.id, ApprovalStatus.REJECTED, "u_rina")]


def test_other_business_user_not_found(session, calls):
    a = _request(session)
    with pytest.raises(NotFound):
        _decide(session, a, "u_lim")
    with pytest.raises(NotFound):
        approvals.decide(session, approval_id="apr_nope", user=session.get(User, "u_rina"),
                         approve=True, note=None, at=DEMO_START)
    assert calls == []
