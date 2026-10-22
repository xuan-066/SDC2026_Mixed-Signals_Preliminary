"""Database rows → API shapes. Money visibility (§9) is applied here, in one place."""
from datetime import datetime, timedelta
import re

from sqlmodel import Session, select

from app.coldchain import rules, workflow
from app.core import audit
from app.core.approvals import can_decide
from app.core.rbac import Perm, has_perm, role_at_least
from app.enums import ApprovalStatus
from app.models import (READING_SEQ, ApprovalRequest, Asset, Incident, Reading, ServiceJob,
                        StockItem, User, Vendor)
from app.money import rm_str
from app.schemas import (ApprovalOut, AssetDetailOut, AssetOut, AuditEventOut, BackupUnitOut,
                         DecisionOut, DecisionVendorOut, IncidentAssetOut, IncidentOut, JobOut,
                         MessageOut, ReadingOut, StockOut, TimelineEventOut, VendorOut)


def money(sen: int | None, viewer: User) -> str | None:
    if sen is None or not has_perm(viewer.role, Perm.VIEW_MONEY):
        return None
    return rm_str(sen)


# ---------- assets ----------

def _latest_reading(session: Session, asset_id: str) -> Reading | None:
    return session.exec(select(Reading).where(Reading.asset_id == asset_id)
                        .order_by(Reading.recorded_at.desc(), READING_SEQ.desc())).first()


def _stock(session: Session, asset_id: str) -> list[StockItem]:
    return list(session.exec(select(StockItem).where(StockItem.asset_id == asset_id)
                             .order_by(StockItem.id)))


def asset_out(session: Session, asset: Asset, now: datetime) -> AssetOut:
    latest = _latest_reading(session, asset.id)
    recent = workflow.recent_readings(session, asset.id, now)
    active = workflow.active_incident(session, asset.id)
    used = sum(s.volume_l for s in _stock(session, asset.id))
    return AssetOut(
        id=asset.id, name=asset.name, type=asset.type, range_c=(asset.min_c, asset.max_c),
        status=rules.classify_severity(asset.min_c, asset.max_c, recent, now),
        latest_temp_c=latest.temp_c if latest else None,
        latest_reading_at=latest.recorded_at if latest else None,
        active_incident_id=active.id if active else None,
        capacity_l=asset.capacity_l, free_l=asset.capacity_l - used,
        archived=asset.archived,
        reading_state=("missing" if latest is None else "stale"
                       if now - latest.recorded_at > timedelta(minutes=60) else "current"),
    )


def asset_detail_out(session: Session, asset: Asset, viewer: User, now: datetime) -> AssetDetailOut:
    stock = _stock(session, asset.id)
    readings = list(session.exec(select(Reading).where(Reading.asset_id == asset.id)
                                 .order_by(Reading.recorded_at.desc(), READING_SEQ.desc())
                                 .limit(24)))
    return AssetDetailOut(
        **asset_out(session, asset, now).model_dump(),
        aliases=list(asset.aliases),
        warranty_until=asset.warranty_until.isoformat() if asset.warranty_until else None,
        warranty_vendor_id=asset.warranty_vendor_id,
        stock=[StockOut(id=s.id, name=s.name, qty=s.qty, unit=s.unit, volume_l=s.volume_l,
                        unit_cost_rm=money(s.unit_cost_sen, viewer),
                        value_rm=money(round(s.qty * s.unit_cost_sen), viewer))
               for s in stock],
        stock_value_rm=money(rules.stock_at_risk_sen(
            [rules.StockLine(s.name, s.qty, s.unit_cost_sen, s.volume_l) for s in stock]), viewer),
        readings=[ReadingOut.model_validate(r, from_attributes=True) for r in reversed(readings)],
    )


def vendor_out(vendor: Vendor) -> VendorOut:
    return VendorOut(id=vendor.id, name=vendor.name, services=list(vendor.services),
                     callout_rm=rm_str(vendor.callout_fee_sen), sla_hours=vendor.sla_hours,
                     warranty_only=vendor.warranty_only, phone=vendor.phone, archived=vendor.archived)


# ---------- approvals, jobs ----------

def approval_out(session: Session, approval: ApprovalRequest, viewer: User) -> ApprovalOut:
    summary = f"{approval.action} for {approval.subject_type} {approval.subject_id}"
    if approval.subject_type == "incident":
        incident = session.get(Incident, approval.subject_id)
        asset = session.get(Asset, incident.asset_id) if incident and incident.asset_id else None
        vendor = (incident.decision or {}).get("vendor") if incident else None
        if asset and vendor:
            summary = (f"{vendor['name']} call-out for {asset.name} "
                       f"({incident.severity.value})")
    return ApprovalOut(
        id=approval.id, status=approval.status, required_role=approval.required_role,
        amount_rm=money(approval.amount_sen, viewer),
        can_decide=(approval.status == ApprovalStatus.PENDING
                    and can_decide(session, approval, viewer)),
        subject_type=approval.subject_type, subject_id=approval.subject_id,
        action=approval.action, summary=summary, created_at=approval.created_at,
        decided_by=approval.decided_by, decided_at=approval.decided_at, note=approval.note,
    )


def job_out(session: Session, job: ServiceJob) -> JobOut:
    vendor = session.get(Vendor, job.vendor_id)
    return JobOut(id=job.id, status=job.status, vendor_id=job.vendor_id, vendor_name=vendor.name,
                  incident_id=job.incident_id, requested_at=job.requested_at,
                  confirmed_at=job.confirmed_at, eta=job.eta, done_at=job.done_at,
                  chase_count=job.chase_count)


# ---------- incidents ----------

def _decision_out(decision: dict, viewer: User) -> DecisionOut | None:
    if not decision:
        return None
    backup, vendor = decision.get("backup_unit"), decision.get("vendor")
    return DecisionOut(
        backup_unit=BackupUnitOut(**backup) if backup else None,
        vendor=DecisionVendorOut(id=vendor["id"], name=vendor["name"],
                                 callout_rm=money(vendor["callout_sen"], viewer),
                                 sla_hours=vendor["sla_hours"]) if vendor else None,
        required_role=decision["required_role"],
        reasons=[r if has_perm(viewer.role, Perm.VIEW_MONEY)
                 else re.sub(r"RM\s*[\d,.]+", "[restricted]", r)
                 for r in decision.get("reasons", [])],
        needs_human=decision.get("needs_human"),
    )


def incident_out(session: Session, incident: Incident, viewer: User) -> IncidentOut:
    asset = session.get(Asset, incident.asset_id) if incident.asset_id else None
    latest = _latest_reading(session, asset.id) if asset else None
    approval = session.exec(select(ApprovalRequest).where(
        ApprovalRequest.subject_type == "incident", ApprovalRequest.subject_id == incident.id)
        .order_by(ApprovalRequest.created_at.desc())).first()
    job = workflow.job_for(session, incident.id)
    see_money = has_perm(viewer.role, Perm.VIEW_MONEY)
    events = audit.list_events(session, business_id=incident.business_id, entity_id=incident.id)
    return IncidentOut(
        id=incident.id, status=incident.status, severity=incident.severity,
        trigger=incident.trigger,
        asset=IncidentAssetOut(id=asset.id, name=asset.name,
                               latest_temp_c=latest.temp_c if latest else None,
                               range_c=(asset.min_c, asset.max_c)) if asset else None,
        stock_at_risk_rm=money(incident.stock_at_risk_sen, viewer),
        decision=_decision_out(incident.decision, viewer),
        approval=approval_out(session, approval, viewer) if approval else None,
        job=job_out(session, job) if job else None,
        # Details can carry amounts, so staff see what happened and when, not the figures.
        timeline=[TimelineEventOut(at=e.at, actor=e.actor_id, action=e.action,
                                   details=e.details if see_money else {}) for e in events],
        created_at=incident.created_at, resolved_at=incident.resolved_at,
        reporter_id=incident.reporter_id, report_text=incident.report_text,
        symptom=incident.symptom,
    )


def message_out(m) -> MessageOut:
    return MessageOut.model_validate(m, from_attributes=True)


def audit_event_out(e) -> AuditEventOut:
    return AuditEventOut.model_validate(e, from_attributes=True)
