#!/usr/bin/env python3
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
APP = ROOT / "src" / "app.js"
RUST = ROOT / "src-tauri" / "src" / "lib.rs"
ARTIFACTS = ROOT / ".artifacts" / "visual-ui"


def main():
    app = APP.read_text(encoding="utf-8")
    rust = RUST.read_text(encoding="utf-8")
    install_segment = app[app.index("async function installRecommendedModel"):app.index("async function cancelActiveInstall")]

    assert "runInstallSafetyPreflight(clean)" in install_segment
    assert install_segment.index("runInstallSafetyPreflight(clean)") < install_segment.index('invoke("install_ollama_model"')
    assert "window.confirm(detail)" in install_segment
    assert "Aucun octet du modèle n'a été téléchargé" in install_segment
    assert install_segment.index("preflight.model_already_installed") < install_segment.index('invoke("install_ollama_model"')
    assert "preflight_ollama_install" in rust
    assert "storage_path_exposed: false" in rust

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 960})
        page.goto(HTML.as_uri(), wait_until="load")
        page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceTab('models')")
        result = page.evaluate("() => window.__OUTILSIA_TEST__.applyInstallSafetyPreflightState()")
        page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceTab('tests')")
        page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceSection('tests', '.operation-panel')")

        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        page.locator("#operationPanel").screenshot(path=str(ARTIFACTS / "install-safety-preflight-desktop.png"))
        page.set_viewport_size({"width": 390, "height": 844})
        page.locator("#operationPanel").screenshot(path=str(ARTIFACTS / "install-safety-preflight-mobile.png"))
        browser.close()

    ready = result["ready"]
    blocked = result["blocked"]
    unknown = result["unknown"]
    already_installed = result["alreadyInstalled"]

    assert ready["schema"] == "outilsia.install_safety_preflight.v1"
    assert ready["verdict"] == "ready", ready
    assert ready["allowed"] is True
    assert ready["storage_free_gb"] == 120
    assert ready["required_free_gb"] > ready["estimated_download_gb"]
    assert ready["storage_path_exposed"] is False

    assert blocked["verdict"] == "blocked", blocked
    assert blocked["allowed"] is False
    assert blocked["storage_free_gb"] < blocked["required_free_gb"]
    assert blocked["blockers"]

    assert unknown["verdict"] == "warning", unknown
    assert unknown["allowed"] is True
    assert unknown["requires_confirmation"] is True
    assert unknown["storage_free_gb"] is None
    assert unknown["storage_source"] == "wsl_storage_unavailable"
    assert already_installed["verdict"] == "already_installed"
    assert already_installed["model_already_installed"] is True
    assert already_installed["requires_confirmation"] is False

    summary = result["summary"]
    assert summary["model"] == "qwen3:14b"
    assert summary["storage_path_exposed"] is False
    assert result["report"]["install_safety_preflight"]["verdict"] == "ready"

    passport = result["passport"]
    assert passport["passport_version"] == "1.3.0"
    assert passport["capabilities"]["install_safety_preflight_v1"] is True
    assert passport["privacy"]["excludes_ollama_storage_path"] is True
    assert passport["install_safety_preflight"]["storage_path_exposed"] is False

    exported = json.dumps(
        {
            "ready": ready,
            "blocked": blocked,
            "unknown": unknown,
            "report": result["report"],
            "passport": passport,
            "markdown": result["markdown"],
            "panel": result["panel"],
            "operation": result["operation"],
        },
        ensure_ascii=False,
    ).lower()
    for forbidden in ("c:\\users\\", "/home/", ".ollama/models", "ollama_models="):
        assert forbidden not in exported, f"storage path leaked: {forbidden}"
    assert "préflight installation" in result["markdown"].lower()
    assert "aucun chemin" in result["markdown"].lower()

    print(
        "install_safety_preflight_ok "
        f"ready={ready['required_free_gb']}gb blocked={blocked['storage_free_gb']}gb "
        "wsl_unknown=confirmed path=excluded"
    )


if __name__ == "__main__":
    main()
