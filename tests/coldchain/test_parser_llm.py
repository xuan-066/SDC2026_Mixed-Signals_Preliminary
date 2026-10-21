"""T13 [C]: LLM parser with a fake client (no network, no API key, no cost)."""
from types import SimpleNamespace

import anthropic
import httpx2
import pytest
from pydantic import ValidationError
from sqlmodel import select

from app.coldchain.parser import ParsedReport, parse_report, parse_with_llm
from app.config import Settings
from app.enums import Symptom
from app.models import AuditEvent
from tests.coldchain.test_parser_rules import ASSETS

_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


class FakeClient:
    """Stands in for anthropic.Anthropic(): records calls, returns or raises what it's given."""

    def __init__(self, result=None, error=None, stop_reason="end_turn"):
        self.calls = []
        self.messages = SimpleNamespace(parse=self._parse)
        self._result, self._error, self._stop_reason = result, error, stop_reason

    def _parse(self, **kwargs):
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        return SimpleNamespace(stop_reason=self._stop_reason, parsed_output=self._result)


def _validation_error() -> ValidationError:
    try:
        ParsedReport(asset_name="Freezer 2", symptom="melted", confidence=2)
    except ValidationError as exc:
        return exc


def test_llm_result_used_when_valid():
    # A message the rules can't read: no alias, no keyword.
    llm = ParsedReport(asset_name="Freezer 2", symptom=Symptom.NOT_COOLING, confidence=0.85)
    client = FakeClient(result=llm)
    parsed, source, reason = parse_report("the big freezer at the back stopped working",
                                          ASSETS, client, "claude-opus-5-5")
    assert (parsed, source, reason) == (llm, "llm", None)
    call = client.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["output_format"] is ParsedReport
    assert call["output_config"] == {"effort": "low"}
    assert "Freezer 2" in call["system"] and "Kitchen Chiller" in call["system"]


@pytest.mark.parametrize("error", [
    anthropic.APIConnectionError(request=_REQUEST),
    anthropic.RateLimitError("slow down", response=httpx2.Response(429, request=_REQUEST), body=None),
    anthropic.InternalServerError("oops", response=httpx2.Response(500, request=_REQUEST), body=None),
    anthropic.AuthenticationError("no key", response=httpx2.Response(401, request=_REQUEST), body=None),
    _validation_error(),
])
def test_llm_error_falls_back_to_rules(error):
    parsed, source, reason = parse_report("Freezer 2 tak sejuk", ASSETS, FakeClient(error=error),
                                          "claude-opus-5-5")
    assert source == "rules_fallback" and reason == type(error).__name__
    assert (parsed.asset_name, parsed.symptom) == ("Freezer 2", Symptom.NOT_COOLING)


def test_llm_refusal_falls_back_to_rules():
    client = FakeClient(result=None, stop_reason="refusal")
    parsed, source, reason = parse_report("fz2 mati", ASSETS, client, "claude-opus-5-5")
    assert (source, reason) == ("rules_fallback", "LLMRefused")
    assert parsed.symptom == Symptom.POWER_OFF


def test_llm_invented_asset_is_dropped():
    client = FakeClient(result=ParsedReport(asset_name="Walk-in Freezer 9",
                                            symptom=Symptom.NOT_COOLING, confidence=0.9))
    assert parse_with_llm("walk-in freezer warm", ASSETS, client, "m").asset_name is None


def test_llm_asset_name_case_is_normalised():
    client = FakeClient(result=ParsedReport(asset_name="freezer 2", symptom=Symptom.NOISE,
                                            confidence=0.7))
    assert parse_with_llm("fz2 bunyi", ASSETS, client, "m").asset_name == "Freezer 2"


def test_pii_redacted_before_llm():
    client = FakeClient(result=ParsedReport(asset_name=None, symptom=Symptom.OTHER, confidence=0.2))
    parse_with_llm("fz2 rosak, call Ali 012-345 6789 or ali@kedai.my", ASSETS, client, "m")
    sent = client.calls[0]["messages"][0]["content"]
    assert sent == "fz2 rosak, call Ali [phone] or [email]"


def test_no_client_means_rules_only():
    parsed, source, reason = parse_report("Freezer 2 tak sejuk", ASSETS)
    assert (source, reason) == ("rules", None) and parsed.confidence == 0.9


def test_report_endpoint_uses_llm_and_logs_fallback():
    """Through the API with LLM_ENABLED=true and a fake client that fails: rules take over,
    PARSE_FALLBACK_USED is logged, and the journey still starts."""
    from fastapi.testclient import TestClient
    from sqlmodel import Session

    from app.main import create_app

    app = create_app(Settings(database_url="sqlite://", demo_mode=True, llm_enabled=True))
    app.state.llm_client = FakeClient(error=anthropic.APIConnectionError(request=_REQUEST))
    with TestClient(app) as c:
        r = c.post("/v1/reports", headers={"X-User-Id": "u_aina"},
                   json={"text": "Freezer 2 tak sejuk, ais dah cair"})
        assert r.status_code == 200, r.text
        assert r.json()["parser_source"] == "rules_fallback"
        assert r.json()["incident"]["status"] == "PENDING_APPROVAL"
        with Session(app.state.engine) as s:
            event = s.exec(select(AuditEvent).where(AuditEvent.action == "PARSE_FALLBACK_USED")).one()
            assert event.details == {"reason": "APIConnectionError"}

    app = create_app(Settings(database_url="sqlite://", demo_mode=True, llm_enabled=True))
    app.state.llm_client = FakeClient(result=ParsedReport(
        asset_name="Freezer 2", symptom=Symptom.POWER_OFF, confidence=0.8))
    with TestClient(app) as c:
        body = c.post("/v1/reports", headers={"X-User-Id": "u_aina"},
                      json={"text": "the back freezer is dead"}).json()
        assert body["parser_source"] == "llm"
        assert body["incident"]["severity"] == "CRITICAL"
