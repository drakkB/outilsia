#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
ARTIFACTS = ROOT / ".artifacts" / "visual-ui"
PROFILES = ["polyvalent", "chat", "code", "memory", "french", "portable"]


def main():
    wrong_usage = (
        '{"instruction":"BLEU-47","memory":"RIVIERE-29",'
        '"calculation":42,"correction":"La VRAM accélère l’inférence locale.",'
        '"action":"Tester le modèle puis comparer les résultats.",'
        '"usage":"réponse volontairement hors profil"}'
    )
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(HTML.as_uri(), wait_until="load")
        proofs = page.evaluate(
            """(profiles) => {
              const test = window.__OUTILSIA_TEST__;
              return Object.fromEntries(profiles.map((profile) => [
                profile,
                test.evaluateRecommendationProof(test.demoRecommendationOutput(profile), profile)
              ]));
            }""",
            PROFILES,
        )
        negative = page.evaluate(
            """(value) => ({
              wrongUsage: window.__OUTILSIA_TEST__.evaluateRecommendationProof(value, 'code'),
              malformed: window.__OUTILSIA_TEST__.evaluateRecommendationProof('réponse sans JSON', 'code')
            })""",
            wrong_usage,
        )
        rendered = page.evaluate(
            "() => window.__OUTILSIA_TEST__.applyRecommendationEngineState('code')"
        )
        page.evaluate("() => window.__OUTILSIA_TEST__.setViewMode('advanced')")
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        engine = page.locator(".recommendation-engine-card")
        engine.screenshot(path=str(ARTIFACTS / "recommendation-engine-desktop.png"))
        page.set_viewport_size({"width": 390, "height": 844})
        engine.screenshot(path=str(ARTIFACTS / "recommendation-engine-mobile.png"))
        browser.close()

    for profile, proof in proofs.items():
        assert proof["protocol"] == "outilsia.recommendation.v2", (profile, proof)
        assert proof["score"] == 100, (profile, proof)
        assert proof["passed_count"] == 7, (profile, proof)
        assert proof["total_count"] == 7, (profile, proof)
    assert negative["wrongUsage"]["score"] == 80, negative
    assert negative["wrongUsage"]["passed_count"] == 6, negative
    assert negative["malformed"]["score"] == 0, negative

    decision = rendered["decision"]
    report = rendered["report"]
    recommendation = report["recommendation_engine"]
    assert decision["winner"]["model"] == "qwen3:latest", decision
    assert decision["confidence"] == "solide", decision
    assert decision["verdict"].startswith("Garder qwen3:latest"), decision
    assert "Recommendation Engine v2" in rendered["prepare"], rendered["prepare"]
    assert "Garder qwen3:latest" in rendered["readiness"], rendered["readiness"]
    assert recommendation["protocol"] == "outilsia.recommendation.v2", recommendation
    assert recommendation["winner"]["checks"] == "7/7", recommendation
    assert recommendation["winner"]["resources"]["storage_label"] == "4-6 Go", recommendation
    assert "Recommendation Engine v2" in rendered["markdown"], rendered["markdown"]
    assert "Garder qwen3:latest" in rendered["pdf"], rendered["pdf"]
    assert rendered["bridge"]["recommended_model"] == "qwen3:latest", rendered["bridge"]
    assert rendered["bridge"]["recommendation_engine"]["winner"]["model"] == "qwen3:latest"
    assert rendered["field"]["recommendation_engine_ok"] is True, rendered["field"]
    assert rendered["field"]["recommendation_engine_checks"] == "7/7", rendered["field"]
    assert rendered["staleRecommendation"] is None, rendered["staleRecommendation"]
    print("recommendation_engine_ok protocol=outilsia.recommendation.v2 profiles=6 checks=7")


if __name__ == "__main__":
    main()
