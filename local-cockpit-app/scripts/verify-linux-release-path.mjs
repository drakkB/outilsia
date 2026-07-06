#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");

function fail(message) {
  throw new Error(message);
}

function read(path) {
  if (!existsSync(path)) fail(`missing file: ${path}`);
  return readFileSync(path, "utf8");
}

function assertContains(label, text, needles) {
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length) fail(`${label} missing: ${missing.join(", ")}`);
}

const linuxWorkflowPath = join(repoRoot, ".github", "workflows", "local-cockpit-linux-beta.yml");
const crossWorkflowPath = join(repoRoot, ".github", "workflows", "local-cockpit-cross-platform-beta.yml");
const packageJsonPath = join(appRoot, "package.json");
const importScriptPath = join(appRoot, "scripts", "import-beta-artifact.mjs");
const publishScriptPath = join(appRoot, "scripts", "publish-cross-platform-beta.mjs");
const testImportPath = join(appRoot, "scripts", "test-import-beta-merge.mjs");
const testPublishPath = join(appRoot, "scripts", "test-publish-cross-platform.mjs");
const linuxKitPath = join(appRoot, "scripts", "make-linux-build-kit.sh");
const linuxReadinessPath = join(repoRoot, "scripts", "audit_local_cockpit_linux_readiness.py");

const linuxWorkflow = read(linuxWorkflowPath);
assertContains("linux workflow", linuxWorkflow, [
  "workflow_dispatch:",
  "build_id:",
  "runs-on: ubuntu-24.04",
  "pkg-config",
  "libdbus-1-dev",
  "libglib2.0-dev",
  "libgtk-3-dev",
  "libwebkit2gtk-4.1-dev",
  "npm ci",
  "Resolve public build id",
  "GITHUB_ENV",
  "OUTILSIA_BUILD_ID=$BUILD_ID",
  "npm run build:beta:linux",
  "npm run verify:linux:artifacts",
  "outilsia-local-cockpit-linux-web-release",
  "outilsia-local-cockpit-linux-tauri-bundles",
]);

const crossWorkflow = read(crossWorkflowPath);
assertContains("cross-platform workflow", crossWorkflow, [
  "workflow_dispatch:",
  "OUTILSIA_BUILD_ID:",
  "deploy_to_vps:",
  "build-windows:",
  "build-linux:",
  "merge-release:",
  "runs-on: windows-latest",
  "runs-on: ubuntu-24.04",
  "local-cockpit-windows-web-release",
  "local-cockpit-linux-web-release",
  "npm run import:beta -- --input .artifacts/windows --replace",
  "npm run import:beta -- --input .artifacts/linux --merge",
  "npm run deploy:beta -- --release-dir ../server-work/static/downloads/local-cockpit",
  "npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux",
  "OUTILSIA_DEPLOY_SSH_KEY",
  "OUTILSIA_DEPLOY_HOST",
  "OUTILSIA_DEPLOY_USER",
  "OUTILSIA_DEPLOY_REMOTE_DIR",
  "--remote outilsia-deploy",
  "--deploy",
  "npm run verify:release:prod",
  "local-cockpit-cross-platform-web-release",
]);

const packageJson = read(packageJsonPath);
assertContains("package scripts", packageJson, [
  "\"build:beta:linux\"",
  "\"verify:linux:artifacts\"",
  "\"verify:github-actions:linux\"",
  "\"import:beta\"",
  "\"publish:cross-platform\"",
  "\"test:import:merge\"",
  "\"test:publish:cross-platform\"",
]);

const importScript = read(importScriptPath);
assertContains("import beta artifact", importScript, [
  "--merge",
  "--replace",
  "artifact_merged",
  "downloads_by_platform",
  "choosePrimaryDownload",
  "assertMergeCompatible",
  "linux_merge_version_guard",
]);

const publishScript = read(publishScriptPath);
assertContains("publish cross platform", publishScript, [
  "--windows",
  "--linux",
  "import-beta-artifact.mjs",
  "--merge",
  "verify-release-contract.mjs",
  "verify-linux-artifacts.sh",
  "enforceLinuxPublicDeployGate",
  "minimum_ready_before_linux_publication",
  "--force-terrain-override",
  "Linux public deploy blocked",
  "deploy-beta-release.mjs",
]);

assertContains("import merge test", read(testImportPath), [
  "import_beta_merge_ok",
  "--merge",
  "runExpectFailure",
  "linux_merge_version_guard",
  "verifyLinuxArtifacts",
  "linux_artifacts_verified",
]);
assertContains("publish cross-platform test", read(testPublishPath), [
  "publish_cross_platform_test_ok",
  "Linux public deploy blocked",
  "OUTILSIA_FIELD_STATUS_JSON",
  "linux",
  "windows-x64",
]);
assertContains("linux build kit", read(linuxKitPath), [
  "outilsia-local-cockpit-linux-source.tar.gz",
  "LINUX-RELEASE-RUNBOOK.md",
  "LINUX-RELEASE-MISSION.html",
  "LINUX-START-HERE.html",
  "CENTRE-RELEASE-LINUX.html",
  "GITHUB-ACTIONS-URL.txt",
  "GITHUB-ACTIONS-URL.example.txt",
  "CONFIGURER-GITHUB-ACTIONS-URL.cmd",
  "LINUX-PUBLICATION-CHECKLIST.json",
  "LINUX-PUBLICATION-CHECKLIST.md",
  "LINUX-PUBLICATION-CHECKLIST.html",
  "OUVRIR-CHECKLIST-PUBLICATION-LINUX.cmd",
  "LINUX-TERRAIN-GATE.json",
  "LINUX-TERRAIN-GATE.md",
  "LINUX-TERRAIN-GATE.html",
  "OUVRIR-GATE-TERRAIN-LINUX.cmd",
  "LINUX-UNBLOCK-CHECKLIST.json",
  "LINUX-UNBLOCK-CHECKLIST.md",
  "LINUX-UNBLOCK-CHECKLIST.html",
  "OUVRIR-DEBLOCAGE-LINUX.cmd",
  "LINUX-PREFLIGHT-LOCAL.json",
  "LINUX-PREFLIGHT-LOCAL.md",
  "LINUX-PREFLIGHT-LOCAL.html",
  "OUVRIR-PREFLIGHT-LINUX.cmd",
  "IMPORTER-LINUX-ARTEFACT.cmd",
  "VERIFIER-LINUX-RELEASE.cmd",
  "OUVRIR-RUNBOOK.cmd",
  "OUVRIR-MISSION-LINUX.cmd",
  "OUVRIR-START-HERE-LINUX.cmd",
  "OUVRIR-CENTRE-RELEASE-LINUX.cmd",
  "OUVRIR-GITHUB-ACTIONS.cmd",
  "GitHub Actions web",
  "npm run build:beta:linux",
  "npm run verify:linux:artifacts",
  "--merge",
  "verify:release:contract -- --require-platform windows-x64 --require-platform linux",
  "audit_beta_field_goal.py",
  "deploy_to_vps=true",
]);
assertContains("linux readiness audit", read(linuxReadinessPath), [
  "github_actions_linux_workflow",
  "github_actions_cross_platform_workflow",
  "missing_prerequisites",
  "publication_checklist_ok",
  "terrain_gate_ok",
  "preflight_local_ok",
  "public_linux_release_missing",
]);

console.log("linux_release_path_ok workflow=linux,cross-platform import=merge publish=ready");
