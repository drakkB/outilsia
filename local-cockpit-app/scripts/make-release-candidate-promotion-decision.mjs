#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(message);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function usage() {
  console.log(`Usage:
  node scripts/make-release-candidate-promotion-decision.mjs
    [--candidate-dir <merged-rc>] [--registry-dir <dir>]
    [--output <PROMOTION-DECISION.json>] [--replace]

Creates a pending human-decision template. It never approves or deploys.`);
}

function parseArgs(argv) {
  const opts = {
    candidateDir: join(appRoot, ".artifacts", "release-candidate-merged"),
    registryDir: join(appRoot, ".artifacts", "rc-smoke-registry"),
    output: "",
    replace: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--candidate-dir") opts.candidateDir = resolve(argv[++index] || "");
    else if (arg === "--registry-dir") opts.registryDir = resolve(argv[++index] || "");
    else if (arg === "--output") opts.output = resolve(argv[++index] || "");
    else if (arg === "--replace") opts.replace = true;
    else fail(`Unknown argument: ${arg}`);
  }
  opts.output = opts.output || join(opts.registryDir, "PROMOTION-DECISION.json");
  return opts;
}

try {
  const opts = parseArgs(process.argv.slice(2));
  const candidatePath = join(opts.candidateDir, "release-candidate.json");
  const statusPath = join(opts.registryDir, "RC-SMOKE-STATUS.json");
  if (!existsSync(candidatePath)) fail(`Missing candidate manifest: ${candidatePath}`);
  if (!existsSync(statusPath)) fail(`Missing smoke status: ${statusPath}`);
  if (existsSync(opts.output) && !opts.replace) {
    fail(`Decision file already exists: ${opts.output}. Pass --replace to recreate a pending template.`);
  }
  const candidate = JSON.parse(readFileSync(candidatePath, "utf8").replace(/^\uFEFF/, ""));
  const status = JSON.parse(readFileSync(statusPath, "utf8").replace(/^\uFEFF/, ""));
  const decision = {
    schema: "outilsia.local_cockpit_rc_promotion_decision.v1",
    decision: "pending",
    candidate: {
      version: candidate.version,
      label: candidate.label,
      build_id: candidate.build_id,
      source_commit: candidate.source?.commit || "",
      manifest_sha256: sha256(candidatePath),
      artifact_set_sha256: candidate.build_provenance?.artifact_set_sha256 || "",
    },
    smoke_status_sha256: sha256(statusPath),
    smoke_summary: {
      status: status.status,
      unique_machines: status.unique_machines,
      network_verified_machines: status.network_verified_machines,
      minimum_unique_machines: status.minimum_unique_machines,
    },
    decided_at: "",
    decided_by: "",
    reason: "",
    acknowledgements: {
      publish_exact_rc_artifact_bytes: true,
      full_terrain_gate_incomplete: true,
      public_claim_limited_to_beta: true,
      rollback_prepared: true,
    },
    instructions: [
      "Ne remplacer decision par approve_public_beta qu'apres lecture de RC-SMOKE-DECISION.html.",
      "Renseigner decided_at en ISO, decided_by et une raison explicite.",
      "Cette decision n'effectue aucun deploiement ; elle autorise seulement la preparation du pack de promotion.",
    ],
  };
  writeFileSync(opts.output, `${JSON.stringify(decision, null, 2)}\n`);
  console.log(`promotion_decision_template=${opts.output}`);
  console.log(`decision=pending candidate=${candidate.label} build=${candidate.build_id}`);
  console.log(`smoke_status=${status.status} machines=${status.unique_machines}/${status.minimum_unique_machines}`);
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
