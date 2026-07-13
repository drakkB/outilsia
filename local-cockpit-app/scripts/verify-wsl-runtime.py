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
        page.evaluate("""() => window.__OUTILSIA_TEST__.setWorkspaceTab('overview')""")
        hidden_in_essential = not page.locator(".runtime-wsl-box").is_visible(timeout=5000)
        page.evaluate("""() => window.__OUTILSIA_TEST__.setWorkspaceTab('machine')""")
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
        rtx_4080_wsl = page.evaluate("""() => window.__OUTILSIA_TEST__.applyRtx4080WslModelState()""")
        benchmark_truth = page.evaluate("""() => window.__OUTILSIA_TEST__.applyBenchmarkTruthState()""")
        page.evaluate("""() => {
          window.__OUTILSIA_TEST__.setWorkspaceTab('tests');
          window.__OUTILSIA_TEST__.setWorkspaceSection('tests', '.benchmark-panel');
        }""")
        preflight_visible = page.locator("#benchmarkPreflight").is_visible(timeout=5000)
        benchmark_box = page.locator(".benchmark-panel").bounding_box()
        viewport_width = page.evaluate("""() => window.innerWidth""")
        page.set_viewport_size({"width": 390, "height": 844})
        mobile_metrics = page.evaluate("""() => ({
          viewport: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          columns: getComputedStyle(document.querySelector('.benchmark-preflight-grid')).gridTemplateColumns
            .split(' ')
            .filter(Boolean).length,
          visible: Boolean(document.querySelector('#benchmarkPreflight')?.offsetParent)
        })""")
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
    if dual_runtime.get("runtimeLabel") != "Ollama Windows + WSL":
        raise AssertionError(f"mixed model stores need an explicit runtime label: {dual_runtime}")
    if rtx_4080_wsl.get("runtimeLabel") != "Ollama WSL · Windows prêt":
        raise AssertionError(f"WSL-only model store should not be labeled Ollama Windows: {rtx_4080_wsl}")
    if rtx_4080_wsl.get("fieldClass") != "Très bon PC IA locale" or "16 Go VRAM" not in rtx_4080_wsl.get("fieldVerdict", ""):
        raise AssertionError(f"RTX 4080 field verdict must use the detected 16 GB: {rtx_4080_wsl}")
    if rtx_4080_wsl.get("hermesRuntime") != "wsl" or rtx_4080_wsl.get("mixtralRuntime") != "wsl":
        raise AssertionError(f"WSL model actions must stay in WSL: {rtx_4080_wsl}")
    if rtx_4080_wsl.get("mixtralTimeout") < 120:
        raise AssertionError(f"26 GB Mixtral on 16 GB VRAM needs an extended benchmark: {rtx_4080_wsl}")
    if "26 Go" not in rtx_4080_wsl.get("mixtralSize", ""):
        raise AssertionError(f"Mixtral size label must expose the real Q4 artifact size: {rtx_4080_wsl}")
    if rtx_4080_wsl.get("mixtralBudget", {}).get("estimated_download_gb") != 26:
        raise AssertionError(f"Mixtral install budget must use 26 GB: {rtx_4080_wsl}")
    if benchmark_truth.get("simpleLabel") != "Hermes 3 8B · hermes3:8b":
        raise AssertionError(f"simple Hermes identity is ambiguous: {benchmark_truth}")
    if not benchmark_truth.get("heavyLabel", "").startswith("Nous Hermes 2 Mixtral 8x7B ·"):
        raise AssertionError(f"heavy Hermes identity is ambiguous: {benchmark_truth}")
    simple_preflight = benchmark_truth.get("simplePreflight") or {}
    if simple_preflight.get("model") != "hermes3:8b" or simple_preflight.get("runtime") != "wsl":
        raise AssertionError(f"Hermes 3 preflight must expose its exact WSL target: {benchmark_truth}")
    if simple_preflight.get("timeout_seconds") != 45 or benchmark_truth.get("simpleButtonText") != "Tester · 45 s":
        raise AssertionError(f"Hermes 3 preflight should remain a short test: {benchmark_truth}")
    simple_preflight_text = benchmark_truth.get("simplePreflightText", "")
    if "Hermes 3 8B · hermes3:8b" not in simple_preflight_text or "4.7 Go" not in simple_preflight_text or "Ollama WSL" not in simple_preflight_text:
        raise AssertionError(f"Hermes 3 preflight lacks exact identity, size or runtime: {benchmark_truth}")
    heavy_preflight = benchmark_truth.get("heavyPreflight") or {}
    if heavy_preflight.get("model") != "nous-hermes2-mixtral:8x7b" or heavy_preflight.get("runtime") != "wsl":
        raise AssertionError(f"Mixtral preflight must expose its exact WSL target: {benchmark_truth}")
    if heavy_preflight.get("timeout_seconds") != 120 or heavy_preflight.get("tone") != "warning":
        raise AssertionError(f"Mixtral preflight should warn and reserve a long test window: {benchmark_truth}")
    if benchmark_truth.get("heavyButtonText") != "Test long · 120 s":
        raise AssertionError(f"Mixtral benchmark button must announce the real timeout: {benchmark_truth}")
    heavy_preflight_text = benchmark_truth.get("heavyPreflightText", "")
    for expected in ("Nous Hermes 2 Mixtral 8x7B", "26 Go", "16 Go", "Ollama WSL", "offload"):
        if expected not in heavy_preflight_text:
            raise AssertionError(f"Mixtral preflight should contain {expected!r}: {benchmark_truth}")
    if not {"hermes3:8b", "nous-hermes2-mixtral:8x7b"}.issubset(set(benchmark_truth.get("modelOptions", []))):
        raise AssertionError(f"benchmark model picker must retain exact installed refs: {benchmark_truth}")
    if benchmark_truth.get("heavyOutcome") != "Test incomplet · délai dépassé":
        raise AssertionError(f"heavy timeout is still labeled as a generic failure: {benchmark_truth}")
    heavy_diagnostic = benchmark_truth.get("heavyDiagnostic", "")
    if "26 Go" not in heavy_diagnostic or "16 Go" not in heavy_diagnostic or "pas une preuve d'incompatibilité" not in heavy_diagnostic:
        raise AssertionError(f"heavy timeout diagnostic lacks actionable memory context: {benchmark_truth}")
    if "Téléchargement interrompu" in benchmark_truth.get("resultText", "") or "· échec" in benchmark_truth.get("historyText", ""):
        raise AssertionError(f"benchmark UI still confuses timeout with download/failure: {benchmark_truth}")
    if "Hermes 3 8B · hermes3:8b" not in benchmark_truth.get("historyText", "") or "Nous Hermes 2 Mixtral 8x7B" not in benchmark_truth.get("historyText", ""):
        raise AssertionError(f"benchmark history does not distinguish both Hermes models: {benchmark_truth}")
    if benchmark_truth.get("leaderCount") != 2:
        raise AssertionError(f"Hermes aliases should share one benchmark identity: {benchmark_truth}")
    if not preflight_visible:
        raise AssertionError("benchmark preflight must stay visible in the focused Tests section")
    if not benchmark_box or benchmark_box.get("width", 0) < viewport_width * 0.8:
        raise AssertionError(
            f"focused benchmark panel must use the available workspace width: box={benchmark_box}, viewport={viewport_width}"
        )
    if not mobile_metrics.get("visible") or mobile_metrics.get("scrollWidth", 0) > mobile_metrics.get("viewport", 0) + 1:
        raise AssertionError(f"benchmark preflight must remain visible without horizontal overflow on Android: {mobile_metrics}")
    if mobile_metrics.get("columns") != 2:
        raise AssertionError(f"benchmark preflight metrics should use a compact 2-column Android grid: {mobile_metrics}")

    print(
        "wsl_runtime_ok "
        f"hidden_essential={hidden_in_essential} "
        f"visible_advanced={visible_in_advanced} "
        f"ready_command={wsl_ready.get('command')} "
        f"benchmark_width={round(benchmark_box.get('width', 0))} "
        f"mobile_columns={mobile_metrics.get('columns')}"
    )


if __name__ == "__main__":
    main()
