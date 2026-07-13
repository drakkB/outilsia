#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const rustPath = resolve(root, "src-tauri", "src", "forgebench_runner.rs");
const rust = readFileSync(rustPath, "utf8");
const extractScript = (name) => {
  const match = rust.match(new RegExp(`const ${name}: &str = r#"([\\s\\S]*?)"#;`));
  if (!match) throw new Error(`missing ${name} in ${rustPath}`);
  return match[1];
};
const workerScript = extractScript("WORKER_SCRIPT");
const evaluatorScript = extractScript("EVALUATOR_SCRIPT");
for (const [label, script] of [["worker", workerScript], ["evaluator", evaluatorScript]]) {
  for (const required of ["--unshare-all", "--clearenv", "--tmpfs /tmp", "--dir /etc"]) {
    if (!script.includes(required)) throw new Error(`${label} missing isolation flag ${required}`);
  }
  for (const forbidden of ["codex", "claude", "hidden-suite", "http://", "https://"]) {
    if (script.toLowerCase().includes(forbidden)) throw new Error(`${label} contains forbidden token ${forbidden}`);
  }
}
if (!evaluatorScript.includes('--ro-bind "$PWD/workspace" /submission')) {
  throw new Error("evaluator submission must remain read-only");
}

if (process.platform !== "linux") {
  console.log(`forgebench_reference_runtime_ok platform=${process.platform} execution=ci-linux-only contract=verified`);
  process.exit(0);
}

const bwrap = spawnSync("bwrap", ["--version"], { encoding: "utf8" });
if (bwrap.status !== 0) throw new Error("bubblewrap is required for the Linux ForgeBench runtime test");
const diagnostic = (result) => [result.stdout, result.stderr]
  .filter(Boolean)
  .join(" | ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 1200) || "no process output";

const temporary = mkdtempSync(resolve(tmpdir(), "outilsia-forgebench-reference-"));
const run = resolve(temporary, "run");
const workspace = resolve(run, "workspace");
const evaluation = resolve(run, "evaluation");
mkdirSync(workspace, { recursive: true });
mkdirSync(evaluation, { recursive: true });
for (const name of ["game.js", "index.html", "styles.css"]) {
  cpSync(resolve(root, "forgebench", "signal-maze-v1", "starter", name), resolve(workspace, name));
}
writeFileSync(resolve(workspace, ".outilsia-run-contract.json"), "{}", "utf8");
writeFileSync(resolve(workspace, ".outilsia-pilot-input"), "17011", "utf8");

try {
  const worker = spawnSync("sh", ["-c", workerScript], { cwd: run, encoding: "utf8", timeout: 15_000 });
  if (worker.status !== 0 || !worker.stdout.includes("worker_marker=forgebench-reference-worker-ok")) {
    throw new Error(`reference worker failed status=${worker.status} signal=${worker.signal || "none"} diagnostic=${diagnostic(worker)}`);
  }
  const evaluator = spawnSync("sh", ["-c", evaluatorScript], { cwd: run, encoding: "utf8", timeout: 15_000 });
  if (evaluator.status !== 0 || !evaluator.stdout.includes("evaluator_marker=forgebench-visible-evaluator-ok")) {
    throw new Error(`visible evaluator failed status=${evaluator.status} signal=${evaluator.signal || "none"} diagnostic=${diagnostic(evaluator)}`);
  }
  const expectedFiles = [
    ".outilsia-pilot-input",
    ".outilsia-run-contract.json",
    ".outilsia-worker-result",
    "game.js",
    "index.html",
    "styles.css",
  ];
  const actualFiles = readdirSync(workspace).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`unexpected reference submission files: ${actualFiles.join(",")}`);
  }
  const digestLines = expectedFiles.map((name) => {
    const digest = createHash("sha256").update(readFileSync(resolve(workspace, name))).digest("hex");
    return `${name}:${digest}`;
  }).sort();
  const digest = createHash("sha256").update(`${digestLines.join("\n")}\n`).digest("hex");
  const reported = evaluator.stdout.match(/^submission_digest=([a-f0-9]{64})$/m)?.[1];
  if (reported !== digest) throw new Error("evaluator and host submission digests differ");
  if (readFileSync(resolve(workspace, ".outilsia-worker-result"), "utf8").trim() !== "forgebench-reference-pilot-v1:17011") {
    throw new Error("reference worker output marker mismatch");
  }
  console.log(`forgebench_reference_runtime_ok platform=linux bwrap=${basename(bwrap.stdout.trim()) || "present"} worker=true evaluator=true readonly=true files=6 digest=${digest}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
