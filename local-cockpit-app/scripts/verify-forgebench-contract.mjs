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
  || visibleContract.claims?.ollama_candidate_generated_code_executed !== false
  || visibleContract.claims?.ollama_candidate_gameplay_verified !== false
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
  || benchmark.visible_gameplay_contract?.candidate_execution_enabled !== false
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

const rust = ["forgebench.rs", "forgebench_vault.rs", "forgebench_sandbox.rs", "forgebench_isolation.rs", "forgebench_runner.rs", "forgebench_candidate.rs", "evidence_ledger.rs"]
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
  "outilsia.forgebench_ollama_candidate_result.v1",
  "ollama_local_prompt_only_v1",
  "candidate_runtime_supported",
  "http://127.0.0.1:11434/api/chat",
  ".no_proxy()",
  '"--noproxy"',
  ".chunk()",
  '"raw_model_output_returned": false',
  '"generated_code_executed": false',
  "deterministic_visible_static_gate",
  "isolated_local_model_candidate",
  "outilsia.forgebench_visible_gameplay_contract.v1",
  "__SIGNAL_MAZE_VISIBLE_API__",
  "signal-maze-visible-snapshot.v1",
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
  "soumission structurée vérifiée",
  "Code non exécuté · gameplay non vérifié · énergie locale non mesurée",
]) {
  if (!js.includes(needle)) throw new Error(`missing UI truth label: ${needle}`);
}
for (const [label, text, needles] of [
  ["hub", hub, ["forgebench-workspaces-stacks-ia", "ForgeBench Ollama Candidate v0 · source, non public", "modèle Ollama déjà installé", "Contrôle statique 7/7", "Visible Gameplay Contract v1", "Cette preuve concerne la référence, pas le code Ollama", "Code non exécuté", "Aucun Codex, Claude Code ou Hermes", "ForgeBench peut-il déjà tester un modèle Ollama local ou lancer Codex, Claude Code et Hermes ?"]],
  ["download", download, ["forgebench-workspaces-stacks-ia", "ForgeBench Ollama Candidate v0 · source, non public", "modèle déjà installé via la boucle locale Ollama", "Contrôle statique 7/7", "Visible Gameplay Contract v1", "Le candidat Ollama ne l'est pas", "Génération et structure vérifiées", "Aucun Codex, Claude Code ou Hermes", "ForgeBench peut-il déjà tester un modèle Ollama local ou lancer Codex, Claude Code et Hermes ?"]],
  ["llms", llms, ["ForgeBench Ollama Candidate v0 (source candidate, not in the current public build)", "Visible Gameplay Contract v1", "separate reference implementation passes three seeds", "This reference proof does not validate the Ollama submission", "already-installed native or WSL Ollama model", "generated code is not executed", "no hidden evaluation, scientific score, CLI-agent comparison or winner"]],
]) {
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`missing ForgeBench SEO/GEO truth on ${label}: ${needle}`);
  }
}

console.log(`forgebench_contract_ok benchmark=${benchmark.id} seeds=${benchmark.determinism.default_seeds.length} starter=${bundleDigest} visible-contract=${visibleContract.contract_version} reference=${referenceDigest} hidden=absent isolation=reference-plus-static-candidate candidate=ollama-prompt-only generated-code=false gameplay=false science=false winner=false seo=hub-download-llms`);
