#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(HTML.as_uri(), wait_until="load")
        result = page.evaluate("() => window.__OUTILSIA_TEST__.applyHardwareTruthState()")
        browser.close()

    unknown = result["unknownDoctor"]
    unknown_checks = "\n".join(
        f"{item['label']}: {item['detail']}" for item in unknown["checks"]
    )
    unknown_actions = "\n".join(unknown["actions"])
    unknown_ui = "\n".join(result["unknownUi"].values())

    assert unknown["gpu"]["source"] == "not_detected", unknown["gpu"]
    assert "non concluante" in unknown["gpu"]["confidence"], unknown["gpu"]
    assert "ne conclut pas" in unknown_checks, unknown_checks
    assert "relancer l'analyse" in unknown_actions, unknown_actions
    assert "Aucun GPU dédié confirmé" not in unknown_ui, unknown_ui
    assert "CPU only / aucun GPU dédié" not in unknown_ui, unknown_ui
    assert result["unknownUi"]["gpu"] == "GPU non déterminé", result["unknownUi"]
    assert result["unknownUi"]["topGpu"] == "GPU non déterminé", result["unknownUi"]

    field = result["unknownField"]
    assert field["gpu"] == "GPU non déterminé", field["gpu"]
    assert field["vram_gb"] is None, field["vram_gb"]
    assert field["hardware_provenance"]["vram_gb"] == "not_detected"
    assert field["first_30s"]["hardware_visible"] is False, field["first_30s"]

    passport = result["unknownPassport"]
    assert passport["machine"]["gpu"] == "GPU non déterminé", passport["machine"]
    assert passport["machine"]["vram_gb"] is None, passport["machine"]
    assert passport["machine_provenance"]["vram_gb"] == "not_detected"

    four = result["fourModuleDoctor"]
    assert four["ram"]["module_count"] == 4, four["ram"]
    assert four["ram"]["channel_mode"] == "canal inconnu · plusieurs modules", four["ram"]
    assert "mode canal non confirmé" in four["ram"]["confidence"], four["ram"]
    assert "multi estimé" not in result["fourModuleUi"], result["fourModuleUi"]
    assert "quad estimé" not in result["fourModuleUi"], result["fourModuleUi"]

    print(
        "hardware_truth_ok "
        "gpu=unknown_not_cpu_only ram=module_layout_only linux=sysfs_dmi"
    )


if __name__ == "__main__":
    main()
