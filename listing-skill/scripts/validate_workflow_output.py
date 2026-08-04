#!/usr/bin/env python3
"""Validate stable workflow invariants and the additional description."""

from __future__ import annotations
import argparse, json, re, sys
from pathlib import Path

REQUIRED = {
    1: ["product_insights", "initial_keyword_library", "excluded_keywords"],
    2: ["recommended_keywords", "selection_logic_summary"],
    3: ["overall_summary", "pain_points", "delight_points", "needs_synthesis"],
    4: ["confirmation_questions", "confirmed_selling_points", "pending_items"],
    5: ["competitor_overview", "bullet_breakdown", "style_patterns", "borrowable_style", "not_to_copy", "opportunity_points", "competitor_bettering_suggestions"],
    7: ["product_name", "long_tail_keyword", "material", "target_audience", "use_scenario", "core_function", "size_spec", "primary_selling_points", "secondary_selling_points", "missing_information", "conflicting_information", "notes_for_next_agent"],
    8: ["bullet_strategy", "final_bullets", "seo_usage_report", "competitor_benchmark", "final_quality_check"],
    9: ["description_strategy", "product_description", "seo_usage_report", "quality_check"],
}


def load_json(path: Path) -> object:
    text = path.read_text(encoding="utf-8-sig").strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    return json.loads(fenced.group(1) if fenced else text)


def ensure(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def validate_node_1(data: dict, bundle: dict, errors: list[str]) -> None:
    initial, excluded = data.get("initial_keyword_library", []), data.get("excluded_keywords", [])
    source_count = bundle.get("keywords", {}).get("count")
    ensure(isinstance(initial, list) and isinstance(excluded, list), "node 1 keyword collections must be arrays", errors)
    if isinstance(source_count, int) and isinstance(initial, list) and isinstance(excluded, list):
        ensure(len(initial) + len(excluded) == source_count,
               f"node 1 accounts for {len(initial) + len(excluded)} rows; source has {source_count}", errors)
    source_fields = set(bundle.get("keywords", {}).get("fields", []))
    for index, item in enumerate(initial):
        fields = item.get("original_fields") if isinstance(item, dict) else None
        ensure(isinstance(fields, dict), f"node 1 item {index + 1} lacks original_fields", errors)
        if isinstance(fields, dict):
            ensure(set(fields) == source_fields, f"node 1 item {index + 1} does not preserve exact source headers", errors)


def validate_node_2(data: dict, bundle: dict, errors: list[str]) -> None:
    groups = data.get("recommended_keywords", {})
    source_words = {str(row.get("关键词", "")).strip() for row in bundle.get("keywords", {}).get("records", [])}
    for category in ("核心词", "转化词", "流量词"):
        items = groups.get(category, []) if isinstance(groups, dict) else []
        ensure(isinstance(items, list), f"node 2 {category} must be an array", errors)
        if isinstance(items, list):
            ensure(len(items) <= 5, f"node 2 {category} contains more than 5 items", errors)
            for item in items:
                keyword = str(item.get("keyword", "")).strip() if isinstance(item, dict) else ""
                ensure(keyword in source_words, f"node 2 introduced keyword not found in source: {keyword}", errors)


def validate_node_3(data: dict, errors: list[str]) -> None:
    for item in data.get("pain_points", []):
        ensure(item.get("severity") in {"P0", "P1", "P2"}, f"invalid pain severity: {item.get('severity')}", errors)


def validate_node_6(path: Path, errors: list[str]) -> None:
    text = path.read_text(encoding="utf-8-sig").strip()
    ensure(bool(text), "node 6 output is empty", errors)
    ensure("风格" in text, "node 6 output lacks required style analysis", errors)


def check_literal_keywords(data: dict, text: str, label: str, errors: list[str]) -> None:
    lowered = text.lower()
    for keyword in data.get("seo_usage_report", {}).get("used_keywords", []):
        ensure(str(keyword).lower() in lowered, f"{label} used keyword is not literally present: {keyword}", errors)


def validate_node_8(data: dict, errors: list[str]) -> None:
    strategy, bullets = data.get("bullet_strategy", []), data.get("final_bullets", [])
    ensure(isinstance(strategy, list) and len(strategy) == 5, "node 8 must contain exactly 5 strategy items", errors)
    ensure(isinstance(bullets, list) and len(bullets) == 5, "node 8 must contain exactly 5 final bullets", errors)
    if isinstance(bullets, list):
        numbers = [item.get("bullet_no") for item in bullets if isinstance(item, dict)]
        ensure(numbers == [1, 2, 3, 4, 5], "node 8 bullet numbers must be 1 through 5", errors)
        copy_text = "\n".join(str(item.get("copy", "")) for item in bullets if isinstance(item, dict))
        check_literal_keywords(data, copy_text, "node 8", errors)
    checks = data.get("final_quality_check", {})
    for key in ("primary_points_covered", "p0_points_covered", "natural_language", "no_keyword_stuffing", "stronger_than_competitors"):
        ensure(isinstance(checks.get(key), bool), f"node 8 quality check {key} must be boolean", errors)


def validate_node_9(data: dict, errors: list[str]) -> None:
    description = data.get("product_description", "")
    ensure(isinstance(description, str) and bool(description.strip()), "product description must be non-empty text", errors)
    if isinstance(description, str):
        check_literal_keywords(data, description, "product description", errors)
        word_count = len(re.findall(r"\b[\w'-]+\b", description))
        ensure(word_count >= 100, "product description is too short to be a long-form deliverable", errors)
    checks = data.get("quality_check", {})
    for key in ("supported_facts_only", "natural_keyword_usage", "clear_entity_relationships", "no_keyword_stuffing", "package_boundary_clear", "consistent_with_final_bullets"):
        ensure(checks.get(key) is True, f"product description quality check {key} must be true", errors)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--node", type=int, choices=range(1, 10), required=True)
    parser.add_argument("--file", required=True)
    parser.add_argument("--bundle", required=True)
    args = parser.parse_args()
    output_path = Path(args.file).expanduser().resolve()
    bundle = load_json(Path(args.bundle).expanduser().resolve())
    errors: list[str] = []
    if args.node == 6:
        validate_node_6(output_path, errors)
    else:
        data = load_json(output_path)
        ensure(isinstance(data, dict), f"node {args.node} output must be a JSON object", errors)
        if isinstance(data, dict):
            for key in REQUIRED.get(args.node, []):
                ensure(key in data, f"node {args.node} missing key: {key}", errors)
            if args.node == 1: validate_node_1(data, bundle, errors)
            elif args.node == 2: validate_node_2(data, bundle, errors)
            elif args.node == 3: validate_node_3(data, errors)
            elif args.node == 8: validate_node_8(data, errors)
            elif args.node == 9: validate_node_9(data, errors)
    if errors:
        for error in errors: print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"OK: node {args.node} output passed validation")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
