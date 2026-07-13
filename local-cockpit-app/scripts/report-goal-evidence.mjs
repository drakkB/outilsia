#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const reportsDir = join(repoRoot, "reports");
const outDirDefault = reportsDir;

function usage() {
  console.log(`Usage:
  node scripts/report-goal-evidence.mjs [--out-dir <dir>] [--fail-on-incomplete]

Builds a requirement-by-requirement evidence report for the active Local Cockpit goal.`);
}

function parseArgs(argv) {
  const opts = { outDir: outDirDefault, failOnIncomplete: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--out-dir") {
      opts.outDir = resolve(argv[++i] || "");
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

function readText(path) {
  return readFileSync(path, "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function includesAll(path, patterns) {
  if (!existsSync(path)) return { ok: false, missing: [`missing ${relative(repoRoot, path)}`] };
  const text = readText(path);
  const missing = patterns.filter((pattern) => !text.includes(pattern));
  return { ok: missing.length === 0, missing };
}

function latestFile(prefix, extension = ".json") {
  if (!existsSync(reportsDir)) return null;
  const files = readdirSync(reportsDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(extension))
    .map((name) => {
      const path = join(reportsDir, name);
      return { name, path, mtimeMs: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0] || null;
}

function fileSize(path) {
  return existsSync(path) ? statSync(path).size : 0;
}

function add(rows, area, requirement, status, evidence, next = "") {
  rows.push({ area, requirement, status, evidence, next });
}

function statusRank(status) {
  return { proved: 0, partial: 1, incomplete: 2, blocked_external: 3, missing: 4 }[status] ?? 9;
}

function localCockpitEvidence() {
  const rows = [];
  const appJs = join(appRoot, "src", "app.js");
  const css = join(appRoot, "src", "styles.css");
  const scannedVerifier = join(appRoot, "scripts", "verify-scanned-state-ui.py");
  const visualVerifier = join(appRoot, "scripts", "verify-visual-ui.py");
  const page = join(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html");
  const downloadVerifier = join(appRoot, "scripts", "verify-download-page-contract.mjs");
  const memoryNative = join(appRoot, "src-tauri", "src", "lib.rs");
  const gscAudit = latestFile("gsc_coverage_audit_", ".json");
  const gscActionPack = latestFile("gsc_action_pack_", ".md");
  const sitemapAudit = latestFile("sitemap_url_audit_", ".json");
  const ctrPagesAudit = latestFile("local_cockpit_ctr_pages_audit_", ".json");
  const seoMonitor = latestFile("local_cockpit_seo_monitor_", ".json");
  const falseLinks = latestFile("false_js_links_", ".json");
  const releaseFreshness = latestFile("local_cockpit_release_freshness_", ".json");

  const ux = includesAll(appJs, [
    "operationLive",
    "setOperationLive(true)",
    "finishOperationMonitor(",
    "setWorkspaceTab(",
    "WORKSPACE_TAB_STORAGE_KEY",
    "renderEssentialFocus(",
    "essential-active-panel",
    "nextAction",
  ]);
  const uxCss = includesAll(css, [
    ".operation-monitor:not(.operation-live) #operationJumpBtn",
    "display: none",
  ]);
  const uxScanned = includesAll(scannedVerifier, [
    "monitorLive",
    "jumpVisible",
    "visible_tools",
    "cancelVisible",
  ]);
  add(
    rows,
    "UX",
    "Mode Essentiel reduit le bruit, garde la console seulement quand utile, et rend la prochaine action visible.",
    ux.ok && uxCss.ok && uxScanned.ok ? "proved" : "partial",
    [
      ux.ok ? "app.js contient l'etat operationLive, nextAction et panneaux essentiels" : `app.js manque ${ux.missing.join(", ")}`,
      uxCss.ok ? "CSS masque Voir console hors operation-live" : `styles.css manque ${uxCss.missing.join(", ")}`,
      uxScanned.ok ? "verify-scanned couvre monitor live, jump, cancel et panneaux visibles" : `verify-scanned manque ${uxScanned.missing.join(", ")}`,
    ].join("; "),
    "Relancer npm run verify:visual:scanned apres chaque changement UX."
  );

  const mobileArtifacts = [
    join(appRoot, ".artifacts", "visual-ui", "local-cockpit-scanned-desktop.png"),
    join(appRoot, ".artifacts", "visual-ui", "local-cockpit-scanned-mobile.png"),
    join(repoRoot, "server-work", "static", "images", "local-cockpit", "local-cockpit-scanned-desktop-20260703.png"),
    join(repoRoot, "server-work", "static", "images", "local-cockpit", "local-cockpit-scanned-mobile-20260703.png"),
  ];
  const visual = includesAll(visualVerifier, ["desktop", "mobile", "390", "1440"]);
  const missingArtifacts = mobileArtifacts.filter((path) => fileSize(path) <= 0).map((path) => relative(repoRoot, path));
  add(
    rows,
    "UX",
    "Mobile et petits ecrans verifies par captures.",
    visual.ok && missingArtifacts.length === 0 ? "proved" : "partial",
    visual.ok && missingArtifacts.length === 0 ? "captures desktop/mobile locales et statiques presentes" : `manque ${[...visual.missing, ...missingArtifacts].join(", ")}`,
    "Relancer npm run verify:visual et npm run verify:visual:scanned apres rebuild UI."
  );

  const arena = includesAll(appJs, [
    "function arenaProfileScore(",
    "function arenaWinners(",
    "const successful = results.filter((item) => item.success)",
    "failed",
    "fastest",
    "assistant",
    "compromise",
    "arenaDisplayScore(",
    "Meilleur assistant",
    "Meilleur compromis",
  ]);
  const arenaVerifier = includesAll(scannedVerifier, [
    "undefined/100",
    "failed_winners",
    "hermes3:8b",
    "qwen3:0.6b",
    "compromise should not over-reward tiny fast model",
  ]);
  add(
    rows,
    "Arena locale",
    "Scores coherents par usage, aucun modele echoue recommande, rapide/assistant/compromis explicites.",
    arena.ok && arenaVerifier.ok ? "proved" : "partial",
    arena.ok && arenaVerifier.ok ? "app.js et verifier couvrent profils, exclusion des echecs et libelles de gagnants" : `manque ${[...arena.missing, ...arenaVerifier.missing].join(", ")}`,
    "Conserver un test qui simule score undefined et modele echoue."
  );

  const memoryApp = includesAll(appJs, [
    "MANIFESTE.md",
    "MemoryForge prêt pour Obsidian",
    "00-Machine.md",
    "01-Modeles-compatibles.md",
    "03-Benchmarks.md",
    "function cockpitMemoryMarkdown(",
    "function readinessMarkdown(",
  ]);
  const memoryRust = includesAll(memoryNative, [
    "MANIFESTE.md",
    "vault_manifest_markdown",
    "write_vault_file",
    "10-Journal-cockpit",
  ]);
  const memoryVerifier = includesAll(scannedVerifier, [
    "MANIFESTE.md",
    "MemoryForge prêt pour Obsidian",
    "00-Machine.md",
    "03-Benchmarks.md",
  ]);
  add(
    rows,
    "MemoryForge / Obsidian",
    "Export vault propre avec fiches machine, modeles, benchmarks et bouton lisible.",
    memoryApp.ok && memoryRust.ok && memoryVerifier.ok ? "proved" : "partial",
    memoryApp.ok && memoryRust.ok && memoryVerifier.ok ? "fallback JS, export natif Rust et verifier couvrent le manifeste vault" : `manque ${[...memoryApp.missing, ...memoryRust.missing, ...memoryVerifier.missing].join(", ")}`,
    "Verifier encore sur recette native Windows apres rebuild."
  );

  let seoStatus = "missing";
  let seoEvidence = "rapport SEO introuvable";
  if (seoMonitor) {
    const seo = readJson(seoMonitor.path);
    const passed = Number(seo.summary?.passed ?? seo.passed ?? 0);
    const failed = Number(seo.summary?.failed ?? seo.failed ?? 0);
    seoStatus = failed === 0 && passed >= 20 ? "proved" : "partial";
    seoEvidence = `${relative(repoRoot, seoMonitor.path)} passed=${passed} failed=${failed}`;
  }
  const pageSignals = includesAll(page, [
    "Build Windows public vérifiable",
    "Captures issues du dernier état UI vérifié",
    "local-cockpit-scanned-desktop-20260703.png?v=202607032140",
    "local-cockpit-scanned-mobile-20260703.png?v=202607032140",
  ]);
  const downloadContract = includesAll(downloadVerifier, [
    "Build Windows public vérifiable",
    "local-cockpit-scanned-desktop-20260703.png?v=202607032140",
  ]);
  let ctrStatus = "missing";
  let ctrEvidence = "audit pages CTR introuvable";
  if (ctrPagesAudit) {
    const report = readJson(ctrPagesAudit.path);
    const ok = Number(report.summary?.ok ?? 0);
    const failed = Number(report.summary?.failed ?? 0);
    ctrStatus = ok >= 5 && failed === 0 ? "proved" : "partial";
    ctrEvidence = `${relative(repoRoot, ctrPagesAudit.path)} ok=${ok} failed=${failed}`;
  }
  add(
    rows,
    "Page site + SEO",
    "Screenshots dernier etat, teaser Local Cockpit et titres/meta surveilles.",
    seoStatus === "proved" && ctrStatus === "proved" && pageSignals.ok && downloadContract.ok ? "proved" : "partial",
    [seoEvidence, ctrEvidence, pageSignals.ok ? "page download contient screenshots/garde-fous" : `page manque ${pageSignals.missing.join(", ")}`, downloadContract.ok ? "contrat download couvre screenshots et garde-fous" : `contrat manque ${downloadContract.missing.join(", ")}`].join("; "),
    "Continuer suivi CTR Search Console sur pages Gemini/Claude/IA gratuite."
  );

  let falseLinkStatus = "missing";
  let falseLinkEvidence = "rapport faux liens introuvable";
  if (falseLinks) {
    const report = readJson(falseLinks.path);
    const findings = Number(report.findings_count ?? report.findings?.length ?? 0);
    falseLinkStatus = findings === 0 ? "proved" : "partial";
    falseLinkEvidence = `${relative(repoRoot, falseLinks.path)} findings=${findings}`;
  }
  add(
    rows,
    "Search Console",
    "Faux liens JS surveilles et actuellement propres.",
    falseLinkStatus,
    falseLinkEvidence,
    "Relancer scan_false_js_links si GSC remonte de nouvelles URLs techniques."
  );

  let sitemapStatus = "missing";
  let sitemapEvidence = "audit sitemap introuvable";
  if (sitemapAudit) {
    const report = readJson(sitemapAudit.path);
    const summary = report.summary || {};
    const checked = Number(summary.checked ?? 0);
    const broken = Number(summary.broken_count ?? 0);
    const redirected = Number(summary.redirected_count ?? 0);
    sitemapStatus = checked > 0 && broken === 0 ? "proved" : "partial";
    sitemapEvidence = `${relative(repoRoot, sitemapAudit.path)} checked=${checked} broken=${broken} redirected=${redirected}`;
  }
  add(
    rows,
    "Search Console",
    "Sitemap public verifie sans 404/5xx visibles.",
    sitemapStatus,
    sitemapEvidence,
    sitemapStatus === "proved" ? "Relancer scripts/audit_sitemap_urls.py apres changement sitemap ou routes." : "Corriger les URLs cassees du sitemap puis relancer l'audit."
  );

  let gscStatus = "missing";
  let gscEvidence = "audit GSC introuvable";
  let gscNext = "Exporter Search Console URL par URL.";
  if (gscAudit) {
    const report = readJson(gscAudit.path);
    const classification = report.classification || {};
    const status = report.actionable_status || report.status || classification.status || "";
    const detailed = Number(report.detailed_url_count ?? 0);
    const actionNeeded = Number(report.action_needed_total ?? classification.action_needed_total ?? 0);
    const liveChecked = report.live_checked === true;
    const liveSummary = report.live_summary || {};
    const checked = Number(liveSummary.checked ?? 0);
    const broken = Number(liveSummary.broken_count ?? 0);
    const redirected = Number(liveSummary.redirected_count ?? 0);
    const detailReady = status === "DETAIL_URLS_PRESENT" && detailed > 0;
    gscStatus = detailReady && liveChecked && checked === detailed && broken === 0 ? "proved" : detailReady ? "partial" : "blocked_external";
    gscEvidence = `${relative(repoRoot, gscAudit.path)} status=${status} detailed_urls=${detailed} live_checked=${liveChecked} checked=${checked} broken=${broken} redirected=${redirected} action_needed=${actionNeeded}`;
    if (gscActionPack) gscEvidence += `; action_pack=${relative(repoRoot, gscActionPack.path)}`;
    gscNext = status === "AGGREGATE_ONLY"
      ? "Dans Search Console, exporter les exemples URL par URL pour Exploree/Detectee non indexee et 404."
      : gscStatus === "proved"
        ? "Dans Search Console, demander la validation : les exemples fournis sont tous joignables en 200 aujourd'hui."
        : "Lancer l'audit avec --live-check sur l'export detaille.";
  }
  add(rows, "Search Console", "404 et pages non indexees doivent etre validables URL par URL.", gscStatus, gscEvidence, gscNext);

  let releaseStatus = "missing";
  let releaseEvidence = "rapport release freshness introuvable";
  if (releaseFreshness) {
    const report = readJson(releaseFreshness.path);
    releaseStatus = report.status === "CURRENT_PUBLIC_RELEASE" ? "proved" : "blocked_external";
    releaseEvidence = `${relative(repoRoot, releaseFreshness.path)} status=${report.status} build=${report.release?.build_id || ""}`;
  }
  add(
    rows,
    "Release",
    "Le binaire public Windows doit contenir les derniers correctifs avant cloture.",
    releaseStatus,
    releaseEvidence,
    releaseStatus === "proved" ? "Conserver verify:release:current et verify:release:prod:fresh avant chaque annonce." : "Rebuilder sur Windows avec npm run release:beta:windows puis verifier verify:release:current."
  );

  return rows;
}

function writeMarkdown(report, path) {
  const lines = [];
  lines.push("# Local Cockpit Goal Evidence Audit");
  lines.push("");
  lines.push(`- Generated: \`${report.generated_at}\``);
  lines.push(`- Overall: \`${report.overall_status}\``);
  lines.push(`- Proved: \`${report.summary.proved}\``);
  lines.push(`- Partial: \`${report.summary.partial}\``);
  lines.push(`- Blocked external: \`${report.summary.blocked_external}\``);
  lines.push(`- Missing: \`${report.summary.missing}\``);
  lines.push("");
  lines.push("## Requirements");
  lines.push("");
  lines.push("| Area | Requirement | Status | Evidence | Next |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of report.rows) {
    lines.push(`| ${row.area} | ${row.requirement} | \`${row.status}\` | ${row.evidence.replaceAll("|", "\\|")} | ${row.next.replaceAll("|", "\\|")} |`);
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  if (report.overall_status === "GOAL_NOT_COMPLETE") {
    const blocked = report.rows.filter((row) => row.status === "blocked_external");
    lines.push("- The goal must stay active.");
    if (blocked.length) {
      lines.push(`- Current external blocker(s): ${blocked.map((row) => `${row.area}: ${row.requirement}`).join("; ")}.`);
    }
    lines.push("- Local UX/Arena/MemoryForge/SEO/release evidence is strong, but final closure still needs every row proved.");
  } else {
    lines.push("- All requirements are currently proved by direct evidence.");
  }
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rows = localCockpitEvidence().sort((a, b) => statusRank(b.status) - statusRank(a.status));
  const summary = {
    proved: rows.filter((row) => row.status === "proved").length,
    partial: rows.filter((row) => row.status === "partial").length,
    blocked_external: rows.filter((row) => row.status === "blocked_external").length,
    missing: rows.filter((row) => row.status === "missing").length,
  };
  const overall = rows.every((row) => row.status === "proved") ? "GOAL_COMPLETE_EVIDENCE_READY" : "GOAL_NOT_COMPLETE";
  const report = {
    generated_at: new Date().toISOString(),
    overall_status: overall,
    summary,
    rows,
  };
  mkdirSync(opts.outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const jsonPath = join(opts.outDir, `local_cockpit_goal_evidence_audit_${stamp}.json`);
  const mdPath = join(opts.outDir, `local_cockpit_goal_evidence_audit_${stamp}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeMarkdown(report, mdPath);
  console.log(`goal_evidence_${overall.toLowerCase()} json=${relative(repoRoot, jsonPath)} md=${relative(repoRoot, mdPath)} proved=${summary.proved} partial=${summary.partial} blocked_external=${summary.blocked_external} missing=${summary.missing}`);
  if (overall !== "GOAL_COMPLETE_EVIDENCE_READY" && opts.failOnIncomplete) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
