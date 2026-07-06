#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const reportsRoot = join(repoRoot, "reports");
const desktopRoot = existsSync("/mnt/c/Users/chris/Desktop") ? "/mnt/c/Users/chris/Desktop" : join(process.env.HOME || ".", "Desktop");
const fieldKitRoot = join(desktopRoot, "OutilsIA-Local-Cockpit-Field-Test-Kit");
const linuxKitRoot = join(desktopRoot, "OutilsIA-Local-Cockpit-Linux-Build-Kit");
const dashboardDesktopHtml = join(desktopRoot, "OutilsIA-Local-Cockpit-GOAL-DASHBOARD.html");
const dashboardDesktopCmd = join(desktopRoot, "OUVRIR-GOAL-DASHBOARD-OUTILSIA.cmd");
const blockersDesktopHtml = join(desktopRoot, "OutilsIA-Local-Cockpit-BLOCAGES-RESTANTS.html");
const blockersDesktopCmd = join(desktopRoot, "OUVRIR-BLOCAGES-RESTANTS-OUTILSIA.cmd");
const nextPackDesktopCmd = join(desktopRoot, "OUVRIR-PACK-OLD-LAPTOP-OUTILSIA.cmd");
const missingPackLauncherManifest = join(desktopRoot, "OutilsIA-Missing-Pack-Launchers.json");

function fail(message) {
  throw new Error(message);
}

function readText(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

function readJson(path) {
  if (!existsSync(path)) fail(`missing json: ${path}`);
  return JSON.parse(readText(path));
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

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function runGuard() {
  const result = spawnSync("npm", ["run", "verify:goal-closure"], {
    cwd: appRoot,
    encoding: "utf8",
  });
  const output = `${result.stdout}${result.stderr}`.trim();
  const jsonMatch = output.match(/json=([^ ]+)/);
  const mdMatch = output.match(/md=([^ \n]+)/);
  const jsonPath = jsonMatch ? resolve(repoRoot, jsonMatch[1]) : "";
  const mdPath = mdMatch ? resolve(repoRoot, mdMatch[1]) : "";
  return {
    exit_code: result.status ?? 1,
    output,
    blocks_completion: result.status !== 0 && output.includes("GOAL_CLOSURE_BLOCKED"),
    json_path: jsonPath,
    md_path: mdPath,
  };
}

function loadOptionalJson(path, fallback = {}) {
  return existsSync(path) ? readJson(path) : fallback;
}

function buildDashboard() {
  const progressPath = latest("goal_progress_");
  const remainingPath = latest("goal_remaining_");
  const auditPath = latest("beta_field_goal_audit_");
  const closurePath = latest("goal_closure_guard_");
  const linuxPath = latest("local_cockpit_linux_readiness_");
  const fieldStatusPath = join(fieldKitRoot, "FIELD-TESTS-STATUS.json");
  const fieldExpressPath = join(fieldKitRoot, "TEST-EXPRESS-PROCHAIN-PC.html");
  const fieldExpressCmdPath = join(fieldKitRoot, "OUVRIR-TEST-EXPRESS.cmd");
  const nextPackPath = join(fieldKitRoot, "NEXT-PC-PACK.json");
  const missingPacksPath = join(fieldKitRoot, "MISSING-PC-PACKS.json");
  const missingMissionPath = join(fieldKitRoot, "MISSING-PC-MISSION.html");
  const missingMissionJsonPath = join(fieldKitRoot, "MISSING-PC-MISSION.json");
  const linuxNextActionPath = join(linuxKitRoot, "PROCHAINE-ACTION-LINUX.html");
  const linuxNextActionMarkdownPath = join(linuxKitRoot, "PROCHAINE-ACTION-LINUX.md");
  const linuxNextActionCmdPath = join(linuxKitRoot, "OUVRIR-PROCHAINE-ACTION-LINUX.cmd");
  const linuxPublicationChecklistPath = join(linuxKitRoot, "LINUX-PUBLICATION-CHECKLIST.html");
  const linuxPublicationChecklistMarkdownPath = join(linuxKitRoot, "LINUX-PUBLICATION-CHECKLIST.md");
  const linuxPublicationChecklistJsonPath = join(linuxKitRoot, "LINUX-PUBLICATION-CHECKLIST.json");
  const linuxPublicationChecklistCmdPath = join(linuxKitRoot, "OUVRIR-CHECKLIST-PUBLICATION-LINUX.cmd");

  const progress = progressPath ? readJson(progressPath) : {};
  const remaining = remainingPath ? readJson(remainingPath) : {};
  const audit = auditPath ? readJson(auditPath) : {};
  const linux = linuxPath ? readJson(linuxPath) : {};
  const field = loadOptionalJson(fieldStatusPath, {});
  const nextPack = loadOptionalJson(nextPackPath, {});
  const missingPacks = loadOptionalJson(missingPacksPath, {});
  const guardRun = runGuard();
  const liveClosurePath = guardRun.json_path && existsSync(guardRun.json_path) ? guardRun.json_path : closurePath;
  const closure = liveClosurePath ? readJson(liveClosurePath) : {};

  const nextProfile = field.next_profile_to_test || progress.field?.next_profile || nextPack.profile || "old_laptop";
  const missingProfiles = field.profiles_missing || progress.field?.missing_profiles || [];
  const readyProfiles = field.profiles_ready || progress.field?.ready_profiles || [];
  const nextZip = nextPack.zip || "";
  const nextZipSha = nextPack.zip_sha256 || "";
  const nextZipShaFile = nextPack.zip_sha256_file || "";
  const missingPackLaunchers = Array.isArray(missingPacks.packs)
    ? missingPacks.packs.map((pack) => ({
      profile: pack.profile,
      zip: pack.zip,
      zip_sha256: pack.zip_sha256,
      zip_sha256_file: pack.zip_sha256_file,
      dir: pack.dir,
      launcher: join(desktopRoot, `OUVRIR-PACK-${String(pack.profile || "").toUpperCase().replaceAll("_", "-")}-OUTILSIA.cmd`),
    }))
    : [];

  return {
    schema: "outilsia.local_cockpit_goal_dashboard.v1",
    generated_at: new Date().toISOString(),
    status: audit.overall_status || progress.audit?.overall_status || "unknown",
    scores: progress.scores || {},
    proof: {
      audit_report: rel(auditPath),
      progress_report: rel(progressPath),
      remaining_report: rel(remainingPath),
      closure_guard_report: rel(liveClosurePath),
      closure_guard_live_report: rel(guardRun.json_path),
      closure_guard_live_markdown: rel(guardRun.md_path),
      linux_report: rel(linuxPath),
      audit_proved: audit.summary?.proved ?? remaining.proved ?? null,
      audit_missing: audit.summary?.missing ?? remaining.missing_count ?? null,
    },
    guard: {
      last_report_decision: closure.decision || "unknown",
      last_report_can_complete: closure.can_call_update_goal_complete === true,
      live_exit_code: guardRun.exit_code,
      live_blocks_completion: guardRun.blocks_completion,
      live_output: guardRun.output,
      live_json_path: rel(guardRun.json_path),
      live_md_path: rel(guardRun.md_path),
    },
    field: {
      status: field.status || progress.field?.status || "unknown",
      ready: readyProfiles.length || progress.field?.ready || 0,
      required: Array.isArray(field.profiles_required) ? field.profiles_required.length : (progress.field?.required || 5),
      ready_profiles: readyProfiles,
      missing_profiles: missingProfiles,
      incomplete_profiles: field.profiles_incomplete || [],
      next_profile: nextProfile,
      next_pack_zip: nextZip,
      next_pack_sha256: nextZipSha,
      next_pack_sha256_file: nextZipShaFile,
      express_test: fieldExpressPath,
      express_test_cmd: fieldExpressCmdPath,
      express_test_exists: existsSync(fieldExpressPath) && existsSync(fieldExpressCmdPath),
      missing_pc_mission: missingMissionPath,
      missing_pc_mission_json: missingMissionJsonPath,
      missing_pc_mission_exists: existsSync(missingMissionPath),
      missing_pack_count: Array.isArray(missingPacks.packs) ? missingPacks.packs.length : 0,
      missing_pack_launchers: missingPackLaunchers,
      missing_pack_launcher_manifest: missingPackLauncherManifest,
      field_status_path: fieldStatusPath,
      field_kit_root: fieldKitRoot,
    },
    linux: {
      status: linux.status || progress.linux?.status || "unknown",
      public_status: linux.public_status || progress.linux?.public_status || "unknown",
      missing_prerequisites: linux.missing_prerequisites || [],
      route_ready: progress.linux?.route_ready === true || linux.linux_release_path_ok === true,
      kit_ready: progress.linux?.kit_ready === true || linux.build_kit?.exists === true,
      next_action: linuxNextActionPath,
      next_action_markdown: linuxNextActionMarkdownPath,
      next_action_cmd: linuxNextActionCmdPath,
      next_action_exists: existsSync(linuxNextActionPath) && existsSync(linuxNextActionMarkdownPath) && existsSync(linuxNextActionCmdPath),
      publication_checklist: linuxPublicationChecklistPath,
      publication_checklist_markdown: linuxPublicationChecklistMarkdownPath,
      publication_checklist_json: linuxPublicationChecklistJsonPath,
      publication_checklist_cmd: linuxPublicationChecklistCmdPath,
      publication_checklist_exists: existsSync(linuxPublicationChecklistPath) && existsSync(linuxPublicationChecklistMarkdownPath) && existsSync(linuxPublicationChecklistJsonPath) && existsSync(linuxPublicationChecklistCmdPath),
    },
    blockers: {
      html: blockersDesktopHtml,
      cmd: blockersDesktopCmd,
      exists: existsSync(blockersDesktopHtml) && existsSync(blockersDesktopCmd),
      completion_rule: "Ne pas marquer le goal complet tant que field=5/5 et Linux public courant ne sont pas prouvés.",
    },
    next_actions: [
      existsSync(fieldExpressPath) ? `Ouvrir le test express du prochain PC: ${fieldExpressPath}` : "Regénérer le kit terrain pour obtenir TEST-EXPRESS-PROCHAIN-PC.html.",
      `Tester le profil physique ${nextProfile}.`,
      existsSync(missingMissionPath) ? `Ouvrir la mission 4 PC restants: ${missingMissionPath}` : "Regénérer MISSING-PC-MISSION avec npm run kit:field.",
      nextZip ? `Copier ou ouvrir le pack: ${nextZip}` : "Regénérer le pack prochain PC avec npm run kit:field.",
      "Exporter la fiche terrain depuis le PC testé, puis l'importer dans le kit principal.",
      "Quand les 5 profils sont prêts, assembler/importer FIELD-TESTS.json puis relancer audit et guard.",
      existsSync(linuxNextActionPath) ? `Pour Linux, ouvrir la prochaine action: ${linuxNextActionPath}` : "Regénérer le kit Linux pour obtenir PROCHAINE-ACTION-LINUX.",
      "Garder Linux public après le cycle Windows terrain, sauf si l'artefact GitHub Actions courant est prêt avant.",
    ],
  };
}

function markdown(report) {
  const lines = [
    "# OutilsIA Local Cockpit - Goal Dashboard",
    "",
    `- Généré: \`${report.generated_at}\``,
    `- Statut: \`${report.status}\``,
    `- Preuve technique: **${report.scores.technical_proof_percent ?? "?"}%**`,
    `- Readiness produit: **${report.scores.weighted_product_percent ?? "?"}%**`,
    `- Preuves OK: **${report.proof.audit_proved ?? "?"}**`,
    `- Manques: **${report.proof.audit_missing ?? "?"}**`,
    `- Guard live: \`${report.guard.live_output || "unknown"}\``,
    "",
    "## Prochain test physique",
    "",
    `- Profil: **${report.field.next_profile}**`,
    `- Terrain: **${report.field.ready}/${report.field.required}**`,
    `- Prêts: ${report.field.ready_profiles.join(", ") || "aucun"}`,
    `- Manquants: ${report.field.missing_profiles.join(", ") || "aucun"}`,
    `- Test express: \`${report.field.express_test_exists ? report.field.express_test : "à générer"}\``,
    `- Lanceur express: \`${report.field.express_test_exists ? report.field.express_test_cmd : "à générer"}\``,
    `- Pack: \`${report.field.next_pack_zip || "à générer"}\``,
    `- SHA256: \`${report.field.next_pack_sha256 || "n/a"}\``,
    `- Mission 4 PC: \`${report.field.missing_pc_mission_exists ? report.field.missing_pc_mission : "à générer"}\``,
    `- Lanceurs packs prêts: **${report.field.missing_pack_launchers.length}**`,
    ...report.field.missing_pack_launchers.map((launcher) => `  - ${launcher.profile}: \`${launcher.launcher}\``),
    "",
    "## Linux",
    "",
    `- Public: \`${report.linux.public_status}\``,
    `- Route prête: ${report.linux.route_ready ? "oui" : "non"}`,
    `- Kit prêt: ${report.linux.kit_ready ? "oui" : "non"}`,
    `- Prochaine action: \`${report.linux.next_action_exists ? report.linux.next_action : "à générer"}\``,
    `- Checklist publication: \`${report.linux.publication_checklist_exists ? report.linux.publication_checklist : "à générer"}\``,
    `- Dépendances manquantes: ${report.linux.missing_prerequisites.join(", ") || "aucune"}`,
    "",
    "## Blocages restants",
    "",
    `- Panneau: \`${report.blockers.html}\``,
    `- Lanceur: \`${report.blockers.cmd}\``,
    `- Règle: ${report.blockers.completion_rule}`,
    "",
    "## Actions",
    "",
    ...report.next_actions.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Sources",
    "",
    `- Audit: \`${report.proof.audit_report}\``,
    `- Progression: \`${report.proof.progress_report}\``,
    `- Restes: \`${report.proof.remaining_report}\``,
    `- Guard: \`${report.proof.closure_guard_report}\``,
    `- Guard live: \`${report.proof.closure_guard_live_report || "n/a"}\``,
    `- Statut terrain: \`${report.field.field_status_path}\``,
    "",
  ];
  return lines.join("\n");
}

function html(report) {
  const actions = report.next_actions.map((item, index) => `<li><strong>${index + 1}.</strong> ${esc(item)}</li>`).join("");
  const packLauncherRows = report.field.missing_pack_launchers.length
    ? report.field.missing_pack_launchers.map((launcher) => `
      <li><strong>${esc(launcher.profile)}</strong><br><span class="code">${esc(launcher.launcher)}</span></li>
    `).join("")
    : "<li>Aucun launcher de pack généré. Relancer npm run report:goal-dashboard après npm run kit:field.</li>";
  const missingDeps = report.linux.missing_prerequisites.length
    ? report.linux.missing_prerequisites.map((item) => `<li>${esc(item)}</li>`).join("")
    : "<li>Aucune dépendance manquante signalée.</li>";
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OutilsIA Local Cockpit - Goal Dashboard</title>
  <style>
    body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:0;background:#f5f7fb;color:#101828}
    main{max-width:1120px;margin:0 auto;padding:28px}
    h1{font-size:30px;margin:0 0 8px} h2{font-size:18px;margin:0 0 12px}
    .muted{color:#667085}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}
    .card{background:white;border:1px solid #d0d5dd;border-radius:8px;padding:16px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
    .big{font-size:28px;font-weight:750}.danger{color:#b42318}.ok{color:#067647}.warn{color:#b54708}
    .wide{grid-column:span 2}.full{grid-column:1/-1}.code{font-family:Consolas,monospace;background:#f2f4f7;border-radius:6px;padding:8px;overflow-wrap:anywhere}
    ul{margin:8px 0 0;padding-left:20px} li{margin:7px 0}.pill{display:inline-block;border:1px solid #d0d5dd;border-radius:999px;padding:4px 9px;background:#fff;margin:2px 4px 2px 0}
    @media(max-width:860px){.grid{grid-template-columns:1fr}.wide{grid-column:auto}}
  </style>
</head>
<body><main>
  <p class="muted">Généré ${esc(report.generated_at)}</p>
  <h1>OutilsIA Local Cockpit - Goal Dashboard</h1>
  <p>Décision actuelle: <strong class="${report.guard.live_blocks_completion ? "danger" : "ok"}">${esc(report.guard.live_output || report.status)}</strong></p>
  <section class="grid">
    <div class="card"><h2>Preuve technique</h2><div class="big">${esc(report.scores.technical_proof_percent ?? "?")}%</div><p class="muted">${esc(report.proof.audit_proved ?? "?")} preuves OK</p></div>
    <div class="card"><h2>Readiness produit</h2><div class="big">${esc(report.scores.weighted_product_percent ?? "?")}%</div><p class="muted">pondéré terrain/Linux</p></div>
    <div class="card"><h2>Terrain</h2><div class="big ${report.field.ready === report.field.required ? "ok" : "warn"}">${esc(report.field.ready)}/${esc(report.field.required)}</div><p class="muted">${esc(report.field.status)}</p></div>
    <div class="card"><h2>Linux public</h2><div class="big ${report.linux.public_status === "public_linux_release_current" ? "ok" : "danger"}">${esc(report.linux.public_status)}</div></div>
    <div class="card wide"><h2>Prochain PC physique</h2><p class="big">${esc(report.field.next_profile)}</p><p>Manquants: ${report.field.missing_profiles.map((item) => `<span class="pill">${esc(item)}</span>`).join("") || "aucun"}</p></div>
    <div class="card wide"><h2>Test express prochain PC</h2><p>Entrée courte à ouvrir avant de déplacer le kit sur la machine suivante.</p><p class="code">${esc(report.field.express_test_exists ? report.field.express_test : "à générer avec npm run kit:field")}</p><p class="muted">${esc(report.field.express_test_exists ? report.field.express_test_cmd : "")}</p></div>
    <div class="card wide"><h2>Pack à utiliser</h2><div class="code">${esc(report.field.next_pack_zip || "à générer")}</div><p class="muted">SHA256: ${esc(report.field.next_pack_sha256 || "n/a")}</p></div>
    <div class="card full"><h2>Mission 4 PC restants</h2><p>Ouvrir ce fichier avant de déplacer les zips terrain.</p><p class="code">${esc(report.field.missing_pc_mission_exists ? report.field.missing_pc_mission : "à générer avec npm run kit:field")}</p></div>
    <div class="card full"><h2>Lanceurs packs terrain prêts</h2><p>Un lanceur par PC physique restant, avec vérification SHA256 avant ouverture.</p><ul>${packLauncherRows}</ul></div>
    <div class="card full"><h2>Blocages restants</h2><p>Un panneau de reprise dédié résume les deux seules preuves manquantes avant clôture.</p><p class="code">${esc(report.blockers.html)}</p><p class="muted">${esc(report.blockers.completion_rule)}</p></div>
    <div class="card full"><h2>Actions</h2><ul>${actions}</ul></div>
    <div class="card wide"><h2>Linux - dépendances manquantes</h2><ul>${missingDeps}</ul></div>
    <div class="card wide"><h2>Linux - prochaine action</h2><p>Le Linux public reste manquant tant qu'un artefact courant n'est pas importé puis publié.</p><p class="code">${esc(report.linux.next_action_exists ? report.linux.next_action : "à générer avec npm run kit:linux")}</p></div>
    <div class="card full"><h2>Linux - checklist publication</h2><p>Contrat final après téléchargement de l'artefact GitHub Actions : import, vérification Windows+Linux, publication et audit.</p><p class="code">${esc(report.linux.publication_checklist_exists ? report.linux.publication_checklist : "à générer avec npm run kit:linux")}</p></div>
    <div class="card wide"><h2>Sources</h2>
      <p class="code">${esc(report.proof.audit_report)}</p>
      <p class="code">${esc(report.proof.remaining_report)}</p>
      <p class="code">${esc(report.proof.closure_guard_report)}</p>
      <p class="code">${esc(report.proof.closure_guard_live_report || "")}</p>
    </div>
  </section>
</main></body></html>`;
}

function windowsPath(path) {
  if (path.startsWith("/mnt/c/")) return `C:\\${path.slice("/mnt/c/".length).replaceAll("/", "\\")}`;
  return path;
}

function dashboardLauncher() {
  return [
    "@echo off",
    "setlocal",
    "title OutilsIA Local Cockpit - Goal Dashboard",
    `set "DASHBOARD=${windowsPath(dashboardDesktopHtml)}"`,
    "if not exist \"%DASHBOARD%\" (",
    "  echo Dashboard introuvable: %DASHBOARD%",
    "  echo Relancez npm run report:goal-dashboard dans local-cockpit-app.",
    "  pause",
    "  exit /b 1",
    ")",
    "start \"\" \"%DASHBOARD%\"",
    "",
  ].join("\r\n");
}

function blockersHtml(report) {
  const missingProfiles = report.field.missing_profiles
    .map((item) => `<span class="pill">${esc(item)}</span>`)
    .join("");
  const missingDeps = report.linux.missing_prerequisites.length
    ? report.linux.missing_prerequisites.map((item) => `<li>${esc(item)}</li>`).join("")
    : "<li>Aucune dépendance manquante signalée.</li>";
  const fieldDone = report.field.ready === report.field.required;
  const linuxDone = report.linux.public_status === "public_linux_release_current";
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OutilsIA Local Cockpit - Blocages restants</title>
  <style>
    body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:0;background:#f6f7fb;color:#101828}
    main{max-width:1040px;margin:0 auto;padding:30px}
    h1{font-size:31px;margin:0 0 8px} h2{font-size:18px;margin:0 0 12px}
    .muted{color:#667085}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:20px}
    .card{background:#fff;border:1px solid #d0d5dd;border-radius:8px;padding:18px;box-shadow:0 1px 2px rgba(16,24,40,.05)}
    .full{grid-column:1/-1}.big{font-size:34px;font-weight:760}.ok{color:#067647}.warn{color:#b54708}.danger{color:#b42318}
    .code{font-family:Consolas,monospace;background:#f2f4f7;border-radius:6px;padding:9px;overflow-wrap:anywhere}
    .pill{display:inline-block;border:1px solid #d0d5dd;border-radius:999px;padding:4px 9px;background:#fff;margin:2px 4px 2px 0}
    li{margin:7px 0}@media(max-width:760px){.grid{grid-template-columns:1fr}.full{grid-column:auto}}
  </style>
</head>
<body><main>
  <p class="muted">Généré ${esc(report.generated_at)}</p>
  <h1>Blocages restants OutilsIA</h1>
  <p>Ce panneau est le point de reprise du gros goal. Ne pas marquer le goal complet tant que <strong>field=5/5</strong> et <strong>Linux public courant</strong> ne sont pas prouvés.</p>
  <section class="grid">
    <div class="card">
      <h2>1. Tests physiques</h2>
      <div class="big ${fieldDone ? "ok" : "warn"}">${esc(report.field.ready)}/${esc(report.field.required)}</div>
      <p>Prochain PC: <strong>${esc(report.field.next_profile)}</strong></p>
      <p>Manquants: ${missingProfiles || "aucun"}</p>
      <p class="code">${esc(report.field.express_test)}</p>
      <p class="code">${esc(report.field.missing_pc_mission)}</p>
      <p class="code">${esc(report.field.next_pack_zip || "Pack à générer")}</p>
    </div>
    <div class="card">
      <h2>2. Release Linux publique</h2>
      <div class="big ${linuxDone ? "ok" : "danger"}">${esc(report.linux.public_status)}</div>
      <p>Le chemin recommandé reste GitHub Actions tant que les dépendances locales sont absentes.</p>
      <p class="code">${esc(report.linux.next_action)}</p>
      <ul>${missingDeps}</ul>
    </div>
    <div class="card full">
      <h2>Ordre strict</h2>
      <ol>
        <li>Ouvrir <strong>MISSING-PC-MISSION.html</strong>, tester les 4 profils manquants et importer FIELD-TESTS.json.</li>
        <li>Ouvrir <strong>PROCHAINE-ACTION-LINUX.html</strong>, importer un artefact Linux courant ou publier via le workflow cross-platform.</li>
        <li>Relancer audit, progression, dashboard et guard. Si le guard bloque encore, le goal reste ouvert.</li>
      </ol>
      <p class="code">${esc(report.blockers.completion_rule)}</p>
    </div>
  </section>
</main></body></html>`;
}

function blockersLauncher() {
  return [
    "@echo off",
    "setlocal",
    "title OutilsIA Local Cockpit - Blocages restants",
    `set "BLOCKERS=${windowsPath(blockersDesktopHtml)}"`,
    `set "DASHBOARD=${windowsPath(dashboardDesktopHtml)}"`,
    "if not exist \"%BLOCKERS%\" (",
    "  echo Panneau blocages introuvable: %BLOCKERS%",
    "  echo Relancez npm run report:goal-dashboard dans local-cockpit-app.",
    "  pause",
    "  exit /b 1",
    ")",
    "start \"\" \"%BLOCKERS%\"",
    "if exist \"%DASHBOARD%\" start \"\" \"%DASHBOARD%\"",
    "",
  ].join("\r\n");
}

function packLauncher(profile, zip, zipSha, targetDir) {
  return [
    "@echo off",
    "setlocal",
    `title OutilsIA - Pack terrain ${profile}`,
    `set "PACK_ZIP=${zip}"`,
    `set "PACK_SHA=${zipSha}"`,
    `set "PACK_DIR=${targetDir}"`,
    "if not exist \"%PACK_ZIP%\" (",
    "  echo Pack introuvable: %PACK_ZIP%",
    "  echo Relancez npm run kit:field puis npm run report:goal-dashboard.",
    "  pause",
    "  exit /b 1",
    ")",
    "if not exist \"%PACK_SHA%\" (",
    "  echo SHA256 introuvable: %PACK_SHA%",
    "  echo Relancez npm run kit:field puis npm run report:goal-dashboard.",
    "  pause",
    "  exit /b 1",
    ")",
    "set \"EXPECTED_SHA=\"",
    "set \"ACTUAL_SHA=\"",
    "for /f \"usebackq tokens=1\" %%H in (\"%PACK_SHA%\") do if not defined EXPECTED_SHA set \"EXPECTED_SHA=%%H\"",
    "for /f \"tokens=1\" %%H in ('certutil -hashfile \"%PACK_ZIP%\" SHA256 ^| findstr /r \"^[0-9A-Fa-f][0-9A-Fa-f]*$\"') do if not defined ACTUAL_SHA set \"ACTUAL_SHA=%%H\"",
    "if not defined EXPECTED_SHA (",
    "  echo SHA256 attendu illisible: %PACK_SHA%",
    "  pause",
    "  exit /b 1",
    ")",
    "if not defined ACTUAL_SHA (",
    "  echo Calcul SHA256 impossible avec certutil.",
    "  pause",
    "  exit /b 1",
    ")",
    "if /I not \"%EXPECTED_SHA%\"==\"%ACTUAL_SHA%\" (",
    "  echo SHA256 incorrect pour %PACK_ZIP%",
    "  echo Attendu: %EXPECTED_SHA%",
    "  echo Obtenu : %ACTUAL_SHA%",
    "  pause",
    "  exit /b 1",
    ")",
    "echo Hash SHA256 OK: %ACTUAL_SHA%",
    "echo.",
    `echo Pack ${profile} prêt:`,
    "echo %PACK_ZIP%",
    "echo.",
    "echo SHA256 attendu: & type \"%PACK_SHA%\"",
    "echo.",
    "start \"\" explorer.exe /select,\"%PACK_ZIP%\"",
    "if exist \"%PACK_DIR%\" start \"\" \"%PACK_DIR%\"",
    "start \"\" notepad.exe \"%PACK_SHA%\"",
    "",
  ].join("\r\n");
}

function nextPackLauncher(report) {
  const zip = report.field.next_pack_zip || "C:\\Users\\chris\\Desktop\\OutilsIA-Next-PC-old_laptop.zip";
  const zipSha = report.field.next_pack_sha256_file || `${zip}.sha256.txt`;
  const targetDir = zip.replace(/\.zip$/i, "");
  return packLauncher("old_laptop", zip, zipSha, targetDir);
}

function writeMissingPackLaunchers(report) {
  const launchers = report.field.missing_pack_launchers || [];
  for (const launcher of launchers) {
    writeFileSync(
      launcher.launcher,
      packLauncher(launcher.profile, launcher.zip, launcher.zip_sha256_file || `${launcher.zip}.sha256.txt`, launcher.dir || String(launcher.zip || "").replace(/\.zip$/i, "")),
      "utf8",
    );
  }
  writeFileSync(missingPackLauncherManifest, `${JSON.stringify({
    schema: "outilsia.local_cockpit_missing_pack_launchers.v1",
    generated_at: new Date().toISOString(),
    count: launchers.length,
    launchers,
  }, null, 2)}\n`, "utf8");
}

function main() {
  mkdirSync(reportsRoot, { recursive: true });
  const report = buildDashboard();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "_").slice(0, 15);
  const jsonPath = join(reportsRoot, `goal_dashboard_${stamp}.json`);
  const mdPath = join(reportsRoot, `goal_dashboard_${stamp}.md`);
  const htmlPath = join(reportsRoot, `goal_dashboard_${stamp}.html`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, markdown(report), "utf8");
  writeFileSync(htmlPath, html(report), "utf8");
  writeFileSync(dashboardDesktopHtml, html(report), "utf8");
  writeFileSync(dashboardDesktopCmd, dashboardLauncher(), "utf8");
  writeFileSync(blockersDesktopHtml, blockersHtml(report), "utf8");
  writeFileSync(blockersDesktopCmd, blockersLauncher(), "utf8");
  writeFileSync(nextPackDesktopCmd, nextPackLauncher(report), "utf8");
  writeMissingPackLaunchers(report);
  console.log(
    `goal_dashboard_report status=${report.status} field=${report.field.ready}/${report.field.required} ` +
    `next=${report.field.next_profile} linux=${report.linux.public_status} html=${rel(htmlPath)} desktop=${dashboardDesktopHtml} cmd=${dashboardDesktopCmd} blockers=${blockersDesktopHtml} pack_cmd=${nextPackDesktopCmd} missing_pc_pack_launchers_ready=${report.field.missing_pack_launchers.length}`
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
