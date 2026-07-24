#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
OUT = ROOT / ".artifacts" / "visual-ui"
OUT.mkdir(parents=True, exist_ok=True)


def verify_viewport(browser, width: int, height: int, label: str) -> Path:
    context = browser.new_context(viewport={"width": width, "height": height})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(HTML.as_uri(), wait_until="load")

    details = page.locator("#agentAdapterPolicyDetails")
    if details.get_attribute("open") is not None:
        raise AssertionError(f"{label}: policy details must be collapsed by default")

    page.locator("#workspaceWorkflowsBtn").click()
    page.evaluate(
        "() => window.__OUTILSIA_TEST__.setWorkspaceSection("
        "'workflows', '.capability-router-panel')"
    )
    proof = page.evaluate(
        "() => window.__OUTILSIA_AGENT_ADAPTER_POLICY_TEST__.applyFixture()"
    )
    page.evaluate(
        "() => window.__OUTILSIA_TEST__.setWorkspaceSection("
        "'workflows', '.capability-router-panel')"
    )
    panel = page.locator(".capability-router-panel")
    panel.scroll_into_view_if_needed()

    if not proof["valid"]:
        raise AssertionError(f"{label}: policy fixture was rejected")
    if proof["summary"] != "1 pilote · 3 détections":
        raise AssertionError(f"{label}: misleading adapter summary {proof['summary']!r}")
    if len(proof["policies"]) != 4:
        raise AssertionError(f"{label}: expected exactly four adapter policies")

    policies = {policy["adapter_id"]: policy for policy in proof["policies"]}
    if policies["codex-cli"]["current_state"] != "bounded_public_pilot":
        raise AssertionError(f"{label}: Codex policy is not bounded")
    for adapter_id in ["claude-code", "hermes-agent", "kimi-code"]:
        policy = policies[adapter_id]
        if policy["current_state"] != "detect_only":
            raise AssertionError(f"{label}: {adapter_id} is not detect-only")
        if policy["execution"]["enabled"]:
            raise AssertionError(f"{label}: {adapter_id} execution is enabled")

    text = details.inner_text()
    for expected in [
        "Ce qui peut réellement s'exécuter",
        "Détecté ne veut pas dire autorisé",
        "Codex CLI",
        "Pilote public borné",
        "Signal Maze uniquement",
        "1 essai",
        "512 Kio",
        "Claude Code",
        "Hermes Agent",
        "Kimi Code",
        "Détection seulement",
        "aucune exécution",
        "Consentement",
    ]:
        if expected.lower() not in text.lower():
            raise AssertionError(f"{label}: missing policy label {expected!r}")
    for forbidden in ["api_key", "sk-", "/home/", "C:\\Users\\"]:
        if forbidden.lower() in text.lower():
            raise AssertionError(f"{label}: private value rendered {forbidden!r}")

    if not page.locator("#copyAgentAdapterPolicyJsonBtn").is_enabled():
        raise AssertionError(f"{label}: policy JSON cannot be copied")
    if not page.locator("#copyAgentAdapterPolicySummaryBtn").is_enabled():
        raise AssertionError(f"{label}: policy summary cannot be copied")
    if page.locator(".agent-adapter-policy-row").count() != 4:
        raise AssertionError(f"{label}: policy rows are incomplete")

    overflow = page.evaluate(
        """() => ({
          viewport: innerWidth,
          body: document.body.scrollWidth,
          doc: document.documentElement.scrollWidth,
          rows: [...document.querySelectorAll(".agent-adapter-policy-row")]
            .map((node) => ({client: node.clientWidth, scroll: node.scrollWidth}))
        })"""
    )
    if max(overflow["body"], overflow["doc"]) > overflow["viewport"] + 2:
        raise AssertionError(f"{label}: horizontal overflow {overflow}")
    if any(row["scroll"] > row["client"] + 2 for row in overflow["rows"]):
        raise AssertionError(f"{label}: policy row overflow {overflow['rows']}")
    if errors:
        raise AssertionError(f"{label}: page errors {errors}")

    screenshot = OUT / f"agent-adapter-policy-{label}.png"
    panel.screenshot(path=str(screenshot))
    context.close()
    return screenshot


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        desktop = verify_viewport(browser, 1440, 1000, "desktop")
        mobile = verify_viewport(browser, 390, 920, "mobile")
        browser.close()
    print(
        f"agent_adapter_policy_ui_ok desktop={desktop} mobile={mobile} "
        "bounded=codex-cli detect_only=claude-code,hermes-agent,kimi-code"
    )


if __name__ == "__main__":
    main()
