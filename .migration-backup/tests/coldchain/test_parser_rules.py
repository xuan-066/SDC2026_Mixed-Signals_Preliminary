import pytest

from app.coldchain.parser import AssetRef, parse_with_rules, redact_pii
from app.coldchain.rules import severity_from_symptom
from app.enums import Severity, Symptom

# The Seri Pagi units, as the report flow passes them (sorted by name).
ASSETS = [
    AssetRef("Display Chiller", ["display chiller", "chiller depan"]),
    AssetRef("Freezer 1", ["freezer 1", "peti beku 1", "fz1"]),
    AssetRef("Freezer 2", ["freezer 2", "peti beku 2", "fz2"]),
    AssetRef("Kitchen Chiller", ["kitchen chiller", "chiller dapur"]),
]


@pytest.mark.parametrize("text,asset_name,symptom", [
    ("Freezer 2 tak sejuk, ais dah cair sikit", "Freezer 2", "not_cooling"),
    ("boss, fz2 not cold already since morning", "Freezer 2", "not_cooling"),
    ("peti beku 1 pintu tak tutup rapat", "Freezer 1", "door_issue"),
    ("Kitchen chiller bocor air kat bawah", "Kitchen Chiller", "leaking"),
    ("display chiller bunyi bising sangat", "Display Chiller", "noise"),
    ("chiller dapur terlalu sejuk, sayur beku", "Kitchen Chiller", "too_cold"),
    ("Fridge mati, semua lampu off", None, "power_off"),
    ("hello", None, "other"),
])
def test_rules_parser_table(text, asset_name, symptom):
    parsed = parse_with_rules(text, ASSETS)
    assert (parsed.asset_name, parsed.symptom.value) == (asset_name, symptom)


@pytest.mark.parametrize("text,confidence", [
    ("Freezer 2 tak sejuk", 0.9),       # unit and symptom
    ("Freezer 2 ada masalah", 0.5),     # unit only
    ("Fridge mati", 0.5),               # symptom only
    ("hello", 0.2),                     # neither
])
def test_confidence_levels(text, confidence):
    assert parse_with_rules(text, ASSETS).confidence == confidence


def test_alias_removed_before_symptom_match():
    # "peti beku 1" contains "beku" (too_cold); after removing the alias it's a door issue.
    assert parse_with_rules("peti beku 1 pintu rosak", ASSETS).symptom == Symptom.DOOR_ISSUE


def test_redact_pii():
    assert redact_pii("call me 012-345 6789 or a@b.com") == "call me [phone] or [email]"


@pytest.mark.parametrize("text", ["+6012-3456789", "0123456789", "011-1234 5678", "03-1234 5678"])
def test_redact_malaysian_phone_formats(text):
    assert redact_pii(f"tel {text} ok") == "tel [phone] ok"


def test_redact_leaves_temperatures_and_units_alone():
    assert redact_pii("Freezer 2 at -11.0, fz2") == "Freezer 2 at -11.0, fz2"


@pytest.mark.parametrize("symptom,severity", [
    (Symptom.NOT_COOLING, Severity.CRITICAL), (Symptom.POWER_OFF, Severity.CRITICAL),
    (Symptom.LEAKING, Severity.WARNING), (Symptom.DOOR_ISSUE, Severity.WARNING),
    (Symptom.TOO_COLD, Severity.WARNING), (Symptom.NOISE, Severity.WARNING),
    (Symptom.OTHER, Severity.WARNING),
])
def test_severity_from_symptom(symptom, severity):
    assert severity_from_symptom(symptom) == severity
