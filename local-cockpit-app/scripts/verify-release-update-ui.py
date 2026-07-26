#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
RELEASE_URL = "https://outilsia.fr/static/downloads/local-cockpit/release.json"

FILES = [
    {
        "name": "OutilsIA-Local-Cockpit-0.1.2-windows-x64.exe",
        "platform": "windows-x64",
        "size_bytes": 4_000_000,
        "sha256": "a" * 64,
        "url": "/static/downloads/local-cockpit/OutilsIA-Local-Cockpit-0.1.2-windows-x64.exe",
    },
    {
        "name": "OutilsIA-Local-Cockpit-0.1.2-windows-x64.msi",
        "platform": "windows-x64",
        "size_bytes": 5_000_000,
        "sha256": "b" * 64,
        "url": "/static/downloads/local-cockpit/OutilsIA-Local-Cockpit-0.1.2-windows-x64.msi",
    },
    {
        "name": "OutilsIA-Local-Cockpit-0.1.2-linux.AppImage",
        "platform": "linux",
        "size_bytes": 80_000_000,
        "sha256": "c" * 64,
        "url": "/static/downloads/local-cockpit/OutilsIA-Local-Cockpit-0.1.2-linux.AppImage",
    },
    {
        "name": "OutilsIA-Local-Cockpit-0.1.2-linux.deb",
        "platform": "linux",
        "size_bytes": 6_000_000,
        "sha256": "d" * 64,
        "url": "/static/downloads/local-cockpit/OutilsIA-Local-Cockpit-0.1.2-linux.deb",
    },
]
RELEASE = {
    "ok": True,
    "version": "0.1.2",
    "build_id": "400000000000",
    "files": FILES,
    "primary_download": FILES[0],
    "downloads_by_platform": {
        "windows-x64": FILES[:2],
        "linux": FILES[2:],
    },
}


def verify_case(browser, user_agent: str, expected_detail: str, expected_button: str, expected_href: str):
    context = browser.new_context(viewport={"width": 1280, "height": 800}, user_agent=user_agent)
    page = context.new_page()
    page.route(RELEASE_URL, lambda route: route.fulfill(json=RELEASE))
    page.goto(HTML.as_uri(), wait_until="load")
    page.wait_for_function("document.querySelector('#releaseTitle')?.textContent.includes('Mise à jour disponible')")
    page.click("#workspaceAccountBtn")

    detail = page.locator("#releaseText").inner_text()
    button = page.locator("#releaseDownloadBtn")
    if expected_detail not in detail:
        raise AssertionError(f"Missing native artifact {expected_detail!r}: {detail}")
    if button.inner_text() != expected_button:
        raise AssertionError(f"Unexpected update action: {button.inner_text()!r}")
    if button.get_attribute("href") != expected_href:
        raise AssertionError(f"Unexpected update URL: {button.get_attribute('href')!r}")
    if not page.locator("#releaseText").is_visible():
        raise AssertionError("Release explanation is hidden in the Account workspace")
    overflow = page.evaluate("Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth")
    if overflow > 2:
        raise AssertionError(f"Horizontal overflow in release panel: {overflow}px")
    context.close()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    verify_case(
        browser,
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Windows x64 EXE",
        "Télécharger la mise à jour",
        "https://outilsia.fr/static/downloads/local-cockpit/OutilsIA-Local-Cockpit-0.1.2-windows-x64.exe",
    )
    verify_case(
        browser,
        "Mozilla/5.0 (X11; Linux x86_64)",
        "Linux APPIMAGE",
        "Choisir le paquet Linux",
        "https://outilsia.fr/telecharger-scanner-ia-local",
    )
    browser.close()

print("release_update_ui_ok windows=direct_exe linux=package_chooser explanation=visible overflow=0")
