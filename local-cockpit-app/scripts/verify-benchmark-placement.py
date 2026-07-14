#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
HUB = ROOT.parent / "server-work" / "static" / "pages" / "scanner-ia-local.html"
DOWNLOAD = ROOT.parent / "server-work" / "static" / "pages" / "telecharger-scanner-ia-local.html"
LLMS = ROOT.parent / "server-work" / "static" / "llms.txt"


def main():
    hub = HUB.read_text(encoding="utf-8")
    download = DOWNLOAD.read_text(encoding="utf-8")
    llms = LLMS.read_text(encoding="utf-8")
    assert "placement GPU/RAM mesuré" in hub
    assert "placement GPU/RAM mesuré" in download
    assert "measured GPU/RAM placement" in llms

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(HTML.as_uri(), wait_until="load")
        result = page.evaluate("() => window.__OUTILSIA_TEST__.applyBenchmarkPlacementState()")
        browser.close()

    hybrid = result["hybrid"]
    assert "hybride GPU + RAM" in hybrid["placement"], result
    assert "33.3 % du modèle sur le GPU" in hybrid["placement"], result
    assert "8.5 Go / 25.6 Go placés en VRAM" in hybrid["placement"], result
    assert "exécutable avec offload RAM" in hybrid["quality"], result
    assert "trop lent" in hybrid["quality"], result

    assert "Placement mesuré : GPU" in result["gpu"]["placement"], result
    assert "100 % du modèle sur le GPU" in result["gpu"]["placement"], result
    assert "Placement mesuré : CPU/RAM" in result["cpu"]["placement"], result
    assert "0 % du modèle sur le GPU" in result["cpu"]["placement"], result
    assert "exécution CPU confirmée" in result["cpu"]["quality"], result
    assert result["unproven"] == "", result

    for proof_text in (result["rendered"], result["history"], result["memory"]):
        assert "Placement mesuré" in proof_text, result
        assert "33.3 % du modèle sur le GPU" in proof_text, result

    print("benchmark_placement_ok hybrid=33.3%-gpu gpu=100%-gpu cpu=0%-gpu comfort=explicit")


if __name__ == "__main__":
    main()
