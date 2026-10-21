"""Business-benefit numbers for the owner and the proposal (plan §21). Computed, never typed in."""
from statistics import median

from sqlmodel import Session, func, select

from app.enums import IncidentStatus
from app.models import AuditEvent, Incident, ServiceJob
from app.money import rm_str
from app.schemas import MetricsOut


def compute_metrics(session: Session, business_id: str) -> MetricsOut:
    incidents = list(session.exec(select(Incident).where(Incident.business_id == business_id)))
    resolved = [i for i in incidents if i.status == IncidentStatus.RESOLVED]

    detect_to_dispatch = []
    for incident in incidents:
        job = session.exec(select(ServiceJob).where(ServiceJob.incident_id == incident.id)
                           .order_by(ServiceJob.requested_at)).first()
        if job is not None:
            detect_to_dispatch.append((job.requested_at - incident.created_at).total_seconds() / 60)

    def count(*where) -> int:
        return session.exec(select(func.count()).select_from(AuditEvent)
                            .where(AuditEvent.business_id == business_id, *where)).one()

    return MetricsOut(
        incidents_total=len(incidents),
        incidents_resolved=len(resolved),
        median_min_detect_to_dispatch=median(detect_to_dispatch) if detect_to_dispatch else None,
        stock_protected_rm=rm_str(sum(i.stock_at_risk_sen for i in resolved)),
        automated_actions=count(AuditEvent.actor_id == "system"),
        false_alarms_avoided=count(AuditEvent.action == "WATCH_CLEARED"),
    )
