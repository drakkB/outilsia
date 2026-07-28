#!/usr/bin/env python3
"""Black-box recipe for the native OutilsIA Local MCP bridge.

The script attaches to an already running Tauri WebView2 instance through CDP,
uses the visible UI to scan the machine, generate the Capability Passport and
start the bridge, then exercises the MCP endpoint from an independent HTTP
client. The ephemeral token is never written to the report.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARTIFACT_DIR = ROOT / ".artifacts" / "native-local-mcp"
EXPECTED_TOOLS = [
    "outilsia_get_cockpit_status",
    "outilsia_get_machine_profile",
    "outilsia_get_hardware_doctor",
    "outilsia_list_installed_models",
    "outilsia_get_model_recommendation",
    "outilsia_get_benchmark_proofs",
    "outilsia_get_capability_passport",
    "outilsia_get_strategy_arena_handoff",
]
EXPECTED_RESOURCES = [
    "outilsia://passport/current",
    "outilsia://models/installed",
    "outilsia://recommendation/current",
    "outilsia://strategy-arena/handoff",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def clipboard_text() -> str:
    command = [
        "powershell.exe",
        "-NoProfile",
        "-Command",
        "[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); Get-Clipboard -Raw",
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True, encoding="utf-8")
    return result.stdout.strip()


def clear_clipboard() -> None:
    subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-Command",
            "[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); Set-Clipboard -Value ''",
        ],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def http_json(
    url: str,
    *,
    method: str = "GET",
    token: str | None = None,
    payload: dict[str, Any] | None = None,
    timeout: float = 8.0,
    attempts: int = 3,
) -> tuple[int, Any]:
    body = None
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=body, headers=headers, method=method)
    last_error: OSError | None = None
    for attempt in range(max(1, attempts)):
        try:
            with urlopen(request, timeout=timeout) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None
        except HTTPError as error:
            raw = error.read()
            parsed = json.loads(raw) if raw else None
            return error.code, parsed
        except (ConnectionResetError, URLError) as error:
            last_error = error
            if attempt + 1 >= max(1, attempts):
                raise
            time.sleep(0.12 * (attempt + 1))
    raise last_error or OSError("HTTP request failed")


class McpClient:
    def __init__(self, url: str, token: str) -> None:
        self.url = url
        self.token = token
        self.next_id = 1

    def request(
        self,
        method: str,
        params: dict[str, Any] | None = None,
        *,
        attempts: int = 3,
    ) -> dict[str, Any]:
        request_id = self.next_id
        self.next_id += 1
        message: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
        }
        if params is not None:
            message["params"] = params
        status, response = http_json(
            self.url,
            method="POST",
            token=self.token,
            payload=message,
            attempts=attempts,
        )
        assert status == 200, f"{method}: HTTP {status}: {response}"
        assert isinstance(response, dict), f"{method}: invalid JSON-RPC response"
        assert response.get("jsonrpc") == "2.0", f"{method}: JSON-RPC version"
        assert response.get("id") == request_id, f"{method}: response id"
        return response

    def result(
        self,
        method: str,
        params: dict[str, Any] | None = None,
        *,
        attempts: int = 3,
    ) -> Any:
        response = self.request(method, params, attempts=attempts)
        assert "error" not in response, f"{method}: {response.get('error')}"
        return response["result"]


def find_outilsia_page(browser: Any) -> Page:
    pages = [page for context in browser.contexts for page in context.pages]
    for page in pages:
        if "OutilsIA Local Cockpit" in page.title():
            return page
    visible = [(page.title(), page.url) for page in pages]
    raise AssertionError(f"OutilsIA WebView not found through CDP: {visible}")


def wait_for_scan(page: Page, timeout_ms: int) -> dict[str, str]:
    page.locator("#prepareBtn").wait_for(state="visible", timeout=timeout_ms)
    if page.locator("#prepareBtn").is_disabled():
        page.wait_for_function(
            "() => !document.getElementById('prepareBtn').disabled",
            timeout=timeout_ms,
        )
    page.locator("#prepareBtn").click()
    page.wait_for_function(
        """() => {
          const button = document.getElementById('prepareBtn');
          const cpu = document.getElementById('topCpuText')?.textContent?.trim();
          const gpu = document.getElementById('topGpuText')?.textContent?.trim();
          return button && !button.disabled && cpu && cpu !== '--' && gpu && gpu !== '--';
        }""",
        timeout=timeout_ms,
    )
    machine = {
        "key": page.locator("#topMachineKey").inner_text().strip(),
        "cpu": page.locator("#topCpuText").inner_text().strip(),
        "ram": page.locator("#topRamText").inner_text().strip(),
        "gpu": page.locator("#topGpuText").inner_text().strip(),
        "vram": page.locator("#topVramText").inner_text().strip(),
        "os": page.locator("#topOsText").inner_text().strip(),
        "runtime": page.locator("#topOllamaText").inner_text().strip(),
    }
    assert all(value and value != "--" for value in machine.values()), machine
    return machine


def open_workflow_section(page: Page, selector: str) -> None:
    page.locator("#workspaceWorkflowsBtn").click()
    page.locator("#workspaceSectionSelect").select_option(selector)
    page.locator(selector).wait_for(state="visible")


def start_bridge_from_ui(page: Page, timeout_ms: int) -> dict[str, Any]:
    open_workflow_section(page, ".capability-passport-panel")
    passport_button = page.locator("#generateCapabilityPassportBtn")
    passport_button.wait_for(state="visible")
    assert not passport_button.is_disabled(), "Capability Passport remains disabled after scan"
    passport_button.click()
    page.wait_for_function(
        "() => document.getElementById('capabilityPassportState')?.textContent?.includes('cohérence vérifiée')",
        timeout=timeout_ms,
    )

    open_workflow_section(page, ".local-capability-bridge-panel")
    start_button = page.locator("#startLocalCapabilityBridgeBtn")
    start_button.wait_for(state="visible")
    assert not start_button.is_disabled(), "Local MCP start remains disabled after Passport"
    page.once("dialog", lambda dialog: dialog.accept())
    start_button.click()
    page.wait_for_function(
        "() => document.getElementById('localCapabilityBridgeState')?.textContent?.startsWith('active')",
        timeout=timeout_ms,
    )

    copy_button = page.locator("#copyLocalCapabilityBridgeBtn")
    assert not copy_button.is_disabled(), "MCP pairing copy remains disabled"
    advanced = page.locator(".local-bridge-advanced")
    if not advanced.evaluate("(element) => element.open"):
        advanced.locator("summary").click()
    copy_button.wait_for(state="visible")
    copy_button.click()
    page.wait_for_function(
        "() => document.getElementById('statusText')?.textContent?.includes('Connexion MCP copiée')",
        timeout=timeout_ms,
    )
    pairing = json.loads(clipboard_text())
    assert pairing["schema"] == "outilsia.local_capability_bridge_connection.v1"
    assert pairing["permissions"]["read_only"] is True
    assert pairing["permissions"]["model_management"] is False
    assert pairing["permissions"]["benchmark_execution"] is False
    assert pairing["permissions"]["file_access"] is False
    assert pairing["permissions"]["backtests"] is False
    return pairing


def exercise_mcp(pairing: dict[str, Any]) -> dict[str, Any]:
    mcp_url = pairing["mcp"]["url"]
    base_url = pairing["base_url"]
    token = pairing["authorization"]["token"]
    assert mcp_url.startswith("http://127.0.0.1:")
    assert mcp_url.endswith("/mcp")
    assert len(token) == 64

    ready_deadline = time.monotonic() + 5
    while True:
        try:
            status, health = http_json(
                f"{base_url}/v1/health",
                timeout=0.75,
                attempts=1,
            )
            if status == 200 and health.get("status") == "ready":
                break
        except (ConnectionResetError, URLError):
            pass
        if time.monotonic() >= ready_deadline:
            raise AssertionError("Local MCP health endpoint did not become ready")
        time.sleep(0.1)

    client = McpClient(mcp_url, token)
    initialize = client.result(
        "initialize",
        {
            "protocolVersion": "2025-11-25",
            "capabilities": {},
            "clientInfo": {"name": "OutilsIA native E2E", "version": "1.0.0"},
        },
    )
    assert initialize["protocolVersion"] == "2025-11-25"
    assert initialize["serverInfo"] == {"name": "OutilsIA Local Cockpit", "version": "0.1.0"}
    assert "lecture seule" in initialize["instructions"]

    strict_ping_count = 32
    for _ in range(strict_ping_count):
        assert client.result("ping", attempts=1) == {}

    tools_result = client.result("tools/list")
    tools = tools_result["tools"]
    tool_names = [tool["name"] for tool in tools]
    assert tool_names == EXPECTED_TOOLS
    for tool in tools:
        assert tool["inputSchema"]["additionalProperties"] is False
        assert tool["annotations"] == {
            "title": tool["title"],
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": False,
        }

    tool_schemas: dict[str, str] = {}
    tool_payloads: dict[str, Any] = {}
    for name in EXPECTED_TOOLS:
        result = client.result("tools/call", {"name": name, "arguments": {}})
        assert result["isError"] is False
        structured = result["structuredContent"]
        assert isinstance(structured, dict)
        assert result["content"][0]["type"] == "text"
        assert json.loads(result["content"][0]["text"]) == structured
        tool_payloads[name] = structured
        tool_schemas[name] = str(structured.get("schema", ""))

    machine = tool_payloads["outilsia_get_machine_profile"]["machine"]
    assert machine.get("cpu") or machine.get("cpu_name"), machine
    assert machine.get("gpu") or machine.get("gpu_name"), machine
    installed = tool_payloads["outilsia_list_installed_models"]
    proof = tool_payloads["outilsia_get_benchmark_proofs"]
    passport = tool_payloads["outilsia_get_capability_passport"]
    assert installed["count"] == len(installed["installed_models"])
    assert proof["count"] == len(proof["benchmark_proofs"])
    assert proof["raw_prompts_included"] is False
    assert proof["raw_model_outputs_included"] is False
    assert passport["schema"] == "outilsia.ai_capability_passport.v1"
    assert len(passport["integrity"]["digest"]) == 64

    resources_result = client.result("resources/list")
    resources = resources_result["resources"]
    resource_uris = [resource["uri"] for resource in resources]
    assert resource_uris == EXPECTED_RESOURCES
    resource_sizes: dict[str, int] = {}
    for uri in EXPECTED_RESOURCES:
        result = client.result("resources/read", {"uri": uri})
        content = result["contents"][0]
        assert content["uri"] == uri
        assert content["mimeType"] == "application/json"
        parsed = json.loads(content["text"])
        assert isinstance(parsed, dict)
        resource_sizes[uri] = len(content["text"].encode("utf-8"))

    invalid_action = client.request(
        "tools/call",
        {"name": "install_ollama_model", "arguments": {}},
    )
    assert invalid_action["error"]["code"] == -32602
    assert "Unknown read-only tool" in invalid_action["error"]["message"]

    install_attempt_with_arguments = client.request(
        "tools/call",
        {"name": "install_ollama_model", "arguments": {"model": "qwen3:8b"}},
    )
    assert install_attempt_with_arguments["error"]["code"] == -32602
    assert "accepts no arguments" in install_attempt_with_arguments["error"]["message"]

    invalid_arguments = client.request(
        "tools/call",
        {"name": "outilsia_get_machine_profile", "arguments": {"scan": True}},
    )
    assert invalid_arguments["error"]["code"] == -32602
    assert "accepts no arguments" in invalid_arguments["error"]["message"]

    status, body = http_json(
        mcp_url,
        method="POST",
        payload={"jsonrpc": "2.0", "id": 99, "method": "tools/list"},
    )
    assert status == 401 and body == {"error": "bearer_token_required"}

    status, body = http_json(
        f"{mcp_url}?token={token}",
        method="POST",
        token=token,
        payload={"jsonrpc": "2.0", "id": 100, "method": "tools/list"},
    )
    assert status == 400 and body == {"error": "query_parameters_forbidden"}

    status, body = http_json(mcp_url, method="GET", token=token)
    assert status == 405 and body == {"error": "streamable_http_post_required"}

    status, body = http_json(f"{base_url}/v1/models", method="POST", token=token, payload={})
    assert status == 405 and body == {"error": "read_only_get_required"}

    status, health = http_json(f"{base_url}/v1/health")
    assert status == 200
    assert health["status"] == "ready" and health["read_only"] is True

    status, capabilities = http_json(f"{base_url}/v1/capabilities", token=token)
    assert status == 200
    serialized = json.dumps(capabilities, ensure_ascii=False)
    assert token not in serialized
    assert capabilities["privacy"]["raw_prompts_included"] is False
    assert capabilities["privacy"]["raw_model_outputs_included"] is False
    assert capabilities["privacy"]["account_tokens_included"] is False
    assert "authorization" not in serialized.lower()

    return {
        "server_name": initialize["serverInfo"]["name"],
        "server_version": initialize["serverInfo"]["version"],
        "protocol_version": initialize["protocolVersion"],
        "strict_ping_count": strict_ping_count,
        "tool_count": len(tools),
        "tool_schemas": tool_schemas,
        "resource_count": len(resources),
        "resource_sizes_bytes": resource_sizes,
        "installed_model_count": installed["count"],
        "benchmark_proof_count": proof["count"],
        "passport_digest_prefix": passport["integrity"]["digest"][:16],
        "security_checks": {
            "missing_token_rejected": True,
            "query_token_rejected": True,
            "get_mcp_rejected": True,
            "write_endpoint_rejected": True,
            "unknown_action_rejected": True,
            "install_arguments_rejected": True,
            "tool_arguments_rejected": True,
            "snapshot_has_no_token": True,
        },
    }


def stop_bridge_from_ui(page: Page, base_url: str | None) -> None:
    try:
        open_workflow_section(page, ".local-capability-bridge-panel")
        stop_button = page.locator("#stopLocalCapabilityBridgeBtn")
        if stop_button.is_visible() and not stop_button.is_disabled():
            stop_button.click()
            page.wait_for_function(
                "() => document.getElementById('localCapabilityBridgeState')?.textContent === 'désactivée'",
                timeout=10_000,
            )
    finally:
        clear_clipboard()

    if not base_url:
        return
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        try:
            http_json(f"{base_url}/v1/health", timeout=0.5, attempts=1)
        except (URLError, TimeoutError, ConnectionError):
            return
        time.sleep(0.1)
    raise AssertionError("Local MCP endpoint still responds after explicit stop")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cdp-url", default="http://[::1]:9333")
    parser.add_argument("--timeout-seconds", type=int, default=90)
    parser.add_argument("--artifact-dir", type=Path, default=DEFAULT_ARTIFACT_DIR)
    parser.add_argument("--stop-only", action="store_true")
    args = parser.parse_args()

    timeout_ms = args.timeout_seconds * 1000
    args.artifact_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.artifact_dir / "native-local-mcp-e2e.json"
    screenshot_path = args.artifact_dir / "native-local-mcp-panel.png"
    report: dict[str, Any] = {
        "schema": "outilsia.native_local_mcp_e2e.v1",
        "started_at": utc_now(),
        "status": "failed",
        "cdp_url": args.cdp_url,
    }
    page: Page | None = None
    base_url: str | None = None
    pending_error: BaseException | None = None

    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.connect_over_cdp(args.cdp_url)
            page = find_outilsia_page(browser)
            page.set_default_timeout(timeout_ms)
            page.bring_to_front()
            if args.stop_only:
                stop_bridge_from_ui(page, None)
                report.update({"status": "passed", "completed_at": utc_now(), "stopped_only": True})
            else:
                machine = wait_for_scan(page, timeout_ms)
                pairing = start_bridge_from_ui(page, timeout_ms)
                base_url = pairing["base_url"]
                mcp_result = exercise_mcp(pairing)
                page.locator(".local-capability-bridge-panel").screenshot(path=str(screenshot_path))
                stop_bridge_from_ui(page, base_url)
                base_url = None

                report.update(
                    {
                        "status": "passed",
                        "completed_at": utc_now(),
                        "machine": machine,
                        "bridge": {
                            "bind": "127.0.0.1",
                            "ttl_seconds": 900,
                            "token_persisted": False,
                            "token_recorded": False,
                        },
                        "mcp": mcp_result,
                        "artifacts": {
                            "screenshot": str(screenshot_path),
                            "report": str(report_path),
                        },
                    }
                )
        except (AssertionError, PlaywrightTimeoutError, OSError, ValueError) as error:
            report["completed_at"] = utc_now()
            report["error"] = f"{type(error).__name__}: {error}"
            pending_error = error
        finally:
            try:
                if page is not None and not args.stop_only:
                    stop_bridge_from_ui(page, base_url)
            except Exception as cleanup_error:  # noqa: BLE001
                report["cleanup_error"] = f"{type(cleanup_error).__name__}: {cleanup_error}"
            clear_clipboard()

    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if pending_error is not None:
        raise pending_error

    if args.stop_only:
        print(f"native_local_mcp_stop_ok report={report_path}")
        return 0

    print(
        "native_local_mcp_e2e_ok "
        f"tools={report['mcp']['tool_count']} "
        f"resources={report['mcp']['resource_count']} "
        f"models={report['mcp']['installed_model_count']} "
        f"proofs={report['mcp']['benchmark_proof_count']} "
        f"report={report_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
