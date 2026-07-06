#!/usr/bin/env python3
from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"


REQUIRED_ALLOWED = {
    "select_local_model",
    "generate_strategy_draft_inside_strategy_arena",
    "explain_backtest_inside_strategy_arena",
    "critique_strategy_inside_strategy_arena",
    "document_strategy_inside_strategy_arena",
}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(HTML.as_uri(), wait_until="load")
        result = page.evaluate("""() => window.__OUTILSIA_TEST__.applyDemoState()""")
        profile = page.evaluate("""() => window.__OUTILSIA_TEST__.strategyArenaReadiness()""")
        markdown = page.evaluate("""() => window.__OUTILSIA_TEST__.strategyBridgeMarkdown()""")
        text = page.locator("#strategyBridgeBox").inner_text(timeout=5000)
        download_disabled = page.locator("#downloadStrategyBridgeJsonBtn").is_disabled(timeout=5000)
        browser.close()

    if profile.get("schema") != "outilsia.strategy_arena_readiness.v1":
        raise AssertionError(f"unexpected schema: {profile.get('schema')}")
    if profile.get("contract_version") != "2026-07-04":
        raise AssertionError(f"unexpected contract version: {profile.get('contract_version')}")
    if profile.get("import_file") != "outilsia-strategy-arena-profile.json":
        raise AssertionError("missing import file name")
    if profile.get("status") != "ready":
        raise AssertionError(f"profile should be ready in demo state, got {profile.get('status')}")
    if "Local Quant Mode" != profile.get("strategy_arena_import", {}).get("mode"):
        raise AssertionError("missing Local Quant Mode import contract")
    if profile.get("strategy_arena_import", {}).get("display_label") != "Modèles locaux disponibles via OutilsIA":
        raise AssertionError("missing Strategy Arena display label")
    if profile.get("strategy_arena_import", {}).get("must_validate_with_backtest") is not True:
        raise AssertionError("Strategy Arena validation rule missing")
    if profile.get("strategy_arena_import", {}).get("must_not_manage_ollama_installation") is not True:
        raise AssertionError("Strategy Arena must not manage Ollama installation")
    if profile.get("strategy_arena_import", {}).get("must_not_install_or_delete_models") is not True:
        raise AssertionError("Strategy Arena must not install/delete models")
    if profile.get("strategy_arena_contract", {}).get("no_trading_execution_in_outilsia") is not True:
        raise AssertionError("OutilsIA/Strategy Arena boundary missing")
    if profile.get("strategy_arena_contract", {}).get("no_model_management_in_strategy_arena") is not True:
        raise AssertionError("Strategy Arena model-management boundary missing")
    if profile.get("strategy_arena_contract", {}).get("required_strategy_arena_label") != "Modèles locaux disponibles via OutilsIA":
        raise AssertionError("missing required Strategy Arena label")
    if profile.get("local_models_available_via_outilsia") is not True:
        raise AssertionError("profile should expose local_models_available_via_outilsia")
    manifest = profile.get("handoff_manifest") or {}
    if manifest.get("import_label") != "Modèles locaux disponibles via OutilsIA":
        raise AssertionError(f"bad handoff import label: {manifest}")
    capabilities = manifest.get("capabilities") or {}
    for key in [
        "list_installed_models",
        "list_candidate_models",
        "expose_recommended_roles",
        "expose_benchmark_proof",
        "expose_runtime_command_prefix",
    ]:
        if capabilities.get(key) is not True:
            raise AssertionError(f"missing bridge capability {key}: {capabilities}")
    for key in ["install_or_delete_models_inside_strategy_arena", "run_backtests_inside_outilsia"]:
        if capabilities.get(key) is not False:
            raise AssertionError(f"unsafe bridge capability {key}: {capabilities}")
    if set(profile.get("allowed_use") or []) != REQUIRED_ALLOWED:
        raise AssertionError(f"allowed_use mismatch: {profile.get('allowed_use')}")
    if not profile.get("runtime_command_prefix"):
        raise AssertionError("missing runtime command prefix")
    if not profile.get("recommended_model"):
        raise AssertionError("missing recommended model")
    if len(profile.get("installed_models") or []) < 2:
        raise AssertionError("demo profile should expose installed local models")
    if len(profile.get("candidate_models") or []) < 2:
        raise AssertionError("demo profile should expose candidate models")
    for model in profile.get("candidate_models") or []:
        if "actionable_text" not in model or "source" not in model:
            raise AssertionError(f"candidate model missing actionability fields: {model}")
    if profile.get("separation_rules", {}).get("forbidden_in_outilsia") != [
        "generation_strategie",
        "backtest_financier",
        "optimisation_quant",
        "export_pine",
    ]:
        raise AssertionError("forbidden OutilsIA quant actions changed")
    if download_disabled:
        raise AssertionError("download profile button should be enabled after scan")
    if "Commande modèle" not in text or "Aucun backtest ni génération de stratégie dans OutilsIA" not in text:
        raise AssertionError(f"bridge UI text incomplete: {text[:500]}")
    if "OutilsIA prépare les modèles locaux" not in text:
        raise AssertionError(f"bridge UI missing boundary copy: {text[:500]}")
    for expected in [
        "Import Strategy Arena: Modèles locaux disponibles via OutilsIA",
        "Fichier attendu: outilsia-strategy-arena-profile.json",
        "Strategy Arena ne gère pas l'installation, la suppression ou le benchmark généraliste des modèles.",
        "Gestion modèles dans Strategy Arena: non",
        "Backtests dans OutilsIA: non",
    ]:
        if expected not in markdown:
            raise AssertionError(f"bridge markdown missing {expected!r}: {markdown[:1000]}")
    if result.get("bridge", {}).get("schema") != profile.get("schema"):
        raise AssertionError("applyDemoState bridge payload does not match readiness schema")

    print(
        "strategy_bridge_ok "
        f"schema={profile['schema']} "
        f"model={profile.get('recommended_model')} "
        f"installed={len(profile.get('installed_models') or [])} "
        f"candidates={len(profile.get('candidate_models') or [])}"
    )


if __name__ == "__main__":
    main()
