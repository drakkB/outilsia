#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const contract = JSON.parse(read("forgebench/garden-bamboo-v1/contract.json"));
const source = read("forgebench/garden-bamboo-v1/examples/fable-joint-sentinel-v0.5.garden");
const provenance = JSON.parse(read("forgebench/garden-bamboo-v1/examples/fable-joint-sentinel-v0.5.provenance.json"));
const baselineSource = read("forgebench/garden-bamboo-v1/examples/controle-conservateur-outilsia-v1.garden");
const baselineProvenance = JSON.parse(read("forgebench/garden-bamboo-v1/examples/controle-conservateur-outilsia-v1.provenance.json"));
const rust = [
  read("src-tauri/src/forgebench_garden.rs"),
  read("src-tauri/src/forgebench_garden_vault.rs"),
  read("src-tauri/src/evidence_ledger.rs"),
  read("src-tauri/src/lib.rs")
].join("\n");
const html = read("src/index.html");
const js = read("src/app.js");
const css = read("src/styles.css");
const notice = read("NOTICE-UTILISATION-WORKSTACK.md");
const roadmap = read("ROADMAP.md");
const packageJson = JSON.parse(read("package.json"));
const scannerHub = read("../server-work/static/pages/scanner-ia-local.html");
const downloadPage = read("../server-work/static/pages/telecharger-scanner-ia-local.html");
const llms = read("../server-work/static/llms.txt");

const expectedSensors = [
  "clock.day",
  "calendar.season_progress_pct",
  "weather.rain_7d_mm",
  "soil.water_pct",
  "colony.vitality_pct",
  "rhizome.active_tips_count",
  "rhizome.segment_count",
  "rhizome.max_spread_cm",
  "rhizome.max_depth_cm",
  "rhizome.nearest_barrier_cm",
  "rhizome.barrier_contacts_30d_count",
  "rhizome.outside_active_tips_count",
  "rhizome.detected_outside_tips_count",
  "barrier.min_depth_cm",
  "barrier.exposed_lip_cm",
  "barrier.joint_integrity_pct",
  "cane.shoots_count",
  "cane.living_count",
  "cane.mature_count",
  "history.days_since_monitoring_day",
  "history.days_since_cut_day",
  "resource.water_left_mm",
  "resource.labor_left_min",
  "resource.patch_left_count"
];
const expectedRanking = [
  "all_scenarios_rankable_desc",
  "escaped_active_tips_sum_asc",
  "days_uncontained_sum_asc",
  "containment_permille_mean_desc",
  "minimum_vitality_permille_worst_desc",
  "living_canes_mean_desc",
  "final_vitality_permille_mean_desc",
  "labor_used_min_sum_asc",
  "water_used_mm_sum_asc"
];

assert.equal(contract.schema, "outilsia.forgebench_garden_contract.v1");
assert.equal(contract.id, "garden-bamboo-generalization-v1");
assert.equal(contract.status, "exploratory_candidate");
assert.equal(contract.language.name, "GardenScript");
assert.equal(contract.language.version, "0.5");
assert.equal(contract.language.ruleset, "bamboo.v1");
assert.deepEqual(contract.channels.order, ["monitoring", "containment", "barrier", "canopy", "irrigation"]);
assert.deepEqual(contract.sensors.map((sensor) => sensor.id), expectedSensors);
assert.equal(new Set(contract.sensors.map((sensor) => sensor.id)).size, 24);
assert.equal(contract.public_scenario.horizon_days, 365);
assert.deepEqual(contract.public_scenario.budgets, {
  water_total_mm: 600,
  labor_total_min: 2500,
  patch_total_count: 6
});
assert.equal(contract.public_scenario.actions.irrigation_positive.labor_min, 2);
assert.equal(contract.public_scenario.actions.irrigation_positive.water_cost_equals_accepted_mm, true);
assert.equal(contract.hidden_generalization.official_gardenarena_ranking, false);
assert.equal(contract.hidden_generalization.candidate_sources_frozen_before_suite_read, true);
assert.equal(contract.hidden_generalization.same_scenarios_for_all_candidates, true);
assert.equal(contract.hidden_generalization.contents_returned, false);
assert.equal(contract.hidden_generalization.minimum_scenarios, 3);
assert.equal(contract.hidden_generalization.maximum_scenarios, 12);
assert.equal(contract.ranking.method, "lexicographic_aggregate_v1");
assert.equal(contract.ranking.composite_score, false);
assert.equal(contract.ranking.official_gardenarena_ranking, false);
assert.deepEqual(contract.ranking.strategy_order, expectedRanking);
assert.equal(contract.ranking.generation_speed_and_cost_change_strategy_order, false);
assert.equal(contract.ranking.winner_before_comparable_runs_and_human_review, false);
assert.equal(contract.truth.scientific_measurement, false);
assert.equal(contract.truth.real_world_prescription, false);

assert.match(source, /^garden "Fable Joint Sentinel" version 0\.5\n/);
assert.match(source, /\ndomain bamboo\nruleset: bamboo\.v1\n/);
assert.match(source, /barrier\.joint_integrity_pct <= 64%/);
assert.match(source, /soil\.water_pct < 34%/);
assert.equal(source.includes("\r"), false);
assert.equal(source.includes("\n\n"), false);
assert.equal(provenance.authoring_mode, "open_book_iterative");
assert.equal(provenance.blind_one_shot, false);
assert.equal(provenance.simulator_used_during_authoring, true);
assert.equal(provenance.thresholds_tuned_after_visible_runs, true);
assert.equal(provenance.winner_claimed, false);
assert.match(baselineSource, /^garden "Controle conservateur OutilsIA" version 0\.5\n/);
assert.match(baselineSource, /history\.days_since_monitoring_day >= 7day/);
assert.match(baselineSource, /barrier\.joint_integrity_pct <= 60%/);
assert.equal(baselineSource.includes("\r"), false);
assert.equal(baselineProvenance.authoring_mode, "human_authored");
assert.equal(baselineProvenance.simulator_used_during_authoring, false);
assert.equal(baselineProvenance.thresholds_tuned_after_visible_runs, false);
assert.equal(baselineProvenance.eligible_for_blind_claim, false);
assert.equal(baselineProvenance.winner_claimed, false);

for (const marker of [
  "evaluate_forgebench_garden",
  "get_forgebench_garden_example",
  "get_forgebench_garden_baseline",
  "seal_forgebench_garden_hidden_suite",
  "get_forgebench_garden_hidden_suite_status",
  "clear_forgebench_garden_hidden_suite",
  "hidden_suite_loaded_after_candidate_freeze",
  '"candidate_code_executed": false',
  '"same_scenarios_for_all_candidates": true',
  '"winner_declared": false',
  "forgebench_garden_batch_verified"
]) {
  assert.ok(rust.includes(marker), `missing Rust marker: ${marker}`);
}
assert.equal(rust.includes('"winner_declared": true'), false);

for (const marker of [
  "forgeBenchGardenDetails",
  "forgeBenchGardenCandidateId",
  "forgeBenchGardenSource",
  "loadForgeBenchGardenBaselineBtn",
  "runForgeBenchGardenBtn",
  "sendForgeBenchGardenToLedgerBtn",
  "forgebench_garden_batch_verified",
  "Aucun vainqueur automatique"
]) {
  assert.ok(html.includes(marker), `missing HTML marker: ${marker}`);
}
for (const marker of [
  "FORGEBENCH_GARDEN_REQUEST_SCHEMA",
  "forgeBenchGardenVerifiedResult",
  "get_forgebench_garden_baseline",
  "hidden_suite_loaded_after_candidate_freeze",
  "raw_candidate_sources_persisted",
  "winner_declared",
  "demoForgeBenchGardenDocuments"
]) {
  assert.ok(js.includes(marker), `missing JS marker: ${marker}`);
}
assert.ok(css.includes(".forgebench-garden-details"));
assert.ok(css.includes(".forgebench-garden-result-row"));
assert.ok(notice.includes("Garden/Bamboo v1"));
assert.ok(notice.includes("deterministic_dsl_public_and_hidden_batch"));
assert.ok(notice.includes("contrôle humain OutilsIA"));
assert.ok(roadmap.includes("garden-bamboo-generalization-v1"));
assert.ok(roadmap.includes("aucun vainqueur"));
assert.ok(roadmap.includes("contrôle humain OutilsIA"));
assert.ok(packageJson.scripts["verify:forgebench:garden"].includes("test:forgebench:garden:ranking"));
assert.ok(packageJson.scripts["verify:ci-source"].includes("verify:forgebench:garden"));

for (const [name, document, markers] of [
  ["scanner hub", scannerHub, ["Garden/Bamboo v1", "1 à 8 politiques GardenScript", "contrôle humain OutilsIA", "ni une fonction du build public actuel"]],
  ["download page", downloadPage, ["Garden/Bamboo v1 dans le candidat source", "contrôle humain OutilsIA", "Aucun code candidat arbitraire", "existe seulement dans un candidat source postérieur au build public"]],
  ["llms.txt", llms, ["ForgeBench Garden/Bamboo v1 (source candidate, not in the current public build)", "OutilsIA human control", "candidate code is never executed", "no winner is declared"]]
]) {
  for (const marker of markers) {
    assert.ok(document.includes(marker), `${name} missing marker: ${marker}`);
  }
}

console.log("forgebench_garden_contract_ok sensors=24 hidden=3..12 winner=false seo=hub-download-llms");
