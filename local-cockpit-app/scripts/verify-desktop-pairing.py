#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
import tempfile

from fastapi import FastAPI
from fastapi.testclient import TestClient


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SERVER = os.path.join(ROOT, "server-work")
sys.path.insert(0, SERVER)

from routers.ops_routes import create_ops_router  # noqa: E402

AMAZON_TAG = os.environ.get("OUTILSIA_AMAZON_TAG", "boiral21-21")


def _ip(_request):
    return "127.0.0.1"


def _rate_limit(_ip_value, _endpoint):
    return True, "", 0, 0


def _rate_limit_response(*_args):
    raise AssertionError("unexpected rate limit")


def _admin_key_valid(_request):
    return True


def _admin_denied_response(*_args, **_kwargs):
    raise AssertionError("unexpected admin denied")


def build_app(db_path: str) -> FastAPI:
    app = FastAPI()
    app.include_router(
        create_ops_router(
            base_dir=SERVER,
            db_path=db_path,
            get_real_ip=_ip,
            check_rate_limit=_rate_limit,
            rate_limit_response=_rate_limit_response,
            verify_turnstile_token=lambda *_args, **_kwargs: True,
            turnstile_failed_response=lambda: None,
            admin_key_valid=_admin_key_valid,
            admin_denied_response=_admin_denied_response,
        )
    )
    return app


def assert_enriched_upgrades(label: str, compat: dict) -> None:
    assert compat.get("upgrade_catalog_version"), f"{label}: upgrade_catalog_version missing"
    assert "affili" in (compat.get("affiliate_disclosure") or "").lower(), f"{label}: disclosure missing"
    upgrades = compat.get("upgrades") or []
    assert upgrades, f"{label}: upgrades missing"
    first = upgrades[0]
    for key in ("id", "component", "price_range_eur", "guide_url", "avoid", "effects"):
        assert first.get(key), f"{label}: upgrade.{key} missing in {first}"
    assert first["guide_url"].startswith("/"), f"{label}: guide_url must be internal"
    assert f"tag={AMAZON_TAG}" in first.get("url", ""), f"{label}: affiliate tag missing"


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        client = TestClient(build_app(os.path.join(tmp, "outilsia-test.db")), base_url="https://testserver")
        manifest = client.get("/api/desktop/manifest").json()
        assert manifest["ok"] is True
        assert manifest["upgrade_catalog_version"]

        pair = client.post("/api/desktop/pair/start", json={"device_name": "Verify RTX 3090"}).json()
        assert pair["ok"] is True
        assert pair["code"]
        assert pair["poll_token"]

        pending = client.post(
            "/api/desktop/pair/claim",
            json={"code": pair["code"], "poll_token": pair["poll_token"]},
        ).json()
        assert pending["status"] == "pending"

        register = client.post(
            "/register",
            data={"email": "desktop-verify@example.com", "password": "password123", "next": "/compte"},
            follow_redirects=False,
        )
        assert register.status_code == 303
        assert client.cookies.get("outilsia_session")

        page = client.get("/desktop/pair", params={"code": pair["code"]})
        assert page.status_code == 200
        assert "Autoriser cet appareil" in page.text

        approve = client.post("/desktop/pair/approve", data={"code": pair["code"]})
        assert approve.status_code == 200

        claimed = client.post(
            "/api/desktop/pair/claim",
            json={"code": pair["code"], "poll_token": pair["poll_token"]},
        ).json()
        assert claimed["status"] == "approved"
        assert claimed["desktop_token"]

        scan = {
            "name": "RTX 3090 / Verify",
            "machine_key": "verify-rtx-3090",
            "source": "tauri-local-cockpit",
            "os_name": "Linux",
            "os_version": "test",
            "cpu_name": "Ryzen",
            "cpu_cores": 16,
            "ram_gb": 64,
            "gpu_name": "NVIDIA RTX 3090",
            "gpu_vendor": "NVIDIA",
            "gpu_category": "high-end",
            "vram_gb": 24,
            "unified_memory": False,
            "storage_free_gb": 500,
            "runtimes": {"ollama": {"installed": True, "version": "test"}},
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
        }
        synced = client.post(
            "/api/desktop/sync",
            json=scan,
            headers={"Authorization": f"Bearer {claimed['desktop_token']}"},
        ).json()
        assert synced["ok"] is True
        assert synced["machine"]["id"] == 1
        assert synced["machine"]["compatibility"]["score"]["score"] >= 90
        assert synced["machine"]["compatibility"]["buying_guides"]
        assert synced["memoryforge_url"].endswith("/memoryforge.md")

        limited_scan = dict(scan)
        limited_scan.update(
            {
                "name": "GTX 1660 / Verify",
                "machine_key": "verify-gtx-1660",
                "cpu_name": "Ryzen 5",
                "cpu_cores": 6,
                "ram_gb": 16,
                "gpu_name": "NVIDIA GTX 1660",
                "gpu_category": "entry",
                "vram_gb": 6,
                "storage_free_gb": 60,
                "installed_models": [],
            }
        )
        limited_compat = client.post("/api/compatibility/check", json=limited_scan).json()
        assert limited_compat["ok"] is True
        assert_enriched_upgrades("compatibility_limited", limited_compat["compatibility"])
        limited_synced = client.post(
            "/api/desktop/sync",
            json=limited_scan,
            headers={"Authorization": f"Bearer {claimed['desktop_token']}"},
        ).json()
        assert limited_synced["ok"] is True
        assert_enriched_upgrades("desktop_sync_limited", limited_synced["machine"]["compatibility"])
        limited_memoryforge = client.get(
            f"/api/desktop/machines/{limited_synced['machine']['id']}/memoryforge.md",
            headers={"Authorization": f"Bearer {claimed['desktop_token']}"},
        )
        assert limited_memoryforge.status_code == 200
        assert "Prix indicatif" in limited_memoryforge.text
        assert "A éviter" in limited_memoryforge.text or "A eviter" in limited_memoryforge.text
        assert "RTX 3060 12 Go" in limited_memoryforge.text

        benchmark = client.post(
            "/api/desktop/benchmarks",
            json={
                "machine_key": scan["machine_key"],
                "benchmark": {
                    "model_name": "qwen3:latest",
                    "backend": "ollama",
                    "prompt_type": "short-local",
                    "tokens_per_second": 37.5,
                    "context_tokens": 45,
                    "notes": "verification benchmark desktop",
                },
            },
            headers={"Authorization": f"Bearer {claimed['desktop_token']}"},
        ).json()
        assert benchmark["ok"] is True
        assert benchmark["benchmark"]["model_name"] == "qwen3:latest"
        assert benchmark["benchmark"]["tokens_per_second"] == 37.5

        machine_json = client.get(f"/api/account/machines/{synced['machine']['id']}").json()
        assert machine_json["ok"] is True
        assert machine_json["machine"]["benchmarks"][0]["model_name"] == "qwen3:latest"

        updates = client.get(
            "/api/desktop/updates",
            headers={"Authorization": f"Bearer {claimed['desktop_token']}"},
        ).json()
        assert updates["ok"] is True
        assert updates["machine_count"] >= 2
        update_by_id = {item["machine_id"]: item for item in updates["updates"]}
        main_update = update_by_id[synced["machine"]["id"]]
        assert main_update["score"]["score"] >= 90
        assert main_update["buying_guides"]
        assert main_update["recommended_commands"]
        assert main_update["recommended_commands"][0]["command"].startswith("ollama run ")
        assert "unlocked_by_primary_upgrade" in main_update
        limited_update = update_by_id[limited_synced["machine"]["id"]]
        assert limited_update["primary_upgrade"]
        assert limited_update["score_after_primary_upgrade"]["score"] >= limited_update["score"]["score"]

        share = client.post(f"/api/account/machines/{synced['machine']['id']}/share").json()
        assert share["ok"] is True
        assert share["share_url"].startswith("/r/")
        shared_report = client.get(share["share_url"])
        assert shared_report.status_code == 200
        assert "OutilsIA" in shared_report.text
        assert "NVIDIA RTX 3090" in shared_report.text
        assert scan["machine_key"] not in shared_report.text

        token_only_share_client = TestClient(client.app, base_url="https://testserver")
        token_share = token_only_share_client.post(
            f"/api/account/machines/{synced['machine']['id']}/share",
            headers={"Authorization": f"Bearer {claimed['desktop_token']}"},
        ).json()
        assert token_share["ok"] is True
        assert token_share["share_url"].startswith("/r/")

        feedback = client.post(
            "/api/desktop/feedback",
            json={
                "machine_id": synced["machine"]["id"],
                "category": "detection",
                "message": "La verification beta confirme le canal feedback desktop.",
                "scan": scan,
                "context": {"test": "verify-desktop-pairing"},
            },
            headers={"Authorization": f"Bearer {claimed['desktop_token']}"},
        ).json()
        assert feedback["ok"] is True
        assert feedback["feedback"]["category"] == "detection"
        assert feedback["feedback"]["machine_id"] == synced["machine"]["id"]

        short_feedback = client.post(
            "/api/desktop/feedback",
            json={"category": "detection", "message": "court"},
            headers={"Authorization": f"Bearer {claimed['desktop_token']}"},
        )
        assert short_feedback.status_code == 400

        admin_feedback = client.get("/admin/api/desktop-feedback", params={"key": "ok"}).json()
        assert admin_feedback["ok"] is True
        assert admin_feedback["items"][0]["id"] == feedback["feedback"]["id"]
        assert admin_feedback["items"][0]["category"] == "detection"
        assert admin_feedback["items"][0]["scan"]["gpu_name"] == "NVIDIA RTX 3090"

        admin_feedback_page = client.get("/admin/desktop-feedback", params={"key": "ok"})
        assert admin_feedback_page.status_code == 200
        assert "Feedback beta Local Cockpit" in admin_feedback_page.text
        assert "La verification beta confirme" in admin_feedback_page.text

        memoryforge = client.get(f"/api/account/machines/{synced['machine']['id']}/memoryforge.md")
        assert memoryforge.status_code == 200
        assert "## Benchmarks locaux" in memoryforge.text
        assert "## Achats guides OutilsIA" in memoryforge.text
        assert "## Shopping list OutilsIA" in memoryforge.text
        assert "qwen3:latest" in memoryforge.text

        desktop_memoryforge = client.get(
            f"/api/desktop/machines/{synced['machine']['id']}/memoryforge.md",
            headers={"Authorization": f"Bearer {claimed['desktop_token']}"},
        )
        assert desktop_memoryforge.status_code == 200
        assert "NVIDIA RTX 3090" in desktop_memoryforge.text
        assert "## Achats guides OutilsIA" in desktop_memoryforge.text
        assert "## Shopping list OutilsIA" in desktop_memoryforge.text

        deleted = client.delete(f"/api/account/machines/{synced['machine']['id']}").json()
        assert deleted["ok"] is True
        assert deleted["deleted"] is True

        deleted_machine = client.get(f"/api/account/machines/{synced['machine']['id']}")
        assert deleted_machine.status_code == 404
        deleted_report = client.get(share["share_url"])
        assert deleted_report.status_code == 404

        revoked = client.post(
            "/api/desktop/token/revoke",
            headers={"Authorization": f"Bearer {claimed['desktop_token']}"},
        ).json()
        assert revoked["ok"] is True
        assert revoked["revoked"] is True

        token_only_client = TestClient(client.app, base_url="https://testserver")
        rejected = token_only_client.post(
            "/api/desktop/sync",
            json=scan,
            headers={"Authorization": f"Bearer {claimed['desktop_token']}"},
        )
        assert rejected.status_code == 401

        print(
            "desktop_pairing_ok",
            pair["code"],
            synced["machine"]["compatibility"]["score"]["score"],
            synced["memoryforge_url"],
            f"benchmark#{benchmark['benchmark']['id']}",
            f"feedback#{feedback['feedback']['id']}",
            "revoked",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
