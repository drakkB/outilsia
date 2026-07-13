#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
APP = ROOT / "src" / "app.js"
RUST = ROOT / "src-tauri" / "src" / "lib.rs"
CATALOG = ROOT.parent / "server-work" / "static" / "data" / "local-ai-upgrades.json"
ARTIFACTS = ROOT / ".artifacts" / "visual-ui"


def main():
    html = HTML.read_text(encoding="utf-8")
    app = APP.read_text(encoding="utf-8")
    rust = RUST.read_text(encoding="utf-8")
    catalog = CATALOG.read_text(encoding="utf-8")

    assert 'class="panel upgrade-impact-panel upgrade-digital-twin-panel advanced-panel"' in html
    for element_id in (
        "digitalTwinScenarioName",
        "digitalTwinGpuSelect",
        "digitalTwinRamSelect",
        "digitalTwinStorageSelect",
        "digitalTwinPsuInput",
        "digitalTwinPsuPurchaseInput",
        "digitalTwinCaseClearanceInput",
        "digitalTwinGpuLengthInput",
        "digitalTwinAirflowSelect",
        "digitalTwinCoolingPurchaseInput",
        "simulateDigitalTwinBtn",
        "saveDigitalTwinBtn",
        "restoreDigitalTwinBtn",
        "copyDigitalTwinJsonBtn",
        "copyDigitalTwinMarkdownBtn",
        "downloadDigitalTwinJsonBtn",
        "downloadDigitalTwinMarkdownBtn",
        "pdfDigitalTwinBtn",
    ):
        assert f'id="{element_id}"' in html, element_id

    for token in (
        'const UPGRADE_DIGITAL_TWIN_PROTOCOL = "outilsia.upgrade_digital_twin.v1"',
        "physical_field_proof: false",
        "simulation_only: true",
        "N'achetez rien pour l'instant",
        "Plafond carte mère non exposé",
        "Les connecteurs varient selon la carte exacte",
        "Mesurer le boîtier et relever la longueur du modèle exact",
        "expose_upgrade_digital_twin_summary_read_only",
        "upgrade_digital_twin_physical_proof: false",
    ):
        assert token in app, token

    for token in (
        "memory_type: Option<String>",
        "SMBIOSMemoryType",
        "memory_type_from_smbios_code",
        '34 => "DDR5"',
        '"Type" => current.memory_type',
    ):
        assert token in rust, token

    for token in (
        '"version": "2026-07-11"',
        '"system_power_w": 750',
        '"gpu_power_w": 350',
        '"reference_case_clearance_mm": 313',
        '"memory_type_must_match": true',
        '"m2_slot_not_detected_by_os": true',
    ):
        assert token in catalog, token

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1366, "height": 1000})
        page.goto(HTML.as_uri(), wait_until="load")
        panel = page.locator(".upgrade-digital-twin-panel")
        assert not panel.is_visible()
        page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceTab('machine')")
        result = page.evaluate("() => window.__OUTILSIA_TEST__.applyUpgradeDigitalTwinState()")
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        assert panel.is_visible()
        panel.screenshot(path=str(ARTIFACTS / "upgrade-digital-twin-desktop.png"))

        blocked = result["blocked"]
        blocked_checks = {item["key"]: item for item in blocked["compatibility"]["checks"]}
        assert blocked["decision"]["key"] == "blocked"
        assert blocked_checks["ram_capacity"]["status"] == "blocked"
        assert blocked_checks["psu"]["status"] == "blocked"
        assert blocked_checks["case_clearance"]["status"] == "blocked"
        assert blocked["physical_field_proof"] is False

        assert result["beforeBenchmark"]["decision"]["key"] == "measure_first"
        assert result["afterBenchmark"]["decision"]["key"] == "no_buy"
        assert result["afterCompatibility"]["decision"]["key"] == "no_buy"
        assert "N'achetez rien pour ce scénario" in result["afterCompatibilityUi"]
        assert "Gros LLM 24 Go" not in result["afterCompatibilityUi"]
        assert "Upgrade prioritaire" not in result["afterCompatibilityUi"]

        candidate = result["candidate"]
        candidate_checks = {item["key"]: item for item in candidate["compatibility"]["checks"]}
        assert candidate["decision"]["key"] == "candidate"
        assert candidate["compatibility"]["blocked_count"] == 0
        assert candidate_checks["ram_capacity"]["status"] == "confirmed"
        assert candidate_checks["ram_type"]["status"] == "probable"
        assert candidate_checks["psu"]["status"] == "probable"
        assert candidate_checks["case_clearance"]["status"] == "probable"
        assert candidate_checks["power_connectors"]["status"] == "unknown"
        assert candidate_checks["driver"]["status"] == "unknown"
        assert candidate_checks["storage_interface"]["status"] == "unknown"
        assert candidate["current"]["ram"]["type"] == "DDR3"
        assert candidate["current"]["ram"]["motherboard_max_gb"] == 32
        assert candidate["target"]["vram_gb"] == 24
        assert candidate["target"]["ram_gb"] == 32
        assert candidate["impact"]["newly_reachable_models"]
        assert candidate["impact"]["cost_eur"]["max"] > candidate["impact"]["cost_eur"]["min"] > 0
        assert candidate["impact"]["cost_is_live"] is False
        assert candidate["impact"]["cost_metadata"]["as_of"] == "2026-07-11"
        assert candidate["impact"]["cost_metadata"]["is_live"] is False
        assert candidate["compatibility"]["confidence"] != "high"
        candidate_cost_keys = {item["key"] for item in candidate["impact"]["cost_components"]}
        assert "psu" not in candidate_cost_keys
        assert "cooling" not in candidate_cost_keys
        assert all(item["source"] for item in candidate["impact"]["cost_components"])
        assert all(item["as_of"] == "2026-07-11" for item in candidate["impact"]["cost_components"])
        assert "Certains liens matériels sont affiliés" in result["candidateVisibleUi"]

        purchase_cost_keys = {item["key"] for item in result["purchaseBudget"]["impact"]["cost_components"]}
        assert "psu" in purchase_cost_keys
        assert "cooling" in purchase_cost_keys

        missing_checks = {item["key"]: item for item in result["missingModules"]["compatibility"]["checks"]}
        assert result["missingModules"]["current"]["ram"]["module_count"] is None
        assert missing_checks["ram_slots"]["status"] == "unknown"
        assert "0/4" not in missing_checks["ram_slots"]["detail"]

        unknown_resources = result["unknownResources"]
        assert unknown_resources["current"]["ram"]["total_gb"] is None
        assert unknown_resources["current"]["gpu"]["vram_gb"] is None
        assert unknown_resources["current"]["storage_free_gb"] is None
        assert unknown_resources["target"]["ram_gb"] is None
        assert unknown_resources["target"]["vram_gb"] is None
        assert unknown_resources["target"]["storage_free_gb"] is None
        assert unknown_resources["impact"]["newly_reachable_models"] == []
        assert unknown_resources["decision"]["key"] == "measure_first"

        unified = result["unifiedMemoryTarget"]
        unified_checks = {item["key"]: item for item in unified["compatibility"]["checks"]}
        assert unified["current"]["unified_memory"] is True
        assert unified["current"]["gpu"]["vram_gb"] is None
        assert unified["target"]["vram_gb"] == 24
        assert unified["decision"]["key"] != "no_buy"
        assert unified["impact"]["newly_reachable_models"] == []
        assert unified_checks["gpu_baseline"]["status"] == "unknown"
        assert "mémoire unifiée" in unified_checks["gpu_baseline"]["detail"]

        assert result["staleSummaryAfterRescan"] is None
        assert result["recalculatedAfterRescan"]["target"]["ram_gb"] == 64
        assert result["downgrade"]["decision"]["key"] == "no_buy"
        assert "réduit" in result["downgrade"]["decision"]["rationale"]

        assert result["noChange"]["decision"]["key"] == "no_buy"
        assert result["noBuy"]["decision"]["key"] == "no_buy"
        assert result["noBuyReport"]["purchases_suppressed_by_digital_twin"] is True
        assert result["noBuyReport"]["upgrades"] == []
        assert result["noBuyReport"]["buying_links"] == []
        assert result["noBuyPack"]["purchases_suppressed_by_digital_twin"] is True
        assert result["noBuyPack"]["upgrades"] == []
        assert result["noBuyPack"]["buying_links"] == []
        assert "amazon.fr" not in result["noBuyPdf"].lower()
        assert "Aucun achat proposé" in result["noBuyPdf"]
        assert "N'achetez rien pour ce scénario" in result["noBuyVisibleUi"]
        assert "Conserver la machine" in result["noBuyVisibleUi"]
        assert "Gros LLM 24 Go" not in result["noBuyVisibleUi"]
        assert "Upgrade prioritaire" not in result["noBuyVisibleUi"]
        assert "amazon.fr" not in result["noBuyVisibleUi"].lower()
        assert result["restored"]["draft"]["name"] == candidate["draft"]["name"]
        assert len(result["exportDocument"]["history"]) == 2
        assert len(result["exportDocument"]["comparison"]) == 2
        assert all(item["physical_field_proof"] is False for item in result["exportDocument"]["comparison"])
        assert result["summary"]["physical_field_proof"] is False
        assert result["summary"]["cost"]["currency"] == "EUR"
        assert result["summary"]["cost"]["as_of"] == "2026-07-11"
        assert result["summary"]["cost"]["is_live"] is False
        assert result["summary"]["cost_components"]
        assert result["report"]["upgrade_digital_twin"]["decision"]["key"] == "candidate"
        assert result["passport"]["capabilities"]["upgrade_digital_twin_v1"] is True
        assert result["passport"]["upgrade_digital_twin"]["physical_field_proof"] is False
        assert result["bridge"]["handoff_manifest"]["capabilities"]["expose_upgrade_digital_twin_summary_read_only"] is True
        assert result["bridge"]["upgrade_digital_twin"]["decision"]["key"] == "candidate"
        assert result["bridge"]["upgrade_digital_twin"]["cost"]["currency"] == "EUR"
        assert result["field"]["upgrade_digital_twin_ok"] is True
        assert result["field"]["upgrade_digital_twin_physical_proof"] is False
        assert "Upgrade Digital Twin" in result["memory"]
        assert "aucune preuve terrain physique" in result["markdown"]
        assert "Simulation d'upgrade - aucune preuve physique" in result["readinessMarkdown"]
        assert "Scénario utile à vérifier" in result["pdf"]
        assert "Gros LLM 24 Go" not in result["pdf"]
        assert "Scénario utile à vérifier" in result["panel"]

        page.set_viewport_size({"width": 390, "height": 1600})
        panel.screenshot(path=str(ARTIFACTS / "upgrade-digital-twin-mobile.png"))
        overflow = page.evaluate(
            "() => ({body: document.body.scrollWidth - document.body.clientWidth, panel: document.querySelector('.upgrade-digital-twin-panel').scrollWidth - document.querySelector('.upgrade-digital-twin-panel').clientWidth})"
        )
        assert overflow["body"] <= 1, overflow
        assert overflow["panel"] <= 1, overflow
        browser.close()

    print(
        "upgrade_digital_twin_ok "
        f"blocked={blocked['compatibility']['blocked_count']} "
        f"candidate_unknown={candidate['compatibility']['unknown_count']} "
        f"history={len(result['exportDocument']['history'])}"
    )


if __name__ == "__main__":
    main()
