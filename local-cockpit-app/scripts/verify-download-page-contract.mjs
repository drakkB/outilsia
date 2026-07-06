#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const pagePath = join(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html");
const releasePath = join(repoRoot, "server-work", "static", "downloads", "local-cockpit", "release.json");
const downloadRoot = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");

function usage() {
  console.log(`Usage:
  node scripts/verify-download-page-contract.mjs [--require-freshness]
  node scripts/verify-download-page-contract.mjs [--require-local-files]

Checks that the public download page contract matches the local release manifest:
  page button, counter, build id, SHA256, changelog, freshness and tracked download URL.`);
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const opts = { requireFreshness: false, requireLocalFiles: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--require-freshness") {
      opts.requireFreshness = true;
      continue;
    }
    if (arg === "--require-local-files") {
      opts.requireLocalFiles = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function assertIncludes(text, patterns, label) {
  const missing = patterns.filter((pattern) => !text.includes(pattern));
  if (missing.length) fail(`${label} missing: ${missing.join(", ")}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function validateFreshness(release, required) {
  const freshness = release.freshness;
  if (!freshness) {
    if (required) fail("Missing release.freshness");
    return "missing";
  }
  if (freshness.stale !== false) fail("release.freshness.stale must be false");
  if (freshness.allow_stale === true) fail("release.freshness.allow_stale must not be true");
  if (!freshness.newest_source || !freshness.oldest_artifact) fail("release.freshness source/artifact fields are required");
  if (Number(freshness.oldest_artifact_mtime_ms) + 1000 < Number(freshness.newest_source_mtime_ms)) {
    fail("release.freshness timestamps indicate stale artifact");
  }
  return "ok";
}

function validateRelease(release, opts) {
  if (release.ok !== true) fail("release.ok must be true");
  if (release.product !== "OutilsIA Local Cockpit") fail("Unexpected release.product");
  if (release.channel !== "beta") fail("release.channel must be beta");
  if (!release.version) fail("release.version is missing");
  if (!release.build_id) fail("release.build_id is missing");
  if (!Array.isArray(release.release_notes) || !release.release_notes.length) fail("release.release_notes must not be empty");
  if (!release.primary_download?.name) fail("release.primary_download.name is missing");
  if (!Array.isArray(release.files) || !release.files.length) fail("release.files must not be empty");
  const freshness = validateFreshness(release, opts.requireFreshness);
  const names = new Set(release.files.map((file) => file.name));
  if (!names.has(release.primary_download.name)) fail("primary_download must be listed in files");
  for (const file of release.files) {
    if (!file.name || file.name.includes("/") || file.name.includes("\\")) fail(`Invalid release file name: ${file.name}`);
    if (!file.url || !file.url.startsWith("/static/downloads/local-cockpit/")) fail(`Invalid release URL for ${file.name}`);
    if (!/^[a-f0-9]{64}$/i.test(file.sha256 || "")) fail(`Invalid sha256 for ${file.name}`);
    const path = join(downloadRoot, file.name);
    if (!existsSync(path)) {
      if (opts.requireLocalFiles) fail(`Release file missing locally: ${file.name}`);
      continue;
    }
    const stat = statSync(path);
    if (stat.size !== Number(file.size_bytes)) fail(`Size mismatch for ${file.name}`);
  }
  return freshness;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!existsSync(pagePath)) fail(`Download page not found: ${pagePath}`);
  if (!existsSync(releasePath)) fail(`Release manifest not found: ${releasePath}`);
  const html = readFileSync(pagePath, "utf8");
  const release = readJson(releasePath);
  const freshness = validateRelease(release, opts);

  assertIncludes(html, [
    'const releaseUrl = "/static/downloads/local-cockpit/release.json"',
    'const statsUrl = "/api/local-cockpit/download-stats"',
    'const downloadBtn = document.getElementById("downloadBtn")',
    'const downloadMeter = document.getElementById("downloadMeter")',
    'const freshnessBox = document.getElementById("freshnessBox")',
    'const verifyCommands = document.getElementById("verifyCommands")',
    'trackedUrlFor(file)',
    'downloadBtn.href = trackedUrlFor(file)',
    'downloadBtn.textContent = `Télécharger pour ${platformLabel(file.platform)}`',
    'releaseNotes.textContent = Array.isArray(release.release_notes)',
    '`Build ID: ${release.build_id || "non précisé"}`',
    '`SHA256: ${file.sha256 || "a publier"}`',
    '`Freshness: ${release.freshness ? (release.freshness.stale ? "stale" : "fresh") : "non disponible"}`',
    'copyVerifyBtn',
    'Build reconstruit après les sources',
    'Artefact potentiellement périmé',
    'Preuve de fraîcheur absente',
    'Builds Windows + Linux publics vérifiables',
    'La recette Windows native du build courant couvre scan',
    'La campagne terrain 5 machines reste en cours',
    'Quel modèle IA local mon PC peut-il faire tourner ?',
    'Téléchargement Windows, Linux et WSL',
    'Linux .deb / .rpm',
    'Captures issues du dernier état UI vérifié',
    'local-cockpit-scanned-desktop-20260703.png?v=202607032140',
    'local-cockpit-scanned-mobile-20260703.png?v=202607032140',
  ], "download page contract");

  if (!html.includes(release.build_id)) fail(`Static download block missing build_id ${release.build_id}`);
  for (const file of release.files) {
    if (!html.includes("trackedUrlFor(file)")) fail(`Tracked download URL missing for ${file.name}`);
    if (!html.includes(file.name)) fail(`Static download block missing file name ${file.name}`);
    if (!html.includes(file.sha256)) fail(`Static download block missing sha256 for ${file.name}`);
    if (!html.includes(file.url)) fail(`Static download block missing direct URL for ${file.name}`);
    if (!html.includes(`href="${file.url}"`)) fail(`Static direct download link (href) missing for ${file.name}`);
  }

  const staleBuildIds = [...new Set(html.match(/\b20\d{12}\b/g) || [])].filter((id) => id !== release.build_id);
  if (staleBuildIds.length) fail(`Stale build id(s) left in page: ${staleBuildIds.join(", ")}`);
  const knownShas = new Set(release.files.map((file) => file.sha256.toLowerCase()));
  const staleShas = [...new Set((html.match(/\b[a-f0-9]{64}\b/gi) || []).map((sha) => sha.toLowerCase()))]
    .filter((sha) => !knownShas.has(sha));
  if (staleShas.length) fail(`Stale SHA256 value(s) left in page: ${staleShas.map((sha) => sha.slice(0, 12)).join(", ")}`);

  console.log(`download_page_contract_ok version=${release.version} build=${release.build_id} files=${release.files.length} freshness=${freshness}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
