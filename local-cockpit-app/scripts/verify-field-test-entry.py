#!/usr/bin/env python3
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
OUT = ROOT / ".artifacts" / "visual-ui"
OUT.mkdir(parents=True, exist_ok=True)


REQUIRED_FIELDS = {
    "profile",
    "profile_source",
    "profile_inferred",
    "tested_at",
    "machine_label",
    "os",
    "cpu",
    "gpu",
    "ram_gb",
    "vram_gb",
    "hardware_doctor",
    "capability_passport_ok",
    "capability_passport_schema",
    "capability_passport_digest",
    "scan_ok",
    "score",
    "score_label",
    "recommended_model",
    "first_action",
    "upgrade_recommendation",
    "benchmark_model",
    "benchmark_tokens_per_second",
    "benchmark_elapsed_ms",
    "benchmark_execution_mode",
    "benchmark_measurement_source",
    "benchmark_runtime_processor",
    "benchmark_gpu_offload_percent",
    "benchmark_runtime_evidence_source",
    "promptforge_ok",
    "dialogue_ok",
    "arena_ok",
    "report_ok",
    "share_url",
}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(HTML.as_uri(), wait_until="load")
        page.evaluate("""() => localStorage.clear()""")
        page.evaluate("""() => window.__OUTILSIA_TEST__.setWorkspaceTab('machine')""")
        disabled_before = page.locator("#copyFieldTestJsonBtn").is_disabled(timeout=5000)
        page.locator("#prepareBtn").click()
        page.wait_for_function("() => !document.querySelector('#prepareBtn')?.disabled")
        page.evaluate("""() => {
            window.__OUTILSIA_TEST__.setWorkspaceTab('machine');
            window.__OUTILSIA_TEST__.setWorkspaceSection('machine', '.field-test-panel');
        }""")
        disabled_partial = page.locator("#copyFieldTestJsonBtn").is_disabled(timeout=5000)
        download_disabled_partial = page.locator("#downloadFieldTestJsonBtn").is_disabled(timeout=5000)
        partial_state = page.locator("#fieldTestState").inner_text(timeout=5000)
        partial_panel = page.locator("#fieldTestBox").inner_text(timeout=5000)
        partial_action = page.locator("#continueFieldTestBtn").inner_text(timeout=5000)
        page.wait_for_timeout(250)
        page.screenshot(path=OUT / "field-test-incomplete-desktop.png", full_page=True)
        page.evaluate("""() => window.__OUTILSIA_TEST__.applyFieldTestReadyState()""")
        entry = page.evaluate("""() => window.__OUTILSIA_TEST__.fieldTestEntry()""")
        payload = page.evaluate("""() => window.__OUTILSIA_TEST__.fieldTestPayload()""")
        disabled_after = page.locator("#copyFieldTestJsonBtn").is_disabled(timeout=5000)
        download_disabled_after = page.locator("#downloadFieldTestJsonBtn").is_disabled(timeout=5000)
        complete_state = page.locator("#fieldTestState").inner_text(timeout=5000)
        panel_text = page.locator("#fieldTestBox").inner_text(timeout=5000)
        page.evaluate("""() => {
            window.__OUTILSIA_TEST__.setWorkspaceTab('machine');
            window.__OUTILSIA_TEST__.setWorkspaceSection('machine', '.field-test-panel');
        }""")
        page.wait_for_timeout(250)
        page.screenshot(path=OUT / "field-test-complete-desktop.png", full_page=True)
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(250)
        mobile_overflow = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        page.screenshot(path=OUT / "field-test-complete-mobile.png", full_page=True)
        manual = page.evaluate("""() => {
            window.__OUTILSIA_TEST__.setFieldTestProfile('rtx_3060_12gb');
            return window.__OUTILSIA_TEST__.fieldTestEntry();
        }""")
        mismatched_profile_disabled = page.locator("#copyFieldTestJsonBtn").is_disabled(timeout=5000)
        browser.close()

    if not disabled_before:
        raise AssertionError("field test JSON copy must be disabled before scan")
    if not disabled_partial or not download_disabled_partial:
        raise AssertionError("incomplete field entry export must remain disabled after scan")
    if "preuve" not in partial_state.casefold() or "export bloqué" not in partial_panel.casefold():
        raise AssertionError(f"partial field-test gate is unclear: state={partial_state!r} panel={partial_panel[:300]!r}")
    if "vérifier le profil" not in partial_action.casefold():
        raise AssertionError(f"unmatched hardware should require a valid terrain profile: {partial_action!r}")
    if disabled_after or download_disabled_after:
        raise AssertionError("complete field test JSON export must be enabled")
    if "fiche prête" not in complete_state.casefold():
        raise AssertionError(f"complete field-test state is unclear: {complete_state!r}")
    if mobile_overflow > 1:
        raise AssertionError(f"field-test mobile view overflows by {mobile_overflow}px")
    if payload.get("schema") != "outilsia.local_cockpit_field_tests.v1":
        raise AssertionError(f"unexpected schema: {payload.get('schema')}")
    if len(payload.get("machines") or []) != 1:
        raise AssertionError("single-machine field payload must contain exactly one machine")
    try:
        datetime.fromisoformat(str(entry.get("tested_at") or "").replace("Z", "+00:00"))
    except ValueError:
        raise AssertionError(f"field test entry must contain its test timestamp: {entry.get('tested_at')!r}")
    missing = sorted(REQUIRED_FIELDS - set(entry.keys()))
    if missing:
        raise AssertionError(f"missing field-test entry fields: {missing}")
    if entry.get("profile") not in {
        "old_laptop",
        "core_i7_gtx_1080_ti",
        "rtx_3060_12gb",
        "rtx_4080_4090",
        "cpu_only",
    }:
        raise AssertionError(f"unexpected field profile: {entry.get('profile')}")
    if entry.get("profile_source") not in {"auto", "manual"}:
        raise AssertionError(f"unexpected profile source: {entry.get('profile_source')}")
    if manual.get("profile") != "rtx_3060_12gb" or manual.get("profile_source") != "manual":
        raise AssertionError(f"manual profile override failed: {manual}")
    if not mismatched_profile_disabled:
        raise AssertionError("a profile incompatible with detected hardware must block field export")
    if entry.get("scan_ok") is not True:
        raise AssertionError("demo field entry should have scan_ok=true")
    if entry.get("hardware_doctor", {}).get("schema") != "outilsia.hardware_doctor.v2":
        raise AssertionError(f"Hardware Doctor v2 missing from field entry: {entry.get('hardware_doctor')}")
    if entry.get("benchmark_runtime_processor") != "gpu":
        raise AssertionError(f"runtime processor proof missing: {entry.get('benchmark_runtime_processor')}")
    if float(entry.get("benchmark_gpu_offload_percent") or 0) < 95:
        raise AssertionError(f"GPU offload proof missing: {entry.get('benchmark_gpu_offload_percent')}")
    if entry.get("benchmark_runtime_evidence_source") != "ollama_api_ps":
        raise AssertionError(f"runtime source proof missing: {entry.get('benchmark_runtime_evidence_source')}")
    if entry.get("promptforge_ok") is not True or entry.get("dialogue_ok") is not True or entry.get("arena_ok") is not True:
        raise AssertionError(f"demo field entry should prove prompt/dialogue/arena: {entry}")
    if not entry.get("benchmark_model") or float(entry.get("benchmark_tokens_per_second") or 0) <= 0:
        raise AssertionError(f"demo benchmark evidence missing: {entry}")
    if "Runtime" not in panel_text or "Profil exporté" not in panel_text or "Les sept contrôles sont validés" not in panel_text:
        raise AssertionError(f"field test panel text incomplete: {panel_text[:300]}")

    print(
        "field_test_entry_ok "
        f"profile={entry.get('profile')} "
        f"model={entry.get('recommended_model')} "
        f"benchmark={entry.get('benchmark_model')} "
        f"tps={entry.get('benchmark_tokens_per_second')} "
        f"screenshots={OUT / 'field-test-incomplete-desktop.png'},{OUT / 'field-test-complete-desktop.png'},{OUT / 'field-test-complete-mobile.png'}"
    )


if __name__ == "__main__":
    main()
