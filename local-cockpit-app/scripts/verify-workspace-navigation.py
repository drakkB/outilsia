#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
OUT = ROOT / ".artifacts" / "visual-ui"
OUT.mkdir(parents=True, exist_ok=True)

WORKSPACES = {
    "overview": ("workspaceOverviewBtn", 2),
    "machine": ("workspaceMachineBtn", 7),
    "models": ("workspaceModelsBtn", 6),
    "tests": ("workspaceTestsBtn", 9),
    "assistant": ("workspaceAssistantBtn", 4),
    "workflows": ("workspaceWorkflowsBtn", 8),
    "account": ("workspaceAccountBtn", 4),
}


def assert_no_horizontal_overflow(page, label: str):
    metrics = page.evaluate(
        """() => ({
          viewport: window.innerWidth,
          body: document.body.scrollWidth,
          document: document.documentElement.scrollWidth
        })"""
    )
    overflow = max(metrics["body"], metrics["document"]) - metrics["viewport"]
    if overflow > 2:
        raise AssertionError(f"{label}: horizontal overflow {overflow}px {metrics}")


def inspect_workspace(page, workspace: str, expected_panels: int, label: str):
    state = page.evaluate(
        r"""(workspace) => {
          const shell = document.querySelector('#appShell');
          const selected = document.querySelector('[data-workspace-tab-target][aria-selected="true"]');
          const visible = [...document.querySelectorAll('#workspaceContent > article.panel')]
            .filter((panel) => panel.offsetParent !== null)
            .map((panel) => ({
              className: panel.className,
              workspace: panel.dataset.workspace || ''
            }));
          const owned = [...document.querySelectorAll('#workspaceContent > article.panel')]
            .filter((panel) => (panel.dataset.workspace || '').split(/\s+/).includes(workspace));
          return {
            active: shell?.dataset.workspaceTab || '',
            selected: selected?.dataset.workspaceTabTarget || '',
            selectedCount: document.querySelectorAll('[data-workspace-tab-target][aria-selected="true"]').length,
            visible,
            ownedCount: owned.length,
            section: document.querySelector('#workspaceSectionSelect')?.value || '',
            height: document.documentElement.scrollHeight,
            viewport: window.innerHeight
          };
        }""",
        workspace,
    )
    if state["active"] != workspace or state["selected"] != workspace or state["selectedCount"] != 1:
        raise AssertionError(f"{label}: invalid active tab state {state}")
    if state["ownedCount"] != expected_panels:
        raise AssertionError(
            f"{label}: expected {expected_panels} owned panels, got {state['ownedCount']}"
        )
    if len(state["visible"]) != 1:
        raise AssertionError(f"{label}: focused view should expose one panel, got {state['visible']}")
    leaked = [panel for panel in state["visible"] if workspace not in panel["workspace"].split()]
    if leaked:
        raise AssertionError(f"{label}: panels leaked from another workspace: {leaked}")
    section_count = page.locator("#workspaceSectionSelect option").count()
    if section_count != expected_panels + 1:
        raise AssertionError(
            f"{label}: expected {expected_panels + 1} section choices, got {section_count}"
        )
    return state


def check(browser, width: int, height: int, label: str):
    page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    page.goto(HTML.as_uri(), wait_until="load")
    page.wait_for_timeout(200)
    page.evaluate("() => window.__OUTILSIA_TEST__.applyDemoState()")
    page.wait_for_timeout(250)

    orphaned = page.evaluate(
        """() => [...document.querySelectorAll('#workspaceContent > article.panel')]
          .filter((panel) => !panel.dataset.workspace)
          .map((panel) => panel.className)"""
    )
    if orphaned:
        raise AssertionError(f"{label}: panels without workspace ownership: {orphaned}")

    heights = {}
    for workspace, (button_id, expected_panels) in WORKSPACES.items():
        page.locator(f"#{button_id}").click()
        page.wait_for_timeout(80)
        assert_no_horizontal_overflow(page, f"{label}-{workspace}")
        state = inspect_workspace(page, workspace, expected_panels, f"{label}-{workspace}")
        heights[workspace] = round(state["height"] / state["viewport"], 2)
        page.locator("#workspaceSectionSelect").select_option("__all__")
        page.wait_for_timeout(60)
        all_visible = page.locator("#workspaceContent > article.panel:visible").count()
        if all_visible != expected_panels:
            raise AssertionError(
                f"{label}-{workspace}: complete view expected {expected_panels} panels, got {all_visible}"
            )
        first_section = page.locator("#workspaceSectionSelect option").first.get_attribute("value")
        page.locator("#workspaceSectionSelect").select_option(first_section)
        page.wait_for_timeout(60)

    page.locator("#workspaceAssistantBtn").click()
    page.locator("#workspaceSectionSelect").select_option(".chat-panel")
    page.locator("#chatPromptInput").fill("Saisie conservée entre les espaces")
    page.locator("#workspaceModelsBtn").click()
    page.locator("#workspaceAssistantBtn").click()
    if page.locator("#chatPromptInput").input_value() != "Saisie conservée entre les espaces":
        raise AssertionError(f"{label}: changing workspace destroyed form state")

    page.locator("#workspaceModelsBtn").click()
    page.locator("#modelList [data-chat-model]").first.click()
    routed_chat = page.locator("#appShell").get_attribute("data-workspace-tab")
    routed_chat_section = page.locator("#workspaceSectionSelect").input_value()
    if routed_chat != "assistant" or routed_chat_section != ".chat-panel":
        raise AssertionError(f"{label}: model Dialogue action routed to {routed_chat!r}/{routed_chat_section!r}")

    page.locator("#workspaceModelsBtn").click()
    page.locator("#modelList [data-benchmark-model]").first.click()
    page.wait_for_timeout(100)
    routed_benchmark = page.locator("#appShell").get_attribute("data-workspace-tab")
    routed_benchmark_section = page.locator("#workspaceSectionSelect").input_value()
    if routed_benchmark != "tests" or routed_benchmark_section != ".benchmark-panel":
        raise AssertionError(
            f"{label}: model benchmark action routed to {routed_benchmark!r}/{routed_benchmark_section!r}"
        )

    page.locator("#workspaceSectionSelect").select_option(".flight-recorder-panel")
    page.wait_for_timeout(1500)
    section_position = page.locator(".flight-recorder-panel").evaluate(
        """(panel) => ({ top: panel.getBoundingClientRect().top, visible: panel.offsetParent !== null })"""
    )
    if not section_position["visible"] or section_position["top"] < 60 or section_position["top"] >= height:
        raise AssertionError(f"{label}: section menu did not reveal Flight Recorder: {section_position}")

    page.locator("#workspaceSectionPrevBtn").click()
    previous_section = page.locator("#workspaceSectionSelect").input_value()
    if previous_section != ".model-autopilot-panel":
        raise AssertionError(f"{label}: previous section control selected {previous_section!r}")
    page.locator("#workspaceSectionNextBtn").click()
    if page.locator("#workspaceSectionSelect").input_value() != ".flight-recorder-panel":
        raise AssertionError(f"{label}: next section control did not restore Flight Recorder")

    page.locator("#workspaceOverviewBtn").focus()
    page.keyboard.press("ArrowRight")
    keyboard_state = page.evaluate(
        """() => ({
          active: document.querySelector('#appShell')?.dataset.workspaceTab,
          focused: document.activeElement?.id
        })"""
    )
    if keyboard_state != {"active": "machine", "focused": "workspaceMachineBtn"}:
        raise AssertionError(f"{label}: keyboard tab navigation failed: {keyboard_state}")

    page.locator("#workspaceOverviewBtn").click()
    page.wait_for_timeout(150)
    tab_scroll = page.evaluate(
        """() => ({
          actual: window.scrollY,
          expected: Math.min(
            Math.max(0, (document.querySelector('.workspace-region')?.offsetTop || 0) - 8),
            Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
          )
        })"""
    )
    if abs(tab_scroll["actual"] - tab_scroll["expected"]) > 3:
        raise AssertionError(f"{label}: tab switch kept the previous page position: {tab_scroll}")
    page.evaluate("() => window.scrollTo(0, 0)")
    page.screenshot(path=OUT / f"workspace-{label}-overview.png", full_page=True)
    page.locator("#workspaceWorkflowsBtn").click()
    page.wait_for_timeout(150)
    page.evaluate("() => window.scrollTo(0, 0)")
    page.screenshot(path=OUT / f"workspace-{label}-workflows.png", full_page=True)
    page.close()
    return heights


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        desktop = check(browser, 1440, 900, "desktop")
        mobile = check(browser, 390, 844, "mobile")
        browser.close()

    if max(desktop.values()) >= 8:
        raise AssertionError(f"desktop workspace remains too long: {desktop}")
    if max(mobile.values()) >= 14:
        raise AssertionError(f"mobile workspace remains too long: {mobile}")
    print(f"workspace_navigation_ok desktop={desktop} mobile={mobile}")


if __name__ == "__main__":
    main()
