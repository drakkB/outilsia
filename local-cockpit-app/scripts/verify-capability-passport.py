#!/usr/bin/env python3
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
ARTIFACTS = ROOT / ".artifacts" / "visual-ui"


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(HTML.as_uri(), wait_until="load")
        page.evaluate("() => window.__OUTILSIA_TEST__.setViewMode('advanced')")
        result = page.evaluate("() => window.__OUTILSIA_TEST__.applyCapabilityPassportState()")
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        panel = page.locator(".capability-passport-panel")
        panel.screenshot(path=str(ARTIFACTS / "capability-passport-desktop.png"))
        page.set_viewport_size({"width": 390, "height": 844})
        panel.screenshot(path=str(ARTIFACTS / "capability-passport-mobile.png"))
        browser.close()

    passport = result["passport"]
    digest = passport["integrity"]["digest"]
    serialized = json.dumps(passport, ensure_ascii=False)

    assert passport["schema"] == "outilsia.ai_capability_passport.v1", passport["schema"]
    assert passport["passport_version"] == "1.0.1", passport["passport_version"]
    assert result["verified"] is True, result
    assert result["tamperedVerified"] is False, result
    assert result["staleSummary"] is None, result["staleSummary"]
    assert re.fullmatch(r"[0-9a-f]{64}", digest), digest
    assert passport["integrity"]["identity_signature"] is False
    assert "ne prouve" in passport["integrity"]["statement"]
    assert passport["hardware_doctor"]["schema"] == "outilsia.hardware_doctor.v2"
    assert passport["hardware_doctor"]["confidence"] == "measured"
    evidence = passport["runtime_readiness"]["evidence"]
    assert evidence["status"] == "gpu-proven", evidence
    assert evidence["source"] == "ollama_api_ps", evidence
    assert evidence["gpu_offload_percent"] == 100, evidence
    assert passport["capabilities"]["gpu_allocation_proven"] is True
    unknown = result["unknownPassport"]
    assert unknown["machine"]["ram_gb"] is None
    assert unknown["machine"]["vram_gb"] is None
    assert unknown["machine"]["storage_free_gb"] is None
    assert unknown["machine_provenance"]["ram_gb"] == "not_detected"
    assert unknown["machine_provenance"]["vram_gb"] == "not_detected"
    assert unknown["machine_provenance"]["storage_free_gb"] == "not_detected"
    assert result["unknownField"]["ram_gb"] is None
    assert result["unknownField"]["vram_gb"] is None
    assert passport["privacy"]["excludes_prompt_and_model_outputs"] is True
    assert "Pourquoi la VRAM" not in serialized
    assert "La VRAM stocke les poids" not in serialized
    assert "desktop_token" not in serialized
    assert "session_cookie" not in serialized
    assert passport["strategy_arena_handoff"]["boundary"]["forbidden_in_outilsia"] == [
        "generation_strategie",
        "backtest_financier",
        "optimisation_quant",
        "export_pine",
    ]
    assert result["summary"]["digest"] == digest
    assert result["readiness"]["capability_passport"]["digest"] == digest
    assert result["bridge"]["capability_passport"]["digest"] == digest
    assert result["field"]["capability_passport_ok"] is True
    assert result["field"]["capability_passport_digest"] == digest
    assert digest in result["memory"]
    assert "Empreinte d'intégrité, pas signature d'identité" in result["panel"]

    print(
        "capability_passport_ok "
        f"schema={passport['schema']} doctor={passport['hardware_doctor']['score']} "
        f"runtime={evidence['processor']} digest={digest[:16]}"
    )


if __name__ == "__main__":
    main()
