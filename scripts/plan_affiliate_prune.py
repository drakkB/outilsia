#!/usr/bin/env python3
"""Plan and apply a canonical-aware purge of unproductive merchant links."""

from __future__ import annotations

import argparse
import ast
import csv
import html
import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlsplit, urlunsplit

from bs4 import BeautifulSoup, Comment


MERCHANT_HOSTS = ("amazon.", "amzn.to")
DISCLOSURE_SELECTORS = (
    ".affiliate-micro-note",
    ".oia-amazon-disclosure",
    ".amazon-disclaimer",
    ".amazon-disclosure",
    ".disclosure-affiliate",
)
DISCLOSURE_PATTERNS = (
    re.compile(r"\ben tant que partenaire amazon\b", re.IGNORECASE),
    re.compile(r"\bas an amazon associate\b", re.IGNORECASE),
    re.compile(r"\bliens?\b.{0,80}\baffili", re.IGNORECASE),
    re.compile(r"\baffili(?:é|e|es|és|ation)\b.{0,80}\bliens?\b", re.IGNORECASE),
)


def merchant_url(value: str) -> bool:
    try:
        hostname = (urlparse(value).hostname or "").lower()
    except ValueError:
        return False
    return hostname == "amzn.to" or any(part in hostname for part in MERCHANT_HOSTS)


def normalized_target(value: str) -> str:
    """Normalize HTML escaping and query ordering without dropping attribution."""
    try:
        parts = urlsplit(html.unescape(value).strip())
    except ValueError:
        return html.unescape(value).strip()
    query = urlencode(sorted(parse_qsl(parts.query, keep_blank_values=True)))
    return urlunsplit(
        (
            parts.scheme.lower(),
            parts.netloc.lower(),
            parts.path,
            query,
            "",
        )
    )


def load_literal_dicts(route_file: Path) -> tuple[dict[str, str], dict[str, str]]:
    tree = ast.parse(route_file.read_text(encoding="utf-8"), filename=str(route_file))
    values: dict[str, dict[str, str]] = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id in {
                "CANONICAL_REDIRECTS",
                "BLOG_REDIRECTS",
            }:
                value = ast.literal_eval(node.value)
                if not isinstance(value, dict):
                    raise ValueError(f"{target.id} is not a dictionary")
                values[target.id] = {
                    str(key): str(item) for key, item in value.items()
                }
    return values.get("CANONICAL_REDIRECTS", {}), values.get("BLOG_REDIRECTS", {})


def clean_path(value: str) -> str:
    parsed = urlsplit(value.strip())
    path = parsed.path or "/"
    path = "/" + path.strip("/")
    return "/" if path == "/" else path


def canonical_path(
    value: str,
    canonical_redirects: dict[str, str],
    blog_redirects: dict[str, str],
) -> str:
    path = clean_path(value)
    visited: set[str] = set()
    while path not in visited:
        visited.add(path)
        target = canonical_redirects.get(path)
        if target:
            if target.startswith(("http://", "https://")):
                return path
            path = clean_path(target)
            continue
        if path.startswith("/blog/"):
            slug = path.removeprefix("/blog/")
            target_slug = blog_redirects.get(slug)
            if target_slug:
                path = f"/blog/{target_slug}"
                continue
        break
    return path


def route_for_file(path: Path) -> str:
    name = path.stem
    if name == "index":
        return "/"
    if name == "jeux-hub":
        return "/jeux"
    if name.startswith("blog-"):
        return f"/blog/{name.removeprefix('blog-')}"
    if name.startswith("categorie-"):
        return f"/categorie/{name.removeprefix('categorie-')}"
    if name.startswith("memoryforge-"):
        return f"/memoryforge/{name.removeprefix('memoryforge-')}"
    return f"/{name}"


def load_clicks(
    path: Path,
    canonical_redirects: dict[str, str],
    blog_redirects: dict[str, str],
) -> tuple[dict[str, int], dict[str, dict[str, int]]]:
    totals: dict[str, int] = defaultdict(int)
    targets: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        required = {"source_page", "target_url", "clicks"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(
                f"click TSV must contain {sorted(required)}; got {reader.fieldnames}"
            )
        for row in reader:
            route = canonical_path(
                row.get("source_page") or "/",
                canonical_redirects,
                blog_redirects,
            )
            count = int(row.get("clicks") or 0)
            target = normalized_target(row.get("target_url") or "")
            totals[route] += count
            targets[route][target] += count
    return dict(totals), {key: dict(value) for key, value in targets.items()}


def merchant_anchors(soup: BeautifulSoup):
    return [
        anchor
        for anchor in soup.find_all("a", href=True)
        if merchant_url(str(anchor.get("href") or ""))
    ]


def remove_orphan_disclosures(soup: BeautifulSoup) -> int:
    removed = 0
    for selector in DISCLOSURE_SELECTORS:
        for element in list(soup.select(selector)):
            element.decompose()
            removed += 1

    for node in list(soup.find_all(string=lambda item: isinstance(item, Comment))):
        if "affiliate disclosure" in str(node).lower() or "amazon disclosure" in str(
            node
        ).lower():
            node.extract()
            removed += 1

    for element in list(soup.find_all(["p", "small"])):
        text = " ".join(element.stripped_strings)
        if len(text) <= 600 and any(pattern.search(text) for pattern in DISCLOSURE_PATTERNS):
            element.decompose()
            removed += 1

    for script in list(soup.find_all("script", src=True)):
        if "affiliate-tracker" in str(script.get("src") or ""):
            script.decompose()
            removed += 1
    return removed


def consolidate_active_disclosure(soup: BeautifulSoup) -> int:
    """Replace repeated legacy notices with one disclosure before the first link."""
    removed = 0
    for selector in DISCLOSURE_SELECTORS:
        for element in list(soup.select(selector)):
            if merchant_anchors(element):
                continue
            element.decompose()
            removed += 1

    for node in list(soup.find_all(string=lambda item: isinstance(item, Comment))):
        if "affiliate disclosure" in str(node).lower() or "amazon disclosure" in str(
            node
        ).lower():
            node.extract()
            removed += 1

    for element in list(soup.find_all(["p", "small", "span"])):
        if element.find("a", href=True):
            continue
        text = " ".join(element.stripped_strings)
        if len(text) <= 600 and any(pattern.search(text) for pattern in DISCLOSURE_PATTERNS):
            element.decompose()
            removed += 1

    anchors = merchant_anchors(soup)
    if not anchors:
        raise ValueError("cannot add an active disclosure without a merchant link")
    notice = soup.new_tag("span")
    notice["class"] = ["oia-affiliate-disclosure"]
    notice["style"] = (
        "display:block;margin:8px 0;color:#64748b;font-size:.72rem;"
        "line-height:1.45;"
    )
    notice.string = (
        "En tant que Partenaire Amazon, OutilsIA peut réaliser un bénéfice sur "
        "les achats éligibles, sans surcoût. Vérifiez le prix, le vendeur et "
        "la compatibilité avant achat."
    )
    anchors[0].insert_before(notice)
    return removed


def strip_zero_click_page(source: str) -> tuple[str, int, int]:
    soup = BeautifulSoup(source, "html.parser")
    anchors = merchant_anchors(soup)
    for anchor in anchors:
        anchor.unwrap()
    disclosures = remove_orphan_disclosures(soup)
    remaining = len(merchant_anchors(soup))
    if remaining:
        raise ValueError(f"merchant links remain after purge: {remaining}")
    return str(soup), len(anchors), disclosures


def prune_converting_page(
    source: str,
    clicked_targets: dict[str, int],
    fallback_links: int,
) -> tuple[str, int, int, str, int]:
    """Keep clicked current targets once, or a small fallback when URLs changed."""
    soup = BeautifulSoup(source, "html.parser")
    anchors = merchant_anchors(soup)
    clicked_current = {
        normalized_target(str(anchor.get("href") or ""))
        for anchor in anchors
        if clicked_targets.get(
            normalized_target(str(anchor.get("href") or "")), 0
        )
        > 0
    }
    mode = "clicked_targets" if clicked_current else "conversion_fallback"
    kept_targets: set[str] = set()
    kept = 0
    removed = 0
    for anchor in anchors:
        target = normalized_target(str(anchor.get("href") or ""))
        should_keep = False
        if clicked_current:
            should_keep = target in clicked_current and target not in kept_targets
        else:
            should_keep = kept < fallback_links
        if should_keep:
            kept += 1
            kept_targets.add(target)
        else:
            anchor.unwrap()
            removed += 1
    disclosures_removed = consolidate_active_disclosure(soup)
    return str(soup), removed, kept, mode, disclosures_removed


def build_plan(
    pages_dir: Path,
    totals: dict[str, int],
    target_clicks: dict[str, dict[str, int]],
    canonical_redirects: dict[str, str],
    blog_redirects: dict[str, str],
    apply_zero_click: bool,
    apply_preserve_clicked: bool,
    fallback_links: int,
) -> list[dict]:
    plan: list[dict] = []
    for page in sorted(pages_dir.glob("*.html")):
        source = page.read_text(encoding="utf-8", errors="replace")
        soup = BeautifulSoup(source, "html.parser")
        anchors = merchant_anchors(soup)
        if not anchors:
            continue

        route = route_for_file(page)
        canonical = canonical_path(route, canonical_redirects, blog_redirects)
        is_alias = canonical != route
        clicks = totals.get(canonical, 0)
        clicked_targets = target_clicks.get(canonical, {})
        current_targets = [normalized_target(str(a.get("href") or "")) for a in anchors]
        clicked_current = sum(clicked_targets.get(target, 0) for target in current_targets)
        action = "skip_alias" if is_alias else ("strip_all" if clicks == 0 else "preserve")
        item = {
            "file": page.name,
            "route": route,
            "canonical": canonical,
            "action": action,
            "links_before": len(anchors),
            "clicks_90d": clicks,
            "clicks_matching_current_links": clicked_current,
            "clicked_current_links": sum(
                1 for target in current_targets if clicked_targets.get(target, 0) > 0
            ),
            "unclicked_current_links": sum(
                1 for target in current_targets if clicked_targets.get(target, 0) == 0
            ),
        }
        if apply_zero_click and action == "strip_all":
            output, removed_links, removed_disclosures = strip_zero_click_page(source)
            page.write_text(output, encoding="utf-8")
            item.update(
                {
                    "applied": True,
                    "links_removed": removed_links,
                    "disclosures_removed": removed_disclosures,
                }
            )
        elif apply_preserve_clicked and action == "preserve":
            (
                output,
                removed_links,
                kept_links,
                prune_mode,
                disclosures_removed,
            ) = prune_converting_page(
                source,
                clicked_targets,
                fallback_links,
            )
            if kept_links < 1:
                raise ValueError(f"{page}: converting page would lose every merchant link")
            page.write_text(output, encoding="utf-8")
            item.update(
                {
                    "applied": True,
                    "links_removed": removed_links,
                    "links_kept": kept_links,
                    "prune_mode": prune_mode,
                    "disclosures_removed": disclosures_removed,
                }
            )
        else:
            item["applied"] = False
        plan.append(item)
    return plan


def summarize(plan: list[dict]) -> dict:
    summary = {
        "pages_with_merchant_links": len(plan),
        "merchant_links": sum(item["links_before"] for item in plan),
        "zero_click_pages": sum(item["action"] == "strip_all" for item in plan),
        "zero_click_links": sum(
            item["links_before"] for item in plan if item["action"] == "strip_all"
        ),
        "preserved_pages": sum(item["action"] == "preserve" for item in plan),
        "preserved_links": sum(
            item["links_before"] for item in plan if item["action"] == "preserve"
        ),
        "alias_pages_skipped": sum(item["action"] == "skip_alias" for item in plan),
        "applied_pages": sum(bool(item.get("applied")) for item in plan),
    }
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages-dir", type=Path, required=True)
    parser.add_argument("--clicks-tsv", type=Path, required=True)
    parser.add_argument("--routes", type=Path, required=True)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--apply-zero-click", action="store_true")
    parser.add_argument("--apply-preserve-clicked", action="store_true")
    parser.add_argument(
        "--fallback-links",
        type=int,
        default=2,
        help="Links kept on a converting page when none of its current URLs match.",
    )
    args = parser.parse_args()
    if args.fallback_links < 1:
        parser.error("--fallback-links must be at least 1")

    canonical_redirects, blog_redirects = load_literal_dicts(args.routes)
    totals, target_clicks = load_clicks(
        args.clicks_tsv, canonical_redirects, blog_redirects
    )
    plan = build_plan(
        args.pages_dir,
        totals,
        target_clicks,
        canonical_redirects,
        blog_redirects,
        args.apply_zero_click,
        args.apply_preserve_clicked,
        args.fallback_links,
    )
    payload = {
        "schema_version": "outilsia.affiliate_prune.v1",
        "mode": (
            "apply"
            if args.apply_zero_click or args.apply_preserve_clicked
            else "dry_run"
        ),
        "summary": summarize(plan),
        "pages": plan,
    }
    encoded = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.manifest:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        args.manifest.write_text(encoded + "\n", encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
