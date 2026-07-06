#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const reportsRoot = process.env.OUTILSIA_GOAL_REPORTS_DIR
  ? resolve(process.env.OUTILSIA_GOAL_REPORTS_DIR)
  : join(repoRoot, "reports");
const fieldStatusPath = process.env.OUTILSIA_FIELD_STATUS_PATH
  ? resolve(process.env.OUTILSIA_FIELD_STATUS_PATH)
  : "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Field-Test-Kit/FIELD-TESTS-STATUS.json";

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  if (!existsSync(path)) fail(`missing json: ${path}`);
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function latest(prefix) {
  if (!existsSync(reportsRoot)) return "";
  const names = readdirSync(reportsRoot)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .sort();
  return names.length ? join(reportsRoot, names.at(-1)) : "";
}

function rel(path) {
  return path ? path.replace(`${repoRoot}/`, "") : "";
}

function requiredFieldProfiles() {
  return ["old_laptop", "core_i7_gtx_1080_ti", "rtx_3060_12gb", "rtx_4080_4090", "cpu_only"];
}

function fieldProof() {
  const required = requiredFieldProfiles();
  if (!existsSync(fieldStatusPath)) {
    return {
      ok: false,
      status: "FIELD_STATUS_MISSING",
      ready: 0,
      required: required.length,
      ready_profiles: [],
      missing_profiles: required,
      blockers: [`FIELD-TESTS-STATUS.json absent: ${fieldStatusPath}`],
      evidence: fieldStatusPath,
    };
  }
  const status = readJson(fieldStatusPath);
  const ready = Array.isArray(status.profiles_ready) ? status.profiles_ready : [];
  const missing = Array.isArray(status.profiles_missing) ? status.profiles_missing : [];
  const incomplete = Array.isArray(status.profiles_incomplete) ? status.profiles_incomplete : [];
  const absent = required.filter((profile) => !ready.includes(profile));
  const ok = status.status === "FIELD_TESTS_READY" && absent.length === 0 && incomplete.length === 0;
  const blockers = [];
  if (absent.length) blockers.push(`profils non prêts: ${absent.join(", ")}`);
  if (missing.length) blockers.push(`profils absents: ${missing.join(", ")}`);
  if (incomplete.length) blockers.push(`profils incomplets: ${incomplete.join(", ")}`);
  if (status.status !== "FIELD_TESTS_READY") blockers.push(`statut terrain=${status.status || "unknown"}`);
  return {
    ok,
    status: status.status || "unknown",
    ready: ready.length,
    required: required.length,
    ready_profiles: ready,
    missing_profiles: [...new Set([...absent, ...missing])],
    blockers,
    evidence: fieldStatusPath,
  };
}

function linuxProof() {
  const path = latest("local_cockpit_linux_readiness_");
  if (!path) {
    return {
      ok: false,
      status: "LINUX_READINESS_MISSING",
      public_status: "unknown",
      blockers: ["audit Linux readiness absent"],
      evidence: "",
    };
  }
  const data = readJson(path);
  const ok = data.public_status === "public_linux_release_current";
  return {
    ok,
    status: data.status || "unknown",
    public_status: data.public_status || "unknown",
    blockers: ok ? [] : (data.missing_prerequisites || ["release Linux publique courante absente"]),
    evidence: rel(path),
  };
}

function auditProof() {
  const path = latest("beta_field_goal_audit_");
  if (!path) {
    return {
      ok: false,
      status: "AUDIT_MISSING",
      proved: 0,
      missing: 1,
      blockers: ["audit beta_field_goal absent"],
      evidence: "",
    };
  }
  const data = readJson(path);
  const missing = Number(data.summary?.missing ?? 1);
  const ok = data.overall_status === "GOAL_COMPLETE_EVIDENCE_READY" && missing === 0;
  const blockers = (data.rows || [])
    .filter((row) => row.status !== "proved")
    .map((row) => `${row.area}: ${row.requirement}`);
  return {
    ok,
    status: data.overall_status || "unknown",
    proved: Number(data.summary?.proved ?? 0),
    missing,
    blockers,
    evidence: rel(path),
  };
}

function markdown(report) {
  const lines = [
    "# OutilsIA Local Cockpit - guard clôture goal",
    "",
    `- Généré: \`${report.generated_at}\``,
    `- Décision: \`${report.decision}\``,
    `- update_goal complete autorisé: **${report.can_call_update_goal_complete ? "oui" : "non"}**`,
    "",
    "## Portes",
    "",
    "| Porte | Statut | Evidence | Blocages |",
    "| --- | --- | --- | --- |",
    `| Audit global | ${report.gates.audit.ok ? "OK" : "NON"} (${report.gates.audit.status}, proved=${report.gates.audit.proved}, missing=${report.gates.audit.missing}) | \`${report.gates.audit.evidence}\` | ${report.gates.audit.blockers.join("<br>") || "-"} |`,
    `| Terrain physique | ${report.gates.field.ok ? "OK" : "NON"} (${report.gates.field.ready}/${report.gates.field.required}, ${report.gates.field.status}) | \`${report.gates.field.evidence}\` | ${report.gates.field.blockers.join("<br>") || "-"} |`,
    `| Linux public | ${report.gates.linux.ok ? "OK" : "NON"} (${report.gates.linux.public_status}) | \`${report.gates.linux.evidence}\` | ${report.gates.linux.blockers.join("<br>") || "-"} |`,
    "",
    "## Règle",
    "",
    "Ne pas appeler `update_goal complete` tant que cette commande ne retourne pas `GOAL_CLOSURE_READY`.",
    "",
  ];
  return lines.join("\n");
}

function main() {
  mkdirSync(reportsRoot, { recursive: true });
  const gates = {
    audit: auditProof(),
    field: fieldProof(),
    linux: linuxProof(),
  };
  const blockers = [
    ...gates.audit.blockers.map((item) => `audit: ${item}`),
    ...gates.field.blockers.map((item) => `terrain: ${item}`),
    ...gates.linux.blockers.map((item) => `linux: ${item}`),
  ];
  const canComplete = gates.audit.ok && gates.field.ok && gates.linux.ok;
  const report = {
    schema: "outilsia.local_cockpit_goal_closure_guard.v1",
    generated_at: new Date().toISOString(),
    decision: canComplete ? "GOAL_CLOSURE_READY" : "GOAL_CLOSURE_BLOCKED",
    can_call_update_goal_complete: canComplete,
    gates,
    blockers,
  };
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "_").slice(0, 15);
  const jsonPath = join(reportsRoot, `goal_closure_guard_${stamp}.json`);
  const mdPath = join(reportsRoot, `goal_closure_guard_${stamp}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, markdown(report), "utf8");
  const message = `${report.decision} update_goal_complete=${canComplete ? "yes" : "no"} ` +
    `field=${gates.field.ready}/${gates.field.required} linux=${gates.linux.public_status} ` +
    `audit_missing=${gates.audit.missing} json=${rel(jsonPath)} md=${rel(mdPath)}`;
  if (!canComplete) {
    console.error(message);
    process.exit(1);
  }
  console.log(message);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
