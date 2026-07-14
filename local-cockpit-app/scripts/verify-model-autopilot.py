#!/usr/bin/env python3
import re
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
APP = ROOT / "src" / "app.js"
RUST = ROOT / "src-tauri" / "src" / "lib.rs"
ARTIFACTS = ROOT / ".artifacts" / "visual-ui"


def function_body(source: str, name: str, next_name: str) -> str:
    match = re.search(
        rf"(?:async\s+)?function\s+{re.escape(name)}\([^)]*\)\s*\{{(.*?)(?=\n(?:async\s+)?function\s+{re.escape(next_name)}\()",
        source,
        re.S,
    )
    assert match, f"function not found: {name}"
    return match.group(1)


def main():
    html = HTML.read_text(encoding="utf-8")
    app = APP.read_text(encoding="utf-8")
    rust = RUST.read_text(encoding="utf-8")

    assert 'class="panel model-autopilot-panel advanced-panel"' in html
    for element_id in (
        "modelAutopilotState",
        "modelAutopilotBox",
        "runModelAutopilotBtn",
        "applyModelAutopilotBtn",
        "rollbackModelAutopilotBtn",
    ):
        assert f'id="{element_id}"' in html, element_id

    run_body = function_body(app, "runModelAutopilot", "applyModelAutopilotRecommendation")
    assert "window.confirm" in run_body
    assert "isOllamaModelInstalled" in run_body
    assert "installRecommendedModel" not in run_body
    assert 'downloads: 0' in run_body
    assert 'protocol: MODEL_AUTOPILOT_PROTOCOL' in run_body
    assert 'tuning: profile.tuning' in run_body
    assert 'Math.max(55, benchmarkTimeoutSeconds(model))' in run_body
    assert 'timeout_seconds: timeoutSeconds' in run_body

    for token in (
        "num_ctx: Option<u32>",
        "num_batch: Option<u32>",
        "num_thread: Option<u32>",
        "value.clamp(512, 32_768)",
        "value.clamp(32, 1024)",
        "value.clamp(1, 64)",
        'Some("outilsia.autopilot.v1")',
        "autopilot_tuning_is_bounded_and_explicit_in_payload",
    ):
        assert token in rust, token

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(HTML.as_uri(), wait_until="load")
        panel = page.locator(".model-autopilot-panel")
        assert not panel.is_visible()
        page.evaluate("""() => {
          window.__OUTILSIA_TEST__.setWorkspaceTab('tests');
          window.__OUTILSIA_TEST__.setWorkspaceSection('tests', '.model-autopilot-panel');
          window.__OUTILSIA_TEST__.applyDemoState();
          const input = document.querySelector('#benchmarkModelInput');
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }""")
        assert page.locator("#modelAutopilotState").inner_text() == "choix du modèle requis"
        assert "Choisissez un modèle Ollama déjà installé dans Benchmark." in page.locator("#modelAutopilotBox").inner_text()
        result = page.evaluate("() => window.__OUTILSIA_TEST__.applyModelAutopilotState()")
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        assert panel.is_visible()
        panel.screenshot(path=str(ARTIFACTS / "model-autopilot-desktop.png"))
        page.set_viewport_size({"width": 390, "height": 844})
        panel.screenshot(path=str(ARTIFACTS / "model-autopilot-mobile.png"))
        browser.close()

    measured = result["measuredSnapshot"]
    applied = result["appliedSnapshot"]
    rolled_back = result["rolledBackSnapshot"]
    assert measured["schema"] == "outilsia.autopilot.v1"
    assert measured["budget"] == {"profiles": 3, "timeout_seconds_each": 55, "downloads": 0}
    assert len(measured["results"]) == 3
    assert all(item["success"] for item in measured["results"])
    assert measured["recommended"] and measured["recommended"]["score"] > 0
    assert measured["active"] is None

    active = applied["active"]
    assert active and active["key"] == measured["recommended"]["key"]
    assert 512 <= active["tuning"]["num_ctx"] <= 32768
    assert 32 <= active["tuning"]["num_batch"] <= 1024
    assert 1 <= active["tuning"]["num_thread"] <= 64
    assert result["field"]["model_autopilot_ok"] is True
    assert result["bridge"]["model_autopilot"]["active"]["key"] == active["key"]
    assert result["report"]["model_autopilot"]["active"]["key"] == active["key"]
    assert result["passportVerified"] is True
    assert result["passport"]["capabilities"]["model_autopilot_v1"] is True
    assert result["passport"]["model_autopilot"]["active"]["key"] == active["key"]
    assert "Actif dans OutilsIA" in result["panel"]
    assert rolled_back["active"] is None

    print(
        "model_autopilot_ok "
        f"profiles={len(measured['results'])} recommended={measured['recommended']['key']} "
        f"rollback={'default' if rolled_back['active'] is None else 'profile'}"
    )


if __name__ == "__main__":
    main()
