"""Staff fault messages → which unit + what's wrong (plan §12, T12/T13).

Rules first; the LLM (T13) is optional and always falls back to the rules. The parser only
reads the message: severity, vendor, approver and money stay with the rules in rules.py.
"""
import re
from dataclasses import dataclass

from pydantic import BaseModel, Field, ValidationError

from app.enums import Symptom

SYMPTOM_KEYWORDS = [   # checked in this order; first hit wins
    ("power_off",   ["mati", "no power", "tak hidup", "x hidup", "trip", "off"]),
    ("not_cooling", ["tak sejuk", "x sejuk", "tidak sejuk", "not cold", "not cooling",
                     "ais cair", "cair", "melting", "warm", "panas"]),
    ("too_cold",    ["terlalu sejuk", "beku", "frozen"]),
    ("leaking",     ["bocor", "leak", "menitis", "air"]),
    ("door_issue",  ["pintu", "door", "tak tutup", "seal", "getah"]),
    ("noise",       ["bising", "bunyi", "noise", "noisy"]),
]


class ParsedReport(BaseModel):
    asset_name: str | None = Field(description="Exact name of the unit from the allowed list, "
                                               "or null if the message doesn't say which unit")
    symptom: Symptom
    confidence: float = Field(ge=0.0, le=1.0)


@dataclass
class AssetRef:
    name: str
    aliases: list[str]


# Malaysian numbers: 012-345 6789, +6012-3456789, 03-1234 5678 …
_PHONE = re.compile(r"(?<!\d)(?:\+?60|0)\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}(?!\d)")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


def redact_pii(text: str) -> str:
    return _EMAIL.sub("[email]", _PHONE.sub("[phone]", text))


def parse_with_rules(text: str, assets: list[AssetRef]) -> ParsedReport:
    lowered = text.lower()

    asset_name, matched_alias = None, None
    for asset in assets:
        for alias in [asset.name, *asset.aliases]:
            if alias.lower() in lowered:
                asset_name, matched_alias = asset.name, alias.lower()
                break
        if asset_name:
            break

    # Remove the unit's name first, so "peti beku 1" doesn't read as "beku" (too cold).
    rest = lowered.replace(matched_alias, " ") if matched_alias else lowered
    symptom = Symptom.OTHER
    for name, keywords in SYMPTOM_KEYWORDS:
        if any(k in rest for k in keywords):
            symptom = Symptom(name)
            break

    found = (asset_name is not None) + (symptom != Symptom.OTHER)
    return ParsedReport(asset_name=asset_name, symptom=symptom,
                        confidence={2: 0.9, 1: 0.5, 0: 0.2}[found])


# ---------- T13 [C]: optional LLM parser ----------

class LLMRefused(Exception):
    pass


def _system_prompt(assets: list[AssetRef]) -> str:
    units = "\n".join(f"- {a.name} (also called: {', '.join(a.aliases)})" for a in assets)
    symptoms = ", ".join(s.value for s in Symptom)
    return (
        "You read short fault messages from staff at a small Malaysian food business. "
        "Messages mix English and Malay and are often informal.\n\n"
        f"Units in this business:\n{units}\n\n"
        "Return asset_name as one of the exact unit names above, or null if the message "
        "doesn't make clear which unit it is. Never guess a unit that isn't in the list.\n"
        f"Return symptom as one of: {symptoms}. Use other if none fits.\n"
        "Return confidence between 0 and 1: how sure you are about both fields together."
    )


def parse_with_llm(text: str, assets: list[AssetRef], client, model: str) -> ParsedReport:
    """client is an anthropic.Anthropic (or a fake in tests). Raises on refusal or API errors;
    parse_report() turns those into the rules fallback."""
    response = client.messages.parse(
        model=model,
        max_tokens=2048,
        output_config={"effort": "low"},       # simple extraction → low effort
        system=_system_prompt(assets),
        messages=[{"role": "user", "content": redact_pii(text)}],
        output_format=ParsedReport,
    )
    if response.stop_reason == "refusal":
        raise LLMRefused("model declined the message")
    parsed = response.parsed_output
    if parsed is None:
        raise LLMRefused("no structured output returned")

    # Only units that really exist: an invented or misspelled name becomes "unknown unit".
    allowed = {a.name.lower(): a.name for a in assets}
    canonical = allowed.get((parsed.asset_name or "").strip().lower())
    return parsed.model_copy(update={"asset_name": canonical})


def parse_report(text: str, assets: list[AssetRef], client=None,
                 model: str | None = None) -> tuple[ParsedReport, str, str | None]:
    """Returns (parsed, source, fallback_reason). source is "rules", "llm" or "rules_fallback"."""
    if client is None:
        return parse_with_rules(text, assets), "rules", None
    import anthropic   # only needed when the LLM is enabled
    try:
        return parse_with_llm(text, assets, client, model), "llm", None
    except (LLMRefused, anthropic.APIConnectionError, anthropic.RateLimitError,
            anthropic.APIStatusError, ValidationError) as exc:
        return parse_with_rules(text, assets), "rules_fallback", type(exc).__name__
