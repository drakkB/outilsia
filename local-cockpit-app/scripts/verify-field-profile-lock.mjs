#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = existsSync("/mnt/c/Users/chris/Desktop") ? "/mnt/c/Users/chris/Desktop" : join(process.env.HOME || ".", "Desktop");
function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

const kitDir = resolve(
  argValue("--kit-dir")
  || process.env.OUTILSIA_FIELD_KIT_DIR
  || join(desktopRoot, "OutilsIA-Local-Cockpit-Field-Test-Kit")
);
const validatorSource = join(kitDir, "VALIDER-FICHE-WINDOWS.ps1");
const scratch = join(appRoot, ".artifacts", `profile-lock-verify-${process.pid}-${Date.now()}`);

function fail(message) {
  throw new Error(message);
}

function toWindowsPath(path) {
  if (path.startsWith("/mnt/") && path.length > 6) {
    const drive = path.slice(5, 6).toUpperCase();
    return `${drive}:\\${path.slice(7).replaceAll("/", "\\")}`;
  }
  return path.replaceAll("/", "\\");
}

function powershellExe() {
  for (const candidate of ["powershell.exe", "pwsh.exe", "pwsh"]) {
    const result = spawnSync(candidate, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
      encoding: "utf8",
      stdio: "pipe",
    });
    if (result.status === 0) return candidate;
  }
  fail("no Windows PowerShell executable available");
}

function runValidator(ps, inputPath) {
  return spawnSync(ps, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    toWindowsPath(join(scratch, "VALIDER-FICHE-WINDOWS.ps1")),
    "-InputPath",
    toWindowsPath(inputPath),
  ], {
    encoding: "utf8",
    stdio: "pipe",
  });
}

if (!existsSync(validatorSource)) fail(`missing validator: ${validatorSource}`);
mkdirSync(scratch, { recursive: true });
copyFileSync(validatorSource, join(scratch, "VALIDER-FICHE-WINDOWS.ps1"));

const validEntry = {
  profile: "rtx_4080_4090",
  tested_at: "2026-07-05T10:00:00.000Z",
  app_version: "0.1.1",
  build_id: "profile-lock-fixture",
  machine_label: "RTX 4080/4090 proof lock fixture",
  os: "Windows 11",
  cpu: "AMD Ryzen 7 7800X3D",
  gpu: "NVIDIA GeForce RTX 4080 SUPER",
  ram_gb: 63,
  vram_gb: 16,
  scan_ok: true,
  score: 80,
  score_label: "Très solide",
  recommended_model: "hermes3:8b",
  first_action: "Poser une question locale",
  upgrade_recommendation: "Gros LLM 24 Go",
  benchmark_model: "qwen3:0.6b",
  benchmark_tokens_per_second: 128.7,
  benchmark_elapsed_ms: 1200,
  promptforge_ok: true,
  dialogue_ok: true,
  arena_ok: true,
  report_ok: true,
  share_url: "https://outilsia.fr/r/profile-lock-fixture",
};
const entryPath = join(scratch, "outilsia-field-test-rtx_4080_4090.json");
writeFileSync(entryPath, `${JSON.stringify(validEntry, null, 2)}\n`, "utf8");

const ps = powershellExe();
writeFileSync(join(scratch, "EXPECTED-FIELD-PROFILE.txt"), "old_laptop\n", "utf8");
const mismatch = runValidator(ps, entryPath);
if (mismatch.status === 0) {
  fail("validator accepted a field entry with the wrong EXPECTED-FIELD-PROFILE.txt");
}
if (!`${mismatch.stdout}\n${mismatch.stderr}`.includes("ne correspond pas au profil attendu")) {
  fail(`validator mismatch output did not mention profile lock: ${mismatch.stdout} ${mismatch.stderr}`);
}

writeFileSync(join(scratch, "EXPECTED-FIELD-PROFILE.txt"), "rtx_4080_4090\n", "utf8");
const match = runValidator(ps, entryPath);
if (match.status !== 0) {
  fail(`validator rejected matching profile: ${match.stdout} ${match.stderr}`);
}
if (!`${match.stdout}\n${match.stderr}`.includes("field_entry_ok")) {
  fail(`validator matching output missing field_entry_ok: ${match.stdout} ${match.stderr}`);
}

rmSync(scratch, { recursive: true, force: true });
console.log(`field_profile_lock_verified ps=${ps} mismatch=blocked match=accepted profile=rtx_4080_4090`);
