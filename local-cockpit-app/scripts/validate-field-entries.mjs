#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_PROFILES } from "./import-field-tests.mjs";
import { validateSingleFieldEntry } from "./validate-single-field-entry.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopKit = existsSync("/mnt/c/Users/chris/Desktop")
  ? "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Field-Test-Kit"
  : join(process.env.HOME || ".", "Desktop", "OutilsIA-Local-Cockpit-Field-Test-Kit");
const defaultDir = join(desktopKit, "entries");
const defaultOut = join(desktopKit, "FIELD-ENTRIES-VALIDATION.json");
const fieldKitManifest = join(desktopKit, "FIELD-KIT-MANIFEST.txt");

function usage() {
  console.log(`Usage:
  node scripts/validate-field-entries.mjs [--dir entries] [--out FIELD-ENTRIES-VALIDATION.json] [--fail-on-incomplete]

Validates every exported field-test fiche before final assembly.`);
}

function parseArgs(argv) {
  const opts = { dir: defaultDir, out: defaultOut, failOnIncomplete: false };
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
    throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function candidateFilesFromDir(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const child of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, child.name);
      if (child.isDirectory()) stack.push(path);
      else if (child.isFile() && child.name.toLowerCase().endsWith(".json")) files.push(path);
    }
  }
  return files.sort();
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function looksLikeEntry(value) {
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

function extractEntries(payload, source) {
  if (looksLikeEntry(payload)) return [withPayloadMetadata(payload, payload, source)];
  if (payload?.schema === "outilsia.local_cockpit_field_tests.v1" && Array.isArray(payload.machines)) {
    return payload.machines.filter(looksLikeEntry).map((item) => withPayloadMetadata(item, payload, source));
  }
  return [];
}

function latestEntriesByProfile(files) {
  const byProfile = new Map();
  const unreadable = [];
  const unexpected = [];
  const duplicates = [];
  for (const file of files) {
    let entries = [];
    try {
      entries = extractEntries(readJson(file), file);
    } catch (error) {
      unreadable.push({ file, error: error.message || String(error) });
      continue;
    }
    if (!entries.length) {
      unreadable.push({ file, error: "No field-test machine entry found" });
      continue;
    }
    const mtime = statSync(file).mtimeMs;
    for (const entry of entries) {
      if (!REQUIRED_PROFILES.includes(entry.profile)) {
        unexpected.push({ file, profile: entry.profile || "" });
        continue;
      }
      if (byProfile.has(entry.profile)) duplicates.push(entry.profile);
      const previous = byProfile.get(entry.profile);
      if (!previous || mtime >= previous._mtime) {
        byProfile.set(entry.profile, { ...entry, _mtime: mtime, _source_file: file });
      }
    }
  }
  return { byProfile, unreadable, unexpected, duplicates: [...new Set(duplicates)] };
}

function markdown(report) {
  const lines = [
    "# Validation fiches terrain OutilsIA",
    "",
    `- Statut: \`${report.status}\``,
    `- Dossier: \`${report.entries_dir}\``,
    `- Fichiers lus: ${report.files_read}`,
    `- Profils valides: ${report.profiles_ready.length}/${report.profiles_required.length}`,
    `- Builds prêts: ${report.build_ids.length ? report.build_ids.join(", ") : "aucun"}`,
    `- Versions app prêtes: ${report.app_versions.length ? report.app_versions.join(", ") : "aucune"}`,
    `- Métadonnées mélangées: ${report.metadata_mixed ? "oui" : "non"}`,
    `- Prochain profil à corriger: ${report.next_profile_to_fix || "aucun"}`,
    "",
    "| Profil | Statut | UX 30s | Build | App | Fichier | Modèle | Benchmark | Rapport | Erreur |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of report.profiles) {
    lines.push([
      row.profile,
      row.status,
      row.first_30s_complete ? `${row.first_30s_source || "ok"}` : "-",
      row.build_id || "-",
      row.app_version || "-",
      row.source_file ? basename(row.source_file) : "-",
      row.recommended_model || "-",
      row.benchmark_tokens_per_second ? `${row.benchmark_model} · ${row.benchmark_tokens_per_second} tok/s` : "-",
      row.report || "-",
      row.error || "-",
    ].map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  if (report.unreadable.length) {
    lines.push("", "## Fichiers illisibles");
    for (const item of report.unreadable) lines.push(`- \`${item.file}\`: ${item.error}`);
  }
  if (report.unexpected.length) {
    lines.push("", "## Profils inattendus");
    for (const item of report.unexpected) lines.push(`- \`${item.file}\`: ${item.profile}`);
  }
  if (report.duplicates.length) {
    lines.push("", `## Doublons remplacés: ${report.duplicates.join(", ")}`);
  }
  lines.push("");
  return lines.join("\n");
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function proofLabel(row) {
  if (row.status === "ready") return "preuve complète";
  if (row.status === "missing") return "fiche absente";
  return "à corriger";
}

function first30sLabel(row) {
  if (row.first_30s_complete) return row.first_30s_source === "explicit" ? "explicite" : "déduite";
  return "-";
}

function html(report) {
  const rows = report.profiles.map((row) => `
    <tr class="${esc(row.status)}">
      <td><strong>${esc(row.profile)}</strong><span>${esc(proofLabel(row))}</span></td>
      <td>${esc(row.status)}</td>
      <td>${esc(first30sLabel(row))}<span>${esc(row.first_30s_summary || "")}</span></td>
      <td>${esc(row.build_id || "-")}</td>
      <td>${esc(row.app_version || "-")}</td>
      <td>${esc(row.recommended_model || "-")}</td>
      <td>${row.benchmark_tokens_per_second ? `${esc(row.benchmark_model)} · ${esc(row.benchmark_tokens_per_second)} tok/s` : "-"}</td>
      <td>${row.report ? `<a href="${esc(row.report)}">${esc(row.report)}</a>` : "-"}</td>
      <td>${esc(row.error || "-")}</td>
    </tr>
  `).join("");
  const unreadable = report.unreadable.length
    ? report.unreadable.map((item) => `<li><code>${esc(item.file)}</code> ${esc(item.error)}</li>`).join("")
    : "<li>Aucun fichier illisible.</li>";
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Validation fiches terrain OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#607086;--line:#dbe4ef;--green:#137044;--amber:#9d5a00;--red:#b42318;--blue:#12335e}
    *{box-sizing:border-box}
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#edf2f8;color:var(--ink);line-height:1.45}
    main{width:min(1180px,calc(100% - 28px));margin:28px auto}
    header,section{background:#fff;border:1px solid var(--line);border-radius:14px;padding:22px;margin-bottom:14px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    header{background:var(--blue);color:#fff}
    h1{margin:0 0 8px;font-size:30px}
    h2{margin:0 0 10px;font-size:20px}
    .cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}
    .card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px}
    .card strong{display:block;font-size:28px}
    table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
    th,td{text-align:left;padding:12px;border-bottom:1px solid var(--line);vertical-align:top}
    th{background:#f5f8fc;color:#475569;font-size:13px;text-transform:uppercase}
    td span{display:block;color:var(--muted);font-size:12px;margin-top:2px}
    tr.ready td:first-child{border-left:5px solid var(--green)}
    tr.missing td:first-child{border-left:5px solid var(--amber)}
    tr.incomplete td:first-child{border-left:5px solid var(--red)}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}
    a{color:#185abc}
    li{margin:7px 0}
    @media(max-width:900px){.cards{grid-template-columns:1fr}table{display:block;overflow-x:auto}header,section{padding:18px}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Validation fiches terrain OutilsIA</h1>
    <p>Contrôle intermédiaire avant assemblage final. Une fiche prête doit prouver scan, UX 30 secondes, modèle conseillé, benchmark, PromptForge, dialogue, Arena et rapport partagé.</p>
  </header>
  <div class="cards">
    <div class="card"><strong>${esc(report.status)}</strong><span>statut</span></div>
    <div class="card"><strong>${report.profiles_ready.length}/${report.profiles_required.length}</strong><span>profils prêts</span></div>
    <div class="card"><strong>${esc(report.next_profile_to_fix || "aucun")}</strong><span>prochain profil</span></div>
    <div class="card"><strong>${report.metadata_mixed ? "oui" : "non"}</strong><span>métadonnées mélangées</span></div>
  </div>
  <section>
    <h2>Fiches par profil</h2>
    <table>
      <thead><tr><th>Profil</th><th>Statut</th><th>UX 30s</th><th>Build</th><th>App</th><th>Modèle</th><th>Benchmark</th><th>Rapport</th><th>Erreur</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>
  <section>
    <h2>Preuves minimales attendues</h2>
    <ul>
      <li>Scan matériel détecté et cohérent avec le profil terrain.</li>
      <li>UX 30 secondes : matériel visible, score visible, modèle conseillé, benchmark ou bouton de benchmark, upgrade utile.</li>
      <li>Benchmark local avec tokens/s supérieur à 0.</li>
      <li>PromptForge, dialogue local, Arena locale et rapport avec statut OK.</li>
      <li>URL partagée OutilsIA au format <code>https://outilsia.fr/r/...</code>.</li>
      <li>Même <code>build_id</code> et même <code>app_version</code> sur les 5 profils.</li>
    </ul>
  </section>
  <section>
    <h2>Fichiers illisibles</h2>
    <ul>${unreadable}</ul>
  </section>
</main>
</body>
</html>
`;
}

export function validateFieldEntries(opts) {
  const files = candidateFilesFromDir(opts.dir);
  const { byProfile, unreadable, unexpected, duplicates } = latestEntriesByProfile(files);
  const profiles = REQUIRED_PROFILES.map((profile) => {
    const entry = byProfile.get(profile);
    if (!entry) {
      return {
        profile,
        status: "missing",
        source_file: "",
        error: "fiche absente",
      };
    }
    try {
      const result = validateSingleFieldEntry(entry, profile);
      return {
        profile,
        status: "ready",
        source_file: entry._source_file,
        recommended_model: result.recommended_model,
        benchmark_model: result.benchmark_model,
        benchmark_tokens_per_second: result.benchmark_tokens_per_second,
        first_30s_complete: result.first_30s_complete,
        first_30s_source: result.first_30s_source,
        first_30s_summary: result.first_30s_summary,
        build_id: result.build_id,
        app_version: result.app_version,
        report: result.report,
        error: "",
      };
    } catch (error) {
      return {
        profile,
        status: "incomplete",
        source_file: entry._source_file,
        recommended_model: entry.recommended_model || "",
        benchmark_model: entry.benchmark_model || "",
        benchmark_tokens_per_second: Number(entry.benchmark_tokens_per_second || 0),
        first_30s_complete: false,
        first_30s_source: "",
        first_30s_summary: "",
        build_id: entry.build_id || "",
        app_version: entry.app_version || "",
        report: entry.share_url || "",
        error: error.message || String(error),
      };
    }
  });

  const ready = profiles.filter((row) => row.status === "ready").map((row) => row.profile);
  const missing = profiles.filter((row) => row.status === "missing").map((row) => row.profile);
  const incomplete = profiles.filter((row) => row.status === "incomplete").map((row) => row.profile);
  const buildIds = [...new Set(profiles.filter((row) => row.status === "ready").map((row) => row.build_id).filter(Boolean))];
  const appVersions = [...new Set(profiles.filter((row) => row.status === "ready").map((row) => row.app_version).filter(Boolean))];
  const metadataMixed = buildIds.length > 1 || appVersions.length > 1;
  const shareUrlCounts = new Map();
  for (const row of profiles.filter((item) => item.status === "ready")) {
    const key = String(row.report || "").trim().toLowerCase();
    if (key) shareUrlCounts.set(key, (shareUrlCounts.get(key) || 0) + 1);
  }
  const duplicateShareUrls = [...shareUrlCounts.entries()].filter(([, count]) => count > 1).map(([url]) => url);
  const tpsCounts = new Map();
  for (const row of profiles.filter((item) => item.status === "ready")) {
    const value = Number(row.benchmark_tokens_per_second || 0);
    if (Number.isFinite(value) && value > 0) {
      const key = value.toFixed(1);
      tpsCounts.set(key, (tpsCounts.get(key) || 0) + 1);
    }
  }
  const duplicate_benchmark_tokens_per_second = [...tpsCounts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
  const ok = ready.length === REQUIRED_PROFILES.length && !unreadable.length && !unexpected.length && !metadataMixed && !duplicateShareUrls.length && !duplicate_benchmark_tokens_per_second.length;
  const nextProfileToFix = missing[0] || incomplete[0] || (metadataMixed || duplicateShareUrls.length || duplicate_benchmark_tokens_per_second.length ? ready[0] || "" : "");
  const report = {
    schema: "outilsia.local_cockpit_field_entries_validation.v1",
    generated_at: new Date().toISOString(),
    status: ok ? "FIELD_ENTRIES_VALID" : "FIELD_ENTRIES_INCOMPLETE",
    entries_dir: opts.dir,
    files_read: files.length,
    profiles_required: REQUIRED_PROFILES,
    profiles_ready: ready,
    profiles_missing: missing,
    profiles_incomplete: incomplete,
    build_ids: buildIds,
    app_versions: appVersions,
    metadata_mixed: metadataMixed,
    duplicate_share_urls: duplicateShareUrls,
    duplicate_benchmark_tokens_per_second,
    next_profile_to_fix: nextProfileToFix,
    duplicates,
    unreadable,
    unexpected,
    profiles,
  };
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(opts.out.replace(/\.json$/i, ".md"), markdown(report), "utf8");
  writeFileSync(opts.out.replace(/\.json$/i, ".html"), html(report), "utf8");
  if (opts.failOnIncomplete && !ok) {
    throw new Error(`Field entries incomplete: ready=${ready.length}/${REQUIRED_PROFILES.length} next=${report.next_profile_to_fix || "none"}`);
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = validateFieldEntries(parseArgs(process.argv.slice(2)));
    console.log(
      `field_entries_validation ${report.status} ready=${report.profiles_ready.length}/${report.profiles_required.length} ` +
      `next=${report.next_profile_to_fix || "none"}`
    );
    if (report.status !== "FIELD_ENTRIES_VALID") process.exitCode = 1;
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
}
