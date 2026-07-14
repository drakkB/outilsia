#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const repoRoot = resolve(root, "..");
const benchmarkPath = resolve(root, "forgebench", "signal-maze-v1.json");
const manifestPath = resolve(root, "forgebench", "signal-maze-v1", "starter-manifest.json");
const visibleContractPath = resolve(root, "forgebench", "signal-maze-v1", "visible-contract.json");
const referenceManifestPath = resolve(root, "forgebench", "signal-maze-v1", "reference-manifest.json");
const benchmark = JSON.parse(readFileSync(benchmarkPath, "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const visibleContract = JSON.parse(readFileSync(visibleContractPath, "utf8"));
const referenceManifest = JSON.parse(readFileSync(referenceManifestPath, "utf8"));
const hub = readFileSync(resolve(repoRoot, "server-work", "static", "pages", "scanner-ia-local.html"), "utf8");
const download = readFileSync(resolve(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html"), "utf8");
const llms = readFileSync(resolve(repoRoot, "server-work", "static", "llms.txt"), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalTextBytes = (value) => Buffer.from(
  Buffer.from(value).toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
  "utf8",
);

if (benchmark.schema !== "outilsia.forgebench_benchmark.v1" || benchmark.id !== "signal-maze-v1") {
  throw new Error("forgebench benchmark contract mismatch");
}
if (benchmark.status !== "exploratory_protocol" || benchmark.starter?.status !== "sealed") {
  throw new Error("Signal Maze starter must be sealed for exploratory preflight");
}
if (benchmark.hidden_suite?.status !== "not_provisioned" || benchmark.hidden_suite?.contents_embedded !== false || benchmark.hidden_suite?.digest !== null) {
  throw new Error("hidden suite must remain explicitly absent from the public repository");
}
if (!Array.isArray(benchmark.determinism?.default_seeds) || benchmark.determinism.default_seeds.length < 3) {
  throw new Error("scientific claims require at least three declared seeds");
}
const expectedWeights = { result: 50, efficiency: 20, speed: 15, cost: 15 };
if (JSON.stringify(benchmark.score_policy?.weights_percent) !== JSON.stringify(expectedWeights)) {
  throw new Error("ForgeBench score weights changed without an explicit contract update");
}
if (benchmark.score_policy?.unknown_cost_is_zero !== false || benchmark.score_policy?.winner_before_complete_runs !== false) {
  throw new Error("ForgeBench must not turn unknown cost into zero or declare an early winner");
}
for (const permission of ["benchmark_contract_write", "visible_tests_write", "hidden_tests_read", "publish", "merge"]) {
  if (benchmark.permissions?.[permission] !== false) throw new Error(`unsafe ForgeBench permission: ${permission}`);
}

if (manifest.schema !== "outilsia.forgebench_starter_manifest.v1" || manifest.benchmark_id !== benchmark.id) {
  throw new Error("starter manifest mismatch");
}
if (manifest.text_canonicalization !== "newline-lf-v1") {
  throw new Error("starter manifest must declare canonical LF text hashing");
}
const lines = [];
for (const file of [...manifest.files].sort((left, right) => left.path.localeCompare(right.path))) {
  if (!/^starter\/[a-z0-9._/-]+$/.test(file.path) || file.path.includes("..")) {
    throw new Error(`unsafe starter path: ${file.path}`);
  }
  const bytes = canonicalTextBytes(readFileSync(resolve(root, "forgebench", "signal-maze-v1", file.path)));
  const digest = sha256(bytes);
  if (digest !== file.sha256) throw new Error(`starter digest mismatch: ${file.path}`);
  lines.push(`${file.path}:${digest}`);
}
const bundleDigest = sha256(`${lines.join("\n")}\n`);
if (bundleDigest !== manifest.bundle_sha256 || bundleDigest !== benchmark.starter.bundle_sha256) {
  throw new Error("starter bundle digest mismatch");
}

if (
  visibleContract.schema !== "outilsia.forgebench_visible_gameplay_contract.v1"
  || visibleContract.benchmark_id !== benchmark.id
  || visibleContract.status !== "public_visible_contract"
  || visibleContract.contract_version !== benchmark.visible_gameplay_contract?.version
) {
  throw new Error("visible gameplay contract mismatch");
}
if (
  visibleContract.security?.candidate_execution_enabled_by_this_contract !== false
  || visibleContract.claims?.ollama_candidate_visible_execution_available_in_source !== true
  || visibleContract.claims?.ollama_candidate_gameplay_may_be_verified_per_signed_run !== true
  || visibleContract.claims?.candidate_execution_requires_explicit_run_consent !== true
  || visibleContract.claims?.public_recipe_is_scientific_score !== false
  || visibleContract.claims?.scientific_score_available !== false
  || visibleContract.claims?.winner_available !== false
) {
  throw new Error("visible gameplay contract overclaims candidate execution or science");
}
if (JSON.stringify(visibleContract.visible_recipe?.default_seeds) !== JSON.stringify(benchmark.determinism.default_seeds)) {
  throw new Error("visible gameplay recipe and benchmark seeds differ");
}
if (
  referenceManifest.schema !== "outilsia.forgebench_visible_reference_manifest.v1"
  || referenceManifest.benchmark_id !== benchmark.id
  || referenceManifest.contract_version !== visibleContract.contract_version
  || referenceManifest.text_canonicalization !== "newline-lf-v1"
) {
  throw new Error("visible reference manifest mismatch");
}
const referenceLines = [];
for (const file of [...referenceManifest.files].sort((left, right) => left.path.localeCompare(right.path))) {
  if (!/^(reference\/(game\.js|index\.html|styles\.css)|visible-contract\.json)$/.test(file.path)) {
    throw new Error(`unsafe visible reference path: ${file.path}`);
  }
  const bytes = canonicalTextBytes(readFileSync(resolve(root, "forgebench", "signal-maze-v1", file.path)));
  const digest = sha256(bytes);
  if (digest !== file.sha256) throw new Error(`visible reference digest mismatch: ${file.path}`);
  referenceLines.push(`${file.path}:${digest}`);
}
const referenceDigest = sha256(`${referenceLines.join("\n")}\n`);
if (
  referenceDigest !== referenceManifest.bundle_sha256
  || referenceDigest !== benchmark.visible_gameplay_contract?.reference_bundle_sha256
  || benchmark.visible_gameplay_contract?.candidate_execution_enabled !== true
  || benchmark.visible_gameplay_contract?.candidate_gameplay_verified !== false
) {
  throw new Error("visible reference bundle or candidate truth mismatch");
}
const referenceSource = referenceManifest.files
  .filter((file) => file.path.startsWith("reference/"))
  .map((file) => readFileSync(resolve(root, "forgebench", "signal-maze-v1", file.path), "utf8"))
  .join("\n");
for (const marker of [
  "__SIGNAL_MAZE_VISIBLE_API__",
  "signal-maze-visible-snapshot.v1",
  'id="signalMazeBoard"',
  'id="gameStatus"',
  "pointerdown",
  "ArrowUp",
  "touch-action: none",
]) {
  if (!referenceSource.includes(marker)) throw new Error(`visible reference marker missing: ${marker}`);
}

const rust = ["forgebench.rs", "forgebench_vault.rs", "forgebench_sandbox.rs", "forgebench_isolation.rs", "forgebench_runner.rs", "forgebench_browser.rs", "forgebench_hidden.rs", "forgebench_candidate.rs", "workstack_arena.rs", "workstack_review.rs", "evidence_ledger.rs"]
  .map((name) => readFileSync(resolve(root, "src-tauri", "src", name), "utf8"))
  .join("\n");
const js = readFileSync(resolve(root, "src", "app.js"), "utf8");
for (const needle of [
  '"execution_started": false',
  '"agents_started": false',
  '"worktrees_created": false',
  '"scores_computed": false',
  '"winner_declared": false',
  '"api_spend_eur": 0',
  "hidden_suite_not_provisioned",
  "same_protocol_digest_for_every_stack",
  '"hidden_seeds_returned": false',
  '"worker_access_blocked": false',
  '"encrypted_at_rest": false',
  "forgebench-hidden-suite-v1.json",
  '"fresh_workspace_per_run": true',
  '"workspace_outside_source_repository": true',
  '"starter_digest_verified": true',
  '"hidden_suite_material_copied": false',
  '"process_isolation_enforced": false',
  '"network_isolation_enforced": false',
  '"hidden_suite_access_blocked": false',
  '"worker_execution_ready": false',
  "forgebench-worker-sandboxes-v1",
  "outilsia.forgebench_isolation_probe_result.v1",
  "BWRAP_CANARY_SCRIPT",
  '"worker_command_executed": false',
  "outilsia.forgebench_reference_pilot_result.v1",
  "deterministic_reference_fixture",
  "deterministic_visible_gate",
  '"workspace_read_only": true',
  '"candidate_worker_execution_ready": false',
  '"hidden_suite_used": false',
  "isolated_reference_run",
  "outilsia.forgebench_ollama_candidate_result.v3",
  "ollama_local_hidden_browser_v3",
  "candidate_runtime_supported",
  "http://127.0.0.1:11434/api/chat",
  ".no_proxy()",
  '"--noproxy"',
  ".chunk()",
  '"raw_model_output_returned": false',
  '"generated_code_executed": true',
  "deterministic_visible_static_gate",
  "chromium_visible_gameplay_gate",
  "trusted_public_contract_controller_v1",
  "isolated_visible_and_hidden_holdout_candidate",
  "chromium_hidden_holdout_gate_v1",
  "trusted_local_holdout_controller_v1",
  '"worker_generation_completed_before_suite_read": true',
  '"vault_file_mounted": false',
  '"runtime_seed_inputs_injected": true',
  '"check_families_public_in_source": true',
  '"same_user_process_isolation_enforced": false',
  '"observations_returned": false',
  '"screenshots_returned": false',
  '"private_check_ids_returned": false',
  '"hidden_evaluator_verified": true',
  "hidden_check_families_public_in_source",
  "same_user_vault_isolation_not_enforced",
  "outilsia.forgebench_visible_gameplay_contract.v1",
  "__SIGNAL_MAZE_VISIBLE_API__",
  "signal-maze-visible-snapshot.v1",
  "outilsia.workstack_human_review_result.v1",
  "signed_public_receipt_only",
  '"delivery_authorized": false',
  '"winner_authorized": false',
]) {
  if (!rust.includes(needle)) throw new Error(`missing Rust ForgeBench guard: ${needle}`);
}
for (const needle of [
  "Aucun agent lancé",
  "aucun score calculé",
  "aucun vainqueur déclaré",
  "coût inconnu ≠ zéro",
  "Aucun chemin exposé",
  "aucun worker lancé",
  "processus, réseau et accès au vault non isolés",
  "canari isolé vérifié",
  "pilote technique séparé disponible",
  "Worker de référence réussi · évaluateur indépendant 6/6",
  "Aucun Codex, Claude, Hermes ou modèle local exécuté",
  "holdout vérifié",
  "visible 39/39 · holdout 5/5",
  "seeds absents du prompt",
  "Accepté pour comparaison",
  "aucune capture ou code conservé",
  "workstack_human_review_recorded",
]) {
  if (!js.includes(needle)) throw new Error(`missing UI truth label: ${needle}`);
}
for (const [label, text, needles] of [
  ["hub", hub, ["forgebench-workspaces-stacks-ia", "ForgeBench + Workstack Arena · source, non public", "modèle Ollama déjà installé", "Codex CLI une fois", "Contrôle statique 7/7", "Gameplay visible 39/39", "Holdout local 5/5", "cinq seeds absents du prompt", "aucune observation privée", "familles de checks du holdout restant publiques", "Décision humaine signée", "Claude Code, Hermes et les projets arbitraires restent indisponibles", "build public actuel", "ForgeBench peut-il déjà tester un modèle Ollama local ou lancer Codex, Claude Code et Hermes ?"]],
  ["download", download, ["forgebench-workspaces-stacks-ia", "ForgeBench + Workstack Arena · source, non public", "boucle locale Ollama", "Codex CLI une fois", "Contrôle statique 7/7", "Gameplay visible 39/39", "Holdout local 5/5", "cinq seeds absents du prompt", "aucune observation privée", "Revue humaine bornée", "familles de checks du holdout restant publiques", "absente du téléchargement disponible aujourd'hui", "Claude Code, Hermes et les projets arbitraires restent indisponibles", "ForgeBench peut-il déjà tester un modèle Ollama local ou lancer Codex, Claude Code et Hermes ?"]],
  ["llms", llms, ["ForgeBench Ollama Holdout v1 (source candidate, not in the current public build)", "Visible Gameplay Contract v1", "three bounded files are frozen before any vault read", "desktop plus Android portrait/landscape", "39 public checks", "five sealed seeds as runtime inputs", "five holdout families", "vault file is never mounted", "observations, DOM and screenshots are not returned", "check families are public in source", "peer candidates and local energy are missing", "no score or winner is declared", "Workstack Arena Codex pilot v0 (source candidate, not in the current public build)", "512 KiB", "does not transmit or mount a user repository", "One signed local human review", "never claims visual or code inspection", "cannot authorize delivery, winner selection, board writes, merge or publication", "Arbitrary project execution, Claude Code, Hermes and private holdout for Codex remain unavailable"]],
]) {
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`missing ForgeBench SEO/GEO truth on ${label}: ${needle}`);
  }
}

console.log(`forgebench_contract_ok benchmark=${benchmark.id} seeds=${benchmark.determinism.default_seeds.length} starter=${bundleDigest} visible-contract=${visibleContract.contract_version} reference=${referenceDigest} hidden=local-vault-plus-runtime-holdout isolation=reference-plus-static-plus-visible-browser-plus-hidden-browser candidate=ollama-hidden-holdout codex=public-pilot-only human-review=receipt-only generated-code=true gameplay-visible=true visible-checks=39 private-families=5 science=false winner=false seo=hub-download-llms`);
