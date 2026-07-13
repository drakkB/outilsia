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
    page.evaluate("() => window.__OUTILSIA_TEST__.applyBoardObserverState()")
    page.locator('[data-compose-board-card="planka:card-ready-1"]').click()
    if "Construire Signal Maze v1" not in page.locator("#workstackSelectedCard").inner_text():
        raise AssertionError(f"{label}: board card was not transferred to the composer")
    proof = page.evaluate("() => window.__OUTILSIA_TEST__.applyWorkstackComposerState()")
    panel = page.locator(".workstack-composer-panel")
    panel.scroll_into_view_if_needed()

    result = proof["result"]
    plan = result["plan"]
    if result["schema"] != "outilsia.workstack_compile_result.v1":
        raise AssertionError(f"{label}: result schema mismatch")
    if plan["schema"] != "outilsia.workstack.v1":
        raise AssertionError(f"{label}: plan schema mismatch")
    if result["execution_started"] or plan["execution_enabled"]:
        raise AssertionError(f"{label}: compiler started execution")
    if result["raw_context_returned"] or plan["objective"]["raw_context_included"]:
        raise AssertionError(f"{label}: raw context escaped the compiler")
    if proof["contextValue"]:
        raise AssertionError(f"{label}: local context remained in the DOM")
    if not page.locator("#copyWorkstackJsonBtn").is_enabled():
        raise AssertionError(f"{label}: workstack JSON cannot be copied")
    if not page.locator("#copyWorkstackMarkdownBtn").is_enabled():
        raise AssertionError(f"{label}: workstack summary cannot be copied")

    text = panel.inner_text()
    for expected in [
        "prêt pour validation",
        "ws-demo-signal-maze",
        "gate humaine obligatoire",
        "Propriétaire humain",
        "Vérificateur indépendant",
        "Aucun blocage contractuel",
    ]:
        if expected not in text:
            raise AssertionError(f"{label}: missing composer proof {expected!r}")
    for forbidden in ["Contexte prive", "secret@example.com", "api_key"]:
        if forbidden in text:
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

    screenshot = OUT / f"workstack-composer-{label}.png"
    panel.screenshot(path=str(screenshot))
    page.close()
    return screenshot


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        desktop = verify_viewport(browser, 1440, 1000, "desktop")
        mobile = verify_viewport(browser, 390, 920, "mobile")
        browser.close()
    print(
        f"workstack_composer_ui_ok desktop={desktop} mobile={mobile} "
        "execution=false raw_context=false human_gate=true"
    )


if __name__ == "__main__":
    main()
