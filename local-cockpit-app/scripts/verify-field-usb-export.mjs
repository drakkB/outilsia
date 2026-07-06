#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve("..");
const desktopRoot = existsSync("/mnt/c/Users/chris/Desktop") ? "/mnt/c/Users/chris/Desktop" : join(process.env.HOME || ".", "Desktop");
const kitDir = join(desktopRoot, "OutilsIA-Local-Cockpit-Field-Test-Kit");
const verifyId = `${process.pid}-${Date.now()}`;
const destination = join(desktopRoot, `OutilsIA-Terrain-USB-VERIFY-${verifyId}`);
const releasePath = join(repoRoot, "server-work", "static", "downloads", "local-cockpit", "release.json");

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  if (!existsSync(path)) fail(`missing json: ${path}`);
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertFile(path, minBytes = 1) {
  if (!existsSync(path)) fail(`missing file: ${path}`);
  const size = statSync(path).size;
  if (size < minBytes) fail(`file too small: ${path} (${size} bytes)`);
  return size;
}

const release = readJson(releasePath);
const buildId = release.build_id || "";
if (!buildId) fail("release build_id missing");

const psScript = join(kitDir, "PREPARER-KIT-USB-WINDOWS.ps1");
assertFile(psScript);

if (existsSync(destination)) {
  rmSync(destination, { recursive: true, force: true });
}

const result = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    `C:\\Users\\chris\\Desktop\\OutilsIA-Local-Cockpit-Field-Test-Kit\\PREPARER-KIT-USB-WINDOWS.ps1`,
    "-Destination",
    `C:\\Users\\chris\\Desktop\\OutilsIA-Terrain-USB-VERIFY-${verifyId}`,
  ],
  { encoding: "utf8" },
);

const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
if (result.status !== 0) {
  console.error(output);
  fail(`USB export command failed with code ${result.status}`);
}
if (!output.includes("field_usb_export_ok")) {
  fail(`USB export output missing success marker: ${output}`);
}

const manifest = readJson(join(destination, "FIELD-USB-EXPORT.json"));
if (manifest.schema !== "outilsia.local_cockpit_field_usb_export.v1") fail("unexpected USB export schema");
if (manifest.build_id !== buildId) fail(`USB export build mismatch: ${manifest.build_id} !== ${buildId}`);

const zipName = `OutilsIA-Local-Cockpit-Field-Test-Kit-${buildId}.zip`;
const zipPath = join(destination, zipName);
const zipShaPath = `${zipPath}.sha256.txt`;
assertFile(zipPath, 1_000_000);
assertFile(zipShaPath);
if (manifest.zip_sha256 !== sha256(zipPath)) fail("USB export zip sha mismatch");

const copiedKit = join(destination, "OutilsIA-Local-Cockpit-Field-Test-Kit");
for (const file of [
  "START-HERE.html",
  "PREPARER-KIT-USB.cmd",
  "VALIDER-DERNIERE-FICHE.cmd",
  "EXPORTER-FICHES.cmd",
  "FIELD-PROOF-MANIFEST.json",
]) {
  assertFile(join(copiedKit, file));
}

const readme = readFileSync(join(destination, "LIRE-MOI-TERRAIN-USB.md"), "utf8");
for (const needle of ["OutilsIA terrain USB", "VALIDER-DERNIERE-FICHE.cmd", "EXPORTER-FICHES.cmd"]) {
  if (!readme.includes(needle)) fail(`USB readme missing ${needle}`);
}

console.log(`field_usb_export_verified build=${buildId} destination=${destination} zip_sha=${manifest.zip_sha256}`);
