"""Pure decision rules (plan §8). No database, no clock: data in, decision + reasons out.

Every decision carries plain-language `reasons`, which the UI shows as-is.
"""
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta

from app.coldchain import policy
from app.enums import Role, Severity, Symptom
from app.money import rm_label

_EPS = 1e-9     # float tolerance for ≥ comparisons on °C


@dataclass
class StockLine:
    name: str
    qty: float
    unit_cost_sen: int
    volume_l: float


@dataclass
class UnitSpace:
    asset_id: str
    name: str
    asset_type: str
    free_l: float
    in_range: bool


@dataclass
class VendorOffer:
    vendor_id: str
    name: str
    services: list[str]
    callout_fee_sen: int
    sla_hours: int
    warranty_only: bool = False     # e.g. a brand's warranty centre: never a paid call-out


@dataclass
class IncidentContext:
    asset_id: str
    asset_name: str
    asset_type: str
    latest_temp_c: float | None     # None when there are no recent readings
    min_c: float
    max_c: float
    warranty_until: date | None
    warranty_vendor_id: str | None
    stock: list[StockLine]
    units: list[UnitSpace]          # the other units of the business
    vendors: list[VendorOffer]
    supervisor_limit_sen: int
    report_symptom: str | None = None   # set when staff reported it in a message [S]


@dataclass
class Decision:
    severity: Severity
    stock_at_risk_sen: int
    volume_needed_l: float
    backup_unit_id: str | None
    vendor_id: str | None
    cost_sen: int
    required_role: Role
    reasons: list[str]
    needs_human: str | None


# ---------- readings → severity ----------

def is_valid_temp(temp_c: float) -> bool:
    low, high = policy.VALID_TEMP_RANGE
    return low <= temp_c <= high


def deviation_c(temp_c: float, min_c: float, max_c: float) -> float:
    """°C outside the range; 0 when in range."""
    if temp_c > max_c:
        return temp_c - max_c
    if temp_c < min_c:
        return min_c - temp_c
    return 0.0


def _out_of_range(temp_c: float, min_c: float, max_c: float) -> bool:
    return temp_c < min_c or temp_c > max_c


def severity_from_symptom(symptom: Symptom) -> Severity:
    """[S] For staff messages: no cooling or no power puts the stock at risk now."""
    if symptom in (Symptom.NOT_COOLING, Symptom.POWER_OFF):
        return Severity.CRITICAL
    return Severity.WARNING


def classify_severity(min_c: float, max_c: float,
                      readings: list[tuple[datetime, float]], now: datetime) -> Severity:
    """Readings are (recorded_at, temp_c); only the last READING_WINDOW_H hours count."""
    since = now - timedelta(hours=policy.READING_WINDOW_H)
    recent = sorted((r for r in readings if since <= r[0] <= now), key=lambda r: r[0])
    if not recent:
        return Severity.NORMAL

    latest_at, latest_temp = recent[-1]
    if not _out_of_range(latest_temp, min_c, max_c):
        return Severity.NORMAL                                           # rule 1
    if deviation_c(latest_temp, min_c, max_c) >= policy.CRITICAL_DEVIATION_C - _EPS:
        return Severity.CRITICAL                                         # rule 2

    run_start = latest_at                       # start of the current out-of-range run
    streak = 0
    for at, temp in reversed(recent):
        if not _out_of_range(temp, min_c, max_c):
            break
        run_start = at
        streak += 1
    if latest_at - run_start >= timedelta(minutes=policy.CRITICAL_DURATION_MIN):
        return Severity.CRITICAL                                         # rule 3
    if streak >= policy.WARNING_MIN_STREAK:
        return Severity.WARNING                                          # rule 4
    return Severity.WATCH                                                # rule 5


# ---------- connected data → choices ----------

def stock_at_risk_sen(stock: list[StockLine]) -> int:
    return round(sum(line.qty * line.unit_cost_sen for line in stock))


def pick_backup_unit(needed_l: float, asset_type: str,
                     units: list[UnitSpace]) -> UnitSpace | None:
    """Same type, currently in range, enough space; the most free space wins."""
    fits = [u for u in units
            if u.asset_type == asset_type and u.in_range and u.free_l >= needed_l]
    return max(fits, key=lambda u: u.free_l, default=None)


def _warranty_valid(warranty_until: date | None, warranty_vendor_id: str | None,
                    today: date) -> bool:
    return warranty_until is not None and warranty_vendor_id is not None and warranty_until >= today


def choose_vendor(asset_type: str, severity: Severity, warranty_until: date | None,
                  warranty_vendor_id: str | None, today: date,
                  vendors: list[VendorOffer]) -> VendorOffer | None:
    """Warranty partner first (cost 0); else CRITICAL → fastest, otherwise → cheapest."""
    if _warranty_valid(warranty_until, warranty_vendor_id, today):
        for v in vendors:
            if v.vendor_id == warranty_vendor_id:
                return replace(v, callout_fee_sen=0)

    able = [v for v in vendors if asset_type in v.services and not v.warranty_only]
    if severity == Severity.CRITICAL:
        able.sort(key=lambda v: (v.sla_hours, v.callout_fee_sen))
    else:
        able.sort(key=lambda v: (v.callout_fee_sen, v.sla_hours))
    return able[0] if able else None


def required_approver_role(cost_sen: int, supervisor_limit_sen: int) -> Role:
    return Role.SUPERVISOR if cost_sen <= supervisor_limit_sen else Role.OWNER


# ---------- the whole decision ----------

def _c(temp: float) -> str:
    return f"{temp:.1f}°C"


def _l(litres: float) -> str:
    return f"{litres:g} L"


_SYMPTOM_TEXT = {
    "not_cooling": "is not cooling", "power_off": "has no power", "too_cold": "is too cold",
    "leaking": "is leaking", "noise": "is making noise", "door_issue": "has a door problem",
    "other": "has a problem",
}


def _severity_reason(ctx: IncidentContext, severity: Severity) -> str:
    if ctx.report_symptom is not None:
        now = f" (now {_c(ctx.latest_temp_c)})" if ctx.latest_temp_c is not None else ""
        return (f"Staff report: {ctx.asset_name} {_SYMPTOM_TEXT[ctx.report_symptom]}{now} "
                f"→ {severity}")
    if ctx.latest_temp_c is None:
        return f"{ctx.asset_name}: no recent reading → {severity}"
    dev = deviation_c(ctx.latest_temp_c, ctx.min_c, ctx.max_c)
    if dev == 0:
        return f"{ctx.asset_name} is at {_c(ctx.latest_temp_c)} (within range) → {severity}"
    if ctx.latest_temp_c > ctx.max_c:
        where = f"{dev:.1f}°C above its {_c(ctx.max_c)} limit"
    else:
        where = f"{dev:.1f}°C below its {_c(ctx.min_c)} limit"
    if severity == Severity.CRITICAL and dev >= policy.CRITICAL_DEVIATION_C - _EPS:
        why = f"≥{policy.CRITICAL_DEVIATION_C:.1f}°C"
    elif severity == Severity.CRITICAL:
        why = f"out of range ≥{policy.CRITICAL_DURATION_MIN} min"
    elif severity == Severity.WARNING:
        why = f"{policy.WARNING_MIN_STREAK} readings in a row out of range"
    else:
        why = "single reading out of range"
    return f"{ctx.asset_name} is at {_c(ctx.latest_temp_c)}, {where} → {severity} ({why})"


def decide(ctx: IncidentContext, severity: Severity, today: date) -> Decision:
    reasons = [_severity_reason(ctx, severity)]

    at_risk = stock_at_risk_sen(ctx.stock)
    needed_l = sum(line.volume_l for line in ctx.stock)
    reasons.append(f"{rm_label(at_risk)} of stock inside ({len(ctx.stock)} items, {_l(needed_l)})")

    backup = pick_backup_unit(needed_l, ctx.asset_type, ctx.units)
    if backup:
        reasons.append(f"{backup.name} has {_l(backup.free_l)} free ≥ {_l(needed_l)} needed "
                       f"→ move stock there now")
    else:
        reasons.append("No backup space — move stock to an ice box / another outlet")

    vendor = choose_vendor(ctx.asset_type, severity, ctx.warranty_until,
                           ctx.warranty_vendor_id, today, ctx.vendors)
    under_warranty = (_warranty_valid(ctx.warranty_until, ctx.warranty_vendor_id, today)
                      and vendor is not None and vendor.vendor_id == ctx.warranty_vendor_id)
    if under_warranty:
        reasons.append(f"Under warranty until {ctx.warranty_until.isoformat()} → "
                       f"{vendor.name} ({vendor.sla_hours} h, no charge)")
    else:
        if ctx.warranty_until is None:
            reasons.append("No warranty → paid call-out")
        elif ctx.warranty_until < today:
            reasons.append(f"Warranty expired {ctx.warranty_until.isoformat()} → paid call-out")
        else:
            reasons.append(f"Under warranty until {ctx.warranty_until.isoformat()}, "
                           f"but the warranty vendor is not on file → paid call-out")
        if vendor:
            pick = "fastest" if severity == Severity.CRITICAL else "cheapest"
            reasons.append(f"{severity} → {pick} vendor: {vendor.name} "
                           f"({vendor.sla_hours} h, {rm_label(vendor.callout_fee_sen)})")

    needs_human = None
    cost = vendor.callout_fee_sen if vendor else 0
    role = required_approver_role(cost, ctx.supervisor_limit_sen)
    if vendor is None:
        needs_human = f"No vendor services {ctx.asset_type} units — assign one"
        reasons.append(needs_human)
    else:
        limit = rm_label(ctx.supervisor_limit_sen)
        if role == Role.OWNER:
            reasons.append(f"{rm_label(cost)} > {limit} supervisor limit → owner approval required")
        else:
            reasons.append(f"{rm_label(cost)} ≤ {limit} supervisor limit → supervisor approval required")

    return Decision(
        severity=severity, stock_at_risk_sen=at_risk, volume_needed_l=needed_l,
        backup_unit_id=backup.asset_id if backup else None,
        vendor_id=vendor.vendor_id if vendor else None, cost_sen=cost,
        required_role=role, reasons=reasons, needs_human=needs_human,
    )
