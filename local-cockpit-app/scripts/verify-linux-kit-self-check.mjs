#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = existsSync("/mnt/c/Users/chris/Desktop") ? "/mnt/c/Users/chris/Desktop" : join(process.env.HOME || ".", "Desktop");
const kitDir = join(desktopRoot, "OutilsIA-Local-Cockpit-Linux-Build-Kit");

function fail(message) {
  throw new Error(message);
}

function assertFile(path, minBytes = 1) {
  if (!existsSync(path)) fail(`missing file: ${path}`);
  const size = statSync(path).size;
  if (size < minBytes) fail(`file too small: ${path} (${size} bytes)`);
  return size;
}

function read(path) {
  assertFile(path);
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

function readJson(path) {
  return JSON.parse(read(path));
}

const psPath = join(kitDir, "VERIFIER-KIT-LINUX-WINDOWS.ps1");
const cmdPath = join(kitDir, "VERIFIER-KIT-LINUX.cmd");
const jsonPath = join(kitDir, "LINUX-KIT-SELF-CHECK.json");
const mdPath = join(kitDir, "LINUX-KIT-SELF-CHECK.md");
const htmlPath = join(kitDir, "LINUX-KIT-SELF-CHECK.html");
const manifestPath = join(kitDir, "LINUX-BUILD-MANIFEST.txt");
const publicationChecklistJsonPath = join(kitDir, "LINUX-PUBLICATION-CHECKLIST.json");
const publicationChecklistMdPath = join(kitDir, "LINUX-PUBLICATION-CHECKLIST.md");
const publicationChecklistHtmlPath = join(kitDir, "LINUX-PUBLICATION-CHECKLIST.html");
const publicationChecklistCmdPath = join(kitDir, "OUVRIR-CHECKLIST-PUBLICATION-LINUX.cmd");
const terrainGateJsonPath = join(kitDir, "LINUX-TERRAIN-GATE.json");
const terrainGateMdPath = join(kitDir, "LINUX-TERRAIN-GATE.md");
const terrainGateHtmlPath = join(kitDir, "LINUX-TERRAIN-GATE.html");
const terrainGateCmdPath = join(kitDir, "OUVRIR-GATE-TERRAIN-LINUX.cmd");
const unblockChecklistJsonPath = join(kitDir, "LINUX-UNBLOCK-CHECKLIST.json");
const unblockChecklistMdPath = join(kitDir, "LINUX-UNBLOCK-CHECKLIST.md");
const unblockChecklistHtmlPath = join(kitDir, "LINUX-UNBLOCK-CHECKLIST.html");
const unblockChecklistCmdPath = join(kitDir, "OUVRIR-DEBLOCAGE-LINUX.cmd");
const preflightLocalJsonPath = join(kitDir, "LINUX-PREFLIGHT-LOCAL.json");
const preflightLocalMdPath = join(kitDir, "LINUX-PREFLIGHT-LOCAL.md");
const preflightLocalHtmlPath = join(kitDir, "LINUX-PREFLIGHT-LOCAL.html");
const preflightLocalCmdPath = join(kitDir, "OUVRIR-PREFLIGHT-LINUX.cmd");

assertFile(psPath);
assertFile(cmdPath);
assertFile(manifestPath);
assertFile(publicationChecklistJsonPath);
assertFile(publicationChecklistMdPath);
assertFile(publicationChecklistHtmlPath);
assertFile(publicationChecklistCmdPath);
assertFile(terrainGateJsonPath);
assertFile(terrainGateMdPath);
assertFile(terrainGateHtmlPath);
assertFile(terrainGateCmdPath);
assertFile(unblockChecklistJsonPath);
assertFile(unblockChecklistMdPath);
assertFile(unblockChecklistHtmlPath);
assertFile(unblockChecklistCmdPath);
assertFile(preflightLocalJsonPath);
assertFile(preflightLocalMdPath);
assertFile(preflightLocalHtmlPath);
assertFile(preflightLocalCmdPath);
if (!read(cmdPath).includes("VERIFIER-KIT-LINUX-WINDOWS.ps1")) {
  fail("VERIFIER-KIT-LINUX.cmd must call VERIFIER-KIT-LINUX-WINDOWS.ps1");
}

const result = spawnSync("powershell.exe", [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  "C:\\Users\\chris\\Desktop\\OutilsIA-Local-Cockpit-Linux-Build-Kit\\VERIFIER-KIT-LINUX-WINDOWS.ps1",
], { cwd: appRoot, encoding: "utf8" });

const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
if (result.status !== 0) {
  fail(`linux kit self-check failed with code ${result.status}: ${output}`);
}
if (!output.includes("linux_kit_self_check_windows")) {
  fail(`linux kit self-check output missing marker: ${output}`);
}

const report = readJson(jsonPath);
if (report.schema !== "outilsia.local_cockpit_linux_kit_self_check.v1") fail("unexpected Linux kit self-check schema");
if (report.status !== "LINUX_KIT_READY") fail(`Linux kit self-check not ready: ${report.status}`);
if (!report.version || !report.archive) fail("Linux kit self-check missing version or archive");
if (!/^[a-f0-9]{64}$/.test(String(report.expected_archive_sha256 || ""))) fail("expected archive sha invalid");
if (report.expected_archive_sha256 !== report.archive_sha256) fail("archive sha mismatch in self-check");
if (Number(report.archive_bytes || 0) < 100_000) fail("archive too small in self-check");
if ((report.missing || []).length) fail(`Linux kit self-check reports missing items: ${report.missing.join(", ")}`);
if (!String(report.github_actions_url || "").includes("github.com")) fail("self-check missing GitHub Actions URL");
if (!/^[0-9A-Za-z._-]{6,32}$/.test(String(report.public_build_id || ""))) fail("self-check missing public build id");
if (!String(report.linux_workflow_url || "").includes("local-cockpit-linux-beta.yml")) fail("self-check missing Linux workflow URL");
if (!String(report.cross_workflow_url || "").includes("local-cockpit-cross-platform-beta.yml")) fail("self-check missing cross-platform workflow URL");

const md = read(mdPath);
const html = read(htmlPath);
for (const needle of ["Verification kit Linux OutilsIA", "LINUX_KIT_READY", "SHA attendu", "SHA actuel", "Build Windows public"]) {
  if (!md.includes(needle) && !html.includes(needle)) fail(`Linux kit self-check report missing ${needle}`);
}

const publicationChecklist = readJson(publicationChecklistJsonPath);
if (publicationChecklist.schema !== "outilsia.local_cockpit_linux_publication_checklist.v1") {
  fail("unexpected Linux publication checklist schema");
}
for (const needle of [
  "import_beta_merge_linux",
  "verify_linux_artifacts",
  "verify_github_actions_linux_contract",
  "verify_release_contract_windows_x64_linux",
  "deploy_beta_public_release",
  "audit_beta_field_goal",
]) {
  if (!(publicationChecklist.required_contract || []).includes(needle)) {
    fail(`Linux publication checklist missing contract item ${needle}`);
  }
}
const publicationText = `${read(publicationChecklistMdPath)}\n${read(publicationChecklistHtmlPath)}\n${read(publicationChecklistCmdPath)}`;
for (const needle of [
  "Checklist publication Linux OutilsIA",
  "verify:github-actions:linux",
  "verify:release:contract -- --require-platform windows-x64 --require-platform linux",
  "VERIFIER-LINUX-RELEASE.cmd",
  "release.json",
  "LINUX-PUBLICATION-CHECKLIST.html",
]) {
  if (!publicationText.includes(needle)) fail(`Linux publication checklist missing ${needle}`);
}

const terrainGate = readJson(terrainGateJsonPath);
if (terrainGate.schema !== "outilsia.local_cockpit_linux_terrain_gate.v1") {
  fail("unexpected Linux terrain gate schema");
}
if (Number(terrainGate.required || 0) < 5) fail("Linux terrain gate must reference 5 required profiles");
if (Number(terrainGate.minimum_ready_before_linux_publication || 0) < 2) {
  fail("Linux terrain gate must require at least 2 Windows terrain profiles before publication");
}
if (typeof terrainGate.allowed_to_publish_linux_now !== "boolean") {
  fail("Linux terrain gate must expose allowed_to_publish_linux_now boolean");
}
const terrainText = `${read(terrainGateMdPath)}\n${read(terrainGateHtmlPath)}\n${read(terrainGateCmdPath)}`;
for (const needle of [
  "Gate terrain avant publication Linux",
  "Linux public suit après 1-2 cycles Windows terrain",
  "Publication Linux autorisée maintenant",
  "LINUX-TERRAIN-GATE.html",
]) {
  if (!terrainText.includes(needle)) fail(`Linux terrain gate missing ${needle}`);
}

const unblockChecklist = readJson(unblockChecklistJsonPath);
if (unblockChecklist.schema !== "outilsia.local_cockpit_linux_unblock_checklist.v1") {
  fail("unexpected Linux unblock checklist schema");
}
if (!unblockChecklist.terrain_gate || typeof unblockChecklist.terrain_gate.allowed_to_publish_linux_now !== "boolean") {
  fail("Linux unblock checklist must expose terrain gate status");
}
if (!unblockChecklist.local_wsl || !Array.isArray(unblockChecklist.local_wsl.missing_prerequisites)) {
  fail("Linux unblock checklist must expose WSL missing prerequisites");
}
if (!String(unblockChecklist.github_actions?.cross_platform_workflow_url || "").includes("local-cockpit-cross-platform-beta.yml")) {
  fail("Linux unblock checklist missing cross-platform workflow URL");
}
for (const needle of [
  "finish_minimum_windows_field_profiles_or_document_manual_override",
  "import_linux_with_merge",
  "verify_windows_x64_and_linux_contract",
  "publish_only_after_contract_and_audits",
]) {
  if (!(unblockChecklist.required_steps || []).includes(needle)) {
    fail(`Linux unblock checklist missing required step ${needle}`);
  }
}
const unblockText = `${read(unblockChecklistMdPath)}\n${read(unblockChecklistHtmlPath)}\n${read(unblockChecklistCmdPath)}`;
for (const needle of [
  "Checklist déblocage Linux OutilsIA",
  "LINUX-TERRAIN-GATE.html",
  "OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd",
  "IMPORTER-LINUX-ARTEFACT.cmd",
  "VERIFIER-LINUX-RELEASE.cmd",
  "Publier Linux large seulement si le gate terrain est ouvert",
  "OUVRIR-DEBLOCAGE-LINUX.cmd",
]) {
  if (!unblockText.includes(needle)) fail(`Linux unblock checklist missing ${needle}`);
}

const preflightLocal = readJson(preflightLocalJsonPath);
if (preflightLocal.schema !== "outilsia.local_cockpit_linux_preflight_local.v1") {
  fail("unexpected Linux local preflight schema");
}
if (!["ready", "blocked"].includes(preflightLocal.status)) {
  fail(`unexpected Linux local preflight status: ${preflightLocal.status}`);
}
if (!Array.isArray(preflightLocal.missing_prerequisites)) {
  fail("Linux local preflight must expose missing_prerequisites");
}
if (typeof preflightLocal.sudo_non_interactive !== "boolean") {
  fail("Linux local preflight must expose sudo_non_interactive");
}
if (!preflightLocal.sudo_status) {
  fail("Linux local preflight must expose sudo_status");
}
if (preflightLocal.install_command !== "bash scripts/install-linux-tauri-deps.sh") {
  fail("Linux local preflight missing dependency install command");
}
const preflightText = `${read(preflightLocalMdPath)}\n${read(preflightLocalHtmlPath)}\n${read(preflightLocalCmdPath)}`;
for (const needle of [
  "Préflight Linux local OutilsIA",
  "bash scripts/install-linux-tauri-deps.sh",
  "bash scripts/preflight-linux.sh",
  "npm run build:beta:linux",
  "Sudo non interactif",
  "sudo",
  "OUVRIR-WORKFLOW-CROSS-PLATFORM.cmd",
  "LINUX-PREFLIGHT-LOCAL.html",
]) {
  if (!preflightText.includes(needle)) fail(`Linux local preflight missing ${needle}`);
}

console.log(`linux_kit_self_check_verified status=${report.status} version=${report.version} archive_sha=${report.archive_sha256}`);
