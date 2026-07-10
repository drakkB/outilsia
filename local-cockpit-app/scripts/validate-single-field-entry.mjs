#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_PROFILES, assertFieldProfileHardware } from "./import-field-tests.mjs";
import { validateFieldEnrichment } from "./validate-field-enrichment.mjs";

const FIELD_KIT = existsSync("/mnt/c/Users/chris/Desktop")
  ? "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Field-Test-Kit"
  : "";
const FIELD_KIT_MANIFEST = FIELD_KIT ? `${FIELD_KIT}/FIELD-KIT-MANIFEST.txt` : "";

const REQUIRED_FIELDS = [
  "machine_label",
  "tested_at",
  "os",
  "cpu",
  "gpu",
  "ram_gb",
  "scan_ok",
  "score",
  "score_label",
  "recommended_model",
  "first_action",
  "upgrade_recommendation",
  "benchmark_model",
  "benchmark_tokens_per_second",
  "benchmark_elapsed_ms",
  "promptforge_ok",
  "dialogue_ok",
  "arena_ok",
  "report_ok",
  "share_url",
];

function usage() {
  console.log(`Usage:
  node scripts/validate-single-field-entry.mjs --input outilsia-field-test-<profile>.json [--profile old_laptop]

Validates one exported machine fiche before leaving the physical PC.`);
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const opts = { input: "", profile: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--input") {
      opts.input = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--profile") {
      opts.profile = argv[++i] || "";
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!opts.input) fail("Missing --input <field-entry.json>");
  return opts;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function looksLikeEntry(value) {
  return value && typeof value === "object" && !Array.isArray(value) && typeof value.profile === "string";
}

function readKitManifest() {
  if (!FIELD_KIT_MANIFEST || !existsSync(FIELD_KIT_MANIFEST)) return {};
  const out = {};
  for (const line of readFileSync(FIELD_KIT_MANIFEST, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) out[match[1].trim()] = match[2].trim();
  }
  return out;
}

function inferLegacyMetadata(entry, buildId, appVersion) {
  const manifest = readKitManifest();
  const expectedBuild = String(manifest.build_id || "").trim();
  const expectedVersion = String(manifest.version || "").trim();
  const notes = String(entry.notes || "");
  const explicitlyMentionsExpectedBuild = expectedBuild && new RegExp(`\\b${expectedBuild}\\b`).test(notes);
  return {
    build_id: buildId || (explicitlyMentionsExpectedBuild ? expectedBuild : ""),
    app_version: appVersion || (explicitlyMentionsExpectedBuild ? expectedVersion : ""),
  };
}

function withPayloadMetadata(entry, payload = {}) {
  const buildId = String(entry.build_id || payload.build_id || "").trim();
  const appVersion = String(entry.app_version || payload.app_version || "").trim();
  const inferred = inferLegacyMetadata(entry, buildId, appVersion);
  return {
    ...entry,
    build_id: inferred.build_id,
    app_version: inferred.app_version,
  };
}

function extractEntry(payload) {
  if (looksLikeEntry(payload)) return withPayloadMetadata(payload, payload);
  if (payload?.schema === "outilsia.local_cockpit_field_tests.v1" && Array.isArray(payload.machines) && payload.machines.length === 1) {
    const [entry] = payload.machines;
    if (looksLikeEntry(entry)) return withPayloadMetadata(entry, payload);
  }
  fail("Input must be one field-test machine object or a single-machine field-tests payload.");
}

function valueOk(machine, field) {
  const value = machine[field];
  if (field.endsWith("_ok")) return value === true;
  if (["ram_gb", "score", "benchmark_tokens_per_second", "benchmark_elapsed_ms"].includes(field)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0;
  }
  return Boolean(String(value ?? "").trim());
}

function assertShareUrl(value, label) {
  const text = String(value || "").trim();
  if (!text) fail(`${label} is required`);
  let url;
  try {
    url = new URL(text);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (!["http:", "https:"].includes(url.protocol)) fail(`${label} must use http or https`);
  if (!url.hostname) fail(`${label} must include a hostname`);
  if (url.hostname !== "outilsia.fr" || !url.pathname.startsWith("/r/")) {
    fail(`${label} must be an OutilsIA shared report URL (https://outilsia.fr/r/...)`);
  }
}

function assertTestedAt(value, label) {
  const text = String(value || "").trim();
  if (!text) fail(`${label} is required`);
  const time = Date.parse(text);
  if (!Number.isFinite(time)) fail(`${label} must be an ISO date`);
  const now = Date.now();
  if (time > now + 10 * 60 * 1000) fail(`${label} must not be in the future`);
  if (time < Date.UTC(2026, 6, 1)) fail(`${label} must be from the current beta terrain campaign`);
}

const PROFILE_TOKENS_PER_SECOND_CAPS = {
  old_laptop: 45,
  core_i7_gtx_1080_ti: 95,
  rtx_3060_12gb: 150,
  rtx_4080_4090: 650,
  cpu_only: 35,
};

function assertBenchmarkPlausible(entry) {
  const cap = PROFILE_TOKENS_PER_SECOND_CAPS[entry.profile];
  const value = Number(entry.benchmark_tokens_per_second || 0);
  const elapsedMs = Number(entry.benchmark_elapsed_ms || 0);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 200) {
    fail(`${entry.profile}.benchmark_elapsed_ms is implausible (${elapsedMs} ms < 200 ms)`);
  }
  if (Number.isFinite(cap) && value > cap) {
    fail(`${entry.profile}.benchmark_tokens_per_second is implausible (${value} tok/s > ${cap} tok/s cap)`);
  }
}

function validateFirst30sProof(entry) {
  const proof = entry.first_30s;
  const requiredKeys = [
    "hardware_visible",
    "score_visible",
    "recommended_model_visible",
    "benchmark_cta_or_proof_visible",
    "upgrade_visible",
  ];
  if (proof && typeof proof === "object" && !Array.isArray(proof)) {
    const missing = requiredKeys.filter((key) => proof[key] !== true);
    if (missing.length) fail(`${entry.profile}.first_30s incomplete: ${missing.join(", ")}`);
    if (!String(proof.summary || "").trim()) fail(`${entry.profile}.first_30s.summary is required`);
    return {
      complete: true,
      source: "explicit",
      summary: String(proof.summary || "").trim(),
    };
  }
  const derived = {
    hardware_visible: Boolean(entry.scan_ok && entry.cpu && entry.gpu && Number(entry.ram_gb || 0) > 0),
    score_visible: Number.isFinite(Number(entry.score)) && Number(entry.score) > 0 && Boolean(String(entry.score_label || "").trim()),
    recommended_model_visible: Boolean(String(entry.recommended_model || "").trim()),
    benchmark_cta_or_proof_visible: (
      (Boolean(String(entry.benchmark_model || "").trim()) && Number(entry.benchmark_tokens_per_second || 0) > 0) ||
      /bench|test|tester|lancer/i.test(String(entry.first_action || ""))
    ),
    upgrade_visible: Boolean(String(entry.upgrade_recommendation || "").trim()),
  };
  const missing = requiredKeys.filter((key) => derived[key] !== true);
  if (missing.length) fail(`${entry.profile}.first_30s derived proof incomplete: ${missing.join(", ")}`);
  return {
    complete: true,
    source: "derived_legacy",
    summary: [
      `${entry.gpu} · ${entry.vram_gb ?? 0} Go VRAM · ${entry.ram_gb} Go RAM`,
      `score ${entry.score}/100`,
      `modele ${entry.recommended_model}`,
      `benchmark ${entry.benchmark_model || "CTA"}`,
      `upgrade ${entry.upgrade_recommendation}`,
    ].join(" | "),
  };
}

export function validateSingleFieldEntry(entry, expectedProfile = "") {
  if (!REQUIRED_PROFILES.includes(entry.profile)) fail(`Unexpected profile: ${entry.profile}`);
  if (expectedProfile && entry.profile !== expectedProfile) {
    fail(`Profile mismatch: expected ${expectedProfile}, got ${entry.profile}`);
  }
  const buildId = String(entry.build_id || "").trim();
  const appVersion = String(entry.app_version || "").trim();
  if (!buildId) fail(`${entry.profile}.build_id is required`);
  if (!appVersion) fail(`${entry.profile}.app_version is required`);
  assertTestedAt(entry.tested_at, `${entry.profile}.tested_at`);
  const fields = [...REQUIRED_FIELDS];
  if (entry.profile !== "cpu_only") fields.push("vram_gb");
  const missing = fields.filter((field) => !valueOk(entry, field));
  if (missing.length) fail(`Incomplete field entry for ${entry.profile}: ${missing.join(", ")}`);
  assertShareUrl(entry.share_url, `${entry.profile}.share_url`);
  assertFieldProfileHardware(entry, entry.profile);
  assertBenchmarkPlausible(entry);
  const first30s = validateFirst30sProof(entry);
  const evidence = validateFieldEnrichment(entry);
  return {
    ok: true,
    profile: entry.profile,
    recommended_model: entry.recommended_model,
    benchmark_model: entry.benchmark_model,
    benchmark_tokens_per_second: Number(entry.benchmark_tokens_per_second),
    first_30s_complete: first30s.complete,
    first_30s_source: first30s.source,
    first_30s_summary: first30s.summary,
    build_id: buildId,
    app_version: appVersion,
    tested_at: String(entry.tested_at || "").trim(),
    report: entry.share_url,
    ...evidence,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (!existsSync(opts.input)) fail(`Input not found: ${opts.input}`);
    const entry = extractEntry(readJson(opts.input));
    const result = validateSingleFieldEntry(entry, opts.profile);
    console.log(
      `single_field_entry_ok profile=${result.profile} model=${result.recommended_model} ` +
      `benchmark=${result.benchmark_model} tps=${result.benchmark_tokens_per_second} first_30s=${result.first_30s_source} ` +
      `build_id=${result.build_id} app_version=${result.app_version} report=${result.report}`
    );
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
}
