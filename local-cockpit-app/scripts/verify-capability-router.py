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

    panel = page.locator(".capability-router-panel")
    if panel.is_visible():
        raise AssertionError(f"{label}: router must remain hidden in Essential mode")
    page.locator("#viewAdvancedBtn").click()
    proof = page.evaluate("() => window.__OUTILSIA_TEST__.applyCapabilityRouterState()")
    panel.scroll_into_view_if_needed()

    result = proof["result"]
    routing = result["routing"]
    if result["schema"] != "outilsia.capability_router_result.v1":
        raise AssertionError(f"{label}: result schema mismatch")
    if routing["schema"] != "outilsia.capability_routing.v1":
        raise AssertionError(f"{label}: routing schema mismatch")
    if not result["dry_run"]:
        raise AssertionError(f"{label}: router is not marked as dry-run")
    for forbidden_flag in [
        "execution_started",
        "credentials_read",
        "repository_scanned",
        "repository_modified",
        "network_called",
    ]:
        if result[forbidden_flag]:
            raise AssertionError(f"{label}: unsafe flag {forbidden_flag}=true")
    assignments = routing["assignments"]
    worker = next(item for item in assignments if item["role"] == "worker")
    verifier = next(
        item for item in assignments if item["role"] == "independent_verifier"
    )
    if worker["candidate_id"] == verifier["candidate_id"]:
        raise AssertionError(f"{label}: worker and verifier are not independent")
    if any(item["task_execution_started"] for item in assignments):
        raise AssertionError(f"{label}: an assignment started execution")
    if not page.locator("#copyCapabilityRouterJsonBtn").is_enabled():
        raise AssertionError(f"{label}: router JSON cannot be copied")
    if not page.locator("#copyCapabilityRouterMarkdownBtn").is_enabled():
        raise AssertionError(f"{label}: router summary cannot be copied")

    text = panel.inner_text()
    for expected in [
        "proposition complète",
        "simulation uniquement",
        "Affectations proposées",
        "Planificateur",
        "Exécutant",
        "Vérificateur indépendant",
        "Codex CLI · WSL",
        "Claude Code · Windows",
        "Hermes Agent · WSL",
        "compte et quota non vérifiés",
        "Aucun agent lancé",
    ]:
        if expected not in text:
            raise AssertionError(f"{label}: missing router proof {expected!r}")
    for forbidden in ["api_key", "secret", "/home/", "C:\\Users\\"]:
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

    screenshot = OUT / f"capability-router-{label}.png"
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
        f"capability_router_ui_ok desktop={desktop} mobile={mobile} "
        "dry_run=true execution=false credentials=false independent_verifier=true"
    )


if __name__ == "__main__":
    main()
