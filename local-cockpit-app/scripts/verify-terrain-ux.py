#!/usr/bin/env python3
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
OUT = ROOT / ".artifacts" / "visual-ui"
OUT.mkdir(parents=True, exist_ok=True)


REQUIRED_QUICK_LABELS = [
    "Action suivante",
    "Modèle conseillé",
    "Preuve locale",
    "Upgrade utile",
]

REQUIRED_MACHINE_LABELS = [
    "CPU",
    "RAM",
    "GPU",
    "VRAM",
    "OS",
    "Runtime IA",
]


def visible(page, selector: str) -> bool:
    return page.evaluate(
        """(selector) => {
          const el = document.querySelector(selector);
          if (!el) return false;
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;
        }""",
        selector,
    )


def text(page, selector: str) -> str:
    return page.locator(selector).inner_text(timeout=5000)


def assert_no_horizontal_overflow(page, label: str):
    metrics = page.evaluate(
        """() => ({
          width: window.innerWidth,
          body: document.body.scrollWidth,
          doc: document.documentElement.scrollWidth
        })"""
    )
    overflow = max(metrics["body"], metrics["doc"]) - metrics["width"]
    if overflow > 2:
        raise AssertionError(f"{label}: horizontal overflow {overflow}px {metrics}")


def assert_first_screen_contract(page, label: str):
    if not visible(page, "#prepareBtn"):
        raise AssertionError(f"{label}: main analysis button must be visible")
    primary = text(page, "#prepareBtn")
    if "Analyser ce PC" not in primary and "Actualiser l'analyse" not in primary:
        raise AssertionError(f"{label}: primary action unclear: {primary!r}")

    if not visible(page, ".machine-summary-strip"):
        raise AssertionError(f"{label}: machine summary must be immediately visible")
    if not visible(page, ".quick-decision-strip"):
        raise AssertionError(f"{label}: quick decision strip must be immediately visible")

    machine = text(page, ".machine-summary-strip")
    machine_lower = machine.lower()
    missing_machine = [item for item in REQUIRED_MACHINE_LABELS if item.lower() not in machine_lower]
    if missing_machine:
        raise AssertionError(f"{label}: machine summary missing {missing_machine}: {machine}")

    quick = text(page, ".quick-decision-strip")
    quick_lower = quick.lower()
    missing_quick = [item for item in REQUIRED_QUICK_LABELS if item.lower() not in quick_lower]
    if missing_quick:
        raise AssertionError(f"{label}: quick strip missing {missing_quick}: {quick}")

    noisy_visible = [
        selector
        for selector in [
            ".status-strip",
            ".operation-monitor",
            ".release-strip",
            ".hero-insights",
            ".promptforge-panel",
            ".chat-panel",
            ".benchmark-history-panel",
        ]
        if visible(page, selector)
    ]
    if noisy_visible:
        raise AssertionError(f"{label}: essential first screen is noisy: {noisy_visible}")


def assert_scanned_contract(page, label: str):
    result = page.evaluate("""() => window.__OUTILSIA_TEST__.applyDemoState()""")
    page.wait_for_timeout(250)
    assert_first_screen_contract(page, label)

    machine = text(page, ".machine-summary-strip")
    for needle in ["RTX", "64 Go", "24 Go", "Prêt"]:
        if needle not in machine:
            raise AssertionError(f"{label}: scanned machine summary missing {needle!r}: {machine}")

    quick = text(page, ".quick-decision-strip")
    required = [
        "Installer le modèle de test",
        "Potentiel matériel",
        "hermes3:8b",
        "benchmarké",
        "qwen3:0.6b",
        "Gros LLM",
    ]
    missing = [needle for needle in required if needle not in quick]
    if missing:
        raise AssertionError(f"{label}: scanned quick decision missing {missing}: {quick}")

    top = page.evaluate(
        """() => ({
          prepare: document.querySelector('#prepareBtn')?.innerText || '',
          machine: document.querySelector('.machine-summary-strip')?.innerText || '',
          quick: document.querySelector('.quick-decision-strip')?.innerText || '',
          visibleTools: [...document.querySelectorAll('.benchmark-panel, .promptforge-panel, .chat-panel')]
            .filter((panel) => panel.offsetParent !== null)
            .map((panel) => panel.className),
          quickCards: document.querySelectorAll('.quick-decision-strip > div').length,
          modeEssential: document.querySelector('#appShell')?.classList.contains('mode-essential') || false
        })"""
    )
    if not top["modeEssential"]:
        raise AssertionError(f"{label}: app should remain in essential mode by default")
    if top["quickCards"] != 5:
        raise AssertionError(f"{label}: quick decision should expose exactly 5 cards, got {top['quickCards']}")
    if len(top["visibleTools"]) > 1:
        raise AssertionError(f"{label}: too many work panels in essential mode: {top['visibleTools']}")

    if "promptforge" in quick.lower():
        raise AssertionError(f"{label}: PromptForge should not dominate top decision strip: {quick}")
    if "console" in quick.lower() or "suivi en direct" in quick.lower():
        raise AssertionError(f"{label}: operation console leaked into top decision strip: {quick}")

    if "qwen3:0.6b" not in result["quick"]["proof"]:
        raise AssertionError(f"{label}: harness proof state not aligned: {result['quick']}")


def check(browser, width: int, height: int, label: str):
    page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    page.goto(HTML.as_uri(), wait_until="load")
    page.wait_for_timeout(250)
    assert_no_horizontal_overflow(page, f"{label}-initial")
    assert_first_screen_contract(page, f"{label}-initial")
    screenshot_initial = OUT / f"terrain-ux-{label}-initial.png"
    page.screenshot(path=screenshot_initial, full_page=True)

    assert_no_horizontal_overflow(page, f"{label}-scanned")
    assert_scanned_contract(page, f"{label}-scanned")
    screenshot_scanned = OUT / f"terrain-ux-{label}-scanned.png"
    page.screenshot(path=screenshot_scanned, full_page=True)
    page.close()
    return screenshot_initial, screenshot_scanned


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        desktop = check(browser, 1440, 1000, "desktop")
        mobile = check(browser, 390, 920, "mobile")
        browser.close()
    print(f"terrain_ux_ok desktop={desktop[1]} mobile={mobile[1]}")


if __name__ == "__main__":
    main()
