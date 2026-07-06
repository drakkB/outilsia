#!/usr/bin/env python3
from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"


def runtime(page, patch):
    return page.evaluate(
        """(patch) => {
          const scan = window.__OUTILSIA_TEST__.demoScan();
          scan.runtimes = {
            ...(scan.runtimes || {}),
            ...(patch.runtimes || {})
          };
          return window.__OUTILSIA_TEST__.wslRuntimeInfo(scan);
        }""",
        patch,
    )


def assert_contains(text, needle, label):
    if needle not in text:
        raise AssertionError(f"{label} should contain {needle!r}, got {text!r}")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(HTML.as_uri(), wait_until="load")
        page.evaluate("""() => localStorage.clear()""")
        result = page.evaluate("""() => window.__OUTILSIA_TEST__.applyDemoState()""")
        page.evaluate("""() => window.__OUTILSIA_TEST__.setViewMode('essential')""")
        hidden_in_essential = not page.locator(".runtime-wsl-box").is_visible(timeout=5000)
        page.evaluate("""() => window.__OUTILSIA_TEST__.setViewMode('advanced')""")
        visible_in_advanced = page.locator(".runtime-wsl-box").is_visible(timeout=5000)
        ui_title = page.locator("#wslStateText").inner_text(timeout=5000)
        ui_detail = page.locator("#wslDetailText").inner_text(timeout=5000)

        native_ready = runtime(
            page,
            {
                "runtimes": {
                    "ollama": {"installed": True, "version": "ollama demo"},
                    "ollama_wsl": {"installed": False, "version": None, "source": "ollama-wsl"},
                    "wsl": {
                        "installed": False,
                        "version": None,
                        "default_distribution": None,
                        "distributions": [],
                        "ollama_ready": False,
                        "install_command": "wsl.exe --install",
                        "ollama_install_command": "wsl.exe sh -lc \"curl -fsSL https://ollama.com/install.sh | sh\"",
                        "ollama_test_command": "wsl.exe ollama run qwen3:0.6b",
                    },
                }
            },
        )
        wsl_ready = runtime(
            page,
            {
                "runtimes": {
                    "ollama": {"installed": False, "version": None},
                    "ollama_wsl": {"installed": True, "version": "ollama wsl", "source": "ollama-wsl"},
                    "wsl": {
                        "installed": True,
                        "version": "WSL version demo",
                        "default_distribution": "Debian",
                        "distributions": ["Debian"],
                        "ollama_ready": True,
                        "install_command": "wsl.exe --install",
                        "ollama_install_command": "wsl.exe sh -lc \"curl -fsSL https://ollama.com/install.sh | sh\"",
                        "ollama_test_command": "wsl.exe ollama run qwen3:0.6b",
                    },
                }
            },
        )
        missing = runtime(
            page,
            {
                "runtimes": {
                    "ollama": {"installed": False, "version": None},
                    "ollama_wsl": {"installed": False, "version": None, "source": "ollama-wsl"},
                    "wsl": {
                        "installed": False,
                        "version": None,
                        "default_distribution": None,
                        "distributions": [],
                        "ollama_ready": False,
                        "install_command": "wsl.exe --install",
                        "ollama_install_command": "wsl.exe sh -lc \"curl -fsSL https://ollama.com/install.sh | sh\"",
                        "ollama_test_command": "wsl.exe ollama run qwen3:0.6b",
                    },
                }
            },
        )
        dual_runtime = page.evaluate("""() => window.__OUTILSIA_TEST__.applyDualRuntimeWslModelState()""")
        browser.close()

    if not hidden_in_essential:
        raise AssertionError("WSL panel must stay hidden in essential mode")
    if not visible_in_advanced:
        raise AssertionError("WSL panel must be visible in advanced mode")
    assert_contains(ui_title, "WSL détecté", "demo WSL title")
    assert_contains(ui_detail, "Installe Ollama", "demo WSL detail")
    if result.get("wsl", {}).get("kind") != "warning":
        raise AssertionError(f"demo WSL state should be warning, got {result.get('wsl')}")

    if native_ready.get("title") != "Windows natif prêt":
        raise AssertionError(f"native ready title mismatch: {native_ready}")
    if native_ready.get("canInstall") is not True:
        raise AssertionError("native ready should allow optional WSL installation")
    if wsl_ready.get("title") != "WSL prêt · Debian":
        raise AssertionError(f"WSL ready title mismatch: {wsl_ready}")
    if wsl_ready.get("command") != "wsl.exe ollama run qwen3:0.6b":
        raise AssertionError(f"WSL ready command mismatch: {wsl_ready}")
    if missing.get("title") != "WSL non installé":
        raise AssertionError(f"missing title mismatch: {missing}")
    if missing.get("canInstall") is not True or missing.get("canCopy") is not True:
        raise AssertionError(f"missing WSL should expose install/copy actions: {missing}")
    if dual_runtime.get("qwenRuntime") != "wsl" or dual_runtime.get("qwenDefault") != "wsl":
        raise AssertionError(f"qwen installed only in WSL should use WSL runtime: {dual_runtime}")
    if dual_runtime.get("qwenPayload") != {"runtime": "wsl"}:
        raise AssertionError(f"qwen WSL payload mismatch: {dual_runtime}")
    if dual_runtime.get("qwenCommand") != "wsl.exe ollama":
        raise AssertionError(f"qwen WSL command mismatch: {dual_runtime}")
    if dual_runtime.get("hermesRuntime") != "native" or dual_runtime.get("hermesPayload") != {}:
        raise AssertionError(f"hermes native runtime mismatch: {dual_runtime}")

    print(
        "wsl_runtime_ok "
        f"hidden_essential={hidden_in_essential} "
        f"visible_advanced={visible_in_advanced} "
        f"ready_command={wsl_ready.get('command')}"
    )


if __name__ == "__main__":
    main()
