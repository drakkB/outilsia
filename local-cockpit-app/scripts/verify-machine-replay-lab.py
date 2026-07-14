#!/usr/bin/env python3
import html
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "src" / "index.html"
MATRIX_PATH = ROOT / "scripts" / "fixtures" / "machine-replay-matrix.json"
OUT = ROOT / ".artifacts" / "machine-replay"
REPORT_JSON = OUT / "machine-replay-report.json"
REPORT_HTML = OUT / "machine-replay-report.html"
REPORT_PNG = OUT / "machine-replay-report.png"


def system_browser():
    requested = os.environ.get("OUTILSIA_CHROMIUM_EXECUTABLE", "").strip()
    candidates = [
        requested,
        "/opt/google/chrome/chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/lib/chromium/chromium",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return ""


def assert_equal(actual, expected, message):
    if actual != expected:
        raise AssertionError(f"{message}: expected={expected!r} actual={actual!r}")


def validate_snapshot(scenario, snapshot):
    expected = scenario["expect"]
    key = scenario["key"]
    assert_equal(snapshot["schema"], "outilsia.machine_replay_snapshot.v1", f"{key} schema")
    assert_equal(snapshot["scenario_key"], key, f"{key} scenario binding")
    assert_equal(snapshot["field"]["inferred_profile"], expected["field_profile"], f"{key} field profile")
    assert_equal(snapshot["field"]["effective_profile"], expected["field_profile"], f"{key} effective field profile")
    assert_equal(snapshot["field"]["profile_valid"], expected["field_valid"], f"{key} profile validity")
    assert expected["machine_class_contains"] in snapshot["field"]["machine_class"], snapshot["field"]
    assert_equal(snapshot["runtime"]["vendor"], expected["runtime_vendor"], f"{key} runtime vendor")
    assert_equal(snapshot["runtime"]["family"], expected["runtime_family"], f"{key} runtime family")
    assert_equal(snapshot["runtime"]["backend"], expected["runtime_backend"], f"{key} runtime backend")
    assert_equal(snapshot["runtime"]["memory_model"], expected["memory_model"], f"{key} memory model")
    assert_equal(snapshot["machine"]["effective_model_memory_gb"], expected["effective_memory_gb"], f"{key} effective memory")
    assert snapshot["recommendation"]["ref"] in expected["recommended_one_of"], snapshot["recommendation"]
    assert_equal(snapshot["recommendation"]["starter_proof_required"], expected["starter_required"], f"{key} starter gate")
    assert_equal(snapshot["decision"]["score"], expected["score"], f"{key} compatibility score")
    assert expected["gpu_contains"] in snapshot["machine"]["gpu"], snapshot["machine"]
    assert expected["gpu_contains"] in snapshot["ui"]["gpu"], snapshot["ui"]
    assert expected["vram_contains"] in snapshot["machine"]["vram_display"], snapshot["machine"]
    assert expected["vram_contains"] in snapshot["ui"]["vram"], snapshot["ui"]
    assert snapshot["field"]["export_ready"] is False, f"{key} synthetic replay must not become physical proof"
    assert snapshot["truth"]["unknown_gpu_not_cpu_only"] is True, snapshot["truth"]
    assert snapshot["truth"]["shared_memory_not_claimed_as_dedicated_vram"] is True, snapshot["truth"]
    assert snapshot["truth"]["raw_prompts_included"] is False, snapshot["truth"]
    assert snapshot["truth"]["personal_files_read"] is False, snapshot["truth"]
    assert snapshot["truth"]["physical_proof"] is False, snapshot["truth"]
    assert snapshot["runtime"]["automatic_driver_install_supported"] is False, snapshot["runtime"]

    effective_memory = float(snapshot["machine"]["effective_model_memory_gb"] or 0)
    if effective_memory > 0:
        for candidate in snapshot["recommendation"]["candidates"]:
            required = float(candidate["resources"].get("vram_required_q4_gb") or 0)
            if required > effective_memory:
                raise AssertionError(
                    f"{key} exposes candidate {candidate['ref']} requiring {required} GB with {effective_memory} GB effective"
                )


def report_document(matrix, results):
    rows = []
    for item in results:
        snapshot = item["snapshot"]
        rows.append(
            "<tr>"
            f"<td><strong>{html.escape(item['label'])}</strong><small>{html.escape(item['key'])}</small></td>"
            f"<td>{html.escape(snapshot['machine']['gpu'])}<small>{html.escape(snapshot['machine']['vram_display'])} · {snapshot['machine']['ram_gb']} Go RAM</small></td>"
            f"<td>{html.escape(snapshot['runtime']['backend'].upper())}<small>{html.escape(snapshot['runtime']['family'] or snapshot['runtime']['vendor'])}</small></td>"
            f"<td>{html.escape(snapshot['recommendation']['ref'])}<small>{'preuve légère requise' if snapshot['recommendation']['starter_proof_required'] else 'sélection matérielle'}</small></td>"
            f"<td>{html.escape(snapshot['field']['inferred_profile'])}<small>{html.escape(snapshot['field']['machine_class'])}</small></td>"
            f"<td><span class='ok'>CONFORME</span><small>score {snapshot['decision']['score']}/100</small></td>"
            "</tr>"
        )
    return f"""<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OutilsIA Machine Replay Lab</title>
  <style>
    :root {{ color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; background:#091116; color:#eef5f7; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; background:#091116; }}
    main {{ width:min(1500px, 96vw); margin:24px auto 48px; }}
    header {{ border:1px solid #28414a; border-top:4px solid #62d8e8; padding:22px; background:#0d1a20; }}
    h1 {{ margin:0 0 8px; font-size:30px; letter-spacing:0; }}
    p {{ margin:0; color:#a8bbc2; }}
    .stats {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin:14px 0; }}
    .stats div {{ border:1px solid #28414a; padding:14px; background:#0d1a20; }}
    .stats strong {{ display:block; color:#70efaa; font-size:24px; }}
    table {{ width:100%; border-collapse:collapse; background:#0d1a20; border:1px solid #28414a; }}
    th,td {{ padding:12px; border-bottom:1px solid #21343b; text-align:left; vertical-align:top; }}
    th {{ color:#77ddeb; font-size:12px; text-transform:uppercase; }}
    td {{ font-size:13px; }}
    small {{ display:block; margin-top:5px; color:#8fa6af; }}
    .ok {{ color:#70efaa; font-weight:800; }}
    footer {{ margin-top:14px; color:#8fa6af; font-size:12px; }}
    @media(max-width:800px) {{ .stats {{ grid-template-columns:1fr; }} table {{ display:block; overflow:auto; }} }}
  </style>
</head>
<body><main>
  <header><h1>Machine Replay Lab</h1><p>Matrice synthétique déterministe. Elle détecte les régressions, mais ne remplace jamais une preuve terrain physique.</p></header>
  <section class="stats">
    <div><strong>{len(results)}/{len(matrix['scenarios'])}</strong><span>scénarios conformes</span></div>
    <div><strong>{html.escape(matrix['version'])}</strong><span>version de matrice</span></div>
    <div><strong>0</strong><span>preuve physique revendiquée</span></div>
  </section>
  <table><thead><tr><th>Machine</th><th>Matériel</th><th>Runtime</th><th>Modèle</th><th>Terrain</th><th>Verdict</th></tr></thead>
  <tbody>{''.join(rows)}</tbody></table>
  <footer>Les scans sont des fixtures sans fichiers personnels, prompts bruts, télémétrie ou credentials.</footer>
</main></body></html>"""


def main():
    matrix = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    with sync_playwright() as playwright:
        executable = system_browser()
        launch_options = {"headless": True}
        if executable:
            launch_options["executable_path"] = executable
        browser = playwright.chromium.launch(**launch_options)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.goto(HTML.as_uri(), wait_until="load")
        for scenario in matrix["scenarios"]:
            page.evaluate("() => window.localStorage.clear()")
            page.reload(wait_until="load")
            payload = {**scenario, "catalog": matrix["catalog"]}
            snapshot = page.evaluate(
                "input => window.__OUTILSIA_TEST__.applyMachineReplayScenario(input)",
                payload,
            )
            validate_snapshot(scenario, snapshot)
            results.append({"key": scenario["key"], "label": scenario["label"], "snapshot": snapshot})

        report = {
            "schema": "outilsia.machine_replay_report.v1",
            "matrix_schema": matrix["schema"],
            "matrix_version": matrix["version"],
            "physical_proof": False,
            "scenario_count": len(results),
            "results": results,
        }
        REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        REPORT_HTML.write_text(report_document(matrix, results), encoding="utf-8")
        report_page = browser.new_page(viewport={"width": 1440, "height": 900})
        report_page.goto(REPORT_HTML.as_uri(), wait_until="load")
        report_page.screenshot(path=str(REPORT_PNG), full_page=True)
        browser.close()

    print(
        "machine_replay_lab_ok "
        f"matrix={matrix['version']} scenarios={len(results)} "
        "profiles=old-laptop,1080ti,3060,4080,3090,cpu,strix,unknown,arc,7900xtx "
        f"report={REPORT_JSON}"
    )


if __name__ == "__main__":
    main()
