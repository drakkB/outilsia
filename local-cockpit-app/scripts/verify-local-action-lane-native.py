#!/usr/bin/env python3
"""Native black-box recipe for OutilsIA Local Action Lane v0.

The script attaches to a running Tauri WebView2 through CDP. A separate HTTP
client prepares requests over MCP, while every approval, refusal and execution
is performed through the visible native UI. Tokens and report contents never
enter the persisted recipe report.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARTIFACT_DIR = ROOT / ".artifacts" / "native-local-action-lane"
EXPECTED_TOOLS = [
    "outilsia_prepare_model_install",
    "outilsia_prepare_benchmark",
    "outilsia_prepare_report_export",
    "outilsia_get_action_request",
    "outilsia_cancel_action_request",
]
PRIVATE_MARKERS = [
    "C:\\Users\\",
    "/home/",
    "authorization",
    "bearer ",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def clipboard_text() -> str:
    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-Command",
            "[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); Get-Clipboard -Raw",
        ],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
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
    last_error: BaseException | None = None
    for attempt in range(max(1, attempts)):
        request = Request(url, data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=timeout) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None
        except HTTPError as error:
            raw = error.read()
            return error.code, json.loads(raw) if raw else None
        except (ConnectionResetError, URLError, TimeoutError) as error:
            last_error = error
            if attempt + 1 >= max(1, attempts):
                raise
            time.sleep(0.15 * (attempt + 1))
    raise last_error or OSError("HTTP request failed")


class McpClient:
    def __init__(self, url: str, token: str) -> None:
        self.url = url
        self.token = token
        self.next_id = 1

    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        request_id = self.next_id
        self.next_id += 1
        payload: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
        }
        if params is not None:
            payload["params"] = params
        status, response = http_json(
            self.url,
            method="POST",
            token=self.token,
            payload=payload,
        )
        assert status == 200, f"{method}: HTTP {status}"
        assert isinstance(response, dict) and response.get("id") == request_id
        return response

    def result(self, method: str, params: dict[str, Any] | None = None) -> Any:
        response = self.request(method, params)
        assert "error" not in response, f"{method}: {response.get('error')}"
        return response["result"]

    def tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        result = self.result("tools/call", {"name": name, "arguments": arguments})
        assert result["isError"] is False
        structured = result["structuredContent"]
        assert json.loads(result["content"][0]["text"]) == structured
        return structured


def find_outilsia_page(browser: Any) -> Page:
    pages = [page for context in browser.contexts for page in context.pages]
    for page in pages:
        if "OutilsIA Local Cockpit" in page.title():
            return page
    raise AssertionError(
        f"OutilsIA WebView not found: {[(page.title(), page.url) for page in pages]}"
    )


def click_with_confirm(page: Page, selector: str) -> None:
    page.once("dialog", lambda dialog: dialog.accept())
    page.locator(selector).click()


def open_section(page: Page, workspace: str, selector: str) -> None:
    page.locator(f"#workspace{workspace.title()}Btn").click()
    page.locator("#workspaceSectionSelect").select_option(selector)
    page.locator(selector).wait_for(state="visible")


def wait_for_scan(page: Page, timeout_ms: int) -> dict[str, str]:
    page.locator("#prepareBtn").wait_for(state="visible")
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


def ledger_snapshot(page: Page) -> dict[str, Any]:
    ledger = page.evaluate(
        "() => window.__TAURI__.core.invoke('get_evidence_ledger')"
    )
    assert ledger["verification"]["chain_valid"] is True
    return ledger


def generate_passport(page: Page, timeout_ms: int) -> None:
    open_section(page, "Workflows", ".capability-passport-panel")
    button = page.locator("#generateCapabilityPassportBtn")
    assert not button.is_disabled(), "Passport unavailable after native scan"
    button.click()
    page.wait_for_function(
        "() => document.getElementById('capabilityPassportState')?.textContent === 'intégrité vérifiée'",
        timeout=timeout_ms,
    )


def start_lane(page: Page, timeout_ms: int) -> tuple[McpClient, str]:
    open_section(page, "Workflows", ".local-action-lane-panel")
    start = page.locator("#startLocalActionLaneBtn")
    assert not start.is_disabled(), "Action Lane start unavailable"
    click_with_confirm(page, "#startLocalActionLaneBtn")
    page.wait_for_function(
        "() => document.getElementById('localActionLaneState')?.textContent?.startsWith('active')",
        timeout=timeout_ms,
    )

    page.locator("#copyLocalActionConfigBtn").click()
    config = clipboard_text()
    match = re.search(r'url\s*=\s*"([^"]+/mcp)"', config)
    assert match, "MCP URL missing from secret-free client config"
    mcp_url = match.group(1)
    assert mcp_url.startswith("http://127.0.0.1:")
    assert "Bearer " not in config and "OUTILSIA_LOCAL_ACTION_TOKEN" in config

    page.locator("#copyLocalActionTokenBtn").click()
    token = clipboard_text()
    assert re.fullmatch(r"[a-f0-9]{64}", token), "Invalid ephemeral token"
    client = McpClient(mcp_url, token)
    initialized = client.result(
        "initialize",
        {
            "protocolVersion": "2025-11-25",
            "capabilities": {},
            "clientInfo": {"name": "OutilsIA native Action Lane recipe", "version": "1.0.0"},
        },
    )
    assert initialized["serverInfo"]["name"] == "OutilsIA Local Action Lane"
    tools = client.result("tools/list")["tools"]
    names = [tool["name"] for tool in tools]
    assert names == EXPECTED_TOOLS
    assert all("execute" not in name and "approve" not in name for name in names)
    assert client.result("resources/list") == {"resources": []}

    status, body = http_json(
        mcp_url,
        method="POST",
        payload={"jsonrpc": "2.0", "id": 99, "method": "tools/list"},
    )
    assert status == 401 and body == {"error": "bearer_token_required"}
    forbidden = client.request(
        "tools/call",
        {"name": "outilsia_execute_action", "arguments": {}},
    )
    assert forbidden["error"]["code"] == -32602
    return client, mcp_url.rsplit("/mcp", 1)[0]


def unique_attributes(page: Page, selector: str, attribute: str) -> list[str]:
    values = page.locator(selector).evaluate_all(
        "(nodes, name) => nodes.map((node) => node.getAttribute(name)).filter(Boolean)",
        attribute,
    )
    return list(dict.fromkeys(str(value) for value in values if value))


def runtime_for(page: Page, model: str, installed: bool) -> str:
    method = "installedOllamaRuntimeFor" if installed else "defaultOllamaRuntime"
    runtime = page.evaluate(
        f"(model) => window.__OUTILSIA_TEST__.{method}(model)",
        model,
    )
    return "wsl" if runtime == "wsl" else "native"


def choose_benchmark_model(page: Page) -> tuple[str, str]:
    installed = unique_attributes(page, "[data-delete-model]", "data-delete-model")
    preferred = sorted(
        installed,
        key=lambda model: (
            0 if "qwen3:0.6b" in model.lower() else 1 if "hermes3:8b" in model.lower() else 2,
            len(model),
        ),
    )
    for model in preferred:
        runtime = runtime_for(page, model, True)
        if page.evaluate(
            "(args) => Boolean(window.__OUTILSIA_TEST__.installedOllamaRuntimeFor(args.model))",
            {"model": model},
        ):
            return model, runtime
    raise AssertionError(f"No installed model exposed by the scanned UI: {installed}")


def prepare_first_supported(
    client: McpClient,
    tool: str,
    candidates: list[tuple[str, str]],
) -> tuple[dict[str, Any], str, str]:
    errors: list[str] = []
    for model, runtime in candidates:
        response = client.request(
            "tools/call",
            {"name": tool, "arguments": {"model": model, "runtime": runtime}},
        )
        if "error" not in response:
            result = response["result"]
            return result["structuredContent"], model, runtime
        errors.append(str(response["error"].get("message", ""))[:180])
    raise AssertionError(f"No candidate accepted by {tool}: {errors[:8]}")


def reject_request_in_ui(page: Page, client: McpClient, request: dict[str, Any], timeout_ms: int) -> None:
    request_id = request["request_id"]
    page.locator("#refreshLocalActionLaneBtn").click()
    card = page.locator(f'[data-local-action-request="{request_id}"]')
    card.wait_for(state="visible", timeout=timeout_ms)
    assert card.locator("[data-local-action-execute]").count() == 0
    click_with_confirm(page, f'[data-local-action-reject="{request_id}"]')
    page.wait_for_function(
        "(id) => document.querySelector(`[data-local-action-request=\"${id}\"]`)?.textContent?.includes('Refusé')",
        arg=request_id,
        timeout=timeout_ms,
    )
    rejected = client.tool("outilsia_get_action_request", {"request_id": request_id})
    assert rejected["state"] == "rejected"
    assert rejected["capability_consumed"] is False


def approve_request_in_ui(page: Page, client: McpClient, request: dict[str, Any], timeout_ms: int) -> None:
    request_id = request["request_id"]
    page.locator("#refreshLocalActionLaneBtn").click()
    card = page.locator(f'[data-local-action-request="{request_id}"]')
    card.wait_for(state="visible", timeout=timeout_ms)
    approve = card.locator(f'[data-local-action-approve="{request_id}"]')
    assert approve.is_disabled()
    card.locator(f'[data-local-action-ack="{request_id}"]').check()
    assert not approve.is_disabled()
    click_with_confirm(page, f'[data-local-action-approve="{request_id}"]')
    page.wait_for_function(
        "(id) => Boolean(document.querySelector(`[data-local-action-execute=\"${id}\"]`))",
        arg=request_id,
        timeout=timeout_ms,
    )
    approved = client.tool("outilsia_get_action_request", {"request_id": request_id})
    assert approved["state"] == "approved"
    assert approved["capability_consumed"] is False


def execute_request_in_ui(page: Page, request_id: str, timeout_ms: int) -> None:
    del timeout_ms
    click_with_confirm(page, f'[data-local-action-execute="{request_id}"]')


def prepare_rejected_install(
    page: Page,
    client: McpClient,
    installed_model: str,
    timeout_ms: int,
) -> dict[str, Any]:
    installed_key = installed_model.strip().lower()
    candidates = []
    for model in unique_attributes(page, "[data-install-model]", "data-install-model"):
        if model.strip().lower() == installed_key:
            continue
        candidates.append((model, runtime_for(page, model, False)))
    request, model, runtime = prepare_first_supported(
        client,
        "outilsia_prepare_model_install",
        candidates,
    )
    assert request["state"] == "awaiting_human"
    assert request["plan"]["effects"] == ["download_model_layers", "write_ollama_model_store"]
    reject_request_in_ui(page, client, request, timeout_ms)
    return {
        "request_id": request["request_id"],
        "model": model,
        "runtime": runtime,
        "download_started": False,
        "final_state": "rejected",
    }


def run_native_benchmark(
    page: Page,
    client: McpClient,
    model: str,
    runtime: str,
    timeout_ms: int,
) -> dict[str, Any]:
    request = client.tool(
        "outilsia_prepare_benchmark",
        {"model": model, "runtime": runtime},
    )
    assert request["plan"]["limits"]["downloads"] == 0
    assert request["plan"]["limits"]["prompt_from_client"] is False
    approve_request_in_ui(page, client, request, timeout_ms)
    execute_request_in_ui(page, request["request_id"], timeout_ms)
    page.wait_for_function(
        "() => document.getElementById('statusText')?.textContent?.includes('Benchmark Local Action Lane')",
        timeout=timeout_ms,
    )
    benchmark_text = page.locator("#benchmarkResult").inner_text()
    assert "Test réussi" in benchmark_text, benchmark_text
    assert "tok/s" in benchmark_text
    match = re.search(r"([0-9]+(?:[.,][0-9]+)?)\s*tok/s", benchmark_text)
    return {
        "request_id": request["request_id"],
        "model": model,
        "runtime": runtime,
        "success": True,
        "tokens_per_second": float(match.group(1).replace(",", ".")) if match else None,
        "download_started": False,
        "prompt_from_client": False,
    }


def generate_report(page: Page, timeout_ms: int) -> None:
    open_section(page, "Tests", ".prepare-panel")
    details = page.locator(".prepare-support-details")
    if not details.evaluate("(element) => element.open"):
        details.locator("summary").click()
    button = page.locator(".prepare-panel [data-generate-cockpit-report='true']")
    button.wait_for(state="visible", timeout=timeout_ms)
    assert not button.is_disabled(), "Report action remains disabled after a successful benchmark"
    button.click()
    page.wait_for_function(
        """() => {
          const markdown = document.getElementById('memoryText')?.value?.trim();
          const panel = document.querySelector('.prepare-panel')?.textContent || '';
          return Boolean(markdown) && panel.includes('Journal MemoryForge prêt');
        }""",
        timeout=timeout_ms,
    )
    assert page.locator("#memoryText").input_value().strip()


def run_report_export(
    page: Page,
    client: McpClient,
    timeout_ms: int,
) -> dict[str, Any]:
    request = client.tool(
        "outilsia_prepare_report_export",
        {"format": "markdown"},
    )
    target = request["plan"]["target"]
    assert target["destination"] in {"app_data", "downloads"}
    assert request["plan"]["limits"]["path_from_client"] is False
    assert request["plan"]["limits"]["content_from_client"] is False
    approve_request_in_ui(page, client, request, timeout_ms)
    execute_request_in_ui(page, request["request_id"], timeout_ms)
    page.wait_for_function(
        "(id) => document.querySelector(`[data-local-action-request=\"${id}\"]`)?.textContent?.includes('Terminé')",
        arg=request["request_id"],
        timeout=timeout_ms,
    )
    completed = client.tool(
        "outilsia_get_action_request",
        {"request_id": request["request_id"]},
    )
    assert completed["state"] == "completed", completed
    assert completed["result"]["success"] is True
    return {
        "request_id": request["request_id"],
        "format": target["format"],
        "filename": target["filename"],
        "destination": target["destination"],
        "content_sha256": target["content_sha256"],
        "bytes_written": completed["result"]["bytes_written"],
        "final_state": completed["state"],
        "path_from_client": False,
        "content_from_client": False,
    }


def stop_lane(page: Page, base_url: str | None) -> None:
    try:
        open_section(page, "Workflows", ".local-action-lane-panel")
        stop = page.locator("#stopLocalActionLaneBtn")
        if stop.is_visible() and not stop.is_disabled():
            stop.click()
            page.wait_for_function(
                "() => document.getElementById('localActionLaneState')?.textContent === 'désactivée'",
                timeout=10_000,
            )
    finally:
        clear_clipboard()
    if not base_url:
        return
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        try:
            http_json(f"{base_url}/v1/health", timeout=0.4, attempts=1)
        except (URLError, TimeoutError, ConnectionError):
            return
        time.sleep(0.1)
    raise AssertionError("Action Lane endpoint still responds after native stop")


def verify_new_ledger_entries(
    page: Page,
    initial_sequence: int,
    token_values: list[str],
) -> dict[str, Any]:
    ledger = ledger_snapshot(page)
    new_entries = [
        entry for entry in ledger["entries"] if int(entry["sequence"]) > initial_sequence
    ]
    event_types = [entry["event_type"] for entry in new_entries]
    assert event_types.count("local_action_execution_recorded") == 2, event_types
    assert event_types.count("local_action_decision_recorded") == 1, event_types
    serialized = json.dumps(new_entries, ensure_ascii=False).lower()
    for token in token_values:
        assert token.lower() not in serialized
    for marker in PRIVATE_MARKERS:
        assert marker.lower() not in serialized, marker
    assert all(
        entry["privacy"]["raw_source_stored"] is False
        and entry["privacy"]["raw_prompt_stored"] is False
        and entry["privacy"]["raw_model_output_stored"] is False
        and entry["privacy"]["credentials_stored"] is False
        and entry["evidence"]["claims"]["raw_prompt_stored"] is False
        and entry["evidence"]["claims"]["raw_model_output_stored"] is False
        and entry["evidence"]["claims"]["export_content_stored"] is False
        for entry in new_entries
    )
    return {
        "new_entry_count": len(new_entries),
        "event_types": event_types,
        "chain_valid": ledger["verification"]["chain_valid"],
        "raw_content_stored": False,
        "tokens_stored": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cdp-url", default="http://127.0.0.1:9555")
    parser.add_argument("--timeout-seconds", type=int, default=240)
    parser.add_argument("--artifact-dir", type=Path, default=DEFAULT_ARTIFACT_DIR)
    args = parser.parse_args()

    timeout_ms = args.timeout_seconds * 1000
    args.artifact_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.artifact_dir / "native-local-action-lane-e2e.json"
    lane_shot = args.artifact_dir / "native-local-action-lane-completed.png"
    ledger_shot = args.artifact_dir / "native-local-action-ledger.png"
    report: dict[str, Any] = {
        "schema": "outilsia.native_local_action_lane_e2e.v0",
        "started_at": utc_now(),
        "status": "failed",
        "publication_performed": False,
        "deployment_performed": False,
        "model_installation_performed": False,
    }
    page: Page | None = None
    active_base_url: str | None = None
    secrets: list[str] = []
    pending_error: BaseException | None = None

    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.connect_over_cdp(args.cdp_url)
            page = find_outilsia_page(browser)
            page.set_default_timeout(timeout_ms)
            page.bring_to_front()

            initial_ledger = ledger_snapshot(page)
            initial_sequence = max(
                (int(entry["sequence"]) for entry in initial_ledger["entries"]),
                default=0,
            )
            machine = wait_for_scan(page, timeout_ms)
            generate_passport(page, timeout_ms)
            first_client, active_base_url = start_lane(page, timeout_ms)
            secrets.append(first_client.token)

            installed_model, installed_runtime = choose_benchmark_model(page)
            install_rejection = prepare_rejected_install(
                page,
                first_client,
                installed_model,
                timeout_ms,
            )
            benchmark = run_native_benchmark(
                page,
                first_client,
                installed_model,
                installed_runtime,
                timeout_ms,
            )
            active_base_url = None

            generate_report(page, timeout_ms)
            generate_passport(page, timeout_ms)
            second_client, active_base_url = start_lane(page, timeout_ms)
            secrets.append(second_client.token)
            export = run_report_export(page, second_client, timeout_ms)
            page.locator(".local-action-lane-panel").screenshot(path=str(lane_shot))

            ledger = verify_new_ledger_entries(page, initial_sequence, secrets)
            open_section(page, "Workflows", ".evidence-ledger-panel")
            page.locator("#refreshEvidenceLedgerBtn").click()
            page.wait_for_function(
                "() => document.getElementById('evidenceLedgerState')?.textContent?.includes('chaîne valide')",
                timeout=timeout_ms,
            )
            page.locator(".evidence-ledger-panel").screenshot(path=str(ledger_shot))
            stop_lane(page, active_base_url)
            active_base_url = None

            report.update(
                {
                    "status": "passed",
                    "completed_at": utc_now(),
                    "machine": machine,
                    "mcp": {
                        "bind": "127.0.0.1",
                        "tool_names": EXPECTED_TOOLS,
                        "tool_count": len(EXPECTED_TOOLS),
                        "approve_tool_exposed": False,
                        "execute_tool_exposed": False,
                        "missing_token_rejected": True,
                        "token_persisted": False,
                    },
                    "install_rejection": install_rejection,
                    "benchmark": benchmark,
                    "export": export,
                    "ledger": ledger,
                    "artifacts": {
                        "lane_screenshot": lane_shot.name,
                        "ledger_screenshot": ledger_shot.name,
                        "report": report_path.name,
                    },
                }
            )
        except (
            AssertionError,
            PlaywrightTimeoutError,
            OSError,
            ValueError,
            KeyError,
        ) as error:
            report["completed_at"] = utc_now()
            message = f"{type(error).__name__}: {error}"
            for secret in secrets:
                message = message.replace(secret, "<redacted>")
            report["error"] = message
            pending_error = error
        finally:
            if page is not None:
                try:
                    stop_lane(page, active_base_url)
                except Exception as cleanup_error:  # noqa: BLE001
                    report["cleanup_error"] = type(cleanup_error).__name__
            clear_clipboard()

    serialized = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    for secret in secrets:
        assert secret not in serialized
    report_path.write_text(serialized, encoding="utf-8")
    if pending_error is not None:
        raise pending_error
    print(
        "native_local_action_lane_e2e_ok "
        f"tools={report['mcp']['tool_count']} "
        f"benchmark={report['benchmark']['tokens_per_second']}tok/s "
        f"ledger={report['ledger']['new_entry_count']} "
        f"report={report_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
