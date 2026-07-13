#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const workflowDir = join(repoRoot, ".github", "workflows");
const crossPath = join(workflowDir, "local-cockpit-cross-platform-beta.yml");
const linuxPath = join(workflowDir, "local-cockpit-linux-beta.yml");
const windowsPath = join(workflowDir, "local-cockpit-windows-beta.yml");
const packagePath = join(appRoot, "package.json");
const helperGeneratorPath = join(appRoot, "scripts", "make-linux-build-kit.sh");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function read(path) {
  if (!existsSync(path)) fail(`missing file: ${path}`);
  return readFileSync(path, "utf8");
}

function mustContain(label, text, needles) {
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length) fail(`${label} missing: ${missing.join(", ")}`);
}

function mustMatch(label, text, regexes) {
  const missing = regexes.filter((regex) => !regex.test(text)).map(String);
  if (missing.length) fail(`${label} missing pattern: ${missing.join(", ")}`);
}

const cross = read(crossPath);
const linux = read(linuxPath);
const windows = read(windowsPath);
const packageJson = JSON.parse(read(packagePath));
const helperGenerator = read(helperGeneratorPath);

if (!packageJson.scripts?.["verify:forgebench:runtime"]?.includes("test-forgebench-candidate-run.mjs")) {
  fail("package verify:forgebench:runtime must execute the candidate isolation test");
}
if (!packageJson.scripts?.["verify:forgebench:runtime"]?.includes("test-forgebench-reference-run.mjs")) {
  fail("package verify:forgebench:runtime must execute the reference isolation test");
}
if (!packageJson.scripts?.["verify:forgebench:runtime"]?.includes("test-forgebench-browser-run.mjs")) {
  fail("package verify:forgebench:runtime must execute the isolated browser gameplay test");
}
if (!packageJson.scripts?.["verify:ci-source"]?.includes("npm run verify:forgebench:runtime")) {
  fail("package verify:ci-source must include the ForgeBench runtime gate");
}

mustContain("cross-platform workflow", cross, [
  "workflow_dispatch:",
  "OUTILSIA_BUILD_ID:",
  "deploy_to_vps:",
  "build-windows:",
  "build-linux:",
  "merge-release:",
  "runs-on: windows-latest",
  "runs-on: ubuntu-24.04",
  "sudo apt-get install -y",
  "bubblewrap",
  "Enable Bubblewrap namespaces on CI host",
  "Verify Chromium runtime",
  "/opt/google/chrome/chrome",
  "/usr/lib/chromium/chromium",
  "kernel.apparmor_restrict_unprivileged_userns=0",
  "Restore CI namespace policy",
  "OUTILSIA_CI_ORIGINAL_APPARMOR_USERNS",
  "libwebkit2gtk-4.1-dev",
  "npm run build:beta:linux",
  "npm run verify:linux:artifacts",
  "npm run verify:ci-source",
  "name: local-cockpit-windows-web-release",
  "name: local-cockpit-linux-web-release",
  "name: local-cockpit-cross-platform-web-release",
  "npm run import:beta -- --input .artifacts/windows --replace",
  "npm run import:beta -- --input .artifacts/linux --merge",
  "npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux",
  "downloads_by_platform?.linux",
  "OUTILSIA_DEPLOY_SSH_KEY",
  "npm run publish:cross-platform -- --input ../server-work/static/downloads/local-cockpit --release-dir .artifacts/deploy-gated-release --remote outilsia-deploy",
  "npm run verify:release:prod",
]);
mustMatch("cross-platform workflow", cross, [
  /needs:\s*\n\s*-\s*build-windows\s*\n\s*-\s*build-linux/,
  /DEPLOY_REQUESTED:\s*\$\{\{\s*github\.event\.inputs\.deploy_to_vps\s*\}\}/,
  /if:\s*\$\{\{\s*steps\.deploy_config\.outputs\.enabled == 'true'\s*\}\}/,
  /Deploy merged release to outilsia\.fr[\s\S]*npm run publish:cross-platform[\s\S]*--deploy/,
]);

if (/Deploy merged release to outilsia\.fr[\s\S]*npm run deploy:beta[\s\S]*--deploy/.test(cross)) {
  fail("cross-platform workflow public deploy must go through publish:cross-platform terrain gate, not deploy:beta directly");
}

mustContain("linux workflow", linux, [
  "workflow_dispatch:",
  "build_id:",
  "runs-on: ubuntu-24.04",
  "sudo apt-get install -y",
  "bubblewrap",
  "Enable Bubblewrap namespaces on CI host",
  "Verify Chromium runtime",
  "/opt/google/chrome/chrome",
  "/usr/lib/chromium/chromium",
  "kernel.apparmor_restrict_unprivileged_userns=0",
  "Restore CI namespace policy",
  "OUTILSIA_CI_ORIGINAL_APPARMOR_USERNS",
  "pkg-config",
  "libwebkit2gtk-4.1-dev",
  "Resolve public build id",
  "GITHUB_ENV",
  "OUTILSIA_BUILD_ID=$BUILD_ID",
  "npm run build:beta:linux",
  "npm run verify:linux:artifacts",
  "npm run verify:ci-source",
  "name: outilsia-local-cockpit-linux-web-release",
  "name: outilsia-local-cockpit-linux-tauri-bundles",
  "if-no-files-found: error",
]);

mustContain("windows workflow", windows, [
  "runs-on: windows-latest",
  "npm run verify:ci-source",
]);

mustContain("linux import helper generator", helperGenerator, [
  "outilsia-local-cockpit-linux-web-release",
  "local-cockpit-linux-web-release",
  "local-cockpit-cross-platform-web-release",
  "npm run import:beta -- --input \"%ARTIFACT%\" --merge",
  "npm run verify:linux:artifacts",
  "npm run verify:release:contract -- --require-platform windows-x64 --require-platform linux",
]);

console.log("github_actions_linux_contract_verified workflows=linux,cross-platform artifacts=outilsia-local-cockpit-linux-web-release,local-cockpit-linux-web-release,local-cockpit-cross-platform-web-release import=merge");
