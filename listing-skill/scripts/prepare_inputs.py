#!/usr/bin/env python3
"""Normalize workflow inputs without third-party dependencies."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


def read_text(path: Path) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            pass
    raise ValueError(f"Cannot decode text file: {path}")


def normalize_headers(values: list[object]) -> list[str]:
    headers, seen = [], {}
    for index, value in enumerate(values, 1):
        base = str(value).strip() if value not in (None, "") else f"column_{index}"
        seen[base] = seen.get(base, 0) + 1
        headers.append(base if seen[base] == 1 else f"{base}_{seen[base]}")
    return headers


def read_csv_rows(path: Path) -> tuple[list[str], list[dict[str, object]]]:
    text = read_text(path)
    try:
        dialect = csv.Sniffer().sniff(text[:8192], delimiters=",\t;")
    except csv.Error:
        dialect = csv.excel
    raw = list(csv.reader(text.splitlines(), dialect))
    if not raw:
        return [], []
    headers = normalize_headers(raw[0])
    records = []
    for row in raw[1:]:
        values = row + [""] * max(0, len(headers) - len(row))
        records.append({header: values[i] if i < len(values) else "" for i, header in enumerate(headers)})
    return headers, records


def col_index(cell_ref: str) -> int:
    match = re.match(r"[A-Z]+", cell_ref.upper())
    value = 0
    for char in match.group(0) if match else "A":
        value = value * 26 + ord(char) - 64
    return value - 1


def scalar(value: str | None) -> object:
    if not value:
        return ""
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if re.fullmatch(r"-?(?:\d+\.\d*|\d*\.\d+)(?:[Ee][+-]?\d+)?", value):
        return float(value)
    return value


def get_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t"))
            for item in root.findall(f"{{{MAIN_NS}}}si")]


def get_cell_value(cell: ET.Element, strings: list[str]) -> object:
    cell_type = cell.attrib.get("t", "")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.iter(f"{{{MAIN_NS}}}t"))
    value_node = cell.find(f"{{{MAIN_NS}}}v")
    raw = value_node.text if value_node is not None else ""
    if cell_type == "s":
        try:
            return strings[int(raw)]
        except (ValueError, IndexError):
            return ""
    if cell_type == "b":
        return raw == "1"
    if cell_type in {"str", "e"}:
        return raw
    return scalar(raw)


def get_sheets(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {rel.attrib["Id"]: rel.attrib["Target"]
               for rel in rels.findall(f"{{{PKG_REL_NS}}}Relationship")}
    result = []
    for sheet in workbook.findall(f".//{{{MAIN_NS}}}sheet"):
        target = targets.get(sheet.attrib.get(f"{{{REL_NS}}}id", ""), "")
        if target.startswith("/"):
            target = target.lstrip("/")
        elif not target.startswith("xl/"):
            target = "xl/" + target.lstrip("/")
        result.append((sheet.attrib.get("name", ""), target))
    return result


def parse_sheet(archive: zipfile.ZipFile, target: str, strings: list[str]) -> list[list[object]]:
    root = ET.fromstring(archive.read(target))
    rows = []
    for row in root.findall(f".//{{{MAIN_NS}}}sheetData/{{{MAIN_NS}}}row"):
        values: list[object] = []
        for cell in row.findall(f"{{{MAIN_NS}}}c"):
            index = col_index(cell.attrib.get("r", "A1"))
            values.extend([""] * max(0, index + 1 - len(values)))
            values[index] = get_cell_value(cell, strings)
        rows.append(values)
    return rows


def read_xlsx_rows(path: Path, requested_sheet: str | None) -> tuple[str, list[str], list[dict[str, object]]]:
    with zipfile.ZipFile(path) as archive:
        strings = get_shared_strings(archive)
        candidates = []
        for name, target in get_sheets(archive):
            if requested_sheet and name != requested_sheet:
                continue
            rows = parse_sheet(archive, target, strings)
            width = max((len(row) for row in rows), default=0)
            candidates.append((len(rows) * max(width, 1), name, rows))
        if not candidates:
            raise ValueError(f"Worksheet not found: {requested_sheet}")
        _, sheet_name, raw_rows = max(candidates, key=lambda item: item[0])
    if not raw_rows:
        return sheet_name, [], []
    headers = normalize_headers(raw_rows[0])
    records = []
    for row in raw_rows[1:]:
        values = row + [""] * max(0, len(headers) - len(row))
        records.append({header: values[i] if i < len(values) else "" for i, header in enumerate(headers)})
    return sheet_name, headers, records


def read_table(path: Path, sheet: str | None = None) -> tuple[str | None, list[str], list[dict[str, object]]]:
    if path.suffix.lower() == ".xlsx":
        return read_xlsx_rows(path, sheet)
    if path.suffix.lower() in {".csv", ".tsv"}:
        headers, rows = read_csv_rows(path)
        return None, headers, rows
    raise ValueError(f"Unsupported table: {path}")


def source_path(value: str) -> Path:
    path = Path(value).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keywords", required=True)
    parser.add_argument("--product", required=True)
    parser.add_argument("--reviews", required=True)
    parser.add_argument("--competitors", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--keyword-sheet")
    parser.add_argument("--review-sheet")
    args = parser.parse_args()

    keyword_path = source_path(args.keywords)
    product_path = source_path(args.product)
    review_path = source_path(args.reviews)
    competitor_path = source_path(args.competitors)
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    keyword_sheet, keyword_fields, keywords = read_table(keyword_path, args.keyword_sheet)
    if review_path.suffix.lower() in {".xlsx", ".csv", ".tsv"}:
        review_sheet, review_fields, review_records = read_table(review_path, args.review_sheet)
        review_count = len(review_records)
    else:
        review_sheet, review_fields = None, []
        review_records = read_text(review_path)
        review_count = None

    bundle = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sources": {"keywords": str(keyword_path), "product": str(product_path),
                    "reviews": str(review_path), "competitors": str(competitor_path)},
        "keywords": {"sheet": keyword_sheet, "fields": keyword_fields,
                     "count": len(keywords), "records": keywords},
        "product_description": read_text(product_path),
        "reviews": {"sheet": review_sheet, "fields": review_fields,
                    "count": review_count, "records": review_records},
        "competitor_bullets": read_text(competitor_path),
    }
    destination = output_dir / "input_bundle.json"
    destination.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(destination), "keyword_sheet": keyword_sheet,
                      "keyword_count": len(keywords), "keyword_field_count": len(keyword_fields),
                      "review_count": review_count}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
