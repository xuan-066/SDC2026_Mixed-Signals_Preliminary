"""The fictional demo world (plan §11). Every name and number here is synthetic."""
from datetime import date

from sqlmodel import Session, select

from app.enums import Role
from app.models import Asset, Business, StockItem, User, Vendor

SERI_PAGI = "b_seripagi"
BEKU_MAJU = "b_bekumaju"

FREEZER_RANGE = (-35.0, -15.0)
CHILLER_RANGE = (0.0, 5.0)


def _asset(id, business_id, name, type, capacity_l, aliases,
           warranty_until=None, warranty_vendor_id=None) -> Asset:
    min_c, max_c = FREEZER_RANGE if type == "freezer" else CHILLER_RANGE
    return Asset(id=id, business_id=business_id, name=name, type=type, aliases=aliases,
                 min_c=min_c, max_c=max_c, capacity_l=capacity_l,
                 warranty_until=warranty_until, warranty_vendor_id=warranty_vendor_id)


# (asset_id, item key, name, qty, unit, unit_cost_sen, volume_l)
_STOCK = [
    # Freezer 2: 185000 sen = RM1,850.00, 120 L (the golden demo unit)
    ("a_fz2", "butter",    "Butter blocks",       20, "block", 3200, 30),
    ("a_fz2", "pastry",    "Puff pastry sheets",  30, "pack",  1500, 30),
    ("a_fz2", "chicken",   "Chicken fillet",      25, "kg",    1400, 30),
    ("a_fz2", "icecream",  "Ice-cream tubs",      10, "tub",   4100, 30),
    # Freezer 1: 220 L used of 400 → 180 L free
    ("a_fz1", "croissant", "Frozen croissant dough", 40, "pack", 1800, 80),
    ("a_fz1", "berries",   "Frozen mixed berries",   30, "kg",   2200, 60),
    ("a_fz1", "prawns",    "Frozen prawns",          15, "kg",   3500, 50),
    ("a_fz1", "peas",      "Frozen peas",            20, "kg",    600, 30),
    # Display Chiller: 90 L
    ("a_ch1", "cakes",     "Cheesecake slices",   24, "slice",  900, 40),
    ("a_ch1", "drinks",    "Bottled drinks",      48, "bottle", 250, 50),
    # Kitchen Chiller: 140 L
    ("a_ch2", "milk",      "Fresh milk",          20, "litre",  700, 40),
    ("a_ch2", "cream",     "Whipping cream",      15, "litre", 1600, 30),
    ("a_ch2", "eggs",      "Eggs (tray of 30)",   10, "tray",  1500, 40),
    ("a_ch2", "veg",       "Fresh vegetables",    12, "kg",     800, 30),
    # Beku Maju (isolation test only)
    ("a_bm_fz1", "nuggets", "Chicken nuggets",    50, "pack",  1200, 100),
    ("a_bm_fz2", "fishball", "Fish balls",        40, "pack",   900, 80),
]


def seed(session: Session) -> None:
    """Write the §11 demo world. Expects empty tables."""
    session.add_all([
        Business(id=SERI_PAGI, name="Seri Pagi Bakery & Café", kind="bakery_cafe",
                 supervisor_limit_sen=15000),
        Business(id=BEKU_MAJU, name="Beku Maju Frozen Foods", kind="frozen_food",
                 supervisor_limit_sen=15000),
    ])
    session.flush()

    session.add_all([
        User(id="u_rina",   business_id=SERI_PAGI, name="Rina",   role=Role.OWNER,      phone="demo-0001"),
        User(id="u_daniel", business_id=SERI_PAGI, name="Daniel", role=Role.SUPERVISOR, phone="demo-0002"),
        User(id="u_aina",   business_id=SERI_PAGI, name="Aina",   role=Role.STAFF,      phone="demo-0003"),
        User(id="u_lim",    business_id=BEKU_MAJU, name="Lim",    role=Role.OWNER,      phone="demo-0101"),
    ])

    session.add_all([
        Vendor(id="v_cooltech", business_id=SERI_PAGI, name="CoolTech Refrigeration",
               services=["freezer", "chiller"], callout_fee_sen=18000, sla_hours=4, phone="demo-0201"),
        Vendor(id="v_sejukjaya", business_id=SERI_PAGI, name="Sejuk Jaya Services",
               services=["freezer", "chiller"], callout_fee_sen=12000, sla_hours=8, phone="demo-0202"),
        Vendor(id="v_brandcare", business_id=SERI_PAGI, name="BrandCare Warranty Centre",
               services=["freezer"], callout_fee_sen=0, sla_hours=24, phone="demo-0203"),
    ])
    session.flush()

    session.add_all([
        _asset("a_fz1", SERI_PAGI, "Freezer 1", "freezer", 400,
               ["freezer 1", "peti beku 1", "fz1"],
               warranty_until=date(2027, 6, 30), warranty_vendor_id="v_brandcare"),
        _asset("a_fz2", SERI_PAGI, "Freezer 2", "freezer", 300,
               ["freezer 2", "peti beku 2", "fz2"],
               warranty_until=date(2026, 3, 1)),        # expired → paid call-out
        _asset("a_ch1", SERI_PAGI, "Display Chiller", "chiller", 250,
               ["display chiller", "chiller depan"]),
        _asset("a_ch2", SERI_PAGI, "Kitchen Chiller", "chiller", 300,
               ["kitchen chiller", "chiller dapur"]),
        _asset("a_bm_fz1", BEKU_MAJU, "Freezer A", "freezer", 500, ["freezer a"]),
        _asset("a_bm_fz2", BEKU_MAJU, "Freezer B", "freezer", 500, ["freezer b"]),
    ])
    session.flush()

    business_of = {a.id: a.business_id for a in session.exec(select(Asset))}
    session.add_all([
        StockItem(id=f"s_{asset_id.removeprefix('a_')}_{key}", business_id=business_of[asset_id],
                  asset_id=asset_id, name=name, qty=qty, unit=unit,
                  unit_cost_sen=cost, volume_l=vol)
        for asset_id, key, name, qty, unit, cost, vol in _STOCK
    ])
    session.commit()


def is_empty(session: Session) -> bool:
    return session.exec(select(Business)).first() is None
