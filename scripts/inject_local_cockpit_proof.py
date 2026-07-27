#!/usr/bin/env python3
"""Insert one compact Local Cockpit evidence block before active merchant areas."""

from __future__ import annotations

import argparse
from pathlib import Path

from bs4 import BeautifulSoup

from plan_affiliate_prune import (
    canonical_path,
    load_literal_dicts,
    merchant_anchors,
    route_for_file,
)


STYLESHEET = "/static/css/outilsia-proof-first.css?v=20260727"


def proof_block(soup: BeautifulSoup):
    section = soup.new_tag("section")
    section["class"] = ["oi-software-proof"]
    section["aria-label"] = "Preuve logicielle OutilsIA"

    eyebrow = soup.new_tag("p")
    eyebrow["class"] = ["oi-software-proof__eyebrow"]
    eyebrow.string = "Preuve logicielle OutilsIA"
    section.append(eyebrow)

    title = soup.new_tag("h2")
    title.string = "Le conseil matériel vient après le diagnostic."
    section.append(title)

    text = soup.new_tag("p")
    text["class"] = ["oi-software-proof__text"]
    text.string = (
        "OutilsIA édite Local Cockpit, une application desktop Rust/Tauri "
        "open source pour Windows et Linux. Elle détecte le matériel et le "
        "runtime Ollama, recommande un modèle, puis distingue clairement une "
        "compatibilité estimée d'un benchmark réellement exécuté."
    )
    section.append(text)

    facts = soup.new_tag("div")
    facts["class"] = ["oi-software-proof__facts"]
    for value in (
        "Windows + Linux",
        "Code source GitHub",
        "118,5 tok/s mesurés sur Hermes 3 8B",
        "RTX 4080 SUPER 16 Go · 27/07/2026",
    ):
        fact = soup.new_tag("span")
        fact["class"] = ["oi-software-proof__fact"]
        fact.string = value
        facts.append(fact)
    section.append(facts)

    links = soup.new_tag("div")
    links["class"] = ["oi-software-proof__links"]
    for label, href in (
        ("Télécharger Local Cockpit", "/telecharger-scanner-ia-local"),
        ("Voir la preuve datée", "/preuves-local-cockpit"),
        ("Auditer le code GitHub", "https://github.com/drakkB/outilsia"),
    ):
        anchor = soup.new_tag("a", href=href)
        if href.startswith("https://"):
            anchor["rel"] = ["noopener"]
        anchor.string = label
        links.append(anchor)
    section.append(links)

    limit = soup.new_tag("p")
    limit["class"] = ["oi-software-proof__limit"]
    limit.string = (
        "Cette mesure prouve le parcours sur une machine précise. Elle ne "
        "prévoit pas la vitesse du matériel présenté sur cette page."
    )
    section.append(limit)
    return section


def inject(path: Path) -> bool:
    source = path.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(source, "html.parser")
    anchors = merchant_anchors(soup)
    if not anchors or soup.select_one(".oi-proof,.oi-software-proof"):
        return False

    if soup.head and not soup.find(
        "link", href=lambda value: value and "outilsia-proof-first.css" in value
    ):
        stylesheet = soup.new_tag("link", rel="stylesheet", href=STYLESHEET)
        soup.head.append(stylesheet)

    block = proof_block(soup)
    first = anchors[0]
    merchant_section = first.find_parent("section")
    if merchant_section is not None:
        merchant_section.insert_before(block)
    else:
        container = first.find_parent(["article", "main"])
        if container is not None:
            container.insert(0, block)
        elif soup.body is not None:
            soup.body.insert(0, block)
        else:
            raise ValueError(f"{path}: no insertion point")

    path.write_text(str(soup), encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages-dir", type=Path, required=True)
    parser.add_argument("--routes", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    canonical_redirects, blog_redirects = load_literal_dicts(args.routes)
    candidates: list[Path] = []
    for path in sorted(args.pages_dir.glob("*.html")):
        soup = BeautifulSoup(
            path.read_text(encoding="utf-8", errors="replace"), "html.parser"
        )
        if not merchant_anchors(soup):
            continue
        route = route_for_file(path)
        if route != canonical_path(route, canonical_redirects, blog_redirects):
            continue
        if soup.select_one(".oi-proof,.oi-software-proof"):
            continue
        candidates.append(path)

    changed = 0
    if args.apply:
        for path in candidates:
            changed += int(inject(path))
    print(
        f"local_cockpit_proof candidates={len(candidates)} "
        f"changed={changed} mode={'apply' if args.apply else 'dry-run'}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
