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

    panel = page.locator(".workstack-arena-panel")
    if panel.is_visible():
        raise AssertionError(f"{label}: Workstack Arena must remain hidden in Essential mode")
    page.locator("#workspaceWorkflowsBtn").click()
    page.evaluate(
        "() => window.__OUTILSIA_TEST__.setWorkspaceSection('workflows', '.workstack-arena-panel')"
    )
    proof = page.evaluate("() => window.__OUTILSIA_TEST__.applyWorkstackArenaState()")
    page.evaluate(
        "() => window.__OUTILSIA_TEST__.setWorkspaceSection('workflows', '.workstack-arena-panel')"
    )
    page.wait_for_timeout(450)

    nav_box = page.locator(".workspace-nav").bounding_box()
    panel_box = panel.bounding_box()
    if not nav_box or not panel_box:
        raise AssertionError(f"{label}: workspace navigation or arena panel has no layout box")
    nav_position = page.locator(".workspace-nav").evaluate(
        "nav => getComputedStyle(nav).position"
    )
    if width <= 760 and nav_position != "static":
        raise AssertionError(f"{label}: mobile workspace navigation must not consume a sticky viewport")
    if nav_position == "sticky" and panel_box["y"] < nav_box["y"] + nav_box["height"] - 2:
        raise AssertionError(
            f"{label}: sticky workspace navigation overlaps the selected arena panel "
            f"nav={nav_box} panel={panel_box}"
        )

    result = proof["result"]
    if result["schema"] != "outilsia.workstack_arena_run_result.v1":
        raise AssertionError(f"{label}: result schema mismatch")
    if result["candidate"]["adapter_kind"] != "codex_cli_signal_maze_v1":
        raise AssertionError(f"{label}: wrong candidate adapter")
    if result["candidate"]["sandbox_mode"] != "workspace-write":
        raise AssertionError(f"{label}: Codex vendor sandbox is not explicit")
    if result["candidate"]["cli_invoked"] is not True:
        raise AssertionError(f"{label}: Codex CLI is not recorded as invoked")
    if result["execution"]["attempts"] != 1 or result["execution"]["succeeded"] is not True:
        raise AssertionError(f"{label}: execution is not a single successful attempt")
    if result["evaluator"]["visible_checks_passed"] != 7:
        raise AssertionError(f"{label}: static checks are incomplete")
    browser_evaluator = result["browser_evaluator"]
    if browser_evaluator["checks_passed"] != 39 or browser_evaluator["viewports_total"] != 3:
        raise AssertionError(f"{label}: visible Chromium evidence is incomplete")
    if browser_evaluator["input_modes"] != ["keyboard", "mouse", "touch"]:
        raise AssertionError(f"{label}: input modes are incomplete")
    security = result["security"]
    if security["environment_allowlist_applied"] is not True:
        raise AssertionError(f"{label}: CLI environment was not filtered")
    for forbidden_flag in [
        "original_repository_mounted",
        "original_repository_modified",
        "board_written",
        "merged",
        "published",
        "hidden_suite_mounted",
        "hidden_suite_used",
        "credentials_read_by_outilsia",
        "raw_cli_output_returned",
        "raw_cli_output_persisted",
        "paths_returned",
    ]:
        if security[forbidden_flag]:
            raise AssertionError(f"{label}: unsafe flag {forbidden_flag}=true")
    if result["cost"]["amount_eur"] is not None:
        raise AssertionError(f"{label}: unknown vendor cost was converted into a number")
    if result["cost"]["status"] != "vendor_cli_quota_or_cost_unknown":
        raise AssertionError(f"{label}: vendor cost status is misleading")
    if result["readiness"]["scientific_eligible"] or result["readiness"]["winner_declared"]:
        raise AssertionError(f"{label}: exploratory pilot overclaims science or a winner")
    if result["human_gate"]["status"] != "review_required_before_any_winner_or_delivery":
        raise AssertionError(f"{label}: human gate is missing")
    if page.locator("#evidenceLedgerSource").input_value() != "workstack_arena_codex_pilot_verified":
        raise AssertionError(f"{label}: arena evidence is not selected")
    if not page.locator("#copyWorkstackArenaBtn").is_enabled():
        raise AssertionError(f"{label}: verified receipt cannot be copied")

    review_proof = page.evaluate(
        "() => window.__OUTILSIA_TEST__.applyWorkstackHumanReviewState()"
    )
    page.evaluate(
        "() => window.__OUTILSIA_TEST__.setWorkspaceSection('workflows', '.workstack-arena-panel')"
    )
    page.locator("#workstackReviewPanel").evaluate("panel => { panel.open = true; }")
    review = review_proof["result"]
    if review["schema"] != "outilsia.workstack_human_review_result.v1":
        raise AssertionError(f"{label}: human review schema mismatch")
    if review["source_ref"]["arena_integrity_digest"] != result["integrity"]["digest"]:
        raise AssertionError(f"{label}: review is not bound to the signed arena receipt")
    if review["review"]["scope"] != "signed_public_receipt_only":
        raise AssertionError(f"{label}: human review scope is too broad")
    if review["review"]["status"] != "accepted_for_future_comparison":
        raise AssertionError(f"{label}: expected comparison-only decision")
    if review["review"]["artifact_visual_inspected"] or review["review"]["artifact_quality_approved"]:
        raise AssertionError(f"{label}: receipt review overclaims visual inspection")
    for forbidden_review_flag in [
        "delivery_authorized",
        "winner_authorized",
        "board_write_authorized",
        "merge_authorized",
        "publish_authorized",
    ]:
        if review["consequences"][forbidden_review_flag]:
            raise AssertionError(f"{label}: human review authorizes {forbidden_review_flag}")
    if page.locator("#evidenceLedgerSource").input_value() != "workstack_human_review_recorded":
        raise AssertionError(f"{label}: human review evidence is not selected")
    if not page.locator("#copyWorkstackReviewBtn").is_enabled():
        raise AssertionError(f"{label}: signed human decision cannot be copied")

    text = " ".join(panel.inner_text().split())
    for expected in [
        "pilote Codex vérifié",
        "Codex exécuté",
        "7/7",
        "39/39",
        "3 formats Chromium",
        "Coût / quota",
        "Inconnu",
        "Revue humaine obligatoire",
        "sans clé API tierce",
        "Revue humaine du reçu",
        "Accepté pour comparaison",
        "aucune capture ou code conservé",
        "Livraison interdite",
        "Gagnant non déclaré",
    ]:
        if expected not in text:
            raise AssertionError(f"{label}: missing Workstack Arena proof {expected!r}")
    for forbidden in [
        "Projet tres secret",
        "api_key",
        "Bearer ",
        "/home/",
        "C:\\Users\\",
        "stdout_tail",
        "stderr_tail",
    ]:
        if forbidden in text or forbidden in proof["receipt"]:
            raise AssertionError(f"{label}: private or raw value rendered {forbidden!r}")

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

    screenshot = OUT / f"workstack-arena-{label}.png"
    # Locator screenshots may scroll a tall panel under the sticky navigation.
    # The real layout overlap is asserted above; make only the artifact capture static.
    page.add_style_tag(content=".workspace-nav { position: static !important; }")
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
        f"workstack_arena_ui_ok desktop={desktop} mobile={mobile} "
        "codex=true static=7/7 browser=39/39 review=human-receipt-only "
        "cost=unknown repo=false delivery=false winner=false"
    )


if __name__ == "__main__":
    main()
