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

function readText(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function latest(prefix) {
  if (!existsSync(reportsRoot)) return "";
  return readdirSync(reportsRoot)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .sort()
    .at(-1) || "";
}

function pct(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function rel(path) {
  return path ? path.replace(`${repoRoot}/`, "") : "";
}

function markdown(progress) {
  const lines = [
    "# OutilsIA Local Cockpit - progression du goal",
    "",
    `- Généré: \`${progress.generated_at}\``,
    `- Statut audit: \`${progress.audit.overall_status}\``,
    `- Preuve technique: **${progress.scores.technical_proof_percent}%**`,
    `- Readiness produit pondérée: **${progress.scores.weighted_product_percent}%**`,
    `- Machines terrain: **${progress.field.ready}/${progress.field.required}**`,
    `- Linux public: **${progress.linux.public_status}**`,
    "",
    "## Lecture rapide",
    "",
    `Le code, l'UX, le catalogue, les médias non actionnables, le pont Strategy Arena, le PDF, la release Windows et les kits de preuve sont largement couverts par l'audit. Le goal reste ouvert parce que les tests physiques multi-machines ne sont pas terminés et parce que Linux n'a pas encore d'artefact public courant.`,
    "",
    "## Scores",
    "",
    "| Score | Valeur | Sens |",
    "| --- | ---: | --- |",
    `| Preuve technique | ${progress.scores.technical_proof_percent}% | Ratio strict des lignes d'audit prouvées. |`,
    `| Coeur app prouvé | ${progress.scores.core_app_percent}% | Scope hors blocages physiques/Linux public. |`,
    `| Terrain physique | ${progress.scores.field_physical_percent}% | ${progress.field.ready}/${progress.field.required} profils réels importés. |`,
    `| Linux readiness | ${progress.scores.linux_readiness_percent}% | Route CI/kit prête, mais public Linux encore manquant. |`,
    `| Readiness pondérée | ${progress.scores.weighted_product_percent}% | 70% coeur app, 20% terrain physique, 10% Linux. |`,
    "",
    "## Restes à lever",
    "",
  ];

  if (progress.remaining.length) {
    for (const item of progress.remaining) {
      lines.push(`- **${item.area}**: ${item.requirement}`);
      if (item.missing?.length) lines.push(`  Manque: ${item.missing.join(", ")}`);
    }
  } else {
    lines.push("- Aucun manque restant dans l'audit courant.");
  }

  lines.push(
    "",
    "## Prochaine action",
    "",
    `1. Tester le profil terrain \`${progress.field.next_profile || "old_laptop"}\`.`,
    "2. Importer les fiches restantes dans le kit terrain.",
    "3. Produire/importer l'artefact Linux public quand le cycle Windows terrain est assez stable.",
    "",
    "## Sources",
    "",
    `- Audit: \`${rel(progress.audit.report)}\``,
    `- Field status: \`${progress.field.status_path}\``,
    `- Linux readiness: \`${rel(progress.linux.report)}\``,
    ""
  );
  return lines.join("\n");
}

function main() {
  mkdirSync(reportsRoot, { recursive: true });

  const auditName = latest("beta_field_goal_audit_");
  if (!auditName) fail("missing beta_field_goal_audit_*.json");
  const auditPath = join(reportsRoot, auditName);
  const audit = readJson(auditPath);
  const rows = audit.rows || [];
  const proved = Number(audit.summary?.proved || rows.filter((row) => row.status === "proved").length);
  const missing = Number(audit.summary?.missing || rows.filter((row) => row.status !== "proved").length);
  const total = proved + missing;

  const field = existsSync(fieldStatusPath)
    ? readJson(fieldStatusPath)
    : { profiles_required: [], profiles_ready: [], profiles_missing: [], next_profile_to_test: "" };
  const fieldRequired = Array.isArray(field.profiles_required) ? field.profiles_required.length : 5;
  const fieldReady = Array.isArray(field.profiles_ready) ? field.profiles_ready.length : 0;

  const linuxName = latest("local_cockpit_linux_readiness_");
  const linuxPath = linuxName ? join(reportsRoot, linuxName) : "";
  const linux = linuxPath ? readJson(linuxPath) : {};
  const linuxPublic = linux.public_status || "unknown";
  const linuxKitReady = linux.build_kit?.exists === true
    && linux.build_kit?.mission_ok === true
    && linux.build_kit?.start_here_ok === true
    && linux.build_kit?.helper_cmds_ok === true
    && linux.build_kit?.wsl_helpers_ok === true;
  const linuxRouteReady = linux.linux_release_path_ok === true
    && linux.github_actions_linux_workflow?.exists === true
    && linux.github_actions_cross_platform_workflow?.exists === true;

  const publicLinuxPercent = linuxPublic === "public_linux_release_current" ? 100 : 0;
  const linuxReadinessPercent = publicLinuxPercent === 100
    ? 100
    : pct((linuxRouteReady ? 45 : 0) + (linuxKitReady ? 35 : 0));

  const coreRows = rows.filter((row) => {
    const isPhysicalFieldMissing = row.area === "Tests terrain multi-machines"
      && row.requirement.includes("5 machines physiques");
    const isLinuxPublic = row.area === "Release Linux"
      && row.requirement.includes("release Linux publique");
    return !isPhysicalFieldMissing && !isLinuxPublic;
  });
  const coreProved = coreRows.filter((row) => row.status === "proved").length;
  const corePercent = coreRows.length ? pct((coreProved / coreRows.length) * 100) : 0;
  const fieldPercent = fieldRequired ? pct((fieldReady / fieldRequired) * 100) : 0;
  const technicalPercent = total ? pct((proved / total) * 100) : 0;
  const weightedProductPercent = pct((corePercent * 0.70) + (fieldPercent * 0.20) + (linuxReadinessPercent * 0.10));

  const progress = {
    schema: "outilsia.local_cockpit_goal_progress.v1",
    generated_at: new Date().toISOString(),
    audit: {
      report: auditPath,
      overall_status: audit.overall_status,
      proved,
      missing,
      total,
    },
    scores: {
      technical_proof_percent: technicalPercent,
      core_app_percent: corePercent,
      field_physical_percent: fieldPercent,
      linux_readiness_percent: linuxReadinessPercent,
      weighted_product_percent: weightedProductPercent,
      weights: {
        core_app: 70,
        field_physical: 20,
        linux_readiness: 10,
      },
    },
    field: {
      status_path: fieldStatusPath,
      status: field.status || "unknown",
      required: fieldRequired,
      ready: fieldReady,
      ready_profiles: field.profiles_ready || [],
      missing_profiles: field.profiles_missing || [],
      next_profile: field.next_profile_to_test || "",
    },
    linux: {
      report: linuxPath,
      status: linux.status || "unknown",
      public_status: linuxPublic,
      route_ready: linuxRouteReady,
      kit_ready: linuxKitReady,
      public_release_percent: publicLinuxPercent,
    },
    remaining: rows
      .filter((row) => row.status !== "proved")
      .map((row) => ({
        area: row.area,
        requirement: row.requirement,
        evidence: row.evidence,
        missing: row.missing || [],
      })),
  };

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "_").slice(0, 15);
  const jsonPath = join(reportsRoot, `goal_progress_${stamp}.json`);
  const mdPath = join(reportsRoot, `goal_progress_${stamp}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, markdown(progress), "utf8");
  console.log(
    `goal_progress_report technical=${technicalPercent}% weighted=${weightedProductPercent}% ` +
    `field=${fieldReady}/${fieldRequired} linux=${linuxPublic} json=${rel(jsonPath)} md=${rel(mdPath)}`
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
