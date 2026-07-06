#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const reportsRoot = join(repoRoot, "reports");
const desktopHtml = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-OBJECTIF-100.html";
const desktopCmd = "/mnt/c/Users/chris/Desktop/OUVRIR-OBJECTIF-100-OUTILSIA.cmd";

function fail(message) {
  throw new Error(message);
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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function requireText(path, needles) {
  if (!existsSync(path)) fail(`missing file: ${path}`);
  const text = readFileSync(path, "utf8");
  for (const needle of needles) {
    if (!text.includes(needle)) fail(`${path} missing ${needle}`);
  }
}

const reportPath = latest("goal_100_gate_");
const report = readJson(reportPath);
const progressPath = latest("goal_progress_");
const remainingPath = latest("goal_remaining_");
const closurePath = latest("goal_closure_guard_");
const progress = readJson(progressPath);
const remaining = readJson(remainingPath);
const closure = readJson(closurePath);
if (report.schema !== "outilsia.local_cockpit_goal_100_gate.v1") fail("bad goal 100 schema");

for (const value of [
  report.scores?.technical_now,
  report.scores?.weighted_now,
  report.scores?.field_gain_remaining,
  report.scores?.linux_gain_remaining,
]) {
  if (!Number.isFinite(Number(value))) fail(`non numeric score value: ${value}`);
}

if (report.audit?.progress_report !== progressPath) fail("goal 100 uses stale progress report");
if (report.audit?.remaining_report !== remainingPath) fail("goal 100 uses stale remaining report");
if (report.audit?.closure_guard_report !== closurePath) fail("goal 100 uses stale closure guard report");
if (report.scores.technical_now !== progress.scores?.technical_proof_percent) fail("technical score mismatch with progress report");
if (report.scores.weighted_now !== progress.scores?.weighted_product_percent) fail("weighted score mismatch with progress report");
if (report.field.ready !== progress.field?.ready || report.field.required !== progress.field?.required) fail("field progress mismatch with progress report");
if (report.linux.public_status !== progress.linux?.public_status) fail("linux public status mismatch with progress report");
const expectedComplete = report.scores.technical_now === 100
  && report.scores.weighted_now === 100
  && report.field.ready === report.field.required
  && report.linux.public_status === "public_linux_release_current"
  && remaining.missing_count === 0
  && closure.can_call_update_goal_complete === true;
if (report.complete !== expectedComplete) fail(`complete flag mismatch: expected=${expectedComplete} actual=${report.complete}`);
if (report.scores.core_contribution_now > 70) fail("core contribution cannot exceed 70/70");
if (report.scores.field_contribution_now > 20) fail("field contribution cannot exceed 20/20");
if (report.scores.linux_contribution_now > 10) fail("linux contribution cannot exceed 10/10");
if (report.scores.field_gain_remaining !== Math.max(0, Math.round((20 - report.scores.field_contribution_now) * 10) / 10)) fail("field remaining gain mismatch");
if (report.scores.linux_gain_remaining !== Math.max(0, Math.round((10 - report.scores.linux_contribution_now) * 10) / 10)) fail("linux remaining gain mismatch");
if (!report.complete && !Array.isArray(report.blockers)) fail("incomplete report should expose blockers");

requireText(reportPath.replace(/\.json$/, ".md"), [
  "objectif 100%",
  `Technique: **${report.scores.technical_now}/100**`,
  `Produit pondéré: **${report.scores.weighted_now}/100**`,
  "Terrain peut encore ajouter:",
  "Linux peut encore ajouter:",
  "FIELD-TESTS.json",
  "release.json public",
]);
requireText(reportPath.replace(/\.json$/, ".html"), [
  "Objectif 100%",
  "Technique",
  `${report.scores.technical_now}/100`,
  "Produit pondéré",
  `${report.scores.weighted_now}/100`,
  "Terrain physique",
  "Linux public",
]);
requireText(desktopHtml, [
  "Objectif 100%",
  `${report.scores.technical_now}/100`,
  `${report.scores.weighted_now}/100`,
  "Terrain physique",
  "Linux public",
]);
requireText(desktopCmd, [
  "OutilsIA-Local-Cockpit-OBJECTIF-100.html",
  "npm run report:goal-100",
]);

console.log(`goal_100_verified complete=${report.complete ? "yes" : "no"} technical=${report.scores.technical_now}/100 weighted=${report.scores.weighted_now}/100 field_gain=${report.scores.field_gain_remaining} linux_gain=${report.scores.linux_gain_remaining}`);
