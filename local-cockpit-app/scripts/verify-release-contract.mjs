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
const releaseFeatureContracts = {
  "0.1.1": {
    features: [
      "upgrade_digital_twin_v1",
      "hardware_truth_v1",
      "hardware_doctor_v2",
      "ai_capability_passport_v1",
      "model_autopilot_v1",
      "flight_recorder_v1",
    ],
    notes: [
      "Upgrade Digital Twin v1",
      "Hardware Truth v1",
      "Hardware Doctor 2.0",
      "AI Capability Passport v1",
      "Model Autopilot v1",
    ],
  },
  "0.1.2": {
    features: [
      "upgrade_digital_twin_v1",
      "runtime_driver_intelligence_v1",
      "private_workload_packs_v1",
      "local_capability_bridge_v1",
      "install_safety_preflight_v1",
    ],
    notes: [
      "Upgrade Digital Twin v1",
      "Runtime & Driver Intelligence v1",
      "Private Workload Packs v1",
      "Local Capability Bridge v1",
      "Install Safety Preflight v1",
    ],
  },
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
  const promotedFromRc = release.build_provenance.promoted_from_rc;
  if (promotedFromRc !== undefined) {
    if (!promotedFromRc || typeof promotedFromRc !== "object" || Array.isArray(promotedFromRc)) {
      fail("build_provenance.promoted_from_rc must be an object");
    }
    if (promotedFromRc.exact_artifact_bytes !== true) {
      fail("RC promotion must preserve exact artifact bytes");
    }
    if (promotedFromRc.full_terrain_gate_complete !== false) {
      fail("RC promotion must not claim the full terrain gate");
    }
    if (Number(promotedFromRc.unique_smoke_machines || 0) < 2) {
      fail("RC promotion requires at least two unique smoke machines");
    }
    for (const key of [
      "candidate_manifest_sha256",
      "candidate_artifact_set_sha256",
      "smoke_status_sha256",
      "smoke_registry_sha256",
      "decision_sha256",
    ]) {
      if (!/^[a-f0-9]{64}$/i.test(String(promotedFromRc[key] || ""))) {
        fail(`RC promotion provenance has invalid ${key}`);
      }
    }
  }
  if (release.build_provenance.ci === true && !/^\d{11,14}$/.test(String(release.build_id))) {
    fail("CI release.build_id must be an 11-14 digit GitHub run identifier");
  }
  const featureContract = releaseFeatureContracts[release.version];
  if (!featureContract) fail(`No explicit feature contract for release ${release.version}`);
  const requiredFeatures = featureContract.features;
  if (!Array.isArray(release.features)) fail("release.features must be an array");
  for (const feature of requiredFeatures) {
    if (!release.features.includes(feature)) fail(`release.features must include ${feature}`);
  }
  const requiredNotes = featureContract.notes;
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
    if (promotedFromRc && (!file.rc_source_name || !file.kind)) {
      fail(`RC-promoted artifact must retain rc_source_name and kind: ${file.name}`);
    }
    const path = join(opts.input, file.name);
    if (!existsSync(path)) fail(`Missing artifact file: ${file.name}`);
    const stat = statSync(path);
    if (!stat.isFile()) fail(`Artifact is not a file: ${file.name}`);
    if (stat.size !== Number(file.size_bytes)) fail(`Size mismatch for ${file.name}`);
    if (sha256(path) !== file.sha256) fail(`SHA256 mismatch for ${file.name}`);
  }

  if (promotedFromRc && release.code_signing?.schema !== "outilsia.windows_authenticode.v1") {
    fail("RC-promoted release must preserve Windows Authenticode evidence");
  }
  if (release.code_signing !== undefined) {
    const signing = release.code_signing;
    if (signing?.schema !== "outilsia.windows_authenticode.v1") fail("Invalid release.code_signing schema");
    if (!["valid", "not_signed", "mixed_or_invalid", "unverified", "not_applicable"].includes(signing.status)) {
      fail(`Invalid release.code_signing status: ${signing.status}`);
    }
    const windowsFiles = release.files.filter((file) => file.platform === "windows-x64");
    const signatureFiles = Array.isArray(signing.files) ? signing.files : [];
    if (signatureFiles.length !== windowsFiles.length) fail("release.code_signing file count mismatch");
    const byName = new Map(signatureFiles.map((file) => [file.name, file]));
    for (const artifact of windowsFiles) {
      const signature = byName.get(artifact.name);
      if (!signature) fail(`release.code_signing entry missing: ${artifact.name}`);
      if (signature.sha256 !== artifact.sha256) fail(`release.code_signing SHA256 mismatch: ${artifact.name}`);
      if (!["valid", "not_signed", "invalid", "unverified"].includes(signature.status)) {
        fail(`Invalid release Authenticode file status: ${artifact.name}`);
      }
      if (Object.hasOwn(signature, "status_message")) {
        fail(`release.code_signing must not expose native messages or local paths: ${artifact.name}`);
      }
      if (promotedFromRc && signature.rc_source_name !== artifact.rc_source_name) {
        fail(`release.code_signing RC identity mismatch: ${artifact.name}`);
      }
    }
    if (byName.size !== windowsFiles.length) fail("release.code_signing contains unexpected files");
    const statuses = [...new Set(signatureFiles.map((file) => file.status))];
    let expectedSigningStatus = "mixed_or_invalid";
    if (!windowsFiles.length) {
      expectedSigningStatus = "not_applicable";
      if (signing.verified_on_windows !== false || signatureFiles.length) {
        fail("Non-Windows release must use non-applicable signing evidence");
      }
    } else if (signing.verified_on_windows === false) {
      if (statuses.some((status) => status !== "unverified")) {
        fail("Unverified release signing evidence may only contain unverified file statuses");
      }
      expectedSigningStatus = "unverified";
    } else {
      if (signing.inspector !== "Get-AuthenticodeSignature") {
        fail("Release Authenticode inspector is invalid");
      }
      if (statuses.length === 1 && statuses[0] === "valid") expectedSigningStatus = "valid";
      else if (statuses.length === 1 && statuses[0] === "not_signed") expectedSigningStatus = "not_signed";
    }
    if (signing.status !== expectedSigningStatus) {
      fail(`release.code_signing aggregate status mismatch: ${signing.status} != ${expectedSigningStatus}`);
    }
    const allValid = signing.status === "valid";
    if (signing.all_valid !== allValid
      || signing.identity_claim_allowed !== allValid
      || signing.stable_release_ready !== allValid) {
      fail("release.code_signing claims do not match its status");
    }
    if (allValid && signatureFiles.some((file) => (
      !String(file.signer_subject || "").trim()
      || !String(file.signer_thumbprint || "").trim()
    ))) {
      fail("Valid release Authenticode evidence must identify every signer");
    }
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
