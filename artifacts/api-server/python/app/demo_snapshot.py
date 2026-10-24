"""Build a fictional cold-chain scenario once, before making it query-only."""
from sqlmodel import Session

from app.coldchain import scheduler, workflow
from app.models import User


def prepare_snapshot(session: Session, clock):
    aina = session.get(User, "u_aina")
    scheduler.simulate_sensor(
        session, asset_id="a_fz2", pattern="compressor_fail", clock=clock, actor=aina,
    )
    lim = session.get(User, "u_lim")
    for asset_id, temperature, actor in (
        ("a_fz1", -18.0, aina),
        ("a_ch1", 3.2, aina),
        ("a_ch2", 4.1, aina),
        ("a_bm_fz1", -18.0, lim),
        ("a_bm_fz2", -19.0, lim),
    ):
        workflow.process_reading(
            session, asset_id=asset_id, temp_c=temperature,
            source="sim", actor=actor, now=clock.now(),
        )
    session.commit()
