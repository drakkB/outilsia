#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const repoRoot = resolve(root, "..");
const benchmarkPath = resolve(root, "forgebench", "signal-maze-v1.json");
const manifestPath = resolve(root, "forgebench", "signal-maze-v1", "starter-manifest.json");
const benchmark = JSON.parse(readFileSync(benchmarkPath, "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const hub = readFileSync(resolve(repoRoot, "server-work", "static", "pages", "scanner-ia-local.html"), "utf8");
const download = readFileSync(resolve(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html"), "utf8");
const llms = readFileSync(resolve(repoRoot, "server-work", "static", "llms.txt"), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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
const lines = [];
for (const file of [...manifest.files].sort((left, right) => left.path.localeCompare(right.path))) {
  if (!/^starter\/[a-z0-9._/-]+$/.test(file.path) || file.path.includes("..")) {
    throw new Error(`unsafe starter path: ${file.path}`);
  }
  const bytes = readFileSync(resolve(root, "forgebench", "signal-maze-v1", file.path));
  const digest = sha256(bytes);
  if (digest !== file.sha256) throw new Error(`starter digest mismatch: ${file.path}`);
  lines.push(`${file.path}:${digest}`);
}
const bundleDigest = sha256(`${lines.join("\n")}\n`);
if (bundleDigest !== manifest.bundle_sha256 || bundleDigest !== benchmark.starter.bundle_sha256) {
  throw new Error("starter bundle digest mismatch");
}

const rust = ["forgebench.rs", "forgebench_vault.rs", "forgebench_sandbox.rs", "forgebench_isolation.rs", "forgebench_runner.rs", "evidence_ledger.rs"]
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
]) {
  if (!js.includes(needle)) throw new Error(`missing UI truth label: ${needle}`);
}
for (const [label, text, needles] of [
  ["hub", hub, ["forgebench-workspaces-stacks-ia", "ForgeBench Runner v0 · candidat source", "Pilote isolé vérifié", "worker technique déterministe", "aucun Codex, Claude, Hermes ou modèle local", "ForgeBench peut-il déjà lancer Codex, Claude Code et Hermes automatiquement ?"]],
  ["download", download, ["forgebench-workspaces-stacks-ia", "ForgeBench Runner v0 · candidat source", "Pilote isolé vérifié", "worker technique déterministe", "n'exécute encore aucun Codex, Claude, Hermes ou modèle local", "ForgeBench peut-il déjà lancer Codex, Claude Code et Hermes automatiquement ?"]],
  ["llms", llms, ["ForgeBench Runner v0 (source candidate, not in the current public build)", "deterministic reference worker", "No Codex, Claude, Hermes or local-model candidate is executed", "no scientific score or winner"]],
]) {
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`missing ForgeBench SEO/GEO truth on ${label}: ${needle}`);
  }
}

console.log(`forgebench_contract_ok benchmark=${benchmark.id} seeds=${benchmark.determinism.default_seeds.length} starter=${bundleDigest} hidden=absent isolation=reference-run-only candidate=false science=false seo=hub-download-llms`);
