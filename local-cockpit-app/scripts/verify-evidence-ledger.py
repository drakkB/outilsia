#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
OUT = ROOT / ".artifacts" / "visual-ui"
OUT.mkdir(parents=True, exist_ok=True)


def verify_viewport(browser, width: int, height: int, label: str) -> Path:
    context = browser.new_context(viewport={"width": width, "height": height})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(HTML.as_uri(), wait_until="load")

    panel = page.locator(".evidence-ledger-panel")
    if panel.is_visible():
        raise AssertionError(f"{label}: ledger must remain hidden in Essential mode")
    page.locator("#workspaceWorkflowsBtn").click()
    page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceSection('workflows', '.evidence-ledger-panel')")
    proof = page.evaluate("() => window.__OUTILSIA_TEST__.applyEvidenceLedgerState()")
    page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceSection('workflows', '.evidence-ledger-panel')")
    panel.scroll_into_view_if_needed()

    ledger = proof["ledger"]
    if ledger["schema"] != "outilsia.evidence_ledger.v1":
        raise AssertionError(f"{label}: ledger schema mismatch")
    if ledger["verification"]["chain_valid"] is not True:
        raise AssertionError(f"{label}: fixture chain is not valid")
    if ledger["verification"]["entries_verified"] != 3:
        raise AssertionError(f"{label}: wrong verified entry count")
    if len(ledger["entries"]) != 3:
        raise AssertionError(f"{label}: wrong entry count")
    if any(entry["execution"]["started"] for entry in ledger["entries"]):
        raise AssertionError(f"{label}: ledger contains an execution")
    if any(entry["privacy"]["raw_source_stored"] for entry in ledger["entries"]):
        raise AssertionError(f"{label}: ledger contains raw source")
    if page.locator("#evidenceLedgerSource").input_value() != "capability_routing_proposed":
        raise AssertionError(f"{label}: latest available proof is not selected")
    arena_option = page.locator(
        '#evidenceLedgerSource option[value="workstack_arena_codex_pilot_verified"]'
    )
    if arena_option.count() != 1:
        raise AssertionError(f"{label}: Workstack Arena evidence option is missing")
    if not arena_option.evaluate("option => option.disabled"):
        raise AssertionError(f"{label}: unavailable Workstack Arena evidence must stay disabled")
    if not page.locator("#copyEvidenceLedgerBtn").is_enabled():
        raise AssertionError(f"{label}: verified ledger cannot be copied")
    if not page.locator("#downloadEvidenceLedgerBtn").is_enabled():
        raise AssertionError(f"{label}: verified ledger cannot be downloaded")

    text = panel.inner_text()
    for expected in [
        "3 preuves · chaîne valide",
        "Journal local de preuves chaînées",
        "Board observé",
        "Workstack compilée",
        "Routage proposé",
        "Board Observer",
        "Workstack Composer",
        "Capability Router",
        "Aucun contenu brut",
        "ajouts chaînés uniquement",
    ]:
        if expected not in text:
            raise AssertionError(f"{label}: missing ledger proof {expected!r}")
    for forbidden in [
        "Projet tres secret",
        "Construire Signal Maze v1",
        "api_key",
        "secret",
        "/home/",
        "C:\\Users\\",
    ]:
        if forbidden in text or forbidden in proof["markdown"]:
            raise AssertionError(f"{label}: private value rendered {forbidden!r}")

    overflow = page.evaluate(
        """() => ({
          viewport: innerWidth,
          body: document.body.scrollWidth,
          doc: document.documentElement.scrollWidth
        })"""
    )
    if max(overflow["body"], overflow["doc"]) > overflow["viewport"] + 2:
        raise AssertionError(f"{label}: horizontal overflow {overflow}")
    if errors:
        raise AssertionError(f"{label}: page errors {errors}")

    screenshot = OUT / f"evidence-ledger-{label}.png"
    panel.screenshot(path=str(screenshot))
    context.close()
    return screenshot


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        desktop = verify_viewport(browser, 1440, 1000, "desktop")
        mobile = verify_viewport(browser, 390, 920, "mobile")
        browser.close()
    print(
        f"evidence_ledger_ui_ok desktop={desktop} mobile={mobile} "
        "entries=3 chain=true raw=false execution=false"
    )


if __name__ == "__main__":
    main()
