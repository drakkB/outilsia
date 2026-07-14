#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const rustPath = resolve(root, "src-tauri", "src", "forgebench_hidden.rs");
const rust = readFileSync(rustPath, "utf8");
const extract = (name, hashes = 1) => {
  const marker = "#".repeat(hashes);
  const match = rust.match(new RegExp(`const ${name}: &str = r${marker}\"([\\s\\S]*?)\"${marker};`));
  if (!match) throw new Error(`missing ${name} in ${rustPath}`);
  return match[1];
};
const evaluatorScript = extract("HIDDEN_BROWSER_SCRIPT");
const prelude = extract("PRELUDE_SCRIPT");
const controllerTemplate = extract("HIDDEN_CONTROLLER_TEMPLATE", 3);
const contract = readFileSync(resolve(root, "forgebench", "signal-maze-v1", "visible-contract.json"), "utf8");

for (const required of [
  "--unshare-all",
  '--ro-bind "$PWD/workspace" /submission',
  '--bind "$PWD/hidden-evaluation" /evaluation',
  "test ! -e /home",
  "test ! -e /mnt",
  "test ! -e /root",
  "android-portrait 390 844 1",
  "android-landscape 844 390 1",
  "private_checks_total=5",
  "private_checks_passed=5",
]) {
  if (!evaluatorScript.includes(required)) throw new Error(`hidden evaluator missing ${required}`);
}
for (const forbidden of ["--share-net", "forgebench-hidden-suite-v1.json", "screenshots_total="]) {
  if (evaluatorScript.includes(forbidden)) throw new Error(`hidden evaluator contains forbidden token ${forbidden}`);
}
if (!rust.includes("HiddenEvaluationGuard") || !rust.includes("fs::remove_dir_all(&self.0)")) {
  throw new Error("hidden evaluator lacks ephemeral-directory cleanup guard");
}
if (process.platform !== "linux") {
  console.log(`forgebench_hidden_runtime_ok platform=${process.platform} execution=ci-linux-only contract=verified`);
  process.exit(0);
}

const bwrap = spawnSync("bwrap", ["--version"], { encoding: "utf8" });
if (bwrap.status !== 0) throw new Error("bubblewrap is required for the ForgeBench hidden runtime test");
const browserCandidates = [
  "/usr/lib/chromium/chromium",
  "/usr/lib/chromium-browser/chromium-browser",
  "/opt/google/chrome/chrome",
  "/opt/google/chrome/google-chrome",
];
const hasSystemBrowser = browserCandidates.some((path) => spawnSync("test", ["-x", path]).status === 0);
const playwrightBrowser = spawnSync("sh", ["-lc", "for f in \"$HOME\"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome \"$HOME\"/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux*/headless_shell; do [ -x \"$f\" ] && { printf '%s' \"$f\"; exit 0; }; done; exit 1"], { encoding: "utf8" });
if (!hasSystemBrowser && playwrightBrowser.status !== 0) throw new Error("Chromium is required for the ForgeBench hidden runtime test");

const temporary = mkdtempSync(resolve(tmpdir(), "outilsia-forgebench-hidden-"));
const run = resolve(temporary, "run");
const workspace = resolve(run, "workspace");
const evaluation = resolve(run, "hidden-evaluation");
mkdirSync(workspace, { recursive: true });
mkdirSync(evaluation, { recursive: true });
const source = resolve(root, "forgebench", "signal-maze-v1", "reference");
for (const name of ["index.html", "styles.css", "game.js"]) cpSync(resolve(source, name), resolve(workspace, name));
writeFileSync(resolve(workspace, ".outilsia-run-contract.json"), "{}", "utf8");

const nonce = "a".repeat(32);
const attestation = "b".repeat(64);
const hiddenSeeds = [314159265, 271828182, 161803398, 141421356, 173205080];
writeFileSync(resolve(evaluation, "controller-nonce"), nonce, "utf8");
writeFileSync(resolve(evaluation, "attestation-token"), attestation, "utf8");
writeFileSync(resolve(evaluation, "hidden-seeds-total"), String(hiddenSeeds.length), "utf8");
writeFileSync(resolve(evaluation, "forgebench-hidden-prelude.js"), prelude, "utf8");
writeFileSync(
  resolve(evaluation, "forgebench-hidden-controller.js"),
  controllerTemplate
    .replace("__FORGEBENCH_NONCE__", nonce)
    .replace("__FORGEBENCH_ATTESTATION__", attestation)
    .replace("__FORGEBENCH_VISIBLE_CONTRACT__", contract)
    .replace("__FORGEBENCH_HIDDEN_SEEDS__", JSON.stringify(hiddenSeeds)),
  "utf8",
);

const expectedFiles = [".outilsia-run-contract.json", "game.js", "index.html", "styles.css"];
const digest = createHash("sha256").update(`${expectedFiles.map((name) => `${name}:${createHash("sha256").update(readFileSync(resolve(workspace, name))).digest("hex")}`).join("\n")}\n`).digest("hex");
const runScript = (timeout) => spawnSync("sh", ["-c", evaluatorScript], { cwd: run, encoding: "utf8", timeout, maxBuffer: 4 * 1024 * 1024 });
const diagnostic = (result) => [result.stdout, result.stderr].filter(Boolean).join(" | ").replace(/\s+/g, " ").slice(0, 1600);

try {
  const accepted = runScript(65_000);
  if (accepted.status !== 0 || !accepted.stdout.includes("hidden_marker=forgebench-hidden-browser-evaluator-ok")) {
    throw new Error(`hidden evaluator failed status=${accepted.status} signal=${accepted.signal || "none"} diagnostic=${diagnostic(accepted)}`);
  }
  for (const marker of [
    `submission_digest=${digest}`,
    "viewports_total=3",
    `hidden_seeds_total=${hiddenSeeds.length}`,
    "private_checks_total=5",
    "private_checks_passed=5",
    "readonly_verified=true",
  ]) {
    if (!accepted.stdout.includes(marker)) throw new Error(`hidden evaluator omitted ${marker}`);
  }
  const output = `${accepted.stdout}\n${accepted.stderr}`;
  for (const secret of [nonce, attestation, ...hiddenSeeds.map(String)]) {
    if (output.includes(secret)) throw new Error("hidden evaluator leaked private runtime material");
  }
  if (JSON.stringify(readdirSync(workspace).sort()) !== JSON.stringify(expectedFiles)) {
    throw new Error("hidden evaluator changed the read-only submission");
  }
  for (const forbidden of ["desktop.png", "android-portrait.png", "android-landscape.png"]) {
    if (readdirSync(evaluation, { recursive: true }).some((entry) => String(entry).endsWith(forbidden))) {
      throw new Error(`hidden evaluator persisted forbidden capture ${forbidden}`);
    }
  }

  writeFileSync(resolve(workspace, "game.js"), "globalThis.__SIGNAL_MAZE_CANDIDATE__={benchmark:'signal-maze-v1',implementation_started:true};globalThis.__SIGNAL_MAZE_VISIBLE_API__={};", "utf8");
  rmSync(resolve(evaluation, "browser"), { recursive: true, force: true });
  for (const name of ["desktop.dom", "android-portrait.dom", "android-landscape.dom", "submission.sha256"]) rmSync(resolve(evaluation, name), { force: true });
  const rejected = runScript(35_000);
  if (rejected.status === 0) throw new Error("hidden evaluator accepted a forged empty gameplay API");

  console.log("forgebench_hidden_runtime_ok platform=linux isolation=bwrap browser=chromium worker-before-vault=true vault-mounted=false runtime-seeds=5 private-families=5 observations-returned=false screenshots-returned=false forged-api=rejected science=false winner=false");
} finally {
  if (process.env.KEEP_FORGEBENCH_TEST_TMP === "1") {
    console.error(`forgebench_hidden_runtime_tmp=${temporary}`);
  } else {
    rmSync(temporary, { recursive: true, force: true });
  }
}
