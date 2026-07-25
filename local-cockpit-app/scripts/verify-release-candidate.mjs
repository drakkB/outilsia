#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultInput = join(appRoot, ".artifacts", "release-candidate");
const platformExts = {
  "windows-x64": new Set([".exe", ".msi"]),
  linux: new Set([".appimage", ".deb", ".rpm"]),
  macos: new Set([".dmg"]),
};

function usage() {
  console.log(`Usage:
  node scripts/verify-release-candidate.mjs [--input <dir>]
    [--require-platform <platform>]... [--require-freshness] [--require-clean-source]`);
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const opts = { input: defaultInput, platforms: [], freshness: false, clean: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--input") {
      opts.input = resolve(argv[++index] || "");
      continue;
    }
    if (arg === "--require-platform") {
      opts.platforms.push(argv[++index] || "");
      continue;
    }
    if (arg === "--require-freshness") {
      opts.freshness = true;
      continue;
    }
    if (arg === "--require-clean-source") {
      opts.clean = true;
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }
  return opts;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function artifactSetSha256(files) {
  return createHash("sha256")
    .update(files.map((file) => `${file.sha256}  ${file.name}`).sort().join("\n"))
    .digest("hex");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifestPath = join(opts.input, "release-candidate.json");
  if (!existsSync(manifestPath)) fail(`Missing release-candidate.json in ${opts.input}`);
  if (existsSync(join(opts.input, "release.json"))) fail("RC directory must not contain public release.json");
  const candidate = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (candidate.schema !== "outilsia.local_cockpit_release_candidate.v1") fail("Unexpected candidate schema");
  if (candidate.ok !== true) fail("candidate.ok must be true");
  if (candidate.product !== "OutilsIA Local Cockpit") fail("Unexpected product");
  if (candidate.channel !== "release-candidate") fail("candidate.channel must be release-candidate");
  if (!/^\d+\.\d+\.\d+$/.test(candidate.version || "")) fail("Invalid candidate.version");
  if (!Number.isInteger(Number(candidate.rc_number)) || Number(candidate.rc_number) < 1) fail("Invalid candidate.rc_number");
  if (candidate.label !== `${candidate.version}-rc.${candidate.rc_number}`) fail("Candidate label/version mismatch");
  if (!/^[0-9A-Za-z._-]{6,32}$/.test(String(candidate.build_id || ""))) fail("Invalid candidate.build_id");
  if (candidate.deployment?.public_allowed !== false) fail("RC must set deployment.public_allowed=false");
  if (candidate.deployment?.promotion_required !== true) fail("RC must require explicit promotion");
  if (String(candidate.deployment?.target || "")) fail("RC deployment target must be empty");
  if (candidate.test_policy?.full_terrain_gate_unchanged !== true) fail("RC must preserve the full terrain gate");
  if (candidate.build_provenance?.release_channel !== "rc") fail("RC provenance must embed release_channel=rc");
  if (String(candidate.build_provenance?.build_id || "") !== String(candidate.build_id)) {
    fail("RC provenance build_id mismatch");
  }
  if (!/^[a-f0-9]{40}$/i.test(String(candidate.source?.commit || ""))) fail("RC source commit must be a full Git SHA");
  if (String(candidate.build_provenance?.source_commit || "") !== String(candidate.source.commit)) {
    fail("RC provenance source_commit mismatch");
  }
  if (opts.clean && candidate.source?.tracked_dirty !== false) fail("RC source tree is tracked-dirty");
  if (candidate.source?.post_build_tracked_dirty_paths !== undefined
    && !Array.isArray(candidate.source.post_build_tracked_dirty_paths)) {
    fail("RC source.post_build_tracked_dirty_paths must be an array");
  }
  if (!Array.isArray(candidate.files) || !candidate.files.length) fail("RC files must not be empty");

  const names = new Set();
  for (const file of candidate.files) {
    if (!file.name || basename(file.name) !== file.name) fail(`Invalid RC file name: ${file.name}`);
    if (names.has(file.name)) fail(`Duplicate RC file name: ${file.name}`);
    names.add(file.name);
    if (file.relative_path !== file.name) fail(`RC relative_path must be local for ${file.name}`);
    if (!file.name.includes(candidate.label) || !file.name.includes(String(candidate.build_id))) {
      fail(`RC identity missing from file name: ${file.name}`);
    }
    const allowed = platformExts[file.platform];
    if (!allowed || !allowed.has(extname(file.name).toLowerCase())) fail(`Invalid platform/extension: ${file.name}`);
    if (!/^[a-f0-9]{64}$/.test(file.sha256 || "")) fail(`Invalid SHA256: ${file.name}`);
    if (!["setup", "portable", "msi", "appimage", "deb", "rpm", "dmg"].includes(file.kind)) {
      fail(`Invalid RC artifact kind: ${file.name}`);
    }
    const path = join(opts.input, file.name);
    if (!existsSync(path) || !statSync(path).isFile()) fail(`Missing RC artifact: ${file.name}`);
    if (statSync(path).size !== Number(file.size_bytes)) fail(`RC size mismatch: ${file.name}`);
    if (sha256(path) !== file.sha256) fail(`RC SHA256 mismatch: ${file.name}`);
  }

  if (!names.has(candidate.primary_artifact?.name)) fail("primary_artifact must be listed in files");
  if (candidate.primary_artifact.sha256 !== candidate.files.find((file) => file.name === candidate.primary_artifact.name)?.sha256) {
    fail("primary_artifact must match its canonical files entry");
  }
  const expectedArtifactSet = artifactSetSha256(candidate.files);
  if (candidate.build_provenance?.artifact_set_sha256 !== expectedArtifactSet) {
    fail("RC provenance artifact_set_sha256 mismatch");
  }
  const actualPlatforms = [...new Set(candidate.files.map((file) => file.platform))].sort();
  const provenancePlatforms = [...(candidate.build_provenance?.artifact_platforms || [])].sort();
  if (JSON.stringify(actualPlatforms) !== JSON.stringify(provenancePlatforms)) {
    fail("RC provenance artifact_platforms mismatch");
  }
  for (const platform of opts.platforms) {
    if (!actualPlatforms.includes(platform)) fail(`Required RC platform missing: ${platform}`);
  }
  if (opts.freshness) {
    if (candidate.freshness?.stale !== false) fail("RC freshness.stale must be false");
    if (!candidate.freshness?.newest_source || !candidate.freshness?.oldest_artifact) {
      fail("RC freshness paths are required");
    }
    if (Number(candidate.freshness.oldest_artifact_mtime_ms) + 1000 < Number(candidate.freshness.newest_source_mtime_ms)) {
      fail("RC artifact is older than its source");
    }
  }
  console.log(
    `release_candidate_ok label=${candidate.label} build_id=${candidate.build_id} ` +
    `platforms=${actualPlatforms.join(",")} files=${candidate.files.length}`
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
