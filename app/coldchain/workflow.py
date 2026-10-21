"""Readings → incident → approval (plan §6 steps 1–4). Functions here don't commit;
the API layer commits once, so data and audit log are saved together."""
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.coldchain import policy, rules
from app.core import approvals, audit, notifier
from app.core.rbac import get_owned
from app.enums import ApprovalStatus, IncidentStatus, JobStatus, Role, Severity
from app.errors import Conflict, InvalidInput
from app.models import (READING_SEQ, ApprovalRequest, Asset, Business, Incident, Reading,
                        ServiceJob, StockItem, User, Vendor)
from app.money import rm_label

MYT = timezone(timedelta(hours=8))      # warranty dates are local dates
ACTIVE = (IncidentStatus.PENDING_APPROVAL, IncidentStatus.DISPATCHED)
_RANK = {Severity.NORMAL: 0, Severity.WATCH: 1, Severity.WARNING: 2, Severity.CRITICAL: 3}


# ---------- queries ----------

def recent_readings(session: Session, asset_id: str, now: datetime) -> list[tuple[datetime, float]]:
    since = now - timedelta(hours=policy.READING_WINDOW_H)
    rows = session.exec(select(Reading).where(Reading.asset_id == asset_id,
                                              Reading.recorded_at >= since,
                                              Reading.recorded_at <= now)
                        .order_by(Reading.recorded_at, READING_SEQ))
    return [(r.recorded_at, r.temp_c) for r in rows]


def _stock(session: Session, asset_id: str) -> list[StockItem]:
    return list(session.exec(select(StockItem).where(StockItem.asset_id == asset_id)))


def active_incident(session: Session, asset_id: str) -> Incident | None:
    return session.exec(select(Incident).where(Incident.asset_id == asset_id,
                                               Incident.status.in_(ACTIVE))).first()


def _users(session: Session, business_id: str, role: Role) -> list[User]:
    return list(session.exec(select(User).where(User.business_id == business_id,
                                                User.role == role).order_by(User.id)))


# ---------- step 2: connected data ----------

def gather_context(session: Session, asset: Asset, now: datetime) -> rules.IncidentContext:
    business = session.get(Business, asset.business_id)
    recent = recent_readings(session, asset.id, now)

    units = []
    for other in session.exec(select(Asset).where(Asset.business_id == asset.business_id,
                                                  Asset.id != asset.id)):
        used = sum(s.volume_l for s in _stock(session, other.id))
        other_recent = recent_readings(session, other.id, now)
        # No recent readings: assume it is working (nothing says otherwise).
        in_range = (not other_recent
                    or rules.deviation_c(other_recent[-1][1], other.min_c, other.max_c) == 0)
        units.append(rules.UnitSpace(other.id, other.name, other.type,
                                     other.capacity_l - used, in_range))

    vendors = [rules.VendorOffer(v.id, v.name, list(v.services), v.callout_fee_sen,
                                 v.sla_hours, v.warranty_only)
               for v in session.exec(select(Vendor).where(Vendor.business_id == asset.business_id)
                                     .order_by(Vendor.id))]

    return rules.IncidentContext(
        asset_id=asset.id, asset_name=asset.name, asset_type=asset.type,
        latest_temp_c=recent[-1][1] if recent else float("nan"),
        min_c=asset.min_c, max_c=asset.max_c,
        warranty_until=asset.warranty_until, warranty_vendor_id=asset.warranty_vendor_id,
        stock=[rules.StockLine(s.name, s.qty, s.unit_cost_sen, s.volume_l)
               for s in _stock(session, asset.id)],
        units=units, vendors=vendors, supervisor_limit_sen=business.supervisor_limit_sen,
    )


def _decision_json(decision: rules.Decision, ctx: rules.IncidentContext) -> dict:
    """Shape of plan §10's "decision" block (money still in sen; the API formats it)."""
    backup = next((u for u in ctx.units if u.asset_id == decision.backup_unit_id), None)
    vendor = next((v for v in ctx.vendors if v.vendor_id == decision.vendor_id), None)
    return {
        "severity": decision.severity.value,
        "stock_at_risk_sen": decision.stock_at_risk_sen,
        "volume_needed_l": decision.volume_needed_l,
        "backup_unit": {"id": backup.asset_id, "name": backup.name, "free_l": backup.free_l}
                       if backup else None,
        "vendor": {"id": vendor.vendor_id, "name": vendor.name, "callout_sen": decision.cost_sen,
                   "sla_hours": vendor.sla_hours} if vendor else None,
        "cost_sen": decision.cost_sen,
        "required_role": decision.required_role.value,
        "reasons": decision.reasons,
        "needs_human": decision.needs_human,
    }


# ---------- steps 3–4: decision, instruction, approval ----------

def open_incident(session: Session, *, asset: Asset, severity: Severity, trigger: str,
                  now: datetime, reporter_id: str | None = None, report_text: str | None = None,
                  symptom=None) -> Incident:
    """PUBLIC — T12 reuses it. Decide, save, instruct staff, then ask for approval."""
    ctx = gather_context(session, asset, now)
    decision = rules.decide(ctx, severity, now.astimezone(MYT).date())
    data = _decision_json(decision, ctx)

    incident = Incident(business_id=asset.business_id, asset_id=asset.id, trigger=trigger,
                        reporter_id=reporter_id, report_text=report_text, symptom=symptom,
                        severity=severity, status=IncidentStatus.PENDING_APPROVAL,
                        decision=data, stock_at_risk_sen=decision.stock_at_risk_sen,
                        created_at=now)
    session.add(incident)
    audit.record(session, business_id=asset.business_id, actor_id="system",
                 action="INCIDENT_OPENED", entity_type="incident", entity_id=incident.id, at=now,
                 details={"asset_id": asset.id, "severity": severity.value, "trigger": trigger,
                          "stock_at_risk_sen": decision.stock_at_risk_sen})

    # Moving stock is an instruction, not a spend: staff are told straight away.
    if data["backup_unit"]:
        move = f"Move all stock to {data['backup_unit']['name']} now"
    else:
        move = "No space in other units: move stock to an ice box / another outlet now"
    for staff in _users(session, asset.business_id, Role.STAFF):
        notifier.send(session, business_id=asset.business_id, to_type="user", to_id=staff.id,
                      at=now, incident_id=incident.id,
                      body=f"{asset.name} is {severity.value}. {move}, "
                           f"and keep the {asset.name} door shut.")

    if decision.needs_human:
        for owner in _users(session, asset.business_id, Role.OWNER):
            notifier.send(session, business_id=asset.business_id, to_type="user", to_id=owner.id,
                          at=now, incident_id=incident.id,
                          body=f"{asset.name} is {severity.value} and needs you: "
                               f"{decision.needs_human}.")
        return incident

    # Every dispatch needs an approval, even RM0, because it commits someone's time.
    approval = approvals.create_request(
        session, business_id=asset.business_id, subject_type="incident", subject_id=incident.id,
        action="dispatch_vendor", amount_sen=decision.cost_sen,
        required_role=decision.required_role, at=now)
    vendor_name = data["vendor"]["name"]
    for approver in _users(session, asset.business_id, decision.required_role):
        notifier.send(session, business_id=asset.business_id, to_type="user", to_id=approver.id,
                      at=now, incident_id=incident.id,
                      body=f"Approval needed: {vendor_name} call-out {rm_label(decision.cost_sen)} "
                           f"for {asset.name} ({severity.value}). "
                           f"{rm_label(decision.stock_at_risk_sen)} of stock at risk. "
                           f"Approval {approval.id}.")
    return incident


def _raise_severity(session: Session, incident: Incident, asset: Asset, severity: Severity,
                    temp_c: float, now: datetime) -> None:
    """WARNING → CRITICAL: update, log once, tell whoever must act. The approval stays as is."""
    old = incident.severity
    incident.severity = severity
    session.add(incident)
    audit.record(session, business_id=incident.business_id, actor_id="system",
                 action="SEVERITY_CHANGED", entity_type="incident", entity_id=incident.id, at=now,
                 details={"from": old.value, "to": severity.value, "temp_c": temp_c})
    role = Role(incident.decision.get("required_role", Role.OWNER))
    if incident.decision.get("needs_human"):
        role = Role.OWNER
    for user in _users(session, incident.business_id, role):
        notifier.send(session, business_id=incident.business_id, to_type="user", to_id=user.id,
                      at=now, incident_id=incident.id,
                      body=f"Update: {asset.name} is now {severity.value} at {temp_c:.1f}°C "
                           f"(was {old.value}). Your decision is still pending.")


# ---------- step 1: the trigger ----------

def handle_reading(session: Session, *, asset_id: str, temp_c: float, source: str,
                   actor: User, now: datetime) -> Incident | None:
    """Store a reading and react. Returns the unit's active incident, if any."""
    return process_reading(session, asset_id=asset_id, temp_c=temp_c, source=source,
                           actor=actor, now=now)[1]


def process_reading(session: Session, *, asset_id: str, temp_c: float, source: str,
                    actor: User, now: datetime) -> tuple[Reading, Incident | None]:
    """handle_reading, also returning the stored Reading (for the API response)."""
    asset = get_owned(session, Asset, asset_id, actor)                 # 404 before anything
    if not rules.is_valid_temp(temp_c):
        low, high = policy.VALID_TEMP_RANGE
        raise InvalidInput(f"{temp_c}°C is outside {low}…{high}°C: sensor glitch, not stored")

    previous = recent_readings(session, asset.id, now)
    reading = Reading(asset_id=asset.id, temp_c=temp_c, recorded_at=now, source=source)
    session.add(reading)
    recent = previous + [(now, temp_c)]

    severity = rules.classify_severity(asset.min_c, asset.max_c, recent, now)
    incident = active_incident(session, asset.id)

    if severity in (Severity.WARNING, Severity.CRITICAL):
        if incident is None:
            incident = open_incident(session, asset=asset, severity=severity,
                                     trigger="reading", now=now)
        elif _RANK[severity] > _RANK[incident.severity]:
            _raise_severity(session, incident, asset, severity, temp_c, now)
        return reading, incident

    if severity == Severity.NORMAL and incident is not None:
        job = job_for(session, incident.id)
        if job is not None and job.status == JobStatus.DONE:
            # Repaired earlier but was still warm then; now it's back in range (§8.4).
            _resolve(session, incident, asset, temp_c, actor.id, now)
        return reading, incident

    if severity == Severity.NORMAL and incident is None and previous:
        before = rules.classify_severity(asset.min_c, asset.max_c, previous, previous[-1][0])
        if before == Severity.WATCH:
            # A one-off warm reading (door opened?) that fixed itself: a false alarm avoided.
            audit.record(session, business_id=asset.business_id, actor_id="system",
                         action="WATCH_CLEARED", entity_type="asset", entity_id=asset.id, at=now,
                         details={"temp_c": temp_c, "watch_temp_c": previous[-1][1]})
    return reading, incident


# ---------- step 5: approval → dispatch → resolution (T7) ----------

def job_for(session: Session, incident_id: str) -> ServiceJob | None:
    return session.exec(select(ServiceJob).where(ServiceJob.incident_id == incident_id)
                        .order_by(ServiceJob.requested_at.desc())).first()


def _local(dt: datetime) -> str:
    return dt.astimezone(MYT).strftime("%H:%M")


def on_approval_decided(session: Session, approval: ApprovalRequest, user: User,
                        now: datetime) -> None:
    """Registered for subject_type "incident": runs inside approvals.decide()."""
    incident = session.get(Incident, approval.subject_id)
    asset = session.get(Asset, incident.asset_id)
    vendor = session.get(Vendor, incident.decision["vendor"]["id"])

    if approval.status == ApprovalStatus.REJECTED:
        incident.status = IncidentStatus.DECLINED
        session.add(incident)
        backup = incident.decision.get("backup_unit")
        keep = f"Keep the stock in {backup['name']}" if backup else "Keep the stock cold"
        for staff in _users(session, incident.business_id, Role.STAFF):
            notifier.send(session, business_id=incident.business_id, to_type="user",
                          to_id=staff.id, at=now, incident_id=incident.id,
                          body=f"{user.name} declined the {vendor.name} call-out for {asset.name}: "
                               f"{approval.note or 'no reason given'}. {keep} for now.")
        return

    job = ServiceJob(business_id=incident.business_id, incident_id=incident.id,
                     vendor_id=vendor.id, requested_at=now)
    session.add(job)
    incident.status = IncidentStatus.DISPATCHED
    session.add(incident)
    audit.record(session, business_id=incident.business_id, actor_id="system",
                 action="JOB_CREATED", entity_type="job", entity_id=job.id, at=now,
                 details={"incident_id": incident.id, "vendor_id": vendor.id,
                          "approval_id": approval.id})
    business = session.get(Business, incident.business_id)
    notifier.send(session, business_id=incident.business_id, to_type="vendor", to_id=vendor.id,
                  at=now, incident_id=incident.id,
                  body=f"Job request from {business.name}: {asset.name} ({asset.type}) is "
                       f"{incident.severity.value}. Please confirm your arrival time. Job {job.id}.")


approvals.register_handler("incident", on_approval_decided)


def _job_and_incident(session: Session, job_id: str, user: User) -> tuple[ServiceJob, Incident]:
    job = get_owned(session, ServiceJob, job_id, user)
    return job, session.get(Incident, job.incident_id)


def confirm_job(session: Session, *, job_id: str, eta: datetime | None, user: User,
                now: datetime) -> ServiceJob:
    """The vendor's reply, entered on their behalf in the demo."""
    job, incident = _job_and_incident(session, job_id, user)
    if job.status != JobStatus.REQUESTED:
        raise Conflict(f"Job {job_id} is already {job.status.value}")
    vendor = session.get(Vendor, job.vendor_id)
    job.status = JobStatus.CONFIRMED
    job.confirmed_at = now
    job.eta = eta or now + timedelta(hours=vendor.sla_hours)
    session.add(job)
    audit.record(session, business_id=job.business_id, actor_id=user.id,
                 action="VENDOR_CONFIRMED", entity_type="job", entity_id=job.id, at=now,
                 details={"incident_id": incident.id, "eta": job.eta.isoformat()})
    asset = session.get(Asset, incident.asset_id)
    for staff in _users(session, job.business_id, Role.STAFF):
        notifier.send(session, business_id=job.business_id, to_type="user", to_id=staff.id,
                      at=now, incident_id=incident.id,
                      body=f"{vendor.name} confirmed: technician for {asset.name} "
                           f"by {_local(job.eta)}.")
    return job


def _resolve(session: Session, incident: Incident, asset: Asset, temp_c: float | None,
             actor_id: str, now: datetime) -> None:
    incident.status = IncidentStatus.RESOLVED
    incident.resolved_at = now
    session.add(incident)
    audit.record(session, business_id=incident.business_id, actor_id=actor_id,
                 action="INCIDENT_RESOLVED", entity_type="incident", entity_id=incident.id,
                 at=now, details={"temp_c": temp_c})
    at = f" and back at {temp_c:.1f}°C" if temp_c is not None else ""
    for staff in _users(session, incident.business_id, Role.STAFF):
        notifier.send(session, business_id=incident.business_id, to_type="user", to_id=staff.id,
                      at=now, incident_id=incident.id,
                      body=f"{asset.name} is fixed{at}. You can move the stock back.")


def complete_job(session: Session, *, job_id: str, user: User, now: datetime) -> ServiceJob:
    """Technician finished. Resolves the incident unless the unit is still warm (§8.4)."""
    job, incident = _job_and_incident(session, job_id, user)
    if job.status == JobStatus.DONE:
        raise Conflict(f"Job {job_id} is already DONE")
    job.status = JobStatus.DONE
    job.done_at = now
    session.add(job)
    audit.record(session, business_id=job.business_id, actor_id=user.id, action="JOB_DONE",
                 entity_type="job", entity_id=job.id, at=now,
                 details={"incident_id": incident.id})

    asset = session.get(Asset, incident.asset_id)
    last_hour = [r for r in recent_readings(session, asset.id, now)
                 if r[0] >= now - timedelta(minutes=60)]
    latest = last_hour[-1][1] if last_hour else None
    if latest is not None and rules.deviation_c(latest, asset.min_c, asset.max_c) > 0:
        for owner in _users(session, job.business_id, Role.OWNER):
            notifier.send(session, business_id=job.business_id, to_type="user", to_id=owner.id,
                          at=now, incident_id=incident.id,
                          body=f"{asset.name} is still out of range after repair "
                               f"({latest:.1f}°C). Please check with the technician.")
    else:
        _resolve(session, incident, asset, latest, user.id, now)
    return job
