#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const reportsRoot = join(repoRoot, "reports");
const desktopRoot = existsSync("/mnt/c/Users/chris/Desktop")
  ? "/mnt/c/Users/chris/Desktop"
  : join(process.env.HOME || ".", "Desktop");
const desktopHtml = join(desktopRoot, "OutilsIA-Local-Cockpit-OBJECTIF-100.html");
const desktopCmd = join(desktopRoot, "OUVRIR-OBJECTIF-100-OUTILSIA.cmd");

function fail(message) {
  throw new Error(message);
}

function readText(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function latest(prefix, ext = ".json") {
  if (!existsSync(reportsRoot)) fail(`missing reports directory: ${reportsRoot}`);
  const file = readdirSync(reportsRoot)
    .filter((name) => name.startsWith(prefix) && name.endsWith(ext))
    .sort()
    .at(-1);
  if (!file) fail(`missing ${prefix}*${ext}`);
  return join(reportsRoot, file);
}

function pct(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rel(path) {
  return path ? path.replace(`${repoRoot}/`, "") : "";
}

function buildReport() {
  const progressPath = latest("goal_progress_");
  const remainingPath = latest("goal_remaining_");
  const closurePath = latest("goal_closure_guard_");
  const progress = readJson(progressPath);
  const remaining = readJson(remainingPath);
  const closure = readJson(closurePath);
  const scores = progress.scores || {};
  const field = progress.field || {};
  const linux = progress.linux || {};
  const ready = Number(field.ready || 0);
  const required = Number(field.required || 5);
  const missingProfiles = Array.isArray(field.missing_profiles) ? field.missing_profiles : [];
  const fieldPercentNow = Number(scores.field_physical_percent || 0);
  const linuxPercentNow = Number(scores.linux_readiness_percent || 0);
  const corePercent = Number(scores.core_app_percent || 0);
  const technicalNow = Number(scores.technical_proof_percent || 0);
  const weightedNow = Number(scores.weighted_product_percent || 0);
  const fieldContributionNow = pct(fieldPercentNow * 0.20);
  const linuxContributionNow = pct(linuxPercentNow * 0.10);
  const coreContributionNow = pct(corePercent * 0.70);
  const fieldGainRemaining = pct(20 - fieldContributionNow);
  const linuxGainRemaining = pct(10 - linuxContributionNow);
  const weightedGainRemaining = pct(100 - weightedNow);
  const technicalGainRemaining = pct(100 - technicalNow);
  const complete = technicalNow === 100
    && weightedNow === 100
    && ready === required
    && linux.public_status === "public_linux_release_current"
    && remaining.missing_count === 0
    && closure.can_call_update_goal_complete === true;
  const blockers = [];
  if (ready !== required) {
    blockers.push({
      area: "Terrain physique",
      current: `${ready}/${required}`,
      gain: `+${fieldGainRemaining} points produit`,
      next: field.next_profile || missingProfiles[0] || "old_laptop",
      proof: "Importer FIELD-TESTS.json avec les 5 profils réels et relancer l'audit.",
    });
  }
  if (linux.public_status !== "public_linux_release_current") {
    blockers.push({
      area: "Linux public",
      current: linux.public_status || "unknown",
      gain: `+${linuxGainRemaining} points produit`,
      next: "release Linux courante",
      proof: "Publier un release.json public avec platform=linux courant, SHA et contrat windows-x64 + linux.",
    });
  }
  if (remaining.missing_count) {
    blockers.push({
      area: "Audit technique",
      current: `${remaining.missing_count} ligne(s) manquante(s)`,
      gain: `+${technicalGainRemaining} points technique`,
      next: "audit_beta_field_goal.py",
      proof: "Les lignes restantes doivent passer de missing à proved.",
    });
  }
  return {
    schema: "outilsia.local_cockpit_goal_100_gate.v1",
    generated_at: new Date().toISOString(),
    complete,
    scores: {
      technical_now: technicalNow,
      technical_target: 100,
      technical_gain_remaining: technicalGainRemaining,
      weighted_now: weightedNow,
      weighted_target: 100,
      weighted_gain_remaining: weightedGainRemaining,
      core_contribution_now: coreContributionNow,
      field_contribution_now: fieldContributionNow,
      field_contribution_target: 20,
      field_gain_remaining: fieldGainRemaining,
      linux_contribution_now: linuxContributionNow,
      linux_contribution_target: 10,
      linux_gain_remaining: linuxGainRemaining,
    },
    field: {
      ready,
      required,
      status: field.status || "unknown",
      ready_profiles: field.ready_profiles || [],
      missing_profiles: missingProfiles,
      next_profile: field.next_profile || "",
      status_path: field.status_path || "",
    },
    linux: {
      status: linux.status || "unknown",
      public_status: linux.public_status || "unknown",
      report: linux.report || "",
    },
    audit: {
      progress_report: progressPath,
      remaining_report: remainingPath,
      closure_guard_report: closurePath,
      remaining_count: remaining.missing_count,
      can_complete: closure.can_call_update_goal_complete === true,
    },
    blockers,
    desktop: {
      html: desktopHtml,
      cmd: desktopCmd,
    },
  };
}

function markdown(report) {
  const lines = [
    "# OutilsIA Local Cockpit - objectif 100%",
    "",
    `- Généré: \`${report.generated_at}\``,
    `- Objectif atteint: **${report.complete ? "oui" : "non"}**`,
    `- Technique: **${report.scores.technical_now}/100**`,
    `- Produit pondéré: **${report.scores.weighted_now}/100**`,
    "",
    "## Formule produit",
    "",
    `- Coeur app: ${report.scores.core_contribution_now}/70`,
    `- Terrain physique: ${report.scores.field_contribution_now}/20`,
    `- Linux: ${report.scores.linux_contribution_now}/10`,
    "",
    "## Delta restant",
    "",
    `- Technique à gagner: ${report.scores.technical_gain_remaining} point(s)`,
    `- Produit à gagner: ${report.scores.weighted_gain_remaining} point(s)`,
    `- Terrain peut encore ajouter: ${report.scores.field_gain_remaining} point(s)`,
    `- Linux peut encore ajouter: ${report.scores.linux_gain_remaining} point(s)`,
    "",
    "## Blocages",
    "",
  ];
  if (!report.blockers.length) {
    lines.push("- Aucun blocage restant.");
  } else {
    for (const blocker of report.blockers) {
      lines.push(`- **${blocker.area}**: ${blocker.current} · ${blocker.gain} · prochain: \`${blocker.next}\``);
      lines.push(`  Preuve attendue: ${blocker.proof}`);
    }
  }
  lines.push(
    "",
    "## Sources",
    "",
    `- Progress: \`${rel(report.audit.progress_report)}\``,
    `- Remaining: \`${rel(report.audit.remaining_report)}\``,
    `- Closure guard: \`${rel(report.audit.closure_guard_report)}\``,
    "- FIELD-TESTS.json: preuve terrain physique multi-machines.",
    "- release.json public: preuve de publication Windows + Linux.",
    ""
  );
  return lines.join("\n");
}

function html(report) {
  const cards = report.blockers.length
    ? report.blockers.map((blocker) => `
      <article class="card">
        <span>${esc(blocker.area)}</span>
        <strong>${esc(blocker.current)}</strong>
        <p>${esc(blocker.gain)}</p>
        <code>${esc(blocker.next)}</code>
        <p>${esc(blocker.proof)}</p>
      </article>
    `).join("")
    : `<article class="card ok"><span>Objectif</span><strong>100%</strong><p>Tous les gates sont prouvés.</p></article>`;
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OutilsIA Local Cockpit - Objectif 100%</title>
  <style>
    :root{--ink:#172033;--muted:#66758a;--line:#dbe4ef;--soft:#f5f8fc;--blue:#12335e;--green:#19735b;--red:#b42318;--amber:#9a5a00;--shadow:0 16px 44px rgba(28,43,68,.10)}
    *{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:var(--ink);background:#edf2f8;line-height:1.5}
    main{width:min(1080px,calc(100% - 28px));margin:28px auto}
    header,section{background:white;border:1px solid var(--line);border-radius:14px;padding:24px;margin-bottom:14px;box-shadow:var(--shadow)}
    header{background:var(--blue);color:white;padding:32px 36px}.eyebrow{margin:0 0 8px;text-transform:uppercase;letter-spacing:.08em;font-size:12px;opacity:.82}
    h1{margin:0;font-size:34px;letter-spacing:0}.lead{font-size:17px;max-width:820px}
    .scoregrid,.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .score,.card{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:18px}.score span,.card span{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;font-weight:800}
    .score strong,.card strong{display:block;font-size:34px;margin:4px 0}.card strong{font-size:24px}.ok strong{color:var(--green)}.bad strong{color:var(--red)}
    code{display:inline-block;font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}
    table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}th{background:#f5f8fc;color:var(--muted);text-transform:uppercase;font-size:12px}
    @media(max-width:860px){.scoregrid,.grid{grid-template-columns:1fr}header,section{padding:22px}h1{font-size:28px}}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">OutilsIA Local Cockpit</p>
    <h1>Objectif 100%</h1>
    <p class="lead">Ce rapport ne remplace pas les preuves. Il indique exactement ce qui manque pour passer technique et produit pondéré à 100%.</p>
  </header>
  <section class="scoregrid">
    <div class="score ${report.scores.technical_now === 100 ? "ok" : "bad"}"><span>Technique</span><strong>${esc(report.scores.technical_now)}/100</strong><p>Reste ${esc(report.scores.technical_gain_remaining)} point(s).</p></div>
    <div class="score ${report.scores.weighted_now === 100 ? "ok" : "bad"}"><span>Produit pondéré</span><strong>${esc(report.scores.weighted_now)}/100</strong><p>Reste ${esc(report.scores.weighted_gain_remaining)} point(s).</p></div>
    <div class="score ${report.complete ? "ok" : "bad"}"><span>Clôture</span><strong>${report.complete ? "OK" : "Bloquée"}</strong><p>${report.complete ? "update_goal possible." : "update_goal interdit."}</p></div>
  </section>
  <section>
    <h2>Formule du 82 -> 100</h2>
    <table>
      <tr><th>Bloc</th><th>Actuel</th><th>Cible</th><th>Reste</th></tr>
      <tr><td>Coeur app</td><td>${esc(report.scores.core_contribution_now)}/70</td><td>70/70</td><td>0</td></tr>
      <tr><td>Terrain physique</td><td>${esc(report.scores.field_contribution_now)}/20</td><td>20/20</td><td>${esc(report.scores.field_gain_remaining)}</td></tr>
      <tr><td>Linux public</td><td>${esc(report.scores.linux_contribution_now)}/10</td><td>10/10</td><td>${esc(report.scores.linux_gain_remaining)}</td></tr>
    </table>
  </section>
  <section>
    <h2>Blocages restants</h2>
    <div class="grid">${cards}</div>
  </section>
  <section>
    <h2>Sources</h2>
    <p><code>${esc(rel(report.audit.progress_report))}</code></p>
    <p><code>${esc(rel(report.audit.remaining_report))}</code></p>
    <p><code>${esc(rel(report.audit.closure_guard_report))}</code></p>
  </section>
</main>
</body>
</html>`;
}

function main() {
  mkdirSync(reportsRoot, { recursive: true });
  const report = buildReport();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "_").slice(0, 15);
  const jsonPath = join(reportsRoot, `goal_100_gate_${stamp}.json`);
  const mdPath = join(reportsRoot, `goal_100_gate_${stamp}.md`);
  const htmlPath = join(reportsRoot, `goal_100_gate_${stamp}.html`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, markdown(report), "utf8");
  writeFileSync(htmlPath, html(report), "utf8");
  writeFileSync(desktopHtml, html(report), "utf8");
  writeFileSync(desktopCmd, [
    "@echo off",
    "set \"HTML=%USERPROFILE%\\Desktop\\OutilsIA-Local-Cockpit-OBJECTIF-100.html\"",
    "if exist \"%HTML%\" start \"\" \"%HTML%\"",
    "if not exist \"%HTML%\" echo Relancez npm run report:goal-100 dans local-cockpit-app.",
    "pause",
    "",
  ].join("\r\n"), "utf8");
  console.log(
    `goal_100_report complete=${report.complete ? "yes" : "no"} ` +
    `technical=${report.scores.technical_now}/100 weighted=${report.scores.weighted_now}/100 ` +
    `field=${report.field.ready}/${report.field.required} linux=${report.linux.public_status} ` +
    `html=${rel(htmlPath)} desktop=${desktopHtml}`
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
