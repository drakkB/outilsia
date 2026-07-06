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
        raise AssertionError(f"{label}: button overflow {bad[:8]}")


def assert_disabled_cancel_hidden(page, label: str):
    visible = page.evaluate(
        """() => {
          const btn = document.querySelector('#cancelOperationBtn');
          if (!btn) return false;
          return btn.offsetParent !== null || getComputedStyle(btn).display !== 'none';
        }"""
    )
    if visible:
        raise AssertionError(f"{label}: disabled cancel button should be hidden while idle")


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


def assert_single_header_action(page, label: str):
    primary = page.locator("#prepareBtn").inner_text(timeout=5000)
    if "Actualiser l'analyse" not in primary and "Analyser ce PC" not in primary:
        raise AssertionError(f"{label}: unstable header action label: {primary!r}")
    hidden = page.evaluate(
        """() => ['#scanBtn', '#checkBtn', '#saveBtn', '#topAccountBtn']
          .filter((selector) => {
            const el = document.querySelector(selector);
            return el && el.offsetParent !== null && getComputedStyle(el).display !== 'none';
          })"""
    )
    if hidden:
        raise AssertionError(f"{label}: secondary header actions should be hidden: {hidden}")


def assert_text(page, selector: str, needle: str, label: str):
    text = page.locator(selector).inner_text(timeout=5000)
    if needle not in text:
        raise AssertionError(f"{label}: missing {needle!r} in {selector}: {text[:500]}")


def assert_no_text(page, selector: str, forbidden: str, label: str):
    text = page.locator(selector).inner_text(timeout=5000)
    if forbidden in text:
        raise AssertionError(f"{label}: forbidden {forbidden!r} in {selector}: {text[:500]}")


def visible_focus_tools(page):
    return page.evaluate(
        """() => [...document.querySelectorAll('.benchmark-panel, .promptforge-panel, .chat-panel')]
          .filter((panel) => panel.offsetParent !== null)
          .map((panel) => panel.className)"""
    )


def assert_sticky_action_visible(page, label: str):
    quick = page.locator("#quickActionText").inner_text(timeout=5000).strip()
    sticky_text = page.locator("#stickyActionText").inner_text(timeout=5000).strip()
    button_text = page.locator("#stickyActionBtn").inner_text(timeout=5000).strip()
    if quick != sticky_text or quick != button_text:
        raise AssertionError(f"{label}: sticky action mismatch quick={quick!r} sticky={sticky_text!r} button={button_text!r}")
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(120)
    visible = page.evaluate(
        """() => {
          const el = document.querySelector('.sticky-action-strip');
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0 && rect.height > 0;
        }"""
    )
    if not visible:
        raise AssertionError(f"{label}: sticky action strip not visible after scroll")
    page.evaluate("window.scrollTo(0, 0)")


def assert_sticky_action_hidden_in_essential(page, label: str):
    visible = page.evaluate(
        """() => {
          const el = document.querySelector('.sticky-action-strip');
          if (!el) return false;
          return el.offsetParent !== null && getComputedStyle(el).display !== 'none';
        }"""
    )
    if visible:
        raise AssertionError(f"{label}: sticky action duplicates the primary action in essential mode")


def check_scanned_view(browser, width: int, height: int, label: str):
    page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    page.goto(HTML.as_uri(), wait_until="load")
    result = page.evaluate("""() => window.__OUTILSIA_TEST__.applyDemoState()""")
    page.wait_for_timeout(250)

    assert_no_horizontal_overflow(page, label)
    assert_button_text_fits(page, label)
    assert_disabled_cancel_hidden(page, label)
    assert_idle_console_button_hidden(page, label)
    assert_single_header_action(page, label)
    assert_text(page, "#quickActionText", "Installer le modèle de test", f"{label} quick action")
    assert_text(page, "#quickActionDetail", "Score", f"{label} quick score context")
    assert_text(page, "#quickActionDetail", "modèle(s) compatibles", f"{label} quick compatible models")
    assert_text(page, ".quick-decision-strip", "Modèle conseillé", f"{label} recommended model label")
    assert_text(page, "#topOllamaText", "Prêt", f"{label} runtime summary")
    assert_text(page, "#topGpuText", "RTX", f"{label} machine summary gpu")
    assert_text(page, "#quickModelDetail", "benchmarké", f"{label} quick model")
    assert_text(page, "#quickProofText", "qwen3:0.6b", f"{label} quick proof")
    assert_text(page, "#quickUpgradeText", "Gros LLM", f"{label} quick upgrade")
    assert_sticky_action_visible(page, label)
    assert_text(page, "#readinessBox", "Machine à compléter", f"{label} readiness")
    assert_text(page, "#readinessBox", "Installer qwen3:0.6b", f"{label} readiness next step")
    assert_text(page, "#arenaBox", "Meilleur compromis", f"{label} arena")
    assert_no_text(page, "#arenaBox", "undefined/100", f"{label} arena score")
    assert_no_text(page, "#arenaBox", "NaN/100", f"{label} arena score")
    assert_no_text(page, "#readinessBox", "compromis qwen3:0.6b (0/100)", f"{label} readiness compromise")
    assert_no_text(page, "#readinessBox", "undefined/100", f"{label} readiness score")
    visible_tools = visible_focus_tools(page)
    if len(visible_tools) > 1:
        raise AssertionError(f"{label}: essential mode shows too many work panels {visible_tools}")

    memory = result["memory"]
    required_memory = [
        "# MEMORY - OutilsIA Local Cockpit",
        "# Manifeste vault Obsidian",
        "# LOCAL_CONTEXT - Machine IA locale",
        "# HERMES - Agent local contrôlé",
        "# Fiches modèles OutilsIA",
        "# Fiches benchmarks locaux",
        "# Décisions et prochaines actions",
        "INDEX.md",
        "MANIFESTE.md",
        "00-Machine.md",
        "01-Modeles-compatibles.md",
        "02-Modeles-installes.md",
        "03-Benchmarks.md",
        "10-Journal-cockpit.md",
        "MEMORY.md",
        "HERMES.md",
        "PromptForge",
        "qwen3:0.6b",
        "hermes3:8b",
    ]
    missing_memory = [needle for needle in required_memory if needle not in memory]
    if missing_memory:
        raise AssertionError(f"{label}: memory export missing {missing_memory}")

    clicked_memory = page.evaluate(
        """() => {
          const text = document.querySelector('#memoryText');
          const btn = document.querySelector('#saveReadinessMemoryBtn');
          if (!text || !btn) return '';
          text.value = '';
          btn.click();
          return text.value;
        }"""
    )
    clicked_missing = [needle for needle in required_memory if needle not in clicked_memory]
    if clicked_missing:
        raise AssertionError(f"{label}: readiness MemoryForge button missing {clicked_missing}")
    vault_result = page.locator("#vaultResult").inner_text(timeout=5000)
    if "MemoryForge prêt pour Obsidian" not in vault_result or "benchmarks" not in vault_result.lower():
        raise AssertionError(f"{label}: MemoryForge click feedback unclear: {vault_result}")

    bridge = result["bridge"]
    if bridge.get("schema") != "outilsia.strategy_arena_readiness.v1":
        raise AssertionError(f"{label}: bad bridge schema {bridge.get('schema')}")
    if not bridge.get("contract_version"):
        raise AssertionError(f"{label}: missing bridge contract_version")
    forbidden = bridge.get("separation_rules", {}).get("forbidden_in_outilsia", [])
    for item in ["generation_strategie", "backtest_financier", "optimisation_quant", "export_pine"]:
        if item not in forbidden:
            raise AssertionError(f"{label}: bridge missing forbidden rule {item}")
    roles = bridge.get("recommended_roles", {})
    if not roles.get("memory") or not roles.get("compromise"):
        raise AssertionError(f"{label}: bridge missing recommended roles {roles}")

    failed_winners = page.evaluate(
        """() => window.__OUTILSIA_TEST__.arenaWinners([
          {
            model: 'deepseek-r1:14b',
            success: false,
            error: 'timeout',
            elapsed_ms: 60000,
            estimated_tokens_per_second: 2.9,
            output_preview: ''
          },
          {
            model: 'bad-model:latest',
            success: false,
            error: 'model not found',
            elapsed_ms: 1200,
            estimated_tokens_per_second: 0,
            output_preview: ''
          }
        ])"""
    )
    for key in ["recommended", "compromise", "assistant", "code", "memory"]:
        if failed_winners.get(key):
            raise AssertionError(f"{label}: failed arena model was recommended as {key}: {failed_winners.get(key)}")

    balanced_winners = page.evaluate(
        """() => window.__OUTILSIA_TEST__.arenaWinners([
          {
            model: 'qwen3:0.6b',
            success: true,
            elapsed_ms: 900,
            estimated_tokens_per_second: 120,
            output_preview: 'Réponse courte utile.'
          },
          {
            model: 'hermes3:8b',
            success: true,
            elapsed_ms: 3200,
            estimated_tokens_per_second: 28,
            output_preview: 'Verdict court : cette machine peut faire tourner des modèles locaux utiles. Pourquoi : la VRAM garde les poids du modèle près du GPU, la RAM aide le contexte, et Ollama simplifie le lancement. Prochaine action : tester Hermes pour mémoire et Qwen pour vitesse.'
          }
        ])"""
    )
    if balanced_winners.get("fastest", {}).get("model") != "qwen3:0.6b":
        raise AssertionError(f"{label}: fastest winner should remain qwen3:0.6b {balanced_winners}")
    if balanced_winners.get("assistant", {}).get("model") != "hermes3:8b":
        raise AssertionError(f"{label}: assistant winner should be hermes3:8b {balanced_winners}")
    if balanced_winners.get("compromise", {}).get("model") != "hermes3:8b":
        raise AssertionError(f"{label}: compromise should not over-reward tiny fast model {balanced_winners}")
    if balanced_winners.get("light_laptop", {}).get("model") != "qwen3:0.6b":
        raise AssertionError(f"{label}: light laptop winner should remain qwen3:0.6b {balanced_winners}")

    defensive_score = page.evaluate(
        """() => window.__OUTILSIA_TEST__.arenaDisplayScore({
          model: 'qwen3:0.6b',
          success: true,
          estimated_tokens_per_second: 14.6,
          elapsed_ms: 2048,
          output_preview: 'Réponse courte structurée.',
          arena_profiles: { compromise: { score: undefined } }
        }, 'compromise')"""
    )
    if not isinstance(defensive_score, (int, float)) or defensive_score < 0 or defensive_score > 100:
        raise AssertionError(f"{label}: defensive arena score invalid {defensive_score!r}")

    screenshot = OUT / f"local-cockpit-scanned-{label}.png"
    page.screenshot(path=str(screenshot), full_page=True)

    promptforge_state = page.evaluate("""() => window.__OUTILSIA_TEST__.applyPromptForgeNeededState()""")
    if promptforge_state["action"]["key"] in {"promptforge", "chat"}:
        raise AssertionError(f"{label}: PromptForge/chat should not be the top action after benchmark, got {promptforge_state['action']}")
    visible_tools = visible_focus_tools(page)
    allowed_tools = {"panel benchmark-panel essential-active-panel"}
    unexpected_tools = [tool for tool in visible_tools if tool not in allowed_tools]
    if unexpected_tools:
        raise AssertionError(f"{label}: optional tools should not stay as a main panel in essential mode {visible_tools}")
    quick_action = page.locator("#quickActionText").inner_text(timeout=5000)
    if "Optimiser" in quick_action or "PromptForge" in quick_action:
        raise AssertionError(f"{label}: PromptForge leaked into top action: {quick_action}")

    install_state = page.evaluate("""() => window.__OUTILSIA_TEST__.applyInstallProgressState()""")
    if "Téléchargement en cours" not in install_state["operationTitle"]:
        raise AssertionError(f"{label}: install progress title unclear {install_state}")
    if install_state["operationState"] != "téléchargement":
        raise AssertionError(f"{label}: install progress state should be téléchargement {install_state}")
    if not install_state["installing"] or install_state["installed"]:
        raise AssertionError(f"{label}: active pull should not be marked installed {install_state}")
    if "pulling 96e6f7d988dd" not in install_state["operationLines"]:
        raise AssertionError(f"{label}: top monitor should show active pull progress {install_state}")
    if not install_state.get("monitorLive"):
        raise AssertionError(f"{label}: active pull should mark monitor as live {install_state}")
    if install_state.get("jumpVisible"):
        raise AssertionError(f"{label}: essential mode should not expose the top console jump button {install_state}")
    if install_state.get("cancelVisible"):
        raise AssertionError(f"{label}: essential mode should not expose the top cancel button {install_state}")
    if not install_state.get("panelVisible"):
        raise AssertionError(f"{label}: active pull should reveal detailed console in essential mode {install_state}")

    page.close()
    return screenshot


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        desktop = check_scanned_view(browser, 1440, 1000, "desktop")
        mobile = check_scanned_view(browser, 390, 920, "mobile")
        small = check_scanned_view(browser, 320, 820, "small")
        browser.close()
    print(f"scanned_state_ui_ok desktop={desktop} mobile={mobile} small={small}")


if __name__ == "__main__":
    main()
