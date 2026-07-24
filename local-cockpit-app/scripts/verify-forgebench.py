#!/usr/bin/env python3
import json
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
    page.locator("#workspaceWorkflowsBtn").click()
    page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceSection('workflows', '.forgebench-panel')")
    proof = page.evaluate("() => window.__OUTILSIA_TEST__.applyForgeBenchState()")
    page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceSection('workflows', '.forgebench-panel')")
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
    if experiment["protocol"]["hidden_suite"]["status"] != "locally_sealed":
        raise AssertionError(f"{label}: local hidden suite receipt is missing")
    if experiment["readiness"]["scientific_ready"] is not False:
        raise AssertionError(f"{label}: scientific readiness must stay blocked")
    if experiment["measurements"]["scores_computed"] is not False or experiment["measurements"]["winner_declared"] is not False:
        raise AssertionError(f"{label}: preflight contains a score or winner")
    digests = {stack["protocol_digest"] for stack in experiment["candidate_stacks"]}
    if digests != {experiment["protocol_digest"]}:
        raise AssertionError(f"{label}: candidate stacks do not share one protocol")
    if len(experiment["candidate_stacks"]) != 4:
        raise AssertionError(f"{label}: expected four candidate stacks")
    if "ollama-local" not in {stack["key"] for stack in experiment["candidate_stacks"]}:
        raise AssertionError(f"{label}: Ollama local stack is missing")
    receipt = proof["vault"]["receipt"]
    if receipt["hidden_seeds_total"] != 5 or receipt["security"]["worker_access_blocked"] is not False:
        raise AssertionError(f"{label}: hidden suite receipt overclaims isolation")
    receipt_json = json.dumps(receipt, sort_keys=True)
    if '"hidden_seeds":' in receipt_json or "seed-boundary-cases" in receipt_json:
        raise AssertionError(f"{label}: hidden suite contents leaked to UI")
    sandbox = proof["sandbox"]["receipt"]
    if sandbox["schema"] != "outilsia.forgebench_worker_sandbox_receipt.v1":
        raise AssertionError(f"{label}: sandbox receipt schema mismatch")
    if sandbox["workspaces_total"] != 12 or sandbox["candidate_stacks_total"] != 4 or sandbox["public_seeds_total"] != 3:
        raise AssertionError(f"{label}: sandbox workspace matrix mismatch")
    if sandbox["experiment_digest"] != experiment["integrity"]["digest"] or sandbox["protocol_digest"] != experiment["protocol_digest"]:
        raise AssertionError(f"{label}: sandbox is not bound to the current experiment")
    if sandbox["security"]["fresh_workspace_per_run"] is not True or sandbox["security"]["starter_digest_verified"] is not True:
        raise AssertionError(f"{label}: fresh verified workspaces are missing")
    for key in ["process_isolation_enforced", "network_isolation_enforced", "hidden_suite_access_blocked"]:
        if sandbox["security"][key] is not False:
            raise AssertionError(f"{label}: sandbox overclaims {key}")
    if sandbox["execution"]["worker_started"] is not False or sandbox["execution"]["command_executed"] is not False:
        raise AssertionError(f"{label}: sandbox fixture claims execution")
    if sandbox["readiness"]["worker_execution_ready"] is not False or sandbox["readiness"]["scientific_eligible"] is not False:
        raise AssertionError(f"{label}: workspace preparation unlocked execution or science")
    sandbox_json = json.dumps(sandbox, sort_keys=True)
    for forbidden in ["workspace_relative", "hidden_seeds", "/home/", "C:\\Users\\"]:
        if forbidden in sandbox_json:
            raise AssertionError(f"{label}: sandbox receipt leaked {forbidden!r}")
    isolation = proof["isolation"]
    if isolation["schema"] != "outilsia.forgebench_isolation_probe_result.v1":
        raise AssertionError(f"{label}: isolation probe schema mismatch")
    if isolation["readiness"]["isolation_backend_ready"] is not True:
        raise AssertionError(f"{label}: isolation canary fixture not ready")
    if isolation["readiness"]["worker_execution_ready"] is not False or isolation["readiness"]["scientific_eligible"] is not False:
        raise AssertionError(f"{label}: isolation canary unlocked execution or science")
    if isolation["security"]["worker_started"] is not False or isolation["security"]["worker_command_executed"] is not False:
        raise AssertionError(f"{label}: isolation canary claims a worker execution")
    for key in ["user_namespace_available", "mount_namespace_available", "network_namespace_available", "pid_namespace_available", "workspace_write_canary_passed", "host_root_hidden_in_canary"]:
        if isolation["capabilities"][key] is not True:
            raise AssertionError(f"{label}: isolation canary missing {key}")
    isolation_json = json.dumps(isolation, sort_keys=True)
    for forbidden in ["workspace_relative", "hidden_seeds", "/home/", "C:\\Users\\"]:
        if forbidden in isolation_json:
            raise AssertionError(f"{label}: isolation result leaked {forbidden!r}")
    pilot = proof["pilot"]
    if pilot["schema"] != "outilsia.forgebench_reference_pilot_result.v1":
        raise AssertionError(f"{label}: reference pilot schema mismatch")
    if pilot["worker"]["succeeded"] is not True or pilot["worker"]["candidate_stack_executed"] is not False:
        raise AssertionError(f"{label}: reference worker claim mismatch")
    if pilot["evaluator"]["succeeded"] is not True or pilot["evaluator"]["workspace_read_only"] is not True:
        raise AssertionError(f"{label}: visible evaluator claim mismatch")
    if pilot["evaluator"]["hidden_suite_used"] is not False:
        raise AssertionError(f"{label}: reference evaluator claims hidden-suite use")
    if pilot["readiness"]["candidate_worker_execution_ready"] is not False or pilot["readiness"]["scientific_eligible"] is not False:
        raise AssertionError(f"{label}: reference pilot unlocked candidate execution or science")
    pilot_json = json.dumps(pilot, sort_keys=True)
    for forbidden in ["workspace_path", "forgebench-reference-pilot-v1:", "/home/", "C:\\Users\\"]:
        if forbidden in pilot_json:
            raise AssertionError(f"{label}: reference pilot leaked {forbidden!r}")
    candidate = proof["candidate"]
    if candidate["schema"] != "outilsia.forgebench_ollama_candidate_result.v3":
        raise AssertionError(f"{label}: Ollama candidate schema mismatch")
    if candidate["candidate"]["model_invoked"] is not True or candidate["candidate"]["cli_agent_invoked"] is not False:
        raise AssertionError(f"{label}: Ollama invocation claim mismatch")
    if candidate["submission"]["generated_code_executed"] is not True:
        raise AssertionError(f"{label}: candidate fixture omits generated-code execution")
    if candidate["evaluator"]["visible_checks_passed"] != 7 or candidate["evaluator"]["workspace_read_only"] is not True:
        raise AssertionError(f"{label}: static candidate evaluator claim mismatch")
    browser = candidate["browser_evaluator"]
    if browser["kind"] != "chromium_visible_gameplay_gate" or browser["checks_passed"] != 39:
        raise AssertionError(f"{label}: browser evaluator claim mismatch")
    if browser["seeds_total"] != 3 or browser["viewports_total"] != 3 or len(browser["screenshots"]) != 3:
        raise AssertionError(f"{label}: browser evidence is incomplete")
    hidden = candidate["hidden_evaluator"]
    if hidden["kind"] != "chromium_hidden_holdout_gate_v1" or hidden["controller_kind"] != "trusted_local_holdout_controller_v1":
        raise AssertionError(f"{label}: hidden evaluator contract mismatch")
    if hidden["private_checks_passed"] != 5 or hidden["private_checks_total"] != 5 or hidden["viewports_total"] != 3:
        raise AssertionError(f"{label}: hidden holdout evidence is incomplete")
    if hidden["worker_generation_completed_before_suite_read"] is not True or hidden["vault_file_mounted"] is not False:
        raise AssertionError(f"{label}: hidden holdout ordering or vault boundary mismatch")
    if hidden["hidden_seeds_returned"] is not False or hidden["observations_returned"] is not False or hidden["screenshots_returned"] is not False:
        raise AssertionError(f"{label}: private holdout material escaped")
    if hidden["check_families_public_in_source"] is not True or hidden["same_user_process_isolation_enforced"] is not False:
        raise AssertionError(f"{label}: hidden holdout limitations are concealed")
    if candidate["readiness"]["visible_browser_execution_verified"] is not True or candidate["readiness"]["gameplay_verified"] is not True or candidate["readiness"]["hidden_evaluator_verified"] is not True:
        raise AssertionError(f"{label}: candidate visible gameplay proof missing")
    if candidate["readiness"]["scientific_eligible"] is not False or candidate["readiness"]["winner_declared"] is not False:
        raise AssertionError(f"{label}: candidate overclaims science or winner")
    if candidate["cost"]["api_cost_eur"] != 0 or candidate["cost"]["local_energy_wh"] is not None:
        raise AssertionError(f"{label}: candidate cost truth mismatch")
    candidate_json = json.dumps(candidate, sort_keys=True)
    for forbidden in ["index_html", "styles_css", "game_js", "workspace_path", "/home/", "C:\\Users\\"]:
        if forbidden in candidate_json:
            raise AssertionError(f"{label}: candidate result leaked {forbidden!r}")
    if page.locator("#copyForgeBenchJsonBtn").is_disabled() or page.locator("#copyForgeBenchProtocolBtn").is_disabled():
        raise AssertionError(f"{label}: compiled preflight cannot be exported")
    if page.locator("#evidenceLedgerSource").input_value() != "forgebench_ollama_candidate_verified":
        raise AssertionError(f"{label}: candidate proof is not offered to Evidence Ledger")

    execution_details = page.locator("#forgeBenchExecutionDetails")
    if execution_details.get_attribute("open") is not None:
        raise AssertionError(f"{label}: advanced ForgeBench stages must stay folded by default")
    page.add_style_tag(content=".workspace-nav { position: static !important; }")
    compact_screenshot = OUT / f"forgebench-compact-{label}.png"
    panel.screenshot(path=str(compact_screenshot))
    compact_height = panel.bounding_box()["height"]
    execution_details.locator(":scope > summary").click()
    page.wait_for_timeout(120)
    if execution_details.get_attribute("open") is None:
        raise AssertionError(f"{label}: advanced ForgeBench stages cannot be expanded")
    expanded_height = panel.bounding_box()["height"]
    if expanded_height <= compact_height + 100:
        raise AssertionError(f"{label}: ForgeBench disclosure does not reduce the default panel")

    text = panel.inner_text()
    for expected in [
        "Comparer des stacks",
        "ForgeBench",
        "Signal Maze v1",
        "Résultat",
        "Efficacité",
        "Vitesse",
        "Coût",
        "50%",
        "20%",
        "15%",
        "Suite cachée locale",
        "scellée localement",
        "stockage local non chiffré",
        "Suite privée réservée au holdout Ollama après gel du code",
        "Familles de checks publiques et vault même-utilisateur",
        "Espaces worker frais",
        "workspaces vérifiés",
        "12 espaces frais liés au préflight",
        "starter SHA-256 vérifié",
        "Aucun chemin exposé",
        "aucun worker lancé",
        "processus, réseau et accès au vault non isolés",
        "Préflight isolation",
        "canari isolé vérifié",
        "Namespaces utilisateur, montage, réseau et processus séparés",
        "aucun worker lancé",
        "pilote technique séparé disponible",
        "Pilote d'exécution",
        "transport isolé vérifié",
        "Worker de référence réussi · évaluateur indépendant 6/6",
        "soumission montée en lecture seule",
        "Aucun Codex, Claude, Hermes ou modèle local exécuté",
        "Candidat Ollama local",
        "holdout vérifié",
        "hermes3:8b · visible 39/39 · holdout 5/5",
        "seeds absents du prompt",
        "3 captures vérifiées",
        "3 seeds · desktop + Android portrait/paysage · clavier, souris, tactile",
        "pas encore de score scientifique ni de vainqueur",
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

    garden_details = page.locator("#forgeBenchGardenDetails")
    if garden_details.get_attribute("open") is not None:
        raise AssertionError(f"{label}: Garden/Bamboo must stay folded before a result")
    garden = page.evaluate("() => window.__OUTILSIA_TEST__.applyForgeBenchGardenState()")
    garden_result = garden["result"]
    if garden["verified"] is not True:
        raise AssertionError(f"{label}: Garden/Bamboo fixture is not verified")
    if garden_result["schema"] != "outilsia.forgebench_garden_evaluate_result.v1":
        raise AssertionError(f"{label}: Garden/Bamboo result schema mismatch")
    if garden_result["execution"]["candidate_code_executed"] is not False:
        raise AssertionError(f"{label}: Garden/Bamboo claims candidate code execution")
    if garden_result["execution"]["hidden_suite_loaded_after_candidate_freeze"] is not True:
        raise AssertionError(f"{label}: Garden/Bamboo hidden suite ordering mismatch")
    if garden_result["comparison"]["composite_score"] is not False or garden_result["comparison"]["winner_declared"] is not False:
        raise AssertionError(f"{label}: Garden/Bamboo exposes a composite score or winner")
    if garden_result["benchmark"]["official_gardenarena_ranking"] is not False:
        raise AssertionError(f"{label}: Garden/Bamboo claims an official GardenArena ranking")
    garden_json = json.dumps(garden_result, sort_keys=True)
    for forbidden in ['"source":', '"hidden_seed":', '"hidden_seeds":', '"hidden_scenario":', '"hidden_scenarios":', '"scenario_parameters":']:
        if forbidden in garden_json:
            raise AssertionError(f"{label}: Garden/Bamboo result leaked {forbidden!r}")
    ui_tamper_guard = page.evaluate(
        """(result) => {
          const forgedWinner = structuredClone(result);
          forgedWinner.comparison.winner_declared = true;
          forgedWinner.comparison.winner = forgedWinner.candidates[0].candidate_id;
          const leakedSeeds = structuredClone(result);
          leakedSeeds.hidden_suite.hidden_seeds = [100001, 100002, 100003];
          return {
            winnerAccepted: Boolean(window.__OUTILSIA_TEST__.forgeBenchGardenVerifiedResult(forgedWinner)),
            hiddenAccepted: Boolean(window.__OUTILSIA_TEST__.forgeBenchGardenVerifiedResult(leakedSeeds))
          };
        }""",
        garden_result,
    )
    if ui_tamper_guard["winnerAccepted"] or ui_tamper_guard["hiddenAccepted"]:
        raise AssertionError(f"{label}: Garden/Bamboo UI accepted a forged winner or hidden material")
    if garden_details.get_attribute("open") is None:
        raise AssertionError(f"{label}: verified Garden/Bamboo result was not surfaced")
    garden_text = garden_details.inner_text()
    for expected in [
        "Garden/Bamboo v1",
        "Piste OutilsIA exploratoire",
        "Pas de code exécuté",
        "Pas de score composite",
        "Aucun vainqueur automatique",
        "2 candidats",
        "Fable Joint Sentinel",
        "Controle conservateur OutilsIA",
        "Ordre provisoire vérifié",
        "5 scénarios cachés + 1 public",
        "Aucun vainqueur déclaré",
        "vitesse et coût hors ordre stratégique",
    ]:
        if expected not in garden_text:
            raise AssertionError(f"{label}: missing Garden/Bamboo truth {expected!r}")
    if page.locator("#copyForgeBenchGardenResultBtn").is_disabled() or page.locator("#sendForgeBenchGardenToLedgerBtn").is_disabled():
        raise AssertionError(f"{label}: verified Garden/Bamboo receipt cannot be exported")
    if page.locator("#evidenceLedgerSource").input_value() != "forgebench_garden_batch_verified":
        raise AssertionError(f"{label}: Garden/Bamboo proof is not offered to Evidence Ledger")
    garden_screenshot = OUT / f"forgebench-garden-{label}.png"
    garden_details.screenshot(path=str(garden_screenshot))

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
    return screenshot, garden_screenshot


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        desktop, garden_desktop = verify_viewport(browser, 1440, 1000, "desktop")
        mobile, garden_mobile = verify_viewport(browser, 390, 920, "mobile")
        browser.close()
    print(
        f"forgebench_ui_ok desktop={desktop} mobile={mobile} garden_desktop={garden_desktop} garden_mobile={garden_mobile} "
        "starter=sealed hidden=ui-fixture-holdout-verified stacks=4 workspaces=12 isolation=reference-pilot candidate=ollama-ui-fixture-v3 structure=true code-executed=true visible=39/39 holdout=5/5 garden=dsl-public-hidden science=false winner=false"
    )


if __name__ == "__main__":
    main()
