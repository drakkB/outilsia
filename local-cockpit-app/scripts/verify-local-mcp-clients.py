#!/usr/bin/env python3
"""Exercise the native OutilsIA MCP bridge through real Codex and Claude clients.

The bridge is started from the visible Tauri UI. Its bearer token is passed only
through process environments, never command-line arguments or persisted
artifacts. Client transcripts stay in a temporary directory and are deleted at
the end; the final report records only tool names and bounded assertions.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
NATIVE_RECIPE_PATH = Path(__file__).with_name("verify-local-mcp-native.py")
DEFAULT_ARTIFACT_DIR = ROOT / ".artifacts" / "native-local-mcp-clients"
TOKEN_ENV = "OUTILSIA_LOCAL_MCP_TOKEN"
CLIENT_TOOL_NAMES = [
    "outilsia_get_machine_profile",
    "outilsia_list_installed_models",
    "outilsia_get_benchmark_proofs",
]
FORBIDDEN_ACTION_MARKERS = [
    "install_ollama_model",
    "delete_ollama_model",
    "run_benchmark",
    "run_local_chat",
    "scan_machine",
]


def load_native_recipe() -> Any:
    spec = importlib.util.spec_from_file_location("outilsia_native_mcp_recipe", NATIVE_RECIPE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load the native MCP recipe")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


NATIVE = load_native_recipe()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def redacted(value: str, token: str) -> str:
    result = value.replace(token, "<redacted>") if token else value
    return re.sub(r"(?i)(authorization\s*:\s*bearer\s+)[a-f0-9]{64}", r"\1<redacted>", result)


def run_process(
    command: list[str],
    *,
    env: dict[str, str],
    cwd: Path,
    stdin: str | None = None,
    timeout_seconds: int,
    token: str,
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            cwd=cwd,
            env=env,
            input=stdin,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        stdout = redacted(error.stdout or "", token)
        stderr = redacted(error.stderr or "", token)
        raise AssertionError(
            f"Client timeout after {timeout_seconds}s; stdout={stdout[-800:]}; stderr={stderr[-800:]}"
        ) from error


def parse_json_lines(raw: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            events.append(value)
    return events


def walk_json(value: Any) -> list[Any]:
    values = [value]
    if isinstance(value, dict):
        for nested in value.values():
            values.extend(walk_json(nested))
    elif isinstance(value, list):
        for nested in value:
            values.extend(walk_json(nested))
    return values


def tool_names_from_events(events: list[dict[str, Any]]) -> list[str]:
    found: list[str] = []
    for value in walk_json(events):
        if not isinstance(value, str):
            continue
        for expected in CLIENT_TOOL_NAMES:
            if expected in value and expected not in found:
                found.append(expected)
    return found


def final_text_from_events(events: list[dict[str, Any]], fallback: str) -> str:
    candidates: list[str] = []
    for event in events:
        for key in ("result", "last_message", "final_output", "text"):
            value = event.get(key)
            if isinstance(value, str) and value.strip():
                candidates.append(value.strip())
    return candidates[-1] if candidates else fallback.strip()


def expected_snapshot(pairing: dict[str, Any]) -> dict[str, Any]:
    client = NATIVE.McpClient(pairing["mcp"]["url"], pairing["authorization"]["token"])
    initialize = client.result(
        "initialize",
        {
            "protocolVersion": "2025-11-25",
            "capabilities": {},
            "clientInfo": {"name": "OutilsIA client verifier", "version": "1.0.0"},
        },
    )
    assert initialize["serverInfo"]["name"] == "OutilsIA Local Cockpit"
    machine_payload = client.result(
        "tools/call",
        {"name": "outilsia_get_machine_profile", "arguments": {}},
    )["structuredContent"]
    models_payload = client.result(
        "tools/call",
        {"name": "outilsia_list_installed_models", "arguments": {}},
    )["structuredContent"]
    proofs_payload = client.result(
        "tools/call",
        {"name": "outilsia_get_benchmark_proofs", "arguments": {}},
    )["structuredContent"]
    machine = machine_payload["machine"]
    return {
        "cpu": str(machine.get("cpu") or machine.get("cpu_name") or ""),
        "gpu": str(machine.get("gpu") or machine.get("gpu_name") or ""),
        "vram_gb": machine.get("vram_gb"),
        "installed_model_count": int(models_payload["count"]),
        "benchmark_proof_count": int(proofs_payload["count"]),
    }


def validation_prompt(expected: dict[str, Any]) -> str:
    return f"""Validate the OutilsIA Local Cockpit read-only MCP connection.
Use only tools from the MCP server named outilsia_local. Do not use shell,
filesystem, browser, web search, or any other server. Call these three tools:
- outilsia_get_machine_profile
- outilsia_list_installed_models
- outilsia_get_benchmark_proofs

Return one compact JSON object with keys cpu, gpu, vram_gb,
installed_model_count, benchmark_proof_count, and local_actions_available.
Set local_actions_available to false because this bridge is read-only.
Expected counts are only cross-check hints: installed={expected['installed_model_count']},
proofs={expected['benchmark_proof_count']}. Do not invent or estimate values."""


def assert_client_result(
    *,
    client: str,
    completed: subprocess.CompletedProcess[str],
    token: str,
    expected: dict[str, Any],
) -> dict[str, Any]:
    stdout = redacted(completed.stdout, token)
    stderr = redacted(completed.stderr, token)
    assert token not in stdout and token not in stderr, f"{client}: token leaked in process output"
    assert completed.returncode == 0, (
        f"{client}: exit={completed.returncode}; stdout={stdout[-1200:]}; stderr={stderr[-1200:]}"
    )
    events = parse_json_lines(stdout)
    tools = tool_names_from_events(events)
    missing = [name for name in CLIENT_TOOL_NAMES if name not in tools]
    assert not missing, f"{client}: MCP calls missing: {missing}; output={stdout[-1600:]}"
    serialized = json.dumps(events, ensure_ascii=False)
    assert not any(marker in serialized for marker in FORBIDDEN_ACTION_MARKERS), (
        f"{client}: forbidden action marker observed"
    )
    final_text = final_text_from_events(events, stdout)
    for value in (expected["cpu"], expected["gpu"]):
        assert value and value.casefold() in final_text.casefold(), (
            f"{client}: expected hardware value absent: {value}"
        )
    for value in (expected["installed_model_count"], expected["benchmark_proof_count"]):
        assert str(value) in final_text, f"{client}: expected count absent: {value}"
    assert "false" in final_text.casefold(), f"{client}: read-only boundary absent"
    return {
        "status": "passed",
        "exit_code": completed.returncode,
        "tool_calls": tools,
        "machine_values_confirmed": True,
        "counts_confirmed": True,
        "read_only_boundary_confirmed": True,
        "transcript_persisted": False,
    }


def run_codex(
    pairing: dict[str, Any],
    expected: dict[str, Any],
    temp_dir: Path,
    timeout_seconds: int,
) -> dict[str, Any]:
    if os.name != "nt":
        raise AssertionError(
            "Codex client validation must run with Windows Python so the loopback MCP stays local"
        )
    locator = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-Command",
            "$pkg=Get-AppxPackage OpenAI.Codex -ErrorAction Stop; "
            "Join-Path $pkg.InstallLocation 'app\\resources\\codex.exe'",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    assert locator.returncode == 0 and locator.stdout.strip(), (
        "Codex Windows app or bundled CLI not found"
    )
    source = Path(locator.stdout.strip())
    executable = temp_dir / "codex.exe"
    shutil.copy2(source, executable)
    assert executable.is_file() and executable.stat().st_size > 1_000_000
    token = pairing["authorization"]["token"]
    env = os.environ.copy()
    env[TOKEN_ENV] = token
    output_path = temp_dir / "codex-last-message.json"
    enabled_tools = json.dumps(CLIENT_TOOL_NAMES, separators=(",", ":"))
    command = [
        str(executable),
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--json",
        "-C",
        str(temp_dir),
        "-o",
        str(output_path),
        "-c",
        f'mcp_servers.outilsia_local.url="{pairing["mcp"]["url"]}"',
        "-c",
        f'mcp_servers.outilsia_local.bearer_token_env_var="{TOKEN_ENV}"',
        "-c",
        "mcp_servers.outilsia_local.enabled=true",
        "-c",
        "mcp_servers.outilsia_local.required=true",
        "-c",
        'mcp_servers.outilsia_local.default_tools_approval_mode="auto"',
        "-c",
        f"mcp_servers.outilsia_local.enabled_tools={enabled_tools}",
        validation_prompt(expected),
    ]
    started = time.monotonic()
    completed = run_process(
        command,
        env=env,
        cwd=temp_dir,
        timeout_seconds=timeout_seconds,
        token=token,
    )
    result = assert_client_result(
        client="codex",
        completed=completed,
        token=token,
        expected=expected,
    )
    result.update(
        {
            "client": "Codex CLI",
            "version": subprocess.run(
                [str(executable), "--version"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            ).stdout.strip(),
            "environment": "windows",
            "duration_ms": round((time.monotonic() - started) * 1000),
        }
    )
    return result


def run_claude(
    pairing: dict[str, Any],
    expected: dict[str, Any],
    temp_dir: Path,
    timeout_seconds: int,
) -> dict[str, Any]:
    token = pairing["authorization"]["token"]
    config_path = temp_dir / "claude-mcp.json"
    config_path.write_text(
        json.dumps(
            {
                "mcpServers": {
                    "outilsia_local": {
                        "type": "http",
                        "url": pairing["mcp"]["url"],
                        "headers": {"Authorization": f"Bearer ${{{TOKEN_ENV}}}"},
                    }
                }
            },
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    assert token not in config_path.read_text(encoding="utf-8")

    env = os.environ.copy()
    env[TOKEN_ENV] = token
    env["OUTILSIA_MCP_CONFIG_PATH"] = str(config_path)
    inherited = [entry for entry in env.get("WSLENV", "").split(":") if entry]
    inherited = [
        entry
        for entry in inherited
        if not entry.startswith(f"{TOKEN_ENV}") and not entry.startswith("OUTILSIA_MCP_CONFIG_PATH")
    ]
    inherited.extend([TOKEN_ENV, "OUTILSIA_MCP_CONFIG_PATH/p"])
    env["WSLENV"] = ":".join(inherited)
    allowed = ",".join(f"mcp__outilsia_local__{name}" for name in CLIENT_TOOL_NAMES)
    powershell = """$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $env:TEMP
& claude -p --output-format stream-json --verbose --no-session-persistence `
  --strict-mcp-config --mcp-config $env:OUTILSIA_MCP_CONFIG_PATH `
  --permission-mode dontAsk --allowedTools $env:OUTILSIA_ALLOWED_MCP_TOOLS
exit $LASTEXITCODE
"""
    env["OUTILSIA_ALLOWED_MCP_TOOLS"] = allowed
    env["WSLENV"] += ":OUTILSIA_ALLOWED_MCP_TOOLS"
    started = time.monotonic()
    completed = run_process(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", powershell],
        env=env,
        cwd=temp_dir,
        stdin=validation_prompt(expected),
        timeout_seconds=timeout_seconds,
        token=token,
    )
    result = assert_client_result(
        client="claude",
        completed=completed,
        token=token,
        expected=expected,
    )
    version = subprocess.run(
        ["powershell.exe", "-NoProfile", "-Command", "claude --version"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    ).stdout.strip()
    result.update(
        {
            "client": "Claude Code",
            "version": version,
            "environment": "windows",
            "duration_ms": round((time.monotonic() - started) * 1000),
        }
    )
    return result


def run_clients(
    pairing: dict[str, Any],
    expected: dict[str, Any],
    clients: list[str],
    timeout_seconds: int,
) -> dict[str, Any]:
    results: dict[str, Any] = {}
    with tempfile.TemporaryDirectory(prefix="outilsia-mcp-clients-") as directory:
        temp_dir = Path(directory)
        for client in clients:
            if client == "codex":
                results[client] = run_codex(pairing, expected, temp_dir, timeout_seconds)
            elif client == "claude":
                results[client] = run_claude(pairing, expected, temp_dir, timeout_seconds)
            else:
                raise AssertionError(f"Unsupported client: {client}")
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cdp-url", default="http://127.0.0.1:9444")
    parser.add_argument("--clients", default="codex,claude")
    parser.add_argument("--timeout-seconds", type=int, default=240)
    parser.add_argument("--ui-timeout-seconds", type=int, default=90)
    parser.add_argument("--artifact-dir", type=Path, default=DEFAULT_ARTIFACT_DIR)
    args = parser.parse_args()

    clients = [value.strip().casefold() for value in args.clients.split(",") if value.strip()]
    assert clients and all(value in {"codex", "claude"} for value in clients)
    args.artifact_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.artifact_dir / "native-local-mcp-clients.json"
    report: dict[str, Any] = {
        "schema": "outilsia.native_local_mcp_clients.v1",
        "started_at": utc_now(),
        "status": "failed",
        "clients_requested": clients,
        "secrets_recorded": False,
        "transcripts_persisted": False,
    }
    page: Page | None = None
    base_url: str | None = None
    token = ""
    pending_error: BaseException | None = None

    with sync_playwright() as playwright:
        try:
            browser = playwright.chromium.connect_over_cdp(args.cdp_url)
            page = NATIVE.find_outilsia_page(browser)
            page.set_default_timeout(args.ui_timeout_seconds * 1000)
            page.bring_to_front()
            machine = NATIVE.wait_for_scan(page, args.ui_timeout_seconds * 1000)
            pairing = NATIVE.start_bridge_from_ui(page, args.ui_timeout_seconds * 1000)
            token = pairing["authorization"]["token"]
            base_url = pairing["base_url"]
            expected = expected_snapshot(pairing)
            client_results = run_clients(pairing, expected, clients, args.timeout_seconds)
            NATIVE.stop_bridge_from_ui(page, base_url)
            base_url = None
            report.update(
                {
                    "status": "passed",
                    "completed_at": utc_now(),
                    "machine": machine,
                    "expected_snapshot": expected,
                    "clients": client_results,
                    "cleanup": {
                        "bridge_stopped": True,
                        "clipboard_cleared": True,
                        "temporary_files_removed": True,
                    },
                }
            )
        except BaseException as error:  # noqa: BLE001
            message = redacted(f"{type(error).__name__}: {error}", token)
            report.update({"completed_at": utc_now(), "error": message})
            pending_error = error
        finally:
            try:
                if page is not None:
                    NATIVE.stop_bridge_from_ui(page, base_url)
            except Exception as cleanup_error:  # noqa: BLE001
                report["cleanup_error"] = redacted(
                    f"{type(cleanup_error).__name__}: {cleanup_error}",
                    token,
                )
            NATIVE.clear_clipboard()

    serialized = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if token:
        assert token not in serialized, "Ephemeral token reached the client report"
    report_path.write_text(serialized, encoding="utf-8")
    if pending_error is not None:
        raise pending_error

    summary = ", ".join(
        f"{name}={report['clients'][name]['status']}" for name in clients
    )
    print(f"native_local_mcp_clients_ok {summary} report={report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
