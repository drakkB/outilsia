#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_PROFILES } from "./import-field-tests.mjs";
import { validateSingleFieldEntry } from "./validate-single-field-entry.mjs";
import { verifyShareReport } from "./verify-share-report.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopKit = existsSync("/mnt/c/Users/chris/Desktop")
  ? "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Field-Test-Kit"
  : join(process.env.HOME || ".", "Desktop", "OutilsIA-Local-Cockpit-Field-Test-Kit");
const defaultDir = join(desktopKit, "entries");
const defaultOut = join(desktopKit, "FIELD-TESTS-STATUS.json");
const fieldKitManifest = join(desktopKit, "FIELD-KIT-MANIFEST.txt");

function usage() {
  console.log(`Usage:
  node scripts/report-field-test-status.mjs [--dir entries] [--out FIELD-TESTS-STATUS.json] [--fail-on-incomplete] [--offline]

Reads single-machine field-test exports and reports:
  - profiles present;
  - profiles missing;
  - incomplete fields per profile;
  - next machine to test;
  - shared /r/ report network proof, unless --offline is used.`);
}

function parseArgs(argv) {
  const opts = { dir: defaultDir, out: defaultOut, failOnIncomplete: false, offline: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--dir") {
      opts.dir = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--out") {
      opts.out = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--fail-on-incomplete") {
      opts.failOnIncomplete = true;
      continue;
    }
    if (arg === "--offline") {
      opts.offline = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function candidateFilesFromDir(dir) {
  const entries = [];
  if (!existsSync(dir)) return entries;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const child of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, child.name);
      if (child.isDirectory()) stack.push(path);
      else if (child.isFile() && child.name.toLowerCase().endsWith(".json")) entries.push(path);
    }
  }
  return entries.sort();
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function looksLikeFieldEntry(value) {
  return isObject(value) && typeof value.profile === "string";
}

function readKitManifest() {
  if (!existsSync(fieldKitManifest)) return {};
  const out = {};
  for (const line of readFileSync(fieldKitManifest, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) out[match[1].trim()] = match[2].trim();
  }
  return out;
}

function inferLegacyMetadata(entry, buildId, appVersion) {
  const manifest = readKitManifest();
  const expectedBuild = String(manifest.build_id || "").trim();
  const expectedVersion = String(manifest.version || "").trim();
  const notes = String(entry.notes || "");
  const explicitlyMentionsExpectedBuild = expectedBuild && new RegExp(`\\b${expectedBuild}\\b`).test(notes);
  return {
    build_id: buildId || (explicitlyMentionsExpectedBuild ? expectedBuild : ""),
    app_version: appVersion || (explicitlyMentionsExpectedBuild ? expectedVersion : ""),
  };
}

function withPayloadMetadata(entry, payload, source) {
  const buildId = String(entry.build_id || payload?.build_id || "").trim();
  const appVersion = String(entry.app_version || payload?.app_version || "").trim();
  const inferred = inferLegacyMetadata(entry, buildId, appVersion);
  return {
    ...entry,
    build_id: inferred.build_id,
    app_version: inferred.app_version,
    _source_file: source,
  };
}

function extractMachines(payload, source) {
  if (looksLikeFieldEntry(payload)) return [withPayloadMetadata(payload, payload, source)];
  if (payload?.schema === "outilsia.local_cockpit_field_tests.v1" && Array.isArray(payload.machines)) {
    return payload.machines.filter(looksLikeFieldEntry).map((item) => withPayloadMetadata(item, payload, source));
  }
  return [];
}

function loadEntries(dir) {
  const files = candidateFilesFromDir(dir);
  const machines = [];
  const unreadable = [];
  for (const file of files) {
    try {
      machines.push(...extractMachines(readJson(file), file));
    } catch (error) {
      unreadable.push({ file, error: error.message || String(error) });
    }
  }
  return { files, machines, unreadable };
}

function buildStatus(opts) {
  const { files, machines, unreadable } = loadEntries(opts.dir);
  const byProfile = new Map();
  const duplicates = [];
  for (const machine of machines) {
    if (!REQUIRED_PROFILES.includes(machine.profile)) continue;
    const mtime = statSync(machine._source_file).mtimeMs;
    if (byProfile.has(machine.profile)) duplicates.push(machine.profile);
    const previous = byProfile.get(machine.profile);
    if (!previous || mtime >= previous._mtime) byProfile.set(machine.profile, { ...machine, _mtime: mtime });
  }

  const profiles = REQUIRED_PROFILES.map((profile) => {
    const machine = byProfile.get(profile);
    if (!machine) {
      return {
        profile,
        status: "missing",
        source_file: "",
        missing_fields: ["fiche absente"],
      };
    }
    let validation = null;
    let validationError = "";
    try {
      validation = validateSingleFieldEntry(machine, profile);
    } catch (error) {
      validationError = error.message || String(error);
    }
    const missing = validationError ? [validationError] : [];
    return {
      profile,
      status: validation ? "ready" : "incomplete",
      source_file: machine._source_file,
      machine_label: machine.machine_label || "",
      score: machine.score || 0,
      recommended_model: machine.recommended_model || "",
      benchmark: machine.benchmark_model ? `${machine.benchmark_model} · ${machine.benchmark_tokens_per_second || 0} tok/s` : "",
      build_id: validation?.build_id || machine.build_id || "",
      app_version: validation?.app_version || machine.app_version || "",
      share_url: machine.share_url || "",
      missing_fields: missing,
    };
  });
  const missingProfiles = profiles.filter((item) => item.status === "missing").map((item) => item.profile);
  const incompleteProfiles = profiles.filter((item) => item.status === "incomplete").map((item) => item.profile);
  const readyProfiles = profiles.filter((item) => item.status === "ready").map((item) => item.profile);
  const buildIds = [...new Set(profiles.filter((item) => item.status === "ready").map((item) => item.build_id).filter(Boolean))];
  const appVersions = [...new Set(profiles.filter((item) => item.status === "ready").map((item) => item.app_version).filter(Boolean))];
  const metadataMixed = buildIds.length > 1 || appVersions.length > 1;
  const nextProfile = missingProfiles[0] || incompleteProfiles[0] || (metadataMixed ? readyProfiles[0] || "" : "");
  return {
    schema: "outilsia.local_cockpit_field_status.v1",
    generated_at: new Date().toISOString(),
    status: missingProfiles.length || incompleteProfiles.length || unreadable.length || metadataMixed ? "FIELD_TESTS_INCOMPLETE" : "FIELD_TESTS_READY",
    // "ready" = schéma + plausibilité (hors-ligne). La preuve réseau des rapports
    // /r/ (existence + cohérence avec la fiche) est contrôlée à l'assemblage et
    // par scripts/audit_beta_field_goal.py, qui seuls ferment le goal terrain.
    report_network_verified: false,
    entries_dir: opts.dir,
    files_read: files.length,
    profiles_required: REQUIRED_PROFILES,
    profiles_ready: readyProfiles,
    profiles_missing: missingProfiles,
    profiles_incomplete: incompleteProfiles,
    build_ids: buildIds,
    app_versions: appVersions,
    metadata_mixed: metadataMixed,
    next_profile_to_test: nextProfile,
    duplicates: [...new Set(duplicates)],
    unreadable,
    profiles,
  };
}

async function buildStatusWithReports(opts) {
  const status = buildStatus(opts);
  const networkUnverified = [];
  const reportIncomplete = [];

  for (const profile of status.profiles) {
    if (profile.status !== "ready") continue;
    if (opts.offline) {
      profile.status = "network_unverified";
      profile.missing_fields = ["rapport /r/ non vérifié (--offline)"];
      networkUnverified.push(profile.profile);
      continue;
    }
    const sourceEntry = profile.source_file ? readJson(profile.source_file) : null;
    const entries = extractMachines(sourceEntry, profile.source_file || "");
    const entry = entries.find((item) => item.profile === profile.profile) || null;
    if (!entry) {
      profile.status = "incomplete";
      profile.missing_fields = ["fiche source introuvable pour vérification réseau"];
      reportIncomplete.push(profile.profile);
      continue;
    }
    const report = await verifyShareReport(entry);
    profile.report_status = report.status;
    profile.report_http_status = report.http_status || 0;
    profile.report_mismatches = report.mismatches || [];
    if (report.status === "coherent") {
      profile.report_network_verified = true;
      profile.missing_fields = profile.missing_fields || [];
      continue;
    }
    profile.report_network_verified = false;
    if (report.status === "unreachable" || report.status === "invalid_format") {
      profile.status = "network_unverified";
      profile.missing_fields = [`rapport /r/ non vérifié: ${report.mismatches?.join("; ") || report.status}`];
      networkUnverified.push(profile.profile);
    } else {
      profile.status = "incomplete";
      profile.missing_fields = [`rapport /r/ incohérent: ${report.mismatches?.join("; ") || report.status}`];
      reportIncomplete.push(profile.profile);
    }
  }

  const missingProfiles = status.profiles.filter((item) => item.status === "missing").map((item) => item.profile);
  const incompleteProfiles = status.profiles.filter((item) => item.status === "incomplete").map((item) => item.profile);
  const readyProfiles = status.profiles.filter((item) => item.status === "ready").map((item) => item.profile);
  status.profiles_ready = readyProfiles;
  status.profiles_missing = missingProfiles;
  status.profiles_incomplete = incompleteProfiles;
  status.profiles_network_unverified = networkUnverified;
  status.profiles_report_incomplete = reportIncomplete;
  status.report_network_verified = !opts.offline && readyProfiles.length === status.profiles_required.length && networkUnverified.length === 0 && reportIncomplete.length === 0;
  status.status = missingProfiles.length || incompleteProfiles.length || networkUnverified.length || status.unreadable.length || status.metadata_mixed
    ? "FIELD_TESTS_INCOMPLETE"
    : "FIELD_TESTS_READY";
  status.next_profile_to_test = missingProfiles[0] || incompleteProfiles[0] || networkUnverified[0] || (status.metadata_mixed ? readyProfiles[0] || "" : "");
  return status;
}

function markdown(status) {
  const lines = [
    "# Statut fiches terrain OutilsIA",
    "",
    `- Statut: \`${status.status}\``,
    `- Dossier: \`${status.entries_dir}\``,
    `- Fichiers lus: ${status.files_read}`,
    `- Profils prêts: ${status.profiles_ready.length}/${status.profiles_required.length}`,
    `- Rapports /r/ vérifiés réseau: ${status.report_network_verified ? "oui" : "non"}`,
    status.profiles_network_unverified?.length ? `- Profils non vérifiés réseau: ${status.profiles_network_unverified.join(", ")}` : "",
    status.profiles_report_incomplete?.length ? `- Profils avec rapport incohérent: ${status.profiles_report_incomplete.join(", ")}` : "",
    `- Builds prêts: ${status.build_ids?.length ? status.build_ids.join(", ") : "aucun"}`,
    `- Versions app prêtes: ${status.app_versions?.length ? status.app_versions.join(", ") : "aucune"}`,
    `- Métadonnées mélangées: ${status.metadata_mixed ? "oui" : "non"}`,
    `- Prochain profil à tester: ${status.next_profile_to_test || "aucun"}`,
    "",
    "| Profil | Statut | Build | App | Machine | Modèle | Benchmark | Rapport | Manques |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const profile of status.profiles) {
    lines.push([
      profile.profile,
      profile.status,
      profile.build_id || "-",
      profile.app_version || "-",
      profile.machine_label || "-",
      profile.recommended_model || "-",
      profile.benchmark || "-",
      profile.share_url || "-",
      (profile.missing_fields || []).join(", ") || "-",
    ].map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  if (status.unreadable.length) {
    lines.push("", "## Fichiers illisibles");
    for (const item of status.unreadable) lines.push(`- \`${item.file}\`: ${item.error}`);
  }
  lines.push("");
  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function profileLabel(profile) {
  const labels = {
    old_laptop: "Vieux laptop / portable modeste",
    core_i7_gtx_1080_ti: "Core i7 + GTX 1080 Ti 11 Go",
    rtx_3060_12gb: "RTX 3060 12 Go",
    rtx_4080_4090: "RTX 4080 / RTX 4090",
    cpu_only: "Machine CPU-only",
  };
  return labels[profile] || profile;
}

function missionHtml(status) {
  const next = status.next_profile_to_test || "";
  const nextRow = status.profiles.find((item) => item.profile === next);
  const rows = status.profiles.map((profile) => `
        <tr class="${profile.status}">
          <td><code>${escapeHtml(profile.profile)}</code><span>${escapeHtml(profileLabel(profile.profile))}</span></td>
          <td><strong>${escapeHtml(profile.status)}</strong></td>
          <td><code>${escapeHtml(profile.build_id || "-")}</code><span>${escapeHtml(profile.app_version || "-")}</span></td>
          <td>${escapeHtml(profile.machine_label || "-")}</td>
          <td>${escapeHtml(profile.recommended_model || "-")}</td>
          <td>${escapeHtml(profile.benchmark || "-")}</td>
          <td>${profile.share_url ? `<a href="${escapeHtml(profile.share_url)}">${escapeHtml(profile.share_url)}</a>` : "-"}</td>
          <td>${escapeHtml((profile.missing_fields || []).join(", ") || "-")}</td>
        </tr>`).join("");
  const nextText = next
    ? `${profileLabel(next)} (${next})`
    : "Aucun : les 5 profils sont prêts.";
  const nextMissing = nextRow?.missing_fields?.length ? nextRow.missing_fields.join(", ") : "fiche complète attendue";
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mission terrain OutilsIA</title>
  <style>
    :root { --ink:#162033; --muted:#607086; --line:#dce4ef; --soft:#f4f7fb; --panel:#fff; --blue:#195fd7; --green:#147449; --orange:#a35a00; --red:#b42318; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, Arial, sans-serif; color:var(--ink); background:#edf2f8; line-height:1.45; }
    main { width:min(1120px, calc(100% - 32px)); margin:28px auto; background:var(--panel); border:1px solid var(--line); border-radius:14px; overflow:hidden; box-shadow:0 16px 50px rgba(28,43,68,.10); }
    header { padding:30px 34px; color:white; background:linear-gradient(135deg,#10213f,#1f5ea8); }
    h1 { margin:0; font-size:32px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:21px; }
    p { margin:8px 0 0; }
    section { padding:26px 34px; border-top:1px solid var(--line); }
    .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
    .card { border:1px solid var(--line); background:var(--soft); border-radius:10px; padding:16px; }
    .card strong { display:block; font-size:20px; }
    .card span, .muted { color:var(--muted); }
    .next { background:#fff8e7; border-color:#f2cf8b; }
    .ok { color:var(--green); }
    .warn { color:var(--orange); }
    table { width:100%; border-collapse:collapse; border:1px solid var(--line); }
    th, td { text-align:left; vertical-align:top; padding:10px 12px; border-bottom:1px solid var(--line); }
    th { background:var(--soft); font-size:12px; text-transform:uppercase; color:var(--muted); }
    td span { display:block; color:var(--muted); font-size:13px; margin-top:3px; }
    code { font-family:Consolas, monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; }
    tr.ready strong { color:var(--green); }
    tr.incomplete strong { color:var(--orange); }
    tr.missing strong { color:var(--red); }
    ol { margin:8px 0 0; padding-left:22px; }
    li { margin:7px 0; }
    @media (max-width:800px) { .grid{grid-template-columns:1fr;} section,header{padding:22px;} h1{font-size:27px;} }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Mission terrain OutilsIA</h1>
    <p>Objectif : obtenir 5 preuves reelles pour confirmer que la beta Windows marche sur plusieurs profils materiels.</p>
  </header>
  <section>
    <div class="grid">
      <div class="card">
        <strong class="${status.status === "FIELD_TESTS_READY" ? "ok" : "warn"}">${escapeHtml(status.profiles_ready.length)}/${escapeHtml(status.profiles_required.length)}</strong>
        <span>profils prêts</span>
      </div>
      <div class="card next">
        <strong>${escapeHtml(nextText)}</strong>
        <span>prochain PC à tester</span>
      </div>
      <div class="card">
        <strong>${escapeHtml(status.files_read)}</strong>
        <span>fichiers lus dans entries</span>
      </div>
    </div>
  </section>
  <section>
    <h2>Action maintenant</h2>
    <ol>
      <li>Prendre le profil indiqué : <strong>${escapeHtml(nextText)}</strong>.</li>
      <li>Ouvrir OutilsIA Local Cockpit sur cette machine et cliquer <strong>Analyser ce PC</strong>.</li>
      <li>Obtenir au minimum : matériel reconnu, score, modèle conseillé, benchmark, PromptForge, dialogue local, Arena, rapport.</li>
      <li>Passer en <strong>Détails</strong>, ouvrir <strong>Test terrain</strong>, choisir le <strong>Profil terrain</strong> attendu, puis cliquer <strong>Télécharger fiche</strong>.</li>
      <li>Revenir sur ce kit et lancer <strong>COLLECTER.cmd</strong>, puis <strong>STATUT.cmd</strong>.</li>
    </ol>
    <p class="muted">Manque actuel du profil suivant : ${escapeHtml(nextMissing)}.</p>
  </section>
  <section>
    <h2>Statut des profils</h2>
    <table>
      <thead>
        <tr><th>Profil</th><th>Statut</th><th>Build</th><th>Machine</th><th>Modèle</th><th>Benchmark</th><th>Rapport</th><th>Manques</th></tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>
  </section>
</main>
</body>
</html>
`;
}

function nextProfileHtml(status) {
  const next = status.next_profile_to_test || "";
  const nextRow = status.profiles.find((item) => item.profile === next);
  const nextTitle = next ? profileLabel(next) : "Les 5 profils sont prêts";
  const missing = nextRow?.missing_fields?.length ? nextRow.missing_fields : [];
  const expectedFilename = next ? `outilsia-field-test-${next}.json` : "FIELD-TESTS.json";
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Prochain PC terrain OutilsIA</title>
  <style>
    :root { --ink:#172033; --muted:#617085; --line:#d9e2ee; --panel:#fff; --soft:#f5f8fc; --blue:#185abc; --green:#137044; --orange:#9d5a00; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, Arial, sans-serif; color:var(--ink); background:#edf2f8; line-height:1.45; }
    main { width:min(840px, calc(100% - 28px)); margin:26px auto; background:var(--panel); border:1px solid var(--line); border-radius:14px; overflow:hidden; box-shadow:0 16px 46px rgba(28,43,68,.12); }
    header { padding:28px 32px; background:#12335e; color:white; }
    h1 { margin:0; font-size:30px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:20px; }
    section { padding:24px 32px; border-top:1px solid var(--line); }
    .hero { background:#fff8e7; border-top:0; }
    .label { text-transform:uppercase; font-size:12px; font-weight:800; color:var(--muted); letter-spacing:.04em; }
    .next { margin:4px 0 8px; font-size:28px; font-weight:850; }
    .profile { display:inline-flex; border-radius:999px; padding:5px 10px; background:#eaf2ff; color:var(--blue); font-weight:800; }
    .grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
    .card { background:var(--soft); border:1px solid var(--line); border-radius:10px; padding:14px; }
    .card strong { display:block; font-size:18px; margin-bottom:4px; }
    .ok { color:var(--green); }
    ol, ul { margin:8px 0 0; padding-left:22px; }
    li { margin:7px 0; }
    code { font-family:Consolas, monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; }
    .muted { color:var(--muted); }
    @media (max-width:720px) { .grid{grid-template-columns:1fr;} section,header{padding:22px;} h1{font-size:26px;} .next{font-size:24px;} }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Prochain test terrain</h1>
    <p>Fiche courte pour ne pas perdre le fil pendant la validation multi-machines.</p>
  </header>
  <section class="hero">
    <div class="label">À tester maintenant</div>
    <div class="next">${escapeHtml(nextTitle)}</div>
    <span class="profile">${escapeHtml(next || "FIELD_TESTS_READY")}</span>
    <p class="muted">Progression actuelle : ${escapeHtml(status.profiles_ready.length)}/${escapeHtml(status.profiles_required.length)} profils prêts · ${escapeHtml(status.files_read)} fichier(s) lu(s).</p>
  </section>
  <section>
    <h2>Preuves à obtenir sur ce PC</h2>
    <div class="grid">
      <div class="card"><strong>1. Analyse</strong><span>Matériel reconnu, score, modèle conseillé, upgrade utile.</span></div>
      <div class="card"><strong>2. Benchmark</strong><span>Un modèle testé avec tokens/s et durée.</span></div>
      <div class="card"><strong>3. Flux IA</strong><span>PromptForge, dialogue local et Arena locale validés.</span></div>
      <div class="card"><strong>4. Rapport</strong><span>Rapport généré ou lien partagé copié dans la fiche.</span></div>
    </div>
  </section>
  <section>
    <h2>Étapes</h2>
    <ol>
      <li>Copier ce kit sur la machine cible ou l'ouvrir depuis la clé USB.</li>
      <li>Lancer <code>INSTALLER-APP.cmd</code> si OutilsIA Local Cockpit n'est pas installé.</li>
      <li>Dans l'app, cliquer <strong>Analyser ce PC</strong>.</li>
      <li>Passer en <strong>Détails</strong> puis <strong>Test terrain</strong>.</li>
      <li>Sélectionner le profil exact : <code>${escapeHtml(next || "aucun")}</code>.</li>
      <li>Télécharger la fiche attendue : <code>${escapeHtml(expectedFilename)}</code>.</li>
      <li>Revenir sur la machine principale et lancer <code>COLLECTER.cmd</code>, puis <code>PROCHAIN-PC.cmd</code>.</li>
    </ol>
  </section>
  <section>
    <h2>Manques actuels</h2>
    ${
      missing.length
        ? `<ul>${missing.map((field) => `<li><code>${escapeHtml(field)}</code></li>`).join("")}</ul>`
        : `<p class="ok">Aucun manque pour ce profil. Passer au profil suivant ou lancer <code>VALIDER-GOAL.cmd</code>.</p>`
    }
  </section>
</main>
</body>
</html>
`;
}

function commandCenterHtml(status) {
  const next = status.next_profile_to_test || "";
  const nextTitle = next ? profileLabel(next) : "Les 5 profils sont prêts";
  const ready = status.profiles_ready.length;
  const total = status.profiles_required.length;
  const rows = status.profiles.map((profile) => `
        <tr class="${profile.status}">
          <td><code>${escapeHtml(profile.profile)}</code><span>${escapeHtml(profileLabel(profile.profile))}</span></td>
          <td><strong>${escapeHtml(profile.status)}</strong></td>
          <td><code>${escapeHtml(profile.build_id || "-")}</code><span>${escapeHtml(profile.app_version || "-")}</span></td>
          <td>${escapeHtml(profile.machine_label || "-")}</td>
          <td>${escapeHtml(profile.recommended_model || "-")}</td>
          <td>${escapeHtml(profile.benchmark || "-")}</td>
          <td>${escapeHtml((profile.missing_fields || []).join(", ") || "-")}</td>
        </tr>`).join("");
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Centre terrain OutilsIA</title>
  <style>
    :root { --ink:#172033; --muted:#607086; --line:#dbe4ef; --panel:#fff; --soft:#f5f8fc; --blue:#185abc; --green:#167447; --orange:#a15c00; --red:#b42318; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, Arial, sans-serif; color:var(--ink); background:#edf2f8; line-height:1.45; }
    main { width:min(1160px, calc(100% - 28px)); margin:28px auto; }
    header { background:#12335e; color:white; border-radius:14px; padding:30px 34px; box-shadow:0 16px 46px rgba(28,43,68,.12); }
    h1 { margin:0; font-size:32px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:22px; }
    h3 { margin:0 0 8px; font-size:17px; }
    section { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:24px; margin-top:16px; box-shadow:0 12px 34px rgba(28,43,68,.08); }
    .grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; }
    .two { grid-template-columns:repeat(2, minmax(0, 1fr)); }
    .card { background:var(--soft); border:1px solid var(--line); border-radius:12px; padding:16px; }
    .card strong { display:block; font-size:22px; margin-bottom:4px; }
    .muted, .card span { color:var(--muted); }
    .next { background:#fff8e7; border-color:#f2cf8b; }
    .ok { color:var(--green); }
    .warn { color:var(--orange); }
    .bad { color:var(--red); }
    .action { display:grid; grid-template-columns:170px 1fr; gap:10px; align-items:start; border-top:1px solid var(--line); padding:12px 0; }
    .action:first-child { border-top:0; padding-top:0; }
    table { width:100%; border-collapse:collapse; border:1px solid var(--line); }
    th, td { text-align:left; vertical-align:top; padding:10px 12px; border-bottom:1px solid var(--line); }
    th { background:var(--soft); font-size:12px; text-transform:uppercase; color:var(--muted); }
    td span { display:block; color:var(--muted); font-size:13px; margin-top:3px; }
    tr.ready strong { color:var(--green); }
    tr.incomplete strong { color:var(--orange); }
    tr.missing strong { color:var(--red); }
    code { font-family:Consolas, monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; }
    ol { margin:8px 0 0; padding-left:22px; }
    li { margin:7px 0; }
    @media (max-width:850px) { .grid,.two{grid-template-columns:1fr;} .action{grid-template-columns:1fr;} header,section{padding:22px;} h1{font-size:28px;} }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Centre terrain OutilsIA</h1>
    <p>Un seul écran pour piloter la collecte physique. Cette page est régénérée par <code>OUVRIR-CENTRE-TERRAIN.cmd</code> ou <code>STATUT.cmd</code>.</p>
  </header>

  <section>
    <div class="grid">
      <div class="card">
        <strong class="${status.status === "FIELD_TESTS_READY" ? "ok" : "warn"}">${escapeHtml(ready)}/${escapeHtml(total)}</strong>
        <span>profils prêts</span>
      </div>
      <div class="card next">
        <strong>${escapeHtml(nextTitle)}</strong>
        <span>prochain PC physique</span>
      </div>
      <div class="card">
        <strong>${escapeHtml(status.files_read)}</strong>
        <span>fichier(s) lu(s) dans entries</span>
      </div>
    </div>
  </section>

  <section>
    <h2>Action à faire maintenant</h2>
    <ol>
      <li>Tester le profil indiqué : <strong>${escapeHtml(nextTitle)}</strong>.</li>
      <li>Sur ce PC, ouvrir OutilsIA et cliquer <strong>Analyser ce PC</strong>.</li>
      <li>Obtenir matériel, score, modèle conseillé, benchmark, PromptForge, dialogue, Arena et rapport.</li>
      <li>Exporter la fiche depuis <strong>Détails</strong> &gt; <strong>Test terrain</strong> avec le bon profil manuel.</li>
      <li>Lancer <code>VALIDER-DERNIERE-FICHE.cmd</code>, puis <code>EXPORTER-FICHES.cmd</code> si le PC est distant.</li>
    </ol>
  </section>

  <section>
    <h2>Raccourcis dans l'ordre</h2>
    <div class="action"><code>INSTALLER-APP.cmd</code><span>Installe le build Windows inclus si le PC ne l'a pas encore.</span></div>
    <div class="action"><code>PROCHAIN-PC.cmd</code><span>Ouvre la fiche courte du profil attendu.</span></div>
    <div class="action"><code>OUVRIR-DISPATCH.cmd</code><span>Permet de choisir explicitement un profil si tu testes hors ordre.</span></div>
    <div class="action"><code>VALIDER-DERNIERE-FICHE.cmd</code><span>Refuse une fiche incomplète avant de quitter la machine.</span></div>
    <div class="action"><code>EXPORTER-FICHES.cmd</code><span>Crée un zip transférable depuis un PC terrain.</span></div>
    <div class="action"><code>IMPORTER-PACK-FICHES.cmd</code><span>Importe sur la machine principale un zip reçu d'un autre PC.</span></div>
    <div class="action"><code>VALIDER-GOAL.cmd</code><span>A lancer seulement quand les 5 profils sont réellement prêts.</span></div>
  </section>

  <section>
    <h2>Statut des profils</h2>
    <table>
      <thead>
        <tr><th>Profil</th><th>Statut</th><th>Build</th><th>Machine</th><th>Modèle</th><th>Benchmark</th><th>Manques</th></tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>
  </section>
</main>
</body>
</html>
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const status = await buildStatusWithReports(opts);
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, `${JSON.stringify(status, null, 2)}\n`, "utf8");
    writeFileSync(opts.out.replace(/\.json$/i, ".md"), markdown(status), "utf8");
    writeFileSync(join(dirname(opts.out), "MISSION-TERRAIN.html"), missionHtml(status), "utf8");
    writeFileSync(join(dirname(opts.out), "PROCHAIN-PC.html"), nextProfileHtml(status), "utf8");
    writeFileSync(join(dirname(opts.out), "CENTRE-TERRAIN.html"), commandCenterHtml(status), "utf8");
    console.log(`field_test_status_${status.status.toLowerCase()} ready=${status.profiles_ready.length}/${status.profiles_required.length} network_verified=${status.report_network_verified} next=${status.next_profile_to_test || "none"} out=${opts.out}`);
    if (opts.failOnIncomplete && status.status !== "FIELD_TESTS_READY") process.exit(1);
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
  })();
}

export { buildStatus, buildStatusWithReports, markdown, missionHtml, nextProfileHtml, commandCenterHtml };
