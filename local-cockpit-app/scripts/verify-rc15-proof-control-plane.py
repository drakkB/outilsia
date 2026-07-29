#!/usr/bin/env python3
import re
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
ARTIFACTS = ROOT / ".artifacts" / "rc15-proof-control-plane"
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def visible(page, selector: str) -> bool:
    return page.locator(selector).is_visible()


def assert_no_overflow(page, label: str) -> None:
    metrics = page.evaluate(
        """() => ({
          viewport: innerWidth,
          body: document.body.scrollWidth,
          document: document.documentElement.scrollWidth,
          shell: document.querySelector('#appShell')?.scrollWidth || 0,
          shellClient: document.querySelector('#appShell')?.clientWidth || 0
        })"""
    )
    overflow = max(
        metrics["body"] - metrics["viewport"],
        metrics["document"] - metrics["viewport"],
        metrics["shell"] - metrics["shellClient"],
    )
    if overflow > 1:
        raise AssertionError(f"{label}: horizontal overflow {overflow}px {metrics}")


def assert_initial_contract(page) -> None:
    state = page.evaluate(
        """() => ({
          modeEssential: document.querySelector('#appShell')?.classList.contains('mode-essential'),
          activeStep: document.querySelector('#appShell')?.dataset.essentialStep,
          states: [...document.querySelectorAll('.essential-step')].map((step) => step.dataset.stepState),
          advancedVisible: [...document.querySelectorAll('.advanced-panel')]
            .filter((panel) => panel.offsetParent !== null).length,
          visibleAnalysisActions: [
            '#prepareBtn',
            '#essentialAnalyzeBtn',
            '#quickActionBtn',
            '#readinessBox [data-run-analysis]'
          ].filter((selector) => document.querySelector(selector)?.offsetParent !== null)
        })"""
    )
    assert state["modeEssential"] is True, state
    assert state["activeStep"] == "1", state
    assert state["states"] == ["current", "locked", "locked"], state
    assert state["advancedVisible"] == 0, state
    assert state["visibleAnalysisActions"] == ["#essentialAnalyzeBtn"], state
    assert visible(page, "#essentialJourney")
    assert visible(page, "#essentialAnalyzeBtn")
    assert not visible(page, "#prepareBtn")
    assert not visible(page, ".quick-decision-strip")
    assert page.locator("#essentialTestBtn").is_disabled()
    assert page.locator("#essentialProofBtn").is_disabled()
    assert "Mode avancé" in page.locator(".advanced-workspace-tab").inner_text()


def assert_proof_contract(page) -> dict:
    result = page.evaluate("() => window.__OUTILSIA_TEST__.applyBenchmarkProofState()")
    page.wait_for_function(
        """() => /^[a-f0-9]{64}$/i.test(
          document.querySelector('#proofCardDigestText')?.title || ''
        )"""
    )
    page.evaluate(
        """() => {
          window.__OUTILSIA_TEST__.setWorkspaceTab('overview');
          window.__OUTILSIA_TEST__.setWorkspaceSection(
            'overview',
            '.readiness-panel',
            { focusContent: false }
          );
        }"""
    )
    card = result["proofCard"]
    journey = page.evaluate("() => window.__OUTILSIA_TEST__.essentialJourneyState()")
    assert journey["activeStep"] == 3, journey
    assert journey["scan"]["complete"] is True, journey
    assert journey["test"]["complete"] is True, journey
    assert journey["proof"]["card"]["schema"] == "outilsia.proof_card.v1", journey

    for key in ("cpu", "gpu", "ram_gb", "vram_gb"):
        assert card["machine"].get(key) not in (None, ""), (key, card)
    for key in ("ref", "runtime", "ollama_version"):
        assert card["model"].get(key), (key, card)
    assert card["measurement"]["tokens_per_second"] > 0, card
    assert card["measurement"]["measured_at"], card
    assert card["producer"]["build_id"], card
    assert card["producer"]["source_commit"], card
    assert len(card["limitations"]) >= 2, card
    displayed_digest = page.locator("#proofCardDigestText").get_attribute("title") or ""
    assert re.fullmatch(
        r"[0-9a-f]{64}",
        displayed_digest,
    )
    assert displayed_digest == card["integrity"]["digest"], (
        "Displayed SHA must match the exact exportable card",
        displayed_digest,
        card["integrity"]["digest"],
    )
    foreign_card = page.evaluate(
        """() => {
          const benchmark = window.__OUTILSIA_TEST__.journeyProofBenchmark();
          return window.__OUTILSIA_TEST__.proofCardDraft({
            ...benchmark,
            machine_key: 'another-machine'
          });
        }"""
    )
    assert foreign_card is None, "A benchmark from another machine must never inherit this scan"
    proof_markdown = page.evaluate(
        "(card) => window.__OUTILSIA_TEST__.proofCardMarkdown(card)",
        card,
    )
    for needle in (
        card["measurement"]["measured_at"],
        card["producer"]["build_id"],
        card["producer"]["source_commit"],
        card["integrity"]["digest"],
        "Limite:",
    ):
        assert needle in proof_markdown, (needle, proof_markdown)

    panel_text = page.locator("#readinessBox").inner_text()
    panel_text_folded = panel_text.casefold()
    for needle in (
        card["machine"]["cpu"],
        card["machine"]["gpu"],
        card["model"]["ref"],
        card["model"]["runtime"],
        "SHA-256 de cohérence",
        "Mesurée le",
        "Identité non attestée",
    ):
        assert needle.casefold() in panel_text_folded, (needle, panel_text[:1600])

    for selector in (
        "#copyProofCardBtn",
        "#downloadProofCardBtn",
        "#shareReadinessBtn",
        "#proofConnectMcpBtn",
    ):
        assert visible(page, selector), selector
    assert page.locator("#copyProofCardBtn").is_enabled()
    assert page.locator("#downloadProofCardBtn").is_enabled()
    assert page.locator("#shareReadinessBtn").inner_text().strip() == "Partager la preuve"
    assert not visible(page, "#readinessBox .readiness-actions")
    assert not visible(page, "#readinessBox .readiness-technical")

    page.locator("#essentialProofBtn").click()
    route = page.evaluate(
        """() => ({
          tab: document.querySelector('#appShell')?.dataset.workspaceTab,
          section: document.querySelector('#workspaceSectionSelect')?.value,
          visible: !!document.querySelector('.readiness-panel')?.offsetParent
        })"""
    )
    assert route == {
        "tab": "overview",
        "section": ".readiness-panel",
        "visible": True,
    }, route
    return card


def assert_mcp_onboarding(page) -> None:
    page.locator("#proofConnectMcpBtn").click()
    page.wait_for_timeout(80)
    route = page.evaluate(
        """() => ({
          tab: document.querySelector('#appShell')?.dataset.workspaceTab,
          section: document.querySelector('#workspaceSectionSelect')?.value,
          panelVisible: !!document.querySelector('.local-capability-bridge-panel')?.offsetParent
        })"""
    )
    assert route == {
        "tab": "workflows",
        "section": ".local-capability-bridge-panel",
        "panelVisible": True,
    }, route

    passport = page.evaluate(
        "() => window.__OUTILSIA_TEST__.prepareLocalCapabilityBridgeSnapshot()"
    )
    assert passport["document_kind"] == "capability_snapshot", passport
    assert passport["assurance"]["level"] == "self_consistency_only", passport
    assert re.fullmatch(r"[0-9a-f]{64}", passport["integrity"]["digest"])
    assert not page.locator("#localCapabilityBridgeState").inner_text().startswith("active")
    assert page.locator("#startLocalCapabilityBridgeBtn").is_disabled()
    text = page.locator("#localCapabilityBridgeBox").inner_text()
    assert "application Windows/Linux" in text


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(HTML.as_uri(), wait_until="load")
        page.evaluate("() => localStorage.clear()")
        page.reload(wait_until="load")

        assert_initial_contract(page)
        assert_no_overflow(page, "initial-1440x900")
        page.screenshot(path=str(ARTIFACTS / "01-essential-initial-1440x900.png"), full_page=True)

        card = assert_proof_contract(page)
        assert_no_overflow(page, "proof-1440x900")
        page.screenshot(path=str(ARTIFACTS / "02-proof-1440x900.png"), full_page=True)

        page.evaluate(
            """() => {
              window.__OUTILSIA_TEST__.setWorkspaceTab('overview');
              window.__OUTILSIA_TEST__.setWorkspaceSection(
                'overview',
                '.readiness-panel',
                { focusContent: false }
              );
            }"""
        )
        for width, height in ((1024, 768), (390, 844)):
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_timeout(80)
            assert_no_overflow(page, f"proof-{width}x{height}")
            assert visible(page, "#essentialJourney")
            assert visible(page, ".proof-card-preview")
            page.screenshot(
                path=str(ARTIFACTS / f"03-proof-{width}x{height}.png"),
                full_page=True,
            )

        page.set_viewport_size({"width": 1440, "height": 900})
        assert_mcp_onboarding(page)
        page.screenshot(path=str(ARTIFACTS / "04-mcp-onboarding.png"), full_page=True)
        browser.close()

    print(
        "rc15_proof_control_plane_ok "
        f"model={card['model']['ref']} runtime={card['model']['runtime']} "
        "journey=analyze_test_prove mcp=read_only_guarded viewports=3"
    )


if __name__ == "__main__":
    main()
