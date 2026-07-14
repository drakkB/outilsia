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

WORKSPACE_SUBTITLES = {
    "overview": "Décider quoi faire",
    "machine": "Comprendre le matériel",
    "models": "Choisir et gérer",
    "tests": "Mesurer localement",
    "assistant": "Utiliser les modèles",
    "workflows": "Composer et prouver",
    "account": "Sauver et partager",
}

WORKSPACE_FIRST_SECTIONS = {
    "overview": "Bilan machine",
    "machine": "Matériel détecté",
    "models": "Modèles compatibles",
    "tests": "Choisir un modèle",
    "assistant": "Améliorer un prompt",
    "workflows": "Composer le plan",
    "account": "Sauvegarde OutilsIA",
}

HUMAN_PANEL_TITLES = {
    ".capability-passport-panel": ("Passeport IA", "AI Capability Passport"),
    ".local-capability-bridge-panel": ("Partage local", "Local Capability Bridge"),
    ".board-observer-panel": ("Lire un board", "Board Observer"),
    ".workstack-composer-panel": ("Composer le plan", "Workstack Composer"),
    ".capability-router-panel": ("Affecter les rôles", "Capability Router"),
    ".forgebench-panel": ("Comparer des stacks", "ForgeBench"),
    ".evidence-ledger-panel": ("Vérifier les preuves", "Evidence Ledger"),
    ".model-autopilot-panel": ("Optimiser les réglages", "Model Autopilot"),
    ".flight-recorder-panel": ("Suivre les performances", "Flight Recorder"),
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


def assert_touch_targets(page, label: str):
    bad = page.evaluate(
        """() => [...document.querySelectorAll('button, .ghost-btn')]
          .filter((node) => node.offsetParent !== null)
          .map((node) => {
            const rect = node.getBoundingClientRect();
            return { text: node.textContent.trim(), width: rect.width, height: rect.height };
          })
          .filter((item) => item.width < 42 || item.height < 42)"""
    )
    if bad:
        raise AssertionError(f"{label}: touch targets are too small: {bad[:5]}")


def inspect_workspace(page, workspace: str, expected_panels: int, label: str):
    state = page.evaluate(
        r"""(workspace) => {
          const shell = document.querySelector('#appShell');
          const selected = document.querySelector('[data-workspace-tab-target][aria-selected="true"]');
          const tabStrip = selected?.parentElement?.getBoundingClientRect();
          const selectedRect = selected?.getBoundingClientRect();
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
            subtitle: document.querySelector('#workspaceSubtitle')?.textContent?.trim() || '',
            activeTabVisible: !!tabStrip && !!selectedRect && selectedRect.left >= tabStrip.left - 1 && selectedRect.right <= tabStrip.right + 1,
            prerequisiteVisible: !!document.querySelector('#workspacePrerequisite')?.offsetParent,
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
    if state["subtitle"] != WORKSPACE_SUBTITLES[workspace]:
        raise AssertionError(f"{label}: unclear workspace subtitle {state['subtitle']!r}")
    if not state["activeTabVisible"]:
        raise AssertionError(f"{label}: active tab remains outside the mobile strip")
    if state["prerequisiteVisible"]:
        raise AssertionError(f"{label}: scan prerequisite remained visible after a complete machine state")
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
    first_label = page.locator("#workspaceSectionSelect option").first.inner_text().strip()
    if first_label != WORKSPACE_FIRST_SECTIONS[workspace]:
        raise AssertionError(f"{label}: first section remains technical or unstable: {first_label!r}")
    return state


def assert_feature_route(page, source_tab: str, source_section: str, button: str, expected_tab: str, expected_section: str, expected_focus: str, label: str):
    page.locator(f'[data-workspace-tab-target="{source_tab}"]').click()
    page.locator("#workspaceSectionSelect").select_option(source_section)
    route_button = page.locator(button)
    if not route_button.is_visible() or route_button.is_disabled():
        raise AssertionError(f"{label}: prerequisite route is not actionable: {button}")
    visible_disabled = route_button.locator("xpath=..").locator("button:visible:disabled").count()
    if visible_disabled:
        raise AssertionError(f"{label}: disabled commands still clutter the prerequisite row")
    route_button.click()
    page.wait_for_timeout(400)
    state = page.evaluate(
        """({ expectedTab, expectedSection, expectedFocus }) => ({
          tab: document.querySelector('#appShell')?.dataset.workspaceTab,
          section: document.querySelector('#workspaceSectionSelect')?.value,
          panelVisible: !!document.querySelector(expectedSection)?.offsetParent,
          focused: document.activeElement?.matches(expectedFocus) || false
        })""",
        {
            "expectedTab": expected_tab,
            "expectedSection": expected_section,
            "expectedFocus": expected_focus,
        },
    )
    expected = {
        "tab": expected_tab,
        "section": expected_section,
        "panelVisible": True,
        "focused": True,
    }
    if state != expected:
        raise AssertionError(f"{label}: prerequisite route mismatch {state}, expected {expected}")


def check(browser, width: int, height: int, label: str):
    page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    page.goto(HTML.as_uri(), wait_until="load")
    page.wait_for_timeout(200)
    page.evaluate("() => window.__OUTILSIA_TEST__.applyDemoState()")
    page.wait_for_timeout(250)

    page.locator("#workspaceTestsBtn").click()
    page.locator("#workspaceSectionSelect").select_option(".prepare-panel")
    prepare_disclosures = page.evaluate(
        """() => ({
          supportOpen: document.querySelector('.prepare-support-details')?.open,
          toolsOpen: document.querySelector('.prepare-tools-details')?.open,
          engineVisible: !!document.querySelector('.recommendation-engine-card')?.offsetParent,
          profileVisible: !!document.querySelector('.usage-profile-actions')?.offsetParent,
          panelHeight: Math.round(document.querySelector('.prepare-panel')?.getBoundingClientRect().height || 0)
        })"""
    )
    if prepare_disclosures["supportOpen"] or prepare_disclosures["toolsOpen"] or page.locator(".prepare-support-content").is_visible():
        raise AssertionError(f"{label}: supporting test details should be closed by default: {prepare_disclosures}")
    if not prepare_disclosures["engineVisible"] or not prepare_disclosures["profileVisible"]:
        raise AssertionError(f"{label}: the model decision controls are not immediately visible: {prepare_disclosures}")
    max_prepare_height = 1500 if width <= 760 else 1050
    if prepare_disclosures["panelHeight"] > max_prepare_height:
        raise AssertionError(f"{label}: first model decision view remains too tall: {prepare_disclosures}")
    page.locator(".prepare-panel").screenshot(path=OUT / f"workspace-{label}-model-choice.png")

    page.locator("#workspaceMachineBtn").click()
    page.locator("#workspaceSectionSelect").select_option(".machine-panel")
    doctor_disclosure = page.evaluate(
        """() => ({
          open: document.querySelector('#hardwareDoctorDetails')?.open,
          visible: !!document.querySelector('#hardwareDoctorDetails')?.offsetParent,
          scoreVisible: !!document.querySelector('.doctor-score')?.offsetParent
        })"""
    )
    if doctor_disclosure != {"open": False, "visible": True, "scoreVisible": True} or page.locator(".hardware-doctor-detail-content").is_visible():
        raise AssertionError(f"{label}: Hardware Doctor disclosure state is unclear: {doctor_disclosure}")
    page.locator(".machine-panel").screenshot(path=OUT / f"workspace-{label}-machine-summary.png")
    page.locator("#hardwareDoctorDetails > summary").click()
    if not page.locator(".runtime-driver-details").is_visible():
        raise AssertionError(f"{label}: opening Hardware Doctor did not reveal the runtime evidence")

    for selector, (task_label, technical_label) in HUMAN_PANEL_TITLES.items():
        title = page.locator(f"{selector} .panel-title h2").inner_text().strip()
        if not title.startswith(task_label) or technical_label not in title:
            raise AssertionError(f"{label}: panel title does not explain {technical_label}: {title!r}")

    orphaned = page.evaluate(
        """() => [...document.querySelectorAll('#workspaceContent > article.panel')]
          .filter((panel) => !panel.dataset.workspace)
          .map((panel) => panel.className)"""
    )
    if orphaned:
        raise AssertionError(f"{label}: panels without workspace ownership: {orphaned}")

    page.locator("#workspaceAccountBtn").click()
    page.locator("#workspaceSectionSelect").select_option(".account-panel")
    if page.locator("#syncState").inner_text().strip() == "connecté":
        account_text = page.locator(".account-panel").inner_text().lower()
        if "connecte ton compte" in account_text:
            raise AssertionError(f"{label}: connected account still asks the user to connect: {account_text}")

    page.locator("#prepareBtn").click()
    page.wait_for_function("() => !document.querySelector('#prepareBtn')?.disabled")
    page.locator("#workspaceAccountBtn").click()
    page.locator("#workspaceSectionSelect").select_option(".account-panel")
    assert_account = page.locator("#syncResult").inner_text().strip().lower()
    if "sauvegarde ce pc" not in assert_account or "analyse ce pc" in assert_account:
        raise AssertionError(f"{label}: account status was not refreshed after analysis: {assert_account}")
    page.locator("#workspaceSectionSelect").select_option(".feedback-panel")
    feedback_text = page.locator("#feedbackResult").inner_text().strip().lower()
    if "connecte" in feedback_text or "décris le problème" not in feedback_text:
        raise AssertionError(f"{label}: connected feedback state is contradictory: {feedback_text}")

    heights = {}
    for workspace, (button_id, expected_panels) in WORKSPACES.items():
        page.locator(f"#{button_id}").click()
        page.wait_for_timeout(80)
        assert_no_horizontal_overflow(page, f"{label}-{workspace}")
        state = inspect_workspace(page, workspace, expected_panels, f"{label}-{workspace}")
        if width <= 760:
            assert_touch_targets(page, f"{label}-{workspace}")
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

    prerequisite_routes = [
        ("tests", ".model-autopilot-panel", '.model-autopilot-panel [data-open-feature="benchmark"]', "tests", ".benchmark-panel", "#benchmarkModelInput", "autopilot-to-benchmark"),
        ("tests", ".flight-recorder-panel", '.flight-recorder-panel [data-open-feature="benchmark"]', "tests", ".benchmark-panel", "#benchmarkModelInput", "flight-to-benchmark"),
        ("workflows", ".local-capability-bridge-panel", '.local-capability-bridge-panel [data-open-feature="passport"]', "workflows", ".capability-passport-panel", "#generateCapabilityPassportBtn", "bridge-to-passport"),
        ("workflows", ".workstack-composer-panel", '.workstack-composer-panel [data-open-feature="board"]', "workflows", ".board-observer-panel", "#boardObserverUrl", "workstack-to-board"),
        ("workflows", ".capability-router-panel", '.capability-router-panel [data-open-feature="workstack"]', "workflows", ".workstack-composer-panel", "#workstackPriority", "router-to-workstack"),
        ("workflows", ".forgebench-panel", '.forgebench-panel [data-open-feature="router"]', "workflows", ".capability-router-panel", "#capabilityRouterObjective", "forgebench-to-router"),
        ("assistant", ".prompt-library-panel", '.prompt-library-panel [data-open-feature="promptforge"]', "assistant", ".promptforge-panel", "#promptForgeInput", "library-to-promptforge"),
    ]
    for route in prerequisite_routes:
        assert_feature_route(page, *route[:-1], f"{label}-{route[-1]}")

    page.locator("#workspaceTestsBtn").click()
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
    focus_ring = page.locator("#workspaceMachineBtn").evaluate(
        """(button) => {
          const style = getComputedStyle(button);
          return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) || 0 };
        }"""
    )
    if focus_ring["style"] == "none" or focus_ring["width"] < 2:
        raise AssertionError(f"{label}: keyboard focus is not visibly indicated: {focus_ring}")

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
