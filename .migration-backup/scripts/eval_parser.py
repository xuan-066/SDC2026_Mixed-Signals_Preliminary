"""Accuracy of the message parser: rules vs LLM (plan T13).

    python scripts/eval_parser.py tests/data/fault_messages.csv            # rules only (free)
    python scripts/eval_parser.py tests/data/fault_messages.csv --llm      # + LLM (costs money)
    python scripts/eval_parser.py tests/data/fault_messages.csv --llm --model claude-haiku-5-5

The CSV is synthetic, written by the team: treat the numbers as a first check, not as a
measurement on real staff messages.
"""
import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8")

from app.coldchain.parser import AssetRef, parse_report, parse_with_rules  # noqa: E402

ASSETS = [   # Seri Pagi's units, as in app/seed.py
    AssetRef("Display Chiller", ["display chiller", "chiller depan"]),
    AssetRef("Freezer 1", ["freezer 1", "peti beku 1", "fz1"]),
    AssetRef("Freezer 2", ["freezer 2", "peti beku 2", "fz2"]),
    AssetRef("Kitchen Chiller", ["kitchen chiller", "chiller dapur"]),
]


def score(rows, parse) -> dict:
    asset_ok = symptom_ok = both_ok = 0
    misses = []
    for row in rows:
        parsed = parse(row["text"])
        want_asset = row["asset_name"] or None
        a = parsed.asset_name == want_asset
        s = parsed.symptom.value == row["symptom"]
        asset_ok, symptom_ok, both_ok = asset_ok + a, symptom_ok + s, both_ok + (a and s)
        if not (a and s):
            misses.append((row["text"], f"{want_asset} / {row['symptom']}",
                           f"{parsed.asset_name} / {parsed.symptom.value}"))
    n = len(rows)
    return {"n": n, "asset": asset_ok / n, "symptom": symptom_ok / n, "both": both_ok / n,
            "misses": misses}


def report(name: str, result: dict) -> None:
    print(f"\n{name}  (n={result['n']})")
    print(f"  unit correct     {result['asset']:.0%}")
    print(f"  symptom correct  {result['symptom']:.0%}")
    print(f"  both correct     {result['both']:.0%}")
    for text, want, got in result["misses"]:
        print(f"    ✗ {text!r}: expected {want}, got {got}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--llm", action="store_true", help="also run the LLM parser (uses the API)")
    ap.add_argument("--model", default="claude-opus-5-5")
    args = ap.parse_args()

    with open(args.csv, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))

    report("rules", score(rows, lambda t: parse_with_rules(t, ASSETS)))

    if args.llm:
        import anthropic
        client = anthropic.Anthropic()
        fallbacks = []

        def llm(text):
            parsed, source, reason = parse_report(text, ASSETS, client, args.model)
            if source == "rules_fallback":
                fallbacks.append(reason)
            return parsed

        report(f"llm ({args.model})", score(rows, llm))
        if fallbacks:
            print(f"\n  note: {len(fallbacks)} of {len(rows)} fell back to rules "
                  f"({', '.join(sorted(set(fallbacks)))}); the LLM row includes those.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
