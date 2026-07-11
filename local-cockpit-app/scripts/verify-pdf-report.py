#!/usr/bin/env python3
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
CSS = ROOT / "src" / "styles.css"
OUT = ROOT / ".artifacts" / "visual-ui"
OUT.mkdir(parents=True, exist_ok=True)


REQUIRED_TEXT = [
    "Rapport IA locale",
    "Machine détectée",
    "Modèle conseillé",
    "Preuve locale",
    "PromptForge",
    "Arena locale",
    "Upgrade utile",
    "Modèles à tester",
    "Gagnants par usage",
    "Shopping / guides",
    "Profil technique",
    "Décision immédiate",
    "Modèle à privilégier",
    "Décision OutilsIA",
    "Build",
    "SHA",
    "Ce rapport sépare",
    "Synthèse terrain",
    "Profil terrain",
    "Compatibilité modèles",
    "Garde-fou médias",
    "Achat utile",
    "Décision d'achat",
    "Avant upgrade",
    "Après upgrade",
    "Budget indicatif",
    "Checklist achat",
    "À éviter",
    "Ce PC peut faire",
    "À installer maintenant",
    "Achat seulement si blocage",
    "Preuve partageable",
    "Comparer la VRAM",
    "acheter seulement si le benchmark local montre un vrai blocage",
    "Rapport local prêt",
    "Rapport partageable",
    "Lien public prêt",
    "https://outilsia.fr/r/demo",
    "Achat seulement après vérification",
    "Dossier upgrade IA locale",
    "Acheter si",
    "Attendre si",
    "Contrôler avant achat",
    "Limites actuelles",
    "Modèles débloqués",
    "compatibilité à confirmer",
]


FORBIDDEN_TEXT = [
    "undefined",
    "NaN",
    "[object Object]",
]


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 900, "height": 1200}, device_scale_factor=1)
        page.goto(HTML.as_uri(), wait_until="load")
        page.evaluate("""() => window.__OUTILSIA_TEST__.applyDemoState()""")
        html = page.evaluate("""() => window.__OUTILSIA_TEST__.pdfHtml()""")
        page.evaluate(
            """(html) => {
              const root = document.querySelector('#printReportRoot');
              root.innerHTML = html;
              root.style.display = 'block';
              document.querySelector('.app-shell').style.display = 'none';
            }""",
            html,
        )
        text = page.locator("#printReportRoot").inner_text(timeout=5000)
        normalized_text = text.lower()
        missing = [item for item in REQUIRED_TEXT if item.lower() not in normalized_text]
        if missing:
            raise AssertionError(f"pdf missing sections: {missing}")
        forbidden = [item for item in FORBIDDEN_TEXT if item in text]
        if forbidden:
            raise AssertionError(f"pdf contains invalid placeholders: {forbidden}")
        cards = page.locator("#printReportRoot .pdf-card").count()
        if cards < 8:
            raise AssertionError(f"pdf should contain rich cards, got {cards}")
        decision_items = page.locator("#printReportRoot .pdf-decision-strip > div").count()
        if decision_items < 4:
            raise AssertionError(f"pdf should contain decision strip, got {decision_items}")
        meters = page.locator("#printReportRoot .pdf-meter i").count()
        if meters < 3:
            raise AssertionError(f"pdf should contain score/vram/ram meters, got {meters}")
        guide_links = page.locator("#printReportRoot .pdf-link-list li").count()
        if guide_links < 1 and "Les liens d'achat sont masqués pendant la simulation Digital Twin" not in text:
            raise AssertionError("pdf should contain a guide link or explicitly explain why Digital Twin hid it")
        proof_items = page.locator("#printReportRoot .pdf-proof-band li").count()
        if proof_items < 4:
            raise AssertionError(f"pdf should contain proof band items, got {proof_items}")
        share_items = page.locator("#printReportRoot .pdf-share-panel > *").count()
        if share_items < 3:
            raise AssertionError(f"pdf should contain share/affiliate panel, got {share_items}")
        field_items = page.locator("#printReportRoot .pdf-field-cards > div").count()
        if field_items < 4:
            raise AssertionError(f"pdf should contain field summary cards, got {field_items}")
        exec_items = page.locator("#printReportRoot .pdf-exec-grid > div").count()
        if exec_items < 4:
            raise AssertionError(f"pdf should contain executive decision cards, got {exec_items}")
        upgrade_items = page.locator("#printReportRoot .pdf-upgrade-comparison > div").count()
        if upgrade_items < 3:
            raise AssertionError(f"pdf should contain upgrade comparison items, got {upgrade_items}")
        dossier = page.locator("#printReportRoot .pdf-upgrade-dossier").count()
        if dossier < 1:
            raise AssertionError("pdf should contain premium upgrade dossier")
        upgrade_rules = page.locator("#printReportRoot .pdf-upgrade-rules > div").count()
        if upgrade_rules < 3:
            raise AssertionError(f"pdf should contain buy/wait/control rules, got {upgrade_rules}")
        limit_items = page.locator("#printReportRoot .pdf-limit-list li").count()
        if limit_items < 4:
            raise AssertionError(f"pdf should contain current machine limits, got {limit_items}")
        screenshot = OUT / "local-cockpit-pdf-report.png"
        page.screenshot(path=screenshot, full_page=True)
        preview = OUT / "local-cockpit-pdf-preview.html"
        css = CSS.read_text(encoding="utf-8")
        preview.write_text(
            "\n".join([
                "<!doctype html>",
                '<html lang="fr">',
                "<head>",
                '<meta charset="utf-8">',
                '<meta name="viewport" content="width=device-width, initial-scale=1">',
                "<title>OutilsIA Local Cockpit - Rapport PDF preview</title>",
                "<style>",
                css,
                ".print-report-root{display:block!important}.app-shell{display:none!important}",
                "</style>",
                "</head>",
                "<body>",
                '<div class="print-report-root">',
                html,
                "</div>",
                "</body>",
                "</html>",
            ]),
            encoding="utf-8",
        )
        browser.close()
    print(f"pdf_report_ok screenshot={screenshot} preview={preview}")


if __name__ == "__main__":
    main()
