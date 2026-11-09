"""CI gate for the screening triage rules engine (see evals/README.md).

Policy: the rules engine is the fallback whenever Claude is unavailable, so it must flag every red-flag
emergency in ``evals/screening_cases.jsonl`` (recall 100%) and always return schema-valid TriageResults.

Run from ``backend/``::

    .venv/Scripts/python -m pytest -q evals/test_rules_engine_gate.py

No database and no network: the rules engine is pure Python and the Claude engine is never called here.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from evals import run_screening_eval as harness

MIN_CASES = 80
MIN_EMERGENCIES = 15
REQUIRED_CATEGORIES = {
    "specialty",
    "emergency",
    "ambiguous",
    "pediatric",
    "pregnancy",
    "cosmetic",
    "wellness",
}
REQUIRED_TAGS = {"pediatric", "pregnancy", "multilingual", "prompt_injection", "edge_input"}
REQUIRED_LANGUAGES = {"lang:ar", "lang:fr", "lang:ru", "lang:sw", "lang:bn"}


@pytest.fixture(scope="module")
def cases() -> list[dict[str, Any]]:
    return harness.load_cases()


@pytest.fixture(scope="module")
def rules_report(cases: list[dict[str, Any]]) -> dict[str, Any]:
    try:
        catalog, catalog_info = harness.load_catalog()
        engine = harness.build_rules_engine(catalog)
    except harness.EngineUnavailable as exc:
        pytest.skip(
            f"rules engine not importable yet ({exc}); this gate runs once "
            "app/modules/screening/ai/rules.py and schema.py are importable"
        )
    return asyncio.run(harness.run_eval(engine, cases, catalog_info=catalog_info))


def test_case_file_is_valid_and_broad(cases: list[dict[str, Any]]) -> None:
    counts = harness.case_counts(cases)
    problems: list[str] = []
    if counts["total"] < MIN_CASES:
        problems.append(f"only {counts['total']} cases (need at least {MIN_CASES})")
    if counts["must_flag_emergency"] < MIN_EMERGENCIES:
        problems.append(
            f"only {counts['must_flag_emergency']} must-flag emergencies (need {MIN_EMERGENCIES})"
        )
    if counts["specialties_missing"]:
        problems.append(f"specialties without any case: {counts['specialties_missing']}")
    missing_categories = REQUIRED_CATEGORIES - set(counts["by_category"])
    if missing_categories:
        problems.append(f"missing categories: {sorted(missing_categories)}")
    missing_tags = (REQUIRED_TAGS | REQUIRED_LANGUAGES) - set(counts["by_tag"])
    if missing_tags:
        problems.append(f"missing tags: {sorted(missing_tags)}")
    tops = {c["expectations"]["expected_top_specialty"] for c in cases}
    if set(harness.SPECIALTY_SLUGS) - tops:
        problems.append(f"specialties never expected as top-1: {sorted(set(harness.SPECIALTY_SLUGS) - tops)}")
    if problems:
        pytest.fail("\n".join(problems), pytrace=False)


def test_rules_engine_emergency_recall_is_100_percent(rules_report: dict[str, Any]) -> None:
    emergency = rules_report["metrics"]["emergency"]
    if emergency["recall"] is None or emergency["recall"] >= harness.GATE_EMERGENCY_RECALL:
        return
    rows = {r["id"]: r for r in rules_report["results"]}
    lines = [
        f"Rules-engine emergency recall is {emergency['recall']:.1%} "
        f"({emergency['true_positives']}/{emergency['positives']}); policy requires 100%. Missed cases:"
    ]
    for case_id in emergency["misses"]:
        row = rows[case_id]
        lines.append(
            f"  - {case_id} [{row['red_flag_category']}] urgency={row['urgency']}: "
            + " | ".join(row["red_flag_terms"])
        )
    lines.append("Hints for app/modules/screening/ai/rules.py:")
    lines.extend(f"  - {hint}" for hint in rules_report["owner_hints"])
    pytest.fail("\n".join(lines), pytrace=False)


def test_rules_engine_output_is_schema_valid(rules_report: dict[str, Any]) -> None:
    schema = rules_report["metrics"]["schema"]
    if schema["valid_rate"] is not None and schema["valid_rate"] >= harness.GATE_SCHEMA_VALID:
        return
    rows = {r["id"]: r for r in rules_report["results"]}
    details = [f"  - {i}: {'; '.join(rows[i]['schema_errors'][:3])}" for i in schema["invalid"]]
    pytest.fail(
        f"schema-valid rate {schema['valid_rate']} < {harness.GATE_SCHEMA_VALID}:\n" + "\n".join(details),
        pytrace=False,
    )


def test_claude_engine_refuses_without_key_and_confirmation(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """The paid path needs both a configured key and --yes; the engine must not even be built otherwise."""
    pytest.importorskip(harness.SCHEMA_MODULE)

    def must_not_build(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("the Claude engine was built without a key and --yes")

    monkeypatch.setattr(harness, "build_claude_engine", must_not_build)

    monkeypatch.setattr(harness, "anthropic_key_configured", lambda: True)
    if harness.main(["--engine", "claude", "--limit", "2"]) != 2:
        pytest.fail("claude engine without --yes must exit with code 2")
    captured = capsys.readouterr()
    if "Estimated cost" not in captured.out or "--yes" not in captured.err:
        pytest.fail(f"expected a cost estimate and a --yes hint, got: {captured.out!r} / {captured.err!r}")

    monkeypatch.setattr(harness, "anthropic_key_configured", lambda: False)
    if harness.main(["--engine", "claude", "--limit", "2", "--yes"]) != 2:
        pytest.fail("claude engine without ANTHROPIC_API_KEY must exit with code 2")
    if "ANTHROPIC_API_KEY is not set" not in capsys.readouterr().err:
        pytest.fail("expected the missing-key message")
