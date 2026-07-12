#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const defaultInput = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");

const platformExts = {
  "windows-x64": new Set([".exe", ".msi"]),
  linux: new Set([".appimage", ".deb", ".rpm"]),
  macos: new Set([".dmg"]),
};

function usage() {
  console.log(`Usage:
  node scripts/verify-release-contract.mjs [--input <release-dir>] [--require-platform <platform>] [--require-freshness]

Examples:
  npm run verify:release:contract
  npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux
  npm run verify:release:contract -- --require-platform windows-x64 --require-freshness
  npm run verify:release:contract -- --input ../server-work/static/downloads/local-cockpit
`);
}

function parseArgs(argv) {
  const opts = { input: defaultInput, requiredPlatforms: [], requireFreshness: false };
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
    if (arg === "--require-platform") {
      opts.requiredPlatforms.push(argv[++i] || "");
      continue;
    }
    if (arg === "--require-freshness") {
      opts.requireFreshness = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function fail(message) {
  throw new Error(message);
}

function sha256(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function assertPlatformFile(file) {
  const allowed = platformExts[file.platform];
  if (!allowed) fail(`Unsupported platform in release file: ${file.platform}`);
  const ext = extname(file.name).toLowerCase();
  if (!allowed.has(ext)) {
    fail(`Invalid native extension for ${file.platform}: ${file.name}`);
  }
}

function assertFreshness(release) {
  const freshness = release.freshness;
  if (!freshness || typeof freshness !== "object") fail("Missing release.freshness");
  if (freshness.stale !== false) fail("release.freshness.stale must be false");
  if (freshness.allow_stale === true) fail("release.freshness.allow_stale must not be true");
  if (!freshness.newest_source) fail("release.freshness.newest_source is required");
  if (!freshness.oldest_artifact) fail("release.freshness.oldest_artifact is required");
  if (!Number.isFinite(Number(freshness.newest_source_mtime_ms))) {
    fail("release.freshness.newest_source_mtime_ms is required");
  }
  if (!Number.isFinite(Number(freshness.oldest_artifact_mtime_ms))) {
    fail("release.freshness.oldest_artifact_mtime_ms is required");
  }
  if (Number(freshness.oldest_artifact_mtime_ms) + 1000 < Number(freshness.newest_source_mtime_ms)) {
    fail("release.freshness timestamps indicate a stale artifact");
  }
}

try {
  const opts = parseArgs(process.argv.slice(2));
  const releasePath = join(opts.input, "release.json");
  if (!existsSync(releasePath)) fail(`Missing release.json in ${opts.input}`);

  const release = JSON.parse(readFileSync(releasePath, "utf8"));
  if (release.ok !== true) fail("release.ok must be true");
  if (release.product !== "OutilsIA Local Cockpit") fail("Unexpected release.product");
  if (release.channel !== "beta") fail("release.channel must be beta");
  if (!/^\d+\.\d+\.\d+/.test(release.version || "")) fail("Invalid release.version");
  if (!release.build_id) fail("Missing release.build_id");
  if (!release.build_provenance || typeof release.build_provenance !== "object") {
    fail("Missing release.build_provenance");
  }
  if (String(release.build_provenance.build_id || "") !== String(release.build_id)) {
    fail("build_provenance.build_id must match release.build_id");
  }
  if (release.build_provenance.ci === true && !/^\d{11,14}$/.test(String(release.build_id))) {
    fail("CI release.build_id must be an 11-14 digit GitHub run identifier");
  }
  const requiredFeatures = ["upgrade_digital_twin_v1", "runtime_driver_intelligence_v1", "private_workload_packs_v1", "local_capability_bridge_v1"];
  if (!Array.isArray(release.features)) fail("release.features must be an array");
  for (const feature of requiredFeatures) {
    if (!release.features.includes(feature)) fail(`release.features must include ${feature}`);
  }
  const requiredNotes = ["Upgrade Digital Twin v1", "Runtime & Driver Intelligence v1", "Private Workload Packs v1", "Local Capability Bridge v1"];
  if (!Array.isArray(release.release_notes)) fail("release.release_notes must be an array");
  for (const label of requiredNotes) {
    if (!release.release_notes.some((note) => String(note).includes(label))) {
      fail(`release.release_notes must advertise ${label}`);
    }
  }
  if (!release.primary_download?.name) fail("Missing primary_download.name");
  if (!Array.isArray(release.files) || !release.files.length) fail("release.files must be non-empty");
  if (!release.downloads_by_platform || typeof release.downloads_by_platform !== "object") {
    fail("Missing downloads_by_platform");
  }
  if (opts.requireFreshness) assertFreshness(release);

  const names = new Set();
  const platforms = new Set();
  const canonicalFiles = new Map();
  for (const file of release.files) {
    if (!file.name || file.name !== basename(file.name)) fail(`Invalid release file name: ${file.name}`);
    if (names.has(file.name)) fail(`Duplicate release file: ${file.name}`);
    names.add(file.name);
    canonicalFiles.set(file.name, file);
    platforms.add(file.platform);
    assertPlatformFile(file);
    if (!file.url || file.url !== `/static/downloads/local-cockpit/${file.name}`) {
      fail(`Invalid URL for ${file.name}`);
    }
    if (!/^[a-f0-9]{64}$/i.test(file.sha256 || "")) fail(`Invalid SHA256 for ${file.name}`);
    const path = join(opts.input, file.name);
    if (!existsSync(path)) fail(`Missing artifact file: ${file.name}`);
    const stat = statSync(path);
    if (!stat.isFile()) fail(`Artifact is not a file: ${file.name}`);
    if (stat.size !== Number(file.size_bytes)) fail(`Size mismatch for ${file.name}`);
    if (sha256(path) !== file.sha256) fail(`SHA256 mismatch for ${file.name}`);
  }

  if (release.build_provenance.ci === true) {
    for (const file of release.files) {
      if (!file.name.includes(`-${release.build_id}-`)) {
        fail(`CI artifact name must include build_id ${release.build_id}: ${file.name}`);
      }
    }
  }

  if (!names.has(release.primary_download.name)) fail("primary_download is not listed in release.files");
  const primaryCanonical = canonicalFiles.get(release.primary_download.name);
  if (release.primary_download.platform !== primaryCanonical.platform
    || release.primary_download.url !== primaryCanonical.url
    || release.primary_download.sha256 !== primaryCanonical.sha256
    || Number(release.primary_download.size_bytes) !== Number(primaryCanonical.size_bytes)) {
    fail("primary_download must match its canonical release.files entry");
  }
  assertPlatformFile(release.primary_download);

  const provenancePlatforms = [...new Set(release.build_provenance?.artifact_platforms || [])].sort();
  const actualPlatforms = [...platforms].sort();
  if (JSON.stringify(provenancePlatforms) !== JSON.stringify(actualPlatforms)) {
    fail(`build_provenance.artifact_platforms mismatch: expected ${actualPlatforms.join(",")} got ${provenancePlatforms.join(",")}`);
  }
  if (actualPlatforms.length > 1 && release.build_provenance?.merged_release !== true) {
    fail("Cross-platform release must set build_provenance.merged_release=true");
  }

  const groupedNames = new Set();
  for (const [platform, files] of Object.entries(release.downloads_by_platform)) {
    if (!platformExts[platform]) fail(`Unsupported downloads_by_platform key: ${platform}`);
    if (!Array.isArray(files) || !files.length) fail(`downloads_by_platform.${platform} must be non-empty`);
    for (const file of files) {
      if (!names.has(file.name)) fail(`downloads_by_platform.${platform} references unknown file: ${file.name}`);
      if (file.platform !== platform) {
        fail(`downloads_by_platform.${platform} contains ${file.name} with platform ${file.platform}`);
      }
      if (groupedNames.has(file.name)) fail(`downloads_by_platform duplicates file: ${file.name}`);
      groupedNames.add(file.name);
      const canonical = canonicalFiles.get(file.name);
      if (file.url !== canonical.url
        || file.sha256 !== canonical.sha256
        || Number(file.size_bytes) !== Number(canonical.size_bytes)) {
        fail(`downloads_by_platform.${platform} entry must match release.files: ${file.name}`);
      }
      assertPlatformFile(file);
    }
  }
  for (const file of release.files) {
    if (!groupedNames.has(file.name)) fail(`downloads_by_platform is missing file: ${file.name}`);
  }

  for (const platform of opts.requiredPlatforms) {
    if (!platformExts[platform]) fail(`Unsupported required platform: ${platform}`);
    if (!platforms.has(platform)) fail(`Missing required platform: ${platform}`);
    if (!release.downloads_by_platform[platform]?.length) {
      fail(`Missing downloads_by_platform for required platform: ${platform}`);
    }
  }

  console.log(`release_contract_ok ${release.version} ${release.files.length} file(s) platforms=${[...platforms].sort().join(",")}${opts.requireFreshness ? " freshness=ok" : ""}`);
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
