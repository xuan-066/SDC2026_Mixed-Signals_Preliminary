"""Request/response shapes = the API contract (plan §10). They also drive the /docs examples."""
from datetime import datetime

from pydantic import BaseModel

from app.core.rbac import Perm
from app.enums import Role


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
