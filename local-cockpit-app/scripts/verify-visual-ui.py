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
    assert_visible(page, ".quick-decision-strip", f"{label} quick decision")
    assert_no_horizontal_overflow(page, label)
    assert_button_text_fits(page, label)
    assert_idle_console_button_hidden(page, label)
    assert_essential_work_panels_quiet(page, label)
    assert_sticky_action_hidden(page, label)
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
