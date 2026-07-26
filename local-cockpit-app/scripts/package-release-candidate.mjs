#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const bundleRoot = join(appRoot, "src-tauri", "target", "release", "bundle");
const directExecutable = join(appRoot, "src-tauri", "target", "release", "outilsia-local-cockpit.exe");
const publicReleaseRoot = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");
const defaultOutputRoot = join(appRoot, ".artifacts", "release-candidate");
const wantedExts = new Set([".exe", ".msi", ".appimage", ".deb", ".rpm", ".dmg"]);
const sourceRoots = [
  join(appRoot, "src"),
  join(appRoot, "src-tauri", "src"),
  join(appRoot, "src-tauri", "icons"),
  join(appRoot, "src-tauri", "tauri.conf.json"),
  join(appRoot, "src-tauri", "Cargo.toml"),
  join(appRoot, "src-tauri", "Cargo.lock"),
  join(appRoot, "package.json"),
  join(appRoot, "package-lock.json"),
];
const sourceExts = new Set([".js", ".html", ".css", ".json", ".rs", ".toml", ".lock", ".png", ".ico", ".icns"]);

function usage() {
  console.log(`Usage:
  node scripts/package-release-candidate.mjs [--artifact <path>]... [--output-dir <path>]
    [--rc <number>] [--build-id <id>] [--replace]

The candidate is written outside the public download tree. It never deploys and
never updates server-work/static/downloads/local-cockpit/release.json.`);
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const opts = {
    artifacts: [],
    outputDir: defaultOutputRoot,
    rcNumber: Number(process.env.OUTILSIA_RC_NUMBER || 1),
    buildId: String(process.env.OUTILSIA_BUILD_ID || "").trim(),
    replace: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--artifact") {
      opts.artifacts.push(resolve(argv[++index] || ""));
      continue;
    }
    if (arg === "--output-dir") {
      opts.outputDir = resolve(argv[++index] || "");
      continue;
    }
    if (arg === "--rc") {
      opts.rcNumber = Number(argv[++index] || 0);
      continue;
    }
    if (arg === "--build-id") {
      opts.buildId = String(argv[++index] || "").trim();
      continue;
    }
    if (arg === "--replace") {
      opts.replace = true;
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(opts.rcNumber) || opts.rcNumber < 1) fail("--rc must be a positive integer");
  if (!opts.buildId) {
    opts.buildId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  }
  if (!/^[0-9A-Za-z._-]{6,32}$/.test(opts.buildId)) fail(`Invalid build id: ${opts.buildId}`);
  return opts;
}

function isInside(path, parent) {
  const normalizedPath = resolve(path);
  const normalizedParent = resolve(parent);
  return normalizedPath === normalizedParent || normalizedPath.startsWith(`${normalizedParent}${sep}`);
}

function assertPrivateOutput(path) {
  if (isInside(path, publicReleaseRoot)) {
    fail(`RC output must stay outside the public release tree: ${publicReleaseRoot}`);
  }
}

function readVersion() {
  const packageJson = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
  const tauriConfig = JSON.parse(readFileSync(join(appRoot, "src-tauri", "tauri.conf.json"), "utf8"));
  const cargoText = readFileSync(join(appRoot, "src-tauri", "Cargo.toml"), "utf8");
  const cargoVersion = cargoText.match(/^version\s*=\s*"([^"]+)"/m)?.[1] || "";
  const versions = [packageJson.version, tauriConfig.version, cargoVersion].map((value) => String(value || "").trim());
  if (new Set(versions).size !== 1) fail(`Version mismatch: package=${versions[0]} tauri=${versions[1]} cargo=${versions[2]}`);
  if (!/^\d+\.\d+\.\d+$/.test(versions[0])) fail(`Invalid application version: ${versions[0]}`);
  return versions[0];
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return wantedExts.has(extname(entry.name).toLowerCase()) ? [path] : [];
  });
}

function defaultArtifacts() {
  const paths = walk(bundleRoot);
  if (existsSync(directExecutable)) paths.push(directExecutable);
  return paths;
}

function supportedArtifact(path) {
  const name = basename(path);
  if (/_x86[-_.]/i.test(name) || /_arm64[-_.]/i.test(name)) return false;
  return wantedExts.has(extname(name).toLowerCase());
}

function platformFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".exe" || ext === ".msi") return "windows-x64";
  if ([".appimage", ".deb", ".rpm"].includes(ext)) return "linux";
  if (ext === ".dmg") return "macos";
  return "unknown";
}

function artifactKind(path) {
  const name = basename(path).toLowerCase();
  const ext = extname(name);
  if (ext === ".msi") return "msi";
  if (ext === ".appimage") return "appimage";
  if (ext === ".deb") return "deb";
  if (ext === ".rpm") return "rpm";
  if (ext === ".dmg") return "dmg";
  if (name.includes("setup")) return "setup";
  return "portable";
}

function outputExtension(path) {
  return extname(path).toLowerCase() === ".appimage" ? ".AppImage" : extname(path).toLowerCase();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function unverifiedAuthenticode(files, status = "unverified") {
  const windowsFiles = files.filter((file) => file.platform === "windows-x64");
  const applicable = windowsFiles.length > 0;
  return {
    schema: "outilsia.windows_authenticode.v1",
    inspected_at: new Date().toISOString(),
    inspector: applicable ? "not_available_on_this_runner" : "not_applicable",
    verified_on_windows: false,
    status: applicable ? status : "not_applicable",
    all_valid: false,
    identity_claim_allowed: false,
    stable_release_ready: false,
    files: windowsFiles.map((file) => ({
      name: file.name,
      sha256: file.sha256,
      status,
      native_status: "",
      signer_subject: "",
      signer_thumbprint: "",
      timestamp_present: false,
      timestamp_subject: "",
      timestamp_thumbprint: "",
    })),
  };
}

function inspectWindowsAuthenticode(files, outputDir) {
  const windowsFiles = files.filter((file) => file.platform === "windows-x64");
  if (!windowsFiles.length) return unverifiedAuthenticode(files);
  if (process.platform !== "win32") return unverifiedAuthenticode(files);
  const script = join(appRoot, "scripts", "inspect-windows-authenticode.ps1");
  const inspectedFiles = [];
  const inspectedAt = [];
  for (const file of windowsFiles) {
    // PowerShell -File does not bind several trailing values to one array
    // parameter reliably. Inspect one artifact per process and aggregate here.
    const result = spawnSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", script,
      "-ArtifactPath", join(outputDir, file.name),
    ], { cwd: appRoot, encoding: "utf8" });
    if (result.status !== 0) {
      fail(`Authenticode inspection failed for ${file.name}: ${result.stderr || result.stdout}`);
    }
    let report;
    try {
      report = JSON.parse(String(result.stdout || "").replace(/^\uFEFF/, "").trim());
    } catch (error) {
      fail(`Authenticode report is not valid JSON for ${file.name}: ${error.message}`);
    }
    if (report?.schema !== "outilsia.windows_authenticode.v1"
      || report.verified_on_windows !== true
      || !Array.isArray(report.files)
      || report.files.length !== 1) {
      fail(`Authenticode inspector returned an invalid single-file report: ${file.name}`);
    }
    const signature = report.files[0];
    if (!signature || signature.sha256 !== file.sha256) {
      fail(`Authenticode report is not bound to candidate artifact: ${file.name}`);
    }
    if (signature.name !== file.name) {
      fail(`Authenticode report has the wrong artifact name: ${signature.name}`);
    }
    inspectedFiles.push(signature);
    inspectedAt.push(String(report.inspected_at || ""));
  }
  const statuses = new Set(inspectedFiles.map((file) => file.status));
  const status = statuses.size === 1 && statuses.has("valid")
    ? "valid"
    : statuses.size === 1 && statuses.has("not_signed")
      ? "not_signed"
      : "mixed_or_invalid";
  const allValid = status === "valid";
  return {
    schema: "outilsia.windows_authenticode.v1",
    inspected_at: inspectedAt.sort().at(-1) || new Date().toISOString(),
    inspector: "Get-AuthenticodeSignature",
    verified_on_windows: true,
    status,
    all_valid: allValid,
    identity_claim_allowed: allValid,
    stable_release_ready: allValid,
    files: inspectedFiles,
  };
}

function newestSource() {
  let newest = { path: "", mtimeMs: 0 };
  const visit = (path) => {
    if (!existsSync(path)) return;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) {
        if (["target", "node_modules", ".git", ".artifacts"].includes(name)) continue;
        visit(join(path, name));
      }
      return;
    }
    if (!sourceExts.has(extname(path).toLowerCase())) return;
    if (stat.mtimeMs > newest.mtimeMs) newest = { path, mtimeMs: stat.mtimeMs };
  };
  sourceRoots.forEach(visit);
  return newest;
}

function freshnessFor(artifacts) {
  const newest = newestSource();
  const oldest = artifacts
    .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
    .sort((left, right) => left.mtimeMs - right.mtimeMs)[0];
  const stale = newest.mtimeMs > oldest.mtimeMs + 1000;
  if (stale) {
    fail(
      `Refusing stale RC artifacts: source=${relative(repoRoot, newest.path)} ` +
      `artifact=${relative(repoRoot, oldest.path)}`
    );
  }
  return {
    stale: false,
    newest_source: relative(repoRoot, newest.path),
    newest_source_mtime_ms: Math.round(newest.mtimeMs),
    oldest_artifact: relative(repoRoot, oldest.path),
    oldest_artifact_mtime_ms: Math.round(oldest.mtimeMs),
  };
}

function gitOutput(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trimEnd() : "";
}

function currentTrackedSourceDirty() {
  return Boolean(gitOutput(["status", "--porcelain", "--untracked-files=no"]));
}

function currentTrackedSourceDirtyPaths() {
  return gitOutput(["status", "--porcelain", "--untracked-files=no"])
    .split(/\r?\n/)
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .sort();
}

function trackedSourceDirtyAtBuildStart() {
  const declared = String(process.env.OUTILSIA_RC_SOURCE_TRACKED_DIRTY_AT_START || "").trim().toLowerCase();
  if (declared === "true") return true;
  if (declared === "false") return false;
  return currentTrackedSourceDirty();
}

function prepareOutput(path, replace) {
  assertPrivateOutput(path);
  if (existsSync(path)) {
    const entries = readdirSync(path);
    if (entries.length && !replace) fail(`Output is not empty: ${path}. Pass --replace explicitly.`);
    if (replace) rmSync(path, { recursive: true, force: true });
  }
  mkdirSync(path, { recursive: true });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const version = readVersion();
  const label = `${version}-rc.${opts.rcNumber}`;
  const artifacts = (opts.artifacts.length ? opts.artifacts : defaultArtifacts())
    .filter((path, index, paths) => path && paths.indexOf(path) === index)
    .filter(supportedArtifact);
  if (!artifacts.length) fail("No native candidate artifact found. Build Tauri first or pass --artifact.");
  for (const path of artifacts) {
    if (!existsSync(path) || !statSync(path).isFile()) fail(`Missing artifact: ${path}`);
  }

  prepareOutput(opts.outputDir, opts.replace);
  const freshness = freshnessFor(artifacts);
  const files = artifacts.map((sourcePath) => {
    const platform = platformFor(sourcePath);
    const kind = artifactKind(sourcePath);
    const name = `OutilsIA-Local-Cockpit-${label}-${opts.buildId}-${platform}-${kind}${outputExtension(sourcePath)}`;
    const target = join(opts.outputDir, name);
    copyFileSync(sourcePath, target);
    return {
      name,
      original_name: basename(sourcePath),
      platform,
      kind,
      size_bytes: statSync(target).size,
      sha256: sha256(target),
      relative_path: name,
    };
  });
  const duplicateNames = files.filter((file, index) => files.findIndex((other) => other.name === file.name) !== index);
  if (duplicateNames.length) fail(`Duplicate normalized artifact names: ${duplicateNames.map((file) => file.name).join(", ")}`);

  const platforms = [...new Set(files.map((file) => file.platform))].sort();
  const primary = files.find((file) => file.platform === "windows-x64" && file.kind === "setup")
    || files.find((file) => file.platform === "windows-x64" && file.kind === "portable")
    || files.find((file) => file.platform === "linux" && file.kind === "appimage")
    || files[0];
  const sourceCommit = process.env.GITHUB_SHA || gitOutput(["rev-parse", "HEAD"]);
  const artifactSetSha256 = createHash("sha256")
    .update(files.map((file) => `${file.sha256}  ${file.name}`).sort().join("\n"))
    .digest("hex");
  const codeSigning = inspectWindowsAuthenticode(files, opts.outputDir);
  const manifest = {
    schema: "outilsia.local_cockpit_release_candidate.v1",
    ok: true,
    product: "OutilsIA Local Cockpit",
    channel: "release-candidate",
    version,
    rc_number: opts.rcNumber,
    label,
    build_id: opts.buildId,
    created_at: new Date().toISOString(),
    source: {
      commit: sourceCommit,
      tracked_dirty: trackedSourceDirtyAtBuildStart(),
      post_build_tracked_dirty: currentTrackedSourceDirty(),
      post_build_tracked_dirty_paths: currentTrackedSourceDirtyPaths(),
    },
    deployment: {
      public_allowed: false,
      target: "",
      promotion_required: true,
    },
    test_policy: {
      smoke_schema: "outilsia.local_cockpit_rc_smoke.v1",
      mandatory: ["scan", "runtime", "starter_model", "benchmark", "shared_report"],
      optional_for_smoke: ["promptforge", "dialogue", "arena", "second_model"],
      full_terrain_gate_unchanged: true,
    },
    build_provenance: {
      schema: "outilsia.local_cockpit_rc_build_provenance.v1",
      build_id: opts.buildId,
      version,
      label,
      release_channel: "rc",
      ci: process.env.GITHUB_ACTIONS === "true",
      runner_os: process.env.RUNNER_OS || process.platform,
      node_platform: process.platform,
      node_arch: process.arch,
      artifact_platforms: platforms,
      source_commit: sourceCommit,
      artifact_set_sha256: artifactSetSha256,
      github: {
        workflow: process.env.GITHUB_WORKFLOW || "",
        run_id: process.env.GITHUB_RUN_ID || "",
        run_attempt: process.env.GITHUB_RUN_ATTEMPT || "",
        ref: process.env.GITHUB_REF || "",
        sha: process.env.GITHUB_SHA || "",
        repository: process.env.GITHUB_REPOSITORY || "",
      },
    },
    freshness,
    code_signing: codeSigning,
    primary_artifact: primary,
    files,
  };
  writeFileSync(join(opts.outputDir, "release-candidate.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(opts.outputDir, "AUTHENTICODE.json"), `${JSON.stringify(codeSigning, null, 2)}\n`);
  writeFileSync(
    join(opts.outputDir, "SHA256SUMS.txt"),
    `${files.map((file) => `${file.sha256}  ${file.name}`).join("\n")}\n`
  );
  console.log(`release_candidate=${join(opts.outputDir, "release-candidate.json")}`);
  console.log(`label=${label} build_id=${opts.buildId} platforms=${platforms.join(",")}`);
  files.forEach((file) => console.log(`${file.sha256}  ${file.name}`));
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
