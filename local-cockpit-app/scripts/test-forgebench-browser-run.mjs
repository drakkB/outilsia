#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const rustPath = resolve(root, "src-tauri", "src", "forgebench_browser.rs");
const rust = readFileSync(rustPath, "utf8");
const extract = (name, hashes = 1) => {
  const marker = "#".repeat(hashes);
  const match = rust.match(new RegExp(`const ${name}: &str = r${marker}\"([\\s\\S]*?)\"${marker};`));
  if (!match) throw new Error(`missing ${name} in ${rustPath}`);
  return match[1];
};
const preflightScript = extract("BROWSER_PREFLIGHT_SCRIPT");
const evaluatorScript = extract("BROWSER_EVALUATOR_SCRIPT");
const prelude = extract("PRELUDE_SCRIPT");
const controllerTemplate = extract("CONTROLLER_TEMPLATE", 3);
const contract = readFileSync(resolve(root, "forgebench", "signal-maze-v1", "visible-contract.json"), "utf8");

for (const required of [
  "--unshare-all",
  '--ro-bind "$PWD/workspace" /submission',
  "android-portrait 390 844",
  "android-landscape 844 390",
  "checks_per_viewport=13",
  "screenshots_total=3",
]) {
  if (!evaluatorScript.includes(required)) throw new Error(`browser evaluator missing ${required}`);
}
for (const forbidden of ["--share-net", "hidden-suite"]) {
  if (evaluatorScript.includes(forbidden)) throw new Error(`browser evaluator contains forbidden token ${forbidden}`);
}
if (process.platform !== "linux") {
  console.log(`forgebench_browser_runtime_ok platform=${process.platform} execution=ci-linux-only contract=verified`);
  process.exit(0);
}

const bwrap = spawnSync("bwrap", ["--version"], { encoding: "utf8" });
if (bwrap.status !== 0) throw new Error("bubblewrap is required for the ForgeBench browser runtime test");
const browserCandidates = [
  "/usr/lib/chromium/chromium",
  "/usr/lib/chromium-browser/chromium-browser",
  "/opt/google/chrome/chrome",
  "/opt/google/chrome/google-chrome",
];
const hasSystemBrowser = browserCandidates.some((path) => spawnSync("test", ["-x", path]).status === 0);
const playwrightBrowser = spawnSync("sh", ["-lc", "for f in \"$HOME\"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome \"$HOME\"/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux*/headless_shell; do [ -x \"$f\" ] && { printf '%s' \"$f\"; exit 0; }; done; exit 1"], { encoding: "utf8" });
if (!hasSystemBrowser && playwrightBrowser.status !== 0) throw new Error("Chromium is required for the ForgeBench browser runtime test");

const temporary = mkdtempSync(resolve(tmpdir(), "outilsia-forgebench-browser-"));
const run = resolve(temporary, "run");
const workspace = resolve(run, "workspace");
const evaluation = resolve(run, "evaluation");
mkdirSync(workspace, { recursive: true });
mkdirSync(evaluation, { recursive: true });
const source = resolve(root, "forgebench", "signal-maze-v1", "reference");
for (const name of ["index.html", "styles.css", "game.js"]) cpSync(resolve(source, name), resolve(workspace, name));
writeFileSync(resolve(workspace, ".outilsia-run-contract.json"), "{}", "utf8");
writeFileSync(resolve(evaluation, "browser-preflight.html"), '<!doctype html><body data-forgebench-browser-preflight="ready">ready</body>', "utf8");
const nonce = "f".repeat(32);
writeFileSync(resolve(evaluation, "controller-nonce"), nonce, "utf8");
writeFileSync(resolve(evaluation, "forgebench-prelude.js"), prelude, "utf8");
writeFileSync(
  resolve(evaluation, "forgebench-controller.js"),
  controllerTemplate.replace("__FORGEBENCH_NONCE__", nonce).replace("__FORGEBENCH_VISIBLE_CONTRACT__", contract),
  "utf8",
);

const expectedFiles = [".outilsia-run-contract.json", "game.js", "index.html", "styles.css"];
const digest = createHash("sha256").update(`${expectedFiles.map((name) => `${name}:${createHash("sha256").update(readFileSync(resolve(workspace, name))).digest("hex")}`).join("\n")}\n`).digest("hex");
const runScript = (script, timeout) => spawnSync("sh", ["-c", script], { cwd: run, encoding: "utf8", timeout, maxBuffer: 4 * 1024 * 1024 });
const diagnostic = (result) => [result.stdout, result.stderr].filter(Boolean).join(" | ").replace(/\s+/g, " ").slice(0, 1600);
const pngDimensions = (path) => {
  const bytes = readFileSync(path);
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`${path} is not PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20), bytes.length];
};

try {
  const preflight = runScript(preflightScript, 25_000);
  if (preflight.status !== 0 || !preflight.stdout.includes("browser_marker=forgebench-visible-browser-preflight-ok")) {
    throw new Error(`browser preflight failed status=${preflight.status} diagnostic=${diagnostic(preflight)}`);
  }
  const accepted = runScript(evaluatorScript, 65_000);
  if (accepted.status !== 0 || !accepted.stdout.includes("browser_marker=forgebench-visible-browser-evaluator-ok")) {
    throw new Error(`browser evaluator failed status=${accepted.status} signal=${accepted.signal || "none"} diagnostic=${diagnostic(accepted)}`);
  }
  if (!accepted.stdout.includes(`submission_digest=${digest}`) || !accepted.stdout.includes("screenshots_total=3")) {
    throw new Error("browser evaluator omitted signed bounded markers");
  }
  const captures = [
    ["desktop", 1440, 900],
    ["android-portrait", 390, 844],
    ["android-landscape", 844, 390],
  ].map(([label, width, height]) => {
    const [actualWidth, actualHeight, bytes] = pngDimensions(resolve(evaluation, `${label}.png`));
    if (actualWidth !== width || actualHeight !== height || bytes < 128 || bytes > 5 * 1024 * 1024) throw new Error(`invalid ${label} screenshot`);
    return `${label}:${bytes}`;
  });
  if (JSON.stringify(readdirSync(workspace).sort()) !== JSON.stringify(expectedFiles)) throw new Error("browser evaluator changed the read-only submission");

  writeFileSync(resolve(workspace, "game.js"), "globalThis.__SIGNAL_MAZE_CANDIDATE__={benchmark:'signal-maze-v1',implementation_started:true};globalThis.__SIGNAL_MAZE_VISIBLE_API__={};", "utf8");
  rmSync(resolve(evaluation, "browser"), { recursive: true, force: true });
  for (const name of ["desktop.dom", "desktop.png", "android-portrait.dom", "android-portrait.png", "android-landscape.dom", "android-landscape.png"]) rmSync(resolve(evaluation, name), { force: true });
  const rejected = runScript(evaluatorScript, 30_000);
  if (rejected.status === 0) throw new Error("browser evaluator accepted a candidate without the visible API");

  console.log(`forgebench_browser_runtime_ok platform=linux isolation=bwrap browser=chromium seeds=3 viewports=3 inputs=keyboard,mouse,touch checks=39 captures=${captures.join(",")} forged-api=rejected`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
