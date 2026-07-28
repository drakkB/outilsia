#!/usr/bin/env python3
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
APP_JS = ROOT / "src" / "app.js"
RUST = ROOT / "src-tauri" / "src" / "local_action_lane.rs"
LIB_RS = ROOT / "src-tauri" / "src" / "lib.rs"
READ_ONLY_RUST = ROOT / "src-tauri" / "src" / "local_capability_bridge.rs"
EXTERNAL_PROBE = ROOT / "scripts" / "probe-local-action-lane.py"
OUT = ROOT / ".artifacts" / "visual-ui"
OUT.mkdir(parents=True, exist_ok=True)


def assert_static_contract() -> None:
    app_js = APP_JS.read_text(encoding="utf-8")
    rust = RUST.read_text(encoding="utf-8")
    lib_rs = LIB_RS.read_text(encoding="utf-8")
    read_only = READ_ONLY_RUST.read_text(encoding="utf-8")
    external_probe = EXTERNAL_PROBE.read_text(encoding="utf-8")
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
        'ACTION_LANE_CONTRACT_VERSION: &str = "2026-07-28-native-consent-v1"',
        "NativeActionConfirmationKind",
        '"os_native_dialog"',
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
        'invoke("request_native_local_action_approval"',
        'invoke("request_native_local_action_execution"',
        'invoke("request_native_local_action_rejection"',
        "boîte de dialogue du système",
        "Aucun script de cette page ne peut fournir la décision",
        "Une seconde boîte de dialogue système est obligatoire",
    ]:
        if expected not in app_js:
            raise AssertionError(f"missing native consent guard: {expected}")

    for forbidden in [
        'invoke("approve_local_action_request"',
        'invoke("execute_local_action_request"',
        'invoke("reject_local_action_request"',
        "human_acknowledged",
        "data-local-action-ack=",
    ]:
        if forbidden in app_js or forbidden in rust:
            raise AssertionError(f"scriptable consent path remains: {forbidden}")

    for expected in [
        ".plugin(tauri_plugin_dialog::init())",
        "show_native_action_confirmation",
        "MessageDialogButtons::OkCancelCustom",
        "blocking_show()",
        "NativeActionConfirmationKind::Approval",
        "NativeActionConfirmationKind::Execution",
        "NativeActionConfirmationKind::Rejection",
    ]:
        if expected not in lib_rs:
            raise AssertionError(f"missing OS-native Rust confirmation: {expected}")
    approval_body = app_js[
        app_js.index("async function approveLocalActionRequest"):
        app_js.index("async function rejectLocalActionRequest")
    ]
    execution_body = app_js[
        app_js.index("async function executeLocalActionRequest"):
        app_js.index("function boardObserverMissingLabel")
    ]
    if "window.confirm" in approval_body or "window.confirm" in execution_body:
        raise AssertionError("Action Lane approval/execution still trusts a webview dialog")
    prepare_body = rust[
        rust.index("fn prepare_action("):
        rust.index("fn reject_unknown_arguments")
    ]
    for forbidden in [
        "local_action_install_preflight",
        "local_action_model_is_installed",
        "Command::new",
        ".output()",
    ]:
        if forbidden in prepare_body:
            raise AssertionError(
                f"Action Lane MCP preparation still launches a live probe: {forbidden}"
            )
    for expected in [
        '"live_probes_run_during_prepare": false',
        '"native_preflight_required_before_execution": true',
        '"native_installed_check_required_before_execution": true',
    ]:
        if expected not in prepare_body:
            raise AssertionError(f"missing frozen preparation boundary: {expected}")

    for expected in [
        'TOKEN_ENV = "OUTILSIA_LOCAL_ACTION_TOKEN"',
        '"outilsia_prepare_report_export"',
        '"outilsia_cancel_action_request"',
        '"outilsia_execute_action"',
        "requests_distinct",
        "actions_started",
        "token_leaked",
        "clear_clipboard()",
    ]:
        if expected not in external_probe:
            raise AssertionError(f"missing external Action Lane probe guard: {expected}")
    if "--token" in external_probe:
        raise AssertionError("the external Action Lane probe must never accept a token argument")


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
    if approve_button.is_disabled():
        raise AssertionError(f"{label}: native authorization button is disabled")
    if awaiting.locator("[data-local-action-execute]").count() != 0:
        raise AssertionError(f"{label}: awaiting request can execute")
    if approved.locator('[data-local-action-execute="larq-benchmark-ui"]').count() != 1:
        raise AssertionError(f"{label}: approved request lacks separate execute gesture")
    if panel.locator("[data-local-action-ack]").count() != 0:
        raise AssertionError(f"{label}: obsolete scriptable acknowledgement remains")
    if completed.locator("button").count() != 0:
        raise AssertionError(f"{label}: completed request remains actionable")

    for expected in [
        "aucune sonde ni exécution pendant la préparation",
        "peut préparer des demandes",
        "Installer un modèle Ollama",
        "Benchmarker un modèle installé",
        "Exporter le rapport figé",
        "Plan SHA-256",
        "Vérifier et autoriser",
        "Confirmer l'exécution",
        "boîte de dialogue du système",
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
        "tools=5 approval=os_native_dialog execution=os_native_dialog token_leak=false"
    )


if __name__ == "__main__":
    main()
