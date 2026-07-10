#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"


def main():
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
        page = browser.new_page()
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
    print("arena_objective_ok protocol=outilsia.arena.objective.v1 checks=6")


if __name__ == "__main__":
    main()
