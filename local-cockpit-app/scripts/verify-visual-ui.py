#!/usr/bin/env python3
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
OUT = ROOT / ".artifacts" / "visual-ui"
OUT.mkdir(parents=True, exist_ok=True)


def assert_no_horizontal_overflow(page, label: str):
    metrics = page.evaluate(
        """() => ({
          width: window.innerWidth,
          body: document.body.scrollWidth,
          doc: document.documentElement.scrollWidth
        })"""
    )
    overflow = max(metrics["body"], metrics["doc"]) - metrics["width"]
    if overflow > 2:
        raise AssertionError(f"{label}: horizontal overflow {overflow}px {metrics}")


def assert_visible(page, selector: str, label: str):
    locator = page.locator(selector)
    first = locator.first if hasattr(locator, "first") else locator.first()
    box = first.bounding_box()
    if not box or box["width"] < 1 or box["height"] < 1:
        raise AssertionError(f"{label}: not visible ({selector})")


def assert_hidden(page, selector: str, label: str):
    is_visible = page.evaluate(
        """(selector) => {
          const el = document.querySelector(selector);
          if (!el) return false;
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;
        }""",
        selector,
    )
    if is_visible:
        raise AssertionError(f"{label}: should be hidden ({selector})")


def assert_button_text_fits(page, label: str):
    bad = page.evaluate(
        """() => [...document.querySelectorAll('button, .ghost-btn')]
          .filter((el) => el.offsetParent !== null && el.scrollWidth > el.clientWidth + 2)
          .map((el) => ({
            text: el.textContent.trim(),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth
          }))"""
    )
    if bad:
        raise AssertionError(f"{label}: button overflow {bad[:5]}")


def assert_primary_hover(page, label: str):
    checked = 0
    for selector in ["#prepareBtn", "#quickActionBtn"]:
        button = page.locator(selector)
        if selector == "#quickActionBtn" and not button.is_visible():
            continue
        if not button.is_visible() or button.is_disabled():
            raise AssertionError(f"{label}: primary action is not available: {selector}")
        checked += 1
        button.hover()
        appearance = button.evaluate(
            """(node) => ({
              backgroundImage: getComputedStyle(node).backgroundImage,
              color: getComputedStyle(node).color
            })"""
        )
        if "linear-gradient" not in appearance["backgroundImage"] or appearance["color"] != "rgb(2, 21, 17)":
            raise AssertionError(f"{label}: primary hover loses contrast: {selector} {appearance}")
    if not checked:
        raise AssertionError(f"{label}: no primary action was available for hover verification")
    page.mouse.move(0, 0)


def assert_idle_console_button_hidden(page, label: str):
    visible = page.evaluate(
        """() => {
          const btn = document.querySelector('#operationJumpBtn');
          if (!btn) return false;
          return btn.offsetParent !== null || getComputedStyle(btn).display !== 'none';
        }"""
    )
    if visible:
        raise AssertionError(f"{label}: console jump button should be hidden while idle")


def assert_essential_work_panels_quiet(page, label: str):
    visible = page.evaluate(
        """() => [...document.querySelectorAll('.benchmark-panel, .promptforge-panel, .chat-panel')]
          .filter((panel) => panel.offsetParent !== null)
          .map((panel) => panel.className)"""
    )
    if visible:
        raise AssertionError(f"{label}: essential mode should not show work panels before next action {visible}")


def assert_sticky_action_hidden(page, label: str):
    if visible := page.evaluate(
        """() => {
          const el = document.querySelector('.sticky-action-strip');
          if (!el) return false;
          return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
        }"""
    ):
        raise AssertionError(f"{label}: sticky action should be hidden in essential mode, got {visible}")


def assert_prescan_readiness(page, label: str):
    page.locator("#workspaceOverviewBtn").click()
    page.locator("#workspaceSectionSelect").select_option(".readiness-panel")
    page.wait_for_timeout(120)
    text = page.locator("#readinessBox").inner_text()
    if "Ce PC n'a pas encore été analysé" not in text:
        raise AssertionError(f"{label}: prescan decision is unclear: {text[:400]}")
    buttons = page.locator("#readinessBox button:visible")
    if buttons.count() != 1 or buttons.first.inner_text().strip() != "Analyser ce PC":
        raise AssertionError(f"{label}: prescan should expose one analysis action")
    if page.locator("#readinessBox .readiness-action-card").count():
        raise AssertionError(f"{label}: advanced decisions leaked before scan")
    if page.locator(".readiness-primary-actions:visible, .readiness-export-actions:visible").count():
        raise AssertionError(f"{label}: report exports leaked before scan")
    if page.locator(".quick-decision-strip:visible").count():
        raise AssertionError(f"{label}: duplicate analysis action leaked above the prescan report")
    if page.locator("#readinessState").get_attribute("data-status-tone") != "action":
        raise AssertionError(f"{label}: prescan status is not visually actionable")


def assert_workspace_prerequisite(page, label: str):
    page.locator("#workspaceMachineBtn").click()
    page.wait_for_timeout(80)
    guard = page.locator("#workspacePrerequisite")
    if not guard.is_visible():
        raise AssertionError(f"{label}: advanced workspace has no route back to analysis")
    if "Identifiez le matériel" not in guard.inner_text():
        raise AssertionError(f"{label}: machine prerequisite lacks useful context")
    button = guard.locator("[data-run-analysis]")
    if not button.is_visible() or button.is_disabled() or button.inner_text().strip() != "Analyser ce PC":
        raise AssertionError(f"{label}: workspace analysis route is not actionable")
    page.locator("#workspaceOverviewBtn").click()
    page.locator("#workspaceSectionSelect").select_option(".readiness-panel")


def assert_scan_failure_recovery(page, label: str):
    proof = page.evaluate("() => window.__OUTILSIA_TEST__.applyScanFailureState()")
    page.wait_for_timeout(100)
    panel = page.locator("#readinessBox")
    text = panel.inner_text()
    if "Le scan n'a pas pu se terminer" not in text or "Relancer l'analyse" not in text:
        raise AssertionError(f"{label}: scan failure has no clear recovery path: {text[:400]}")
    if any(fragment in text or fragment in proof["error"] for fragment in ("C:\\Users\\demo", "AppData", "/home/demo")):
        raise AssertionError(f"{label}: scan failure exposes a personal path")
    if page.locator("#topMachineKey").inner_text().strip() != "Analyse à relancer":
        raise AssertionError(f"{label}: machine summary does not expose the retry state")
    if page.locator("#quickActionText").inner_text().strip() != "Relancer l'analyse":
        raise AssertionError(f"{label}: quick action does not offer a retry")
    retry = panel.locator("[data-run-analysis]")
    if not retry.is_visible() or retry.is_disabled() or retry.inner_text().strip() != "Relancer l'analyse":
        raise AssertionError(f"{label}: scan retry button is not actionable")
    if page.locator("#readinessState").get_attribute("data-status-tone") != "action":
        raise AssertionError(f"{label}: scan failure state is not visually actionable")
    page.evaluate("() => window.__OUTILSIA_TEST__.clearScanFailureState()")
    page.wait_for_timeout(80)
    if "Ce PC n'a pas encore été analysé" not in panel.inner_text():
        raise AssertionError(f"{label}: clearing the failure did not restore the initial state")


def assert_desktop_grid(page):
    columns = page.evaluate(
        """() => getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length"""
    )
    if columns < 10:
        raise AssertionError(f"desktop grid collapsed: {columns} columns")


def check_viewport(browser, width: int, height: int, label: str):
    page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    page.goto(HTML.as_uri(), wait_until="load")
    assert_visible(page, ".brand-mark", f"{label} brand")
    assert_visible(page, "#prepareBtn", f"{label} primary analysis")
    assert_hidden(page, "#scanBtn", f"{label} legacy scan button")
    assert_visible(page, ".machine-summary-strip", f"{label} machine summary")
    assert_hidden(page, ".quick-decision-strip", f"{label} duplicate prescan decision")
    assert_no_horizontal_overflow(page, label)
    assert_button_text_fits(page, label)
    assert_primary_hover(page, label)
    assert_idle_console_button_hidden(page, label)
    assert_essential_work_panels_quiet(page, label)
    assert_sticky_action_hidden(page, label)
    assert_prescan_readiness(page, label)
    assert_workspace_prerequisite(page, label)
    assert_scan_failure_recovery(page, label)
    if width >= 1000:
        assert_desktop_grid(page)
    screenshot = OUT / f"local-cockpit-{label}.png"
    page.screenshot(path=str(screenshot), full_page=True)
    page.close()
    return screenshot


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        desktop = check_viewport(browser, 1440, 1000, "desktop")
        mobile = check_viewport(browser, 390, 920, "mobile")
        small = check_viewport(browser, 320, 820, "small")
        browser.close()
    print(f"visual_ui_ok desktop={desktop} mobile={mobile} small={small}")


if __name__ == "__main__":
    main()
