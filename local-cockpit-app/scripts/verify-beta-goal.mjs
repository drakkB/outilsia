#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const releaseDir = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");
const releaseJsonPath = join(releaseDir, "release.json");
const evidencePath = join(appRoot, ".artifacts", "windows-native-recipe.json");
const checks = [];

function readText(path) {
  return readFileSync(path, "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function add(id, ok, detail, next = "") {
  checks.push({ id, ok: Boolean(ok), detail, next });
}

function hasCommand(command) {
  return spawnSync("bash", ["-lc", `command -v ${command}`], { encoding: "utf8" }).status === 0;
}

function includesAll(path, patterns) {
  if (!existsSync(path)) return { ok: false, missing: [`missing ${path}`] };
  const text = readText(path);
  const missing = patterns.filter((pattern) => !text.includes(pattern));
  return { ok: missing.length === 0, missing };
}

function freshnessOk(release) {
  if (!release?.freshness) return { ok: false, reason: "Missing release.freshness" };
  if (release.freshness.stale !== false) return { ok: false, reason: "release.freshness.stale must be false" };
  if (release.freshness.allow_stale === true) return { ok: false, reason: "release.freshness.allow_stale must not be true" };
  if (!release.freshness.newest_source_mtime_ms || !release.freshness.oldest_artifact_mtime_ms) {
    return { ok: false, reason: "release.freshness timestamps missing" };
  }
  if (Number(release.freshness.oldest_artifact_mtime_ms) < Number(release.freshness.newest_source_mtime_ms)) {
    return { ok: false, reason: "release artifact older than source" };
  }
  return { ok: true, reason: `source=${release.freshness.newest_source || "?"} artifact=${release.freshness.oldest_artifact || "?"}` };
}

function checkRelease() {
  if (!existsSync(releaseJsonPath)) {
    add("release_json", false, "release.json absent", "Run npm run release:beta:windows on Windows.");
    return null;
  }
  const release = readJson(releaseJsonPath);
  const primary = release.primary_download || {};
  const primaryPath = primary.name ? join(releaseDir, primary.name) : "";
  add("release_basic", release.ok === true && release.product === "OutilsIA Local Cockpit" && release.channel === "beta", `${release.version || "no version"} ${release.channel || "no channel"}`, "Package a beta release.");
  add("release_primary_file", Boolean(primaryPath && existsSync(primaryPath)), primary.name || "primary missing", "Rebuild and package the Windows setup.");
  add("release_platform", primary.platform === "windows-x64", primary.platform || "no platform", "Publish a Windows x64 primary setup.");
  const fresh = freshnessOk(release);
  add("release_freshness", fresh.ok, fresh.reason, "Rebuild Windows, then npm run package:beta so release.freshness is written.");
  return release;
}

function checkStaticWiring() {
  const appJs = join(appRoot, "src", "app.js");
  const report = includesAll(appJs, [
    "function readinessReport()",
    "function readinessMarkdown(",
    "recommended_model",
    "PromptForge",
    "Upgrade utile",
    "Prochaines actions",
    "copyReadinessReport",
    "saveReadinessToAccount",
    "shareReadinessReport",
  ]);
  add("report_shareable_wiring", report.ok, report.ok ? "score/model/benchmark/prompt/upgrade/actions wired" : `missing ${report.missing.join(", ")}`, "Restore readiness report wiring.");

  const flow = includesAll(appJs, [
    "async function prepareLocalAiFlow()",
    "Étape 1/9",
    "Étape 5/9",
    "deuxième modèle recommandé",
    "PromptForge local",
    "Dialogue local",
    "Arena locale",
    "Rapport final",
  ]);
  add("guided_flow_wiring", flow.ok, flow.ok ? "9-step native assistant wired" : `missing ${flow.missing.join(", ")}`, "Restore guided assistant flow.");

  const releaseScript = includesAll(join(appRoot, "scripts", "release-windows-beta.ps1"), [
    "build-windows-beta.ps1",
    "package:beta",
    "--require-freshness",
    "verify-windows-artifacts.ps1",
    "Verification deploy dry-run",
    "make-windows-test-kit.ps1",
  ]);
  add("windows_release_orchestrator", releaseScript.ok, releaseScript.ok ? "build/package/freshness/verify/kit wired" : `missing ${releaseScript.missing.join(", ")}`, "Fix scripts/release-windows-beta.ps1.");

  const testKit = includesAll(join(appRoot, "scripts", "make-windows-test-kit.ps1"), [
    "RECETTE-MANUELLE.md",
    "qwen3:0.6b",
    "Deuxieme modele recommande",
    "Rapport machine prete",
    "public_release_freshness_ok",
  ]);
  add("windows_test_kit", testKit.ok, testKit.ok ? "manual native recipe covers full path" : `missing ${testKit.missing.join(", ")}`, "Fix scripts/make-windows-test-kit.ps1.");
}

function checkNativeEvidence(release) {
  if (!existsSync(evidencePath)) {
    add("native_recipe_evidence", false, `missing ${evidencePath}`, "After Windows testing, save the completed recipe JSON at this path.");
    return;
  }
  const evidence = readJson(evidencePath);
  add("native_recipe_ok", evidence.ok === true && evidence.release_freshness_ok === true, `ok=${Boolean(evidence.ok)} freshness=${Boolean(evidence.release_freshness_ok)}`, "Set ok and release_freshness_ok to true after the Windows recipe.");
  const flow = evidence.native_flow || {};
  const requiredFlow = ["scan", "ollama_install_or_ready", "qwen_install_or_ready", "qwen_benchmark", "promptforge", "dialogue", "arena", "readiness_report"];
  const missingFlow = requiredFlow.filter((key) => flow[key] !== true);
  add("native_flow_evidence", missingFlow.length === 0, missingFlow.length ? `missing ${missingFlow.join(", ")}` : "full native path proven", "Complete the Windows native recipe.");

  const second = evidence.second_model || {};
  add("second_model_evidence", Boolean(second.ref && (second.installed === true || second.benchmarked === true)), second.ref || "no second model", "Install or benchmark the second recommended model.");

  const report = evidence.report || {};
  const reportRequired = ["has_score", "has_best_model", "has_speed", "has_prompt", "has_upgrade", "has_next_actions", "copied", "saved_account", "shared"];
  const missingReport = reportRequired.filter((key) => report[key] !== true);
  add("shareable_report_evidence", missingReport.length === 0, missingReport.length ? `missing ${missingReport.join(", ")}` : "shareable report proven", "Complete copy/save/share checks in the app.");

  if (release?.build_id && evidence.build_id) {
    add("evidence_matches_release", evidence.build_id === release.build_id, `evidence=${evidence.build_id} release=${release.build_id}`, "Use the current public build for the Windows recipe.");
  } else {
    add("evidence_matches_release", false, "missing build_id in release or evidence", "Record build_id in windows-native-recipe.json.");
  }
}

function printResult() {
  for (const check of checks) {
    const marker = check.ok ? "ok" : "todo";
    console.log(`${marker}: ${check.id} - ${check.detail}`);
    if (!check.ok && check.next) console.log(`  next: ${check.next}`);
  }
  const failed = checks.filter((check) => !check.ok);
  if (failed.length) {
    console.error(`beta_goal_not_complete ${failed.length}/${checks.length} pending`);
    process.exit(1);
  }
  console.log(`beta_goal_ready ${checks.length} checks`);
}

const release = checkRelease();
checkStaticWiring();
add("windows_shell_available", hasCommand("powershell") || hasCommand("pwsh") || hasCommand("powershell.exe"), "PowerShell required for native Windows build/test", "Run npm run release:beta:windows on a Windows machine.");
checkNativeEvidence(release);
printResult();
