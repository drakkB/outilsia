#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"


def require(text: str, needle: str, label: str):
    if needle not in text:
        raise AssertionError(f"{label}: {needle!r} absent de {text[:600]!r}")


def forbid(text: str, needle: str, label: str):
    if needle in text:
        raise AssertionError(f"{label}: {needle!r} ne doit pas apparaître dans {text[:600]!r}")


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(HTML.as_uri(), wait_until="load")

        stale = page.evaluate(
            "() => window.__OUTILSIA_TEST__.applyComputerUseRegressionState()"
        )
        assert stale["modelInstalled"] is False, stale
        assert stale["action"]["command"] == "install-test", stale
        assert stale["reportReady"] is False, stale
        require(stale["firstTest"], "Mesure historique", "état historique qwen")
        require(stale["firstTest"], "ne détecte plus qwen3:0.6b", "garde-fou qwen")
        forbid(stale["firstTest"], "qwen3:0.6b installé", "état installé qwen")

        cpu = page.evaluate(
            """() => {
              const el = document.querySelector('#topCpuText');
              const style = getComputedStyle(el);
              return {
                text: el.textContent,
                whiteSpace: style.whiteSpace,
                overflow: style.overflow,
                textOverflow: style.textOverflow,
                height: el.getBoundingClientRect().height
              };
            }"""
        )
        assert cpu["text"] == "AMD Ryzen 7 7800X3D 8-Core Processor", cpu
        assert cpu["whiteSpace"] == "normal", cpu
        assert cpu["textOverflow"] == "clip", cpu
        assert cpu["height"] > 20, cpu

        before = page.locator("#benchmarkResult").inner_text()
        page.evaluate(
            """() => document
              .querySelector('[data-benchmark-model="hermes3:8b"]')
              ?.click()"""
        )
        page.wait_for_timeout(450)
        consent = page.evaluate(
            """() => ({
              tab: document.querySelector('.app-shell')?.dataset.workspaceTab,
              section: document.querySelector('#workspaceSectionSelect')?.value,
              model: document.querySelector('#benchmarkModelInput')?.value,
              result: document.querySelector('#benchmarkResult')?.textContent || '',
              preflight: document.querySelector('#benchmarkPreflight')?.textContent || '',
              status: document.querySelector('#statusText')?.textContent || '',
              button: document.querySelector('#benchmarkBtn')?.textContent || ''
            })"""
        )
        assert consent["tab"] == "tests", consent
        assert consent["model"] == "hermes3:8b", consent
        assert consent["result"].strip() == before.strip(), consent
        require(consent["preflight"], "Hermes", "préflight Hermes")
        require(consent["status"], "puis clique", "second consentement")
        assert consent["button"].strip(), consent

        report_state = page.evaluate(
            "() => window.__OUTILSIA_TEST__.applyReportNeededState()"
        )
        assert report_state["action"]["command"] == "report", report_state
        page.evaluate("() => document.querySelector('#quickActionBtn')?.click()")
        page.wait_for_timeout(350)
        report = page.evaluate(
            """() => ({
              confirmation: document.querySelector('#readinessReportConfirmation')?.textContent || '',
              action: document.querySelector('#quickActionText')?.textContent || '',
              button: document.querySelector('#quickActionBtn')?.textContent || '',
              section: document.querySelector('#workspaceSectionSelect')?.value
            })"""
        )
        require(report["confirmation"], "Rapport final prêt", "confirmation rapport")
        require(report["confirmation"], "bilan affiché ci-dessous", "destination rapport")
        assert report["action"].strip() == "Sauvegarder ce PC", report
        assert report["button"].strip() == "Sauvegarder ce PC", report
        assert report["section"] == ".readiness-panel", report

        prompt = page.evaluate(
            """() => {
              const result = window.__OUTILSIA_TEST__.promptForgeOptimize(
                'Explique la VRAM en français.'
              );
              window.__OUTILSIA_TEST__.renderPromptForge(result);
              return {
                state: document.querySelector('#promptForgeState')?.textContent || '',
                panel: document.querySelector('#promptForgeResult')?.textContent || '',
                method: result.after.method
              };
            }"""
        )
        require(prompt["state"], "Grille", "badge PromptForge")
        require(prompt["panel"], "Score heuristique local", "méthode PromptForge")
        require(prompt["panel"], "ni un benchmark", "limite PromptForge")
        assert prompt["method"] == "heuristique_locale_v1", prompt

        chat = page.evaluate(
            """() => {
              const output = `${'Réponse complète. '.repeat(55)}FIN`;
              const base = {
                success: true,
                model: 'hermes3:8b',
                elapsed_ms: 1200,
                estimated_tokens_per_second: 80,
                measurement_source: 'ollama_api',
                output_preview: output.slice(0, 700),
                output_text: output,
                output_truncated: false,
                done_reason: 'stop'
              };
              window.__OUTILSIA_TEST__.renderLocalChat(base);
              const complete = document.querySelector('#chatResult')?.textContent || '';
              window.__OUTILSIA_TEST__.renderLocalChat({
                ...base,
                output_truncated: true,
                done_reason: 'length'
              });
              const incomplete = document.querySelector('#chatResult')?.textContent || '';
              return { complete, incomplete };
            }"""
        )
        require(chat["complete"], "FIN", "réponse complète")
        forbid(chat["complete"], "Réponse incomplète", "réponse complète")
        require(chat["incomplete"], "Réponse incomplète", "signal de troncature")
        require(chat["incomplete"], "length", "raison de troncature")

        browser.close()

    print(
        "computer_use_regressions_ok "
        "stale_install=blocked consent=two_clicks report=visible "
        "cpu=wrapped promptforge=heuristic chat=complete"
    )


if __name__ == "__main__":
    main()
