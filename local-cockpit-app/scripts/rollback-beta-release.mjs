#!/usr/bin/env node
import { basename } from "node:path";
import { spawnSync } from "node:child_process";

const defaultRemote = process.env.OUTILSIA_DEPLOY_REMOTE || "";
const defaultIdentity = process.env.OUTILSIA_SSH_IDENTITY || "";
const defaultRemoteDir = "/var/www/outilsia/static/downloads/local-cockpit";
const defaultRemotePage = "/var/www/outilsia/static/pages/telecharger-scanner-ia-local.html";

function fail(message) {
  throw new Error(message);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function parseArgs(argv) {
  const opts = {
    backupDir: "",
    expectedCurrentBuild: "",
    remote: defaultRemote,
    identity: defaultIdentity,
    remoteDir: defaultRemoteDir,
    remotePage: defaultRemotePage,
    deploy: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/rollback-beta-release.mjs --backup-dir <remote-backup>
    --expected-current-build <build-id> [--remote <user@host>] [--deploy]

Dry-run is the default. The backup must be one produced by deploy-beta-release:
  /var/backups/outilsia-local-cockpit/release_YYYYMMDDHHMMSS`);
      process.exit(0);
    }
    if (arg === "--backup-dir") opts.backupDir = argv[++index] || "";
    else if (arg === "--expected-current-build") opts.expectedCurrentBuild = argv[++index] || "";
    else if (arg === "--remote") opts.remote = argv[++index] || "";
    else if (arg === "--identity") opts.identity = argv[++index] || "";
    else if (arg === "--remote-dir") opts.remoteDir = argv[++index] || "";
    else if (arg === "--remote-page") opts.remotePage = argv[++index] || "";
    else if (arg === "--deploy") opts.deploy = true;
    else fail(`Unknown argument: ${arg}`);
  }
  if (!/^\/var\/backups\/outilsia-local-cockpit\/release_\d{14}$/.test(opts.backupDir)) {
    fail("Invalid --backup-dir. Use the exact rollback_backup path printed by deployment.");
  }
  if (!/^[0-9A-Za-z._-]{6,32}$/.test(opts.expectedCurrentBuild)) {
    fail("Invalid --expected-current-build");
  }
  return opts;
}

function sshOptions(opts) {
  return opts.identity ? ["-i", opts.identity, "-o", "BatchMode=yes"] : [];
}

function rollbackCommand(opts) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const remoteDir = opts.remoteDir.replace(/\/+$/, "");
  const lockDir = `${remoteDir}.deploy_lock`;
  const stageDir = `${remoteDir}.rollback_${stamp}_${process.pid}`;
  const safetyDir = `/var/backups/outilsia-local-cockpit/pre_rollback_${stamp}`;
  const backupRelease = `${opts.backupDir}/release`;
  const backupPage = `${opts.backupDir}/page/${basename(opts.remotePage)}`;
  const currentBuildScript = [
    "import json,pathlib,sys",
    "data=json.loads((pathlib.Path(sys.argv[1])/'release.json').read_text())",
    "assert str(data.get('build_id','')) == sys.argv[2], f\"current build is {data.get('build_id')}\"",
  ].join("; ");
  const verifyScript = [
    "import hashlib,json,pathlib,sys",
    "base=pathlib.Path(sys.argv[1])",
    "data=json.loads((base/'release.json').read_text())",
    "assert data.get('ok') is True",
    "assert all((base/f['name']).is_file() for f in data['files'])",
    "assert all((base/f['name']).stat().st_size == int(f['size_bytes']) for f in data['files'])",
    "assert all(hashlib.sha256((base/f['name']).read_bytes()).hexdigest() == f['sha256'] for f in data['files'])",
    "print('rollback_source_ok',data['version'],data['build_id'],len(data['files']))",
  ].join("; ");
  const activateScript = [
    "import json,pathlib,shutil,sys",
    "source=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2])",
    "data=json.loads((source/'release.json').read_text())",
    "target.mkdir(parents=True,exist_ok=True)",
    "[shutil.copy2(source/f['name'],target/f['name']) for f in data['files']]",
  ].join("; ");
  const verifyActiveScript = [
    "import hashlib,json,pathlib,sys",
    "base=pathlib.Path(sys.argv[1]); page=pathlib.Path(sys.argv[2])",
    "data=json.loads((base/'release.json').read_text())",
    "assert all((base/f['name']).is_file() for f in data['files'])",
    "assert all(hashlib.sha256((base/f['name']).read_bytes()).hexdigest() == f['sha256'] for f in data['files'])",
    "text=page.read_text()",
    "assert str(data['build_id']) in text",
    "assert all(f['name'] in text and f['sha256'] in text for f in data['files'])",
    "print('rollback_active_ok',data['version'],data['build_id'])",
  ].join("; ");
  return [
    "set -e",
    `test -s ${shellQuote(`${backupRelease}/release.json`)}`,
    `test -s ${shellQuote(backupPage)}`,
    `if [ -d ${shellQuote(lockDir)} ] && find ${shellQuote(lockDir)} -maxdepth 0 -mmin +120 -print -quit | grep -q .; then rm -rf ${shellQuote(lockDir)}; fi`,
    `mkdir ${shellQuote(lockDir)}`,
    `trap 'rm -rf ${shellQuote(stageDir)} ${shellQuote(lockDir)}' EXIT`,
    `restore_current() { set +e; if [ -s ${shellQuote(`${safetyDir}/release/release.json`)} ]; then python3 -c ${shellQuote(activateScript)} ${shellQuote(`${safetyDir}/release`)} ${shellQuote(remoteDir)}; cp -af ${shellQuote(`${safetyDir}/page/${basename(opts.remotePage)}`)} ${shellQuote(opts.remotePage)}; cp -af ${shellQuote(`${safetyDir}/release/release.json`)} ${shellQuote(`${remoteDir}/release.json`)}; echo failed_rollback_restored_current_release >&2; fi; }`,
    "trap 'restore_current' ERR",
    `python3 -c ${shellQuote(currentBuildScript)} ${shellQuote(remoteDir)} ${shellQuote(opts.expectedCurrentBuild)}`,
    `python3 -c ${shellQuote(verifyScript)} ${shellQuote(backupRelease)}`,
    `mkdir -p ${shellQuote(`${safetyDir}/release`)} ${shellQuote(`${safetyDir}/page`)}`,
    `cp -a ${shellQuote(remoteDir)}/. ${shellQuote(`${safetyDir}/release`)}/`,
    `cp -a ${shellQuote(opts.remotePage)} ${shellQuote(`${safetyDir}/page/${basename(opts.remotePage)}`)}`,
    `mkdir -p ${shellQuote(stageDir)}`,
    `cp -a ${shellQuote(backupRelease)}/. ${shellQuote(stageDir)}/`,
    `python3 -c ${shellQuote(activateScript)} ${shellQuote(stageDir)} ${shellQuote(remoteDir)}`,
    `cp -af ${shellQuote(backupPage)} ${shellQuote(opts.remotePage)}`,
    `cp -af ${shellQuote(`${stageDir}/release.json`)} ${shellQuote(`${remoteDir}/release.json`)}`,
    `python3 -c ${shellQuote(verifyActiveScript)} ${shellQuote(remoteDir)} ${shellQuote(opts.remotePage)}`,
    "trap - ERR",
    `rm -rf ${shellQuote(stageDir)} ${shellQuote(lockDir)}`,
    "trap - EXIT",
    `echo rollback_complete safety_backup:${safetyDir}`,
  ].join("; ");
}

try {
  const opts = parseArgs(process.argv.slice(2));
  const command = rollbackCommand(opts);
  console.log(`rollback_plan backup=${opts.backupDir} expected_current_build=${opts.expectedCurrentBuild}`);
  console.log(`remote=${opts.remote || "<missing>"} remote_dir=${opts.remoteDir}`);
  if (!opts.deploy) {
    console.log("dry_run=true");
    console.log("Add --deploy after checking the backup path and current build.");
    process.exit(0);
  }
  if (!opts.remote) fail("Missing deploy target. Set OUTILSIA_DEPLOY_REMOTE or pass --remote.");
  const result = spawnSync("ssh", [...sshOptions(opts), opts.remote, command], { stdio: "inherit" });
  if (result.status !== 0) fail(`Rollback command failed with exit code ${result.status}`);
  console.log("rollback_complete");
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
