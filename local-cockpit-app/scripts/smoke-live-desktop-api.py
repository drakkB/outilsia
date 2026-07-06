#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request


BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "https://outilsia.fr"


def get_json(path: str) -> tuple[int, dict]:
    req = urllib.request.Request(
        BASE_URL + path,
        headers={
            "Accept": "application/json",
            "User-Agent": "OutilsIA-Local-Cockpit/0.1 Mozilla/5.0",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"raw": body}
        return exc.code, parsed


def post_json(path: str, payload: dict) -> tuple[int, dict]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        BASE_URL + path,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "OutilsIA-Local-Cockpit/0.1 Mozilla/5.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"raw": body}
        return exc.code, parsed


def main() -> int:
    manifest_status, manifest = get_json("/api/desktop/manifest")
    assert manifest_status == 200, (manifest_status, manifest)
    assert manifest.get("ok") is True, manifest
    assert manifest.get("features", {}).get("sync_machine") is True, manifest
    assert manifest.get("endpoints", {}).get("desktop_sync") == "/api/desktop/sync", manifest
    assert manifest.get("endpoints", {}).get("desktop_updates") == "/api/desktop/updates", manifest
    assert manifest.get("endpoints", {}).get("desktop_memoryforge") == "/api/desktop/machines/{machine_id}/memoryforge.md", manifest

    pair_status, pair = post_json("/api/desktop/pair/start", {"device_name": "Live smoke OutilsIA Local Cockpit"})
    assert pair_status == 200, (pair_status, pair)
    assert pair.get("ok") is True, pair
    assert pair.get("code") and pair.get("poll_token"), pair

    claim_status, claim = post_json(
        "/api/desktop/pair/claim",
        {"code": pair["code"], "poll_token": pair["poll_token"]},
    )
    assert claim_status == 200, (claim_status, claim)
    assert claim.get("ok") is True and claim.get("status") == "pending", claim

    compat_status, compat = post_json(
        "/api/compatibility/check",
        {
            "name": "RTX 3090 / Live smoke",
            "machine_key": "live-smoke-rtx-3090",
            "source": "tauri-local-cockpit",
            "os_name": "Linux",
            "os_version": "smoke",
            "cpu_name": "Ryzen",
            "cpu_cores": 16,
            "ram_gb": 64,
            "gpu_name": "NVIDIA RTX 3090",
            "gpu_vendor": "NVIDIA",
            "gpu_category": "high-end",
            "vram_gb": 24,
            "unified_memory": False,
            "storage_free_gb": 500,
            "runtimes": {"ollama": {"installed": True, "version": "smoke"}},
            "installed_models": [
                {
                    "runtime": "ollama",
                    "model_name": "qwen3",
                    "model_tag": "latest",
                    "size_gb": 5.2,
                    "quantization": "Q4",
                }
            ],
            "raw_scan": {},
        },
    )
    assert compat_status == 200, (compat_status, compat)
    assert compat.get("ok") is True, compat
    score = compat["compatibility"]["score"]["score"]
    assert score >= 90, score
    assert len(compat["compatibility"]["compatible"]) >= 10

    print("live_desktop_api_ok", manifest.get("current_version"), pair["code"], score, len(compat["compatibility"]["compatible"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
