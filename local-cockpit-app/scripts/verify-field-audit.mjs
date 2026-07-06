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

function read(path) {
  if (!existsSync(path)) fail(`missing file: ${path}`);
  return readFileSync(path, "utf8");
}

function readJson(path) {
  return JSON.parse(read(path).replace(/^\uFEFF/, ""));
}

function assertFile(path, minBytes = 1) {
  if (!existsSync(path)) fail(`missing file: ${path}`);
  const size = statSync(path).size;
  if (size < minBytes) fail(`file too small: ${path} (${size} bytes)`);
  return size;
}

const psPath = join(kitDir, "AUDIT-TERRAIN-WINDOWS.ps1");
const cmdPath = join(kitDir, "AUDIT-TERRAIN.cmd");
const mdPath = join(kitDir, "AUDIT-TERRAIN.md");
const htmlPath = join(kitDir, "AUDIT-TERRAIN.html");
const statusPath = join(kitDir, "FIELD-TESTS-STATUS.json");

assertFile(psPath);
assertFile(cmdPath);

const psText = read(psPath);
for (const needle of [
  "VALIDER-FICHES-WINDOWS.ps1",
  "STATUT-WINDOWS.ps1",
  "GOAL PAS ENCORE VALIDABLE",
  "GOAL TERRAIN VALIDABLE",
  "AUDIT-TERRAIN.md",
  "AUDIT-TERRAIN.html",
  "field_audit_windows",
]) {
  if (!psText.includes(needle)) fail(`AUDIT-TERRAIN-WINDOWS.ps1 missing ${needle}`);
}
if (!read(cmdPath).includes("AUDIT-TERRAIN-WINDOWS.ps1")) {
  fail("AUDIT-TERRAIN.cmd must call AUDIT-TERRAIN-WINDOWS.ps1");
}

const result = spawnSync("powershell.exe", [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  "C:\\Users\\chris\\Desktop\\OutilsIA-Local-Cockpit-Field-Test-Kit\\AUDIT-TERRAIN-WINDOWS.ps1",
], { encoding: "utf8" });

const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
if (result.status !== 0) {
  fail(`field audit PowerShell failed with code ${result.status}: ${output}`);
}
if (!output.includes("field_audit_windows")) {
  fail(`field audit output missing success marker: ${output}`);
}

assertFile(mdPath, 200);
assertFile(htmlPath, 500);
const status = readJson(statusPath);
const md = read(mdPath);
const html = read(htmlPath);
for (const needle of [
  "Audit terrain OutilsIA",
  "GOAL PAS ENCORE VALIDABLE",
  "FIELD_TESTS_INCOMPLETE",
  "old_laptop",
  "core_i7_gtx_1080_ti",
  "rtx_3060_12gb",
  "rtx_4080_4090",
  "cpu_only",
]) {
  if (!md.includes(needle) && !html.includes(needle)) fail(`field audit report missing ${needle}`);
}
for (const bad of ["prÃ", "ModÃ", "Â·"]) {
  if (md.includes(bad) || html.includes(bad)) fail(`field audit report contains mojibake: ${bad}`);
}

console.log(
  `field_audit_verified status=${status.status} ready=${(status.profiles_ready || []).length}/${(status.profiles_required || []).length} ` +
  `next=${status.next_profile_to_test || "none"}`
);
