"""Readings → incident → approval (plan §6 steps 1–4). Functions here don't commit;
the API layer commits once, so data and audit log are saved together."""
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.coldchain import policy, rules
from app.core import approvals, audit, notifier
from app.core.rbac import get_owned
from app.enums import IncidentStatus, Role, Severity
from app.errors import InvalidInput
from app.models import Asset, Business, Incident, Reading, StockItem, User, Vendor
from app.money import rm_label

MYT = timezone(timedelta(hours=8))      # warranty dates are local dates
ACTIVE = (IncidentStatus.PENDING_APPROVAL, IncidentStatus.DISPATCHED)
_RANK = {Severity.NORMAL: 0, Severity.WATCH: 1, Severity.WARNING: 2, Severity.CRITICAL: 3}


# ---------- queries ----------

def _recent_readings(session: Session, asset_id: str, now: datetime) -> list[tuple[datetime, float]]:
    since = now - timedelta(hours=policy.READING_WINDOW_H)
    rows = session.exec(select(Reading).where(Reading.asset_id == asset_id,
                                              Reading.recorded_at >= since,
                                              Reading.recorded_at <= now)
                        .order_by(Reading.recorded_at, Reading.id))
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
    recent = _recent_readings(session, asset.id, now)

    units = []
    for other in session.exec(select(Asset).where(Asset.business_id == asset.business_id,
                                                  Asset.id != asset.id)):
        used = sum(s.volume_l for s in _stock(session, other.id))
        other_recent = _recent_readings(session, other.id, now)
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

    previous = _recent_readings(session, asset.id, now)
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

    if severity == Severity.NORMAL and incident is None and previous:
        before = rules.classify_severity(asset.min_c, asset.max_c, previous, previous[-1][0])
        if before == Severity.WATCH:
            # A one-off warm reading (door opened?) that fixed itself: a false alarm avoided.
            audit.record(session, business_id=asset.business_id, actor_id="system",
                         action="WATCH_CLEARED", entity_type="asset", entity_id=asset.id, at=now,
                         details={"temp_c": temp_c, "watch_temp_c": previous[-1][1]})
    return reading, incident
