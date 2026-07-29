#!/usr/bin/env python3
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
ARTIFACTS = ROOT / ".artifacts" / "visual-ui"


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.goto(HTML.as_uri(), wait_until="load")
        result = page.evaluate("() => window.__OUTILSIA_TEST__.applyBenchmarkProofState()")
        page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceTab('overview')")
        page.evaluate(
            "() => window.__OUTILSIA_TEST__.setWorkspaceSection("
            "'overview', '.readiness-panel', { focusContent: false })"
        )

        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        panel = page.locator(".readiness-panel")
        assert panel.is_visible()
        panel.screenshot(path=str(ARTIFACTS / "benchmark-proof-1440x1000.png"))

        for width, height in ((1024, 768), (390, 844)):
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_timeout(80)
            overflow = page.evaluate(
                "() => ({"
                " body: document.body.scrollWidth - document.body.clientWidth,"
                " shell: document.querySelector('#appShell').scrollWidth"
                " - document.querySelector('#appShell').clientWidth"
                "})"
            )
            assert overflow["body"] <= 1, (width, overflow)
            assert overflow["shell"] <= 1, (width, overflow)
            panel.screenshot(
                path=str(ARTIFACTS / f"benchmark-proof-{width}x{height}.png")
            )

        assert page.locator("#copyProofCardBtn").is_enabled()
        assert page.locator("#downloadProofCardBtn").is_enabled()
        share_flow = page.evaluate(
            "() => window.__OUTILSIA_TEST__.applyProofShareFlow()"
        )
        page.once("dialog", lambda dialog: dialog.accept())
        revoke_flow = page.evaluate(
            "() => window.__OUTILSIA_TEST__.revokeProofShareFlow()"
        )
        panel_text = panel.inner_text()
        browser.close()

    protocol = result["protocol"]
    bottleneck = result["bottleneck"]
    card = result["proofCard"]
    privacy = result["privacy"]
    passport = result["passport"]
    serialized_card = json.dumps(card, ensure_ascii=False)

    assert protocol["schema"] == "outilsia.benchmark_protocol.v2"
    assert protocol["protocol_version"] == "2.0.0"
    assert protocol["binding"]["prompt_kind"] == "outilsia_vram_standard_v1"
    assert protocol["binding"]["settings"]["num_ctx"] == 2048
    assert protocol["binding"]["settings"]["num_predict"] == 96
    assert protocol["binding"]["settings"]["seed"] == 42
    assert protocol["measurement"]["exact"] is True
    assert protocol["measurement"]["allocation_measured"] is True
    assert protocol["eligibility"]["standard_comparison"] is True

    assert bottleneck["schema"] == "outilsia.bottleneck_explainer.v1"
    assert bottleneck["primary"]["key"] == "no_observed_hardware_bottleneck"
    assert bottleneck["primary"]["confidence"] == "high"
    assert bottleneck["purchase"]["key"] == "no_buy"
    assert bottleneck["semantics"]["hypotheses_are_not_proof"] is True

    assert card["schema"] == "outilsia.proof_card.v1"
    assert card["badge"]["key"] == "standard_measured"
    assert card["badge"]["verified"] is False
    assert card["assurance"]["identity_verified"] is False
    assert card["assurance"]["digest_semantics"] == "coherence_only"
    assert re.fullmatch(r"[0-9a-f]{64}", card["integrity"]["digest"])
    assert card["integrity"]["verification_semantics"] == "coherence_not_provenance"
    assert privacy == {"ok": True, "violations": []}
    for forbidden in (
        "demo-local",
        "RTX 3090 / Ryzen 9",
        "Pourquoi la VRAM est importante",
        "La VRAM stocke les poids",
    ):
        assert forbidden not in serialized_card, forbidden

    assert passport["passport_version"] == "1.5.0"
    assert passport["capabilities"]["benchmark_protocol_v2"] is True
    assert passport["capabilities"]["bottleneck_explainer_v1"] is True
    assert passport["capabilities"]["proof_card_v1"] is True
    assert passport["proof_card"]["badge"]["verified"] is False
    assert passport["benchmark_proofs"][0]["protocol"]["schema"] == "outilsia.benchmark_protocol.v2"
    assert result["bridgePayload"]["proof_card"]["schema"] == "outilsia.proof_card.v1"
    assert share_flow["machine_id"] == 1
    assert share_flow["benchmark_synced"] is True
    assert share_flow["share_url"] == "https://outilsia.fr/r/demo"
    assert share_flow["shared"] is True
    assert share_flow["revoke_enabled"] is True
    assert revoke_flow["share_url"] == ""
    assert revoke_flow["shared"] is False
    assert revoke_flow["revoke_enabled"] is True
    assert "Goulot principal" in result["markdown"]
    assert "Décision achat" in result["markdown"]
    assert "Carte de preuve" in result["memory"]
    panel_text_lower = panel_text.lower()
    assert "protocole standard mesuré" in panel_text_lower
    assert "aucun goulot matériel prouvé" in panel_text_lower
    assert "aucun achat prioritaire" in panel_text_lower
    assert "identité non attestée" in panel_text_lower

    print(
        "benchmark_proof_ui_ok "
        "viewports=3 protocol=v2 bottleneck=no_buy proof_card=private passport=1.5.0"
    )


if __name__ == "__main__":
    main()
