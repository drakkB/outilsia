#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");

function fail(message) {
  throw new Error(message);
}

function text(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

const packageJson = JSON.parse(text(join(appRoot, "package.json")));
const tauri = JSON.parse(text(join(appRoot, "src-tauri", "tauri.conf.json")));
const cargo = text(join(appRoot, "src-tauri", "Cargo.toml"));
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1] || "";
const sourceVersions = [packageJson.version, tauri.version, cargoVersion];
if (new Set(sourceVersions).size !== 1) {
  fail(`Source version mismatch: package=${sourceVersions[0]} tauri=${sourceVersions[1]} cargo=${sourceVersions[2]}`);
}
const sourceVersion = sourceVersions[0];

const release = JSON.parse(text(join(
  repoRoot,
  "server-work",
  "static",
  "downloads",
  "local-cockpit",
  "release.json",
)));
const publicVersion = String(release.version || "");
const publicBuild = String(release.build_id || "");
if (!/^\d+\.\d+\.\d+$/.test(publicVersion) || !publicBuild) fail("Public release identity is invalid");
for (const file of release.files || []) {
  if (!String(file.name || "").includes(`-${publicVersion}-beta-${publicBuild}-`)) {
    fail(`Public artifact identity is stale or mixed: ${file.name}`);
  }
}

const download = text(join(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html"));
const hub = text(join(repoRoot, "server-work", "static", "pages", "scanner-ia-local.html"));
const llms = text(join(repoRoot, "server-work", "static", "llms.txt"));
for (const [label, content] of [["download", download], ["hub", hub]]) {
  if (!content.includes(publicVersion)) {
    fail(`${label} does not expose the public version ${publicVersion}`);
  }
}

if (sourceVersion !== publicVersion) {
  for (const [label, content] of [["download", download], ["hub", hub]]) {
    if (!content.includes("candidat source") || !content.includes("build public actuel")) {
      fail(`${label} must distinguish source ${sourceVersion} from public ${publicVersion}`);
    }
  }
  if (!llms.includes("source candidate, not in the current public build")) {
    fail("llms.txt must distinguish source-candidate features from the public build");
  }
  for (const forbidden of [
    `softwareVersion":"${sourceVersion}`,
    `Bêta desktop ${sourceVersion}`,
    `Bêta ${sourceVersion} publiée`,
    `${sourceVersion}-beta-${publicBuild}`,
  ]) {
    if (download.includes(forbidden) || hub.includes(forbidden)) {
      fail(`Site overclaims source ${sourceVersion} as public: ${forbidden}`);
    }
  }
}

console.log(
  `product_truth_ok source=${sourceVersion} public=${publicVersion} ` +
  `build=${publicBuild} relation=${sourceVersion === publicVersion ? "aligned" : "candidate-ahead"}`
);
