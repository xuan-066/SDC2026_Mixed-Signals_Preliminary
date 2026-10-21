"""SQLModel tables (plan §7). Money is integer sen; times are timezone-aware UTC."""
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import JSON, Column, DateTime, TypeDecorator
from sqlmodel import Field, SQLModel

from app.enums import (ApprovalStatus, IncidentStatus, JobStatus, Role,
                       Severity, Symptom)


def new_id(prefix: str) -> str:
    """Short readable ids, e.g. new_id("inc") -> "inc_7f3a91c2"."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


class UTCDateTime(TypeDecorator):
    """SQLite forgets timezones; store naive UTC and hand back aware UTC datetimes."""
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime; use core.clock for timestamps")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        return None if value is None else value.replace(tzinfo=UTC)


def _ts(nullable: bool = False):
    return Field(default=None, sa_column=Column(UTCDateTime(), nullable=nullable))


def _json(default_factory):
    return Field(default_factory=default_factory, sa_column=Column(JSON, nullable=False))


class Business(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    kind: str
    supervisor_limit_sen: int = 15000


class User(SQLModel, table=True):
    id: str = Field(primary_key=True)
    business_id: str = Field(foreign_key="business.id", index=True)
    name: str
    role: Role
    phone: str


class Asset(SQLModel, table=True):
    id: str = Field(primary_key=True)
    business_id: str = Field(foreign_key="business.id", index=True)
    name: str
    type: str                                   # "freezer" | "chiller"
    aliases: list[str] = _json(list)
    min_c: float
    max_c: float
    capacity_l: float
    warranty_until: date | None = None
    warranty_vendor_id: str | None = None


class StockItem(SQLModel, table=True):
    id: str = Field(primary_key=True)
    business_id: str = Field(foreign_key="business.id", index=True)
    asset_id: str = Field(foreign_key="asset.id", index=True)
    name: str
    qty: float
    unit: str
    unit_cost_sen: int
    volume_l: float


class Vendor(SQLModel, table=True):
    id: str = Field(primary_key=True)
    business_id: str = Field(foreign_key="business.id", index=True)
    name: str
    services: list[str] = _json(list)           # asset types it repairs
    callout_fee_sen: int
    sla_hours: int
    phone: str
    warranty_only: bool = False                 # only used for units under its warranty


class Reading(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("rd"), primary_key=True)
    asset_id: str = Field(foreign_key="asset.id", index=True)
    temp_c: float
    recorded_at: datetime = _ts()
    source: str                                 # "staff" | "sensor" | "sim"


class Incident(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("inc"), primary_key=True)
    business_id: str = Field(foreign_key="business.id", index=True)
    asset_id: str | None = Field(default=None, foreign_key="asset.id")  # None while NEEDS_INFO
    trigger: str                                # "reading" | "report"
    reporter_id: str | None = None
    report_text: str | None = None
    symptom: Symptom | None = None
    severity: Severity
    status: IncidentStatus
    decision: dict = _json(dict)
    stock_at_risk_sen: int = 0
    created_at: datetime = _ts()
    resolved_at: datetime | None = _ts(nullable=True)


class ApprovalRequest(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("apr"), primary_key=True)
    business_id: str = Field(foreign_key="business.id", index=True)
    subject_type: str                           # "incident"
    subject_id: str
    action: str                                 # "dispatch_vendor"
    amount_sen: int
    required_role: Role
    status: ApprovalStatus = ApprovalStatus.PENDING
    decided_by: str | None = None
    decided_at: datetime | None = _ts(nullable=True)
    note: str | None = None
    created_at: datetime = _ts()


class ServiceJob(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("job"), primary_key=True)
    business_id: str = Field(foreign_key="business.id", index=True)
    incident_id: str = Field(foreign_key="incident.id", index=True)
    vendor_id: str = Field(foreign_key="vendor.id")
    status: JobStatus = JobStatus.REQUESTED
    requested_at: datetime = _ts()
    confirmed_at: datetime | None = _ts(nullable=True)
    eta: datetime | None = _ts(nullable=True)
    done_at: datetime | None = _ts(nullable=True)
    chase_count: int = 0
    last_chased_at: datetime | None = _ts(nullable=True)


class Message(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("msg"), primary_key=True)
    business_id: str = Field(foreign_key="business.id", index=True)
    to_type: str                                # "user" | "vendor"
    to_id: str
    channel: str = "whatsapp_mock"
    body: str
    incident_id: str | None = None
    created_at: datetime = _ts()


class AuditEvent(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)  # autoincrement
    business_id: str = Field(foreign_key="business.id", index=True)
    at: datetime = _ts()
    actor_id: str                               # "system" or a user id
    action: str
    entity_type: str
    entity_id: str = Field(index=True)
    details: dict = _json(dict)
