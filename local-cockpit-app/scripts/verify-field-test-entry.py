#!/usr/bin/env python3
from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"


REQUIRED_FIELDS = {
    "profile",
    "profile_source",
    "profile_inferred",
    "machine_label",
    "os",
    "cpu",
    "gpu",
    "ram_gb",
    "vram_gb",
    "scan_ok",
    "score",
    "score_label",
    "recommended_model",
    "first_action",
    "upgrade_recommendation",
    "benchmark_model",
    "benchmark_tokens_per_second",
    "benchmark_elapsed_ms",
    "promptforge_ok",
    "dialogue_ok",
    "arena_ok",
    "report_ok",
}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(HTML.as_uri(), wait_until="load")
        page.evaluate("""() => localStorage.clear()""")
        page.evaluate("""() => window.__OUTILSIA_TEST__.setViewMode('advanced')""")
        disabled_before = page.locator("#copyFieldTestJsonBtn").is_disabled(timeout=5000)
        page.evaluate("""() => window.__OUTILSIA_TEST__.applyDemoState()""")
        entry = page.evaluate("""() => window.__OUTILSIA_TEST__.fieldTestEntry()""")
        payload = page.evaluate("""() => window.__OUTILSIA_TEST__.fieldTestPayload()""")
        manual = page.evaluate("""() => {
            window.__OUTILSIA_TEST__.setFieldTestProfile('rtx_3060_12gb');
            return window.__OUTILSIA_TEST__.fieldTestEntry();
        }""")
        disabled_after = page.locator("#copyFieldTestJsonBtn").is_disabled(timeout=5000)
        panel_text = page.locator("#fieldTestBox").inner_text(timeout=5000)
        browser.close()

    if not disabled_before:
        raise AssertionError("field test JSON copy must be disabled before scan")
    if disabled_after:
        raise AssertionError("field test JSON copy must be enabled after scan")
    if payload.get("schema") != "outilsia.local_cockpit_field_tests.v1":
        raise AssertionError(f"unexpected schema: {payload.get('schema')}")
    if len(payload.get("machines") or []) != 1:
        raise AssertionError("single-machine field payload must contain exactly one machine")
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
    if entry.get("scan_ok") is not True:
        raise AssertionError("demo field entry should have scan_ok=true")
    if entry.get("promptforge_ok") is not True or entry.get("dialogue_ok") is not True or entry.get("arena_ok") is not True:
        raise AssertionError(f"demo field entry should prove prompt/dialogue/arena: {entry}")
    if not entry.get("benchmark_model") or float(entry.get("benchmark_tokens_per_second") or 0) <= 0:
        raise AssertionError(f"demo benchmark evidence missing: {entry}")
    if "Runtime" not in panel_text or "Profil exporté" not in panel_text:
        raise AssertionError(f"field test panel text incomplete: {panel_text[:300]}")

    print(
        "field_test_entry_ok "
        f"profile={entry.get('profile')} "
        f"model={entry.get('recommended_model')} "
        f"benchmark={entry.get('benchmark_model')} "
        f"tps={entry.get('benchmark_tokens_per_second')}"
    )


if __name__ == "__main__":
    main()
