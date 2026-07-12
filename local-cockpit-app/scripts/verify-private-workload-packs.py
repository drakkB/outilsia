#!/usr/bin/env python3
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
APP = ROOT / "src" / "app.js"
ARTIFACTS = ROOT / ".artifacts" / "visual-ui"


def main():
    html = HTML.read_text(encoding="utf-8")
    app = APP.read_text(encoding="utf-8")

    assert 'class="panel private-workload-panel advanced-panel"' in html
    assert "window.confirm" in app[app.index("async function runPrivateWorkloadPack"):app.index("async function copyPrivateWorkloadProof")]
    assert "installRecommendedModel" not in app[app.index("async function runPrivateWorkloadPack"):app.index("async function copyPrivateWorkloadProof")]

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 960})
        page.goto(HTML.as_uri(), wait_until="load")
        panel = page.locator(".private-workload-panel")
        assert not panel.is_visible(), "Tests privés must stay out of Essential mode"
        page.evaluate("() => window.__OUTILSIA_TEST__.setViewMode('advanced')")
        assert panel.is_visible(), "Tests privés must be available in Details mode"

        code_good = page.evaluate(
            """() => window.__OUTILSIA_TEST__.evaluatePrivateWorkloadPack(
              JSON.stringify({
                answer: 'function add(a,b){return a + b;}',
                evidence: 'L addition corrigée donne la somme 9.',
                action: 'Tester add(4,5).'
              }),
              'code',
              []
            )"""
        )
        code_bad = page.evaluate(
            "() => window.__OUTILSIA_TEST__.evaluatePrivateWorkloadPack('réponse libre non JSON', 'code', [])"
        )
        custom_good = page.evaluate(
            """() => window.__OUTILSIA_TEST__.evaluatePrivateWorkloadPack(
              JSON.stringify({
                answer: 'DOSSIER-PRIVATE-7788 est traité en validation-locale.',
                evidence: 'Les termes sont présents.',
                action: 'Vérifier puis comparer.'
              }),
              'custom',
              ['dossier-private-7788', 'validation-locale']
            )"""
        )
        custom_partial = page.evaluate(
            """() => window.__OUTILSIA_TEST__.evaluatePrivateWorkloadPack(
              JSON.stringify({answer: 'DOSSIER-PRIVATE-7788', evidence: 'partiel', action: 'Vérifier'}),
              'custom',
              ['dossier-private-7788', 'validation-locale']
            )"""
        )
        result = page.evaluate("() => window.__OUTILSIA_TEST__.applyPrivateWorkloadPackState()")
        installed_models = page.evaluate("() => window.__OUTILSIA_TEST__.privateWorkloadInstalledModels()")

        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        panel.screenshot(path=str(ARTIFACTS / "private-workload-packs-desktop.png"))
        page.set_viewport_size({"width": 390, "height": 844})
        panel.screenshot(path=str(ARTIFACTS / "private-workload-packs-mobile.png"))
        browser.close()

    catalog = result["catalog"]
    policy = catalog["policy"]
    assert catalog["schema"] == "outilsia.private_workload_pack_catalog.v1"
    assert [pack["key"] for pack in catalog["packs"]] == ["code", "french", "summary", "memory", "custom"]
    assert policy["local_only"] is True
    assert policy["cloud_upload"] is False
    assert policy["installed_models_only"] is True
    assert policy["downloads_per_run"] == 0
    assert policy["min_models_per_run"] == 2
    assert policy["max_models_per_run"] == 3
    assert policy["timeout_seconds_per_model"] == 60
    assert policy["persist_raw_custom_prompt"] is False
    assert policy["persist_raw_model_output"] is False
    assert policy["include_raw_content_in_passport"] is False

    assert code_good["score"] == 100, code_good
    assert code_good["valid_json"] is True
    assert code_bad["score"] == 0, code_bad
    assert custom_good["score"] == 100, custom_good
    assert custom_partial["score"] < custom_good["score"], custom_partial
    assert installed_models == ["qwen3:0.6b", "hermes3:8b", "qwen3:latest"], installed_models

    run = result["run"]
    assert run["schema"] == "outilsia.private_workload_run.v1"
    assert run["protocol"] == "outilsia.private_workload_pack.v1"
    assert run["pack"] == "custom"
    assert run["custom"] is True
    assert run["prompt_persisted"] is False
    assert run["model_count"] == 2
    assert run["winner"]["model"] == "qwen3:0.6b"
    assert run["winner"]["score"] == 100
    assert run["confidence"] == "élevée"
    assert re.fullmatch(r"[0-9a-f]{64}", run["prompt_digest"])
    assert run["privacy"] == {
        "local_only": True,
        "cloud_upload": False,
        "prompt_persisted": False,
        "output_persisted": False,
        "raw_content_in_passport": False,
    }
    assert len(result["stored"]) == 1
    for item in run["results"]:
        assert item["output_persisted"] is False
        assert re.fullmatch(r"[0-9a-f]{64}", item["output_digest"])
        assert "output_preview" not in item

    summary = result["summary"]
    assert summary["privacy"]["local_only"] is True
    assert summary["privacy"]["cloud_upload"] is False
    assert summary["privacy"]["raw_content_included"] is False
    assert result["report"]["private_workload_pack"]["winner"]["model"] == "qwen3:0.6b"
    assert result["passportVerified"] is True
    assert result["passport"]["capabilities"]["private_workload_packs_v1"] is True
    assert result["passport"]["privacy"]["excludes_private_workload_prompts"] is True
    assert result["passport"]["privacy"]["excludes_private_workload_outputs"] is True
    assert result["passport"]["private_workload_pack"]["prompt_persisted"] is False
    assert "# Tests privés OutilsIA" in result["markdown"]
    assert "Consigne brute conservée: non" in result["markdown"]
    assert "Réponses brutes conservées: non" in result["markdown"]
    assert "Tests privés" in result["memory"]
    assert "Tests privés" in result["pdf"]
    assert "contenu brut non conservé" in result["panel"].lower()

    private_exports = json.dumps(
        {
            "run": result["run"],
            "stored": result["stored"],
            "summary": result["summary"],
            "markdown": result["markdown"],
            "report": result["report"]["private_workload_pack"],
            "memory": result["memory"],
            "passport": result["passport"],
            "pdf": result["pdf"],
            "panel": result["panel"],
        },
        ensure_ascii=False,
    ).lower()
    for secret in (
        result["secretPrompt"].lower(),
        "dossier-private-7788",
        "validation-locale",
        "les deux termes obligatoires sont présents",
    ):
        assert secret not in private_exports, f"private content leaked: {secret}"

    print(
        "private_workload_packs_ok "
        f"catalog={catalog['version']} packs={len(catalog['packs'])} "
        f"winner={run['winner']['model']} privacy=raw-content-excluded"
    )


if __name__ == "__main__":
    main()
