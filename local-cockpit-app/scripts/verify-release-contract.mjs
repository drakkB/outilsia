#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const defaultInput = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");

const platformExts = {
  "windows-x64": new Set([".exe", ".msi"]),
  linux: new Set([".appimage", ".deb", ".rpm"]),
  macos: new Set([".dmg"]),
};

function usage() {
  console.log(`Usage:
  node scripts/verify-release-contract.mjs [--input <release-dir>] [--require-platform <platform>] [--require-freshness]

Examples:
  npm run verify:release:contract
  npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux
  npm run verify:release:contract -- --require-platform windows-x64 --require-freshness
  npm run verify:release:contract -- --input ../server-work/static/downloads/local-cockpit
`);
}

function parseArgs(argv) {
  const opts = { input: defaultInput, requiredPlatforms: [], requireFreshness: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--input") {
      opts.input = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--require-platform") {
      opts.requiredPlatforms.push(argv[++i] || "");
      continue;
    }
    if (arg === "--require-freshness") {
      opts.requireFreshness = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function fail(message) {
  throw new Error(message);
}

function sha256(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function assertPlatformFile(file) {
  const allowed = platformExts[file.platform];
  if (!allowed) fail(`Unsupported platform in release file: ${file.platform}`);
  const ext = extname(file.name).toLowerCase();
  if (!allowed.has(ext)) {
    fail(`Invalid native extension for ${file.platform}: ${file.name}`);
  }
}

function assertFreshness(release) {
  const freshness = release.freshness;
  if (!freshness || typeof freshness !== "object") fail("Missing release.freshness");
  if (freshness.stale !== false) fail("release.freshness.stale must be false");
  if (freshness.allow_stale === true) fail("release.freshness.allow_stale must not be true");
  if (!freshness.newest_source) fail("release.freshness.newest_source is required");
  if (!freshness.oldest_artifact) fail("release.freshness.oldest_artifact is required");
  if (!Number.isFinite(Number(freshness.newest_source_mtime_ms))) {
    fail("release.freshness.newest_source_mtime_ms is required");
  }
  if (!Number.isFinite(Number(freshness.oldest_artifact_mtime_ms))) {
    fail("release.freshness.oldest_artifact_mtime_ms is required");
  }
  if (Number(freshness.oldest_artifact_mtime_ms) + 1000 < Number(freshness.newest_source_mtime_ms)) {
    fail("release.freshness timestamps indicate a stale artifact");
  }
}

try {
  const opts = parseArgs(process.argv.slice(2));
  const releasePath = join(opts.input, "release.json");
  if (!existsSync(releasePath)) fail(`Missing release.json in ${opts.input}`);

  const release = JSON.parse(readFileSync(releasePath, "utf8"));
  if (release.ok !== true) fail("release.ok must be true");
  if (release.product !== "OutilsIA Local Cockpit") fail("Unexpected release.product");
  if (release.channel !== "beta") fail("release.channel must be beta");
  if (!/^\d+\.\d+\.\d+/.test(release.version || "")) fail("Invalid release.version");
  if (!release.build_id) fail("Missing release.build_id");
  if (!release.primary_download?.name) fail("Missing primary_download.name");
  if (!Array.isArray(release.files) || !release.files.length) fail("release.files must be non-empty");
  if (!release.downloads_by_platform || typeof release.downloads_by_platform !== "object") {
    fail("Missing downloads_by_platform");
  }
  if (opts.requireFreshness) assertFreshness(release);

  const names = new Set();
  const platforms = new Set();
  for (const file of release.files) {
    if (!file.name || file.name !== basename(file.name)) fail(`Invalid release file name: ${file.name}`);
    if (names.has(file.name)) fail(`Duplicate release file: ${file.name}`);
    names.add(file.name);
    platforms.add(file.platform);
    assertPlatformFile(file);
    if (!file.url || file.url !== `/static/downloads/local-cockpit/${file.name}`) {
      fail(`Invalid URL for ${file.name}`);
    }
    if (!/^[a-f0-9]{64}$/i.test(file.sha256 || "")) fail(`Invalid SHA256 for ${file.name}`);
    const path = join(opts.input, file.name);
    if (!existsSync(path)) fail(`Missing artifact file: ${file.name}`);
    const stat = statSync(path);
    if (!stat.isFile()) fail(`Artifact is not a file: ${file.name}`);
    if (stat.size !== Number(file.size_bytes)) fail(`Size mismatch for ${file.name}`);
    if (sha256(path) !== file.sha256) fail(`SHA256 mismatch for ${file.name}`);
  }

  if (!names.has(release.primary_download.name)) fail("primary_download is not listed in release.files");
  assertPlatformFile(release.primary_download);

  for (const [platform, files] of Object.entries(release.downloads_by_platform)) {
    if (!platformExts[platform]) fail(`Unsupported downloads_by_platform key: ${platform}`);
    if (!Array.isArray(files) || !files.length) fail(`downloads_by_platform.${platform} must be non-empty`);
    for (const file of files) {
      if (!names.has(file.name)) fail(`downloads_by_platform.${platform} references unknown file: ${file.name}`);
      assertPlatformFile(file);
    }
  }

  for (const platform of opts.requiredPlatforms) {
    if (!platformExts[platform]) fail(`Unsupported required platform: ${platform}`);
    if (!platforms.has(platform)) fail(`Missing required platform: ${platform}`);
    if (!release.downloads_by_platform[platform]?.length) {
      fail(`Missing downloads_by_platform for required platform: ${platform}`);
    }
  }

  console.log(`release_contract_ok ${release.version} ${release.files.length} file(s) platforms=${[...platforms].sort().join(",")}${opts.requireFreshness ? " freshness=ok" : ""}`);
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
