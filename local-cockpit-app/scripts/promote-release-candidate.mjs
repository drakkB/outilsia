#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PUBLIC_RELEASE_FEATURES, PUBLIC_RELEASE_NOTES } from "./release-metadata.mjs";
import { syncDownloadPage } from "./sync-download-page-release.mjs";
import { validateRcSmokeResult, verifyRcSmokeReport } from "./rc-smoke-evidence.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const publicReleaseRoot = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");
const defaultCandidate = join(appRoot, ".artifacts", "release-candidate-merged");
const defaultRegistry = join(appRoot, ".artifacts", "rc-smoke-registry");
const defaultOutput = join(appRoot, ".artifacts", "release-promotion");
const defaultPage = join(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html");
const SHA256_RE = /^[a-f0-9]{64}$/i;

function fail(message) {
  throw new Error(message);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseArgs(argv) {
  const opts = {
    candidateDir: defaultCandidate,
    registryDir: defaultRegistry,
    decision: "",
    output: defaultOutput,
    pageTemplate: defaultPage,
    replace: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/promote-release-candidate.mjs --decision <PROMOTION-DECISION.json>
    [--candidate-dir <merged-rc>] [--registry-dir <dir>]
    [--output-dir <dir>] [--page-template <html>] [--replace]

This command never deploys. It creates a verified public-beta promotion pack
from the exact RC artifact bytes after the smoke threshold and human decision.`);
      process.exit(0);
    }
    if (arg === "--candidate-dir") opts.candidateDir = resolve(argv[++index] || "");
    else if (arg === "--registry-dir") opts.registryDir = resolve(argv[++index] || "");
    else if (arg === "--decision") opts.decision = resolve(argv[++index] || "");
    else if (arg === "--output-dir") opts.output = resolve(argv[++index] || "");
    else if (arg === "--page-template") opts.pageTemplate = resolve(argv[++index] || "");
    else if (arg === "--replace") opts.replace = true;
    else fail(`Unknown argument: ${arg}`);
  }
  if (!opts.decision) fail("Missing --decision <PROMOTION-DECISION.json>");
  return opts;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: appRoot, encoding: "utf8" });
  if (result.status !== 0) fail(result.stderr || result.stdout || `Command failed: ${command}`);
}

function isInside(path, parent) {
  const normalized = resolve(path);
  const base = resolve(parent);
  return normalized === base || normalized.startsWith(`${base}${sep}`);
}

function prepareOutput(path, replace) {
  if (isInside(path, publicReleaseRoot)) fail("Promotion pack must stay outside the public release tree");
  if (existsSync(path)) {
    const entries = readdirSync(path);
    if (entries.length && !replace) fail(`Promotion output is not empty: ${path}. Pass --replace.`);
    if (replace) rmSync(path, { recursive: true, force: true });
  }
  mkdirSync(path, { recursive: true });
}

function candidateIdentity(candidate, manifestPath) {
  return {
    version: candidate.version,
    label: candidate.label,
    build_id: candidate.build_id,
    source_commit: candidate.source?.commit || "",
    manifest_sha256: sha256(manifestPath),
    artifact_set_sha256: candidate.build_provenance?.artifact_set_sha256 || "",
  };
}

function assertIdentity(actual, expected, label) {
  for (const key of ["version", "label", "build_id", "source_commit", "manifest_sha256", "artifact_set_sha256"]) {
    if (String(actual?.[key] || "") !== String(expected?.[key] || "")) fail(`${label}.${key} mismatch`);
  }
}

function validateSmokeStatus(status, identity) {
  if (status.schema !== "outilsia.local_cockpit_rc_smoke_status.v1") fail("Unexpected RC smoke status schema");
  assertIdentity(status.candidate, identity, "smoke_status.candidate");
  if (!SHA256_RE.test(String(status.registry_sha256 || ""))) fail("Smoke status registry_sha256 is invalid");
  if (status.status !== "RC_SMOKE_GATE_READY") fail(`RC smoke gate is not ready: ${status.status}`);
  const unique = Number(status.unique_machines || 0);
  const verified = Number(status.network_verified_machines || 0);
  const minimum = Number(status.minimum_unique_machines || 2);
  if (unique < minimum || verified !== unique || status.promotion_threshold_reached !== true) {
    fail(`RC smoke threshold is incomplete: unique=${unique} verified=${verified} minimum=${minimum}`);
  }
  if (status.promotion_authorized !== false) fail("Smoke status must not self-authorize promotion");
  if (status.full_terrain_gate_complete !== false) fail("Smoke status must preserve the incomplete full terrain gate");
  const fingerprints = new Set();
  const machineAnchors = new Set();
  const reportUrls = new Set();
  for (const machine of status.machines || []) {
    if (!SHA256_RE.test(String(machine.machine_anchor_sha256 || ""))) fail("Smoke machine anchor is invalid");
    if (!SHA256_RE.test(String(machine.machine_fingerprint_sha256 || ""))) fail("Smoke machine fingerprint is invalid");
    if (machineAnchors.has(machine.machine_anchor_sha256)) fail("Duplicate physical machine anchor in smoke status");
    if (fingerprints.has(machine.machine_fingerprint_sha256)) fail("Duplicate machine in smoke status");
    machineAnchors.add(machine.machine_anchor_sha256);
    fingerprints.add(machine.machine_fingerprint_sha256);
    const url = String(machine.shared_report?.url || "");
    if (reportUrls.has(url)) fail("Duplicate shared report in smoke status");
    reportUrls.add(url);
    if (machine.report_verification?.network_verified !== true) fail("Smoke machine lacks network report verification");
  }
}

function latestRegistryRuns(registry) {
  const latest = new Map();
  for (const run of registry.runs || []) {
    const machineKey = String(run.machine_anchor_sha256 || "");
    if (!SHA256_RE.test(machineKey)) fail("RC smoke registry machine anchor is invalid");
    const previous = latest.get(machineKey);
    if (!previous || Date.parse(run.validated_at) > Date.parse(previous.validated_at)) {
      latest.set(machineKey, run);
    }
  }
  return [...latest.values()];
}

async function validateSmokeRegistry(registryDir, status, identity, candidate, dependencies = {}) {
  const registryPath = join(registryDir, "RC-SMOKE-REGISTRY.json");
  if (!existsSync(registryPath)) fail(`Missing RC smoke registry: ${registryPath}`);
  if (sha256(registryPath) !== status.registry_sha256) fail("RC smoke registry hash does not match status");
  const registry = readJson(registryPath);
  if (registry.schema !== "outilsia.local_cockpit_rc_smoke_registry.v1") fail("Unexpected RC smoke registry schema");
  assertIdentity(registry.candidate, identity, "smoke_registry.candidate");
  const latestRuns = latestRegistryRuns(registry);
  if (latestRuns.length !== Number(status.unique_machines || 0)) fail("RC smoke registry unique-machine count mismatch");
  const statusFingerprints = new Set((status.machines || []).map((run) => run.machine_fingerprint_sha256));
  const reportUrls = new Set();
  for (const run of latestRuns) {
    if (!statusFingerprints.has(run.machine_fingerprint_sha256)) fail("RC smoke status omits a registry machine");
    const entryName = basename(String(run.entry_file || ""));
    if (!entryName || entryName !== run.entry_file) fail("RC smoke registry entry_file is invalid");
    const entryPath = join(registryDir, "entries", entryName);
    if (!existsSync(entryPath)) fail(`RC smoke registry entry is missing: ${entryName}`);
    const entryBytes = readFileSync(entryPath);
    if (sha256(entryPath) !== run.result_sha256) fail(`RC smoke registry result hash mismatch: ${entryName}`);
    const rawResult = JSON.parse(entryBytes.toString("utf8").replace(/^\uFEFF/, ""));
    const validationCandidate = {
      ...candidate,
      build_provenance: {
        ...candidate.build_provenance,
        artifact_set_sha256: rawResult?.candidate?.artifact_set_sha256 || "",
      },
    };
    const result = validateRcSmokeResult(rawResult, validationCandidate);
    if (result.machine.fingerprint_sha256 !== run.machine_fingerprint_sha256) {
      fail(`RC smoke machine fingerprint mismatch: ${entryName}`);
    }
    if (result.machine.anchor_sha256 !== run.machine_anchor_sha256) {
      fail(`RC smoke machine anchor mismatch: ${entryName}`);
    }
    if (reportUrls.has(result.shared_report.url)) fail("RC smoke registry reuses a shared report");
    reportUrls.add(result.shared_report.url);
    const verification = await verifyRcSmokeReport(result, { fetchImpl: dependencies.fetchImpl });
    if (!verification.network_verified || !verification.coherent) {
      fail(`RC smoke report recheck failed for ${entryName}: ${(verification.mismatches || []).join(" | ")}`);
    }
  }
  return {
    path: registryPath,
    sha256: status.registry_sha256,
    unique_machines: latestRuns.length,
  };
}

function validateDecision(decision, identity, smokeStatusPath, candidate) {
  if (decision.schema !== "outilsia.local_cockpit_rc_promotion_decision.v1") fail("Unexpected promotion decision schema");
  if (decision.decision !== "approve_public_beta") fail("Promotion decision is not approve_public_beta");
  assertIdentity(decision.candidate, identity, "decision.candidate");
  if (decision.smoke_status_sha256 !== sha256(smokeStatusPath)) fail("Promotion decision smoke status hash mismatch");
  const decidedAt = Date.parse(String(decision.decided_at || ""));
  if (!Number.isFinite(decidedAt)) fail("Promotion decision decided_at must be an ISO date");
  if (decidedAt > Date.now() + 10 * 60 * 1000) fail("Promotion decision is in the future");
  if (!String(decision.decided_by || "").trim()) fail("Promotion decision decided_by is required");
  if (String(decision.reason || "").trim().length < 20) fail("Promotion decision reason must explain the approval");
  const candidateSigning = candidate.code_signing || {};
  if (String(decision.windows_code_signing?.status || "") !== String(candidateSigning.status || "")) {
    fail("Promotion decision Windows signing status does not match the candidate");
  }
  if (decision.windows_code_signing?.verified_on_windows !== (candidateSigning.verified_on_windows === true)
    || decision.windows_code_signing?.identity_claim_allowed !== (candidateSigning.identity_claim_allowed === true)
    || decision.windows_code_signing?.stable_release_ready !== (candidateSigning.stable_release_ready === true)) {
    fail("Promotion decision Windows signing claims do not match the candidate");
  }
  const acknowledgements = decision.acknowledgements || {};
  for (const key of [
    "publish_exact_rc_artifact_bytes",
    "full_terrain_gate_incomplete",
    "public_claim_limited_to_beta",
    "rollback_prepared",
    "windows_signing_status_acknowledged",
  ]) {
    if (acknowledgements[key] !== true) fail(`Promotion decision acknowledgement missing: ${key}`);
  }
}

function publicName(candidate, file) {
  const ext = extname(file.name).toLowerCase() === ".appimage" ? ".AppImage" : extname(file.name).toLowerCase();
  return `OutilsIA-Local-Cockpit-${candidate.version}-beta-${candidate.build_id}-${file.platform}-${file.kind}${ext}`;
}

function sortedFiles(files) {
  const rank = { "windows-x64": 1, linux: 2, macos: 3 };
  return [...files].sort((left, right) => (
    (rank[left.platform] || 99) - (rank[right.platform] || 99)
    || left.name.localeCompare(right.name)
  ));
}

function downloadsByPlatform(files) {
  return files.reduce((groups, file) => {
    if (!groups[file.platform]) groups[file.platform] = [];
    groups[file.platform].push(file);
    return groups;
  }, {});
}

function promotedCodeSigning(candidate, files) {
  const source = candidate.code_signing || {};
  const publicByRcName = new Map(files.map((file) => [file.rc_source_name, file]));
  return {
    ...source,
    files: (source.files || []).map((signature) => {
      const target = publicByRcName.get(signature.name);
      if (!target) fail(`Promoted Authenticode entry has no public artifact: ${signature.name}`);
      if (target.sha256 !== signature.sha256) fail(`Promoted Authenticode SHA256 mismatch: ${signature.name}`);
      return {
        ...signature,
        name: target.name,
        rc_source_name: signature.name,
      };
    }),
  };
}

export async function preparePromotion(opts, dependencies = {}) {
  run("node", [
    join(appRoot, "scripts", "verify-release-candidate.mjs"),
    "--input",
    opts.candidateDir,
    "--require-platform",
    "windows-x64",
    "--require-platform",
    "linux",
    "--require-freshness",
    "--require-clean-source",
  ]);
  const candidateManifestPath = join(opts.candidateDir, "release-candidate.json");
  const smokeStatusPath = join(opts.registryDir, "RC-SMOKE-STATUS.json");
  if (!existsSync(smokeStatusPath)) fail(`Missing RC smoke status: ${smokeStatusPath}`);
  if (!existsSync(opts.decision)) fail(`Missing promotion decision: ${opts.decision}`);
  if (!existsSync(opts.pageTemplate)) fail(`Missing download page template: ${opts.pageTemplate}`);
  const candidate = readJson(candidateManifestPath);
  const identity = candidateIdentity(candidate, candidateManifestPath);
  const smokeStatus = readJson(smokeStatusPath);
  const decision = readJson(opts.decision);
  validateSmokeStatus(smokeStatus, identity);
  const smokeRegistry = await validateSmokeRegistry(
    opts.registryDir,
    smokeStatus,
    identity,
    candidate,
    dependencies,
  );
  validateDecision(decision, identity, smokeStatusPath, candidate);
  prepareOutput(opts.output, opts.replace);

  const artifactIdentity = [];
  const files = sortedFiles(candidate.files.map((file) => {
    const name = publicName(candidate, file);
    const source = join(opts.candidateDir, file.name);
    const target = join(opts.output, name);
    copyFileSync(source, target);
    const hash = sha256(target);
    if (hash !== file.sha256 || statSync(target).size !== Number(file.size_bytes)) {
      fail(`Promoted artifact bytes changed: ${file.name}`);
    }
    artifactIdentity.push({
      rc_name: file.name,
      public_name: name,
      sha256: hash,
      size_bytes: statSync(target).size,
      exact_bytes: true,
    });
    return {
      name,
      original_name: file.original_name,
      rc_source_name: file.name,
      platform: file.platform,
      kind: file.kind,
      size_bytes: statSync(target).size,
      sha256: hash,
      url: `/static/downloads/local-cockpit/${name}`,
    };
  }));
  const primary = files.find((file) => file.platform === "windows-x64" && file.kind === "setup")
    || files.find((file) => file.platform === "windows-x64" && file.kind === "portable")
    || files[0];
  const platforms = [...new Set(files.map((file) => file.platform))].sort();
  const codeSigning = promotedCodeSigning(candidate, files);
  const publishedAt = new Date().toISOString();
  const release = {
    ok: true,
    product: "OutilsIA Local Cockpit",
    channel: "beta",
    version: candidate.version,
    label: `${candidate.version}-beta`,
    build_id: candidate.build_id,
    published_at: publishedAt,
    build_provenance: {
      schema: "outilsia.local_cockpit_build_provenance.v1",
      packaged_at: publishedAt,
      build_id: candidate.build_id,
      version: candidate.version,
      ci: candidate.build_provenance?.ci === true,
      runner_os: "RC promotion",
      node_platform: process.platform,
      node_arch: process.arch,
      artifact_platforms: platforms,
      source_commit: identity.source_commit,
      github: candidate.build_provenance?.github || {},
      merged_release: platforms.length > 1,
      merge_verified_file_count: files.length,
      promoted_from_rc: {
        label: candidate.label,
        rc_number: candidate.rc_number,
        candidate_manifest_sha256: identity.manifest_sha256,
        candidate_artifact_set_sha256: identity.artifact_set_sha256,
        smoke_status_sha256: sha256(smokeStatusPath),
        smoke_registry_sha256: smokeRegistry.sha256,
        decision_sha256: sha256(opts.decision),
        unique_smoke_machines: smokeStatus.unique_machines,
        exact_artifact_bytes: true,
        full_terrain_gate_complete: false,
      },
    },
    features: [...PUBLIC_RELEASE_FEATURES],
    release_notes: [...PUBLIC_RELEASE_NOTES],
    freshness: {
      ...candidate.freshness,
      allow_stale: false,
      stale: false,
    },
    code_signing: codeSigning,
    primary_download: primary,
    downloads_by_platform: downloadsByPlatform(files),
    files,
  };
  const releasePath = join(opts.output, "release.json");
  writeFileSync(releasePath, `${JSON.stringify(release, null, 2)}\n`);
  writeFileSync(join(opts.output, "AUTHENTICODE.json"), `${JSON.stringify(codeSigning, null, 2)}\n`);
  const promotionProof = {
    schema: "outilsia.local_cockpit_rc_promotion_proof.v1",
    created_at: publishedAt,
    candidate: identity,
    smoke_status_sha256: sha256(smokeStatusPath),
    smoke_registry_sha256: smokeRegistry.sha256,
    decision_sha256: sha256(opts.decision),
    release_manifest_sha256: sha256(releasePath),
    artifact_identity: artifactIdentity,
    code_signing: codeSigning,
    public_deploy_executed: false,
    rollback_required_before_deploy: true,
  };
  writeFileSync(join(opts.output, "PROMOTION-PROOF.json"), `${JSON.stringify(promotionProof, null, 2)}\n`);
  const stagedPage = join(opts.output, "telecharger-scanner-ia-local.html");
  copyFileSync(opts.pageTemplate, stagedPage);
  syncDownloadPage({ releasePath, pagePath: stagedPage });
  run("node", [
    join(appRoot, "scripts", "verify-release-contract.mjs"),
    "--input",
    opts.output,
    "--require-platform",
    "windows-x64",
    "--require-platform",
    "linux",
    "--require-freshness",
  ]);
  run("node", [
    join(appRoot, "scripts", "verify-download-page-contract.mjs"),
    "--release-dir",
    opts.output,
    "--page",
    stagedPage,
    "--require-local-files",
    "--require-freshness",
  ]);
  console.log(`release_promotion_ready candidate=${candidate.label} build=${candidate.build_id}`);
  console.log(`output=${opts.output}`);
  console.log(`artifacts=${files.length} exact_bytes=true deploy=false`);
  return { output: opts.output, release, promotionProof };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    await preparePromotion(opts);
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
}
