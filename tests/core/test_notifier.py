from sqlmodel import select

from app.core import audit, notifier
from app.core.clock import DEMO_START
from app.models import Message


def test_notifier_writes_outbox_and_audit(session):
    msg = notifier.send(session, business_id="b_seripagi", to_type="user", to_id="u_aina",
                        body="Move stock from Freezer 2 to Freezer 1", at=DEMO_START,
                        incident_id="inc_1")
    session.commit()

    saved = session.exec(select(Message)).one()
    assert saved.id == msg.id
    assert saved.channel == "whatsapp_mock"
    assert saved.to_id == "u_aina" and saved.incident_id == "inc_1"
    assert saved.created_at == DEMO_START

    [event] = audit.list_events(session, business_id="b_seripagi", entity_id=msg.id)
    assert event.action == "MESSAGE_SENT"
    assert event.actor_id == "system"
    assert event.details == {"to_type": "user", "to": "u_aina", "incident_id": "inc_1"}
