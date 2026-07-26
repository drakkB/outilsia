#!/usr/bin/env python3
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(HTML.as_uri(), wait_until="load")
        page.wait_for_timeout(200)
        page.evaluate("() => localStorage.clear()")

        initial = page.evaluate("() => window.__OUTILSIA_TEST__.resetActivationFunnel()")
        if initial["completed"] or any(
            item["reached"] for item in initial["milestones"].values()
        ):
            raise AssertionError(f"new activation funnel is not empty: {initial}")

        first_scan = "2026-07-26T10:00:00.000Z"
        page.evaluate(
            "(value) => window.__OUTILSIA_TEST__.recordActivationMilestone('scan_success', value)",
            first_scan,
        )
        page.evaluate(
            "() => window.__OUTILSIA_TEST__.recordActivationMilestone('scan_success', '2026-07-26T10:05:00.000Z')"
        )
        page.evaluate(
            "() => window.__OUTILSIA_TEST__.recordActivationMilestone('recommended_model_ready', '2026-07-26T10:02:00.000Z')"
        )
        complete = page.evaluate(
            "() => window.__OUTILSIA_TEST__.recordActivationMilestone('first_benchmark_success', '2026-07-26T10:03:00.000Z')"
        )

        if complete["milestones"]["scan_success"]["first_at"] != first_scan:
            raise AssertionError("activation timestamps must be first-write immutable")
        if not complete["completed"] or complete["scan_to_first_benchmark_ms"] != 180000:
            raise AssertionError(f"activation completion or elapsed time is wrong: {complete}")
        privacy = complete["privacy"]
        if privacy != {
            "local_only": True,
            "uploaded_automatically": False,
            "contains_prompt": False,
            "contains_model_output": False,
            "contains_machine_identifier": False,
            "contains_file_path": False,
        }:
            raise AssertionError(f"activation privacy contract changed: {privacy}")

        raw = page.evaluate(
            "() => localStorage.getItem('outilsia.localCockpit.activationFunnel.v1')"
        )
        for forbidden in [
            "NVIDIA",
            "Ryzen",
            "qwen",
            "Pourquoi la VRAM",
            "C:\\\\Users",
            "/home/",
        ]:
            if forbidden.casefold() in raw.casefold():
                raise AssertionError(f"activation storage contains forbidden content: {forbidden}")

        page.evaluate("() => window.__OUTILSIA_TEST__.applyFieldTestReadyState()")
        entry = page.evaluate("() => window.__OUTILSIA_TEST__.fieldTestEntry()")
        payload = page.evaluate("() => window.__OUTILSIA_TEST__.fieldTestPayload()")
        panel = page.locator("#fieldTestBox").inner_text(timeout=5000)
        browser.close()

    if entry.get("activation_funnel", {}).get("schema") != "outilsia.activation_funnel.v1":
        raise AssertionError("explicit field export does not contain the bounded activation snapshot")
    for key in ["app_version", "build_id", "release_channel", "source_commit"]:
        if key not in entry or key not in payload:
            raise AssertionError(f"field proof does not bind release identity: {key}")
    if "Activation locale" not in panel or "Aucune télémétrie" not in panel:
        raise AssertionError(f"field UI does not explain local activation evidence: {panel[:500]}")
    json.dumps(entry["activation_funnel"])
    print(
        "activation_funnel_ok "
        f"build={complete['build'].get('build_id')} "
        f"elapsed_ms={complete['scan_to_first_benchmark_ms']} "
        "local_only=true"
    )


if __name__ == "__main__":
    main()
