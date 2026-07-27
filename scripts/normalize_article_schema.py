#!/usr/bin/env python3
"""Normalize duplicate Article JSON-LD blocks without rewriting page HTML.

The command is dry-run by default. Pass --write only after reviewing the
summary. Visible author bylines and non-Article structured data are untouched.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ARTICLE_TYPES = {"Article", "BlogPosting", "NewsArticle", "TechArticle"}
MASS_EDIT_DATE = "2026-07-08"
SCRIPT_RE = re.compile(
    r"(?P<open><script\b[^>]*\btype=[\"']application/ld\+json[\"'][^>]*>)"
    r"(?P<body>.*?)"
    r"(?P<close></script>)",
    re.IGNORECASE | re.DOTALL,
)


@dataclass
class ScriptBlock:
    match: re.Match[str]
    root: Any
    injected: bool


@dataclass
class Candidate:
    block: ScriptBlock
    payload: dict[str, Any]
    location: tuple[str, int | None]


def article_type(payload: dict[str, Any]) -> str | None:
    value = payload.get("@type")
    values = [value] if isinstance(value, str) else value
    if not isinstance(values, list):
        return None
    return next((item for item in values if item in ARTICLE_TYPES), None)


def parse_block(match: re.Match[str]) -> ScriptBlock | None:
    try:
        root = json.loads(match.group("body").strip())
    except (TypeError, ValueError):
        return None
    return ScriptBlock(
        match=match,
        root=root,
        injected="data-outilsia-author-block" in match.group("open"),
    )


def candidates_in_block(block: ScriptBlock) -> list[Candidate]:
    root = block.root
    candidates: list[Candidate] = []
    if isinstance(root, dict):
        if article_type(root) is not None:
            candidates.append(Candidate(block, root, ("root", None)))
        graph = root.get("@graph")
        if isinstance(graph, list):
            candidates.extend(
                Candidate(block, item, ("graph", index))
                for index, item in enumerate(graph)
                if isinstance(item, dict) and article_type(item) is not None
            )
    elif isinstance(root, list):
        candidates.extend(
            Candidate(block, item, ("list", index))
            for index, item in enumerate(root)
            if isinstance(item, dict) and article_type(item) is not None
        )
    return candidates


def meaningful(value: Any) -> bool:
    return value not in (None, "", [], {})


def choose_primary(candidates: list[Candidate]) -> Candidate:
    injected = next((item for item in candidates if item.block.injected), None)
    if injected is not None:
        return injected

    def score(item: Candidate) -> tuple[int, int, int]:
        payload = item.payload
        return (
            int(bool(payload.get("datePublished"))),
            int(bool(payload.get("dateModified"))),
            len(payload),
        )

    return max(candidates, key=score)


def latest_iso_date(values: list[str]) -> str | None:
    valid = [value for value in values if re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:T.*)?", value)]
    return max(valid) if valid else None


def merge_payload(candidates: list[Candidate], primary: Candidate) -> dict[str, Any]:
    merged = dict(primary.payload)
    originals = [item for item in candidates if not item.block.injected]

    for item in originals:
        for key, value in item.payload.items():
            if key not in merged or not meaningful(merged[key]):
                merged[key] = value

    preferred_type = next(
        (article_type(item.payload) for item in originals if article_type(item.payload)),
        article_type(primary.payload),
    )
    if preferred_type:
        merged["@type"] = preferred_type

    published = next(
        (
            str(item.payload["datePublished"])
            for item in originals
            if meaningful(item.payload.get("datePublished"))
        ),
        None,
    )
    if published:
        merged["datePublished"] = published

    original_modified = latest_iso_date(
        [
            str(item.payload["dateModified"])
            for item in originals
            if meaningful(item.payload.get("dateModified"))
        ]
    )
    if original_modified:
        merged["dateModified"] = original_modified
    elif merged.get("dateModified") == MASS_EDIT_DATE:
        merged.pop("dateModified", None)

    return merged


def rewrite_block(
    block: ScriptBlock,
    *,
    block_candidates: list[Candidate],
    primary: Candidate,
    merged: dict[str, Any],
) -> str | None:
    root = block.root
    primary_here = primary.block is block

    if isinstance(root, dict) and article_type(root) is not None:
        if primary_here and primary.location == ("root", None):
            root = merged
        else:
            return None
    elif isinstance(root, dict) and isinstance(root.get("@graph"), list):
        graph: list[Any] = []
        for index, item in enumerate(root["@graph"]):
            candidate = next(
                (
                    entry
                    for entry in block_candidates
                    if entry.location == ("graph", index)
                ),
                None,
            )
            if candidate is None:
                graph.append(item)
            elif candidate is primary:
                graph.append(merged)
        root = dict(root)
        root["@graph"] = graph
    elif isinstance(root, list):
        values: list[Any] = []
        for index, item in enumerate(root):
            candidate = next(
                (
                    entry
                    for entry in block_candidates
                    if entry.location == ("list", index)
                ),
                None,
            )
            if candidate is None:
                values.append(item)
            elif candidate is primary:
                values.append(merged)
        root = values

    body = json.dumps(root, ensure_ascii=False, separators=(",", ":")).replace(
        "</",
        "<\\/",
    )
    return f"{block.match.group('open')}{body}{block.match.group('close')}"


def normalize_html(
    html: str,
    *,
    date_override: dict[str, str] | None = None,
) -> tuple[str, dict[str, Any]]:
    blocks = [
        block
        for match in SCRIPT_RE.finditer(html)
        if (block := parse_block(match)) is not None
    ]
    candidates = [
        candidate
        for block in blocks
        for candidate in candidates_in_block(block)
    ]
    duplicate_count = max(0, len(candidates) - 1)
    unproven_mass_date = (
        any(
            item.block.injected
            and item.payload.get("dateModified") == MASS_EDIT_DATE
            for item in candidates
        )
        and not any(
            not item.block.injected
            and item.payload.get("dateModified") == MASS_EDIT_DATE
            for item in candidates
        )
    )
    if duplicate_count == 0 and not unproven_mass_date and not date_override:
        return html, {
            "changed": False,
            "article_blocks_before": len(candidates),
            "removed_blocks": 0,
            "removed_mass_date": False,
            "date_override_applied": False,
        }

    if not candidates:
        return html, {
            "changed": False,
            "article_blocks_before": 0,
            "removed_blocks": 0,
            "removed_mass_date": False,
            "date_override_applied": False,
            "warning": "date override ignored because no Article entity was found",
        }

    primary = choose_primary(candidates)
    merged = merge_payload(candidates, primary)
    override_applied = False
    if date_override:
        for key in ("datePublished", "dateModified"):
            value = date_override.get(key)
            if value and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                if merged.get(key) != value:
                    merged[key] = value
                    override_applied = True

    output: list[str] = []
    cursor = 0
    candidate_blocks = {id(candidate.block): candidate.block for candidate in candidates}
    for block in blocks:
        if id(block) not in candidate_blocks:
            continue
        output.append(html[cursor : block.match.start()])
        replacement = rewrite_block(
            block,
            block_candidates=[
                candidate for candidate in candidates if candidate.block is block
            ],
            primary=primary,
            merged=merged,
        )
        if replacement is not None:
            output.append(replacement)
        cursor = block.match.end()
    output.append(html[cursor:])
    normalized = "".join(output)

    return normalized, {
        "changed": normalized != html,
        "article_blocks_before": len(candidates),
        "removed_blocks": duplicate_count,
        "removed_mass_date": (
            any(item.payload.get("dateModified") == MASS_EDIT_DATE for item in candidates)
            and merged.get("dateModified") != MASS_EDIT_DATE
        ),
        "date_override_applied": override_applied,
        "date_published": merged.get("datePublished"),
        "date_modified": merged.get("dateModified"),
        "type": merged.get("@type"),
    }


def iter_pages(pages_dir: Path) -> list[Path]:
    return sorted(
        path
        for path in pages_dir.glob("*.html")
        if ".bak" not in path.name
    )


def load_date_overrides(path: Path | None) -> dict[str, dict[str, str]]:
    if path is None:
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("date overrides must be a JSON object keyed by filename")

    overrides: dict[str, dict[str, str]] = {}
    for filename, entry in raw.items():
        if not isinstance(filename, str) or not isinstance(entry, dict):
            raise ValueError("invalid date override entry")
        dates: dict[str, str] = {}
        for key in ("datePublished", "dateModified"):
            value = entry.get(key)
            if value is None:
                continue
            if not isinstance(value, str) or not re.fullmatch(
                r"\d{4}-\d{2}-\d{2}",
                value,
            ):
                raise ValueError(f"invalid {key} for {filename}: {value!r}")
            dates[key] = value
        if not dates:
            raise ValueError(f"date override has no dates: {filename}")
        overrides[filename] = dates
    return overrides


def run(
    pages_dir: Path,
    *,
    write: bool,
    date_overrides: dict[str, dict[str, str]] | None = None,
) -> dict[str, Any]:
    date_overrides = date_overrides or {}
    rows: list[dict[str, Any]] = []
    for path in iter_pages(pages_dir):
        before = path.read_text(encoding="utf-8", errors="replace")
        after, result = normalize_html(
            before,
            date_override=date_overrides.get(path.name),
        )
        if result["changed"] and write:
            path.write_text(after, encoding="utf-8")
        if result["changed"]:
            rows.append({"file": path.name, **result})

    return {
        "mode": "write" if write else "dry-run",
        "pages_dir": str(pages_dir),
        "pages_checked": len(iter_pages(pages_dir)),
        "pages_changed": len(rows),
        "article_blocks_removed": sum(row["removed_blocks"] for row in rows),
        "mass_dates_removed": sum(bool(row["removed_mass_date"]) for row in rows),
        "date_overrides_applied": sum(
            bool(row["date_override_applied"]) for row in rows
        ),
        "files": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pages_dir", type=Path)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--date-overrides", type=Path)
    args = parser.parse_args()

    if not args.pages_dir.is_dir():
        parser.error(f"pages directory not found: {args.pages_dir}")

    report = run(
        args.pages_dir,
        write=args.write,
        date_overrides=load_date_overrides(args.date_overrides),
    )
    text = json.dumps(report, ensure_ascii=False, indent=2)
    print(text)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
