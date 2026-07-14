#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
APP = ROOT / "src" / "app.js"
HUB = ROOT.parent / "server-work" / "static" / "pages" / "scanner-ia-local.html"
DOWNLOAD = ROOT.parent / "server-work" / "static" / "pages" / "telecharger-scanner-ia-local.html"
LLMS = ROOT.parent / "server-work" / "static" / "llms.txt"


def main():
    app = APP.read_text(encoding="utf-8")
    hub = HUB.read_text(encoding="utf-8")
    download = DOWNLOAD.read_text(encoding="utf-8")
    llms = LLMS.read_text(encoding="utf-8")
    assert "Math.max(60, benchmarkTimeoutSeconds(ref))" in app
    assert "incomplete_count: incomplete.length" in app
    assert 'benchmarkTimedOut(result) ? "délai dépassé" : "erreur"' in app
    assert 'benchmarkTimedOut(item) ? "incomplete-run" : "bad-run"' in app
    assert "Préflight Arena · candidat source" in hub
    assert "Préflight Arena · candidat source" in download
    assert "Benchmark and Arena Preflight (source candidate, not in the current public build)" in llms
    assert "zéro téléchargement" in hub and "zéro téléchargement" in download
    assert "La preuve versionnée reste attachée" in hub
    assert "Le runtime et le budget restent visibles" in download
    assert "versioned preflight proof remains attached" in llms
    assert "Preuve physique candidate · 14 juillet 2026" in hub
    assert "Mixtral 8x7B 26 Go termine via Ollama WSL" in download
    assert "Physical candidate proof (2026-07-14)" in llms
    assert "48,3 s à 4,1 tok/s" in hub and "48,3 s à 4,1 tok/s" in download
    assert "33,3 %" in hub and "33,3 %" in download
    assert "48.3 seconds at 4.1 tok/s" in llms and "33.3% GPU offload" in llms
    valid = (
        '{"instruction":"BLEU-47","memory":"RIVIERE-29",'
        '"calculation":42,"correction":"La VRAM accélère l’inférence locale.",'
        '"action":"Tester le modèle puis comparer les résultats."}'
    )
    partial = (
        '{"instruction":"BLEU-47","memory":"AUTRE",'
        '"calculation":41,"correction":"La VRAM accélère l’inférence locale.",'
        '"action":"Tester le modèle puis comparer les résultats."}'
    )
    fenced = f"```json\n{valid}\n```"
    extra_key = valid[:-1] + ',"comment":"inutile"}'
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(HTML.as_uri(), wait_until="load")
        result = page.evaluate(
            """([valid, partial, fenced, extraKey]) => {
              const evaluate = window.__OUTILSIA_TEST__.evaluateArenaObjective;
              return {
                valid: evaluate(valid),
                fenced: evaluate(fenced),
                partial: evaluate(partial),
                extraKey: evaluate(extraKey),
                malformed: evaluate('réponse sans JSON')
              };
            }""",
            [valid, partial, fenced, extra_key],
        )
        rendered = page.evaluate("() => window.__OUTILSIA_TEST__.applyObjectiveArenaState()")
        field_entry = page.evaluate("() => window.__OUTILSIA_TEST__.fieldTestEntry()")
        arena_preflight = page.evaluate("() => window.__OUTILSIA_TEST__.applyArenaPreflightState()")
        page.evaluate("""() => {
          window.__OUTILSIA_TEST__.setWorkspaceTab('tests');
          window.__OUTILSIA_TEST__.setWorkspaceSection('tests', '.arena-panel');
        }""")
        preflight_visible = page.locator(".arena-preflight").is_visible(timeout=5000)
        page.set_viewport_size({"width": 390, "height": 844})
        mobile = page.evaluate("""() => ({
          viewport: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          rows: document.querySelectorAll('.arena-preflight-row').length,
          rowColumns: getComputedStyle(document.querySelector('.arena-preflight-row')).gridTemplateColumns
            .split(' ')
            .filter(Boolean).length
        })""")
        arena_run_guard = page.evaluate("() => window.__OUTILSIA_TEST__.runArenaPreflightHarness()")
        browser.close()

    assert result["valid"]["score"] == 100, result
    assert result["valid"]["passed_count"] == 6, result
    assert result["fenced"]["score"] == 100, result
    assert result["partial"]["score"] == 66, result
    failed = {check["key"] for check in result["partial"]["checks"] if not check["passed"]}
    assert failed == {"memory", "calculation"}, result
    assert result["extraKey"]["score"] == 80, result
    assert result["extraKey"]["valid_json"] is False, result
    assert result["malformed"]["score"] == 0, result
    assert result["malformed"]["valid_json"] is False, result
    assert "Protocole objectif v1" in rendered["arena"], rendered
    assert "Preuve objective 6/6" in rendered["arena"], rendered
    assert "Arena objective v1" in rendered["memory"], rendered
    assert rendered["bridge"]["arena_proof"]["objective"] is True, rendered
    assert rendered["bridge"]["arena_proof"]["results"][0]["objective_checks"] == "6/6", rendered
    assert field_entry["arena_objective"] is True, field_entry
    assert field_entry["arena_protocol"] == "outilsia.arena.objective.v1", field_entry
    assert field_entry["arena_objective_best_checks"] == "6/6", field_entry
    assert arena_preflight["preferred"]["refs"] == ["qwen3:0.6b", "hermes3:8b", "qwen3:14b"], arena_preflight
    assert arena_preflight["preferred"]["budgetMinutes"] == 3, arena_preflight
    assert arena_preflight["preferred"]["warningCount"] == 0, arena_preflight
    assert arena_preflight["preferred"]["canRun"] is True, arena_preflight
    assert arena_preflight["heavy"]["refs"] == ["qwen3:0.6b", "hermes3:8b", "nous-hermes2-mixtral:8x7b"], arena_preflight
    assert arena_preflight["heavy"]["budgetMinutes"] == 4, arena_preflight
    assert arena_preflight["heavy"]["warningCount"] == 1, arena_preflight
    assert arena_preflight["heavy"]["canRun"] is True, arena_preflight
    mixtral = next(item for item in arena_preflight["heavy"]["details"] if item["ref"] == "nous-hermes2-mixtral:8x7b")
    assert mixtral == {
        "ref": "nous-hermes2-mixtral:8x7b",
        "runtime": "wsl",
        "sizeGb": 26,
        "timeoutSeconds": 120,
        "tone": "warning",
    }, arena_preflight
    for expected in ("Préflight Arena", "Ollama WSL", "26 Go", "offload", "zéro téléchargement"):
        assert expected in arena_preflight["panel"], (expected, arena_preflight)
    assert arena_preflight["button"] == "Lancer Arena · ≤ 4 min", arena_preflight
    for expected in ("3 modèles installés", "4 minutes", "Téléchargements : 0", "nous-hermes2-mixtral:8x7b"):
        assert expected in arena_preflight["confirmation"], (expected, arena_preflight)
    assert preflight_visible is True
    assert mobile["scrollWidth"] <= mobile["viewport"] + 1, mobile
    assert mobile["rows"] == 3 and mobile["rowColumns"] == 1, mobile
    assert arena_run_guard["cancelledRun"] is None, arena_run_guard
    assert len(arena_run_guard["confirmations"]) == 2, arena_run_guard
    assert all("Téléchargements : 0" in prompt and "4 minutes" in prompt for prompt in arena_run_guard["confirmations"]), arena_run_guard
    assert arena_run_guard["acceptedRun"]["protocol"] == "outilsia.arena.objective.v1", arena_run_guard
    assert [item["model"] for item in arena_run_guard["acceptedRun"]["results"]] == arena_preflight["heavy"]["refs"], arena_run_guard
    saved_preflight = arena_run_guard["acceptedRun"]["preflight"]
    assert saved_preflight["schema"] == "outilsia.arena.preflight.v1", arena_run_guard
    assert saved_preflight["budget_minutes"] == 4 and saved_preflight["downloads"] == 0, arena_run_guard
    assert saved_preflight["sequential"] is True, arena_run_guard
    assert [item["runtime"] for item in saved_preflight["candidates"]] == ["wsl", "wsl", "wsl"], arena_run_guard
    assert all(item["arena_preflight_schema"] == "outilsia.arena.preflight.v1" for item in arena_run_guard["acceptedRun"]["results"]), arena_run_guard
    assert all(item["arena_runtime"] == "wsl" and item["arena_runtime_label"] == "Ollama WSL" for item in arena_run_guard["acceptedRun"]["results"]), arena_run_guard
    assert [item["arena_timeout_seconds"] for item in arena_run_guard["acceptedRun"]["results"]] == [60, 60, 120], arena_run_guard
    assert arena_run_guard["reportArena"]["preflight"]["schema"] == "outilsia.arena.preflight.v1", arena_run_guard
    assert [item["runtime"] for item in arena_run_guard["reportArena"]["proof_results"]] == ["wsl", "wsl", "wsl"], arena_run_guard
    assert arena_run_guard["fieldEntry"]["arena_preflight_schema"] == "outilsia.arena.preflight.v1", arena_run_guard
    assert arena_run_guard["fieldEntry"]["arena_preflight_budget_minutes"] == 4, arena_run_guard
    assert arena_run_guard["fieldEntry"]["arena_preflight_downloads"] == 0, arena_run_guard
    assert "qwen3:0.6b:wsl" in arena_run_guard["fieldEntry"]["arena_preflight_runtimes"], arena_run_guard
    for proof_text in (arena_run_guard["panel"], arena_run_guard["markdown"], arena_run_guard["memory"], arena_run_guard["history"]):
        assert "Ollama WSL" in proof_text and "taille installée" in proof_text, arena_run_guard
    assert arena_run_guard["busy"] is False and arena_run_guard["buttonDisabled"] is False, arena_run_guard
    assert arena_run_guard["button"] == "Lancer Arena · ≤ 4 min", arena_run_guard
    print("arena_objective_ok protocol=outilsia.arena.objective.v1 checks=6 preflight=3-models/4-min mobile=ok")


if __name__ == "__main__":
    main()
