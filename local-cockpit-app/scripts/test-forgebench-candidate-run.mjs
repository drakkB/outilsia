#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const rustPath = resolve(root, "src-tauri", "src", "forgebench_candidate.rs");
const rust = readFileSync(rustPath, "utf8");
const scriptMatch = rust.match(/const EVALUATOR_SCRIPT: &str = r#"([\s\S]*?)"#;/);
if (!scriptMatch) throw new Error(`missing EVALUATOR_SCRIPT in ${rustPath}`);
const evaluatorScript = scriptMatch[1];

for (const required of [
  "--unshare-all",
  "--clearenv",
  '--ro-bind "$PWD/workspace" /submission',
  "test ! -e /etc/passwd",
  'id=\\"signalMazeBoard\\"',
  "__SIGNAL_MAZE_VISIBLE_API__",
  "signal-maze-visible-snapshot.v1",
  "checks_passed=7",
  "readonly_verified=true",
]) {
  if (!evaluatorScript.includes(required)) throw new Error(`candidate evaluator missing ${required}`);
}
for (const forbidden of ["--share-net", "http://", "https://", "hidden-suite"]) {
  if (evaluatorScript.toLowerCase().includes(forbidden)) throw new Error(`candidate evaluator contains forbidden token ${forbidden}`);
}

if (process.platform !== "linux") {
  console.log(`forgebench_candidate_runtime_ok platform=${process.platform} execution=ci-linux-only contract=verified`);
  process.exit(0);
}

const bwrap = spawnSync("bwrap", ["--version"], { encoding: "utf8" });
if (bwrap.status !== 0) throw new Error("bubblewrap is required for the Linux ForgeBench candidate runtime test");
const diagnostic = (result) => [result.stdout, result.stderr]
  .filter(Boolean)
  .join(" | ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 1200) || "no process output";

const temporary = mkdtempSync(resolve(tmpdir(), "outilsia-forgebench-candidate-"));
const run = resolve(temporary, "run");
const workspace = resolve(run, "workspace");
const evaluation = resolve(run, "evaluation");
mkdirSync(workspace, { recursive: true });
mkdirSync(evaluation, { recursive: true });

const index = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"></head><body><main id="gameRoot" data-forgebench="signal-maze-v1" data-status="candidate" data-state="playing"><h1>Signal Maze</h1><output id="gameStatus"></output><button id="newGameBtn">Nouvelle partie</button><button id="resetBtn">Réinitialiser</button><div id="signalMazeBoard" class="board" aria-label="Plateau"></div></main><script src="game.js"></script></body></html>${" ".repeat(160)}`;
const styles = `body{display:grid;min-height:100vh;margin:0}.board{display:grid;grid-template-columns:repeat(9,1fr);gap:2px}${".cell{min-width:1rem;min-height:1rem;border:1px solid #000}".repeat(12)}`;
const game = `globalThis.__SIGNAL_MAZE_CANDIDATE__={benchmark:"signal-maze-v1",implementation_started:true};\nconst snapshotSchema="signal-maze-visible-snapshot.v1";function newGame(){} function snapshot(){return {schema:snapshotSchema}} function applyPath(){} function reset(){} globalThis.__SIGNAL_MAZE_VISIBLE_API__={newGame,snapshot,applyPath,reset};\n${"const candidateCell = { row: 0, column: 0 };\n".repeat(40)}`;
writeFileSync(resolve(workspace, ".outilsia-run-contract.json"), "{}", "utf8");
writeFileSync(resolve(workspace, "index.html"), index, "utf8");
writeFileSync(resolve(workspace, "styles.css"), styles, "utf8");
writeFileSync(resolve(workspace, "game.js"), game, "utf8");

const expectedFiles = [".outilsia-run-contract.json", "game.js", "index.html", "styles.css"];
const digestForWorkspace = () => {
  const lines = expectedFiles.map((name) => {
    const digest = createHash("sha256").update(readFileSync(resolve(workspace, name))).digest("hex");
    return `${name}:${digest}`;
  });
  return createHash("sha256").update(`${lines.join("\n")}\n`).digest("hex");
};

try {
  const accepted = spawnSync("sh", ["-c", evaluatorScript], { cwd: run, encoding: "utf8", timeout: 15_000 });
  if (accepted.status !== 0 || !accepted.stdout.includes("evaluator_marker=forgebench-ollama-static-evaluator-ok")) {
    throw new Error(`candidate evaluator failed status=${accepted.status} signal=${accepted.signal || "none"} diagnostic=${diagnostic(accepted)}`);
  }
  if (JSON.stringify(readdirSync(workspace).sort()) !== JSON.stringify(expectedFiles)) {
    throw new Error("candidate evaluator changed the submission topology");
  }
  const expectedDigest = digestForWorkspace();
  const reportedDigest = accepted.stdout.match(/^submission_digest=([a-f0-9]{64})$/m)?.[1];
  if (reportedDigest !== expectedDigest) throw new Error("candidate evaluator and host submission digests differ");
  if (!accepted.stdout.includes("checks_passed=7") || !accepted.stdout.includes("readonly_verified=true")) {
    throw new Error("candidate evaluator omitted bounded proof markers");
  }

  writeFileSync(resolve(workspace, "game.js"), `${game}\nfetch("https://example.invalid");`, "utf8");
  const rejected = spawnSync("sh", ["-c", evaluatorScript], { cwd: run, encoding: "utf8", timeout: 15_000 });
  if (rejected.status === 0) throw new Error("candidate evaluator accepted an external network reference");

  console.log(`forgebench_candidate_runtime_ok platform=linux bwrap=${basename(bwrap.stdout.trim()) || "present"} evaluator=true readonly=true network-reference-rejected=true files=4 digest=${expectedDigest}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
