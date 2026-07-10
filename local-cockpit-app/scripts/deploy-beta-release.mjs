#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const defaultReleaseDir = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");
const defaultRemote = process.env.OUTILSIA_DEPLOY_REMOTE || "";
const defaultRemoteDir = "/var/www/outilsia/static/downloads/local-cockpit";

function usage() {
  console.log(`Usage:
  node scripts/deploy-beta-release.mjs [--release-dir <dir>] [--remote <host>] [--remote-dir <dir>] [--deploy] [--require-freshness]

Default:
  --release-dir ${defaultReleaseDir}
  --remote ${defaultRemote || "<set OUTILSIA_DEPLOY_REMOTE or pass --remote>"}
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
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const backupDir = `/var/backups/outilsia-local-cockpit/release_${stamp}`;
  const remoteDir = opts.remoteDir.replace(/\/+$/, "");
  const stagingDir = `${remoteDir}.upload_${stamp}`;
  const prepareCommand = [
    "set -e",
    `mkdir -p ${shellQuote(backupDir)}`,
    `mkdir -p ${shellQuote(remoteDir)}`,
    `cp -a ${shellQuote(remoteDir)}/. ${shellQuote(backupDir)}/ 2>/dev/null || true`,
    `rm -rf ${shellQuote(stagingDir)}`,
    `mkdir -p ${shellQuote(stagingDir)}`,
    `echo backup:${backupDir}`,
  ].join("; ");
  run("ssh", [opts.remote, prepareCommand]);

  for (const file of files) {
    run("scp", [file.path, `${opts.remote}:${stagingDir}/${basename(file.path)}`]);
  }
  run("scp", [releasePath, `${opts.remote}:${stagingDir}/release.json`]);

  const verifyScript = [
    "import hashlib, json, pathlib, sys",
    "base = pathlib.Path(sys.argv[1])",
    "data = json.loads((base / 'release.json').read_text())",
    "assert all((base / item['name']).exists() for item in data['files'])",
    "assert all((base / item['name']).stat().st_size == int(item['size_bytes']) for item in data['files'])",
    "assert all(hashlib.sha256((base / item['name']).read_bytes()).hexdigest() == item['sha256'] for item in data['files'])",
    "print('remote_release_ok', data['version'], len(data['files']))",
  ].join("; ");
  const verifyAndActivateCommand = [
    "set -e",
    `test -s ${shellQuote(stagingDir)}/release.json`,
    `python3 -c ${shellQuote(verifyScript)} ${shellQuote(stagingDir)}`,
    ...files.map((file) => `mv -f ${shellQuote(`${stagingDir}/${file.name}`)} ${shellQuote(`${remoteDir}/${file.name}`)}`),
    `mv -f ${shellQuote(`${stagingDir}/release.json`)} ${shellQuote(`${remoteDir}/release.json`)}`,
    `rmdir ${shellQuote(stagingDir)}`,
    "echo release_activated",
    "echo previous_release_files_retained_for_cache_transition",
  ].join("; ");
  run("ssh", [opts.remote, verifyAndActivateCommand]);
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
  if (!opts.remote) {
    fail("Missing deploy target. Set OUTILSIA_DEPLOY_REMOTE or pass --remote <user@host>.");
  }
  deploy(validated, opts);
  console.log("deploy_complete");
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
