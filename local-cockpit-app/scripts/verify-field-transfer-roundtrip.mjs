#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = "/mnt/c/Users/chris/Desktop";
const kitDir = join(desktopRoot, "OutilsIA-Local-Cockpit-Field-Test-Kit");
const entriesDir = join(kitDir, "entries");
const verifierId = `${process.pid}-${Date.now()}`;
const workDir = join(desktopRoot, `OutilsIA-Terrain-Transfer-VERIFY-${verifierId}`);
const scratchKitDir = join(workDir, "scratch-kit");
const exportEntriesDir = join(workDir, "source-entries");
const importEntriesDir = join(workDir, "imported-entries");
const transferZip = join(workDir, "outilsia-field-entries-transfer-verify.zip");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(path) {
  if (!existsSync(path)) fail(`missing json: ${path}`);
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function psPath(path) {
  if (path.startsWith("/mnt/c/")) return `C:\\${path.slice("/mnt/c/".length).replaceAll("/", "\\")}`;
  return path.replaceAll("/", "\\");
}

function runPowerShell(scriptPath, args) {
  try {
    return execFileSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      psPath(scriptPath),
      ...args,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}`;
    fail(`PowerShell command failed: ${output || error.message}`);
  }
}

function main() {
  const sourceExportScript = join(kitDir, "EXPORTER-FICHES-WINDOWS.ps1");
  const sourceImportScript = join(kitDir, "IMPORTER-PACK-FICHES-WINDOWS.ps1");
  const sourceValidatorScript = join(kitDir, "VALIDER-FICHES-WINDOWS.ps1");
  if (!existsSync(sourceExportScript)) fail(`missing exporter: ${sourceExportScript}`);
  if (!existsSync(sourceImportScript)) fail(`missing importer: ${sourceImportScript}`);
  if (!existsSync(sourceValidatorScript)) fail(`missing validator: ${sourceValidatorScript}`);

  const sourceEntry = join(entriesDir, "outilsia-field-test-rtx_4080_4090.json");
  if (!existsSync(sourceEntry)) fail(`missing real source entry for roundtrip: ${sourceEntry}`);
  const source = readJson(sourceEntry);
  if (source.profile !== "rtx_4080_4090") fail(`unexpected source profile: ${source.profile}`);
  const roundtripEntry = {
    ...source,
    tested_at: new Date().toISOString(),
    benchmark_elapsed_ms: Math.max(Number(source.benchmark_elapsed_ms || 0), 1200),
    benchmark_tokens_per_second: Math.min(Number(source.benchmark_tokens_per_second || 0) || 37.5, 640),
  };

  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(scratchKitDir, { recursive: true });
  mkdirSync(exportEntriesDir, { recursive: true });
  mkdirSync(importEntriesDir, { recursive: true });
  for (const script of [
    "EXPORTER-FICHES-WINDOWS.ps1",
    "IMPORTER-PACK-FICHES-WINDOWS.ps1",
    "VALIDER-FICHES-WINDOWS.ps1",
    "FIELD-KIT-MANIFEST.txt",
  ]) {
    copyFileSync(join(kitDir, script), join(scratchKitDir, script));
  }
  const exportScript = join(scratchKitDir, "EXPORTER-FICHES-WINDOWS.ps1");
  const importScript = join(scratchKitDir, "IMPORTER-PACK-FICHES-WINDOWS.ps1");

  const sourceEntryCopy = join(exportEntriesDir, "outilsia-field-test-rtx_4080_4090.json");
  writeFileSync(sourceEntryCopy, `${JSON.stringify(roundtripEntry, null, 2)}\n`, "utf8");
  const sourceHash = sha256(sourceEntryCopy);

  const exportOutput = runPowerShell(exportScript, [
    "-EntriesDir",
    psPath(exportEntriesDir),
    "-OutZip",
    psPath(transferZip),
  ]);
  if (!exportOutput.includes("field_entries_transfer_zip")) fail(`export output missing success marker: ${exportOutput}`);
  if (!existsSync(transferZip)) fail(`transfer zip not created: ${transferZip}`);

  const importOutput = runPowerShell(importScript, [
    "-ZipPath",
    psPath(transferZip),
    "-EntriesDir",
    psPath(importEntriesDir),
  ]);
  if (!importOutput.includes("field_entries_import_ok")) fail(`import output missing success marker: ${importOutput}`);

  const importedEntry = join(importEntriesDir, "outilsia-field-test-rtx_4080_4090.json");
  if (!existsSync(importedEntry)) fail(`imported entry missing: ${importedEntry}`);
  const imported = readJson(importedEntry);
  if (imported.profile !== "rtx_4080_4090") fail(`imported profile mismatch: ${imported.profile}`);
  if (sha256(importedEntry) !== sourceHash) fail("imported entry hash differs from source entry");

  const validationJson = join(scratchKitDir, "FIELD-ENTRIES-VALIDATION.json");
  const validation = readJson(validationJson);
  if (!Array.isArray(validation.profiles)) fail("validation report has no profiles array");
  if (!Array.isArray(validation.profiles_ready) || !validation.profiles_ready.includes("rtx_4080_4090")) {
    fail("imported entry was not marked ready after import");
  }
  const validated = validation.profiles.find((entry) => entry.profile === "rtx_4080_4090");
  if (!validated || validated.status !== "ready") fail("imported entry was not validated after import");

  const importReport = join(scratchKitDir, "FIELD-ENTRIES-IMPORT.json");
  const importJson = readJson(importReport);
  if (!Array.isArray(importJson.copied_files) || !importJson.copied_files.includes("outilsia-field-test-rtx_4080_4090.json")) {
    fail("import report does not include the imported entry");
  }

  console.log(`field_transfer_roundtrip_verified profile=rtx_4080_4090 zip=${transferZip} imported=${importedEntry}`);
}

main();
