#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = existsSync("/mnt/c/Users/chris/Desktop") ? "/mnt/c/Users/chris/Desktop" : join(process.env.HOME || ".", "Desktop");
const kitDir = join(desktopRoot, "OutilsIA-Local-Cockpit-Field-Test-Kit");

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

const psPath = join(kitDir, "VERIFIER-KIT-WINDOWS.ps1");
const cmdPath = join(kitDir, "VERIFIER-KIT.cmd");
const jsonPath = join(kitDir, "FIELD-KIT-SELF-CHECK.json");
const mdPath = join(kitDir, "FIELD-KIT-SELF-CHECK.md");
const htmlPath = join(kitDir, "FIELD-KIT-SELF-CHECK.html");

assertFile(psPath);
assertFile(cmdPath);
if (!read(cmdPath).includes("VERIFIER-KIT-WINDOWS.ps1")) {
  fail("VERIFIER-KIT.cmd must call VERIFIER-KIT-WINDOWS.ps1");
}

const result = spawnSync("powershell.exe", [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  "C:\\Users\\chris\\Desktop\\OutilsIA-Local-Cockpit-Field-Test-Kit\\VERIFIER-KIT-WINDOWS.ps1",
], { encoding: "utf8" });

const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
if (result.status !== 0) {
  fail(`field kit self-check failed with code ${result.status}: ${output}`);
}
if (!output.includes("field_kit_self_check_windows")) {
  fail(`field kit self-check output missing marker: ${output}`);
}

const report = readJson(jsonPath);
if (report.schema !== "outilsia.local_cockpit_field_kit_self_check.v1") fail("unexpected kit self-check schema");
if (report.status !== "FIELD_KIT_READY") fail(`kit self-check not ready: ${report.status}`);
if (!report.build_id || !report.installer_name) fail("kit self-check missing build or installer");
if (!/^[a-f0-9]{64}$/.test(String(report.expected_sha256 || ""))) fail("expected sha invalid");
if (report.expected_sha256 !== report.actual_sha256) fail("installer sha mismatch in self-check");
if (Number(report.installer_bytes || 0) < 1_000_000) fail("installer too small in self-check");
if ((report.missing || []).length) fail(`kit self-check reports missing items: ${report.missing.join(", ")}`);

const md = read(mdPath);
const html = read(htmlPath);
for (const needle of ["Verification kit terrain OutilsIA", "FIELD_KIT_READY", "SHA attendu", "SHA actuel"]) {
  if (!md.includes(needle) && !html.includes(needle)) fail(`kit self-check report missing ${needle}`);
}

console.log(`field_kit_self_check_verified status=${report.status} build=${report.build_id} installer=${report.installer_name}`);
