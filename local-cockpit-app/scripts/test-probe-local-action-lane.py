#!/usr/bin/env python3
"""Deterministic protocol test for the external Local Action Lane probe."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PROBE_PATH = ROOT / "scripts" / "probe-local-action-lane.py"
TOKEN = "a" * 64
PLAN_SHA256 = "b" * 64


def load_probe() -> Any:
    spec = importlib.util.spec_from_file_location("outilsia_action_lane_probe", PROBE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("External Action Lane probe cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PROBE = load_probe()


class FakeState:
    def __init__(self) -> None:
        self.requests: dict[str, dict[str, Any]] = {}
        self.next_request = 1
        self.execute_attempts = 0
        self.actions_started = 0

    def view(self, request_id: str, state: str = "awaiting_human") -> dict[str, Any]:
        return {
            "schema": "outilsia.local_action_request.v0",
            "contract_version": "0",
            "request_id": request_id,
            "session_id": "session-test",
            "client_id": "probe-test",
            "client_label": "Probe Test",
            "action": "export_report",
            "state": state,
            "created_at_ms": 1,
            "updated_at_ms": 1,
            "plan": {
                "schema": "outilsia.local_action_plan.v0",
                "action": "export_report",
                "target": {
                    "format": "markdown",
                    "filename": "rapport-test.md",
                    "destination": "app_data",
                    "content_sha256": "c" * 64,
                },
                "limits": {
                    "path_from_client": False,
                    "content_from_client": False,
                },
            },
            "plan_sha256": PLAN_SHA256,
            "human_decision": (
                "cancelled_by_requesting_client" if state == "cancelled" else "not_recorded"
            ),
            "capability_expires_at_ms": None,
            "capability_consumed": False,
            "result": None,
            "privacy": {
                "queue_persisted": False,
                "capability_secret_exposed": False,
                "raw_prompt_exposed": False,
                "raw_model_output_exposed": False,
                "export_content_exposed": False,
                "credentials_exposed": False,
            },
        }


STATE = FakeState()


def rpc_result(request_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def rpc_error(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }


def tool_result(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": json.dumps(value, indent=2)}],
        "structuredContent": value,
        "isError": False,
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, _format: str, *_args: Any) -> None:
        pass

    def send_json(self, status: int, value: dict[str, Any]) -> None:
        body = json.dumps(value, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length))
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.send_json(401, {"error": "bearer_token_required"})
            return
        request_id = payload.get("id")
        method = payload.get("method")
        params = payload.get("params") or {}
        if method == "initialize":
            result = {
                "protocolVersion": "2025-11-25",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {
                    "name": "OutilsIA Local Action Lane",
                    "version": "0.1.0",
                },
            }
        elif method == "tools/list":
            result = {
                "tools": [
                    {"name": name}
                    for name in PROBE.EXPECTED_TOOLS
                ]
            }
        elif method == "resources/list":
            result = {"resources": []}
        elif method == "tools/call":
            name = params.get("name")
            arguments = params.get("arguments") or {}
            if name == "outilsia_execute_action":
                STATE.execute_attempts += 1
                self.send_json(200, rpc_error(request_id, -32602, "Unknown Action Lane tool"))
                return
            if name == "outilsia_prepare_report_export":
                if arguments != {"format": "markdown"}:
                    self.send_json(200, rpc_error(request_id, -32602, "Invalid format"))
                    return
                local_id = f"larq-test-{STATE.next_request:02d}"
                STATE.next_request += 1
                value = STATE.view(local_id)
                STATE.requests[local_id] = value
                result = tool_result(value)
            elif name == "outilsia_get_action_request":
                local_id = str(arguments.get("request_id") or "")
                value = STATE.requests.get(local_id)
                if value is None:
                    self.send_json(200, rpc_error(request_id, -32602, "Unknown request"))
                    return
                result = tool_result(value)
            elif name == "outilsia_cancel_action_request":
                local_id = str(arguments.get("request_id") or "")
                value = STATE.requests.get(local_id)
                if value is None or value["state"] != "awaiting_human":
                    self.send_json(200, rpc_error(request_id, -32602, "Request not cancellable"))
                    return
                cancelled = STATE.view(local_id, "cancelled")
                STATE.requests[local_id] = cancelled
                result = tool_result(cancelled)
            else:
                self.send_json(200, rpc_error(request_id, -32602, "Unknown tool"))
                return
        else:
            self.send_json(200, rpc_error(request_id, -32601, "Unknown method"))
            return
        self.send_json(200, rpc_result(request_id, result))


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output):
            result = PROBE.run_probe(
                f"http://127.0.0.1:{server.server_port}/mcp",
                TOKEN,
                timeout=3.0,
                pause_before_cancel=False,
            )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)

    text = output.getvalue()
    assert result["status"] == "passed", result
    assert result["request_count"] == 2, result
    assert result["requests_distinct"] is True, result
    assert result["plans_equal"] is True, result
    assert result["all_cancelled"] is True, result
    assert result["actions_started"] is False, result
    assert TOKEN not in text
    assert STATE.execute_attempts == 1
    assert STATE.actions_started == 0
    assert len(STATE.requests) == 2
    assert all(value["state"] == "cancelled" for value in STATE.requests.values())
    print(
        "local_action_lane_external_probe_test_ok "
        "requests=2 distinct=true same_plan=true execute_rejected=true "
        "cancelled=true actions_started=false token_leak=false"
    )


if __name__ == "__main__":
    main()
