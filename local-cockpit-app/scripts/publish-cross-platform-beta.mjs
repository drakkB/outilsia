#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const defaultReleaseDir = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");

function usage() {
  console.log(`Usage:
  node scripts/publish-cross-platform-beta.mjs --input <merged-artifact.zip|dir> [--release-dir <dir>] [--deploy] [--remote <host>] [--remote-dir <dir>]
  node scripts/publish-cross-platform-beta.mjs --windows <artifact.zip|dir> --linux <artifact.zip|dir> [--release-dir <dir>] [--deploy] [--remote <host>] [--remote-dir <dir>]

Examples:
  npm run publish:cross-platform -- --input ~/Downloads/local-cockpit-cross-platform-web-release.zip
  npm run publish:cross-platform -- --windows ~/Downloads/local-cockpit-windows-web-release.zip --linux ~/Downloads/local-cockpit-linux-web-release.zip --deploy

The script imports the artifact(s), requires windows-x64 and linux, validates Linux native files, validates the release,
then deploys only when --deploy is provided.

Linux public deploy is blocked until at least two Windows terrain profiles are ready, unless --force-terrain-override is provided with an explicit manual decision.`);
}

function parseArgs(argv) {
  const opts = {
    input: "",
    windows: "",
    linux: "",
    releaseDir: defaultReleaseDir,
    deploy: false,
    forceTerrainOverride: false,
    remote: "",
    remoteDir: "",
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
    if (arg === "--force-terrain-override") {
      opts.forceTerrainOverride = true;
      continue;
    }
    if (arg === "--input") {
      opts.input = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--windows") {
      opts.windows = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--linux") {
      opts.linux = resolve(argv[++i] || "");
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
  if (opts.input && (opts.windows || opts.linux)) {
    throw new Error("Use either --input or --windows/--linux, not both");
  }
  if (!opts.input && !(opts.windows && opts.linux)) {
    throw new Error("Missing --input <merged-artifact> or --windows <artifact> --linux <artifact>");
  }
  for (const path of [opts.input, opts.windows, opts.linux].filter(Boolean)) {
    if (!existsSync(path)) throw new Error(`Artifact not found: ${path}`);
  }
  return opts;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: appRoot, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function terrainGateStatus() {
  const candidates = [
    process.env.OUTILSIA_FIELD_STATUS_JSON,
    "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Field-Test-Kit/FIELD-TESTS-STATUS.json",
  ].filter(Boolean);
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) {
    return {
      ok: false,
      source: "",
      ready: 0,
      required: 5,
      minimum: 2,
      reason: "FIELD-TESTS-STATUS.json introuvable",
    };
  }
  const status = readJson(path);
  const ready = Number(status.ready || status.profiles_ready?.length || 0);
  const required = Number(status.required || status.profiles_required?.length || 5);
  const minimum = Number(status.minimum_ready_before_linux_publication || 2);
  const networkVerified = Boolean(status.report_network_verified);
  return {
    ok: ready >= minimum && networkVerified,
    source: path,
    ready,
    required,
    minimum,
    network_verified: networkVerified,
    next: status.next_profile_to_test || status.next_profile || "",
    reason: ready >= minimum && networkVerified
      ? `gate terrain ouvert: ${ready}/${required}, minimum ${minimum}, rapports réseau vérifiés`
      : `gate terrain fermé: ${ready}/${required}, minimum ${minimum}, report_network_verified=${networkVerified}`,
  };
}

function enforceLinuxPublicDeployGate(opts) {
  if (!opts.deploy) return;
  const gate = terrainGateStatus();
  if (gate.ok) {
    console.log(`linux_public_deploy_gate_ok ${gate.reason} source=${gate.source}`);
    return;
  }
  if (opts.forceTerrainOverride) {
    console.warn(`linux_public_deploy_gate_override ${gate.reason} source=${gate.source || "missing"} next=${gate.next || "unknown"}`);
    console.warn("Manual override used: document why Linux public publication is allowed before the terrain gate.");
    return;
  }
  throw new Error(
    [
      `Linux public deploy blocked: ${gate.reason}.`,
      gate.source ? `Source: ${gate.source}.` : "Source: FIELD-TESTS-STATUS.json not found.",
      gate.next ? `Next terrain profile: ${gate.next}.` : "",
      "Run the next Windows terrain cycle or use --force-terrain-override with a documented manual decision.",
    ].filter(Boolean).join(" ")
  );
}

try {
  const opts = parseArgs(process.argv.slice(2));
  const scratch = mkdtempSync(join(tmpdir(), "outilsia-cross-platform-release-"));
  try {
    const releaseDir = opts.releaseDir || join(scratch, "release");
    if (opts.input) {
      run("node", ["scripts/import-beta-artifact.mjs", "--input", opts.input, "--output-dir", releaseDir, "--replace"]);
    } else {
      run("node", ["scripts/import-beta-artifact.mjs", "--input", opts.windows, "--output-dir", releaseDir, "--replace"]);
      run("node", ["scripts/import-beta-artifact.mjs", "--input", opts.linux, "--output-dir", releaseDir, "--merge"]);
    }

    run("node", ["scripts/verify-release-contract.mjs", "--input", releaseDir, "--require-platform", "windows-x64", "--require-platform", "linux"]);
    run("bash", ["scripts/verify-linux-artifacts.sh", "--release-dir", releaseDir]);
    enforceLinuxPublicDeployGate(opts);
    run("node", [
      "scripts/deploy-beta-release.mjs",
      "--release-dir",
      releaseDir,
      "--require-freshness",
      ...(opts.remote ? ["--remote", opts.remote] : []),
      ...(opts.remoteDir ? ["--remote-dir", opts.remoteDir] : []),
      ...(opts.deploy ? ["--include-public-page", "--deploy"] : []),
    ]);
    if (!opts.deploy) {
      console.log("cross_platform_beta_ready dry_run");
      console.log("Add --deploy to publish this Windows + Linux release.");
    } else {
      console.log("cross_platform_beta_published");
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
