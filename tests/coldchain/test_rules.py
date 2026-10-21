from dataclasses import replace
from datetime import date, timedelta

import pytest

from app.coldchain.rules import (Decision, IncidentContext, StockLine, UnitSpace,
                                 VendorOffer, choose_vendor, classify_severity, decide,
                                 is_valid_temp, pick_backup_unit, required_approver_role,
                                 stock_at_risk_sen)
from app.core.clock import DEMO_START
from app.enums import Role, Severity

TODAY = date(2026, 11, 12)
CHILLER = (0.0, 5.0)
FREEZER = (-35.0, -15.0)

# The §11 demo world, as plain data.
FZ2_STOCK = [
    StockLine("Butter blocks", 20, 3200, 30),
    StockLine("Puff pastry sheets", 30, 1500, 30),
    StockLine("Chicken fillet", 25, 1400, 30),
    StockLine("Ice-cream tubs", 10, 4100, 30),
]
COOLTECH = VendorOffer("v_cooltech", "CoolTech Refrigeration", ["freezer", "chiller"], 18000, 4)
SEJUKJAYA = VendorOffer("v_sejukjaya", "Sejuk Jaya Services", ["freezer", "chiller"], 12000, 8)
BRANDCARE = VendorOffer("v_brandcare", "BrandCare Warranty Centre", ["freezer"], 0, 24,
                        warranty_only=True)
VENDORS = [COOLTECH, SEJUKJAYA, BRANDCARE]
FZ1_SPACE = UnitSpace("a_fz1", "Freezer 1", "freezer", 180, True)
OTHER_UNITS = [FZ1_SPACE,
               UnitSpace("a_ch1", "Display Chiller", "chiller", 160, True),
               UnitSpace("a_ch2", "Kitchen Chiller", "chiller", 160, True)]


def readings(*temps, step_min=15):
    """Readings 15 min apart, the last one at DEMO_START."""
    n = len(temps)
    return [(DEMO_START - timedelta(minutes=step_min * (n - 1 - i)), t) for i, t in enumerate(temps)]


def severity(temps, rng=CHILLER, **kw):
    return classify_severity(*rng, readings(*temps, **kw), DEMO_START)


def fz2_context(**changes) -> IncidentContext:
    ctx = IncidentContext(
        asset_id="a_fz2", asset_name="Freezer 2", asset_type="freezer", latest_temp_c=-11.0,
        min_c=-35.0, max_c=-15.0, warranty_until=date(2026, 3, 1), warranty_vendor_id=None,
        stock=FZ2_STOCK, units=OTHER_UNITS, vendors=VENDORS, supervisor_limit_sen=15000)
    return replace(ctx, **changes)


# ---------- severity ----------

def test_valid_temp_bounds():
    assert not is_valid_temp(85.0)
    assert not is_valid_temp(-127.0)
    assert is_valid_temp(-18.0)
    assert is_valid_temp(-40.0) and is_valid_temp(50.0)


def test_in_range_is_normal():
    assert severity([4.0]) == Severity.NORMAL


def test_single_excursion_is_watch():
    assert severity([3.0, 6.0]) == Severity.WATCH


def test_two_out_of_range_is_warning():
    assert severity([6.0, 6.5]) == Severity.WARNING


def test_large_deviation_is_critical():
    assert severity([8.5]) == Severity.CRITICAL


def test_long_excursion_is_critical():
    assert severity([6.0] * 5) == Severity.CRITICAL          # 0, 15, 30, 45, 60 min


def test_freezer_thresholds():
    assert severity([-14.0, -13.5], rng=FREEZER) == Severity.WARNING
    assert severity([-11.0], rng=FREEZER) == Severity.CRITICAL


def test_exactly_3_degrees_is_critical():
    assert severity([-12.0], rng=FREEZER) == Severity.CRITICAL


def test_recovered_reading_is_normal():
    assert severity([6.0, 6.5, 4.0]) == Severity.NORMAL


def test_freezer_too_cold_is_not_an_alarm():
    assert severity([-30.0, -34.0], rng=FREEZER) == Severity.NORMAL


def test_readings_older_than_window_ignored():
    # bad readings 4 h ago, then nothing in the last 3 h → nothing to judge
    old = [(DEMO_START - timedelta(hours=4), 9.0), (DEMO_START - timedelta(hours=3, minutes=45), 9.0)]
    assert classify_severity(*CHILLER, old, DEMO_START) == Severity.NORMAL


def test_unsorted_readings_are_sorted():
    rs = readings(6.0, 6.5)
    assert classify_severity(*CHILLER, list(reversed(rs)), DEMO_START) == Severity.WARNING


# ---------- stock and backup unit ----------

def test_stock_at_risk_freezer2():
    assert stock_at_risk_sen(FZ2_STOCK) == 185000


def test_backup_picks_most_free_space():
    small = UnitSpace("a_x", "Small", "freezer", 130, True)
    big = UnitSpace("a_y", "Big", "freezer", 200, True)
    assert pick_backup_unit(120, "freezer", [small, big]).asset_id == "a_y"


def test_backup_none_when_too_small():
    assert pick_backup_unit(120, "freezer", [UnitSpace("a_x", "Small", "freezer", 100, True)]) is None


def test_backup_ignores_other_type_and_out_of_range_units():
    chiller = UnitSpace("a_ch", "Chiller", "chiller", 500, True)
    warm_freezer = UnitSpace("a_warm", "Warm", "freezer", 500, False)
    assert pick_backup_unit(120, "freezer", [chiller, warm_freezer]) is None


# ---------- vendor and approver ----------

def test_vendor_warranty_first():
    v = choose_vendor("freezer", Severity.CRITICAL, date(2027, 6, 30), "v_brandcare", TODAY, VENDORS)
    assert v.vendor_id == "v_brandcare" and v.callout_fee_sen == 0


def test_vendor_critical_fastest():
    v = choose_vendor("freezer", Severity.CRITICAL, date(2026, 3, 1), None, TODAY, VENDORS)
    assert v.vendor_id == "v_cooltech"


def test_vendor_warning_cheapest():
    v = choose_vendor("freezer", Severity.WARNING, date(2026, 3, 1), None, TODAY, VENDORS)
    assert v.vendor_id == "v_sejukjaya"


def test_vendor_expired_warranty_not_used():
    v = choose_vendor("freezer", Severity.WARNING, date(2026, 3, 1), "v_brandcare", TODAY, VENDORS)
    assert v.vendor_id == "v_sejukjaya"


def test_vendor_none_for_unserviced_type():
    assert choose_vendor("blast_chiller", Severity.CRITICAL, None, None, TODAY, VENDORS) is None


@pytest.mark.parametrize("cost,role", [(0, Role.SUPERVISOR), (15000, Role.SUPERVISOR),
                                       (15001, Role.OWNER)])
def test_approver_role_threshold(cost, role):
    assert required_approver_role(cost, 15000) == role


# ---------- the whole decision ----------

def test_decide_freezer2_critical():
    assert decide(fz2_context(), Severity.CRITICAL, TODAY) == Decision(
        severity=Severity.CRITICAL, stock_at_risk_sen=185000, volume_needed_l=120,
        backup_unit_id="a_fz1", vendor_id="v_cooltech", cost_sen=18000,
        required_role=Role.OWNER, needs_human=None,
        reasons=[   # exactly plan §8.5
            "Freezer 2 is at -11.0°C, 4.0°C above its -15.0°C limit → CRITICAL (≥3.0°C)",
            "RM1,850.00 of stock inside (4 items, 120 L)",
            "Freezer 1 has 180 L free ≥ 120 L needed → move stock there now",
            "Warranty expired 2026-03-01 → paid call-out",
            "CRITICAL → fastest vendor: CoolTech Refrigeration (4 h, RM180.00)",
            "RM180.00 > RM150.00 supervisor limit → owner approval required",
        ],
    )


def test_decide_freezer2_warning_goes_to_supervisor():
    d = decide(fz2_context(latest_temp_c=-13.5), Severity.WARNING, TODAY)
    assert (d.vendor_id, d.cost_sen, d.required_role) == ("v_sejukjaya", 12000, Role.SUPERVISOR)
    assert d.reasons[0] == ("Freezer 2 is at -13.5°C, 1.5°C above its -15.0°C limit → WARNING "
                            "(2 readings in a row out of range)")
    assert d.reasons[-1] == "RM120.00 ≤ RM150.00 supervisor limit → supervisor approval required"


def test_decide_under_warranty_is_free():
    d = decide(fz2_context(asset_id="a_fz1", asset_name="Freezer 1", warranty_until=date(2027, 6, 30),
                           warranty_vendor_id="v_brandcare", units=[]),
               Severity.CRITICAL, TODAY)
    assert (d.vendor_id, d.cost_sen, d.required_role) == ("v_brandcare", 0, Role.SUPERVISOR)
    assert "Under warranty until 2027-06-30 → BrandCare Warranty Centre (24 h, no charge)" in d.reasons


def test_decide_no_backup_space():
    d = decide(fz2_context(units=[]), Severity.CRITICAL, TODAY)
    assert d.backup_unit_id is None
    assert "No backup space — move stock to an ice box / another outlet" in d.reasons


def test_decide_no_vendor_needs_human():
    d = decide(fz2_context(vendors=[]), Severity.CRITICAL, TODAY)
    assert d.vendor_id is None and d.cost_sen == 0
    assert d.needs_human == "No vendor services freezer units — assign one"


def test_decide_long_excursion_reason():
    d = decide(fz2_context(latest_temp_c=-14.0), Severity.CRITICAL, TODAY)
    assert d.reasons[0].endswith("→ CRITICAL (out of range ≥60 min)")
