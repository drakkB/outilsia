#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function text(name) {
  return readFileSync(join(appRoot, "scripts", name), "utf8");
}

function fail(message) {
  throw new Error(message);
}

function requireAll(source, values, label) {
  for (const value of values) {
    if (!source.includes(value)) fail(`${label} missing ${value}`);
  }
}

const importer = text("import-release-candidate-smoke.mjs");
const evidence = text("rc-smoke-evidence.mjs");
const promotion = text("promote-release-candidate.mjs");
const deploy = text("deploy-beta-release.mjs");
const rollback = text("rollback-beta-release.mjs");
const kit = text("make-release-candidate-kit.mjs");

requireAll(importer, [
  "Shared report URL is already attached to another RC smoke run",
  "Shared report body is reused across different RC smoke machines",
  "Source recipe SHA256 does not match the machine result",
  "RC_SMOKE_GATE_READY",
  "promotion_authorized: false",
  "full_terrain_gate_complete: false",
], "RC smoke importer");
requireAll(evidence, [
  "shared report body hash changed since machine validation",
  "machine.anchor_sha256 is invalid",
], "RC smoke evidence");
requireAll(promotion, [
  'decision.decision !== "approve_public_beta"',
  "validateSmokeRegistry",
  "publish_exact_rc_artifact_bytes",
  "windows_signing_status_acknowledged",
  "promotedCodeSigning",
  "code_signing: codeSigning",
  "exact_artifact_bytes: true",
  "public_deploy_executed: false",
  "syncDownloadPage",
], "RC promotion");
if (/\bscp\b|\bssh\b|--deploy\b|deploy-beta-release/.test(promotion)) {
  fail("RC promotion preparation must not contain a deployment surface");
}
requireAll(deploy, [
  "automatic_release_rollback_applied",
  "remote_active_release_ok",
  "rollback_backup:",
  "trap 'rollback_release' ERR",
  "validatePromotionProof",
  "requireRollbackSource",
  "DEPLOYMENT-RECEIPT.json",
], "deployment");
const pageActivation = deploy.indexOf('`mv -f ${shellQuote(`${stagingDir}/${basename(remotePagePath)}`)}');
const manifestActivation = deploy.indexOf('`mv -f ${shellQuote(`${stagingDir}/release.json`)}');
const activeVerification = deploy.indexOf("remote_active_release_ok");
if (pageActivation < 0 || manifestActivation < 0 || pageActivation > manifestActivation) {
  fail("Deployment must activate the staged page before release.json");
}
if (activeVerification < 0 || activeVerification > manifestActivation) {
  fail("Deployment must define post-activation verification before command assembly");
}
requireAll(rollback, [
  "expected-current-build",
  "rollback_source_ok",
  "rollback_active_ok",
  "failed_rollback_restored_current_release",
  "dry_run=true",
], "rollback");
requireAll(kit, [
  "RC-KIT-MANIFEST.json",
  "RECETTE-SOURCE.json",
  "anchor_sha256",
  "fingerprint_sha256",
  "manifest_sha256",
  "artifact_set_sha256",
  "AUTHENTICODE.json",
  "Get-AuthenticodeSignature",
  "CAMPAGNE-5-MACHINES.md",
  "core_i7_gtx_1080_ti",
  "old_laptop",
  "Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'",
], "RC field kit");

console.log("release_promotion_workflow_ok smoke_registry exact_bytes human_gate manifest_last rollback");
