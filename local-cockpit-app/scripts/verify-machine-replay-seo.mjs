#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const hub = readFileSync(join(repoRoot, "server-work", "static", "pages", "scanner-ia-local.html"), "utf8");
const download = readFileSync(join(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html"), "utf8");
const llms = readFileSync(join(repoRoot, "server-work", "static", "llms.txt"), "utf8");
const matrix = JSON.parse(readFileSync(join(appRoot, "scripts", "fixtures", "machine-replay-matrix.json"), "utf8"));

const expectedScenarioKeys = [
  "old_laptop",
  "core_i7_gtx_1080_ti",
  "rtx_3060_12gb",
  "rtx_4080_16gb",
  "rtx_3090_24gb",
  "cpu_only",
  "strix_halo_128gb",
  "unknown_gpu",
  "intel_arc_b580",
  "amd_rx_7900_xtx"
];

function fail(message) {
  console.error(`machine_replay_seo_error ${message}`);
  process.exit(1);
}

for (const [label, html] of [["hub", hub], ["download", download]]) {
  for (const token of [
    'id="machine-replay-lab"',
    "Machine Replay Lab v1 · candidat source",
    "candidat source postérieur au build public actuel",
    "matrice synthétique de non-régression",
    "GTX 1080 Ti",
    "RTX 4080 SUPER",
    "Strix Halo",
    "Intel Arc B580",
    "0 preuve terrain fabriquée",
    "ne compte jamais comme preuve terrain physique"
  ]) {
    if (!html.includes(token)) fail(`${label}: missing ${token}`);
  }
  for (const forbidden of [
    "validé sur 10 machines",
    "validée sur 10 machines",
    "testé sur 10 machines réelles",
    "testée sur 10 machines réelles",
    "10 machines physiques validées",
    "preuve terrain 10/10"
  ]) {
    if (html.toLowerCase().includes(forbidden)) fail(`${label}: forbidden physical claim ${forbidden}`);
  }
}

for (const token of [
  "Machine Replay Lab v1 (source candidate, not in the current public build)",
  "ten profiles",
  "Unknown VRAM remains unknown",
  "not physical benchmarks",
  "never count as field-validation evidence"
]) {
  if (!llms.includes(token)) fail(`llms.txt missing ${token}`);
}

if (matrix.schema !== "outilsia.machine_replay_matrix.v1") fail("matrix schema mismatch");
const actualScenarioKeys = matrix.scenarios.map((scenario) => scenario.key);
if (actualScenarioKeys.length !== expectedScenarioKeys.length) fail(`expected 10 scenarios, got ${actualScenarioKeys.length}`);
for (const key of expectedScenarioKeys) {
  if (!actualScenarioKeys.includes(key)) fail(`matrix missing scenario ${key}`);
}

console.log(`machine_replay_seo_ok matrix=${matrix.version} scenarios=${actualScenarioKeys.length} hub=ok download=ok llms=ok`);
