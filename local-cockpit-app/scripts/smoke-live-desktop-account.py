#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import secrets
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Live smoke test for the OutilsIA desktop account flow.")
    parser.add_argument("base_url", nargs="?", default="https://outilsia.fr")
    parser.add_argument("--ssh-cleanup", default="", help="Optional SSH target used to remove the temporary user, e.g. root@72.62.183.66")
    parser.add_argument("--remote-db", default="/var/www/outilsia/outilsia.db")
    return parser.parse_args()


class Http:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    def request(self, method: str, path: str, *, data: bytes | None = None, headers: dict | None = None) -> tuple[int, str, str]:
        req = urllib.request.Request(
            self.base_url + path,
            data=data,
            method=method,
            headers={
                "User-Agent": "OutilsIA-Local-Cockpit/0.1 live-account-smoke Mozilla/5.0",
                **(headers or {}),
            },
        )
        try:
            with self.opener.open(req, timeout=30) as response:
                body = response.read().decode("utf-8", errors="replace")
                return response.status, body, response.geturl()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            return exc.code, body, exc.geturl()

    def get_text(self, path: str) -> tuple[int, str, str]:
        return self.request("GET", path)

    def get_json(self, path: str, token: str = "") -> tuple[int, dict]:
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        status, body, _url = self.request("GET", path, headers=headers)
        return status, json.loads(body)

    def post_form(self, path: str, form: dict) -> tuple[int, str, str]:
        data = urllib.parse.urlencode(form).encode("utf-8")
        return self.request(
            "POST",
            path,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    def post_json(self, path: str, payload: dict, token: str = "") -> tuple[int, dict]:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        status, body, _url = self.request("POST", path, data=json.dumps(payload).encode("utf-8"), headers=headers)
        return status, json.loads(body)

    def delete_json(self, path: str, token: str = "") -> tuple[int, dict]:
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        status, body, _url = self.request("DELETE", path, headers=headers)
        return status, json.loads(body)


def assert_status(label: str, status: int, expected: int, payload):
    assert status == expected, f"{label}: expected {expected}, got {status}: {payload}"


def scan_payload(machine_key: str) -> dict:
    return {
        "name": "Live Account Smoke RTX 3090",
        "machine_key": machine_key,
        "source": "tauri-local-cockpit-live-smoke",
        "os_name": "Windows",
        "os_version": "11 smoke",
        "cpu_name": "Ryzen 9 smoke",
        "cpu_cores": 16,
        "ram_gb": 64,
        "gpu_name": "NVIDIA RTX 3090",
        "gpu_vendor": "NVIDIA",
        "gpu_category": "high-end",
        "vram_gb": 24,
        "unified_memory": False,
        "storage_free_gb": 500,
        "runtimes": {
            "ollama": {"installed": True, "version": "ollama smoke"},
            "docker": {"installed": True},
            "wsl": {"installed": True},
        },
        "installed_models": [
            {
                "runtime": "ollama",
                "model_name": "qwen3",
                "model_tag": "latest",
                "size_gb": 5.2,
                "quantization": "Q4",
            },
            {
                "runtime": "ollama",
                "model_name": "hermes3",
                "model_tag": "latest",
                "size_gb": 4.8,
                "quantization": "Q4",
            },
        ],
        "raw_scan": {"smoke": True, "personal_files_read": False},
    }


def limited_scan_payload(machine_key: str) -> dict:
    payload = scan_payload(machine_key)
    payload.update(
        {
            "name": "Live Account Smoke GTX 1660",
            "machine_key": machine_key,
            "cpu_name": "Ryzen 5 smoke",
            "cpu_cores": 6,
            "ram_gb": 16,
            "gpu_name": "NVIDIA GeForce GTX 1660",
            "gpu_category": "entry",
            "vram_gb": 6,
            "storage_free_gb": 60,
            "installed_models": [],
        }
    )
    return payload


def assert_enriched_upgrades(label: str, compat: dict) -> None:
    assert compat.get("upgrade_catalog_version"), f"{label}: upgrade_catalog_version missing"
    assert "affili" in (compat.get("affiliate_disclosure") or "").lower(), f"{label}: disclosure missing"
    upgrades = compat.get("upgrades") or []
    assert upgrades, f"{label}: upgrades missing"
    first = upgrades[0]
    for key in ("id", "component", "price_range_eur", "guide_url", "avoid", "effects"):
        assert first.get(key), f"{label}: upgrade.{key} missing in {first}"
    assert first["guide_url"].startswith("/"), f"{label}: guide_url must be internal"
    assert "tag=boiral21-21" in first.get("url", ""), f"{label}: affiliate tag missing"


def cleanup_remote_user(ssh_target: str, remote_db: str, email: str) -> None:
    if not ssh_target:
        return
    escaped_email = email.replace("'", "''")
    sql = f"""
PRAGMA foreign_keys=OFF;
DELETE FROM desktop_feedback WHERE user_id IN (SELECT id FROM users WHERE email='{escaped_email}');
DELETE FROM machine_share_links WHERE user_id IN (SELECT id FROM users WHERE email='{escaped_email}');
DELETE FROM machine_benchmarks WHERE machine_id IN (SELECT id FROM account_machines WHERE user_id IN (SELECT id FROM users WHERE email='{escaped_email}'));
DELETE FROM compatibility_snapshots WHERE machine_id IN (SELECT id FROM account_machines WHERE user_id IN (SELECT id FROM users WHERE email='{escaped_email}'));
DELETE FROM installed_models WHERE machine_id IN (SELECT id FROM account_machines WHERE user_id IN (SELECT id FROM users WHERE email='{escaped_email}'));
DELETE FROM account_machines WHERE user_id IN (SELECT id FROM users WHERE email='{escaped_email}');
DELETE FROM desktop_tokens WHERE user_id IN (SELECT id FROM users WHERE email='{escaped_email}');
DELETE FROM desktop_pairings WHERE user_id IN (SELECT id FROM users WHERE email='{escaped_email}');
DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE email='{escaped_email}');
DELETE FROM users WHERE email='{escaped_email}';
"""
    quoted = json.dumps(sql)
    remote_cmd = f"python3 - <<'PY'\nimport sqlite3\nconn=sqlite3.connect({json.dumps(remote_db)})\nconn.executescript({quoted})\nconn.commit()\nconn.close()\nprint('remote_cleanup_ok')\nPY"
    subprocess.run(["ssh", ssh_target, remote_cmd], check=False)


def main() -> int:
    args = parse_args()
    http = Http(args.base_url)
    suffix = f"{int(time.time())}-{secrets.token_hex(4)}"
    email = f"desktop-smoke-{suffix}@outilsia.test"
    password = f"Smoke-{secrets.token_hex(8)}"
    machine_key = f"live-account-smoke-{suffix}"
    token = ""
    machine_id = 0
    limited_machine_id = 0
    share_url = ""

    try:
        status, manifest = http.get_json("/api/desktop/manifest")
        assert_status("manifest", status, 200, manifest)
        assert manifest.get("features", {}).get("pairing") is True
        assert manifest.get("features", {}).get("sync_machine") is True
        assert manifest.get("features", {}).get("feedback") is True
        assert manifest.get("upgrade_catalog_version"), manifest

        limited_status, limited = http.post_json("/api/compatibility/check", limited_scan_payload(f"compat-{machine_key}"))
        assert_status("compatibility_limited", limited_status, 200, limited)
        assert_enriched_upgrades("compatibility_limited", limited["compatibility"])

        pair_status, pair = http.post_json("/api/desktop/pair/start", {"device_name": "Live account smoke OutilsIA Local Cockpit"})
        assert_status("pair_start", pair_status, 200, pair)
        assert pair.get("ok") is True and pair.get("code") and pair.get("poll_token")

        claim_status, claim = http.post_json("/api/desktop/pair/claim", {"code": pair["code"], "poll_token": pair["poll_token"]})
        assert_status("pair_claim_pending", claim_status, 200, claim)
        assert claim.get("status") == "pending", claim

        register_status, register_body, _ = http.post_form(
            "/register",
            {"email": email, "password": password, "next": "/compte"},
        )
        assert register_status in (200, 303), (register_status, register_body[:500])

        pair_page_status, pair_page, _ = http.get_text(f"/desktop/pair?code={urllib.parse.quote(pair['code'])}")
        assert_status("pair_page", pair_page_status, 200, pair_page[:500])
        assert "Autoriser cet appareil" in pair_page, pair_page[:500]

        approve_status, approve_body, _ = http.post_form("/desktop/pair/approve", {"code": pair["code"]})
        assert_status("pair_approve", approve_status, 200, approve_body[:500])
        assert (
            "Appareil autorisé" in approve_body
            or "Appareil autorise" in approve_body
            or "Connecté" in approve_body
            or "Connecte" in approve_body
        ), approve_body[:500]

        claim_status, claim = http.post_json("/api/desktop/pair/claim", {"code": pair["code"], "poll_token": pair["poll_token"]})
        assert_status("pair_claim_approved", claim_status, 200, claim)
        assert claim.get("status") == "approved" and claim.get("desktop_token"), claim
        token = claim["desktop_token"]

        scan = scan_payload(machine_key)
        sync_status, synced = http.post_json("/api/desktop/sync", scan, token=token)
        assert_status("desktop_sync", sync_status, 200, synced)
        assert synced.get("ok") is True, synced
        machine_id = int(synced["machine"]["id"])
        assert synced["machine"]["compatibility"]["score"]["score"] >= 90
        assert synced["machine"]["compatibility"]["buying_guides"]

        limited_sync_status, limited_synced = http.post_json(
            "/api/desktop/sync",
            limited_scan_payload(f"limited-{machine_key}"),
            token=token,
        )
        assert_status("desktop_sync_limited", limited_sync_status, 200, limited_synced)
        assert_enriched_upgrades("desktop_sync_limited", limited_synced["machine"]["compatibility"])
        limited_machine_id = int(limited_synced["machine"]["id"])

        limited_memory_status, limited_memory_body, _ = http.request(
            "GET",
            f"/api/desktop/machines/{limited_machine_id}/memoryforge.md",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert_status("desktop_memoryforge_limited", limited_memory_status, 200, limited_memory_body[:500])
        assert "Prix indicatif" in limited_memory_body
        assert "A éviter" in limited_memory_body or "A eviter" in limited_memory_body
        assert "RTX 3060 12 Go" in limited_memory_body

        benchmark_status, benchmark = http.post_json(
            "/api/desktop/benchmarks",
            {
                "machine_key": machine_key,
                "benchmark": {
                    "model_name": "qwen3:latest",
                    "backend": "ollama",
                    "prompt_type": "live-smoke",
                    "tokens_per_second": 42.0,
                    "context_tokens": 64,
                    "notes": "live account smoke desktop benchmark",
                },
            },
            token=token,
        )
        assert_status("desktop_benchmark", benchmark_status, 200, benchmark)
        assert benchmark.get("ok") is True, benchmark

        updates_status, updates = http.get_json("/api/desktop/updates", token=token)
        assert_status("desktop_updates", updates_status, 200, updates)
        assert updates.get("machine_count", 0) >= 1
        assert updates["updates"][0]["recommended_commands"]
        assert "score_after_primary_upgrade" in updates["updates"][0]

        share_status, share = http.post_json(f"/api/account/machines/{machine_id}/share", {}, token=token)
        assert_status("share", share_status, 200, share)
        share_url = share["share_url"]
        report_status, report_body, _ = http.get_text(share_url)
        assert_status("shared_report", report_status, 200, report_body[:500])
        assert "Rapport IA locale OutilsIA" in report_body
        assert machine_key not in report_body

        memory_status, memory_body, _ = http.request(
            "GET",
            f"/api/desktop/machines/{machine_id}/memoryforge.md",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert_status("desktop_memoryforge", memory_status, 200, memory_body[:500])
        assert "## Benchmarks locaux" in memory_body
        assert "## Achats guides OutilsIA" in memory_body
        assert "## Shopping list OutilsIA" in memory_body
        assert "qwen3:latest" in memory_body

        feedback_status, feedback = http.post_json(
            "/api/desktop/feedback",
            {
                "machine_id": machine_id,
                "category": "sync",
                "message": "Live smoke complet du parcours desktop connecte OutilsIA.",
                "app_version": manifest.get("current_version") or "0.1.0",
                "scan": scan,
                "context": {"test": "smoke-live-desktop-account", "base_url": args.base_url},
            },
            token=token,
        )
        assert_status("desktop_feedback", feedback_status, 200, feedback)
        assert feedback.get("ok") is True, feedback

        delete_status, deleted = http.delete_json(f"/api/account/machines/{machine_id}", token=token)
        assert_status("delete_machine", delete_status, 200, deleted)
        assert deleted.get("deleted") is True

        if limited_machine_id:
            limited_delete_status, limited_deleted = http.delete_json(f"/api/account/machines/{limited_machine_id}", token=token)
            assert_status("delete_limited_machine", limited_delete_status, 200, limited_deleted)
            assert limited_deleted.get("deleted") is True

        if share_url:
            deleted_report_status, _deleted_report_body, _ = http.get_text(share_url)
            assert deleted_report_status == 404, deleted_report_status

        revoke_status, revoked = http.post_json("/api/desktop/token/revoke", {}, token=token)
        assert_status("token_revoke", revoke_status, 200, revoked)
        assert revoked.get("revoked") is True

        token_only_http = Http(args.base_url)
        rejected_status, rejected = token_only_http.post_json("/api/desktop/sync", scan, token=token)
        assert rejected_status == 401, (rejected_status, rejected)

        print(
            "live_desktop_account_ok",
            f"user={email}",
            f"machine={machine_id}",
            f"score={synced['machine']['compatibility']['score']['score']}",
            f"benchmark={benchmark['benchmark']['id']}",
            f"feedback={feedback['feedback']['id']}",
            "deleted",
            "revoked",
        )
        return 0
    finally:
        cleanup_remote_user(args.ssh_cleanup, args.remote_db, email)


if __name__ == "__main__":
    raise SystemExit(main())
