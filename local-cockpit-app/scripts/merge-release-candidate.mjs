#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const publicReleaseRoot = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");
const defaultOutput = join(appRoot, ".artifacts", "release-candidate-merged");

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const opts = { inputs: [], output: defaultOutput, replace: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/merge-release-candidate.mjs --input <dir> --input <dir> [--output-dir <dir>] [--replace]");
      process.exit(0);
    }
    if (arg === "--input") {
      opts.inputs.push(resolve(argv[++index] || ""));
      continue;
    }
    if (arg === "--output-dir") {
      opts.output = resolve(argv[++index] || "");
      continue;
    }
    if (arg === "--replace") {
      opts.replace = true;
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }
  if (opts.inputs.length < 2) fail("At least two --input candidate directories are required");
  return opts;
}

function isInside(path, parent) {
  const normalized = resolve(path);
  const base = resolve(parent);
  return normalized === base || normalized.startsWith(`${base}${sep}`);
}

function runVerifier(path) {
  const result = spawnSync("node", [join(appRoot, "scripts", "verify-release-candidate.mjs"), "--input", path, "--require-freshness"], {
    cwd: appRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) fail(`Invalid RC input ${path}: ${result.stderr || result.stdout}`);
}

function readCandidate(path) {
  runVerifier(path);
  return JSON.parse(readFileSync(join(path, "release-candidate.json"), "utf8"));
}

function assertSameIdentity(candidates) {
  const first = candidates[0];
  for (const candidate of candidates.slice(1)) {
    for (const key of ["version", "rc_number", "label", "build_id"]) {
      if (String(candidate[key]) !== String(first[key])) fail(`RC ${key} mismatch across platform inputs`);
    }
    if (String(candidate.source?.commit || "") !== String(first.source?.commit || "")) {
      fail("RC source commit mismatch across platform inputs");
    }
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (isInside(opts.output, publicReleaseRoot)) fail("Merged RC output must stay outside the public release tree");
  if (existsSync(opts.output)) {
    const entries = readdirSync(opts.output);
    if (entries.length && !opts.replace) fail(`Output is not empty: ${opts.output}. Pass --replace.`);
    if (opts.replace) rmSync(opts.output, { recursive: true, force: true });
  }
  const candidates = opts.inputs.map(readCandidate);
  assertSameIdentity(candidates);
  mkdirSync(opts.output, { recursive: true });

  const byName = new Map();
  candidates.forEach((candidate, candidateIndex) => {
    for (const file of candidate.files) {
      if (byName.has(file.name)) fail(`Duplicate RC file across inputs: ${file.name}`);
      const source = join(opts.inputs[candidateIndex], file.name);
      copyFileSync(source, join(opts.output, file.name));
      byName.set(file.name, file);
    }
  });
  const files = [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
  const platforms = [...new Set(files.map((file) => file.platform))].sort();
  const first = candidates[0];
  const windowsCandidate = candidates.find((candidate) =>
    candidate.files.some((file) => file.platform === "windows-x64")
  );
  const codeSigning = windowsCandidate?.code_signing || {
    schema: "outilsia.windows_authenticode.v1",
    inspected_at: new Date().toISOString(),
    inspector: "not_applicable",
    verified_on_windows: false,
    status: "not_applicable",
    all_valid: false,
    identity_claim_allowed: false,
    stable_release_ready: false,
    files: [],
  };
  const primary = files.find((file) => file.platform === "windows-x64" && file.kind === "setup")
    || files.find((file) => file.platform === "windows-x64" && file.kind === "portable")
    || files.find((file) => file.platform === "linux" && file.kind === "appimage")
    || files[0];
  const newestSource = candidates
    .map((candidate) => candidate.freshness)
    .sort((left, right) => Number(right.newest_source_mtime_ms) - Number(left.newest_source_mtime_ms))[0];
  const oldestArtifact = candidates
    .map((candidate) => candidate.freshness)
    .sort((left, right) => Number(left.oldest_artifact_mtime_ms) - Number(right.oldest_artifact_mtime_ms))[0];
  const merged = {
    ...first,
    created_at: new Date().toISOString(),
    source: {
      ...first.source,
      tracked_dirty: candidates.some((candidate) => candidate.source?.tracked_dirty === true),
      post_build_tracked_dirty: candidates.some((candidate) => candidate.source?.post_build_tracked_dirty === true),
      post_build_tracked_dirty_paths: [...new Set(candidates.flatMap(
        (candidate) => candidate.source?.post_build_tracked_dirty_paths || []
      ))].sort(),
    },
    build_provenance: {
      ...first.build_provenance,
      artifact_platforms: platforms,
      merged_candidate: true,
      merged_input_count: candidates.length,
      artifact_set_sha256: createHash("sha256")
        .update(files.map((file) => `${file.sha256}  ${file.name}`).sort().join("\n"))
        .digest("hex"),
    },
    freshness: {
      stale: candidates.some((candidate) => candidate.freshness?.stale !== false),
      newest_source: newestSource.newest_source,
      newest_source_mtime_ms: newestSource.newest_source_mtime_ms,
      oldest_artifact: oldestArtifact.oldest_artifact,
      oldest_artifact_mtime_ms: oldestArtifact.oldest_artifact_mtime_ms,
    },
    code_signing: codeSigning,
    primary_artifact: primary,
    files,
    merged_from: candidates.map((candidate) => ({
      runner_os: candidate.build_provenance?.runner_os || "",
      platforms: candidate.build_provenance?.artifact_platforms || [],
      source_commit: candidate.source?.commit || "",
      artifact_set_sha256: candidate.build_provenance?.artifact_set_sha256 || "",
      code_signing_status: candidate.code_signing?.status || "not_applicable",
    })),
  };
  writeFileSync(join(opts.output, "release-candidate.json"), `${JSON.stringify(merged, null, 2)}\n`);
  writeFileSync(join(opts.output, "AUTHENTICODE.json"), `${JSON.stringify(codeSigning, null, 2)}\n`);
  writeFileSync(join(opts.output, "SHA256SUMS.txt"), `${files.map((file) => `${file.sha256}  ${file.name}`).join("\n")}\n`);
  runVerifier(opts.output);
  console.log(`release_candidate_merged label=${merged.label} build_id=${merged.build_id} platforms=${platforms.join(",")}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
