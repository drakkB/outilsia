#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const reportsRoot = join(repoRoot, "reports");
const fieldStatusPath = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Field-Test-Kit/FIELD-TESTS-STATUS.json";

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  if (!existsSync(path)) fail(`missing json: ${path}`);
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function latestReport(prefix) {
  if (!existsSync(reportsRoot)) fail(`missing reports directory: ${reportsRoot}`);
  const files = readdirSync(reportsRoot)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .sort();
  if (!files.length) return "";
  return join(reportsRoot, files.at(-1));
}

function latestAudit() {
  const path = latestReport("beta_field_goal_audit_");
  if (!path) fail("no beta_field_goal_audit_*.json report found");
  return path;
}

function rel(path) {
  return path ? path.replace(`${repoRoot}/`, "") : "";
}

function expectedProofFor(row) {
  if (row.area === "Tests terrain multi-machines") {
    return [
      "FIELD-TESTS.json importé dans local-cockpit-app/.artifacts/field-tests.json",
      "5 profils physiques présents : old_laptop, core_i7_gtx_1080_ti, rtx_3060_12gb, rtx_4080_4090, cpu_only",
      "Chaque profil avec scan_ok, benchmark_tokens_per_second > 0, PromptForge, dialogue, Arena, rapport et upgrade",
      "npm run import:field-tests -- --input /mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Field-Test-Kit/FIELD-TESTS.json",
      "python3 scripts/audit_beta_field_goal.py",
    ];
  }
  if (row.area === "Release Linux") {
    return [
      "release.json public contenant au moins une entrée platform=linux courante",
      "Artefacts Linux vérifiés par npm run verify:linux:artifacts",
      "Contrat release vérifié avec windows-x64 + linux",
      "npm run verify:release:prod",
      "python3 scripts/audit_local_cockpit_linux_readiness.py",
      "python3 scripts/audit_beta_field_goal.py",
    ];
  }
  return row.missing || [];
}

function evidenceFor(row) {
  if (row.area === "Tests terrain multi-machines" && existsSync(fieldStatusPath)) {
    const field = readJson(fieldStatusPath);
    const ready = Array.isArray(field.profiles_ready) ? field.profiles_ready.length : Number(field.ready || 0);
    const required = Array.isArray(field.profiles_required) ? field.profiles_required.length : Number(field.required || 5);
    const readyProfiles = Array.isArray(field.profiles_ready) ? field.profiles_ready.join(",") : "";
    const missingProfiles = Array.isArray(field.profiles_missing) ? field.profiles_missing.join(",") : "";
    return [
      `${fieldStatusPath} status=${field.status || "unknown"}`,
      `ready=${ready}/${required}`,
      readyProfiles ? `ready_profiles=${readyProfiles}` : "",
      missingProfiles ? `missing_profiles=${missingProfiles}` : "",
      field.next_profile_to_test ? `next=${field.next_profile_to_test}` : "",
    ].filter(Boolean).join(" ");
  }
  if (row.area === "Release Linux") {
    const linuxPath = latestReport("local_cockpit_linux_readiness_");
    if (linuxPath) {
      const linux = readJson(linuxPath);
      const missing = Array.isArray(linux.missing_prerequisites) ? linux.missing_prerequisites.length : 0;
      const sudo = Object.hasOwn(linux, "sudo_non_interactive")
        ? `sudo_non_interactive=${linux.sudo_non_interactive ? "yes" : "no"}`
        : "";
      const route = linux.linux_release_path_ok === true ? "ci_import_path=ok" : "ci_import_path=unknown";
      const kit = linux.build_kit?.exists === true ? "kit=ok" : "kit=missing";
      return [
        `${rel(linuxPath)} status=${linux.status || "unknown"}`,
        `public=${linux.public_status || "unknown"}`,
        kit,
        route,
        `missing=${missing}`,
        sudo,
      ].filter(Boolean).join(" ");
    }
  }
  return row.evidence || "";
}

function markdown(report, summary) {
  const linux = summary.sources.linux_readiness ? readJson(summary.sources.linux_readiness) : {};
  const lines = [
    "# OutilsIA Local Cockpit - restes à lever",
    "",
    `- Audit source: \`${summary.audit_report.replace(`${repoRoot}/`, "")}\``,
    `- Statut: \`${report.overall_status}\``,
    `- Preuves OK: ${report.summary?.proved ?? "?"}`,
    `- Manques: ${summary.missing_count}`,
    `- Field status: \`${summary.sources.field_status}\``,
    `- Linux readiness: \`${summary.sources.linux_readiness || "absent"}\``,
    "",
  ];
  if (!summary.missing.length) {
    lines.push("Aucun manque restant. Le goal peut être audité pour clôture.");
  } else {
    lines.push("## Manques restants");
    for (const [index, item] of summary.missing.entries()) {
      lines.push("", `### ${index + 1}. ${item.area}`);
      lines.push("");
      lines.push(`- Exigence: ${item.requirement}`);
      lines.push(`- Evidence actuelle: ${item.evidence || "aucune"}`);
      if (item.missing?.length) lines.push(`- Manque déclaré: ${item.missing.join(", ")}`);
      lines.push("");
      lines.push("Preuves attendues :");
      for (const proof of item.expected_proof) lines.push(`- ${proof}`);
    }
  }
  if (linux.public_status === "public_linux_release_current") {
    lines.push("");
    lines.push("## Résolu");
    lines.push("");
    lines.push("- Release Linux: proved");
    lines.push(`- Linux readiness: \`${summary.sources.linux_readiness}\``);
    lines.push("- release.json public contenant au moins une entrée platform=linux courante");
  }
  lines.push("");
  lines.push("## Commandes de contrôle");
  lines.push("");
  lines.push("```bash");
  lines.push("cd local-cockpit-app");
  lines.push("npm run verify:catalog");
  lines.push("npm run verify:model-catalog");
  lines.push("npm run verify:priority-models");
  lines.push("npm run verify:media-actions");
  lines.push("npm run verify:media-action-guard");
  lines.push("npm run verify:wsl-runtime");
  lines.push("npm run verify:field-kit");
  lines.push("npm run verify:field-kit:self");
  lines.push("npm run verify:field-ready");
  lines.push("npm run verify:field-audit");
  lines.push("npm run verify:field-profile-lock");
  lines.push("npm run verify:field-usb");
  lines.push("npm run verify:field-transfer");
  lines.push("npm run verify:linux:routes");
  lines.push("npm run verify:linux:self");
  lines.push("npm run verify:linux:stale");
  lines.push("npm run verify:linux:workflow");
  lines.push("npm run verify:linux:path");
  lines.push("npm run test:import:merge");
  lines.push("npm run test:goal-closure");
  lines.push("npm run verify:goal-remaining");
  lines.push("npm run verify:goal-closure");
  lines.push("npm run report:goal-dashboard");
  lines.push("npm run verify:goal-dashboard");
  lines.push("npm run report:goal-progress");
  lines.push("cd ..");
  lines.push("python3 scripts/audit_local_cockpit_linux_readiness.py");
  lines.push("python3 scripts/audit_beta_field_goal.py");
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

function main() {
  mkdirSync(reportsRoot, { recursive: true });
  const auditPath = latestAudit();
  const report = readJson(auditPath);
  const missingRows = (report.rows || []).filter((row) => row.status !== "proved");
  const summary = {
    schema: "outilsia.local_cockpit_remaining_goal.v1",
    generated_at: new Date().toISOString(),
    audit_report: auditPath,
    sources: {
      field_status: fieldStatusPath,
      linux_readiness: latestReport("local_cockpit_linux_readiness_"),
    },
    overall_status: report.overall_status,
    proved: report.summary?.proved || 0,
    missing_count: missingRows.length,
    missing: missingRows.map((row) => ({
      area: row.area,
      requirement: row.requirement,
      evidence: evidenceFor(row),
      missing: row.missing || [],
      expected_proof: expectedProofFor(row),
    })),
  };
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "_").slice(0, 15);
  const jsonPath = join(reportsRoot, `goal_remaining_${stamp}.json`);
  const mdPath = join(reportsRoot, `goal_remaining_${stamp}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, markdown(report, summary), "utf8");
  console.log(`goal_remaining_report missing=${summary.missing_count} json=${jsonPath.replace(`${repoRoot}/`, "")} md=${mdPath.replace(`${repoRoot}/`, "")}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
