#!/usr/bin/env python3
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
APP_JS = ROOT / "src" / "app.js"
RUST = ROOT / "src-tauri" / "src" / "benchmark_commons.rs"
LIB_RS = ROOT / "src-tauri" / "src" / "lib.rs"
LEDGER_RS = ROOT / "src-tauri" / "src" / "evidence_ledger.rs"
OUT = ROOT / ".artifacts" / "visual-ui"
OUT.mkdir(parents=True, exist_ok=True)


def assert_static_contract() -> None:
    html = HTML.read_text(encoding="utf-8")
    app_js = APP_JS.read_text(encoding="utf-8")
    rust = RUST.read_text(encoding="utf-8")
    lib_rs = LIB_RS.read_text(encoding="utf-8")
    ledger = LEDGER_RS.read_text(encoding="utf-8")

    for expected in (
        'CONTRIBUTION_SCHEMA: &str = "outilsia.benchmark_commons.contribution.v1"',
        'RECEIPT_SCHEMA: &str = "outilsia.benchmark_commons.receipt.v1"',
        "ROTATION_MS: u128 = 30 * 24 * 60 * 60 * 1000",
        "PREVIEW_TTL_MS: u128 = 15 * 60 * 1000",
        "APPROVAL_TTL_MS: u128 = 2 * 60 * 1000",
        'request.scan.source != "tauri-local-cockpit"',
        'benchmark.measurement_source != "ollama_api"',
        "benchmark.eval_duration_ms < 200",
        "standard_prompt_sha256",
        '"field_test_proof": false',
        '"community_verified": false',
        '"leaderboard_eligible": false',
        '"network_sent": false',
        '"ip_stored_in_commons_record"',
        '"user_agent_stored_in_commons_record"',
        "write_json_no_overwrite",
        "confirmed_in_native_ui",
        "explicitly_approved_in_native_ui",
        "explicitly_revoked_in_native_ui",
        "path.with_extension(\"json.bak\")",
    ):
        if expected not in rust:
            raise AssertionError(f"missing Benchmark Commons Rust contract: {expected}")

    for forbidden_network_primitive in (
        "reqwest",
        "TcpStream",
        "UdpSocket",
        "https://",
        "http://",
        ".send(",
    ):
        if forbidden_network_primitive in rust:
            raise AssertionError(
                f"Benchmark Commons unexpectedly gained network code: "
                f"{forbidden_network_primitive}"
            )

    for expected in (
        "prepare_benchmark_contribution,",
        "approve_benchmark_contribution,",
        "export_benchmark_contribution,",
        "submit_benchmark_contribution_with_token,",
        "revoke_benchmark_contribution_with_token,",
        "revoke_benchmark_contribution,",
        "rotate_benchmark_commons_pseudonym,",
        "get_benchmark_commons_status,",
        ".manage(BenchmarkCommonsState::default())",
    ):
        if expected not in lib_rs:
            raise AssertionError(f"missing Tauri Benchmark Commons registration: {expected}")

    for expected in (
        "benchmark_commons_export_recorded",
        "benchmark_commons_revocation_recorded",
        "append_benchmark_commons_receipt",
    ):
        if expected not in ledger:
            raise AssertionError(f"missing Evidence Ledger bridge: {expected}")

    for element_id in (
        "benchmarkCommonsState",
        "benchmarkCommonsDestination",
        "prepareBenchmarkCommonsBtn",
        "prepareBenchmarkCommonsTestBtn",
        "benchmarkCommonsBox",
        "benchmarkCommonsConsent",
        "benchmarkCommonsNetworkState",
        "benchmarkCommonsNetworkConsent",
        "approveBenchmarkCommonsBtn",
        "exportBenchmarkCommonsBtn",
        "syncBenchmarkCommonsBtn",
        "submitBenchmarkCommonsBtn",
        "revokeBenchmarkCommonsRemoteBtn",
        "revokeBenchmarkCommonsBtn",
        "rotateBenchmarkCommonsBtn",
    ):
        if f'id="{element_id}"' not in html:
            raise AssertionError(f"missing Benchmark Commons control: {element_id}")

    for expected in (
        "local par défaut · partage opt-in",
        "L'aperçu reste local sans autorisation HTTPS séparée",
        "ni preuve terrain ni classement communautaire",
        "aucun prompt, résultat brut, fichier, compte, jeton ou identifiant stable",
        "Partage communautaire",
        "Le serveur le rattache à mon compte et à la machine synchronisée",
        "sans renvoyer ces identifiants",
        "Conservation maximale : 180 jours",
        "Envoyer au Commons",
        "Retirer du Commons",
    ):
        if expected not in html:
            raise AssertionError(f"missing honest UI boundary: {expected}")

    for expected in (
        "benchmarkCommonsEligibleBenchmark",
        "BENCHMARK_COMMONS_STANDARD_PROMPT",
        'invoke("prepare_benchmark_contribution"',
        'invoke("approve_benchmark_contribution"',
        'invoke("export_benchmark_contribution"',
        'invoke("submit_benchmark_contribution_with_token"',
        'invoke("revoke_benchmark_contribution_with_token"',
        'invoke("revoke_benchmark_contribution"',
        "Un second clic reste nécessaire",
        "Aucun envoi réseau ne sera effectué",
        "rattachement au compte et à la machine synchronisée",
        "son HMAC reste vérifiable côté serveur",
        "applyBenchmarkCommonsState",
    ):
        if expected not in app_js:
            raise AssertionError(f"missing Benchmark Commons UI behavior: {expected}")

    for expected in (
        'const OUTILSIA_ENDPOINT: &str = "https://outilsia.fr"',
        "/api/desktop/benchmark-commons/submit",
        "/api/desktop/benchmark-commons/{contribution_id}/revoke",
        "benchmark_commons_upload_enabled()",
        "Policy::none()",
        "Duration::from_secs(20)",
    ):
        if expected not in lib_rs:
            raise AssertionError(f"missing guarded Benchmark Commons network contract: {expected}")

    if re.search(
        r"approve_benchmark_contribution[\s\S]{0,500}"
        r"export_benchmark_contribution",
        rust,
    ):
        raise AssertionError(
            "approval command must not call the export command in the same operation"
        )


def assert_private_keys_absent(value) -> None:
    forbidden_keys = {
        "machine_key",
        "raw_scan",
        "prompt",
        "output_preview",
        "output_text",
        "hostname",
        "account_email",
        "desktop_token",
        "path",
    }

    def walk(item):
        if isinstance(item, dict):
            overlap = forbidden_keys.intersection(item)
            if overlap:
                raise AssertionError(
                    f"private key leaked into contribution: {sorted(overlap)}"
                )
            for nested in item.values():
                walk(nested)
        elif isinstance(item, list):
            for nested in item:
                walk(nested)

    walk(value)


TAURI_MOCK = """
(() => {
  const baseline = {
    schema: "outilsia.benchmark_commons.status.v1",
    contract_version: "2026-07-28",
    mode: "local_export_only",
    upload_available: false,
    network_sent: false,
    field_test_proof: false,
    community_verified: false,
    leaderboard_available: false,
    registry: {
      pseudonym: {
        value: "anon-000000000000000000000000",
        issued_at_ms: Date.now(),
        expires_at_ms: Date.now() + 86400000,
        rotation_days: 30
      },
      exports: []
    },
    prepared: []
  };
  const invoke = async (command) => {
    if (command === "get_benchmark_commons_status") return baseline;
    if (command === "list_local_snapshots") return [];
    if (command === "get_desktop_auth") return {};
    if (command === "get_app_build_info") {
      return {
        app_version: "0.1.2",
        channel: "candidate",
        build_id: "20260728120000",
        source_commit: "test",
        target_os: "windows",
        target_arch: "x86_64"
      };
    }
    if (command === "get_desktop_manifest") return {};
    if (command.startsWith("get_") || command.startsWith("list_")) return null;
    return { success: true };
  };
  window.__TAURI__ = {
    core: { invoke },
    event: { listen: async () => () => {} }
  };
})();
"""


def verify_viewport(browser, width: int, height: int, label: str) -> Path:
    context = browser.new_context(viewport={"width": width, "height": height})
    context.add_init_script(TAURI_MOCK)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(HTML.as_uri(), wait_until="load")
    page.wait_for_timeout(500)
    page.evaluate("() => window.__OUTILSIA_TEST__.setWorkspaceTab('tests')")
    page.evaluate(
        "() => window.__OUTILSIA_TEST__.setWorkspaceSection("
        "'tests', '.benchmark-history-panel')"
    )

    awaiting = page.evaluate(
        "() => window.__OUTILSIA_TEST__.applyBenchmarkCommonsState('awaiting_human')"
    )
    section = page.locator(".benchmark-commons")
    section.scroll_into_view_if_needed()
    assert awaiting["eligible"] is True
    assert awaiting["stateLabel"] == "aperçu à vérifier"
    assert awaiting["controls"]["consentDisabled"] is False
    assert awaiting["controls"]["approveDisabled"] is True
    assert awaiting["controls"]["exportDisabled"] is True
    assert awaiting["controls"]["revokeDisabled"] is True
    assert_private_keys_absent(awaiting["contribution"])

    serialized = json.dumps(awaiting["contribution"], ensure_ascii=False)
    for forbidden_value in (
        "demo-local",
        "La VRAM stocke les poids",
        "Pourquoi la VRAM",
        "C:\\Users\\",
        "/home/",
        "drakkeng",
        "@gmail.com",
    ):
        if forbidden_value in serialized:
            raise AssertionError(
                f"{label}: private value leaked into contribution: {forbidden_value}"
            )

    consent = page.locator("#benchmarkCommonsConsent")
    approve = page.locator("#approveBenchmarkCommonsBtn")
    if consent.is_disabled():
        raise AssertionError(f"{label}: explicit consent is not available")
    consent.check()
    if approve.is_disabled():
        raise AssertionError(f"{label}: consent does not unlock native approval")
    if not page.locator("#exportBenchmarkCommonsBtn").is_disabled():
        raise AssertionError(f"{label}: export unlocked before separate approval")

    approved = page.evaluate(
        "() => window.__OUTILSIA_TEST__.applyBenchmarkCommonsState('approved')"
    )
    if approved["controls"]["exportDisabled"]:
        raise AssertionError(f"{label}: approved preview cannot be exported")
    if not approved["controls"]["approveDisabled"]:
        raise AssertionError(f"{label}: approved preview can be approved twice")
    if "second clic requis" not in approved["ui"]:
        raise AssertionError(f"{label}: separate export gesture is not explained")

    exported = page.evaluate(
        "() => window.__OUTILSIA_TEST__.applyBenchmarkCommonsState('exported')"
    )
    if exported["controls"]["revokeDisabled"]:
        raise AssertionError(f"{label}: active local export cannot be revoked")
    if "Serveur : aucune soumission" not in exported["ui"]:
        raise AssertionError(f"{label}: local-only export boundary is missing")

    revoked = page.evaluate(
        "() => window.__OUTILSIA_TEST__.applyBenchmarkCommonsState('revoked')"
    )
    if not revoked["controls"]["revokeDisabled"]:
        raise AssertionError(f"{label}: revoked export remains actionable")

    network_ready = page.evaluate(
        "() => window.__OUTILSIA_TEST__.applyBenchmarkCommonsState('network_ready')"
    )
    if network_ready["controls"]["networkConsentDisabled"]:
        raise AssertionError(f"{label}: eligible network consent remains disabled")
    if not network_ready["controls"]["submitNetworkDisabled"]:
        raise AssertionError(f"{label}: network submit unlocked without consent")
    if not network_ready["controls"]["revokeNetworkDisabled"]:
        raise AssertionError(f"{label}: remote revoke enabled before submission")
    consented = page.evaluate(
        """() => {
          window.__OUTILSIA_TEST__.applyBenchmarkCommonsState('network_ready');
          return window.__OUTILSIA_TEST__.setBenchmarkCommonsNetworkConsent(true);
        }"""
    )
    if consented["consentDisabled"] or consented["submitDisabled"]:
        raise AssertionError(f"{label}: network consent does not unlock submit")

    server_submitted = page.evaluate(
        "() => window.__OUTILSIA_TEST__.applyBenchmarkCommonsState('server_submitted')"
    )
    if server_submitted["controls"]["revokeNetworkDisabled"]:
        raise AssertionError(f"{label}: accepted server contribution cannot be revoked")
    if not server_submitted["controls"]["revokeDisabled"]:
        raise AssertionError(f"{label}: local removal can orphan a server contribution")
    if "ne vaut ni preuve terrain" not in server_submitted["ui"]:
        raise AssertionError(f"{label}: server receipt overclaim boundary is missing")
    if "HMAC reste vérifiable côté serveur" not in server_submitted["ui"]:
        raise AssertionError(f"{label}: HMAC verification boundary is missing")
    network_screenshot = OUT / f"benchmark-commons-network-{label}.png"
    section.screenshot(path=str(network_screenshot))

    server_revoked = page.evaluate(
        "() => window.__OUTILSIA_TEST__.applyBenchmarkCommonsState('server_revoked')"
    )
    if not server_revoked["controls"]["revokeNetworkDisabled"]:
        raise AssertionError(f"{label}: revoked server contribution remains actionable")
    if server_revoked["controls"]["revokeDisabled"]:
        raise AssertionError(f"{label}: local removal remains blocked after server revocation")
    if "export local peut maintenant être supprimé" not in server_revoked["ui"]:
        raise AssertionError(f"{label}: post-revocation next action is unclear")

    page.evaluate(
        "() => window.__OUTILSIA_TEST__.applyBenchmarkCommonsState('awaiting_human')"
    )
    section.scroll_into_view_if_needed()
    text = section.inner_text()
    for expected in (
        "Contribution volontaire",
        "Benchmark Commons v1",
        "local par défaut",
        "Aperçu figé, aucun envoi",
        "qwen3:14b",
        "57.5 tok/s",
        "RTX 3090",
        "Ollama 0.12.3",
        "Exclus : prompt, réponse, scan brut",
        "Autoriser 2 min",
        "Exporter le JSON",
        "Retirer l'export",
    ):
        if expected not in text:
            raise AssertionError(f"{label}: missing UI evidence {expected!r}")

    overflow = page.evaluate(
        """() => {
          const section = document.querySelector('.benchmark-commons');
          return {
            viewport: innerWidth,
            body: document.body.scrollWidth,
            doc: document.documentElement.scrollWidth,
            section: section.scrollWidth,
            sectionClient: section.clientWidth
          };
        }"""
    )
    if max(overflow["body"], overflow["doc"]) > overflow["viewport"] + 2:
        raise AssertionError(f"{label}: horizontal page overflow {overflow}")
    if overflow["section"] > overflow["sectionClient"] + 2:
        raise AssertionError(f"{label}: horizontal Commons overflow {overflow}")

    button_overflow = page.evaluate(
        """() => [...document.querySelectorAll('.benchmark-commons button')].map(button => ({
          id: button.id,
          scrollWidth: button.scrollWidth,
          clientWidth: button.clientWidth
        }))"""
    )
    for button in button_overflow:
        if button["scrollWidth"] > button["clientWidth"] + 2:
            raise AssertionError(f"{label}: button text overflow {button}")
    if errors:
        raise AssertionError(f"{label}: page errors {errors}")

    screenshot = OUT / f"benchmark-commons-{label}.png"
    section.screenshot(path=str(screenshot))
    context.close()
    return screenshot


def main() -> None:
    assert_static_contract()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        desktop = verify_viewport(browser, 1440, 1000, "desktop")
        mobile = verify_viewport(browser, 390, 920, "mobile")
        browser.close()
    print(
        "benchmark_commons_ok "
        f"desktop={desktop} mobile={mobile} "
        "network=build_gated consent=local_plus_network "
        "revoke=server_before_local privacy=strict"
    )


if __name__ == "__main__":
    main()
