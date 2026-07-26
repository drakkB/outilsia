#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const publicReleasePath = join(repoRoot, "server-work", "static", "downloads", "local-cockpit", "release.json");

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function run(script, args, expectedStatus = 0) {
  const result = spawnSync("node", [join(appRoot, "scripts", script), ...args], {
    cwd: appRoot,
    encoding: "utf8",
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status !== expectedStatus) {
    throw new Error(`Unexpected status ${result.status} for ${script}, expected ${expectedStatus}\n${output}`);
  }
  return output;
}

function expectFailure(script, args, phrase) {
  const result = spawnSync("node", [join(appRoot, "scripts", script), ...args], {
    cwd: appRoot,
    encoding: "utf8",
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0) throw new Error(`Expected ${script} to fail\n${output}`);
  if (!output.includes(phrase)) throw new Error(`Expected failure containing "${phrase}"\n${output}`);
}

const root = mkdtempSync(join(tmpdir(), "outilsia-rc-"));
try {
  process.env.OUTILSIA_RC_SOURCE_TRACKED_DIRTY_AT_START = "false";
  const artifacts = join(root, "artifacts");
  const windows = join(root, "windows");
  const linux = join(root, "linux");
  const merged = join(root, "merged");
  const kit = join(root, "kit");
  const setup = join(root, "OutilsIA Local Cockpit_0.1.2_x64-setup.exe");
  const portable = join(root, "outilsia-local-cockpit.exe");
  const appImage = join(root, "OutilsIA Local Cockpit_0.1.2_amd64.AppImage");
  writeFileSync(setup, "fixture windows setup");
  writeFileSync(portable, "fixture windows portable");
  writeFileSync(appImage, "fixture linux appimage");

  const publicBefore = readFileSync(publicReleasePath);
  run("package-release-candidate.mjs", [
    "--artifact", portable,
    "--artifact", setup,
    "--output-dir", windows,
    "--rc", "7",
    "--build-id", "fixture123",
    "--replace",
  ]);
  run("package-release-candidate.mjs", [
    "--artifact", appImage,
    "--output-dir", linux,
    "--rc", "7",
    "--build-id", "fixture123",
    "--replace",
  ]);
  run("verify-release-candidate.mjs", ["--input", windows, "--require-platform", "windows-x64", "--require-freshness"]);
  expectFailure(
    "verify-release-candidate.mjs",
    ["--input", windows, "--require-windows-signature"],
    "valid timestamped Windows signature",
  );
  run("verify-release-candidate.mjs", ["--input", linux, "--require-platform", "linux", "--require-freshness"]);
  const windowsCandidate = JSON.parse(readFileSync(join(windows, "release-candidate.json"), "utf8"));
  if (windowsCandidate.code_signing?.schema !== "outilsia.windows_authenticode.v1") {
    throw new Error("Windows RC is missing Authenticode evidence");
  }
  if (process.platform === "win32" && windowsCandidate.code_signing.verified_on_windows !== true) {
    throw new Error("Windows RC Authenticode evidence was not inspected on Windows");
  }
  if (process.platform === "win32" && windowsCandidate.code_signing.files?.length !== 2) {
    throw new Error("Windows RC must inspect every Windows artifact independently");
  }
  if (process.platform !== "win32" && windowsCandidate.code_signing.status !== "unverified") {
    throw new Error(`Non-Windows fixture should remain unverified, got ${windowsCandidate.code_signing.status}`);
  }
  for (const expectedPath of [
    "local-cockpit-app/src-tauri/Cargo.toml",
    "local-cockpit-app/src-tauri/gen/schemas/desktop-schema.json",
    "local-cockpit-app/src-tauri/gen/schemas/windows-schema.json",
  ]) {
    const suffix = expectedPath.replace(/^local-cockpit-app\//, "");
    const recorded = (windowsCandidate.source?.post_build_tracked_dirty_paths || [])
      .find((path) => path.endsWith(suffix));
    if (recorded && recorded !== expectedPath) {
      throw new Error(`RC post-build provenance path lost its Git porcelain prefix: ${recorded}`);
    }
  }
  run("make-release-candidate-kit.mjs", [
    "--candidate-dir", windows,
    "--output-dir", kit,
    "--replace",
  ]);
  for (const required of ["START-HERE.html", "CAMPAGNE-5-MACHINES.md", "01-LANCER-LE-RC.cmd", "02-VALIDER-LE-TEST.cmd", "RC-KIT-MANIFEST.json", "AUTHENTICODE.json"]) {
    if (!existsSync(join(kit, required))) throw new Error(`RC kit missing ${required}`);
  }
  if (process.platform === "win32") {
    const powershellSyntax = spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "[scriptblock]::Create((Get-Content -LiteralPath $env:OUTILSIA_PS_FILE -Raw)) | Out-Null",
    ], {
      encoding: "utf8",
      env: { ...process.env, OUTILSIA_PS_FILE: join(kit, "Valider-test-express.ps1") },
    });
    if (powershellSyntax.status !== 0) {
      throw new Error(`Generated RC validator has invalid PowerShell syntax\n${powershellSyntax.stderr}`);
    }
  }
  run("merge-release-candidate.mjs", [
    "--input", windows,
    "--input", linux,
    "--output-dir", merged,
    "--replace",
  ]);
  run("verify-release-candidate.mjs", [
    "--input", merged,
    "--require-platform", "windows-x64",
    "--require-platform", "linux",
    "--require-freshness",
  ]);

  const candidatePath = join(merged, "release-candidate.json");
  const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));
  if (candidate.version !== "0.1.2" || candidate.label !== "0.1.2-rc.7") {
    throw new Error(`Unexpected RC identity: ${candidate.version}/${candidate.label}`);
  }
  if (candidate.deployment?.public_allowed !== false || candidate.test_policy?.full_terrain_gate_unchanged !== true) {
    throw new Error("RC safety policy is missing");
  }
  if (candidate.source?.tracked_dirty !== false || typeof candidate.source?.post_build_tracked_dirty !== "boolean") {
    throw new Error("RC source provenance must distinguish pre-build and post-build state");
  }
  if (hash(readFileSync(publicReleasePath)) !== hash(publicBefore)) {
    throw new Error("RC pipeline mutated public release.json");
  }

  const originalManifest = readFileSync(candidatePath);
  const originalAuthenticode = readFileSync(join(merged, "AUTHENTICODE.json"));
  const falseSigningClaim = {
    ...candidate.code_signing,
    all_valid: true,
    identity_claim_allowed: true,
    stable_release_ready: true,
  };
  writeFileSync(candidatePath, `${JSON.stringify({ ...candidate, code_signing: falseSigningClaim }, null, 2)}\n`);
  writeFileSync(join(merged, "AUTHENTICODE.json"), `${JSON.stringify(falseSigningClaim, null, 2)}\n`);
  expectFailure("verify-release-candidate.mjs", ["--input", merged], "claims do not match");
  writeFileSync(candidatePath, originalManifest);
  writeFileSync(join(merged, "AUTHENTICODE.json"), originalAuthenticode);

  const tampered = candidate.files[0];
  writeFileSync(join(merged, tampered.name), "tampered");
  expectFailure("verify-release-candidate.mjs", ["--input", merged], "size mismatch");

  expectFailure("package-release-candidate.mjs", [
    "--artifact", setup,
    "--output-dir", join(repoRoot, "server-work", "static", "downloads", "local-cockpit", "rc-test"),
    "--rc", "7",
    "--build-id", "fixture123",
    "--replace",
  ], "outside the public release tree");

  console.log("release_candidate_test_ok private_manifest hashes merge public_tree_unchanged");
} finally {
  rmSync(root, { recursive: true, force: true });
}
