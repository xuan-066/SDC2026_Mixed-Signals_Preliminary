"""Request/response shapes = the API contract (plan §10). They also drive the /docs examples."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.rbac import Perm
from app.enums import IncidentStatus, Role, Severity


class ResetOut(BaseModel):
    status: str
    now: datetime


class MeOut(BaseModel):
    id: str
    name: str
    role: Role
    business_id: str
    business_name: str
    permissions: list[Perm]


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


class IncidentBrief(BaseModel):
    """Short incident view returned with a reading. T8 adds the full IncidentOut (§10)."""
    id: str
    status: IncidentStatus
    severity: Severity
    trigger: str
    asset_id: str | None
    stock_at_risk_rm: str | None       # null for staff (§9)
    required_role: Role | None
    reasons: list[str]
    needs_human: str | None
    created_at: datetime


class ReadingResult(BaseModel):
    reading: ReadingOut
    incident: IncidentBrief | None
