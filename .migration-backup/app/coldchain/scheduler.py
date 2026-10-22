"""Things that happen because time passes: vendor chasing (§8.4) and the fake sensor.

In the demo, time only passes through /v1/sim/advance and /v1/sim/sensor, which call these.
"""
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.coldchain import policy, workflow
from app.core import audit, notifier
from app.core.clock import Clock
from app.enums import JobStatus
from app.models import Asset, Incident, Reading, ServiceJob, User, Vendor

SENSOR_PATTERNS = {                    # written for a freezer with a -15.0 °C upper limit
    "compressor_fail": [-18.0, -13.0, -11.0],
    "door_open":       [-18.0, -13.0, -18.0],
    "recover":         [-17.5],
}
_PATTERN_MAX_C = -15.0
SENSOR_STEP_MIN = 15


def pattern_temps(pattern: str, max_c: float) -> list[float]:
    """The pattern shifted to the unit's own upper limit, so a chiller (0…5 °C) fails at
    2 → 7 → 9 °C instead of reporting freezer temperatures. Freezers get the plan's values."""
    return [round(max_c + (t - _PATTERN_MAX_C), 1) for t in SENSOR_PATTERNS[pattern]]


def run_scheduled_checks(session: Session, now: datetime) -> list[str]:
    """Chase vendors who haven't confirmed. Each job is chased at most once per call and at
    most MAX_CHASES times in total, so a 180-minute jump can't fire three reminders at once."""
    actions = []
    wait = timedelta(minutes=policy.VENDOR_CHASE_MIN)
    jobs = session.exec(select(ServiceJob).where(ServiceJob.status == JobStatus.REQUESTED)
                        .order_by(ServiceJob.requested_at))
    for job in jobs:
        if job.chase_count >= policy.MAX_CHASES:
            continue
        if now - (job.last_chased_at or job.requested_at) < wait:
            continue
        job.chase_count += 1
        job.last_chased_at = now
        session.add(job)

        vendor = session.get(Vendor, job.vendor_id)
        incident = session.get(Incident, job.incident_id)
        asset = session.get(Asset, incident.asset_id)
        reminder = f"reminder {job.chase_count} of {policy.MAX_CHASES}"
        audit.record(session, business_id=job.business_id, actor_id="system",
                     action="VENDOR_CHASED", entity_type="job", entity_id=job.id, at=now,
                     details={"incident_id": incident.id, "vendor_id": vendor.id,
                              "chase_count": job.chase_count})
        notifier.send(session, business_id=job.business_id, to_type="vendor", to_id=vendor.id,
                      at=now, incident_id=incident.id,
                      body=f"Reminder: job {job.id} for {asset.name} is still waiting for your "
                           f"arrival time. Please confirm ({reminder}).")
        actions.append(f"Chased {vendor.name} about {asset.name} (job {job.id}, {reminder})")
    return actions


def simulate_sensor(session: Session, *, asset_id: str, pattern: str, clock: Clock,
                    actor: User) -> list[Reading]:
    """Post a pattern of readings 15 minutes apart, moving the clock between them. Each one
    goes through the normal workflow, exactly like a real sensor would."""
    asset = session.get(Asset, asset_id)
    readings = []
    for i, temp_c in enumerate(pattern_temps(pattern, asset.max_c)):
        if i:
            clock.advance(SENSOR_STEP_MIN)
        reading, _ = workflow.process_reading(session, asset_id=asset_id, temp_c=temp_c,
                                              source="sim", actor=actor, now=clock.now())
        readings.append(reading)
    return readings
