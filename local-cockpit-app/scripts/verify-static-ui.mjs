#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "src/index.html"), "utf8");
const js = readFileSync(resolve(root, "src/app.js"), "utf8");
const rust = ["lib.rs", "local_capability_bridge.rs", "board_observer.rs", "workstack_composer.rs", "capability_router.rs", "forgebench.rs", "forgebench_vault.rs", "forgebench_sandbox.rs", "evidence_ledger.rs"]
  .map((name) => readFileSync(resolve(root, "src-tauri/src", name), "utf8"))
  .join("\n");
const runtimeDriverMatrix = readFileSync(resolve(root, "src/runtime-driver-matrix.js"), "utf8");
const privateWorkloadCatalog = readFileSync(resolve(root, "src/private-workload-packs.js"), "utf8");
const forgeBenchContract = readFileSync(resolve(root, "forgebench/signal-maze-v1.json"), "utf8");
const workstackNotice = readFileSync(resolve(root, "NOTICE-UTILISATION-WORKSTACK.md"), "utf8");

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const jsIds = new Set([...js.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]));
const missingIds = [...jsIds].filter((id) => !htmlIds.has(id));

const invoked = new Set([...js.matchAll(/invoke\("([^"]+)"/g)].map((match) => match[1]));
const rustCommands = new Set(
  [...rust.matchAll(/(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(/g)].map((match) => match[1])
);
const missingCommands = [...invoked].filter((command) => !rustCommands.has(command));

const scanIsAsync = /async\s+fn\s+scan_machine\s*\(/.test(rust)
  && rust.includes("spawn_blocking(scan_machine_inner)");
if (!scanIsAsync) {
  console.error("scan_machine must remain async and delegate blocking hardware detection to spawn_blocking(scan_machine_inner)");
  process.exit(1);
}

if (missingIds.length || missingCommands.length) {
  if (missingIds.length) {
    console.error("Missing HTML ids:", missingIds.join(", "));
  }
  if (missingCommands.length) {
    console.error("Missing Rust commands:", missingCommands.join(", "));
  }
  process.exit(1);
}

const requiredFeatureText = [
  ["html runtime driver matrix", html, "runtime-driver-matrix.js"],
  ["generated runtime driver matrix schema", runtimeDriverMatrix, "outilsia.runtime_driver_matrix.v1"],
  ["js runtime driver intelligence schema", js, "outilsia.runtime_driver_intelligence.v1"],
  ["js runtime driver no silent install", js, "automatic_driver_install_supported: false"],
  ["rust Intel official URL allowlist", rust, "https://www.intel.com/"],
  ["rust Vulkan probe", rust, "parse_vulkan_version"],
  ["rust WSL GPU bridge", rust, "wsl_dev_dxg"],
  ["html decision pack panel", html, "decisionPackBox"],
  ["html copy decision pack button", html, "copyDecisionPackBtn"],
  ["html copy shopping list button", html, "copyShoppingListBtn"],
  ["html save decision pack button", html, "saveDecisionPackBtn"],
  ["js decision markdown", js, "decisionPackMarkdown"],
  ["js shopping list markdown", js, "shoppingListMarkdown"],
  ["js copy decision pack", js, "copyDecisionPack"],
  ["js copy shopping list", js, "copyShoppingList"],
  ["js save decision pack", js, "saveDecisionPackLocal"],
  ["css decision pack", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".decision-pack"],
  ["css brand mark", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".brand-mark"],
  ["css desktop grid", readFileSync(resolve(root, "src/styles.css"), "utf8"), "repeat(12"],
  ["html catalog panel", html, "catalogBox"],
  ["html copy catalog report button", html, "copyCatalogReportBtn"],
  ["js catalog snapshot", js, "catalogSnapshot"],
  ["js catalog markdown", js, "catalogReportMarkdown"],
  ["css catalog box", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".catalog-box"],
  ["html upgrade impact panel", html, "upgradeImpactBox"],
  ["html copy upgrade impact button", html, "copyUpgradeImpactBtn"],
  ["js upgrade impact", js, "buildUpgradeImpact"],
  ["js upgrade impact markdown", js, "upgradeImpactMarkdown"],
  ["css upgrade impact", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".upgrade-impact-box"],
  ["html copy history button", html, "copyHistoryBtn"],
  ["js local history markdown", js, "localHistoryMarkdown"],
  ["js copy local history", js, "copyLocalHistory"],
  ["js refresh snapshot compatibility", js, "refreshSnapshotCompatibility"],
  ["js refresh snapshot button", js, "data-refresh-snapshot"],
  ["js snapshot refresh delta", js, "snapshotRefreshDeltaMarkdown"],
  ["js render snapshot refresh delta", js, "renderSnapshotRefreshDelta"],
  ["html readiness summary button", html, "copyReadinessSummaryBtn"],
  ["html readiness account button", html, "saveReadinessAccountBtn"],
  ["html readiness share button", html, "shareReadinessBtn"],
  ["js readiness summary", js, "readinessSummaryText"],
  ["js copy readiness summary", js, "copyReadinessSummary"],
  ["js readiness account save", js, "saveReadinessToAccount"],
  ["js readiness share", js, "shareReadinessReport"],
  ["js recommended model state", js, "recommendedModelState"],
  ["js second recommended model step", js, "Deuxième modèle recommandé"],
  ["js release proof", js, "releaseProof"],
  ["js readiness build section", js, "## Build et release"],
  ["js beta report build id", js, "Build ID public"],
  ["js beta report native checklist", js, "Deuxieme modele recommande visible OK"],
  ["js benchmark quality verdict", js, "benchmarkQualityVerdict"],
  ["js benchmark quality short label", js, "Qualité courte"],
  ["js post install test now", js, "Tester maintenant"],
  ["js benchmark keep action", js, "data-keep-installed-model"],
  ["js benchmark delete action", js, "data-delete-model"],
  ["js benchmark compare action", js, "data-post-install-arena"],
  ["js objective arena protocol", js, "outilsia.arena.objective.v1"],
  ["js objective arena evaluator", js, "evaluateArenaObjective"],
  ["js objective arena evidence", js, "preuves objectives validées"],
  ["rust objective arena protocol", rust, "protocol: Option<String>"],
  ["rust objective arena output budget", rust, "Some(\"outilsia.recommendation.v2\") => Some(224)"],
  ["js recommendation protocol", js, "outilsia.recommendation.v2"],
  ["js recommendation evaluator", js, "evaluateRecommendationProof"],
  ["js recommendation decision", js, "Garder ${winner.model}"],
  ["js recommendation report", js, "recommendation_engine"],
  ["css recommendation engine", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".recommendation-engine-card"],
  ["html capability passport panel", html, "capabilityPassportBox"],
  ["html capability passport generate", html, "generateCapabilityPassportBtn"],
  ["js capability passport schema", js, "outilsia.ai_capability_passport.v1"],
  ["js capability passport digest", js, "verifyCapabilityPassportIntegrity"],
  ["js hardware doctor v2", js, "outilsia.hardware_doctor.v2"],
  ["rust ollama runtime evidence", rust, "runtime_gpu_offload_percent"],
  ["css capability passport", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".capability-passport-box"],
  ["html private workload catalog", html, "private-workload-packs.js"],
  ["html private workload panel", html, "privateWorkloadBox"],
  ["html private workload run button", html, "runPrivateWorkloadBtn"],
  ["generated private workload schema", privateWorkloadCatalog, "outilsia.private_workload_pack_catalog.v1"],
  ["js private workload protocol", js, "outilsia.private_workload_pack.v1"],
  ["js private workload evaluator", js, "evaluatePrivateWorkloadPack"],
  ["js private workload privacy", js, "raw_content_in_passport: false"],
  ["css private workload", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".private-workload-box"],
  ["html local capability bridge", html, "localCapabilityBridgeBox"],
  ["html local capability bridge start", html, "startLocalCapabilityBridgeBtn"],
  ["js local capability bridge schema", js, "outilsia.local_capability_bridge.v1"],
  ["js local capability bridge privacy", js, "raw_model_outputs_included: false"],
  ["rust local capability bridge loopback", rust, "TcpListener::bind((\"127.0.0.1\", 0))"],
  ["rust local capability bridge auth", rust, "bearer_token_required"],
  ["css local capability bridge", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".local-capability-bridge-box"],
  ["html board observer", html, "boardObserverBox"],
  ["html board observer ephemeral key", html, "boardObserverApiKey"],
  ["js board observer request schema", js, "outilsia.board_observer_request.v1"],
  ["js board observer result schema", js, "outilsia.board_observer_result.v1"],
  ["rust board observer read only", rust, "write_board\": false"],
  ["rust board observer no descriptions", rust, "raw_descriptions_returned\": false"],
  ["rust board observer redirect guard", rust, "Policy::none()"],
  ["rust board observer bounded response", rust, ".chunk()"],
  ["rust board observer no key persistence", rust, "credential_persisted: false"],
  ["css board observer", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".board-observer-box"],
  ["html workstack composer", html, "workstackComposerBox"],
  ["html workstack context", html, "workstackLocalContext"],
  ["js workstack request schema", js, "outilsia.workstack_compile_request.v1"],
  ["js workstack result schema", js, "outilsia.workstack_compile_result.v1"],
  ["rust workstack schema", rust, "outilsia.workstack.v1"],
  ["rust workstack plan only", rust, "start_agents\": false"],
  ["rust workstack no raw context", rust, "raw_context_included\": false"],
  ["rust workstack human gate", rust, "human_gate_non_delegable\": true"],
  ["css workstack composer", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".workstack-composer-box"],
  ["html capability router", html, "capabilityRouterBox"],
  ["html capability router objective", html, "capabilityRouterObjective"],
  ["js capability router request schema", js, "outilsia.capability_router_request.v1"],
  ["js capability router result schema", js, "outilsia.capability_router_result.v1"],
  ["rust capability routing schema", rust, "outilsia.capability_routing.v1"],
  ["rust capability router dry run", rust, "\"dry_run\": true"],
  ["rust capability router no execution", rust, "\"execution_started\": false"],
  ["rust capability router no credentials", rust, "\"credentials_read\": false"],
  ["rust capability router independent verifier", rust, "independent_verifier_enforced"],
  ["css capability router", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".capability-router-box"],
  ["html ForgeBench panel", html, "forgeBenchBox"],
  ["html ForgeBench stack selector", html, "forgeBenchStacks"],
  ["js ForgeBench request schema", js, "outilsia.forgebench_compile_request.v1"],
  ["js ForgeBench result schema", js, "outilsia.forgebench_compile_result.v1"],
  ["rust ForgeBench experiment schema", rust, "outilsia.forgebench_experiment.v1"],
  ["rust ForgeBench no execution", rust, '"agents_started": false'],
  ["rust ForgeBench no early winner", rust, '"winner_declared": false'],
  ["rust ForgeBench hidden suite receipt", rust, "outilsia.forgebench_hidden_suite_receipt.v1"],
  ["rust ForgeBench hidden seeds not returned", rust, '"hidden_seeds_returned": false'],
  ["rust ForgeBench worker isolation honest", rust, '"worker_access_blocked": false'],
  ["rust ForgeBench vault local", rust, "forgebench-hidden-suite-v1.json"],
  ["rust ForgeBench sandbox receipt", rust, "outilsia.forgebench_worker_sandbox_receipt.v1"],
  ["rust ForgeBench fresh workspaces", rust, '"fresh_workspace_per_run": true'],
  ["rust ForgeBench sandbox no worker", rust, '"worker_started": false'],
  ["rust ForgeBench sandbox no process overclaim", rust, '"process_isolation_enforced": false'],
  ["rust ForgeBench sandbox no network overclaim", rust, '"network_isolation_enforced": false'],
  ["rust ForgeBench sandbox no hidden material", rust, '"hidden_suite_material_copied": false'],
  ["ForgeBench Signal Maze schema", forgeBenchContract, "outilsia.forgebench_benchmark.v1"],
  ["ForgeBench explicit hidden suite absence", forgeBenchContract, '"status": "not_provisioned"'],
  ["ForgeBench score policy", forgeBenchContract, '"result": 50, "efficiency": 20, "speed": 15, "cost": 15'],
  ["css ForgeBench", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".forgebench-box"],
  ["html ForgeBench hidden suite", html, "forgeBenchVaultBox"],
  ["html ForgeBench worker sandbox", html, "forgeBenchSandboxBox"],
  ["css ForgeBench worker sandbox", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".forgebench-sandbox"],
  ["html evidence ledger", html, "evidenceLedgerBox"],
  ["html evidence source", html, "evidenceLedgerSource"],
  ["js evidence append schema", js, "outilsia.evidence_append_request.v1"],
  ["js evidence ledger schema", js, "outilsia.evidence_ledger.v1"],
  ["rust evidence entry schema", rust, "outilsia.evidence_entry.v1"],
  ["rust evidence append only", rust, "append_only_between_resets"],
  ["rust evidence no raw source", rust, "raw_source_documents_stored\": false"],
  ["rust evidence no execution", rust, "\"started\": false"],
  ["css evidence ledger", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".evidence-ledger-box"],
  ["notice Board Observer", workstackNotice, "Board Observer"],
  ["notice Evidence Ledger", workstackNotice, "Ce que prouve l'Evidence Ledger"],
  ["notice ForgeBench", workstackNotice, "Ce que prépare ForgeBench"],
  ["notice ForgeBench workspaces", workstackNotice, "Espaces worker frais"],
  ["notice Workstack Arena", workstackNotice, "Workstack Arena"],
  ["notice Strategy Arena boundary", workstackNotice, "OutilsIA ne génère pas de stratégie financière"],
  ["js install safety schema", js, "outilsia.install_safety_preflight.v1"],
  ["js install safety before pull", js, "runInstallSafetyPreflight(clean)"],
  ["js install safety path privacy", js, "excludes_ollama_storage_path: true"],
  ["rust install safety command", rust, "preflight_ollama_install"],
  ["rust install safety WSL storage", rust, "wsl_df_model_store"],
  ["rust install safety path excluded", rust, "storage_path_exposed: false"],
];

const missingFeature = requiredFeatureText.filter(([, text, needle]) => !text.includes(needle));
if (missingFeature.length) {
  for (const [label, , needle] of missingFeature) {
    console.error(`Missing ${label}: ${needle}`);
  }
  process.exit(1);
}

console.log("static_ui_ok", `${htmlIds.size} ids`, `${invoked.size} tauri commands`);
