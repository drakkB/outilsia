#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const desktopRoot = existsSync("/mnt/c/Users/chris/Desktop")
  ? "/mnt/c/Users/chris/Desktop"
  : join(process.env.HOME || ".", "Desktop");
const downloadsRoot = existsSync("/mnt/c/Users/chris/Downloads")
  ? "/mnt/c/Users/chris/Downloads"
  : join(process.env.HOME || ".", "Downloads");
const fieldKitRoot = join(desktopRoot, "OutilsIA-Local-Cockpit-Field-Test-Kit");
const entriesDir = join(fieldKitRoot, "entries");
const outHtml = join(desktopRoot, "OutilsIA-Local-Cockpit-AVANCER-100.html");
const outCmd = join(desktopRoot, "AVANCER-OBJECTIF-100-OUTILSIA.cmd");

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: opts.cwd || appRoot,
    encoding: "utf8",
  });
  return {
    command: `${command} ${args.join(" ")}`,
    code: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    ok: result.status === 0,
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function walk(root, predicate, maxDepth = 5) {
  const out = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    let children = [];
    try {
      children = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      const path = join(dir, child.name);
      if (child.isDirectory() && depth < maxDepth) {
        stack.push({ dir: path, depth: depth + 1 });
      } else if (child.isFile() && predicate(path, child.name)) {
        out.push(path);
      }
    }
  }
  return out.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

function existingRoots(paths) {
  return [...new Set(paths.filter(Boolean).map((path) => resolve(path)).filter(existsSync))];
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function collectFieldEntries() {
  mkdirSync(entriesDir, { recursive: true });
  const roots = existingRoots([
    downloadsRoot,
    entriesDir,
    join(fieldKitRoot, "entries"),
    join(desktopRoot, "OutilsIA-Next-PC-old_laptop"),
    join(desktopRoot, "OutilsIA-Next-PC-core_i7_gtx_1080_ti"),
    join(desktopRoot, "OutilsIA-Next-PC-rtx_3060_12gb"),
    join(desktopRoot, "OutilsIA-Next-PC-cpu_only"),
    join(appRoot, ".artifacts"),
  ]);
  const candidates = [];
  for (const root of roots) {
    candidates.push(...walk(root, (_path, name) => /^outilsia-field-test-.+\.json$/i.test(name), 3));
  }
  const copied = [];
  const seen = new Set();
  for (const source of candidates) {
    const target = join(entriesDir, basename(source));
    const key = resolve(source);
    if (seen.has(key)) continue;
    seen.add(key);
    if (resolve(target) === key) continue;
    copyFileSync(source, target);
    copied.push({ source, target });
  }
  return { candidates, copied };
}

function maybeAssembleAndImport(validation) {
  if (validation.status !== "FIELD_ENTRIES_VALID") {
    return {
      assembled: false,
      imported: false,
      reason: `validation=${validation.status}`,
      assemble: null,
      importResult: null,
    };
  }
  const outPath = join(fieldKitRoot, "FIELD-TESTS.json");
  const assemble = run("node", ["scripts/assemble-field-tests.mjs", "--dir", entriesDir, "--out", outPath]);
  if (!assemble.ok) {
    return { assembled: false, imported: false, reason: "assemble_failed", assemble, importResult: null };
  }
  const importResult = run("node", ["scripts/import-field-tests.mjs", "--input", outPath]);
  return {
    assembled: assemble.ok,
    imported: importResult.ok,
    reason: importResult.ok ? "field_imported" : "import_failed",
    assemble,
    importResult,
  };
}

function findLinuxCandidates() {
  const roots = existingRoots([
    downloadsRoot,
    join(desktopRoot, "OutilsIA-Local-Cockpit-Linux-Build-Kit"),
    join(desktopRoot, "OutilsIA-Local-Cockpit-Field-Test-Kit"),
    join(appRoot, ".artifacts"),
    join(repoRoot, "server-work", "static", "downloads", "local-cockpit"),
  ]);
  const patterns = [
    /local-cockpit.*linux.*0\.1\.1/i,
    /0\.1\.1.*linux/i,
    /linux-web-release/i,
    /cross-platform.*release/i,
  ];
  const candidates = [];
  for (const root of roots) {
    candidates.push(...walk(root, (path, name) => {
      const text = `${path} ${name}`;
      return patterns.some((pattern) => pattern.test(text));
    }, 4));
  }
  return candidates;
}

function latestReport(prefix) {
  const reportsRoot = join(repoRoot, "reports");
  if (!existsSync(reportsRoot)) return "";
  return readdirSync(reportsRoot).filter((name) => name.startsWith(prefix) && name.endsWith(".json")).sort().at(-1) || "";
}

function html(report) {
  const commands = report.commands.map((item) => `
    <tr class="${item.ok ? "ok" : "bad"}">
      <td><code>${esc(item.command)}</code></td>
      <td>${esc(item.code)}</td>
      <td><pre>${esc((item.stdout || item.stderr).trim().split(/\r?\n/).slice(-8).join("\n"))}</pre></td>
    </tr>
  `).join("");
  const copied = report.field.copied.length
    ? report.field.copied.map((item) => `<li><code>${esc(item.target)}</code><span>${esc(item.source)}</span></li>`).join("")
    : "<li>Aucune nouvelle fiche copiée.</li>";
  const linux = report.linux.candidates.length
    ? report.linux.candidates.map((path) => `<li><code>${esc(path)}</code></li>`).join("")
    : "<li>Aucun artefact Linux 0.1.1 ou cross-platform trouvé localement.</li>";
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OutilsIA - avancer vers 100%</title>
  <style>
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#edf2f8;color:#172033;line-height:1.5}
    main{width:min(1120px,calc(100% - 28px));margin:28px auto}
    header,section{background:white;border:1px solid #dbe4ef;border-radius:14px;padding:24px;margin-bottom:14px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    header{background:#12335e;color:white}h1{margin:0 0 8px;font-size:32px}
    .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{background:#f5f8fc;border:1px solid #dbe4ef;border-radius:12px;padding:16px}.card strong{display:block;font-size:26px}
    table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #dbe4ef;vertical-align:top}th{background:#f5f8fc;color:#607086;text-transform:uppercase;font-size:12px}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}pre{white-space:pre-wrap;margin:0;font-size:12px}.ok td:first-child{border-left:5px solid #137044}.bad td:first-child{border-left:5px solid #b42318}
    li{margin:8px 0}li span{display:block;color:#607086;font-size:12px;margin-top:3px}
    @media(max-width:860px){.grid{grid-template-columns:1fr}table{display:block;overflow-x:auto}header,section{padding:20px}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Avancer vers 100%</h1>
    <p>Collecte les vraies fiches disponibles, assemble si les 5 profils sont prêts, puis relance les audits. Aucune preuve n'est inventée.</p>
  </header>
  <section class="grid">
    <div class="card"><span>Fiches candidates</span><strong>${esc(report.field.candidates.length)}</strong></div>
    <div class="card"><span>Fiches copiées</span><strong>${esc(report.field.copied.length)}</strong></div>
    <div class="card"><span>Linux candidats</span><strong>${esc(report.linux.candidates.length)}</strong></div>
  </section>
  <section><h2>Fiches collectées</h2><ul>${copied}</ul></section>
  <section><h2>Artefacts Linux trouvés</h2><ul>${linux}</ul></section>
  <section>
    <h2>Commandes exécutées</h2>
    <table><thead><tr><th>Commande</th><th>Code</th><th>Sortie</th></tr></thead><tbody>${commands}</tbody></table>
  </section>
</main>
</body>
</html>`;
}

function main() {
  const field = collectFieldEntries();
  const commands = [];
  const validate = run("node", ["scripts/validate-field-entries.mjs", "--dir", entriesDir, "--out", join(fieldKitRoot, "FIELD-ENTRIES-VALIDATION.json")]);
  commands.push(validate);
  let validation = { status: "FIELD_ENTRIES_VALIDATION_FAILED" };
  const validationPath = join(fieldKitRoot, "FIELD-ENTRIES-VALIDATION.json");
  if (existsSync(validationPath)) validation = readJson(validationPath);
  const assembly = maybeAssembleAndImport(validation);
  if (assembly.assemble) commands.push(assembly.assemble);
  if (assembly.importResult) commands.push(assembly.importResult);
  for (const args of [
    ["scripts/report-field-test-status.mjs"],
    ["scripts/report-goal-progress.mjs"],
    ["scripts/report-goal-remaining.mjs"],
    ["scripts/verify-goal-closure.mjs"],
    ["scripts/report-goal-100.mjs"],
    ["scripts/verify-goal-100.mjs"],
  ]) {
    commands.push(run("node", args));
  }
  const report = {
    schema: "outilsia.local_cockpit_goal_100_advance.v1",
    generated_at: new Date().toISOString(),
    field: {
      candidates: field.candidates,
      copied: field.copied,
      validation_status: validation.status || "unknown",
      assembly,
    },
    linux: {
      candidates: findLinuxCandidates(),
      next_action: "Si un zip linux/cross-platform 0.1.1 apparaît ici, importer avec npm run publish:cross-platform ou IMPORTER-LINUX-ARTEFACT.cmd.",
    },
    latest_reports: {
      field_status: "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Field-Test-Kit/FIELD-TESTS-STATUS.json",
      goal_progress: latestReport("goal_progress_"),
      goal_100: latestReport("goal_100_gate_"),
    },
    commands,
  };
  const reportsRoot = join(repoRoot, "reports");
  mkdirSync(reportsRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "_").slice(0, 15);
  writeFileSync(join(reportsRoot, `goal_100_advance_${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(outHtml, html(report), "utf8");
  writeFileSync(outCmd, [
    "@echo off",
    "cd /d \"%USERPROFILE%\\..\\..\\home\\chris\\projects\\outilsia\\local-cockpit-app\" 2>nul",
    "wsl.exe bash -lc \"cd /home/chris/projects/outilsia/local-cockpit-app && npm run advance:goal-100\"",
    "start \"\" \"%USERPROFILE%\\Desktop\\OutilsIA-Local-Cockpit-AVANCER-100.html\"",
    "pause",
    "",
  ].join("\r\n"), "utf8");
  console.log(`goal_100_advance validation=${validation.status || "unknown"} copied=${field.copied.length} linux_candidates=${report.linux.candidates.length} html=${outHtml}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
