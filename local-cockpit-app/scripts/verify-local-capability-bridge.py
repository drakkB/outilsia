#!/usr/bin/env python3
import json
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
        page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceTab('workflows')")
        page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceSection('workflows', '.local-capability-bridge-panel')")
        result = page.evaluate("() => window.__OUTILSIA_TEST__.applyLocalCapabilityBridgeState()")
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        panel = page.locator(".local-capability-bridge-panel")
        panel.screenshot(path=str(ARTIFACTS / "local-capability-bridge-desktop.png"))
        copy_enabled = not page.locator("#copyLocalCapabilityBridgeBtn").is_disabled()
        client_config_enabled = not page.locator("#copyLocalCapabilityClientConfigBtn").is_disabled()
        token_copy_enabled = not page.locator("#copyLocalCapabilityTokenBtn").is_disabled()
        state_text = page.locator("#localCapabilityBridgeState").inner_text()
        page.set_viewport_size({"width": 390, "height": 844})
        panel.screenshot(path=str(ARTIFACTS / "local-capability-bridge-mobile.png"))
        invalidated = page.evaluate("() => window.__OUTILSIA_TEST__.invalidateLocalCapabilityBridgeState()")
        browser.close()

    payload = result["payload"]
    pairing = result["pairing"]
    summary = result["summary"]
    passport = result["passport"]
    report = result["report"]
    strategy = result["bridge"]
    panel_text = result["panel"]
    codex_config = result["codexConfig"]
    claude_config = result["claudeConfig"]
    token = pairing["authorization"]["token"]

    assert payload["schema"] == "outilsia.local_capability_bridge.v1"
    assert payload["contract_version"] == "2026-07-27"
    assert payload["read_only"] is True
    assert payload["permissions"]["read_capabilities"] is True
    for key in [
        "install_models",
        "delete_models",
        "run_benchmark",
        "run_chat",
        "access_personal_files",
        "run_backtests",
        "execute_trades",
        "write_configuration",
    ]:
        assert payload["permissions"][key] is False, key
    assert payload["privacy"] == {
        "local_only": True,
        "ephemeral": True,
        "raw_prompts_included": False,
        "raw_model_outputs_included": False,
        "account_tokens_included": False,
        "token_persisted": False,
    }
    assert payload["mcp"] == {
        "read_only": True,
        "actions_exposed": False,
        "transport": "streamable_http",
        "protocol_version": "2025-11-25",
        "server_version": "0.1.0",
        "tools": [
            "outilsia_get_cockpit_status",
            "outilsia_get_machine_profile",
            "outilsia_get_hardware_doctor",
            "outilsia_list_installed_models",
            "outilsia_get_model_recommendation",
            "outilsia_get_benchmark_proofs",
            "outilsia_get_capability_passport",
            "outilsia_get_strategy_arena_handoff",
        ],
        "resources": [
            "outilsia://passport/current",
            "outilsia://models/installed",
            "outilsia://recommendation/current",
            "outilsia://strategy-arena/handoff",
        ],
    }
    assert payload["passport"]["integrity"]["digest"] == passport["integrity"]["digest"]
    assert payload["strategy_arena"]["read_only"] is True
    assert payload["strategy_arena"]["boundary"]["forbidden_in_outilsia"] == [
        "generation_strategie",
        "backtest_financier",
        "optimisation_quant",
        "export_pine",
    ]
    assert len(payload["installed_models"]) >= 2
    assert len(json.dumps(payload, ensure_ascii=False).encode("utf-8")) < 1024 * 1024

    assert pairing["schema"] == "outilsia.local_capability_bridge_connection.v1"
    assert pairing["base_url"] == "http://127.0.0.1:43127"
    assert pairing["authorization"]["scheme"] == "Bearer"
    assert token in pairing["authorization"]["header"]
    assert pairing["mcp"]["url"] == "http://127.0.0.1:43127/mcp"
    assert pairing["mcp"]["transport"] == "streamable_http"
    assert pairing["mcp"]["protocol_version"] == "2025-11-25"
    assert pairing["mcp"]["server_version"] == "0.1.0"
    assert len(pairing["mcp"]["tools"]) == 8
    assert pairing["mcp"]["headers"]["Authorization"].endswith(token)
    assert pairing["permissions"]["read_only"] is True
    assert pairing["permissions"]["model_management"] is False
    assert pairing["permissions"]["backtests"] is False

    assert summary["running"] is True
    assert summary["bind"] == "127.0.0.1"
    assert summary["mcp_url"] == "http://127.0.0.1:43127/mcp"
    assert summary["mcp_protocol_version"] == "2025-11-25"
    assert summary["mcp_server_version"] == "0.1.0"
    assert len(summary["mcp_tools"]) == 8
    assert summary["token_persisted"] is False
    assert summary["token_exposed_in_summary"] is False
    assert "token" not in summary
    assert token not in panel_text
    assert token not in json.dumps(payload, ensure_ascii=False)
    assert token not in json.dumps(report, ensure_ascii=False)
    assert token not in json.dumps(passport, ensure_ascii=False)
    assert token not in codex_config
    assert token not in claude_config
    assert "[mcp_servers.outilsia_local]" in codex_config
    assert 'bearer_token_env_var = "OUTILSIA_LOCAL_MCP_TOKEN"' in codex_config
    assert '"type": "http"' in claude_config
    assert "Bearer ${OUTILSIA_LOCAL_MCP_TOKEN}" in claude_config
    assert "Lecture seule" in panel_text
    assert "Aucune installation" in panel_text
    assert "Choisis Codex ou Claude Code" in panel_text
    assert state_text.startswith("active")
    assert copy_enabled is True
    assert client_config_enabled is True
    assert token_copy_enabled is True

    assert passport["document_kind"] == "capability_snapshot"
    assert passport["passport_version"] == "1.4.0"
    assert passport["assurance"]["level"] == "self_consistency_only"
    assert passport["assurance"]["rust_rederived"] is False
    assert passport["assurance"]["os_key_attested"] is False
    assert passport["assurance"]["provenance_verified"] is False
    assert passport["integrity"]["verification_semantics"] == "coherence_not_provenance"
    assert passport["capabilities"]["local_capability_bridge_v1"] is True
    assert passport["capabilities"]["local_mcp_read_only_v0_1"] is True
    interop = passport["interoperability"]["local_capability_bridge"]
    assert interop["enabled_by_default"] is False
    assert interop["bind"] == "127.0.0.1"
    assert interop["read_only"] is True
    assert interop["token_persisted"] is False
    assert report["local_capability_bridge"]["token_exposed_in_summary"] is False
    assert strategy["handoff_manifest"]["capabilities"]["expose_local_capability_bridge_read_only"] is True
    assert strategy["local_capability_bridge"]["token_exposed_in_summary"] is False
    assert invalidated["summary"]["running"] is False
    assert invalidated["hasRuntime"] is False
    assert token not in invalidated["panel"]
    assert "active sur" not in invalidated["panel"]

    print(
        "local_capability_bridge_ok "
        f"schema={payload['schema']} bind={summary['bind']} "
        f"models={len(payload['installed_models'])} passport={passport['passport_version']}"
    )


if __name__ == "__main__":
    main()
