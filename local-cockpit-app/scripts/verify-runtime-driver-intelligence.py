#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
ARTIFACTS = ROOT / ".artifacts" / "visual-ui"


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1366, "height": 1000})
        page.goto(HTML.as_uri(), wait_until="load")
        page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceTab('machine')")
        result = page.evaluate("() => window.__OUTILSIA_TEST__.applyRuntimeDriverIntelligenceState()")
        disclosure = page.locator("#hardwareDoctorDetails")
        details = page.locator(".runtime-driver-details")
        assert disclosure.is_visible()
        assert disclosure.get_attribute("open") is None
        assert not details.is_visible()
        page.locator("#hardwareDoctorDetails > summary").click()
        assert details.is_visible()
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        page.locator("#hardwareDoctorBox").screenshot(
            path=str(ARTIFACTS / "runtime-driver-intelligence-desktop.png")
        )
        page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceTab('overview')")
        assert not details.is_visible()
        browser.close()

    matrix = result["matrix"]
    assert matrix["schema"] == "outilsia.runtime_driver_matrix.v1"
    assert matrix["version"] == "2026-07-11.1"
    assert matrix["policy"]["reported_api_is_not_runtime_proof"] is True
    assert matrix["policy"]["shared_memory_is_not_dedicated_vram"] is True
    assert matrix["policy"]["driver_installation"]["automatic_install_supported"] is False
    assert matrix["policy"]["driver_installation"]["silent_elevation_forbidden"] is True

    pascal = result["pascal"]
    assert pascal["family"]["id"] == "pascal"
    assert pascal["family"]["compute_capability"] == "6.x"
    assert pascal["family"]["cuda_toolkit_max"] == "12.x"
    assert pascal["family"]["last_driver_branch"] == "R580"
    assert pascal["backend"]["recommended"] == "cuda"
    assert pascal["backend"]["ollama_support_tier"] == "legacy_supported"
    assert pascal["api_signal"]["status"] == "reported"
    assert pascal["api_signal"]["value"] == "12.9"
    assert pascal["api_signal"]["is_runtime_proof"] is False
    assert pascal["api_capabilities"]["cuda"]["status"] == "reported_driver_max"
    assert pascal["api_capabilities"]["directml"]["ollama_backend"] is False
    assert pascal["actual_execution"]["is_proven"] is False
    assert result["pascalOldDriver"]["driver"]["status"] == "below_minimum"
    assert result["pascalOldDriver"]["verdict"]["key"] == "driver_below_minimum"
    assert result["pascalGpuProven"]["verdict"]["key"] == "gpu-proven"

    rtx = result["rtx"]
    assert rtx["family"]["id"] == "modern_cuda"
    assert rtx["backend"]["ollama_support_tier"] == "stable"
    assert rtx["driver"]["minimum_major"] == 531

    amd = result["amdWindows"]
    assert amd["backend"]["recommended"] == "rocm"
    assert amd["backend"]["ollama_support_tier"] == "stable_on_listed_hardware"
    assert amd["api_signal"]["is_runtime_proof"] is False

    strix_windows = result["strixWindows"]
    assert strix_windows["family"]["id"] == "strix_halo"
    assert strix_windows["backend"]["recommended"] == "vulkan"
    assert strix_windows["backend"]["ollama_support_tier"] == "experimental"
    assert strix_windows["backend"]["framework_support_tier"] == "supported_subset"
    assert strix_windows["memory"]["model"] == "unified"
    assert strix_windows["memory"]["dedicated_vram_gb"] is None
    assert strix_windows["memory"]["shared_system_memory_gb"] == 128
    assert strix_windows["memory"]["estimated_model_budget_gb"] == 48
    assert strix_windows["memory"]["dedicated_vram_claimed_from_shared_memory"] is False

    strix_linux = result["strixLinux"]
    assert strix_linux["backend"]["recommended"] == "rocm"
    assert strix_linux["backend"]["ollama_support_tier"] == "stable_on_listed_hardware"
    assert strix_linux["driver"]["kernel_driver"] == "amdgpu"

    intel = result["intelArc"]
    assert intel["family"]["id"] == "arc"
    assert intel["backend"]["recommended"] == "vulkan"
    assert intel["backend"]["ollama_support_tier"] == "experimental"
    assert intel["driver"]["official_url"].startswith("https://www.intel.com/")
    assert intel["driver"]["oem_warning"] is True
    assert intel["driver"]["installation_plan"]["mode"] == "manual_official_source"
    assert intel["driver"]["installation_plan"]["artifact_sha256"] == ""
    assert intel["driver"]["installation_plan"]["elevation_requested_by_outilsia"] is False
    assert intel["api_capabilities"]["directml"]["status"] == "not_probed"
    assert intel["api_capabilities"]["directml"]["ollama_backend"] is False
    assert intel["remediation"]["recommended"] is False
    assert intel["verdict"]["key"] == "cpu_fallback"

    cpu = result["cpuOnly"]
    assert cpu["vendor"] == "cpu"
    assert cpu["backend"]["recommended"] == "cpu"
    assert cpu["memory"]["model"] == "none"
    assert cpu["driver"]["official_url"] == ""
    assert cpu["acceleration_expected"] is False
    assert cpu["remediation"]["recommended"] is False
    assert result["cpuOnlyPrimaryAction"]["command"] != "open-gpu-driver"

    assert result["pascalCpuFallback"]["remediation"]["recommended"] is True
    assert result["pascalPrimaryAction"]["command"] == "open-gpu-driver"
    assert result["pascalDoctor"]["runtime"]["driver_intelligence"]["schema"] == "outilsia.runtime_driver_intelligence.v1"
    assert "Runtime & Driver Intelligence v1" in result["pascalPanel"]
    assert "CUDA toolkit 12.x maximum" in result["pascalPanel"]

    print(
        "runtime_driver_intelligence_ok "
        "pascal=legacy rtx=stable amd=rocm strix=unified intel=vulkan cpu=no-dead-end"
    )


if __name__ == "__main__":
    main()
