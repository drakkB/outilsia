#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
APP = ROOT / "src" / "app.js"
RUST = ROOT / "src-tauri" / "src" / "lib.rs"
ARTIFACTS = ROOT / ".artifacts" / "visual-ui"


def main():
    html = HTML.read_text(encoding="utf-8")
    app = APP.read_text(encoding="utf-8")
    rust = RUST.read_text(encoding="utf-8")

    assert 'class="panel flight-recorder-panel advanced-panel"' in html
    for element_id in (
        "flightRecorderState",
        "flightRecorderBox",
        "saveFlightReferenceBtn",
        "compareFlightReferenceBtn",
        "restoreFlightReferenceBtn",
        "copyFlightRecorderJsonBtn",
        "copyFlightRecorderMarkdownBtn",
    ):
        assert f'id="{element_id}"' in html, element_id

    for token in (
        'const FLIGHT_RECORDER_PROTOCOL = "outilsia.flight_recorder.v1"',
        'physical_field_proof: false',
        'prompt différent',
        'réglage Autopilot différent',
        'warn: -10, bad: -20',
        'warn: -12, bad: -25',
        'warn: 25, bad: 50',
        'warn: -10, bad: -30',
        'les causes restent des hypothèses',
    ):
        assert token in app, token

    for token in (
        "prompt_tokens_per_second: f64",
        "load_duration_ms: u64",
        "runtime_gpu_offload_percent: f64",
        "runtime_evidence_source: String",
        "cpu_generate_response_uses_real_ollama_metrics",
    ):
        assert token in rust, token

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(HTML.as_uri(), wait_until="load")
        panel = page.locator(".flight-recorder-panel")
        assert not panel.is_visible()
        page.evaluate("() => window.__OUTILSIA_TEST__.setViewMode('advanced')")
        result = page.evaluate("() => window.__OUTILSIA_TEST__.applyFlightRecorderState()")
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        assert panel.is_visible()
        panel.screenshot(path=str(ARTIFACTS / "flight-recorder-desktop.png"))
        page.set_viewport_size({"width": 390, "height": 1400})
        panel.screenshot(path=str(ARTIFACTS / "flight-recorder-mobile.png"))
        browser.close()

    baseline = result["baseline"]
    regression = result["regression"]
    comparison = regression["comparison"]
    assert baseline["active_reference"]["capture"]["trust"]["level"] == "high"
    assert baseline["active_reference"]["capture"]["trust"]["physical_field_proof"] is False
    assert comparison["comparable"] is True
    assert comparison["overall"] == "regression"
    assert comparison["confidence"] == "mixed"
    statuses = {item["key"]: item["status"] for item in comparison["metrics"]}
    assert statuses["generation_tokens_per_second"] == "regression"
    assert statuses["prompt_tokens_per_second"] == "regression"
    assert statuses["load_duration_ms"] == "regression"
    assert statuses["gpu_offload_percent"] == "regression"
    assert statuses["temperature_c"] == "regression"
    assert any(item["key"] == "gpu_driver" for item in comparison["changed_facts"])
    assert any("cause possible" in item for item in comparison["possible_causes"])
    assert comparison["physical_field_proof"] is False

    non_comparable = result["nonComparable"]
    assert non_comparable["overall"] == "not_comparable"
    assert non_comparable["comparable"] is False
    assert "réglage Autopilot différent" in non_comparable["blockers"]
    assert all(item["status"] == "informational" for item in non_comparable["metrics"])

    second = result["activeAfterSecondReference"]
    restored = result["activeAfterRestore"]
    assert second["history_count"] == 2
    assert restored["history_count"] == 2
    assert second["reference"]["id"] != restored["reference"]["id"]
    assert restored["reference"]["id"] == baseline["active_reference"]["id"]

    assert result["report"]["flight_recorder"]["comparison"]["overall"] == "regression"
    assert result["passportDocument"]["capabilities"]["flight_recorder_v1"] is True
    assert result["passportDocument"]["flight_recorder"]["physical_field_proof"] is False
    assert result["bridge"]["handoff_manifest"]["capabilities"]["expose_flight_recorder_summary_read_only"] is True
    assert result["bridge"]["flight_recorder"]["comparison"]["overall"] == "regression"
    assert result["field"]["flight_recorder_reference_ok"] is True
    assert result["field"]["flight_recorder_physical_proof"] is False
    assert "Régression locale détectée" in result["markdown"]
    assert "Causes possibles" in result["markdown"]
    assert "Régression locale détectée" in result["panel"]

    print(
        "flight_recorder_ok "
        f"overall={comparison['overall']} confidence={comparison['confidence']} "
        f"metrics={len(comparison['metrics'])} history={restored['history_count']}"
    )


if __name__ == "__main__":
    main()
