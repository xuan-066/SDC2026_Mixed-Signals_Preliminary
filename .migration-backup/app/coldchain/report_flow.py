"""[S] Staff fault message → incident, or a "which unit?" question first (plan T12)."""
from datetime import datetime

from sqlmodel import Session, select

from app.coldchain import policy, rules, workflow
from app.coldchain.parser import AssetRef, ParsedReport, parse_report, redact_pii
from app.core import audit, notifier
from app.core.rbac import get_owned
from app.enums import IncidentStatus
from app.errors import Conflict
from app.models import Asset, Incident, User


def _assets(session: Session, business_id: str) -> list[Asset]:
    return list(session.exec(select(Asset).where(Asset.business_id == business_id)
                             .order_by(Asset.name)))


def handle_report(session: Session, *, text: str, reporter: User, now: datetime) -> Incident:
    return process_report(session, text=text, reporter=reporter, now=now)[0]


def process_report(session: Session, *, text: str, reporter: User, now: datetime,
                   llm_client=None, llm_model: str | None = None
                   ) -> tuple[Incident, ParsedReport, str]:
    """Returns (incident, parsed, parser_source). Only the redacted text is stored."""
    assets = _assets(session, reporter.business_id)
    parsed, source, fallback_reason = parse_report(
        text, [AssetRef(a.name, list(a.aliases)) for a in assets], llm_client, llm_model)
    stored_text = redact_pii(text)
    severity = rules.severity_from_symptom(parsed.symptom)
    asset = next((a for a in assets if a.name == parsed.asset_name), None)

    if fallback_reason:
        audit.record(session, business_id=reporter.business_id, actor_id="system",
                     action="PARSE_FALLBACK_USED", entity_type="report", entity_id=reporter.id,
                     at=now, details={"reason": fallback_reason})

    if asset is None or parsed.confidence < policy.PARSER_MIN_CONFIDENCE:
        incident = Incident(business_id=reporter.business_id, asset_id=None, trigger="report",
                            reporter_id=reporter.id, report_text=stored_text,
                            symptom=parsed.symptom, severity=severity,
                            status=IncidentStatus.NEEDS_INFO, created_at=now)
        session.add(incident)
        audit.record(session, business_id=reporter.business_id, actor_id="system",
                     action="NEEDS_INFO", entity_type="incident", entity_id=incident.id, at=now,
                     details={"symptom": parsed.symptom.value, "confidence": parsed.confidence,
                              "parser": source})
        notifier.send(session, business_id=reporter.business_id, to_type="user",
                      to_id=reporter.id, at=now, incident_id=incident.id,
                      body="Which unit? " + " / ".join(a.name for a in assets))
        return incident, parsed, source

    active = workflow.active_incident(session, asset.id)
    if active is not None:          # one active incident per unit (§8.4)
        return active, parsed, source
    incident = workflow.open_incident(session, asset=asset, severity=severity, trigger="report",
                                      now=now, reporter_id=reporter.id, report_text=stored_text,
                                      symptom=parsed.symptom)
    return incident, parsed, source


def clarify_incident(session: Session, *, incident_id: str, asset_id: str, user: User,
                     now: datetime) -> Incident:
    """Staff answered "which unit?": attach the unit and continue the normal journey."""
    incident = get_owned(session, Incident, incident_id, user)
    if incident.status != IncidentStatus.NEEDS_INFO:
        raise Conflict(f"Incident {incident_id} is {incident.status.value}, not NEEDS_INFO")
    asset = get_owned(session, Asset, asset_id, user)
    active = workflow.active_incident(session, asset.id)
    if active is not None:
        raise Conflict(f"{asset.name} already has an open incident ({active.id})")

    incident.asset_id = asset.id
    session.add(incident)
    audit.record(session, business_id=incident.business_id, actor_id=user.id, action="CLARIFIED",
                 entity_type="incident", entity_id=incident.id, at=now,
                 details={"asset_id": asset.id})
    return workflow.decide_and_act(session, incident, asset, now)
