import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const matrix = JSON.parse(readFileSync(resolve(appRoot, "scripts/fixtures/machine-replay-matrix.json"), "utf8"));
const app = readFileSync(resolve(appRoot, "src/app.js"), "utf8");
const pkg = JSON.parse(readFileSync(resolve(appRoot, "package.json"), "utf8"));
const workflow = readFileSync(resolve(repoRoot, ".github/workflows/local-cockpit-machine-replay.yml"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(matrix.schema === "outilsia.machine_replay_matrix.v1", "unexpected machine replay matrix schema");
assert(/^2026-\d{2}-\d{2}\.\d+$/.test(matrix.version), "machine replay matrix version must be dated");
assert(Array.isArray(matrix.catalog) && matrix.catalog.length >= 5, "machine replay catalog must contain at least five model tiers");
assert(Array.isArray(matrix.scenarios) && matrix.scenarios.length === 10, "machine replay matrix must contain ten scenarios");

const expectedKeys = new Set([
  "old_laptop",
  "core_i7_gtx_1080_ti",
  "rtx_3060_12gb",
  "rtx_4080_16gb",
  "rtx_3090_24gb",
  "cpu_only",
  "strix_halo_128gb",
  "unknown_gpu",
  "intel_arc_b580",
  "amd_rx_7900_xtx"
]);
const keys = new Set();
const catalogRefs = new Set(matrix.catalog.map((model) => model.ollama).filter(Boolean));
for (const scenario of matrix.scenarios) {
  assert(expectedKeys.has(scenario.key), `unexpected machine replay scenario: ${scenario.key}`);
  assert(!keys.has(scenario.key), `duplicate machine replay scenario: ${scenario.key}`);
  keys.add(scenario.key);
  assert(scenario.scan?.machine_key?.startsWith("replay-"), `${scenario.key}: synthetic machine key required`);
  assert(Number(scenario.scan?.ram_gb || 0) > 0, `${scenario.key}: RAM fixture required`);
  assert(scenario.scan?.raw_scan?.gpu_probe, `${scenario.key}: GPU provenance required`);
  assert(scenario.scan?.raw_scan?.memory_probe, `${scenario.key}: RAM provenance required`);
  assert(Number.isFinite(Number(scenario.compatibility?.score)), `${scenario.key}: compatibility score required`);
  assert(Array.isArray(scenario.expect?.recommended_one_of) && scenario.expect.recommended_one_of.length, `${scenario.key}: recommendation expectation required`);
  for (const ref of scenario.expect.recommended_one_of) {
    assert(catalogRefs.has(ref), `${scenario.key}: expected model absent from replay catalog: ${ref}`);
  }
}
assert(keys.size === expectedKeys.size, "machine replay matrix misses a required scenario");

for (const marker of [
  "outilsia.machine_replay_snapshot.v1",
  "requiresStarterModelProof",
  "machineReplaySnapshot",
  "applyMachineReplayScenario",
  "shared_memory_not_claimed_as_dedicated_vram",
  "physical_proof: false"
]) {
  assert(app.includes(marker), `app machine replay marker missing: ${marker}`);
}
assert(pkg.scripts?.["verify:machine-replay"]?.includes("verify-machine-replay-lab.py"), "machine replay verification script missing from package.json");
assert(pkg.scripts?.["verify:machine-replay:contract"]?.includes("verify-machine-replay-contract.mjs"), "machine replay contract script missing from package.json");
assert(pkg.scripts?.["verify:machine-replay:seo"]?.includes("verify-machine-replay-seo.mjs"), "machine replay SEO guard missing from package.json");
assert(pkg.scripts?.["verify:machine-replay"]?.includes("verify:machine-replay:seo"), "full machine replay gate must include SEO truth checks");
assert(workflow.includes("npm run verify:machine-replay"), "machine replay GitHub workflow must run the full gate");
assert(workflow.includes("playwright==1.58.0"), "machine replay workflow must pin Playwright");

console.log(`machine_replay_contract_ok matrix=${matrix.version} scenarios=${matrix.scenarios.length} catalog=${matrix.catalog.length}`);
