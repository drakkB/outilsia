#!/usr/bin/env node
// Tests négatifs + positifs de la preuve terrain (cohérence rapport /r/).
// Hors-ligne et déterministe : utilise une fixture HTML de rapport, aucune
// requête réseau. Couvre les scénarios de la mission "preuve terrain réelle".
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coherenceOfReport, verifyShareReport, reportHeadline } from "./verify-share-report.mjs";
import { validateSingleFieldEntry } from "./validate-single-field-entry.mjs";
import { validateFieldEntriesWithReports } from "./validate-field-entries.mjs";

// Fixture : rapport public d'une RTX 4080 SUPER (identité dans la meta description,
// titre générique — comme le vrai template serveur), avec un tok/s exposé.
const REPORT_4080 = `<!doctype html><html><head>
<title>Ce PC peut faire tourner 30 modèles IA locaux | OutilsIA</title>
<meta name="description" content="Rapport OutilsIA Local Cockpit pour NVIDIA GeForce RTX 4080 SUPER : GPU, RAM, VRAM, modèle recommandé, benchmark.">
<script type="application/ld+json">{"@type":"TechArticle","headline":"Ce PC peut faire tourner 30 modèles IA locaux"}</script>
</head><body><h1>Ce PC peut faire tourner 30 modèles IA locaux</h1>
<p>Benchmark hermes3:8b : 120 tok/s.</p></body></html>`;

function baseEntry(overrides = {}) {
  return {
    profile: "rtx_4080_4090",
    machine_label: "RTX 4080",
    tested_at: "2026-07-05T10:00:00Z",
    os: "Windows 11",
    cpu: "Ryzen 9",
    gpu: "NVIDIA RTX 4080",
    vram_gb: 16,
    ram_gb: 64,
    scan_ok: true,
    score: 88,
    score_label: "Excellent",
    recommended_model: "hermes3:8b",
    first_action: "Lancer le benchmark",
    upgrade_recommendation: "RAM",
    benchmark_model: "hermes3:8b",
    benchmark_tokens_per_second: 120,
    benchmark_elapsed_ms: 1500,
    promptforge_ok: true,
    dialogue_ok: true,
    arena_ok: true,
    report_ok: true,
    build_id: "20260704180932",
    app_version: "0.1.1-beta",
    share_url: "https://outilsia.fr/r/c9UaPaUTfcLTzpJyWLNLlkJBkhi6acu_",
    ...overrides,
  };
}

// 1. Cohérence : bon profil ↔ bon rapport
{
  const r = coherenceOfReport(baseEntry(), REPORT_4080);
  assert.equal(r.coherent, true, "rtx_4080_4090 doit être cohérent avec un rapport 4080");
}

// 2. Fraude inter-profils : old_laptop pointant vers le rapport 4080
{
  const r = coherenceOfReport(baseEntry({ profile: "old_laptop", benchmark_tokens_per_second: 40 }), REPORT_4080);
  assert.equal(r.coherent, false, "old_laptop → rapport 4080 doit être incohérent");
  assert.match(r.mismatches.join(" "), /gpu_profile/, "raison = gpu_profile");
}

// 3. Fraude inter-profils : rtx_3060 pointant vers le rapport 4080 (require 3060 absent)
{
  const r = coherenceOfReport(baseEntry({ profile: "rtx_3060_12gb" }), REPORT_4080);
  assert.equal(r.coherent, false, "rtx_3060 → rapport 4080 doit être incohérent");
}

// 4. Incohérence tok/s : le rapport expose 120 mais la fiche prétend 400
{
  const r = coherenceOfReport(baseEntry({ benchmark_tokens_per_second: 400 }), REPORT_4080);
  assert.equal(r.coherent, false, "tok/s fiche 400 vs rapport 120 doit être incohérent");
}

// 5. share_url inventé : format invalide → invalid_format (sans réseau)
{
  const r = await verifyShareReport(baseEntry({ share_url: "https://exemple.com/r/pasbon" }));
  assert.equal(r.status, "invalid_format", "share_url hors outilsia.fr/r/ doit être invalid_format");
  assert.equal(r.coherent, false);
}

// 6. Plausibilité : elapsed_ms=1 refusé par la validation de fiche
{
  assert.throws(
    () => validateSingleFieldEntry(baseEntry({ benchmark_elapsed_ms: 1 })),
    /elapsed_ms is implausible|< 200/,
    "elapsed_ms=1 doit être refusé",
  );
}

// 7. Plausibilité : old_laptop à 300 tok/s (au-dessus du plafond) refusé
{
  const laptop = baseEntry({
    profile: "old_laptop", gpu: "Intel UHD mobile", cpu: "Core i5 laptop",
    vram_gb: 2, ram_gb: 16, benchmark_tokens_per_second: 300, recommended_model: "qwen3:0.6b", benchmark_model: "qwen3:0.6b",
  });
  assert.throws(() => validateSingleFieldEntry(laptop), /implausible|cap/, "old_laptop 300 tok/s doit être refusé");
}

// 8. 5 fiches fabriquées propres SANS vrais rapports → offline = network_unverified,
//    jamais FIELD_ENTRIES_VALID.
{
  const dir = mkdtempSync(join(tmpdir(), "outilsia-coherence-"));
  try {
    const profiles = [
      { profile: "old_laptop", gpu: "Intel UHD", cpu: "Core i5 laptop", vram_gb: 2, ram_gb: 16, tps: 9, model: "qwen3:0.6b" },
      { profile: "core_i7_gtx_1080_ti", gpu: "NVIDIA GTX 1080 Ti", cpu: "Core i7", vram_gb: 11, ram_gb: 32, tps: 33, model: "qwen3:8b" },
      { profile: "rtx_3060_12gb", gpu: "NVIDIA RTX 3060", cpu: "Ryzen 5", vram_gb: 12, ram_gb: 32, tps: 55, model: "hermes3:8b" },
      { profile: "rtx_4080_4090", gpu: "NVIDIA RTX 4080", cpu: "Ryzen 9", vram_gb: 16, ram_gb: 64, tps: 140, model: "hermes3:8b" },
      { profile: "cpu_only", gpu: "GPU non déterminé", cpu: "Xeon", vram_gb: null, ram_gb: 64, tps: 6, model: "qwen3:0.6b" },
    ];
    profiles.forEach((p, i) => {
      const entry = baseEntry({
        profile: p.profile, gpu: p.gpu, cpu: p.cpu, vram_gb: p.vram_gb, ram_gb: p.ram_gb,
        benchmark_tokens_per_second: p.tps, recommended_model: p.model, benchmark_model: p.model,
        share_url: `https://outilsia.fr/r/FAKEtoken${String(i).padStart(2, "0")}AAAAAAAAAAAAAAAA`,
        ...(p.profile === "cpu_only" ? {
          profile_source: "manual",
          benchmark_runtime_processor: "cpu",
          benchmark_gpu_offload_percent: 0,
          benchmark_runtime_evidence_source: "ollama_api_ps",
          first_30s: {
            hardware_visible: false,
            score_visible: true,
            recommended_model_visible: true,
            benchmark_cta_or_proof_visible: true,
            upgrade_visible: true,
            summary: "GPU à confirmer ; exécution CPU prouvée par Ollama",
          },
        } : {}),
      });
      writeFileSync(join(dir, `outilsia-field-test-${p.profile}.json`), JSON.stringify({ schema: "outilsia.local_cockpit_field_tests.v1", machines: [entry] }));
    });
    const report = await validateFieldEntriesWithReports({ dir, out: join(dir, "validation.json"), failOnIncomplete: false, offline: true });
    assert.notEqual(report.status, "FIELD_ENTRIES_VALID", "5 fiches sans rapport réel ne doivent JAMAIS être VALID (offline)");
    assert.equal(report.profiles_network_unverified.length, 5, "offline: les 5 profils doivent être network_unverified");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 9. reportHeadline extrait bien l'identité GPU même quand le titre est générique
{
  assert.match(reportHeadline(REPORT_4080), /4080/, "l'identité doit contenir le GPU de la meta description");
}

console.log("field_report_coherence_ok");
