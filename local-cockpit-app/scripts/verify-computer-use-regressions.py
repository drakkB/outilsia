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
        assert stale["modelInstalled"] is True, stale
        assert stale["modelInstalledInScan"] is False, stale
        assert stale["action"]["command"] == "install-test", stale
        assert stale["reportReady"] is False, stale
        require(stale["firstTest"], "Mesure historique", "état historique qwen")
        require(stale["firstTest"], "ne détecte plus qwen3:0.6b", "garde-fou qwen")
        forbid(stale["firstTest"], "qwen3:0.6b installé", "état installé qwen")
        quick_preset = page.evaluate(
            """() => {
              const el = document.querySelector('[data-chat-preset="quick"]');
              return {
                text: el?.textContent || '',
                disabled: Boolean(el?.disabled)
              };
            }"""
        )
        assert quick_preset["disabled"] is True, quick_preset
        require(quick_preset["text"], "Mesure historique", "preset Qwen historique")
        require(quick_preset["text"], "modèle absent", "preset Qwen absent")
        model_actions = page.evaluate(
            """() => {
              const deleteButton = document.querySelector('[data-delete-model]');
              const actions = deleteButton?.closest('.model-actions');
              const secondary = actions?.querySelector('.model-secondary-actions');
              return {
                directButtons: actions
                  ? [...actions.children].filter((el) => el.tagName === 'BUTTON').length
                  : 0,
                secondaryPresent: Boolean(secondary),
                secondaryOpen: Boolean(secondary?.open),
                deleteVisible: Boolean(deleteButton?.getClientRects().length)
              };
            }"""
        )
        assert model_actions["directButtons"] <= 2, model_actions
        assert model_actions["secondaryPresent"] is True, model_actions
        assert model_actions["secondaryOpen"] is False, model_actions
        assert model_actions["deleteVisible"] is False, model_actions

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

        page.locator("#benchmarkPromptInput").fill(
            "Pourquoi la VRAM est importante pour un LLM local ?"
        )
        native_consent = page.evaluate(
            """async () => {
              const button = document.querySelector('#benchmarkBtn');
              const result = document.querySelector('#benchmarkResult');
              const status = document.querySelector('#statusText');
              const originalConfirm = window.confirm;
              const messages = [];
              const before = result?.textContent || '';
              try {
                window.confirm = (message) => {
                  messages.push(String(message || ''));
                  return false;
                };
                button?.click();
                await new Promise((resolve) => setTimeout(resolve, 120));
                const afterCancel = result?.textContent || '';
                const cancelledStatus = status?.textContent || '';

                window.confirm = (message) => {
                  messages.push(String(message || ''));
                  return true;
                };
                button?.click();
                await new Promise((resolve) => setTimeout(resolve, 220));
                return {
                  messages,
                  before,
                  afterCancel,
                  afterAccept: result?.textContent || '',
                  cancelledStatus,
                  acceptedStatus: status?.textContent || ''
                };
              } finally {
                window.confirm = originalConfirm;
              }
            }"""
        )
        assert len(native_consent["messages"]) == 2, native_consent
        assert native_consent["afterCancel"].strip() == native_consent["before"].strip(), native_consent
        require(native_consent["cancelledStatus"], "annulé avant exécution", "annulation benchmark")
        require(native_consent["messages"][0], "Hermes 3 8B", "modèle confirmation benchmark")
        require(native_consent["messages"][0], "Ollama Windows", "runtime confirmation benchmark")
        require(
            native_consent["messages"][0],
            "Prompt : standard Benchmark Commons",
            "classification du prompt standard",
        )
        forbid(
            native_consent["messages"][0],
            "personnalisé",
            "classification du prompt standard",
        )
        require(native_consent["messages"][0], "Aucun téléchargement ni envoi cloud", "frontière benchmark")
        assert native_consent["afterAccept"].strip() != native_consent["before"].strip(), native_consent
        require(native_consent["acceptedStatus"], "Test réussi", "benchmark après consentement")

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

        history_output = f"{'Réponse historique complète. ' * 40}FIN DU TEST OUTILSIA"
        page.evaluate(
            """(output) => {
              localStorage.setItem(
                'outilsia.localCockpit.chatHistory.v1',
                JSON.stringify([{
                  id: 'chat-regression',
                  created_at_ms: Date.now(),
                  model: 'hermes3:8b',
                  prompt: 'Conserver la réponse complète',
                  output_preview: output.slice(0, 700),
                  output_text: output,
                  output_truncated: false,
                  done_reason: 'stop',
                  elapsed_ms: 1200,
                  estimated_tokens_per_second: 80,
                  success: true
                }])
              );
            }""",
            history_output,
        )
        page.reload(wait_until="load")
        history = page.locator(".chat-history-item").first.inner_text()
        require(history, "FIN DU TEST OUTILSIA", "historique dialogue complet")

        page.set_viewport_size({"width": 1024, "height": 768})
        responsive_1024 = page.evaluate(
            """() => {
              const styles = ['#topGpuText', '#topOsText'].map((selector) => {
                const style = getComputedStyle(document.querySelector(selector));
                return {
                  selector,
                  whiteSpace: style.whiteSpace,
                  textOverflow: style.textOverflow
                };
              });
              const tabs = [...document.querySelectorAll('.workspace-tabs [role="tab"]')]
                .map((el) => {
                  const rect = el.getBoundingClientRect();
                  return {
                    text: el.textContent,
                    visible: rect.left >= 0 && rect.right <= innerWidth
                  };
                });
              return {
                styles,
                tabs,
                viewport: innerWidth,
                scrollWidth: document.documentElement.scrollWidth
              };
            }"""
        )
        assert all(item["whiteSpace"] == "normal" for item in responsive_1024["styles"]), responsive_1024
        assert all(item["textOverflow"] == "clip" for item in responsive_1024["styles"]), responsive_1024
        assert all(tab["visible"] for tab in responsive_1024["tabs"]), responsive_1024
        assert responsive_1024["scrollWidth"] <= responsive_1024["viewport"], responsive_1024

        page.set_viewport_size({"width": 963, "height": 700})
        responsive_963 = page.evaluate(
            """() => ({
              viewport: innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
              tabs: [...document.querySelectorAll('.workspace-tabs [role="tab"]')]
                .map((el) => {
                  const rect = el.getBoundingClientRect();
                  return {
                    text: el.textContent,
                    visible: rect.left >= 0 && rect.right <= innerWidth
                  };
                })
            })"""
        )
        assert all(tab["visible"] for tab in responsive_963["tabs"]), responsive_963
        assert responsive_963["scrollWidth"] <= responsive_963["viewport"], responsive_963

        browser.close()

    print(
        "computer_use_regressions_ok "
        "stale_install=blocked consent=native_cancel_then_accept "
        "standard_prompt=identified report=visible "
        "cpu=wrapped promptforge=heuristic chat=complete "
        "history=complete presets=historical model_actions=progressive responsive=963"
    )


if __name__ == "__main__":
    main()
