"""Run the T4 decision rules on Freezer 2 from the demo world: `python scripts/try_rules.py`."""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.coldchain.rules import (IncidentContext, StockLine, UnitSpace, VendorOffer,  # noqa: E402
                                 classify_severity, decide)
from app.core.clock import DEMO_START  # noqa: E402
from app.money import rm_label  # noqa: E402

TODAY = date(2026, 11, 12)
VENDORS = [
    VendorOffer("v_cooltech", "CoolTech Refrigeration", ["freezer", "chiller"], 18000, 4),
    VendorOffer("v_sejukjaya", "Sejuk Jaya Services", ["freezer", "chiller"], 12000, 8),
    VendorOffer("v_brandcare", "BrandCare Warranty Centre", ["freezer"], 0, 24, warranty_only=True),
]


def freezer2(temps: list[float]) -> None:
    readings = [(DEMO_START + timedelta(minutes=15 * i), t) for i, t in enumerate(temps)]
    now = readings[-1][0]
    severity = classify_severity(-35.0, -15.0, readings, now)
    print(f"\nFreezer 2 readings {temps} → {severity}")
    if severity in ("NORMAL", "WATCH"):
        print("  no incident (nothing to decide)")
        return
    ctx = IncidentContext(
        asset_id="a_fz2", asset_name="Freezer 2", asset_type="freezer", latest_temp_c=temps[-1],
        min_c=-35.0, max_c=-15.0, warranty_until=date(2026, 3, 1), warranty_vendor_id=None,
        stock=[StockLine("Butter blocks", 20, 3200, 30), StockLine("Puff pastry sheets", 30, 1500, 30),
               StockLine("Chicken fillet", 25, 1400, 30), StockLine("Ice-cream tubs", 10, 4100, 30)],
        units=[UnitSpace("a_fz1", "Freezer 1", "freezer", 180, True)],
        vendors=VENDORS, supervisor_limit_sen=15000)
    d = decide(ctx, severity, TODAY)
    print(f"  vendor={d.vendor_id}  cost={rm_label(d.cost_sen)}  approver={d.required_role}"
          f"  backup={d.backup_unit_id}")
    for i, reason in enumerate(d.reasons, 1):
        print(f"  {i}. {reason}")


if __name__ == "__main__":
    freezer2([-18.0])                 # normal
    freezer2([-18.0, -13.0])          # one warm reading: door opened?
    freezer2([-18.0, -14.0, -13.5])   # two in a row
    freezer2([-18.0, -13.0, -11.0])   # the golden demo
