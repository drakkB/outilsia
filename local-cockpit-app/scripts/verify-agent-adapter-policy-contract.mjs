#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const repoRoot = resolve(root, "..");
const read = (...parts) => readFileSync(resolve(...parts), "utf8");

const policyRust = read(root, "src-tauri", "src", "agent_adapter_policy.rs");
const arenaRust = read(root, "src-tauri", "src", "workstack_arena.rs");
const libRust = read(root, "src-tauri", "src", "lib.rs");
const policyJs = read(root, "src", "agent-adapter-policy.js");
const html = read(root, "src", "index.html");
const css = read(root, "src", "styles.css");
const notice = read(root, "NOTICE-UTILISATION-WORKSTACK.md");
const roadmap = read(root, "ROADMAP.md");
const appReadme = read(root, "README.md");
const repoReadme = read(repoRoot, "README.md");
const hub = read(repoRoot, "server-work", "static", "pages", "scanner-ia-local.html");
const download = read(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html");
const llms = read(repoRoot, "server-work", "static", "llms.txt");

function fail(message) {
  throw new Error(message);
}

function rustString(source, name) {
  const match = source.match(new RegExp(`const ${name}: &str = "([^"]+)";`));
  if (!match) fail(`missing Rust string constant ${name}`);
  return match[1];
}

function rustU64Array(source, name) {
  const match = source.match(new RegExp(`const ${name}: \\[u64; 3\\] = \\[([^\\]]+)\\];`));
  if (!match) fail(`missing Rust duration constant ${name}`);
  return match[1].split(",").map((value) => Number(value.trim()));
}

const policyContract = {
  scope: rustString(policyRust, "CODEX_SCOPE"),
  benchmark: rustString(policyRust, "CODEX_BENCHMARK_ID"),
  stack: rustString(policyRust, "CODEX_STACK_KEY"),
  durations: rustU64Array(policyRust, "CODEX_DURATION_OPTIONS_SECONDS"),
};
const arenaContract = {
  scope: rustString(arenaRust, "CONSENT_SCOPE"),
  benchmark: rustString(arenaRust, "BENCHMARK_ID"),
  stack: rustString(arenaRust, "STACK_KEY"),
  durations: rustU64Array(arenaRust, "ALLOWED_DURATION_SECONDS"),
};

if (JSON.stringify(policyContract) !== JSON.stringify(arenaContract)) {
  fail(`Agent policy and Workstack Arena drifted: ${JSON.stringify({ policyContract, arenaContract })}`);
}
if (
  policyContract.scope !== "codex_cli_signal_maze_pilot_v1"
  || policyContract.benchmark !== "signal-maze-v1"
  || policyContract.stack !== "codex-solo"
  || JSON.stringify(policyContract.durations) !== JSON.stringify([180, 300, 600])
) {
  fail("Codex pilot scope or duration budget widened");
}
for (const [label, source] of [
  ["agent policy", policyRust],
  ["Workstack Arena", arenaRust],
]) {
  if (!source.includes("512 * 1024")) fail(`${label} output budget is no longer 512 KiB`);
}

for (const marker of [
  'const CATALOG_SCHEMA: &str = "outilsia.agent_adapter_policy_catalog.v1"',
  'const CODEX_ADAPTER_ID: &str = "codex-cli"',
  'const CLAUDE_ADAPTER_ID: &str = "claude-code"',
  'const HERMES_ADAPTER_ID: &str = "hermes-agent"',
  'const KIMI_ADAPTER_ID: &str = "kimi-code"',
  'current_state: "detect_only".to_string()',
  '"enabled": false',
  '"allowed_scopes": []',
  '"execution_started": false',
  '"machine_probe_started": false',
  '"credentials_read": false',
  '"network_called": false',
  '"repository_scanned": false',
  '"policy_is_execution_authorization": false',
  '"human_approval_required_before_every_run": true',
  "validate_agent_adapter_policy_catalog",
  "canonical_sha256",
]) {
  if (!policyRust.includes(marker)) fail(`missing signed policy guard: ${marker}`);
}

const invokedCommands = [...policyJs.matchAll(/invoke\("([^"]+)"/g)].map((match) => match[1]);
if (
  invokedCommands.length !== 1
  || invokedCommands[0] !== "get_agent_adapter_policy_catalog"
) {
  fail(`policy UI may only read its own catalog, found: ${invokedCommands.join(", ") || "none"}`);
}
for (const forbidden of [
  "run_workstack_arena",
  "run_forgebench",
  "install_",
  "delete_",
  "benchmark_",
  "observe_planka_board",
  "route_workstack_capabilities",
]) {
  if (policyJs.includes(`invoke("${forbidden}`)) {
    fail(`policy UI invokes forbidden action ${forbidden}`);
  }
}
for (const marker of [
  "Détecté ne veut pas dire autorisé",
  "Aucune mission autorisée",
  "consentement par run",
  "aucune exécution",
  'details.addEventListener("toggle"',
  "human_approval_required_before_every_run",
]) {
  if (!policyJs.includes(marker)) fail(`missing policy UI truth marker: ${marker}`);
}

for (const marker of [
  'id="agentAdapterPolicyDetails"',
  'id="agentAdapterPolicyBox"',
  'id="loadAgentAdapterPolicyBtn"',
  'src="./agent-adapter-policy.js"',
]) {
  if (!html.includes(marker)) fail(`missing policy UI marker: ${marker}`);
}
if (!css.includes(".agent-adapter-policy-details") || !css.includes(".agent-adapter-policy-row")) {
  fail("agent policy responsive styles missing");
}
if (
  !libRust.includes("mod agent_adapter_policy;")
  || !libRust.includes("get_agent_adapter_policy_catalog,")
) {
  fail("agent policy Tauri command is not registered");
}

for (const [label, source, markers] of [
  ["notice", notice, ["Agent Adapter Policy", "Codex reste borné à Signal Maze public", "trois adaptateurs en détection seule, Claude Code, Hermes Agent et Kimi Code"]],
  ["roadmap", roadmap, ["Agent Adapter Policy v1 implémenté", "Claude Code, Hermes et Kimi restent `detect_only`", "Codex borné au pilote public"]],
  ["app README", appReadme, ["registre Agent Adapter Policy v1", "Détection, autorisation et consentement"]],
  ["repo README", repoReadme, ["Agent Adapter Policy v1", "detection-only"]],
  ["hub", hub, ["Agent Adapter Policy v1 · candidat source", "Claude Code, Hermes et Kimi restent en détection seule"]],
  ["download", download, ["Agent Adapter Policy v1 · source non publique", "Détection, autorisation et consentement"]],
  ["llms.txt", llms, ["Agent Adapter Policy v1 (source candidate, not in the current public build)", "starts no agent or machine probe"]],
]) {
  for (const marker of markers) {
    if (!source.includes(marker)) fail(`missing ${label} policy marker: ${marker}`);
  }
}

console.log(
  "agent_adapter_policy_contract_ok",
  "adapters=4",
  "bounded=codex-cli",
  "detect_only=claude-code,hermes-agent,kimi-code",
  "attempts=1",
  "durations=180,300,600",
  "output=524288",
  "execution_started=false",
);
