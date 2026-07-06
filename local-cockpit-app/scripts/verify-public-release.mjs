#!/usr/bin/env node
import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";

const defaultBaseUrl = "https://outilsia.fr";
const releasePath = "/static/downloads/local-cockpit/release.json";
const supportedPlatforms = new Set(["windows-x64", "linux", "macos"]);

function usage() {
  console.log(`Usage:
  node scripts/verify-public-release.mjs [--base-url <url>] [--optional] [--max-file-mb <mb>] [--require-platform <platform>] [--require-freshness]

Default:
  --base-url ${defaultBaseUrl}
  --max-file-mb 600

Without --optional, a missing public release is a failure.
With --optional, a missing release is accepted for pre-publication checks.`);
}

function parseArgs(argv) {
  const opts = {
    baseUrl: defaultBaseUrl,
    optional: false,
    maxFileBytes: 600 * 1024 * 1024,
    requiredPlatforms: [],
    requireFreshness: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--optional") {
      opts.optional = true;
      continue;
    }
    if (arg === "--base-url") {
      opts.baseUrl = String(argv[++i] || "").replace(/\/+$/, "");
      continue;
    }
    if (arg === "--max-file-mb") {
      const mb = Number(argv[++i] || "");
      if (!Number.isFinite(mb) || mb <= 0) throw new Error("--max-file-mb must be a positive number");
      opts.maxFileBytes = Math.round(mb * 1024 * 1024);
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
  if (!/^https?:\/\//.test(opts.baseUrl)) throw new Error("--base-url must start with http:// or https://");
  return opts;
}

function request(url, { accept = "*/*", timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith("http://") ? http : https;
    const req = transport.request(url, {
      method: "GET",
      headers: {
        Accept: accept,
        "User-Agent": "OutilsIA-Local-Cockpit/0.1 Mozilla/5.0",
      },
      timeout,
    }, (res) => resolve(res));
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`${url} timeout`)));
    req.end();
  });
}

async function fetchJson(url) {
  const res = await request(url, { accept: "application/json" });
  let body = "";
  res.setEncoding("utf8");
  for await (const chunk of res) {
    body += chunk;
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const error = new Error(`${url} returned ${res.statusCode}`);
    error.statusCode = res.statusCode;
    error.body = body.slice(0, 200);
    throw error;
  }
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`${url} invalid JSON: ${error.message}`);
  }
}

function fail(message) {
  throw new Error(message);
}

function validateFreshness(release) {
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

function validateRelease(release, requiredPlatforms = [], requireFreshness = false) {
  if (release.ok !== true) fail("release.ok must be true");
  if (release.product !== "OutilsIA Local Cockpit") fail("Unexpected product in release.json");
  if (release.channel !== "beta") fail("release.channel must be beta");
  if (!release.version || !/^\d+\.\d+\.\d+/.test(release.version)) fail("Invalid release.version");
  if (!release.primary_download?.name) fail("Missing primary_download.name");
  if (!Array.isArray(release.files) || !release.files.length) fail("release.files must contain at least one file");
  if (requireFreshness) validateFreshness(release);

  const names = new Set();
  for (const file of release.files) {
    if (!file.name || file.name.includes("/") || file.name.includes("\\")) fail(`Invalid file name: ${file.name}`);
    if (names.has(file.name)) fail(`Duplicate file in release.json: ${file.name}`);
    names.add(file.name);
    if (!file.url || !file.url.startsWith("/static/downloads/local-cockpit/")) fail(`Invalid URL for ${file.name}`);
    if (!/^[a-f0-9]{64}$/i.test(file.sha256 || "")) fail(`Invalid sha256 for ${file.name}`);
    if (!Number.isInteger(Number(file.size_bytes)) || Number(file.size_bytes) <= 0) fail(`Invalid size_bytes for ${file.name}`);
  }
  if (!names.has(release.primary_download.name)) fail("primary_download must be listed in files");
  const platforms = new Set(release.files.map((file) => file.platform).filter(Boolean));
  if (![...platforms].some((platform) => supportedPlatforms.has(platform))) {
    fail("No supported desktop artifact found in release.files");
  }
  if (release.downloads_by_platform) {
    for (const [platform, items] of Object.entries(release.downloads_by_platform)) {
      if (!Array.isArray(items) || !items.length) fail(`downloads_by_platform.${platform} must be a non-empty array`);
      for (const item of items) {
        if (!names.has(item.name)) fail(`downloads_by_platform.${platform} references unknown file: ${item.name}`);
      }
    }
  }

  for (const platform of requiredPlatforms) {
    if (!supportedPlatforms.has(platform)) fail(`Unsupported required platform: ${platform}`);
    if (!platforms.has(platform)) fail(`Missing required platform: ${platform}`);
    if (release.downloads_by_platform && !release.downloads_by_platform[platform]?.length) {
      fail(`Missing downloads_by_platform for required platform: ${platform}`);
    }
  }
}

async function verifyFile(baseUrl, file, maxFileBytes) {
  const url = `${baseUrl}${file.url}`;
  const res = await request(url, { accept: "application/octet-stream", timeout: 120000 });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    fail(`${url} returned ${res.statusCode}`);
  }
  const expectedSize = Number(file.size_bytes);
  const contentLength = Number(res.headers["content-length"] || 0);
  if (contentLength && contentLength !== expectedSize) {
    fail(`Content-Length mismatch for ${file.name}: json=${expectedSize} http=${contentLength}`);
  }
  if (expectedSize > maxFileBytes) {
    fail(`${file.name} exceeds max file size: ${expectedSize} bytes`);
  }

  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of res) {
    bytes += chunk.length;
    if (bytes > maxFileBytes) fail(`${file.name} exceeds max file size while downloading`);
    hash.update(chunk);
  }
  const actualHash = hash.digest("hex");
  if (bytes !== expectedSize) fail(`Size mismatch for ${file.name}: json=${expectedSize} actual=${bytes}`);
  if (actualHash !== file.sha256) fail(`SHA256 mismatch for ${file.name}`);
  return { name: file.name, platform: file.platform || "unknown", bytes, sha256: actualHash };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const releaseUrl = `${opts.baseUrl}${releasePath}`;
  let release;
  try {
    release = await fetchJson(releaseUrl);
  } catch (error) {
    if (opts.optional && [403, 404].includes(error.statusCode)) {
      console.log(`public_release_absent_optional status=${error.statusCode} url=${releaseUrl}`);
      return;
    }
    throw error;
  }

  validateRelease(release, opts.requiredPlatforms, opts.requireFreshness);
  const verified = [];
  for (const file of release.files) {
    verified.push(await verifyFile(opts.baseUrl, file, opts.maxFileBytes));
  }

  console.log(`public_release_ok ${release.version} ${verified.length} file(s)${opts.requireFreshness ? " freshness=ok" : ""}`);
  for (const file of verified) {
    console.log(`${file.platform} ${file.name} ${file.bytes} ${file.sha256}`);
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
