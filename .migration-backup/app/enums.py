from enum import StrEnum


class Role(StrEnum):            # rank: staff < supervisor < owner
    STAFF = "staff"
    SUPERVISOR = "supervisor"
    OWNER = "owner"


class Severity(StrEnum):
    NORMAL = "NORMAL"
    WATCH = "WATCH"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class IncidentStatus(StrEnum):
    NEEDS_INFO = "NEEDS_INFO"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    DISPATCHED = "DISPATCHED"
    DECLINED = "DECLINED"
    RESOLVED = "RESOLVED"


class ApprovalStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class JobStatus(StrEnum):
    REQUESTED = "REQUESTED"
    CONFIRMED = "CONFIRMED"
    DONE = "DONE"


class Symptom(StrEnum):
    NOT_COOLING = "not_cooling"
    TOO_COLD = "too_cold"
    LEAKING = "leaking"
    NOISE = "noise"
    POWER_OFF = "power_off"
    DOOR_ISSUE = "door_issue"
    OTHER = "other"
