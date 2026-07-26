#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(appRoot, "src", "app.js"), "utf8");

function fail(message) {
  throw new Error(message);
}

function requireText(value, label) {
  if (!source.includes(value)) fail(`Activation funnel contract missing ${label}: ${value}`);
}

for (const [value, label] of [
  ["outilsia.localCockpit.activationFunnel.v1", "local storage key"],
  ["outilsia.activation_funnel.v1", "schema"],
  ['recordActivationMilestone("scan_success")', "scan event"],
  ['recordActivationMilestone("recommended_model_ready")', "recommended model event"],
  ['recordActivationMilestone("first_benchmark_success")', "benchmark event"],
  ["activation_funnel: activationFunnelSnapshot()", "explicit terrain export"],
  ["uploaded_automatically: false", "no automatic upload"],
  ["contains_prompt: false", "no prompts"],
  ["contains_model_output: false", "no model output"],
  ["contains_machine_identifier: false", "no machine identifier"],
  ["contains_file_path: false", "no file paths"],
  ["Aucune télémétrie", "visible privacy statement"],
]) {
  requireText(value, label);
}

const start = source.indexOf("function activationBuildIdentity()");
const end = source.indexOf("function betaReportMarkdown()", start);
if (start < 0 || end < 0) fail("Activation funnel implementation boundaries are missing");
const implementation = source.slice(start, end);
for (const forbidden of ["fetch(", "invoke(", "machine_key", "output_preview", "navigator.sendBeacon"]) {
  if (implementation.includes(forbidden)) {
    fail(`Activation funnel must remain local and content-free: found ${forbidden}`);
  }
}

console.log("activation_funnel_contract_ok local_only content_free build_bound explicit_export");
