#!/usr/bin/env python3
"""Probe OutilsIA Local Action Lane through its public loopback MCP boundary.

The probe prepares the same frozen report export twice, verifies that the two
requests remain distinct and awaiting human approval, then cancels both through
MCP. It never approves or executes an action and never persists the token.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


TOKEN_ENV = "OUTILSIA_LOCAL_ACTION_TOKEN"
URL_ENV = "OUTILSIA_LOCAL_ACTION_URL"
EXPECTED_TOOLS = [
    "outilsia_prepare_model_install",
    "outilsia_prepare_benchmark",
    "outilsia_prepare_report_export",
    "outilsia_get_action_request",
    "outilsia_cancel_action_request",
]
PRIVATE_MARKERS = [
    "authorization",
    "bearer ",
    "c:\\users\\",
    "/home/",
]


class ProbeFailure(RuntimeError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ProbeFailure(message)


def clipboard_text() -> str:
    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-Command",
            "[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); Get-Clipboard -Raw",
        ],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        raise ProbeFailure("Lecture du presse-papiers Windows impossible.")
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


def extract_loopback_mcp_url(value: str) -> str:
    match = re.search(r"http://127\.0\.0\.1:\d{1,5}/mcp\b", value)
    if not match:
        raise ProbeFailure("URL MCP loopback absente de la configuration copiée.")
    url = match.group(0)
    parsed = urlparse(url)
    require(
        parsed.scheme == "http"
        and parsed.hostname == "127.0.0.1"
        and parsed.path == "/mcp"
        and parsed.port is not None,
        "La sonde refuse toute URL qui ne cible pas 127.0.0.1.",
    )
    return url


def validate_token(value: str) -> str:
    token = value.strip()
    require(
        re.fullmatch(r"[a-f0-9]{64}", token) is not None,
        "Le jeton Action Lane éphémère est invalide.",
    )
    return token


def resolve_connection(url_arg: str, non_interactive: bool) -> tuple[str, str]:
    url_value = url_arg.strip() or os.environ.get(URL_ENV, "").strip()
    token_value = os.environ.get(TOKEN_ENV, "").strip()

    if not url_value:
        if non_interactive:
            raise ProbeFailure(f"Définissez {URL_ENV} ou utilisez --url.")
        input(
            "Dans OutilsIA, cliquez « Copier la configuration », puis appuyez "
            "sur Entrée ici. "
        )
        url_value = clipboard_text()
        clear_clipboard()

    if not token_value:
        if non_interactive:
            raise ProbeFailure(f"Définissez {TOKEN_ENV} dans l'environnement.")
        input(
            "Dans OutilsIA, cliquez « Copier le jeton temporaire », puis appuyez "
            "sur Entrée ici. "
        )
        token_value = clipboard_text()
        clear_clipboard()

    return extract_loopback_mcp_url(url_value), validate_token(token_value)


def http_json(
    url: str,
    *,
    token: str | None,
    payload: dict[str, Any],
    timeout: float,
) -> tuple[int, Any]:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, data=body, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except HTTPError as error:
        raw = error.read()
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = None
        return error.code, parsed
    except (ConnectionError, TimeoutError, URLError) as error:
        raise ProbeFailure(f"Serveur Action Lane inaccessible ({type(error).__name__}).") from error


class McpClient:
    def __init__(self, url: str, token: str, timeout: float) -> None:
        self.url = url
        self.token = token
        self.timeout = timeout
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
            token=self.token,
            payload=payload,
            timeout=self.timeout,
        )
        require(status == 200, f"{method} a retourné HTTP {status}.")
        require(
            isinstance(response, dict) and response.get("id") == request_id,
            f"Réponse JSON-RPC invalide pour {method}.",
        )
        return response

    def result(self, method: str, params: dict[str, Any] | None = None) -> Any:
        response = self.request(method, params)
        require("error" not in response, f"{method} a été refusé.")
        return response.get("result")

    def tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        result = self.result("tools/call", {"name": name, "arguments": arguments})
        require(isinstance(result, dict) and result.get("isError") is False, f"{name} a échoué.")
        structured = result.get("structuredContent")
        require(isinstance(structured, dict), f"{name} ne retourne pas de résultat structuré.")
        content = result.get("content")
        require(
            isinstance(content, list)
            and content
            and json.loads(content[0].get("text", "{}")) == structured,
            f"{name} retourne deux représentations incohérentes.",
        )
        return structured


def assert_safe_request(request: dict[str, Any], token: str) -> None:
    require(request.get("schema") == "outilsia.local_action_request.v0", "Schéma de demande invalide.")
    require(request.get("action") == "export_report", "Action inattendue dans la sonde.")
    require(request.get("state") == "awaiting_human", "La demande n'attend pas l'humain.")
    require(request.get("human_decision") == "not_recorded", "Une décision humaine a été préremplie.")
    require(request.get("capability_expires_at_ms") is None, "Une capacité a été émise par MCP.")
    require(request.get("capability_consumed") is False, "Une capacité a été consommée.")
    require(request.get("result") is None, "Une exécution locale semble avoir démarré.")
    privacy = request.get("privacy")
    require(
        isinstance(privacy, dict) and all(value is False for value in privacy.values()),
        "La vue MCP expose une donnée privée.",
    )
    limits = request.get("plan", {}).get("limits", {})
    require(limits.get("path_from_client") is False, "Le client peut choisir un chemin.")
    require(limits.get("content_from_client") is False, "Le client peut fournir un contenu.")
    serialized = json.dumps(request, ensure_ascii=False).casefold()
    require(token.casefold() not in serialized, "Le jeton apparaît dans une réponse MCP.")
    require(
        not any(marker in serialized for marker in PRIVATE_MARKERS),
        "Une donnée privée apparaît dans une réponse MCP.",
    )


def cancel_if_pending(client: McpClient, request_id: str) -> None:
    try:
        current = client.tool("outilsia_get_action_request", {"request_id": request_id})
        if current.get("state") in {"awaiting_human", "approved"}:
            client.tool("outilsia_cancel_action_request", {"request_id": request_id})
    except (ProbeFailure, KeyError, TypeError, ValueError, json.JSONDecodeError):
        pass


def run_probe(
    url: str,
    token: str,
    *,
    timeout: float,
    pause_before_cancel: bool,
) -> dict[str, Any]:
    unauthorized_status, unauthorized = http_json(
        url,
        token=None,
        payload={"jsonrpc": "2.0", "id": 900, "method": "tools/list"},
        timeout=timeout,
    )
    require(
        unauthorized_status == 401
        and unauthorized == {"error": "bearer_token_required"},
        "Le serveur n'a pas refusé la requête sans jeton.",
    )

    client = McpClient(url, token, timeout)
    initialized = client.result(
        "initialize",
        {
            "protocolVersion": "2025-11-25",
            "capabilities": {},
            "clientInfo": {
                "name": "OutilsIA external Action Lane probe",
                "version": "1.0.0",
            },
        },
    )
    require(
        initialized.get("serverInfo", {}).get("name") == "OutilsIA Local Action Lane",
        "Identité du serveur MCP inattendue.",
    )
    tools = client.result("tools/list").get("tools", [])
    tool_names = [tool.get("name") for tool in tools]
    require(tool_names == EXPECTED_TOOLS, "La liste des cinq outils Action Lane a changé.")
    require(
        all("approve" not in name and "execute" not in name for name in tool_names),
        "Un outil MCP d'approbation ou d'exécution est exposé.",
    )
    require(client.result("resources/list") == {"resources": []}, "Une ressource MCP est exposée.")

    forbidden = client.request(
        "tools/call",
        {"name": "outilsia_execute_action", "arguments": {}},
    )
    require(
        forbidden.get("error", {}).get("code") == -32602,
        "La tentative d'exécution MCP n'a pas été refusée.",
    )

    request_ids: list[str] = []
    cancelled = False
    try:
        first = client.tool(
            "outilsia_prepare_report_export",
            {"format": "markdown"},
        )
        request_ids.append(str(first.get("request_id") or ""))
        second = client.tool(
            "outilsia_prepare_report_export",
            {"format": "markdown"},
        )
        request_ids.append(str(second.get("request_id") or ""))
        assert_safe_request(first, token)
        assert_safe_request(second, token)
        require(all(request_ids), "Identifiant de demande absent.")
        require(request_ids[0] != request_ids[1], "Le doublon n'est pas séparé en deux demandes.")
        require(
            first.get("plan_sha256") == second.get("plan_sha256"),
            "Deux préparations identiques n'ont pas le même plan.",
        )

        print(
            "ACTION_LANE_EXTERNAL_PROBE_AWAITING "
            "tools=5 requests=2 distinct=true same_plan=true "
            "execution_tool=false actions_started=false token_leak=false"
        )
        if pause_before_cancel:
            input(
                "Actualisez la file dans OutilsIA et vérifiez les deux demandes "
                "« En attente », puis appuyez sur Entrée pour les annuler. "
            )

        for request_id in request_ids:
            result = client.tool(
                "outilsia_cancel_action_request",
                {"request_id": request_id},
            )
            require(result.get("state") == "cancelled", "Une demande n'a pas été annulée.")
            require(result.get("capability_consumed") is False, "Une capacité annulée a été consommée.")
            require(result.get("result") is None, "Une demande annulée possède un résultat.")

        for request_id in request_ids:
            current = client.tool(
                "outilsia_get_action_request",
                {"request_id": request_id},
            )
            require(current.get("state") == "cancelled", "L'annulation n'est pas durable.")
            require(current.get("result") is None, "Une action annulée a produit un résultat.")

        repeated_cancel = client.request(
            "tools/call",
            {
                "name": "outilsia_cancel_action_request",
                "arguments": {"request_id": request_ids[0]},
            },
        )
        require(
            repeated_cancel.get("error", {}).get("code") == -32602,
            "Une seconde annulation devrait être refusée.",
        )
        cancelled = True
        return {
            "status": "passed",
            "tool_count": len(tool_names),
            "request_count": len(request_ids),
            "requests_distinct": True,
            "plans_equal": True,
            "awaiting_human_observed": True,
            "execute_tool_rejected": True,
            "all_cancelled": True,
            "actions_started": False,
            "token_leaked": False,
        }
    finally:
        if not cancelled:
            for request_id in request_ids:
                if request_id:
                    cancel_if_pending(client, request_id)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sonde externe non destructive de la Local Action Lane OutilsIA."
    )
    parser.add_argument("--url", default="", help="URL http://127.0.0.1:PORT/mcp, jamais un jeton.")
    parser.add_argument("--timeout-seconds", type=float, default=8.0)
    parser.add_argument("--no-pause", action="store_true")
    parser.add_argument("--non-interactive", action="store_true")
    args = parser.parse_args()
    token = ""
    try:
        url, token = resolve_connection(args.url, args.non_interactive)
        result = run_probe(
            url,
            token,
            timeout=max(1.0, min(args.timeout_seconds, 30.0)),
            pause_before_cancel=not args.no_pause,
        )
        summary = (
            "ACTION_LANE_EXTERNAL_PROBE_OK "
            f"tools={result['tool_count']} requests={result['request_count']} "
            "distinct=true same_plan=true awaiting_human=true "
            "execute_rejected=true cancelled=true actions_started=false "
            "token_leak=false"
        )
        require(token not in summary, "Le résumé contient le jeton.")
        print(summary)
        return 0
    except (ProbeFailure, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        message = str(error)
        if token:
            message = message.replace(token, "<redacted>")
        print(f"ACTION_LANE_EXTERNAL_PROBE_FAILED {message}", file=sys.stderr)
        return 1
    finally:
        clear_clipboard()


if __name__ == "__main__":
    raise SystemExit(main())
