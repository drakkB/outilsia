#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const reportsRoot = join(repoRoot, "reports");
const fieldStatusPath = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Field-Test-Kit/FIELD-TESTS-STATUS.json";

function fail(message) {
  throw new Error(message);
}

function readText(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function latest(prefix, ext = ".json") {
  if (!existsSync(reportsRoot)) fail(`missing reports directory: ${reportsRoot}`);
  const file = readdirSync(reportsRoot)
    .filter((name) => name.startsWith(prefix) && name.endsWith(ext))
    .sort()
    .at(-1);
  return file ? join(reportsRoot, file) : "";
}

function rel(path) {
  return path ? path.replace(`${repoRoot}/`, "") : "";
}

const remainingPath = latest("goal_remaining_");
if (!remainingPath) fail("missing goal_remaining_*.json");
const remainingMdPath = remainingPath.replace(/\.json$/, ".md");
if (!existsSync(remainingMdPath)) fail(`missing goal remaining markdown: ${remainingMdPath}`);
const remaining = readJson(remainingPath);
const remainingMd = readText(remainingMdPath);

const latestAudit = latest("beta_field_goal_audit_");
const latestLinux = latest("local_cockpit_linux_readiness_");
if (!latestAudit) fail("missing beta_field_goal_audit_*.json");
if (!latestLinux) fail("missing local_cockpit_linux_readiness_*.json");
if (!existsSync(fieldStatusPath)) fail(`missing field status: ${fieldStatusPath}`);

const field = readJson(fieldStatusPath);
const linux = readJson(latestLinux);

if (remaining.audit_report !== latestAudit) {
  fail(`goal remaining uses stale audit: ${rel(remaining.audit_report)} != ${rel(latestAudit)}`);
}
if (remaining.sources?.linux_readiness !== latestLinux) {
  fail(`goal remaining uses stale linux readiness: ${rel(remaining.sources?.linux_readiness || "")} != ${rel(latestLinux)}`);
}
if (remaining.sources?.field_status !== fieldStatusPath) {
  fail("goal remaining does not expose canonical field status path");
}
if (!Array.isArray(remaining.missing) || remaining.missing.length !== remaining.missing_count) {
  fail(`remaining blocker count mismatch: count=${remaining.missing_count} rows=${remaining.missing?.length}`);
}

const fieldRow = remaining.missing.find((row) => row.area === "Tests terrain multi-machines");
const linuxRow = remaining.missing.find((row) => row.area === "Release Linux");
if (!fieldRow) fail("missing field blocker row");
if (linux.public_status !== "public_linux_release_current" && !linuxRow) fail("missing linux blocker row");

const ready = Array.isArray(field.profiles_ready) ? field.profiles_ready.length : Number(field.ready || 0);
const required = Array.isArray(field.profiles_required) ? field.profiles_required.length : Number(field.required || 5);
const missingProfiles = Array.isArray(field.profiles_missing) ? field.profiles_missing : [];
for (const needle of [
  "FIELD-TESTS-STATUS.json",
  `ready=${ready}/${required}`,
  "ready_profiles=rtx_4080_4090",
  "missing_profiles=old_laptop,core_i7_gtx_1080_ti,rtx_3060_12gb,cpu_only",
  "next=old_laptop",
]) {
  if (!fieldRow.evidence.includes(needle)) fail(`field evidence missing ${needle}`);
  if (!remainingMd.includes(needle)) fail(`field markdown missing ${needle}`);
}
if (ready !== 1 || required !== 5 || missingProfiles.length !== 4) {
  fail(`unexpected field state: ready=${ready}/${required} missing=${missingProfiles.length}`);
}

if (linuxRow) {
  for (const needle of [
    rel(latestLinux),
    `status=${linux.status}`,
    `public=${linux.public_status}`,
    "kit=ok",
    "ci_import_path=ok",
  ]) {
    if (!linuxRow.evidence.includes(needle)) fail(`linux evidence missing ${needle}`);
    if (!remainingMd.includes(needle)) fail(`linux markdown missing ${needle}`);
  }
} else if (!remainingMd.includes("Release Linux") || !remainingMd.includes("proved")) {
  fail("remaining markdown should mention proved Linux release when no linux blocker remains");
}

for (const proof of [
  "FIELD-TESTS.json importé",
  "python3 scripts/audit_beta_field_goal.py",
]) {
  if (!remainingMd.includes(proof)) fail(`expected proof text missing: ${proof}`);
}

console.log(`goal_remaining_verified missing=${remaining.missing_count} audit=${rel(latestAudit)} linux=${rel(latestLinux)} field=${ready}/${required}`);
