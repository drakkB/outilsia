#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const defaultReleaseDir = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");
const defaultPagePath = join(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html");
const defaultRemote = process.env.OUTILSIA_DEPLOY_REMOTE || "";
const defaultIdentity = process.env.OUTILSIA_SSH_IDENTITY || "";
const defaultRemoteDir = "/var/www/outilsia/static/downloads/local-cockpit";
const defaultRemotePagePath = "/var/www/outilsia/static/pages/telecharger-scanner-ia-local.html";

function usage() {
  console.log(`Usage:
  node scripts/deploy-beta-release.mjs [--release-dir <dir>] [--remote <host>] [--remote-dir <dir>] [--deploy] [--require-freshness] [--include-public-page]
    [--page <staged-download-page.html>] [--promotion-proof <PROMOTION-PROOF.json>]

Default:
  --release-dir ${defaultReleaseDir}
  --remote ${defaultRemote || "<set OUTILSIA_DEPLOY_REMOTE or pass --remote>"}
  --remote-dir ${defaultRemoteDir}
  --remote-page ${defaultRemotePagePath}
  --identity ${defaultIdentity || "<optional SSH private key>"}

Without --deploy, the script validates only and prints the planned deployment.`);
}

function parseArgs(argv) {
  const opts = {
    releaseDir: defaultReleaseDir,
    remote: defaultRemote,
    identity: defaultIdentity,
    remoteDir: defaultRemoteDir,
    remotePagePath: defaultRemotePagePath,
    deploy: false,
    requireFreshness: false,
    includePublicPage: false,
    pagePath: "",
    promotionProofPath: "",
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
    if (arg === "--include-public-page") {
      opts.includePublicPage = true;
      continue;
    }
    if (arg === "--page") {
      opts.pagePath = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--promotion-proof") {
      opts.promotionProofPath = resolve(argv[++i] || "");
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
    if (arg === "--identity") {
      opts.identity = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--remote-dir") {
      opts.remoteDir = argv[++i] || "";
      continue;
    }
    if (arg === "--remote-page") {
      opts.remotePagePath = argv[++i] || "";
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
  if (Number(release.freshness.oldest_artifact_mtime_ms) + 1000 < Number(release.freshness.newest_source_mtime_ms)) {
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

function validatePromotionProof(validated, opts) {
  const promoted = validated.release.build_provenance?.promoted_from_rc;
  const defaultProof = join(opts.releaseDir, "PROMOTION-PROOF.json");
  const proofPath = opts.promotionProofPath || (existsSync(defaultProof) ? defaultProof : "");
  if (!promoted && !proofPath) return null;
  if (!promoted) fail("Promotion proof was supplied for a release without promoted_from_rc provenance");
  if (!proofPath || !existsSync(proofPath) || !statSync(proofPath).isFile()) {
    fail("RC-promoted release requires PROMOTION-PROOF.json");
  }
  const proof = JSON.parse(readFileSync(proofPath, "utf8").replace(/^\uFEFF/, ""));
  if (proof.schema !== "outilsia.local_cockpit_rc_promotion_proof.v1") fail("Unexpected promotion proof schema");
  if (proof.public_deploy_executed !== false) fail("Promotion proof is already marked as deployed");
  if (proof.rollback_required_before_deploy !== true) fail("Promotion proof must require rollback preparation");
  if (proof.release_manifest_sha256 !== sha256(validated.releasePath)) {
    fail("Promotion proof release manifest hash mismatch");
  }
  if (proof.candidate?.label !== promoted.label
    || proof.candidate?.manifest_sha256 !== promoted.candidate_manifest_sha256
    || proof.candidate?.artifact_set_sha256 !== promoted.candidate_artifact_set_sha256) {
    fail("Promotion proof candidate identity mismatch");
  }
  if (proof.smoke_status_sha256 !== promoted.smoke_status_sha256
    || proof.smoke_registry_sha256 !== promoted.smoke_registry_sha256
    || proof.decision_sha256 !== promoted.decision_sha256) {
    fail("Promotion proof evidence hash mismatch");
  }
  const bySha = new Map(validated.files.map((file) => [file.sha256, file]));
  if (!Array.isArray(proof.artifact_identity)
    || proof.artifact_identity.length !== validated.files.length
    || proof.artifact_identity.some((item) => (
      item.exact_bytes !== true
      || !bySha.has(item.sha256)
      || bySha.get(item.sha256).name !== item.public_name
      || Number(bySha.get(item.sha256).size_bytes) !== Number(item.size_bytes)
    ))) {
    fail("Promotion proof artifact identity mismatch");
  }
  return { path: proofPath, sha256: sha256(proofPath) };
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

function sshOptions(opts) {
  return opts.identity ? ["-i", opts.identity, "-o", "BatchMode=yes"] : [];
}

function deploy({ release, releasePath, files, pagePath }, opts) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const buildToken = String(release.build_id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  const backupDir = `/var/backups/outilsia-local-cockpit/release_${stamp}`;
  const remoteDir = opts.remoteDir.replace(/\/+$/, "");
  const remotePagePath = opts.remotePagePath;
  const stagingDir = `${remoteDir}.upload_${buildToken}_${stamp}_${process.pid}`;
  const lockDir = `${remoteDir}.deploy_lock`;
  const ownerToken = `build=${buildToken} started=${stamp} pid=${process.pid}`;
  const backupReleaseDir = `${backupDir}/release`;
  const backupPageDir = `${backupDir}/page`;
  const prepareCommand = [
    "set -e",
    ...(opts.requireRollbackSource ? [
      `test -s ${shellQuote(`${remoteDir}/release.json`)}`,
      ...(pagePath && remotePagePath ? [`test -s ${shellQuote(remotePagePath)}`] : []),
    ] : []),
    `if [ -d ${shellQuote(lockDir)} ] && find ${shellQuote(lockDir)} -maxdepth 0 -mmin +120 -print -quit | grep -q .; then rm -rf ${shellQuote(lockDir)}; fi`,
    `if ! mkdir ${shellQuote(lockDir)}; then echo ${shellQuote(`release deploy already locked: ${lockDir}`)} >&2; exit 73; fi`,
    `printf '%s\n' ${shellQuote(ownerToken)} > ${shellQuote(`${lockDir}/owner`)}`,
    `mkdir -p ${shellQuote(backupReleaseDir)}`,
    `mkdir -p ${shellQuote(backupPageDir)}`,
    `mkdir -p ${shellQuote(remoteDir)}`,
    `cp -a ${shellQuote(remoteDir)}/. ${shellQuote(backupReleaseDir)}/ 2>/dev/null || true`,
    ...(pagePath && remotePagePath ? [
      `mkdir -p ${shellQuote(dirname(remotePagePath))}`,
      `cp -a ${shellQuote(remotePagePath)} ${shellQuote(`${backupPageDir}/${basename(remotePagePath)}`)} 2>/dev/null || true`,
    ] : []),
    `rm -rf ${shellQuote(stagingDir)}`,
    `mkdir -p ${shellQuote(stagingDir)}`,
    `echo backup:${backupDir}`,
  ].join("; ");
  try {
    run("ssh", [...sshOptions(opts), opts.remote, prepareCommand]);
    for (const file of files) {
      run("scp", [...sshOptions(opts), file.path, `${opts.remote}:${stagingDir}/${basename(file.path)}`]);
    }
    run("scp", [...sshOptions(opts), releasePath, `${opts.remote}:${stagingDir}/release.json`]);
    if (pagePath && remotePagePath) {
      run("scp", [...sshOptions(opts), pagePath, `${opts.remote}:${stagingDir}/${basename(remotePagePath)}`]);
    }

    const verifyScript = [
      "import hashlib, json, pathlib, sys",
      "base = pathlib.Path(sys.argv[1])",
      "data = json.loads((base / 'release.json').read_text())",
      "assert all((base / item['name']).exists() for item in data['files'])",
      "assert all((base / item['name']).stat().st_size == int(item['size_bytes']) for item in data['files'])",
      "assert all(hashlib.sha256((base / item['name']).read_bytes()).hexdigest() == item['sha256'] for item in data['files'])",
      "print('remote_release_ok', data['version'], len(data['files']))",
    ].join("; ");
    const verifyActiveScript = [
      "import hashlib, json, pathlib, sys",
      "base = pathlib.Path(sys.argv[1])",
      "page = pathlib.Path(sys.argv[2]) if sys.argv[2] else None",
      "data = json.loads((base / 'release.json').read_text())",
      "assert all((base / item['name']).exists() for item in data['files'])",
      "assert all((base / item['name']).stat().st_size == int(item['size_bytes']) for item in data['files'])",
      "assert all(hashlib.sha256((base / item['name']).read_bytes()).hexdigest() == item['sha256'] for item in data['files'])",
      "text = page.read_text() if page else ''",
      "assert not page or str(data['build_id']) in text",
      "assert not page or all(item['name'] in text and item['sha256'] in text for item in data['files'])",
      "print('remote_active_release_ok', data['version'], data['build_id'], len(data['files']))",
    ].join("; ");
    const restoreFilesScript = [
      "import json,pathlib,shutil,sys",
      "source=pathlib.Path(sys.argv[1])",
      "target=pathlib.Path(sys.argv[2])",
      "data=json.loads((source/'release.json').read_text())",
      "target.mkdir(parents=True,exist_ok=True)",
      "[shutil.copy2(source/item['name'],target/item['name']) for item in data['files']]",
    ].join("; ");
    const rollbackCommands = [
      `if [ -s ${shellQuote(`${backupReleaseDir}/release.json`)} ]; then python3 -c ${shellQuote(restoreFilesScript)} ${shellQuote(backupReleaseDir)} ${shellQuote(remoteDir)}; fi`,
      ...(pagePath && remotePagePath ? [
        `if [ -s ${shellQuote(`${backupPageDir}/${basename(remotePagePath)}`)} ]; then cp -af ${shellQuote(`${backupPageDir}/${basename(remotePagePath)}`)} ${shellQuote(remotePagePath)}; fi`,
      ] : []),
      `if [ -s ${shellQuote(`${backupReleaseDir}/release.json`)} ]; then cp -af ${shellQuote(`${backupReleaseDir}/release.json`)} ${shellQuote(`${remoteDir}/release.json`)}; fi`,
      "echo automatic_release_rollback_applied >&2",
    ].join("; ");
    const verifyAndActivateCommand = [
      "set -e",
      `rollback_release() { set +e; ${rollbackCommands}; }`,
      "trap 'rollback_release' ERR",
      `test -s ${shellQuote(stagingDir)}/release.json`,
      `python3 -c ${shellQuote(verifyScript)} ${shellQuote(stagingDir)}`,
      ...files.map((file) => `mv -f ${shellQuote(`${stagingDir}/${file.name}`)} ${shellQuote(`${remoteDir}/${file.name}`)}`),
      ...(pagePath && remotePagePath ? [
        `mv -f ${shellQuote(`${stagingDir}/${basename(remotePagePath)}`)} ${shellQuote(remotePagePath)}`,
      ] : []),
      `mv -f ${shellQuote(`${stagingDir}/release.json`)} ${shellQuote(`${remoteDir}/release.json`)}`,
      `python3 -c ${shellQuote(verifyActiveScript)} ${shellQuote(remoteDir)} ${shellQuote(pagePath && remotePagePath ? remotePagePath : "")}`,
      "trap - ERR",
      `rmdir ${shellQuote(stagingDir)}`,
      "echo release_activated",
      `echo rollback_backup:${backupDir}`,
      "echo previous_release_files_retained_for_cache_transition",
    ].join("; ");
    run("ssh", [...sshOptions(opts), opts.remote, verifyAndActivateCommand]);
    return { backupDir };
  } finally {
    const cleanupCommand = [
      `rm -rf ${shellQuote(stagingDir)}`,
      `if [ "$(cat ${shellQuote(`${lockDir}/owner`)} 2>/dev/null || true)" = ${shellQuote(ownerToken)} ]; then rm -rf ${shellQuote(lockDir)}; fi`,
    ].join("; ");
    spawnSync("ssh", [...sshOptions(opts), opts.remote, cleanupCommand], { stdio: "inherit" });
  }
}

try {
  const opts = parseArgs(process.argv.slice(2));
  run("node", [
    join(appRoot, "scripts", "verify-release-contract.mjs"),
    "--input",
    opts.releaseDir,
    ...(opts.requireFreshness ? ["--require-freshness"] : []),
  ]);
  const managesPublicPage = resolve(opts.releaseDir) === resolve(defaultReleaseDir) || opts.includePublicPage || Boolean(opts.pagePath);
  let localPagePath = "";
  if (opts.pagePath) {
    if (!existsSync(opts.pagePath) || !statSync(opts.pagePath).isFile()) {
      fail(`Staged download page not found: ${opts.pagePath}`);
    }
    localPagePath = opts.pagePath;
  } else if (managesPublicPage) {
    run("node", [
      join(appRoot, "scripts", "sync-download-page-release.mjs"),
      "--release",
      join(opts.releaseDir, "release.json"),
      "--page",
      defaultPagePath,
    ]);
    localPagePath = defaultPagePath;
  }
  if (managesPublicPage) {
    run("node", [
      join(appRoot, "scripts", "verify-download-page-contract.mjs"),
      "--release-dir",
      opts.releaseDir,
      "--page",
      localPagePath,
      "--require-local-files",
      "--require-freshness",
    ]);
  }
  const validated = validateRelease(opts.releaseDir, { requireFreshness: opts.requireFreshness });
  const promotionProof = validatePromotionProof(validated, opts);
  opts.requireRollbackSource = Boolean(promotionProof);
  validated.pagePath = localPagePath;
  cleanupLocalReleaseDir(opts.releaseDir, new Set(validated.files.map((file) => file.name)));
  console.log("release_valid", validated.release.version, `${validated.files.length} file(s)${opts.requireFreshness ? " freshness=ok" : ""}`);
  for (const file of validated.files) {
    console.log(`${file.platform || "unknown"} ${file.name} ${file.size_bytes} ${file.sha256}`);
  }
  if (!opts.deploy) {
    console.log(`dry_run remote=${opts.remote} remote_dir=${opts.remoteDir}`);
    if (managesPublicPage) console.log(`download_page_ready ${localPagePath}`);
    console.log("Add --deploy to publish this release.");
    process.exit(0);
  }
  if (!opts.remote) {
    fail("Missing deploy target. Set OUTILSIA_DEPLOY_REMOTE or pass --remote <user@host>.");
  }
  const deployment = deploy(validated, opts);
  if (promotionProof) {
    const receiptPath = join(dirname(promotionProof.path), "DEPLOYMENT-RECEIPT.json");
    writeFileSync(receiptPath, `${JSON.stringify({
      schema: "outilsia.local_cockpit_deployment_receipt.v1",
      deployed_at: new Date().toISOString(),
      version: validated.release.version,
      build_id: validated.release.build_id,
      release_manifest_sha256: sha256(validated.releasePath),
      promotion_proof_sha256: promotionProof.sha256,
      rollback_backup: deployment.backupDir,
      remote: opts.remote,
      remote_dir: opts.remoteDir,
    }, null, 2)}\n`);
    console.log(`deployment_receipt=${receiptPath}`);
  }
  console.log("deploy_complete");
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
