#!/usr/bin/env python3
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
APP_JS = ROOT / "src" / "app.js"
RUST = ROOT / "src-tauri" / "src" / "forgebench_stack_arena.rs"
LIB_RS = ROOT / "src-tauri" / "src" / "lib.rs"
LEDGER_RS = ROOT / "src-tauri" / "src" / "evidence_ledger.rs"
OUT = ROOT / ".artifacts" / "visual-ui"
OUT.mkdir(parents=True, exist_ok=True)


def assert_static_contract() -> None:
    html = HTML.read_text(encoding="utf-8")
    app_js = APP_JS.read_text(encoding="utf-8")
    rust = RUST.read_text(encoding="utf-8")
    lib_rs = LIB_RS.read_text(encoding="utf-8")
    ledger = LEDGER_RS.read_text(encoding="utf-8")

    for element_id in (
        "forgeBenchStackArenaDetails",
        "forgeBenchStackPreset",
        "forgeBenchStackLabel",
        "forgeBenchStackTargetRuns",
        "forgeBenchStackMonthlyCost",
        "forgeBenchStackHardwareCost",
        "forgeBenchStackStages",
        "compileForgeBenchStackBtn",
        "exportForgeBenchStackBtn",
        "forgeBenchStackTimer",
        "forgeBenchStackInterventions",
        "forgeBenchStackManualEdits",
        "forgeBenchStackPermissionClicks",
        "forgeBenchStackQuotaUnit",
        "forgeBenchStackArtifactConsent",
        "evaluateForgeBenchStackBtn",
        "forgeBenchStackRunsBox",
        "forgeBenchStackScoreboardBox",
        "copyForgeBenchStackRunBtn",
    ):
        if f'id="{element_id}"' not in html:
            raise AssertionError(f"missing ForgeBench Stack Arena control: {element_id}")

    for expected in (
        "Un arrangement complet, pas un modèle isolé",
        "Chaque outil reste utilisé manuellement dans son environnement officiel",
        "Répétitions visées",
        "3 runs · Arcade",
        "5 runs · Boussole mensuelle",
        "Relais versionnés",
        "Corrections demandées",
        "Éditions humaines",
        "Clics de permission",
        "Abonnements engagés / mois",
        "Amortissement local / run",
        "Je choisis moi-même ses trois fichiers finaux",
        "ce n'est pas une signature d'identité",
    ):
        if expected not in html:
            raise AssertionError(f"missing honest Stack Arena UI boundary: {expected}")

    for expected in (
        'COMPILE_REQUEST_SCHEMA: &str = "outilsia.forgebench_stack_plan_compile_request.v1"',
        'PLAN_SCHEMA: &str = "outilsia.forgebench_stack_plan.v1"',
        'RUN_RESULT_SCHEMA: &str = "outilsia.forgebench_stack_run_result.v1"',
        'SCOREBOARD_RESULT_SCHEMA: &str = "outilsia.forgebench_stack_scoreboard.v1"',
        '"execution_by_outilsia": false',
        '"automatic_execution": false',
        '"subscription_tool_started": false',
        '"subscription_automation": false',
        '"arrangement_attribution": "user_declared"',
        '"artifact_authorship_verified": false',
        '"artifact_frozen_before_hidden_suite_evaluation": true',
        '"temporary_workspace_removed": true',
        '"unknown_cost_is_zero": false',
        '"failure_receipts_supported": false',
        '"single_global_winner_declared": false',
        '"scientific_superiority_claimed": false',
        '"three_runs_are_arcade_exploration": true',
        '"five_runs_enable_monthly_compass_not_universal_truth": true',
        '"kind": "integrity_digest_not_signature"',
        '"provenance_authenticated": false',
        "blocking_pick_folder",
        "confirm_artifact_execution",
    ):
        if expected not in rust:
            raise AssertionError(f"missing native Stack Arena contract: {expected}")

    for forbidden_network_primitive in (
        "reqwest",
        "TcpStream",
        "UdpSocket",
        "https://",
        "http://",
    ):
        if forbidden_network_primitive in rust:
            raise AssertionError(
                f"Stack Arena unexpectedly gained network code: {forbidden_network_primitive}"
            )

    for expected in (
        "compile_forgebench_stack_plan,",
        "export_forgebench_stack_starter,",
        "evaluate_forgebench_stack_artifact,",
        "compile_forgebench_stack_scoreboard,",
    ):
        if expected not in lib_rs:
            raise AssertionError(f"missing Tauri Stack Arena registration: {expected}")

    for expected in (
        "forgebench_stack_run_verified",
        "forgebench_stack_scoreboard_compiled",
        "validate_stack_run_result",
        "validate_stack_scoreboard",
    ):
        if expected not in ledger:
            raise AssertionError(f"missing Stack Arena Evidence Ledger bridge: {expected}")

    for expected in (
        "applyForgeBenchStackArenaState",
        'invoke("compile_forgebench_stack_plan"',
        'invoke("export_forgebench_stack_starter"',
        'invoke("evaluate_forgebench_stack_artifact"',
        'invoke("compile_forgebench_stack_scoreboard"',
        "cohérence locale, pas signature de provenance",
        "Attribution des arrangements déclarée par l'utilisateur, non attestée",
        "Aucun vainqueur universel",
        "la fiabilité comparative reste hors V1",
        "unknown_cost_is_zero",
    ):
        if expected not in app_js:
            raise AssertionError(f"missing Stack Arena UI behavior: {expected}")


def assert_no_clipped_controls(page, label: str) -> None:
    clipped = page.evaluate(
        """() => [...document.querySelectorAll(
          '#forgeBenchStackArenaDetails button, #forgeBenchStackArenaDetails input, #forgeBenchStackArenaDetails select'
        )].filter((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) return false;
          const horizontalClip = !element.matches('input')
            && element.scrollWidth > element.clientWidth + 2;
          return horizontalClip || element.scrollHeight > element.clientHeight + 2;
        }).map((element) => ({
          id: element.id || element.getAttribute('data-stack-stage-field') || element.tagName,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight
        }))"""
    )
    if clipped:
        raise AssertionError(f"{label}: clipped Stack Arena controls {clipped}")


def verify_viewport(browser, width: int, height: int, label: str) -> Path:
    context = browser.new_context(viewport={"width": width, "height": height})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(HTML.as_uri(), wait_until="load")

    panel = page.locator(".forgebench-panel")
    details = page.locator("#forgeBenchStackArenaDetails")
    if panel.is_visible():
        raise AssertionError(f"{label}: ForgeBench must remain hidden in Essential mode")

    page.locator("#workspaceWorkflowsBtn").click()
    page.evaluate(
        "() => window.__OUTILSIA_TEST__.setWorkspaceSection('workflows', '.forgebench-panel')"
    )
    proof = page.evaluate(
        "() => window.__OUTILSIA_TEST__.applyForgeBenchStackArenaState()"
    )
    page.evaluate(
        "() => window.__OUTILSIA_TEST__.setWorkspaceSection('workflows', '.forgebench-panel')"
    )
    page.wait_for_timeout(200)

    if proof["open"] is not False or details.get_attribute("open") is not None:
        raise AssertionError(f"{label}: advanced Stack Arena must stay folded by default")
    if proof["plan"]["security"]["subscription_tool_started"] is not False:
        raise AssertionError(f"{label}: fixture claims subscription automation")
    if proof["plan"]["integrity"]["kind"] != "integrity_digest_not_signature":
        raise AssertionError(f"{label}: plan digest is mislabeled as provenance")
    if len(proof["plan"]["arrangement"]["stages"]) != 4:
        raise AssertionError(f"{label}: collaborative arrangement is incomplete")
    if any(stage["execution_by_outilsia"] for stage in proof["plan"]["arrangement"]["stages"]):
        raise AssertionError(f"{label}: a stage is falsely recorded as executed by OutilsIA")

    runs = proof["runs"]
    if len(runs) != 6 or len({run["plan_ref"]["plan_digest"] for run in runs}) != 2:
        raise AssertionError(f"{label}: expected two arrangements with three runs each")
    for run in runs:
        if run["security"]["subscription_automation"] is not False:
            raise AssertionError(f"{label}: run claims subscription automation")
        if run["provenance"]["arrangement_attribution"] != "user_declared":
            raise AssertionError(f"{label}: arrangement attribution is not bounded")
        if run["provenance"]["artifact_authorship_verified"] is not False:
            raise AssertionError(f"{label}: run overclaims artifact authorship")
        if run["quality"]["objective_checks_passed"] != 51:
            raise AssertionError(f"{label}: fixture contains an unverified accepted run")
        if run["readiness"]["winner_declared"] or run["readiness"]["scientific_eligible"]:
            raise AssertionError(f"{label}: run overclaims winner or science")

    scoreboard = proof["scoreboard"]
    if scoreboard["runs_total"] != 6 or len(scoreboard["arrangements"]) != 2:
        raise AssertionError(f"{label}: scoreboard aggregation mismatch")
    if scoreboard["claims"]["single_global_winner_declared"]:
        raise AssertionError(f"{label}: scoreboard declares a global winner")
    if scoreboard["claims"]["scientific_superiority_claimed"]:
        raise AssertionError(f"{label}: scoreboard claims scientific superiority")
    if scoreboard["claims"]["arrangement_attribution"] != "user_declared":
        raise AssertionError(f"{label}: scoreboard hides user-declared attribution")
    if scoreboard["claims"]["artifact_authorship_verified"] is not False:
        raise AssertionError(f"{label}: scoreboard overclaims artifact authorship")
    if scoreboard["pareto"]["cost_included"]:
        raise AssertionError(f"{label}: incomplete costs were included in Pareto dimensions")
    if scoreboard["pareto"]["unknown_cost_is_zero"]:
        raise AssertionError(f"{label}: unknown cost was converted to zero")

    details.locator("summary").click()
    page.wait_for_timeout(120)
    if details.get_attribute("open") is None:
        raise AssertionError(f"{label}: Stack Arena disclosure cannot be expanded")

    if page.locator("#forgeBenchStackStages .forgebench-stack-stage").count() != 4:
        raise AssertionError(f"{label}: four versioned relays are not visible")
    versions = page.locator(
        '#forgeBenchStackStages input[data-stack-stage-field="version"]'
    ).evaluate_all("elements => elements.map(element => element.value)")
    if versions != ["2026-07", "4.2", "2.1.206", "4.2"]:
        raise AssertionError(f"{label}: exact versions are not preserved {versions}")
    if page.locator("#forgeBenchStackRunsBox .forgebench-stack-run").count() != 6:
        raise AssertionError(f"{label}: six local run receipts are not rendered")
    if page.locator("#forgeBenchStackScoreboardBox .forgebench-stack-card").count() != 2:
        raise AssertionError(f"{label}: two arrangement cards are not rendered")
    if not page.locator("#copyForgeBenchStackRunBtn").is_enabled():
        raise AssertionError(f"{label}: latest verified run cannot be copied")
    if page.locator("#evaluateForgeBenchStackBtn").is_enabled():
        raise AssertionError(f"{label}: native artifact execution enabled in a plain web page")
    if page.locator("#evidenceLedgerSource").input_value() != "forgebench_stack_scoreboard_compiled":
        raise AssertionError(f"{label}: Stack Arena scoreboard is not offered to Evidence Ledger")

    text = " ".join(details.inner_text().split())
    for expected in (
        "Un arrangement complet, pas un modèle isolé",
        "Kimi K2",
        "Grok Code",
        "Claude Code",
        "3 runs visés",
        "cohérence locale, pas signature de provenance",
        "6 runs locaux",
        "51/51 checks",
        "coût/run incomplet",
        "Qwen local conçoit",
        "Pareto",
        "Attribution des arrangements déclarée par l'utilisateur, non attestée",
        "Aucun vainqueur universel",
        "la fiabilité comparative reste hors V1",
    ):
        if expected not in text:
            raise AssertionError(f"{label}: missing Stack Arena truth {expected!r}")
    for forbidden in (
        "api_key",
        "Bearer ",
        "/home/",
        "C:\\Users\\",
        "token",
        "mot de passe",
    ):
        if forbidden in text.lower() if forbidden.islower() else forbidden in text:
            raise AssertionError(f"{label}: private value rendered {forbidden!r}")

    overflow = page.evaluate(
        """() => ({
          viewport: innerWidth,
          body: document.body.scrollWidth,
          doc: document.documentElement.scrollWidth,
          details: document.querySelector('#forgeBenchStackArenaDetails').scrollWidth,
          detailsClient: document.querySelector('#forgeBenchStackArenaDetails').clientWidth
        })"""
    )
    if max(overflow["body"], overflow["doc"]) > overflow["viewport"] + 2:
        raise AssertionError(f"{label}: horizontal page overflow {overflow}")
    if overflow["details"] > overflow["detailsClient"] + 2:
        raise AssertionError(f"{label}: horizontal Stack Arena overflow {overflow}")
    assert_no_clipped_controls(page, label)
    if errors:
        raise AssertionError(f"{label}: page errors {errors}")

    screenshot = OUT / f"forgebench-stack-arena-{label}.png"
    page.add_style_tag(content=".workspace-nav { position: static !important; }")
    details.screenshot(path=str(screenshot))
    context.close()
    return screenshot


def main() -> None:
    assert_static_contract()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        desktop = verify_viewport(browser, 1440, 1000, "desktop")
        mobile = verify_viewport(browser, 390, 920, "mobile")
        browser.close()
    print(
        "forgebench_stack_arena_ok "
        f"desktop={desktop} mobile={mobile} "
        "arrangements=2 runs=6 roles=4 exact_versions=true "
        "subscription_automation=false native_import=true "
        "quality=51/51 cost_unknown_not_zero=true winner=false science=false"
    )


if __name__ == "__main__":
    main()
