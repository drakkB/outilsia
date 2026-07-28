#!/usr/bin/env python3
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
APP_JS = ROOT / "src" / "app.js"
RUST = ROOT / "src-tauri" / "src" / "local_action_lane.rs"
READ_ONLY_RUST = ROOT / "src-tauri" / "src" / "local_capability_bridge.rs"
OUT = ROOT / ".artifacts" / "visual-ui"
OUT.mkdir(parents=True, exist_ok=True)


def assert_static_contract() -> None:
    app_js = APP_JS.read_text(encoding="utf-8")
    rust = RUST.read_text(encoding="utf-8")
    read_only = READ_ONLY_RUST.read_text(encoding="utf-8")
    exposed_tools_match = re.search(
        r"const ACTION_TOOL_NAMES:\s*\[&str;\s*5\]\s*=\s*\[(.*?)\];",
        rust,
        re.DOTALL,
    )
    if not exposed_tools_match:
        raise AssertionError("Action Lane tool exposure table is missing")
    exposed_tools = exposed_tools_match.group(1)

    for expected in [
        'pub(crate) const ACTION_LANE_SCHEMA: &str = "outilsia.local_action_lane.v0"',
        '"outilsia_prepare_model_install"',
        '"outilsia_prepare_benchmark"',
        '"outilsia_prepare_report_export"',
        '"outilsia_get_action_request"',
        '"outilsia_cancel_action_request"',
        "CAPABILITY_TTL_MS: u128 = 2 * 60 * 1000",
        "actions_execute_over_mcp: false",
        "queue_persisted: false",
        "token_persisted: false",
    ]:
        if expected not in rust:
            raise AssertionError(f"missing Rust Action Lane contract: {expected}")

    for forbidden in [
        '"outilsia_execute_action"',
        '"outilsia_approve_action"',
        '"outilsia_run_shell"',
    ]:
        if forbidden in exposed_tools:
            raise AssertionError(f"forbidden MCP tool exposed: {forbidden}")
        if forbidden in read_only:
            raise AssertionError(f"read-only MCP widened: {forbidden}")

    for expected in [
        'invoke("approve_local_action_request"',
        'invoke("execute_local_action_request"',
        'invoke("reject_local_action_request"',
        'data-local-action-ack=',
        "client IA ne peut pas cocher cette case",
        "Cette capacité sera consommée immédiatement",
    ]:
        if expected not in app_js:
            raise AssertionError(f"missing native consent guard: {expected}")


def verify_viewport(browser, width: int, height: int, label: str) -> Path:
    context = browser.new_context(viewport={"width": width, "height": height})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(HTML.as_uri(), wait_until="load")
    page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceTab('workflows')")
    page.evaluate(
        "() => window.__OUTILSIA_TEST__.setWorkspaceSection("
        "'workflows', '.local-action-lane-panel')"
    )
    proof = page.evaluate("() => window.__OUTILSIA_TEST__.applyLocalActionLaneState()")
    page.evaluate(
        "() => window.__OUTILSIA_TEST__.setWorkspaceSection("
        "'workflows', '.local-action-lane-panel')"
    )

    panel = page.locator(".local-action-lane-panel")
    panel.scroll_into_view_if_needed()
    state_text = page.locator("#localActionLaneState").inner_text()
    queue_text = page.locator("#localActionQueue").inner_text()
    panel_text = panel.inner_text()
    token = proof["token"]
    serialized = json.dumps(
        {
            "runtime": proof["runtime"],
            "requests": proof["requests"],
            "config": proof["config"],
            "panel": proof["panel"],
            "queue": proof["queue"],
        },
        ensure_ascii=False,
    )

    if not state_text.startswith("active"):
        raise AssertionError(f"{label}: Action Lane is not active: {state_text!r}")
    if len(proof["requests"]) != 3:
        raise AssertionError(f"{label}: expected three lifecycle fixtures")
    if proof["runtime"]["actions_execute_over_mcp"] is not False:
        raise AssertionError(f"{label}: MCP execution boundary is false")
    if proof["runtime"]["queue_persisted"] is not False:
        raise AssertionError(f"{label}: queue persistence boundary is false")
    if len(proof["runtime"]["mcp_tools"]) != 5:
        raise AssertionError(f"{label}: wrong MCP tool count")
    if any("execute" in tool or "approve" in tool for tool in proof["runtime"]["mcp_tools"]):
        raise AssertionError(f"{label}: approval/execution leaked into MCP tools")
    if any(
        any(value is not False for value in request["privacy"].values())
        for request in proof["requests"]
    ):
        raise AssertionError(f"{label}: a request view exposes private action material")
    if token in serialized or token in panel_text or token in queue_text:
        raise AssertionError(f"{label}: ephemeral token leaked outside token control")
    if "OUTILSIA_LOCAL_ACTION_TOKEN" not in proof["config"]:
        raise AssertionError(f"{label}: client config does not use an environment token")
    if "Bearer action-lane-test" in proof["config"]:
        raise AssertionError(f"{label}: client config embeds the secret")

    awaiting = page.locator('[data-local-action-request="larq-install-ui"]')
    approved = page.locator('[data-local-action-request="larq-benchmark-ui"]')
    completed = page.locator('[data-local-action-request="larq-export-ui"]')
    if awaiting.count() != 1 or approved.count() != 1 or completed.count() != 1:
        raise AssertionError(f"{label}: lifecycle cards are incomplete")

    approve_button = awaiting.locator('[data-local-action-approve="larq-install-ui"]')
    acknowledgement = awaiting.locator('[data-local-action-ack="larq-install-ui"]')
    if not approve_button.is_disabled():
        raise AssertionError(f"{label}: approval is enabled without native acknowledgement")
    if awaiting.locator("[data-local-action-execute]").count() != 0:
        raise AssertionError(f"{label}: awaiting request can execute")
    acknowledgement.check()
    if approve_button.is_disabled():
        raise AssertionError(f"{label}: explicit acknowledgement does not unlock approval")
    if approved.locator('[data-local-action-execute="larq-benchmark-ui"]').count() != 1:
        raise AssertionError(f"{label}: approved request lacks separate execute gesture")
    if approved.locator("[data-local-action-ack]").count() != 0:
        raise AssertionError(f"{label}: approved request still exposes approval checkbox")
    if completed.locator("button").count() != 0:
        raise AssertionError(f"{label}: completed request remains actionable")

    for expected in [
        "aucun outil d'exécution",
        "peut préparer des demandes",
        "Installer un modèle Ollama",
        "Benchmarker un modèle installé",
        "Exporter le rapport figé",
        "Plan SHA-256",
        "Autoriser 2 min",
        "Exécuter maintenant",
        "4821 octets écrits",
    ]:
        if expected not in panel_text:
            raise AssertionError(f"{label}: missing UI evidence {expected!r}")
    for forbidden in [
        "C:\\Users\\",
        "/home/",
        "raw model output",
        "rapport très secret",
    ]:
        if forbidden in panel_text or forbidden in serialized:
            raise AssertionError(f"{label}: private value rendered {forbidden!r}")

    overflow = page.evaluate(
        """() => ({
          viewport: innerWidth,
          body: document.body.scrollWidth,
          doc: document.documentElement.scrollWidth,
          panel: document.querySelector('.local-action-lane-panel').scrollWidth,
          panelClient: document.querySelector('.local-action-lane-panel').clientWidth
        })"""
    )
    if max(overflow["body"], overflow["doc"]) > overflow["viewport"] + 2:
        raise AssertionError(f"{label}: horizontal page overflow {overflow}")
    if overflow["panel"] > overflow["panelClient"] + 2:
        raise AssertionError(f"{label}: horizontal panel overflow {overflow}")
    if errors:
        raise AssertionError(f"{label}: page errors {errors}")

    screenshot = OUT / f"local-action-lane-{label}.png"
    panel.screenshot(path=str(screenshot))
    invalidated = page.evaluate(
        "() => window.__OUTILSIA_TEST__.invalidateLocalActionLaneState()"
    )
    if (
        invalidated["running"]
        or invalidated["hasRuntime"]
        or invalidated["requestCount"] != 0
    ):
        raise AssertionError(f"{label}: Passport invalidation did not revoke the lane")
    if token in invalidated["panel"] or token in invalidated["queue"]:
        raise AssertionError(f"{label}: revoked UI retains the token")
    context.close()
    return screenshot


def main() -> None:
    assert_static_contract()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        desktop = verify_viewport(browser, 1440, 1000, "desktop")
        mobile = verify_viewport(browser, 390, 920, "mobile")
        browser.close()
    print(
        "local_action_lane_ui_ok "
        f"desktop={desktop} mobile={mobile} "
        "tools=5 approval=native execution=native token_leak=false"
    )


if __name__ == "__main__":
    main()
