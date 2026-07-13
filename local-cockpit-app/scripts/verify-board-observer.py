#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
OUT = ROOT / ".artifacts" / "visual-ui"
OUT.mkdir(parents=True, exist_ok=True)


def verify_viewport(browser, width: int, height: int, label: str) -> Path:
    page = browser.new_page(viewport={"width": width, "height": height})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(HTML.as_uri(), wait_until="load")
    page.locator("#workspaceWorkflowsBtn").click()
    proof = page.evaluate("() => window.__OUTILSIA_TEST__.applyBoardObserverState()")
    panel = page.locator(".board-observer-panel")
    panel.scroll_into_view_if_needed()

    if proof["result"]["schema"] != "outilsia.board_observer_result.v1":
        raise AssertionError(f"{label}: result schema mismatch")
    if proof["result"]["snapshot"]["schema"] != "outilsia.board_snapshot.v1":
        raise AssertionError(f"{label}: snapshot schema mismatch")
    if proof["apiKeyValue"]:
        raise AssertionError(f"{label}: API key remained in the DOM")
    if page.locator("#boardObserverApiKey").get_attribute("type") != "password":
        raise AssertionError(f"{label}: API key input must remain a password field")
    if not page.locator("#copyBoardSnapshotBtn").is_enabled():
        raise AssertionError(f"{label}: filtered snapshot cannot be copied")

    text = panel.inner_text()
    for expected in [
        "2 prêtes",
        "lecture seule",
        "OutilsIA Workstack",
        "Construire Signal Maze v1",
        "limites d'autorisation",
    ]:
        if expected not in text:
            raise AssertionError(f"{label}: missing panel proof {expected!r}")
    for forbidden in ["Contexte prive", "secret@example.com", "X-Api-Key:"]:
        if forbidden in text:
            raise AssertionError(f"{label}: private value rendered {forbidden!r}")

    overflow = page.evaluate(
        """() => ({
          viewport: innerWidth,
          body: document.body.scrollWidth,
          doc: document.documentElement.scrollWidth,
          panel: document.querySelector('.board-observer-panel').scrollWidth
        })"""
    )
    if max(overflow["body"], overflow["doc"]) > overflow["viewport"] + 2:
        raise AssertionError(f"{label}: horizontal overflow {overflow}")
    if errors:
        raise AssertionError(f"{label}: page errors {errors}")

    screenshot = OUT / f"board-observer-{label}.png"
    panel.screenshot(path=str(screenshot))
    page.close()
    return screenshot


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        desktop = verify_viewport(browser, 1440, 1000, "desktop")
        mobile = verify_viewport(browser, 390, 920, "mobile")
        browser.close()
    print(f"board_observer_ui_ok desktop={desktop} mobile={mobile} key=ephemeral write=false")


if __name__ == "__main__":
    main()
