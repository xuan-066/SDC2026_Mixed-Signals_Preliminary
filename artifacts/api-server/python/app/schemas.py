"""Request/response shapes = the API contract (plan §10). They also drive the /docs examples.

Money is a 2-decimal RM string ("1850.00"), and null when the viewer may not see money (§9).
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.coldchain.parser import ParsedReport
from app.core.rbac import Perm
from app.enums import ApprovalStatus, IncidentStatus, JobStatus, Role, Severity, Symptom


class ResetOut(BaseModel):
    status: str
    now: datetime


class AdvanceIn(BaseModel):
    minutes: int = Field(ge=0, le=24 * 60, examples=[60])


class AdvanceOut(BaseModel):
    now: datetime
    actions: list[str]                 # what happened because time passed, e.g. vendor chased


class MeOut(BaseModel):
    id: str
    name: str
    role: Role
    business_id: str
    business_name: str
    permissions: list[Perm]


# ---------- readings ----------

class ReadingIn(BaseModel):
    asset_id: str = Field(examples=["a_fz2"])
    temp_c: float = Field(examples=[-11.0])
    source: Literal["staff", "sensor", "sim"] = "staff"


class ReadingOut(BaseModel):
    id: str
    asset_id: str
    temp_c: float
    recorded_at: datetime
    source: str


# ---------- assets ----------

class AssetOut(BaseModel):
    id: str
    name: str
    type: str
    range_c: tuple[float, float]
    status: Severity                   # severity from the last 3 h of readings
    latest_temp_c: float | None
    latest_reading_at: datetime | None
    active_incident_id: str | None
    capacity_l: float
    free_l: float
    archived: bool = False
    reading_state: Literal["missing", "stale", "current"] = "missing"


class StockOut(BaseModel):
    id: str
    name: str
    qty: float
    unit: str
    volume_l: float
    unit_cost_rm: str | None
    value_rm: str | None


class AssetDetailOut(AssetOut):
    aliases: list[str]
    warranty_until: str | None
    stock: list[StockOut]
    stock_value_rm: str | None
    readings: list[ReadingOut]         # last 24, oldest first
    warranty_vendor_id: str | None = None


# ---------- vendors ----------

class VendorOut(BaseModel):
    id: str
    name: str
    services: list[str]
    callout_rm: str
    sla_hours: int
    warranty_only: bool
    phone: str
    archived: bool = False


# ---------- incidents ----------

class IncidentAssetOut(BaseModel):
    id: str
    name: str
    latest_temp_c: float | None
    range_c: tuple[float, float]


class BackupUnitOut(BaseModel):
    id: str
    name: str
    free_l: float


class DecisionVendorOut(BaseModel):
    id: str
    name: str
    callout_rm: str | None
    sla_hours: int


class DecisionOut(BaseModel):
    backup_unit: BackupUnitOut | None
    vendor: DecisionVendorOut | None
    required_role: Role
    reasons: list[str]
    needs_human: str | None


class ApprovalOut(BaseModel):
    id: str
    status: ApprovalStatus
    required_role: Role
    amount_rm: str | None
    can_decide: bool                   # this viewer may approve/reject it right now
    subject_type: str
    subject_id: str
    action: str
    summary: str                       # one line for the approval card
    created_at: datetime
    decided_by: str | None
    decided_at: datetime | None
    note: str | None


class JobOut(BaseModel):
    id: str
    status: JobStatus
    vendor_id: str
    vendor_name: str
    incident_id: str
    requested_at: datetime
    confirmed_at: datetime | None
    eta: datetime | None
    done_at: datetime | None
    chase_count: int


class TimelineEventOut(BaseModel):
    at: datetime
    actor: str
    action: str
    details: dict


class IncidentOut(BaseModel):
    id: str
    status: IncidentStatus
    severity: Severity
    trigger: str
    asset: IncidentAssetOut | None
    stock_at_risk_rm: str | None
    decision: DecisionOut | None
    approval: ApprovalOut | None
    job: JobOut | None
    timeline: list[TimelineEventOut]   # oldest first
    created_at: datetime
    resolved_at: datetime | None
    reporter_id: str | None = None     # [S] staff reports only
    report_text: str | None = None     # phone numbers / emails already redacted
    symptom: Symptom | None = None


class ReportIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000, examples=["Freezer 2 tak sejuk, ais dah cair"])


class ReportResult(BaseModel):
    incident: IncidentOut
    parsed: ParsedReport
    parser_source: Literal["rules", "llm", "rules_fallback"]


class ClarifyIn(BaseModel):
    asset_id: str = Field(examples=["a_fz2"])


class ReadingResult(BaseModel):
    reading: ReadingOut
    incident: IncidentOut | None


class SensorIn(BaseModel):
    asset_id: str = Field(examples=["a_fz2"])
    pattern: Literal["compressor_fail", "door_open", "recover"]


class SensorOut(BaseModel):
    now: datetime
    readings: list[ReadingOut]
    incident: IncidentOut | None       # the unit's active incident afterwards (owner view)


# ---------- approvals and jobs ----------

class ApproveIn(BaseModel):
    note: str | None = None


class RejectIn(BaseModel):
    note: str = Field(min_length=1, examples=["I'll call my usual technician"])


class ApprovalResult(BaseModel):
    approval: ApprovalOut
    incident: IncidentOut | None


class ConfirmIn(BaseModel):
    eta: datetime | None = Field(default=None, description="Defaults to now + the vendor's SLA")


class JobResult(BaseModel):
    job: JobOut
    incident: IncidentOut


# ---------- messages, audit, metrics ----------

class MessageOut(BaseModel):
    id: str
    to_type: str
    to_id: str
    channel: str
    body: str
    incident_id: str | None
    created_at: datetime


class AuditEventOut(BaseModel):
    id: int
    at: datetime
    actor_id: str
    action: str
    entity_type: str
    entity_id: str
    details: dict


class MetricsOut(BaseModel):
    incidents_total: int
    incidents_resolved: int
    median_min_detect_to_dispatch: float | None   # incident created → job requested
    stock_protected_rm: str                       # Σ stock at risk of RESOLVED incidents
    automated_actions: int                        # audit events by "system"
    false_alarms_avoided: int                     # count of WATCH_CLEARED
