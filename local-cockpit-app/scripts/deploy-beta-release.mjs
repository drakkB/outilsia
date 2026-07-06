#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const defaultReleaseDir = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");
const defaultRemote = "root@72.62.183.66";
const defaultRemoteDir = "/var/www/outilsia/static/downloads/local-cockpit";

function usage() {
  console.log(`Usage:
  node scripts/deploy-beta-release.mjs [--release-dir <dir>] [--remote <host>] [--remote-dir <dir>] [--deploy] [--require-freshness]

Default:
  --release-dir ${defaultReleaseDir}
  --remote ${defaultRemote}
  --remote-dir ${defaultRemoteDir}

Without --deploy, the script validates only and prints the planned deployment.`);
}

function parseArgs(argv) {
  const opts = {
    releaseDir: defaultReleaseDir,
    remote: defaultRemote,
    remoteDir: defaultRemoteDir,
    deploy: false,
    requireFreshness: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--deploy") {
      opts.deploy = true;
      continue;
    }
    if (arg === "--require-freshness") {
      opts.requireFreshness = true;
      continue;
    }
    if (arg === "--release-dir") {
      opts.releaseDir = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--remote") {
      opts.remote = argv[++i] || "";
      continue;
    }
    if (arg === "--remote-dir") {
      opts.remoteDir = argv[++i] || "";
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function sha256(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function fail(message) {
  throw new Error(message);
}

function assertFreshness(release) {
  if (!release.freshness || typeof release.freshness !== "object") {
    fail("Missing release.freshness");
  }
  if (release.freshness.stale !== false) {
    fail("release.freshness.stale must be false");
  }
  if (release.freshness.allow_stale === true) {
    fail("release.freshness.allow_stale must not be true");
  }
  if (!release.freshness.newest_source_mtime_ms || !release.freshness.oldest_artifact_mtime_ms) {
    fail("release.freshness must include newest_source_mtime_ms and oldest_artifact_mtime_ms");
  }
  if (Number(release.freshness.oldest_artifact_mtime_ms) < Number(release.freshness.newest_source_mtime_ms)) {
    fail("release.freshness artifact timestamp is older than source timestamp");
  }
}

function validateRelease(releaseDir, options = {}) {
  if (!existsSync(releaseDir)) fail(`Release directory not found: ${releaseDir}`);
  const releasePath = join(releaseDir, "release.json");
  if (!existsSync(releasePath)) fail(`Missing release.json in ${releaseDir}`);

  const release = JSON.parse(readFileSync(releasePath, "utf8"));
  if (release.ok !== true) fail("release.ok must be true");
  if (release.product !== "OutilsIA Local Cockpit") fail("Unexpected product in release.json");
  if (release.channel !== "beta") fail("release.channel must be beta");
  if (!release.version || !/^\d+\.\d+\.\d+/.test(release.version)) fail("Invalid release.version");
  if (!release.primary_download?.name) fail("Missing primary_download.name");
  if (!Array.isArray(release.files) || !release.files.length) fail("release.files must contain at least one file");
  if (options.requireFreshness) assertFreshness(release);

  const fileNames = new Set(release.files.map((file) => file.name));
  if (!fileNames.has(release.primary_download.name)) fail("primary_download must be listed in files");

  const validatedFiles = release.files.map((file) => {
    if (!file.name || file.name.includes("/") || file.name.includes("\\")) fail(`Invalid file name: ${file.name}`);
    if (!file.url || !file.url.startsWith("/static/downloads/local-cockpit/")) fail(`Invalid URL for ${file.name}`);
    if (!/^[a-f0-9]{64}$/i.test(file.sha256 || "")) fail(`Invalid sha256 for ${file.name}`);
    const path = join(releaseDir, file.name);
    if (!existsSync(path)) fail(`Missing release file: ${path}`);
    const stat = statSync(path);
    if (!stat.isFile()) fail(`Not a file: ${path}`);
    if (stat.size !== Number(file.size_bytes)) fail(`Size mismatch for ${file.name}: json=${file.size_bytes} actual=${stat.size}`);
    const actualHash = sha256(path);
    if (actualHash !== file.sha256) fail(`SHA256 mismatch for ${file.name}`);
    return { ...file, path, size_bytes: stat.size };
  });

  return {
    release,
    releasePath,
    files: validatedFiles,
  };
}

function cleanupLocalReleaseDir(releaseDir, keepNames) {
  for (const name of readdirSync(releaseDir)) {
    if (name === ".gitkeep" || name === "release.json") continue;
    if (!name.startsWith("OutilsIA-Local-Cockpit-")) continue;
    if (keepNames.has(name)) continue;
    rmSync(join(releaseDir, name), { force: true });
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    fail(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function deploy({ releasePath, files }, opts) {
  const backupDir = `/var/backups/outilsia-local-cockpit/release_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const remoteDir = opts.remoteDir.replace(/\/+$/, "");
  const keepNames = files.map((file) => file.name);
  const backupCommand = [
    "set -e",
    `mkdir -p ${shellQuote(backupDir)}`,
    `mkdir -p ${shellQuote(remoteDir)}`,
    `cp -a ${shellQuote(remoteDir)}/. ${shellQuote(backupDir)}/ 2>/dev/null || true`,
    `python3 -c ${shellQuote("import pathlib, sys; base = pathlib.Path(sys.argv[1]); keep = set(sys.argv[2:]); [path.unlink() for path in base.glob('OutilsIA-Local-Cockpit-*') if path.name not in keep and path.is_file()]")} ${shellQuote(remoteDir)} ${keepNames.map(shellQuote).join(" ")}`,
    `echo backup:${backupDir}`,
  ].join("; ");
  run("ssh", [opts.remote, backupCommand]);

  for (const file of files) {
    run("scp", [file.path, `${opts.remote}:${remoteDir}/${basename(file.path)}`]);
  }
  run("scp", [releasePath, `${opts.remote}:${remoteDir}/release.json`]);

  const verifyCommand = [
    "set -e",
    `test -s ${shellQuote(remoteDir)}/release.json`,
    `python3 - <<'PY'
import hashlib, json, pathlib
base = pathlib.Path(${JSON.stringify(remoteDir)})
data = json.loads((base / "release.json").read_text())
for item in data["files"]:
    path = base / item["name"]
    assert path.exists(), path
    assert path.stat().st_size == int(item["size_bytes"]), item["name"]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == item["sha256"], item["name"]
print("remote_release_ok", data["version"], len(data["files"]))
PY`,
  ].join("; ");
  run("ssh", [opts.remote, verifyCommand]);
}

try {
  const opts = parseArgs(process.argv.slice(2));
  const validated = validateRelease(opts.releaseDir, { requireFreshness: opts.requireFreshness });
  cleanupLocalReleaseDir(opts.releaseDir, new Set(validated.files.map((file) => file.name)));
  console.log("release_valid", validated.release.version, `${validated.files.length} file(s)${opts.requireFreshness ? " freshness=ok" : ""}`);
  for (const file of validated.files) {
    console.log(`${file.platform || "unknown"} ${file.name} ${file.size_bytes} ${file.sha256}`);
  }
  if (!opts.deploy) {
    console.log(`dry_run remote=${opts.remote} remote_dir=${opts.remoteDir}`);
    console.log("Add --deploy to publish this release.");
    process.exit(0);
  }
  deploy(validated, opts);
  console.log("deploy_complete");
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
