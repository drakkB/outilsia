#!/usr/bin/env python3
"""Audit Article JSON-LD cardinality and dates across static HTML pages."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Iterator


ARTICLE_TYPES = {"Article", "BlogPosting", "NewsArticle", "TechArticle"}
SCRIPT_RE = re.compile(
    r"<script\b[^>]*\btype=[\"']application/ld\+json[\"'][^>]*>"
    r"(.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)


def walk(value: Any) -> Iterator[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def schema_types(node: dict[str, Any]) -> set[str]:
    value = node.get("@type")
    if isinstance(value, str):
        return {value}
    if isinstance(value, list):
        return {item for item in value if isinstance(item, str)}
    return set()


def audit(pages_dir: Path, *, forbidden_modified_date: str | None) -> dict[str, Any]:
    pages = sorted(
        path
        for path in pages_dir.glob("*.html")
        if ".bak" not in path.name
    )
    json_errors: list[dict[str, str]] = []
    multiple_articles: list[dict[str, Any]] = []
    missing_dates: list[str] = []
    forbidden_dates: list[str] = []
    article_pages = 0
    dataset_nodes = 0
    faq_nodes = 0

    for path in pages:
        roots: list[Any] = []
        html = path.read_text(encoding="utf-8", errors="replace")
        for raw in SCRIPT_RE.findall(html):
            try:
                roots.append(json.loads(raw.strip()))
            except (TypeError, ValueError) as exc:
                json_errors.append({"file": path.name, "error": str(exc)})

        nodes = [node for root in roots for node in walk(root)]
        articles = [
            node
            for node in nodes
            if ARTICLE_TYPES.intersection(schema_types(node))
        ]
        dataset_nodes += sum("Dataset" in schema_types(node) for node in nodes)
        faq_nodes += sum("FAQPage" in schema_types(node) for node in nodes)

        if articles:
            article_pages += 1
        if len(articles) > 1:
            multiple_articles.append(
                {"file": path.name, "article_entities": len(articles)}
            )
        if articles and not articles[0].get("datePublished"):
            missing_dates.append(path.name)
        if (
            articles
            and forbidden_modified_date
            and articles[0].get("dateModified") == forbidden_modified_date
        ):
            forbidden_dates.append(path.name)

    ok = not (
        json_errors
        or multiple_articles
        or missing_dates
        or forbidden_dates
    )
    return {
        "ok": ok,
        "pages_checked": len(pages),
        "article_pages": article_pages,
        "json_errors": json_errors,
        "multiple_articles": multiple_articles,
        "missing_date_published": missing_dates,
        "forbidden_modified_date": forbidden_modified_date,
        "pages_with_forbidden_modified_date": forbidden_dates,
        "dataset_nodes": dataset_nodes,
        "faq_nodes": faq_nodes,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pages_dir", type=Path)
    parser.add_argument("--forbid-modified-date")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    if not args.pages_dir.is_dir():
        parser.error(f"pages directory not found: {args.pages_dir}")

    report = audit(
        args.pages_dir,
        forbidden_modified_date=args.forbid_modified_date,
    )
    output = json.dumps(report, ensure_ascii=False, indent=2)
    print(output)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output + "\n", encoding="utf-8")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
