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

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

try {
  const candidateDir = resolve(argValue("--candidate-dir") || join(appRoot, ".artifacts", "release-candidate-merged"));
  const registryDir = resolve(argValue("--registry-dir") || join(appRoot, ".artifacts", "rc-smoke-registry"));
  const output = resolve(argValue("--output") || join(registryDir, "PROMOTION-DECISION.json"));
  const candidatePath = join(candidateDir, "release-candidate.json");
  const statusPath = join(registryDir, "RC-SMOKE-STATUS.json");
  if (!existsSync(candidatePath)) fail(`Missing candidate manifest: ${candidatePath}`);
  if (!existsSync(statusPath)) fail(`Missing smoke status: ${statusPath}`);
  if (existsSync(output) && !process.argv.includes("--replace")) {
    fail(`Decision file already exists: ${output}. Pass --replace to recreate a pending template.`);
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
  writeFileSync(output, `${JSON.stringify(decision, null, 2)}\n`);
  console.log(`promotion_decision_template=${output}`);
  console.log(`decision=pending candidate=${candidate.label} build=${candidate.build_id}`);
  console.log(`smoke_status=${status.status} machines=${status.unique_machines}/${status.minimum_unique_machines}`);
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
