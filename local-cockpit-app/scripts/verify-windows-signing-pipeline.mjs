#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const scriptsRoot = join(appRoot, "scripts");

function read(path) {
  return readFileSync(path, "utf8");
}

function fail(message) {
  throw new Error(message);
}

function requireMarkers(label, text, markers) {
  for (const marker of markers) {
    if (!text.includes(marker)) fail(`${label} is missing signing contract marker: ${marker}`);
  }
}

const commonPath = join(scriptsRoot, "windows-signing-common.ps1");
const readinessPath = join(scriptsRoot, "test-windows-signing-readiness.ps1");
const verifyPath = join(scriptsRoot, "verify-windows-signed-artifacts.ps1");
const buildPath = join(scriptsRoot, "build-windows-beta.ps1");
const rcBuildPath = join(scriptsRoot, "build-windows-release-candidate.ps1");
const inspectorPath = join(scriptsRoot, "inspect-windows-authenticode.ps1");
const candidateVerifierPath = join(scriptsRoot, "verify-release-candidate.mjs");
const configPath = join(appRoot, "src-tauri", "tauri.conf.json");
const guidePath = join(appRoot, "WINDOWS-CODE-SIGNING.md");
const ignorePath = join(repoRoot, ".gitignore");

const common = read(commonPath);
const readiness = read(readinessPath);
const verifier = read(verifyPath);
const build = read(buildPath);
const rcBuild = read(rcBuildPath);
const inspector = read(inspectorPath);
const candidateVerifier = read(candidateVerifierPath);
const config = read(configPath);
const guide = read(guidePath);
const ignore = read(ignorePath);

requireMarkers("signing common", common, [
  "^[0-9A-F]{40}$",
  "Cert:\\CurrentUser\\My",
  "1.3.6.1.5.5.7.3.3",
  "HasPrivateKey",
  "signtool.exe",
]);
requireMarkers("signing readiness", readiness, [
  "outilsia.windows_signing_readiness.v1",
  'file_digest = "sha256"',
  'timestamp_digest = "sha256"',
  "Get-OutilsIACodeSigningCertificate",
]);
requireMarkers("signed artifact verifier", verifier, [
  "outilsia.windows_signing_receipt.v1",
  "Get-AuthenticodeSignature",
  '"/pa"',
  '"/all"',
  '"/tw"',
  "TimeStamperCertificate",
  "ExpectedCertificateThumbprint",
]);
requireMarkers("Windows build", build, [
  "SigningCertificateThumbprint",
  "SigningTimestampUrl",
  "RequireSignedArtifacts",
  "test-windows-signing-readiness.ps1",
  "verify-windows-signed-artifacts.ps1",
  'digestAlgorithm = "sha256"',
  '"--config", $signingConfigPath',
  "Remove-Item -LiteralPath $signingConfigPath -Force",
  "WINDOWS-SIGNING-RECEIPT.json",
]);
requireMarkers("RC Windows build", rcBuild, [
  "SigningCertificateThumbprint",
  "SigningTimestampUrl",
  "RequireSignedArtifacts",
  "--require-windows-signature",
]);
requireMarkers("Authenticode inspector", inspector, [
  "all_timestamped",
  "stable_release_ready = ($allValid -and $allTimestamped)",
]);
requireMarkers("candidate signature gate", candidateVerifier, [
  "--require-windows-signature",
  "valid timestamped Windows signature",
  "all_timestamped",
]);
requireMarkers("Windows signing guide", guide, [
  "aucune cle privee, aucun PFX et aucun mot de passe dans Git",
  "stable_release_ready=true",
  "Une signature n'assure pas la disparition immediate de SmartScreen",
  "https://v2.tauri.app/distribute/sign/windows/",
  "https://learn.microsoft.com/windows/win32/seccrypto/signtool",
]);

for (const [label, text] of [
  ["signing common", common],
  ["signing readiness", readiness],
  ["signed artifact verifier", verifier],
  ["Windows build", build],
  ["RC Windows build", rcBuild],
]) {
  for (const forbidden of [
    "Import-PfxCertificate",
    "WINDOWS_CERTIFICATE_PASSWORD",
    "ConvertTo-SecureString",
    "certificate.pfx",
  ]) {
    if (text.includes(forbidden)) fail(`${label} must not handle certificate secrets: ${forbidden}`);
  }
}

for (const forbidden of ["certificateThumbprint", "timestampUrl", "signCommand"]) {
  if (config.includes(`"${forbidden}"`)) {
    fail(`Permanent Tauri config must not embed Windows signing identity: ${forbidden}`);
  }
}
for (const pattern of ["*.pfx", "*.p12"]) {
  if (!ignore.includes(pattern)) fail(`.gitignore must exclude ${pattern}`);
}

if (process.platform === "win32") {
  for (const path of [commonPath, readinessPath, verifyPath, buildPath, rcBuildPath, inspectorPath]) {
    const syntax = spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "$ErrorActionPreference='Stop'; [scriptblock]::Create((Get-Content -LiteralPath $env:OUTILSIA_PS_FILE -Raw)) | Out-Null",
    ], {
      encoding: "utf8",
      env: { ...process.env, OUTILSIA_PS_FILE: path },
    });
    if (syntax.status !== 0) {
      fail(`Invalid PowerShell syntax in ${path}\n${syntax.stderr || syntax.stdout}`);
    }
  }

  const missingCertificate = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", readinessPath,
    "-CertificateThumbprint", "0000000000000000000000000000000000000000",
    "-TimestampUrl", "https://timestamp.invalid",
  ], { encoding: "utf8" });
  const output = `${missingCertificate.stdout || ""}\n${missingCertificate.stderr || ""}`;
  if (missingCertificate.status === 0 || !output.includes("was not found")) {
    fail(`Signing readiness must reject an unavailable certificate\n${output}`);
  }
}

console.log("windows_signing_pipeline_ok optional_store_certificate sha256 rfc3161 post_verify no_repo_secret");
