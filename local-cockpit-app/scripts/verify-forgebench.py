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

    panel = page.locator(".forgebench-panel")
    if panel.is_visible():
        raise AssertionError(f"{label}: ForgeBench must remain hidden in Essential mode")
    page.locator("#viewAdvancedBtn").click()
    proof = page.evaluate("() => window.__OUTILSIA_TEST__.applyForgeBenchState()")
    panel.scroll_into_view_if_needed()

    result = proof["result"]
    experiment = result["experiment"]
    if result["schema"] != "outilsia.forgebench_compile_result.v1":
        raise AssertionError(f"{label}: result schema mismatch")
    for key in ["execution_started", "agents_started", "worktrees_created", "repository_modified", "network_called"]:
        if result[key] is not False:
            raise AssertionError(f"{label}: unsafe result flag {key}")
    if experiment["schema"] != "outilsia.forgebench_experiment.v1":
        raise AssertionError(f"{label}: experiment schema mismatch")
    if experiment["protocol"]["starter"]["status"] != "sealed":
        raise AssertionError(f"{label}: starter not sealed")
    if experiment["protocol"]["hidden_suite"]["status"] != "not_provisioned":
        raise AssertionError(f"{label}: public fixture pretends to have hidden tests")
    if experiment["readiness"]["scientific_ready"] is not False:
        raise AssertionError(f"{label}: scientific readiness must stay blocked")
    if experiment["measurements"]["scores_computed"] is not False or experiment["measurements"]["winner_declared"] is not False:
        raise AssertionError(f"{label}: preflight contains a score or winner")
    digests = {stack["protocol_digest"] for stack in experiment["candidate_stacks"]}
    if digests != {experiment["protocol_digest"]}:
        raise AssertionError(f"{label}: candidate stacks do not share one protocol")
    if len(experiment["candidate_stacks"]) != 3:
        raise AssertionError(f"{label}: expected three initial stacks")
    if page.locator("#copyForgeBenchJsonBtn").is_disabled() or page.locator("#copyForgeBenchProtocolBtn").is_disabled():
        raise AssertionError(f"{label}: compiled preflight cannot be exported")
    if page.locator("#evidenceLedgerSource").input_value() != "forgebench_experiment_compiled":
        raise AssertionError(f"{label}: ForgeBench proof is not offered to Evidence Ledger")

    text = panel.inner_text()
    for expected in [
        "ForgeBench Lab",
        "Signal Maze v1",
        "Résultat",
        "Efficacité",
        "Vitesse",
        "Coût",
        "50%",
        "20%",
        "15%",
        "tests cachés non scellés",
        "Aucun agent lancé",
        "aucun score calculé",
        "aucun vainqueur déclaré",
        "coût inconnu ≠ zéro",
    ]:
        if expected not in text:
            raise AssertionError(f"{label}: missing ForgeBench truth {expected!r}")
    for forbidden in ["Projet tres secret", "api_key", "Bearer ", "/home/", "C:\\Users\\"]:
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

    screenshot = OUT / f"forgebench-{label}.png"
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
        f"forgebench_ui_ok desktop={desktop} mobile={mobile} "
        "starter=sealed hidden=absent scores=false winner=false execution=false"
    )


if __name__ == "__main__":
    main()
