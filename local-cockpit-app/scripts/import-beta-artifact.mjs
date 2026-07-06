#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const defaultOutputDir = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");

function usage() {
  console.log(`Usage:
  node scripts/import-beta-artifact.mjs --input <artifact.zip|artifact-dir> [--output-dir <dir>] [--replace]
  node scripts/import-beta-artifact.mjs --input <artifact.zip|artifact-dir> [--output-dir <dir>] --merge

Examples:
  npm run import:beta -- --input ~/Downloads/outilsia-local-cockpit-web-release.zip --replace
  npm run import:beta -- --input ~/Downloads/outilsia-local-cockpit-linux-web-release.zip --merge
  npm run import:beta -- --input ~/Downloads/outilsia-local-cockpit-web-release --replace

Default output:
  ${defaultOutputDir}

The input must contain release.json and every file referenced by release.files.`);
}

function parseArgs(argv) {
  const opts = {
    input: "",
    outputDir: defaultOutputDir,
    replace: false,
    merge: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--replace") {
      opts.replace = true;
      continue;
    }
    if (arg === "--merge") {
      opts.merge = true;
      continue;
    }
    if (arg === "--input") {
      opts.input = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--output-dir") {
      opts.outputDir = resolve(argv[++i] || "");
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!opts.input) throw new Error("Missing --input <artifact.zip|artifact-dir>");
  if (opts.replace && opts.merge) throw new Error("Use either --replace or --merge, not both");
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

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [path];
  });
}

function extractIfNeeded(input) {
  const stat = statSync(input);
  if (stat.isDirectory()) {
    return { root: input, cleanup: () => {} };
  }
  if (!stat.isFile()) {
    fail(`Input is neither file nor directory: ${input}`);
  }
  if (extname(input).toLowerCase() !== ".zip") {
    fail(`Unsupported artifact file extension: ${basename(input)}. Expected .zip or directory.`);
  }
  const unzip = spawnSync("unzip", ["-v"], { encoding: "utf8" });
  if (unzip.status !== 0) {
    fail("Missing unzip command. Install unzip or extract the artifact manually and pass the directory.");
  }
  const dir = mkdtempSync(join(tmpdir(), "outilsia-beta-artifact-"));
  const result = spawnSync("unzip", ["-q", input, "-d", dir], { stdio: "inherit" });
  if (result.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    fail(`Unable to unzip artifact: ${input}`);
  }
  return { root: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function findReleaseJson(root) {
  const candidates = walk(root).filter((path) => basename(path) === "release.json");
  if (!candidates.length) fail(`release.json not found in ${root}`);
  if (candidates.length > 1) fail(`Multiple release.json files found: ${candidates.join(", ")}`);
  return candidates[0];
}

function validateRelease(releasePath) {
  const releaseDir = dirname(releasePath);
  const release = JSON.parse(readFileSync(releasePath, "utf8"));
  if (release.ok !== true) fail("release.ok must be true");
  if (release.product !== "OutilsIA Local Cockpit") fail("Unexpected product in release.json");
  if (release.channel !== "beta") fail("release.channel must be beta");
  if (!release.version || !/^\d+\.\d+\.\d+/.test(release.version)) fail("Invalid release.version");
  if (!release.primary_download?.name) fail("Missing primary_download.name");
  if (!Array.isArray(release.files) || !release.files.length) fail("release.files must contain at least one file");

  const names = new Set();
  const files = release.files.map((file) => {
    if (!file.name || file.name.includes("/") || file.name.includes("\\")) fail(`Invalid file name: ${file.name}`);
    if (names.has(file.name)) fail(`Duplicate file in release.json: ${file.name}`);
    names.add(file.name);
    if (!file.url || !file.url.startsWith("/static/downloads/local-cockpit/")) fail(`Invalid URL for ${file.name}`);
    if (!/^[a-f0-9]{64}$/i.test(file.sha256 || "")) fail(`Invalid sha256 for ${file.name}`);
    const path = join(releaseDir, file.name);
    if (!existsSync(path)) fail(`Missing artifact file referenced by release.json: ${file.name}`);
    const stat = statSync(path);
    if (!stat.isFile()) fail(`Referenced artifact is not a file: ${file.name}`);
    if (stat.size !== Number(file.size_bytes)) fail(`Size mismatch for ${file.name}: json=${file.size_bytes} actual=${stat.size}`);
    const actualHash = sha256(path);
    if (actualHash !== file.sha256) fail(`SHA256 mismatch for ${file.name}`);
    return { ...file, path, size_bytes: stat.size };
  });
  if (!names.has(release.primary_download.name)) fail("primary_download must be listed in files");
  const supportedPlatforms = new Set(["windows-x64", "linux", "macos"]);
  if (!files.some((file) => supportedPlatforms.has(file.platform))) {
    fail("No supported desktop artifact found in release.files");
  }
  return { release, releasePath, releaseDir, files };
}

function choosePrimaryDownload(files, previousPrimaryName = "") {
  return files.find((file) => file.name === previousPrimaryName)
    || files.find((file) => file.platform === "windows-x64" && file.name.endsWith(".exe"))
    || files.find((file) => file.platform === "windows-x64")
    || files.find((file) => file.platform === "linux" && file.name.endsWith(".AppImage"))
    || files[0];
}

function downloadsByPlatform(files) {
  return files.reduce((acc, file) => {
    const platform = file.platform || "unknown";
    if (!acc[platform]) acc[platform] = [];
    acc[platform].push(file);
    return acc;
  }, {});
}

function sortedFiles(files) {
  const platformRank = { "windows-x64": 1, linux: 2, macos: 3 };
  return [...files].sort((a, b) => {
    const byPlatform = (platformRank[a.platform] || 99) - (platformRank[b.platform] || 99);
    if (byPlatform) return byPlatform;
    return a.name.localeCompare(b.name);
  });
}

function readExistingRelease(outputDir) {
  const releasePath = join(outputDir, "release.json");
  if (!existsSync(releasePath)) return null;
  const release = JSON.parse(readFileSync(releasePath, "utf8"));
  if (!Array.isArray(release.files)) fail(`Existing release.json has no files array: ${releasePath}`);
  return release;
}

function assertMergeCompatible(validated, existingRelease) {
  if (!existingRelease) return;
  const incomingLinux = validated.files.filter((file) => file.platform === "linux");
  if (!incomingLinux.length) return;
  if (validated.release.version !== existingRelease.version || validated.release.build_id !== existingRelease.build_id) {
    fail(
      `linux_merge_version_guard incoming=${validated.release.version}/${validated.release.build_id} ` +
      `existing=${existingRelease.version}/${existingRelease.build_id}. ` +
      "Build Linux must match the current public Windows release before merge."
    );
  }
}

function validateOutputFile(outputDir, file) {
  const path = join(outputDir, file.name);
  if (!existsSync(path)) fail(`Missing output file referenced by release.json: ${file.name}`);
  const stat = statSync(path);
  if (stat.size !== Number(file.size_bytes)) fail(`Size mismatch in output for ${file.name}`);
  if (sha256(path) !== file.sha256) fail(`SHA256 mismatch in output for ${file.name}`);
}

function importRelease(validated, outputDir, { replace, merge }) {
  if (existsSync(outputDir)) {
    const existing = readdirSync(outputDir).filter((name) => name !== ".gitkeep");
    if (existing.length && !replace && !merge) {
      fail(`Output directory is not empty: ${outputDir}. Use --replace to overwrite or --merge to add platforms.`);
    }
    if (replace) {
      for (const name of existing) {
        rmSync(join(outputDir, name), { recursive: true, force: true });
      }
    }
  }
  const existingRelease = merge ? readExistingRelease(outputDir) : null;
  assertMergeCompatible(validated, existingRelease);
  const existingFiles = existingRelease?.files || [];
  for (const file of validated.files) {
    cpSync(file.path, join(outputDir, file.name));
  }
  const mergedByName = new Map();
  for (const file of existingFiles) {
    mergedByName.set(file.name, file);
  }
  for (const file of validated.files) {
    const { path: _path, ...releaseFile } = file;
    mergedByName.set(releaseFile.name, releaseFile);
  }
  const files = sortedFiles([...mergedByName.values()]);
  const release = {
    ...(existingRelease || validated.release),
    ...validated.release,
    files,
    primary_download: choosePrimaryDownload(files, existingRelease?.primary_download?.name),
    downloads_by_platform: downloadsByPlatform(files),
  };
  writeFileSync(join(outputDir, "release.json"), `${JSON.stringify(release, null, 2)}\n`);
  for (const file of files) validateOutputFile(outputDir, file);
  writeFileSync(join(outputDir, ".gitkeep"), "", { flag: "a" });
}

try {
  const opts = parseArgs(process.argv.slice(2));
  if (!existsSync(opts.input)) fail(`Input not found: ${opts.input}`);
  const extracted = extractIfNeeded(opts.input);
  try {
    const releasePath = findReleaseJson(extracted.root);
    const validated = validateRelease(releasePath);
    importRelease(validated, opts.outputDir, opts);
    const importedRelease = JSON.parse(readFileSync(join(opts.outputDir, "release.json"), "utf8"));
    console.log(opts.merge ? "artifact_merged" : "artifact_imported", importedRelease.version, `${importedRelease.files.length} file(s)`);
    for (const file of importedRelease.files) {
      console.log(`${file.platform} ${file.name} ${file.size_bytes} ${file.sha256}`);
    }
    console.log(`output_dir=${opts.outputDir}`);
  } finally {
    extracted.cleanup();
  }
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
