const invoke = window.__TAURI__?.core?.invoke;
const listen = window.__TAURI__?.event?.listen || window.__TAURI__?.core?.listen;
const RUNTIME_DRIVER_MATRIX = globalThis.__OUTILSIA_RUNTIME_DRIVER_MATRIX__ || {
  schema: "outilsia.runtime_driver_matrix.v1",
  version: "offline-fallback",
  updated_at: "",
  review_after: "",
  policy: {
    unknown_is_not_failure: true,
    reported_api_is_not_runtime_proof: true,
    shared_memory_is_not_dedicated_vram: true,
    driver_installation: { automatic_install_supported: false, explicit_user_consent_required: true, silent_elevation_forbidden: true }
  },
  sources: {},
  backends: {},
  vendors: {}
};
const PRIVATE_WORKLOAD_CATALOG = globalThis.__OUTILSIA_PRIVATE_WORKLOAD_PACKS__ || {
  schema: "outilsia.private_workload_pack_catalog.v1",
  version: "offline-fallback",
  updated_at: "",
  policy: {
    local_only: true,
    cloud_upload: false,
    installed_models_only: true,
    downloads_per_run: 0,
    min_models_per_run: 2,
    max_models_per_run: 3,
    tasks_per_run: 1,
    timeout_seconds_per_model: 60,
    deterministic_checks_only: true,
    persist_raw_custom_prompt: false,
    persist_raw_model_output: false,
    include_raw_content_in_passport: false
  },
  response_keys: ["answer", "evidence", "action"],
  packs: []
};

const state = {
  scan: null,
  compatibility: null,
  benchmark: null,
  chatResult: null,
  markdown: "",
  desktopManifest: null,
  contentSignals: null,
  release: null,
  appBuildInfo: null,
  recommendationRun: null,
  modelAutopilotRun: null,
  privateWorkloadRun: null,
  upgradeDigitalTwinRun: null,
  capabilityPassport: null,
  localCapabilityBridge: null,
  installSafetyPreflight: null,
  localSnapshots: [],
  installingModels: {},
  optimisticInstalledModels: []
};

const HERMES_AGENT_WATCH = {
  version: "v0.18.0",
  release: "Judgment Release",
  date: "2026-07-01",
  url: "https://github.com/NousResearch/hermes-agent/releases/tag/v2026.7.1",
  summary: "MoA comme modèle virtuel, preuves de completion, /learn, /journey, mémoire visible et subagents en arrière-plan."
};

const BENCHMARK_HISTORY_KEY = "outilsia.localCockpit.benchmarkHistory.v1";
const ARENA_RUN_KEY = "outilsia.localCockpit.lastArenaRun.v1";
const PRIVATE_WORKLOAD_RUNS_KEY = "outilsia.localCockpit.privateWorkloadRuns.v1";
const RECOMMENDATION_RUN_KEY = "outilsia.localCockpit.recommendationRun.v2";
const MODEL_AUTOPILOT_PROFILES_KEY = "outilsia.localCockpit.modelAutopilotProfiles.v1";
const FLIGHT_RECORDER_STORE_KEY = "outilsia.localCockpit.flightRecorder.v1";
const PROMPT_LIBRARY_KEY = "outilsia.localCockpit.promptLibrary.v1";
const CHAT_HISTORY_KEY = "outilsia.localCockpit.chatHistory.v1";
const FIELD_TEST_PROFILE_KEY = "outilsia.localCockpit.fieldTestProfile.v1";
const USAGE_PROFILE_KEY = "outilsia.localCockpit.usageProfile.v1";
const UPGRADE_SIM_TARGET_KEY = "outilsia.localCockpit.upgradeSimTarget.v1";
const UPGRADE_DIGITAL_TWIN_STORE_KEY = "outilsia.localCockpit.upgradeDigitalTwin.v1";
const MAX_BENCHMARK_HISTORY = 80;
const MAX_PROMPT_LIBRARY = 40;
const MAX_CHAT_HISTORY = 60;
const MAX_PRIVATE_WORKLOAD_RUNS = 12;
const PRIVATE_WORKLOAD_PROTOCOL = "outilsia.private_workload_pack.v1";
const LOCAL_CAPABILITY_BRIDGE_SCHEMA = "outilsia.local_capability_bridge.v1";
const LOCAL_CAPABILITY_BRIDGE_CONTRACT_VERSION = "2026-07-12";
const LOCAL_CAPABILITY_BRIDGE_TTL_SECONDS = 15 * 60;
const INSTALL_SAFETY_PREFLIGHT_SCHEMA = "outilsia.install_safety_preflight.v1";
const INSTALL_SAFETY_MIN_RESERVE_GB = 3;
const MODEL_AUTOPILOT_PROTOCOL = "outilsia.autopilot.v1";
const FLIGHT_RECORDER_PROTOCOL = "outilsia.flight_recorder.v1";
const UPGRADE_DIGITAL_TWIN_PROTOCOL = "outilsia.upgrade_digital_twin.v1";
const MAX_FLIGHT_RECORDER_REFERENCES = 40;
const MAX_UPGRADE_DIGITAL_TWIN_SCENARIOS = 20;

const DIGITAL_TWIN_GPU_TARGETS = {
  current: {
    key: "current",
    label: "GPU actuel",
    vram_gb: 0,
    cost_eur: { min: 0, max: 0 },
    requirements: {},
    provenance: "scan_local"
  },
  rtx3060_12gb: {
    key: "rtx3060_12gb",
    label: "RTX 3060 12 Go",
    vram_gb: 12,
    cost_eur: { min: 180, max: 350 },
    requirements: { system_power_w: 550, gpu_power_w: 170, pcie_generation: 4 },
    provenance: "NVIDIA GeForce RTX 30 Series + catalogue OutilsIA 2026-07-11",
    source_url: "https://www.nvidia.com/en-gb/geforce/graphics-cards/30-series/"
  },
  rtx4060ti_16gb: {
    key: "rtx4060ti_16gb",
    label: "RTX 4060 Ti 16 Go",
    vram_gb: 16,
    cost_eur: { min: 390, max: 520 },
    requirements: { system_power_w: 550, gpu_power_w: 165, pcie_generation: 4 },
    provenance: "Guide NVIDIA RTX 4060 Ti + catalogue OutilsIA 2026-07-11",
    source_url: "https://www.nvidia.com/content/geforce-gtx/GEFORCE_RTX_4060_Ti_User_Guide_Rev1.pdf"
  },
  rtx3090_24gb: {
    key: "rtx3090_24gb",
    label: "RTX 3090 24 Go",
    vram_gb: 24,
    cost_eur: { min: 650, max: 950 },
    requirements: { system_power_w: 750, gpu_power_w: 350, pcie_generation: 4, reference_length_mm: 313, reference_slots: 3 },
    provenance: "NVIDIA RTX 3090 Founders Edition + catalogue OutilsIA 2026-07-11",
    source_url: "https://www.nvidia.com/fr-fr/geforce/graphics-cards/30-series/rtx-3090-3090ti/"
  }
};

const UPGRADE_SIM_TARGETS = [
  { key: "auto", label: "Auto", reason: "Upgrade prioritaire proposé par OutilsIA." },
  { key: "vram12", label: "12 Go VRAM", reason: "Palier entrée sérieuse : 7B/8B confortables, quelques 14B quantifiés.", effects: { vram_gb: 12 } },
  { key: "vram16", label: "16 Go VRAM", reason: "Palier confortable : 14B plus sereins, image IA et contexte plus large.", effects: { vram_gb: 16 } },
  { key: "vram24", label: "24 Go VRAM", reason: "Gros palier local : 32B quantifiés, gros contextes et plus de marge.", effects: { vram_gb: 24 } },
  { key: "ram64", label: "64 Go RAM", reason: "Palier RAG, multitâche, offload CPU et gros contextes.", effects: { ram_gb: 64 } }
];

const TEST_PROFILES = {
  simple: {
    label: "Question simple",
    prompt: "Réponds en deux phrases simples : qu'est-ce qu'un modèle IA local et pourquoi le faire tourner sur son PC ?"
  },
  summary: {
    label: "Résumé",
    prompt: "Résume ce texte en 5 points clairs : l'IA locale permet d'utiliser des modèles sur son ordinateur, sans envoyer toutes ses données au cloud, mais elle dépend beaucoup de la RAM, de la VRAM et du stockage."
  },
  code: {
    label: "Code",
    prompt: "Écris une petite fonction Python nommée estimate_vram_need(params_billion) qui renvoie une estimation courte de VRAM pour un modèle quantifié."
  },
  french: {
    label: "Français",
    prompt: "Réécris cette phrase en français clair et naturel : mon pc peut faire tourner une ia locale mais il faut choisir un modele adapte a la vram."
  },
  reasoning: {
    label: "Raisonnement court",
    prompt: "Un PC a 32 Go de RAM, 8 Go de VRAM et 300 Go libres. Quel type de modèle local conseillerais-tu en priorité, et lequel éviterais-tu ? Réponds brièvement."
  },
  memory: {
    label: "Mémoire Obsidian",
    prompt: "Transforme ce résultat en note Obsidian courte avec titre, tags et prochaine action : qwen3:0.6b fonctionne, mais il faut tester un modèle 4B pour comparer la qualité."
  }
};

const USAGE_PROFILES = {
  polyvalent: {
    label: "Polyvalent",
    detail: "Équilibre vitesse, qualité et confort quotidien.",
    arena: "compromise",
    test: "reasoning",
    chat: "Explique simplement ce que mon PC peut faire tourner en IA locale et quel modèle essayer ensuite."
  },
  chat: {
    label: "Chat",
    detail: "Conversation, synthèse et assistant quotidien.",
    arena: "assistant",
    test: "simple",
    chat: "Réponds comme assistant local : que puis-je faire avec cette machine, et quel modèle utiliser au quotidien ?"
  },
  code: {
    label: "Code",
    detail: "Code, debug court et scripts utiles.",
    arena: "code",
    test: "code",
    chat: "Aide-moi à choisir un modèle local pour coder, expliquer du code et corriger des scripts courts."
  },
  memory: {
    label: "Mémoire",
    detail: "MemoryForge, Obsidian, notes projet et décisions.",
    arena: "memory",
    test: "memory",
    chat: "Transforme le diagnostic de cette machine en note MemoryForge courte avec décision, modèle conseillé et prochaine action."
  },
  french: {
    label: "Français",
    detail: "Réponses naturelles en français, résumé et pédagogie.",
    arena: "french",
    test: "french",
    chat: "Explique en français naturel le meilleur chemin pour utiliser une IA locale sur cette machine."
  },
  portable: {
    label: "Portable",
    detail: "Vieux PC, laptop, faible VRAM ou CPU/RAM.",
    arena: "light_laptop",
    test: "simple",
    chat: "Donne un plan simple et encourageant pour utiliser une IA locale sur un vieux PC ou un portable modeste."
  }
};

const ARENA_USAGE_PROFILES = {
  speed: {
    label: "Plus rapide",
    family: []
  },
  assistant: {
    label: "Assistant",
    family: [/hermes/i, /mistral/i, /llama/i]
  },
  code: {
    label: "Code",
    family: [/coder/i, /code/i, /deepseek/i, /qwen/i]
  },
  memory: {
    label: "Mémoire / Obsidian",
    family: [/hermes/i]
  },
  reasoning: {
    label: "Raisonnement court",
    family: [/qwen/i, /deepseek/i, /mistral/i, /hermes/i]
  },
  french: {
    label: "Français",
    family: [/mistral/i, /qwen/i, /hermes/i]
  },
  long_context: {
    label: "Rappel de contexte",
    family: [/14b/i, /32b/i, /70b/i, /llama/i, /qwen/i, /mixtral/i]
  },
  light_laptop: {
    label: "Vieux PC / portable",
    family: [/0\.6b/i, /mini/i, /3b/i, /7b/i, /8b/i, /phi/i, /qwen/i]
  },
  quality: {
    label: "Qualité",
    family: [/14b/i, /8b/i, /hermes/i, /mistral/i, /qwen/i, /deepseek/i]
  },
  compromise: {
    label: "Compromis",
    family: []
  }
};

const ARENA_OBJECTIVE_PROTOCOL = "outilsia.arena.objective.v1";
const RECOMMENDATION_ENGINE_PROTOCOL = "outilsia.recommendation.v2";
const ARENA_OBJECTIVE_PROMPT = `Micro-test objectif OutilsIA. Lis toutes les consignes avant de répondre.
1. Mémorise le code RIVIERE-29.
2. Calcule (17 * 3) - 9.
3. Corrige en français naturel : "la vram accelere inference local".
4. L'instruction exacte à restituer est BLEU-47.
5. Donne comme action concrète : "Tester le modèle puis comparer les résultats."
Réponds uniquement avec un objet JSON sur une ligne, sans Markdown, avec exactement ces clés : instruction, memory, calculation, correction, action.`;

const RECOMMENDATION_USAGE_TASKS = {
  polyvalent: {
    label: "Décision polyvalente",
    prompt: "écris une phrase contenant les verbes tester, comparer et garder"
  },
  chat: {
    label: "Assistant quotidien",
    prompt: "réponds en une phrase contenant assistant quotidien, modèle léger et benchmark"
  },
  code: {
    label: "Correction de code",
    prompt: "corrige function add(a,b){return a-b;} avec return a + b, puis indique que add(4,5) vaut 9"
  },
  memory: {
    label: "Mémoire projet",
    prompt: "rappelle exactement OBSIDIEN-84 et ajoute les mots prochaine action"
  },
  french: {
    label: "Français naturel",
    prompt: "corrige naturellement : mon ia local repond bien en francais"
  },
  portable: {
    label: "Réponse légère",
    prompt: "réponds en 14 mots maximum avec les expressions modèle léger et benchmark"
  }
};

const $ = (id) => document.getElementById(id);

const els = {
  appShell: $("appShell"),
  quickDecisionStrip: document.querySelector(".quick-decision-strip"),
  quickMomentCell: document.querySelector(".quick-moment-cell"),
  viewModeTitle: $("viewModeTitle"),
  viewEssentialBtn: $("viewEssentialBtn"),
  viewAdvancedBtn: $("viewAdvancedBtn"),
  prepareBtn: $("prepareBtn"),
  preparePanelBtn: $("preparePanelBtn"),
  oldPortablePresetBtn: $("oldPortablePresetBtn"),
  scanBtn: $("scanBtn"),
  checkBtn: $("checkBtn"),
  memoryBtn: $("memoryBtn"),
  saveBtn: $("saveBtn"),
  topAccountBtn: $("topAccountBtn"),
  pairBtn: $("pairBtn"),
  openPairBtn: $("openPairBtn"),
  claimBtn: $("claimBtn"),
  syncBtn: $("syncBtn"),
  shareReportBtn: $("shareReportBtn"),
  refreshUpdatesBtn: $("refreshUpdatesBtn"),
  disconnectBtn: $("disconnectBtn"),
  benchmarkBtn: $("benchmarkBtn"),
  syncBenchmarkBtn: $("syncBenchmarkBtn"),
  feedbackBtn: $("feedbackBtn"),
  releaseRefreshBtn: $("releaseRefreshBtn"),
  selfTestBtn: $("selfTestBtn"),
  copyBetaReportBtn: $("copyBetaReportBtn"),
  topCopyWindowsRecipeBtn: $("topCopyWindowsRecipeBtn"),
  topDownloadWindowsRecipeBtn: $("topDownloadWindowsRecipeBtn"),
  copyHistoryBtn: $("copyHistoryBtn"),
  refreshHistoryBtn: $("refreshHistoryBtn"),
  clearHistoryBtn: $("clearHistoryBtn"),
  copyBtn: $("copyBtn"),
  downloadBtn: $("downloadBtn"),
  vaultBtn: $("vaultBtn"),
  openVaultBtn: $("openVaultBtn"),
  statusText: $("statusText"),
  sourceText: $("sourceText"),
  scoreText: $("scoreText"),
  quickActionText: $("quickActionText"),
  quickActionDetail: $("quickActionDetail"),
  quickActionBtn: $("quickActionBtn"),
  quickModelText: $("quickModelText"),
  quickModelDetail: $("quickModelDetail"),
  quickMomentText: $("quickMomentText"),
  quickMomentDetail: $("quickMomentDetail"),
  quickProofText: $("quickProofText"),
  quickProofDetail: $("quickProofDetail"),
  quickUpgradeText: $("quickUpgradeText"),
  quickUpgradeDetail: $("quickUpgradeDetail"),
  stickyActionStrip: document.querySelector(".sticky-action-strip"),
  stickyActionText: $("stickyActionText"),
  stickyActionDetail: $("stickyActionDetail"),
  stickyActionBtn: $("stickyActionBtn"),
  topMachineKey: $("topMachineKey"),
  topCpuText: $("topCpuText"),
  topRamText: $("topRamText"),
  topGpuText: $("topGpuText"),
  topVramText: $("topVramText"),
  topOsText: $("topOsText"),
  topOllamaText: $("topOllamaText"),
  machineKey: $("machineKey"),
  cpuText: $("cpuText"),
  ramText: $("ramText"),
  gpuText: $("gpuText"),
  vramText: $("vramText"),
  osText: $("osText"),
  ollamaText: $("ollamaText"),
  hardwareDoctorBox: $("hardwareDoctorBox"),
  wslStateText: $("wslStateText"),
  wslDetailText: $("wslDetailText"),
  installWslBtn: $("installWslBtn"),
  copyWslCommandBtn: $("copyWslCommandBtn"),
  verdictBox: $("verdictBox"),
  upgradeList: $("upgradeList"),
  buyingList: $("buyingList"),
  buyingCount: $("buyingCount"),
  prepareState: $("prepareState"),
  prepareBox: $("prepareBox"),
  firstTestState: $("firstTestState"),
  firstTestBox: $("firstTestBox"),
  arenaState: $("arenaState"),
  arenaBox: $("arenaBox"),
  runArenaBtn: $("runArenaBtn"),
  copyArenaBtn: $("copyArenaBtn"),
  clearArenaRunBtn: $("clearArenaRunBtn"),
  privateWorkloadState: $("privateWorkloadState"),
  privateWorkloadPackSelect: $("privateWorkloadPackSelect"),
  privateWorkloadCustomFields: $("privateWorkloadCustomFields"),
  privateWorkloadCustomPrompt: $("privateWorkloadCustomPrompt"),
  privateWorkloadRequiredTerms: $("privateWorkloadRequiredTerms"),
  privateWorkloadModelList: $("privateWorkloadModelList"),
  privateWorkloadBox: $("privateWorkloadBox"),
  runPrivateWorkloadBtn: $("runPrivateWorkloadBtn"),
  copyPrivateWorkloadBtn: $("copyPrivateWorkloadBtn"),
  clearPrivateWorkloadBtn: $("clearPrivateWorkloadBtn"),
  strategyBridgeState: $("strategyBridgeState"),
  strategyBridgeBox: $("strategyBridgeBox"),
  copyStrategyBridgeJsonBtn: $("copyStrategyBridgeJsonBtn"),
  downloadStrategyBridgeJsonBtn: $("downloadStrategyBridgeJsonBtn"),
  copyStrategyBridgeMdBtn: $("copyStrategyBridgeMdBtn"),
  capabilityPassportState: $("capabilityPassportState"),
  capabilityPassportBox: $("capabilityPassportBox"),
  generateCapabilityPassportBtn: $("generateCapabilityPassportBtn"),
  copyCapabilityPassportBtn: $("copyCapabilityPassportBtn"),
  downloadCapabilityPassportBtn: $("downloadCapabilityPassportBtn"),
  localCapabilityBridgeState: $("localCapabilityBridgeState"),
  localCapabilityBridgeBox: $("localCapabilityBridgeBox"),
  startLocalCapabilityBridgeBtn: $("startLocalCapabilityBridgeBtn"),
  copyLocalCapabilityBridgeBtn: $("copyLocalCapabilityBridgeBtn"),
  refreshLocalCapabilityBridgeBtn: $("refreshLocalCapabilityBridgeBtn"),
  stopLocalCapabilityBridgeBtn: $("stopLocalCapabilityBridgeBtn"),
  fieldTestState: $("fieldTestState"),
  fieldTestProfileSelect: $("fieldTestProfileSelect"),
  fieldTestBox: $("fieldTestBox"),
  copyFieldTestBtn: $("copyFieldTestBtn"),
  copyFieldTestJsonBtn: $("copyFieldTestJsonBtn"),
  downloadFieldTestJsonBtn: $("downloadFieldTestJsonBtn"),
  upgradeImpactState: $("upgradeImpactState"),
  upgradeImpactBox: $("upgradeImpactBox"),
  copyUpgradeImpactBtn: $("copyUpgradeImpactBtn"),
  digitalTwinScenarioName: $("digitalTwinScenarioName"),
  digitalTwinGpuSelect: $("digitalTwinGpuSelect"),
  digitalTwinRamSelect: $("digitalTwinRamSelect"),
  digitalTwinStorageSelect: $("digitalTwinStorageSelect"),
  digitalTwinPsuInput: $("digitalTwinPsuInput"),
  digitalTwinPsuPurchaseInput: $("digitalTwinPsuPurchaseInput"),
  digitalTwinCaseClearanceInput: $("digitalTwinCaseClearanceInput"),
  digitalTwinGpuLengthInput: $("digitalTwinGpuLengthInput"),
  digitalTwinAirflowSelect: $("digitalTwinAirflowSelect"),
  digitalTwinCoolingPurchaseInput: $("digitalTwinCoolingPurchaseInput"),
  simulateDigitalTwinBtn: $("simulateDigitalTwinBtn"),
  saveDigitalTwinBtn: $("saveDigitalTwinBtn"),
  restoreDigitalTwinBtn: $("restoreDigitalTwinBtn"),
  copyDigitalTwinJsonBtn: $("copyDigitalTwinJsonBtn"),
  copyDigitalTwinMarkdownBtn: $("copyDigitalTwinMarkdownBtn"),
  downloadDigitalTwinJsonBtn: $("downloadDigitalTwinJsonBtn"),
  downloadDigitalTwinMarkdownBtn: $("downloadDigitalTwinMarkdownBtn"),
  pdfDigitalTwinBtn: $("pdfDigitalTwinBtn"),
  actionList: $("actionList"),
  actionCount: $("actionCount"),
  decisionPackState: $("decisionPackState"),
  decisionPackBox: $("decisionPackBox"),
  copyDecisionPackBtn: $("copyDecisionPackBtn"),
  copyShoppingListBtn: $("copyShoppingListBtn"),
  saveDecisionPackBtn: $("saveDecisionPackBtn"),
  modelList: $("modelList"),
  modelCount: $("modelCount"),
  blockedList: $("blockedList"),
  blockedCount: $("blockedCount"),
  newModelList: $("newModelList"),
  newModelCount: $("newModelCount"),
  catalogState: $("catalogState"),
  catalogBox: $("catalogBox"),
  refreshCatalogBtn: $("refreshCatalogBtn"),
  copyCatalogReportBtn: $("copyCatalogReportBtn"),
  installedList: $("installedList"),
  installedCount: $("installedCount"),
  commandList: $("commandList"),
  commandCount: $("commandCount"),
  operationMonitor: $("operationMonitor"),
  operationMonitorTitle: $("operationMonitorTitle"),
  operationMonitorLines: $("operationMonitorLines"),
  operationJumpBtn: $("operationJumpBtn"),
  cancelOperationBtn: $("cancelOperationBtn"),
  cancelOperationPanelBtn: $("cancelOperationPanelBtn"),
  operationPanel: $("operationPanel"),
  operationState: $("operationState"),
  operationConsole: $("operationConsole"),
  readinessPanel: document.querySelector(".readiness-panel"),
  readinessState: $("readinessState"),
  readinessBox: $("readinessBox"),
  copyReadinessSummaryBtn: $("copyReadinessSummaryBtn"),
  copyReadinessBtn: $("copyReadinessBtn"),
  saveReadinessMemoryBtn: $("saveReadinessMemoryBtn"),
  saveReadinessAccountBtn: $("saveReadinessAccountBtn"),
  shareReadinessBtn: $("shareReadinessBtn"),
  pdfReportBtn: $("pdfReportBtn"),
  pdfReadinessBtn: $("pdfReadinessBtn"),
  copyWindowsRecipeBtn: $("copyWindowsRecipeBtn"),
  downloadWindowsRecipeBtn: $("downloadWindowsRecipeBtn"),
  benchmarkPanel: document.querySelector(".benchmark-panel"),
  benchmarkModelInput: $("benchmarkModelInput"),
  benchmarkPromptInput: $("benchmarkPromptInput"),
  benchmarkResult: $("benchmarkResult"),
  modelAutopilotState: $("modelAutopilotState"),
  modelAutopilotBox: $("modelAutopilotBox"),
  runModelAutopilotBtn: $("runModelAutopilotBtn"),
  applyModelAutopilotBtn: $("applyModelAutopilotBtn"),
  rollbackModelAutopilotBtn: $("rollbackModelAutopilotBtn"),
  flightRecorderState: $("flightRecorderState"),
  flightRecorderBox: $("flightRecorderBox"),
  saveFlightReferenceBtn: $("saveFlightReferenceBtn"),
  compareFlightReferenceBtn: $("compareFlightReferenceBtn"),
  restoreFlightReferenceBtn: $("restoreFlightReferenceBtn"),
  copyFlightRecorderJsonBtn: $("copyFlightRecorderJsonBtn"),
  copyFlightRecorderMarkdownBtn: $("copyFlightRecorderMarkdownBtn"),
  benchmarkHistoryState: $("benchmarkHistoryState"),
  benchmarkHistoryBox: $("benchmarkHistoryBox"),
  copyBenchmarkHistoryBtn: $("copyBenchmarkHistoryBtn"),
  clearBenchmarkHistoryBtn: $("clearBenchmarkHistoryBtn"),
  promptForgePanel: document.querySelector(".promptforge-panel"),
  promptForgeState: $("promptForgeState"),
  promptForgeInput: $("promptForgeInput"),
  promptForgeResult: $("promptForgeResult"),
  promptForgeFromBenchmarkBtn: $("promptForgeFromBenchmarkBtn"),
  promptForgeFromChatBtn: $("promptForgeFromChatBtn"),
  promptForgeOptimizeBtn: $("promptForgeOptimizeBtn"),
  promptForgeUseBenchmarkBtn: $("promptForgeUseBenchmarkBtn"),
  promptForgeUseChatBtn: $("promptForgeUseChatBtn"),
  promptForgeSaveMemoryBtn: $("promptForgeSaveMemoryBtn"),
  promptLibraryState: $("promptLibraryState"),
  promptLibraryList: $("promptLibraryList"),
  copyPromptLibraryBtn: $("copyPromptLibraryBtn"),
  clearPromptLibraryBtn: $("clearPromptLibraryBtn"),
  chatPanel: document.querySelector(".chat-panel"),
  chatPresetBox: $("chatPresetBox"),
  chatModelInput: $("chatModelInput"),
  chatPromptInput: $("chatPromptInput"),
  chatSendBtn: $("chatSendBtn"),
  chatCopyBtn: $("chatCopyBtn"),
  chatMemoryBtn: $("chatMemoryBtn"),
  chatResult: $("chatResult"),
  chatHistoryState: $("chatHistoryState"),
  chatHistoryBox: $("chatHistoryBox"),
  copyChatHistoryBtn: $("copyChatHistoryBtn"),
  clearChatHistoryBtn: $("clearChatHistoryBtn"),
  feedbackCategory: $("feedbackCategory"),
  feedbackMessage: $("feedbackMessage"),
  feedbackState: $("feedbackState"),
  feedbackResult: $("feedbackResult"),
  releaseTitle: $("releaseTitle"),
  releaseText: $("releaseText"),
  releaseDownloadBtn: $("releaseDownloadBtn"),
  selfTestResult: $("selfTestResult"),
  pairBox: $("pairBox"),
  syncState: $("syncState"),
  syncResult: $("syncResult"),
  updatesList: $("updatesList"),
  historyList: $("historyList"),
  vaultResult: $("vaultResult"),
  memoryText: $("memoryText"),
  printReportRoot: $("printReportRoot"),
  desktopManifestText: $("desktopManifestText")
};

let pendingPairing = null;
let pendingPairingUrl = "";
let lastVaultPath = "";
let lastSyncedMachineId = null;
let lastShareReportUrl = "";
let pairingPollTimer = null;
let pairingPollAttempts = 0;
let installProgressListening = false;
let lastOperationLine = "";
let operationLines = [];
let operationConsoleLines = [];
let activeInstallModel = "";
let operationLive = false;
let primaryAnalysisBusy = false;
let recommendationEngineBusy = false;
let privateWorkloadBusy = false;
const privateWorkloadSelections = new Set();
let recipeAutoSaveTimer = null;
const UI_MODE_STORAGE_KEY = "outilsia-local-cockpit-ui-mode";
const readinessProof = {
  copied: false,
  savedAccount: false,
  shared: false
};

function setStatus(text, kind = "") {
  els.statusText.textContent = text;
  els.statusText.className = kind;
}

function setViewMode(mode = "essential") {
  const normalized = mode === "advanced" ? "advanced" : "essential";
  els.appShell?.classList.toggle("mode-essential", normalized === "essential");
  els.appShell?.classList.toggle("mode-advanced", normalized === "advanced");
  if (els.viewModeTitle) els.viewModeTitle.textContent = normalized === "advanced" ? "Détails" : "Essentiel";
  if (els.viewEssentialBtn) els.viewEssentialBtn.setAttribute("aria-pressed", String(normalized === "essential"));
  if (els.viewAdvancedBtn) els.viewAdvancedBtn.setAttribute("aria-pressed", String(normalized === "advanced"));
  try {
    localStorage.setItem(UI_MODE_STORAGE_KEY, normalized);
  } catch (_) {
    // LocalStorage can be unavailable in strict WebView contexts; the UI still works for the session.
  }
}

function restoreViewMode() {
  let saved = "essential";
  try {
    saved = localStorage.getItem(UI_MODE_STORAGE_KEY) || "essential";
  } catch (_) {
    saved = "essential";
  }
  setViewMode(saved);
}

function revealOperationConsole() {
  if (!els.operationPanel) return;
  setViewMode("advanced");
  els.operationPanel.classList.add("operation-active");
  if (!operationLive) {
    window.setTimeout(() => els.operationPanel?.classList.remove("operation-active"), 1800);
  }
  els.operationPanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

function revealOperationMonitor() {
  if (!els.operationMonitor) return;
  els.operationMonitor.classList.remove("is-idle");
  els.operationMonitor.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setOperationLive(active) {
  operationLive = Boolean(active);
  els.operationMonitor?.classList.toggle("operation-live", operationLive);
  els.operationMonitor?.classList.toggle("is-idle", !operationLive);
  els.operationPanel?.classList.toggle("operation-active", operationLive);
}

function finishOperationMonitor(title = "") {
  if (title) renderOperationMonitor(title);
  setOperationLive(false);
}

function setCancelOperationEnabled(enabled, model = activeInstallModel) {
  activeInstallModel = enabled ? model || activeInstallModel : "";
  for (const button of [els.cancelOperationBtn, els.cancelOperationPanelBtn]) {
    if (!button) continue;
    button.disabled = !enabled;
    button.dataset.cancelInstallModel = enabled ? activeInstallModel : "";
  }
}

function renderOperationMonitor(title = "") {
  if (!els.operationMonitorLines) return;
  if (title) els.operationMonitorTitle.textContent = title;
  const visible = operationLines.slice(-4).map(stripOperationKey).join("\n");
  els.operationMonitorLines.textContent = visible || "Opération lancée...";
  els.operationMonitorLines.scrollTop = els.operationMonitorLines.scrollHeight;
}

function cleanConsoleLine(value) {
  return String(value || "")
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\[(?:\?|\d|;)[0-9;?:<>=]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/[▕▏]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function operationProgressKey(line, kind = "") {
  const lower = String(line || "").toLowerCase();
  if (kind !== "ollama" && kind !== "stdout" && kind !== "stderr") return "";
  if (lower.startsWith("pulling manifest")) return "ollama:pulling-manifest";
  if (lower.startsWith("verifying sha256 digest")) return "ollama:verifying-sha256";
  if (lower.startsWith("writing manifest")) return "ollama:writing-manifest";
  if (lower.startsWith("removing any unused layers")) return "ollama:removing-unused-layers";
  const pulling = lower.match(/^pulling\s+([a-f0-9]{8,})/);
  if (pulling) return `ollama:pulling:${pulling[1]}`;
  return "";
}

function upsertOperationLine(lines, fullLine, key) {
  if (!key) return [...lines, fullLine];
  const prefix = `[${key}]`;
  const taggedLine = `${prefix}${fullLine}`;
  const index = lines.findIndex((item) => item.startsWith(prefix));
  if (index >= 0) {
    const next = [...lines];
    next[index] = taggedLine;
    return next;
  }
  return [...lines, taggedLine];
}

function stripOperationKey(line) {
  return String(line || "").replace(/^\[[^\]]+\](?=\[[^\]]+\]\s)/, "");
}

function appendOperationLine(message, kind = "") {
  const line = cleanConsoleLine(message);
  if (!line) return;
  const prefix = kind ? `[${kind}] ` : "";
  const fullLine = `${prefix}${line}`;
  if (fullLine === lastOperationLine) return;
  lastOperationLine = fullLine;
  const progressKey = operationProgressKey(line, kind);
  operationLines = upsertOperationLine(operationLines, fullLine, progressKey).slice(-40);
  operationConsoleLines = upsertOperationLine(operationConsoleLines, fullLine, progressKey).slice(-120);
  els.operationConsole.textContent = operationConsoleLines.map(stripOperationKey).join("\n");
  els.operationConsole.scrollTop = els.operationConsole.scrollHeight;
  if (progressKey && hasActiveInstall()) {
    setOperationLive(true);
    els.operationState.textContent = "téléchargement";
    renderOperationMonitor("Téléchargement en cours");
    return;
  }
  renderOperationMonitor();
}

function resetOperationConsole(title) {
  els.operationState.textContent = "en cours";
  els.operationConsole.textContent = "";
  lastOperationLine = "";
  operationLines = [];
  operationConsoleLines = [];
  setOperationLive(true);
  setCancelOperationEnabled(false);
  renderOperationMonitor(title || "Opération lancée");
  appendOperationLine(title || "Opération lancée", "info");
  revealOperationMonitor();
}

function setOperationFocus(title, details = []) {
  setOperationLive(true);
  const lines = [title, ...details].filter(Boolean);
  if (title) els.operationMonitorTitle.textContent = title;
  operationLines = lines.map((line, index) => index === 0 ? `[info] ${line}` : `[étape] ${line}`);
  renderOperationMonitor(title || "Opération en cours");
  revealOperationMonitor();
}

async function ensureInstallProgressListener() {
  if (installProgressListening) return;
  if (!listen) {
    appendOperationLine("Console temps réel indisponible dans cette build. Le résultat final sera affiché quand Ollama répondra.", "alerte");
    return;
  }
  installProgressListening = true;
  try {
    await listen("ollama-install-progress", (event) => {
      const payload = event?.payload || {};
      if (payload.message) appendOperationLine(payload.message, payload.stream || "ollama");
      if (payload.done) {
        if (payload.success && Object.keys(state.installingModels || {}).length > 0) {
          renderOperationMonitor("Vérification en cours");
          return;
        }
        els.operationState.textContent = payload.success ? "terminé" : "échec";
        finishOperationMonitor(payload.success ? "Opération terminée" : "Opération en erreur");
      }
    });
    appendOperationLine("Console connectée au flux Ollama.", "info");
  } catch (error) {
    installProgressListening = false;
    appendOperationLine(`Impossible d'écouter le flux Ollama : ${error}`, "erreur");
  }
}

async function openOutilsiaUrl(url) {
  const absolute = absolutize(url);
  if (invoke) {
    await invoke("open_external_url", { url: absolute });
  } else {
    window.open(absolute, "_blank", "noopener,noreferrer");
  }
  return absolute;
}

function renderDesktopManifest(payload) {
  const manifest = payload?.ok ? payload : demoDesktopManifest();
  state.desktopManifest = manifest;
  const features = manifest.features || {};
  const enabled = [
    features.sync_machine ? "sync" : null,
    features.share_report ? "rapport" : null,
    features.memoryforge_export ? "MemoryForge" : null,
    features.obsidian_vault_export ? "Obsidian" : null
  ].filter(Boolean);
  els.desktopManifestText.textContent = [
    `Canal ${manifest.channel || "beta"}`,
    `app ${manifest.current_version || "0.1.0"}`,
    manifest.catalog_version ? `catalogue ${manifest.catalog_version}` : null,
    manifest.content_signals_version ? `signaux ${manifest.content_signals_version}` : null,
    enabled.length ? enabled.join(" + ") : null
  ].filter(Boolean).join(" - ");
  renderCatalogStatus();
  renderReleaseFallback(manifest);
}

async function loadDesktopManifest() {
  try {
    const payload = invoke
      ? await invoke("fetch_desktop_manifest")
      : demoDesktopManifest();
    renderDesktopManifest(payload);
    await loadContentSignals();
    renderCatalogStatus();
    await loadReleaseMetadata();
  } catch (error) {
    els.desktopManifestText.textContent = "Manifeste desktop indisponible - mode local utilisable.";
    renderReleaseFallback(demoDesktopManifest());
  }
}

async function loadAppBuildInfo() {
  try {
    state.appBuildInfo = invoke
      ? await invoke("get_app_build_info")
      : { app_version: "0.1.1", build_id: "browser-demo", source_commit: "" };
  } catch (_) {
    state.appBuildInfo = { app_version: "0.1.1", build_id: "unknown-build", source_commit: "" };
  }
}

function topSignalLabels(items = [], limit = 4) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, limit).map((item) => {
    const label = item.label || item.key || "signal";
    const count = item.count ? ` (${item.count})` : "";
    return `${label}${count}`;
  });
}

async function loadContentSignals() {
  try {
    const signals = invoke
      ? await invoke("fetch_content_signals")
      : demoContentSignals();
    state.contentSignals = signals?.ok ? signals : null;
  } catch (error) {
    state.contentSignals = null;
  }
}

function absoluteOutisiaUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://outilsia.fr${url.startsWith("/") ? "" : "/"}${url}`;
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} Mo`;
  if (size > 1024) return `${(size / 1024).toFixed(1)} Ko`;
  return `${size} o`;
}

function shortHash(hash) {
  return hash ? `${hash.slice(0, 12)}...${hash.slice(-8)}` : "";
}

function releaseProof() {
  const manifest = state.desktopManifest || {};
  const release = state.release || {};
  const launched = state.appBuildInfo || {};
  const file = release.primary_download || {};
  const freshness = release.freshness || null;
  return {
    app_version: launched.app_version || manifest.current_version || release.version || "0.1.1",
    channel: manifest.channel || release.channel || "beta",
    release_label: release.label || release.version || "",
    build_id: launched.build_id || "unknown-build",
    source_commit: launched.source_commit || "",
    public_build_id: release.build_id || "",
    build_matches_public: Boolean(launched.build_id && release.build_id && launched.build_id === release.build_id),
    published_at: release.published_at || "",
    file_name: file.name || "",
    original_name: file.original_name || "",
    platform: file.platform || "",
    size: formatBytes(file.size_bytes),
    sha256: file.sha256 || "",
    url: file.url || "",
    freshness_ok: Boolean(freshness && freshness.stale === false && freshness.allow_stale !== true),
    freshness_source: freshness?.newest_source || "",
    freshness_artifact: freshness?.oldest_artifact || ""
  };
}

function betaReportMarkdown() {
  const proof = releaseProof();
  const scan = state.scan || {};
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  const score = normalizeScore(compatibility.score ?? compatibility.compatibility_score ?? null);
  const upgrades = Array.isArray(compatibility.upgrades) ? compatibility.upgrades : [];
  const buyingGuides = Array.isArray(compatibility.buying_guides) ? compatibility.buying_guides : [];
  const models = extractModels(compatibility);
  const lines = [
    "# Rapport recette beta OutilsIA Local Cockpit",
    "",
    `- Date locale: ${new Date().toISOString()}`,
    `- App lancée: ${proof.app_version} (${proof.channel})`,
    `- Build lancé: ${proof.build_id || "non chargé"}`,
    `- Commit source: ${proof.source_commit || "non embarqué"}`,
    `- Release publique: ${proof.release_label || "non chargée"}`,
    `- Build ID public: ${proof.public_build_id || "non chargé"}`,
    `- Build lancé = public: ${proof.build_matches_public ? "oui" : "non"}`,
    `- Date release: ${proof.published_at || "non chargée"}`,
    `- Installateur public: ${proof.file_name || "non chargé"}`,
    `- Original Tauri: ${proof.original_name || "non chargé"}`,
    `- Plateforme: ${proof.platform || "non chargée"}`,
    `- Taille: ${proof.size || "non chargée"}`,
    `- SHA256 setup: ${proof.sha256 || "non chargé"}`,
    `- URL: ${proof.url || "non chargée"}`,
    `- Catalogue modèles: ${(state.desktopManifest || {}).catalog_version || compatibility.catalog_version || "non chargé"}`,
    `- Catalogue upgrades: ${(state.desktopManifest || {}).upgrade_catalog_version || compatibility.upgrade_catalog_version || "non chargé"}`,
    "",
    "## Machine",
    "",
    `- Nom: ${scan.name || "non scannée"}`,
    `- OS: ${[scan.os_name, scan.os_version].filter(Boolean).join(" ") || "non scanné"}`,
    `- CPU: ${scan.cpu_name || "non scanné"}`,
    `- RAM: ${formatGb(scan.ram_gb)}`,
    `- GPU: ${scan.gpu_name || "non scanné"}`,
    `- VRAM: ${formatGb(scan.vram_gb)}`,
    `- Runtime IA: ${state.scan ? ollamaRuntimeLabel(scan) : "non scanné"}`,
    "",
    "## Diagnostic",
    "",
    `- Score: ${score === null ? "non calculé" : `${score}/100`}`,
    `- Modèles compatibles affichés: ${models.length}`,
    `- Upgrades affichés: ${upgrades.length}`,
    `- Achats guides: ${buyingGuides.length}`,
    `- Machine synchronisée: ${lastSyncedMachineId || "non"}`,
    `- Benchmark session: ${state.benchmark ? "oui" : "non"}`,
    `- Vault Obsidian: ${lastVaultPath || "non exporté"}`,
    "",
    "## Upgrades principaux",
    "",
    ...(upgrades.length
      ? upgrades.slice(0, 5).map((item) => `- ${upgradeText(item)}${item.price_range_eur ? ` (${item.price_range_eur})` : ""}`)
      : ["- Aucun upgrade calculé ou diagnostic non lancé."]),
    "",
    "## Resultat manuel",
    "",
    "- [ ] Telechargement depuis la page OutilsIA OK",
    "- [ ] Installation/lancement Windows OK",
    "- [ ] SmartScreen compris/documente si affiche",
    "- [ ] Auto-test OK",
    "- [ ] Scan CPU/RAM/GPU/VRAM/stockage OK",
    "- [ ] Detection Ollama absent/present claire",
    "- [ ] Modeles compatibles lisibles",
    "- [ ] Commandes Ollama visibles",
    "- [ ] Telechargement d'un modele leger OK",
    "- [ ] Benchmark court OK",
    "- [ ] PromptForge optimise le prompt OK",
    "- [ ] Dialogue local depuis l'app OK",
    "- [ ] Deuxieme modele recommande visible OK",
    "- [ ] Installation ou benchmark du deuxieme modele OK",
    "- [ ] Arena locale OK si deux modeles disponibles",
    "- [ ] Rapport machine prete contient score/modele/vitesse/prompt/upgrade/actions",
    "- [ ] Connexion compte OK",
    "- [ ] Sync compte OK",
    "- [ ] Rapport partageable OK",
    "- [ ] MemoryForge/Obsidian OK",
    "- [ ] Suppression machine OK",
    "- [ ] Feedback beta OK"
  ];
  return lines.join("\n");
}

async function copyBetaReport() {
  const report = betaReportMarkdown();
  await navigator.clipboard.writeText(report);
  setStatus("Rapport app copié", "ok");
}

function renderReleaseFallback(manifest = state.desktopManifest || demoDesktopManifest()) {
  const downloadUrl = absoluteOutisiaUrl(manifest.download_url || "https://outilsia.fr/telecharger-scanner-ia-local");
  els.releaseTitle.textContent = `Canal ${manifest.channel || "beta"} - app ${manifest.current_version || "0.1.0"}`;
  els.releaseText.textContent = manifest.release_feed_url
    ? "Vérification du build app en attente."
    : "Page officielle disponible. Aucun flux release configuré dans ce manifeste.";
  els.releaseDownloadBtn.href = downloadUrl;
  els.releaseDownloadBtn.dataset.openUrl = downloadUrl;
  els.releaseDownloadBtn.textContent = "Page téléchargement";
  els.releaseDownloadBtn.removeAttribute("download");
}

function renderReleaseMetadata(release) {
  const manifest = state.desktopManifest || demoDesktopManifest();
  const launchedBuild = String(state.appBuildInfo?.build_id || "");
  const file = release?.primary_download;
  if (!release?.ok || !file?.url) {
    renderReleaseFallback(manifest);
    if (manifest.release_feed_url) {
      els.releaseText.textContent = "Aucun binaire public détecté pour l'instant. La page téléchargement reste la source officielle.";
    }
    return;
  }
  const url = absoluteOutisiaUrl(file.url);
  const size = formatBytes(file.size_bytes);
  const buildMismatch = Boolean(
    launchedBuild
    && !["local-dev", "browser-demo", "unknown-build"].includes(launchedBuild)
    && release.build_id
    && launchedBuild !== release.build_id
  );
  els.releaseTitle.textContent = `${release.product || "OutilsIA Local Cockpit"} ${release.label || release.version || "beta"}`;
  els.releaseText.textContent = [
    buildMismatch ? "Mise à jour disponible" : "Bêta prête",
    launchedBuild ? `lancée ${launchedBuild}` : null,
    release.build_id ? `build ${release.build_id}` : null,
    file.platform || "desktop",
    size || null,
    file.sha256 ? `sha ${shortHash(file.sha256)}` : null,
    release.published_at ? `publié ${release.published_at.slice(0, 10)}` : null
  ].filter(Boolean).join(" - ");
  els.releaseDownloadBtn.href = url;
  els.releaseDownloadBtn.dataset.openUrl = url;
  els.releaseDownloadBtn.textContent = "Télécharger l'app";
  els.releaseDownloadBtn.setAttribute("download", file.name || "");
}

async function loadReleaseMetadata() {
  const manifest = state.desktopManifest || demoDesktopManifest();
  const releaseFeedUrl = manifest.release_feed_url;
  if (!releaseFeedUrl) {
    renderReleaseFallback(manifest);
    return;
  }
  els.releaseTitle.textContent = "Vérification de la release...";
  els.releaseText.textContent = releaseFeedUrl;
  try {
    const res = await fetch(releaseFeedUrl, { cache: "no-store" });
    if (!res.ok) {
      state.release = null;
      renderReleaseMetadata(null);
      return;
    }
    const release = await res.json();
    state.release = release;
    renderReleaseMetadata(release);
  } catch (error) {
    state.release = null;
    renderReleaseFallback(manifest);
    els.releaseText.textContent = "Flux release indisponible. La page téléchargement reste accessible.";
  }
}

function selfTestLine(ok, label, detail = "") {
  return `
    <div class="${ok ? "ok" : "bad"}">
      <strong>${ok ? "OK" : "KO"} · ${escapeHtml(label)}</strong>
      ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
    </div>
  `;
}

async function runBetaSelfTest() {
  els.selfTestBtn.disabled = true;
  els.selfTestResult.className = "self-test-result";
  els.selfTestResult.textContent = "Auto-test app en cours...";
  setStatus("Auto-test app...");
  const rows = [];
  try {
    const manifest = invoke ? await invoke("fetch_desktop_manifest") : demoDesktopManifest();
    state.desktopManifest = manifest?.ok ? manifest : state.desktopManifest;
    const features = manifest?.features || {};
    const endpoints = manifest?.endpoints || {};
    rows.push(selfTestLine(Boolean(manifest?.ok), "Manifeste", `version ${manifest?.current_version || "?"}`));
    rows.push(selfTestLine(features.sync_machine === true && features.feedback === true, "Fonctions compte", "sync + feedback"));
    rows.push(selfTestLine(Boolean(endpoints.desktop_sync || features.sync_machine), "Contrat API", endpoints.desktop_sync || "/api/desktop/sync"));

    const releaseUrl = manifest?.release_feed_url || "https://outilsia.fr/static/downloads/local-cockpit/release.json";
    try {
      const releaseRes = await fetch(releaseUrl, { cache: "no-store" });
      const release = releaseRes.ok ? await releaseRes.json() : null;
      state.release = release;
      const file = release?.primary_download || {};
      rows.push(selfTestLine(Boolean(release?.ok && file.url && file.sha256), "Release publique", `${file.name || "fichier"} ${formatBytes(file.size_bytes)}`));
      if (release?.ok) renderReleaseMetadata(release);
    } catch (error) {
      rows.push(selfTestLine(false, "Release publique", String(error)));
    }

    const auth = invoke ? await invoke("get_desktop_auth") : { desktop_token: "demo" };
    if (auth?.desktop_token) {
      rows.push(selfTestLine(true, "Token desktop", "compte connecté"));
      try {
        const updates = invoke ? await invoke("fetch_desktop_updates_with_token") : demoDesktopUpdates();
        rows.push(selfTestLine(Boolean(updates?.ok), "Updates compte", `${updates?.machine_count || 0} machine(s)`));
      } catch (error) {
        rows.push(selfTestLine(false, "Updates compte", String(error)));
      }
    } else {
      rows.push(selfTestLine(true, "Token desktop", "non connecté, pairing requis"));
    }

    if (state.scan) {
      rows.push(selfTestLine(true, "Scan chargé", state.scan.gpu_name || state.scan.cpu_name || "machine"));
    } else {
      rows.push(selfTestLine(true, "Scan chargé", "pas encore lancé"));
    }

    const hasFailure = rows.some((row) => row.includes("KO ·"));
    els.selfTestResult.className = `self-test-result ${hasFailure ? "bad" : "ok"}`;
    els.selfTestResult.innerHTML = rows.join("");
    setStatus(hasFailure ? "Auto-test app avec alerte" : "Auto-test app OK", hasFailure ? "warn" : "ok");
  } catch (error) {
    els.selfTestResult.className = "self-test-result bad";
    els.selfTestResult.textContent = String(error);
    setStatus(String(error), "bad");
  } finally {
    els.selfTestBtn.disabled = false;
    await refreshAuthState().catch(() => {});
  }
}

function formatGb(value) {
  return Number.isFinite(value) ? `${value} Go` : "--";
}

function formatVram(value) {
  return Number.isFinite(value) ? `${value} Go VRAM` : "VRAM non confirmée";
}

function runtimeOllama(scan) {
  const ollama = scan?.runtimes?.ollama;
  const ollamaWsl = scan?.runtimes?.ollama_wsl;
  const extras = [];
  if (ollamaWsl?.installed) extras.push("Ollama WSL");
  if (scan?.runtimes?.llama_cpp?.installed) extras.push("llama.cpp");
  if (scan?.runtimes?.docker?.installed) extras.push("Docker");
  if (scan?.runtimes?.wsl?.installed && !ollamaWsl?.installed) extras.push("WSL détecté");
  const suffix = extras.length ? ` + ${extras.join(", ")}` : "";
  if (!ollama?.installed && ollamaWsl?.installed) return `${ollamaWsl.version || "Ollama WSL installé"}${suffix.replace(" + Ollama WSL", "")}`;
  if (!ollama?.installed) return `Ollama non détecté${suffix}`;
  return `${ollama.version || "Ollama Windows installé"}${suffix}`;
}

function topRuntimeOllama(scan) {
  const ollama = scan?.runtimes?.ollama;
  const ollamaWsl = scan?.runtimes?.ollama_wsl;
  const extras = [];
  if (ollamaWsl?.installed) extras.push("Ollama WSL");
  else if (scan?.runtimes?.wsl?.installed) extras.push("WSL détecté");
  if (scan?.runtimes?.docker?.installed) extras.push("Docker");
  if (!ollama?.installed && ollamaWsl?.installed) return extras.length ? `WSL prêt · ${extras.join(" · ")}` : "WSL prêt";
  if (!ollama?.installed) return extras.length ? `Non détecté · ${extras.join(" · ")}` : "Non détecté";
  return extras.length ? `Prêt · ${extras.join(" · ")}` : "Prêt";
}

function modelRuntimeFromSource(source) {
  const clean = String(source || "").trim().toLowerCase();
  if (clean.includes("wsl")) return "wsl";
  if (clean.includes("ollama")) return "native";
  return "";
}

function installedOllamaRuntimeFor(model, { includeOptimistic = true } = {}) {
  const clean = normalizeOllamaRef(model);
  if (!clean) return "";
  const aliases = new Set(ollamaRefAliases(clean));
  for (const installed of state.scan?.installed_models || []) {
    const ref = modelLabel(installed);
    if (!ref) continue;
    const matches = ollamaRefAliases(ref).some((alias) => aliases.has(alias));
    if (!matches) continue;
    const runtime = modelRuntimeFromSource(installed.source || installed.runtime);
    if (runtime) return runtime;
  }
  if (includeOptimistic) {
    for (const ref of state.optimisticInstalledModels || []) {
      if (ollamaRefAliases(ref).some((alias) => aliases.has(alias))) return "";
    }
  }
  return "";
}

function defaultOllamaRuntime(model = "") {
  const modelRuntime = installedOllamaRuntimeFor(model, { includeOptimistic: false });
  if (modelRuntime) return modelRuntime;
  const runtimes = state.scan?.runtimes || {};
  if (runtimes.ollama?.installed) return "native";
  if (runtimes.ollama_wsl?.installed) return "wsl";
  return "native";
}

function hasUsableOllamaRuntime(scan = state.scan) {
  return Boolean(scan?.runtimes?.ollama?.installed || scan?.runtimes?.ollama_wsl?.installed);
}

function ollamaRuntimeLabel(scan = state.scan) {
  const runtimes = scan?.runtimes || {};
  if (runtimes.ollama?.installed) return "Ollama Windows";
  if (runtimes.ollama_wsl?.installed) return "Ollama WSL";
  if (runtimes.wsl?.installed) return "WSL détecté, Ollama absent";
  return "Ollama non détecté";
}

function ollamaRuntimePayload(model = "") {
  const runtime = defaultOllamaRuntime(model);
  return runtime === "wsl" ? { runtime: "wsl" } : {};
}

function ollamaRuntimeCommandLabel(model = "") {
  return defaultOllamaRuntime(model) === "wsl" ? "wsl.exe ollama" : "ollama";
}

function wslRuntimeInfo(scan = state.scan) {
  const runtimes = scan?.runtimes || {};
  const wsl = runtimes.wsl || {};
  const nativeReady = Boolean(runtimes.ollama?.installed);
  const wslReady = Boolean(runtimes.ollama_wsl?.installed || wsl.ollama_ready);
  const wslInstalled = Boolean(wsl.installed);
  const distro = wsl.default_distribution || (Array.isArray(wsl.distributions) ? wsl.distributions[0] : "");
  const installCommand = wsl.install_command || "wsl.exe --install";
  const ollamaInstallCommand = wsl.ollama_install_command || "wsl.exe sh -lc \"curl -fsSL https://ollama.com/install.sh | sh\"";
  const testCommand = wsl.ollama_test_command || "wsl.exe ollama run qwen3:0.6b";

  if (!scan) {
    return {
      kind: "idle",
      title: "Scan requis",
      detail: "OutilsIA vérifiera si Windows natif ou WSL peut lancer Ollama.",
      command: installCommand,
      canInstall: false,
      canCopy: false
    };
  }

  if (wslReady) {
    return {
      kind: "ready",
      title: distro ? `WSL prêt · ${distro}` : "WSL prêt",
      detail: `Ollama est accessible via WSL. Commande test : ${testCommand}`,
      command: testCommand,
      canInstall: false,
      canCopy: true
    };
  }

  if (wslInstalled) {
    return {
      kind: "warning",
      title: distro ? `WSL détecté · ${distro}` : "WSL détecté",
      detail: `Installe Ollama dans ta distribution WSL si tu veux lancer les modèles côté Linux. Commande : ${ollamaInstallCommand}`,
      command: ollamaInstallCommand,
      canInstall: false,
      canCopy: true
    };
  }

  if (nativeReady) {
    return {
      kind: "ready",
      title: "Windows natif prêt",
      detail: "Ollama Windows fonctionne. WSL reste optionnel pour les workflows Linux, scripts dev et certains outils.",
      command: installCommand,
      canInstall: true,
      canCopy: true
    };
  }

  return {
    kind: "missing",
    title: "WSL non installé",
    detail: `Optionnel : installer WSL pour lancer Ollama et scripts Linux depuis Windows. Commande : ${installCommand}`,
    command: installCommand,
    canInstall: true,
    canCopy: true
  };
}

function renderWslRuntime(scan = state.scan) {
  const info = wslRuntimeInfo(scan);
  if (els.wslStateText) els.wslStateText.textContent = info.title;
  if (els.wslDetailText) els.wslDetailText.textContent = info.detail;
  const box = els.wslStateText?.closest(".runtime-wsl-box");
  if (box) {
    box.classList.toggle("is-ready", info.kind === "ready");
    box.classList.toggle("is-warning", info.kind === "warning");
    box.classList.toggle("is-missing", info.kind === "missing");
  }
  if (els.installWslBtn) {
    els.installWslBtn.disabled = !info.canInstall;
    els.installWslBtn.textContent = info.kind === "missing" ? "Installer WSL" : "Préparer WSL";
    els.installWslBtn.title = info.canInstall ? "Lance wsl.exe --install" : "WSL n'a pas besoin d'installation depuis ce panneau.";
  }
  if (els.copyWslCommandBtn) {
    els.copyWslCommandBtn.disabled = !info.canCopy;
    els.copyWslCommandBtn.dataset.command = info.command || "";
    els.copyWslCommandBtn.title = info.command || "Commande WSL indisponible";
  }
  return info;
}

function modelLabel(model) {
  const name = model.name || model.model_name || model.model || "modèle";
  const tagValue = model.tag || model.model_tag;
  const tag = tagValue ? `:${tagValue}` : "";
  return `${name}${tag}`;
}

function modelTitle(model) {
  return `${model?.name || model?.model_name || model?.model || "modèle"} ${model?.params || ""}`.trim();
}

function modelOllamaRef(model) {
  return model?.ollama
    || model?.ollama_ref
    || model?.command?.replace?.("wsl.exe ollama run ", "")?.replace?.("ollama run ", "")
    || "";
}

function modelKind(model) {
  const explicit = String(model?.kind || model?.type || model?.modality || "").toLowerCase();
  const text = `${modelTitle(model)} ${model?.params || ""} ${explicit}`.toLowerCase();
  if (/\b(video|wan)\b/.test(text)) return "video";
  if (/\b(image|stable diffusion|sdxl|flux)\b/.test(text)) return "image";
  if (/\b(audio|whisper)\b/.test(text)) return "audio";
  return "texte";
}

function modelKindLabel(model) {
  const kind = modelKind(model);
  if (kind === "image") return "Image";
  if (kind === "video") return "Vidéo";
  if (kind === "audio") return "Audio";
  return "Texte";
}

function isMediaOrNonChatModel(model) {
  return modelKind(model) !== "texte";
}

function isActionableTextModel(model) {
  if (!model || typeof model === "string") return true;
  if (model.actionable_text === false || model.actionable_ollama_text === false) return false;
  if (model.actionable_text === true || model.actionable_ollama_text === true) return true;
  return !isMediaOrNonChatModel(model);
}

function isWatchlistRuntime(model) {
  const status = String(model?.runtime_status || "").trim();
  return status === "ollama_watchlist" || status === "frontier_watchlist" || status === "ollama_frontier_available";
}

function isPilotableTextRuntime(model) {
  if (!model || typeof model === "string") return true;
  if (model.pilotable_text === false || model.pilotable_ollama_text === false) return false;
  if (model.pilotable_text === true || model.pilotable_ollama_text === true) return true;
  return !isWatchlistRuntime(model);
}

function hasValidOllamaRefFormat(ref) {
  const clean = normalizeOllamaRef(ref);
  if (!clean) return false;
  if (clean === "whisper-large-v3") return false;
  return /^[a-z0-9][a-z0-9._/-]*(?::[a-z0-9][a-z0-9._-]*)?$/.test(clean);
}

function actionableOllamaRef(model) {
  const raw = typeof model === "string" ? model : modelOllamaRef(model);
  const ref = ollamaActionRef(raw);
  if (!hasValidOllamaRefFormat(ref)) return "";
  if (typeof model !== "string" && !isActionableTextModel(model)) return "";
  if (typeof model !== "string" && !isPilotableTextRuntime(model)) return "";
  return ref;
}

function modelRequiredVram(model) {
  const value = Number(model?.vram_q4 ?? model?.vram ?? model?.vram_gb ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function modelRecencyScore(model) {
  const date = String(model?.date_added || "").trim();
  if (/^2026-07/.test(date)) return 36;
  if (/^2026-06/.test(date)) return 18;
  if (/^2026-05/.test(date)) return 8;
  return 0;
}

function isLegacyPascalMachine(scan = state.scan) {
  const gpu = String(scan?.gpu_name || "").toLowerCase();
  if (!gpu.includes("gtx")) return false;
  return /(1050|1060|1070|1080|titan x|titan xp|p100|p40|p4)\b/.test(gpu);
}

function isConstrainedLegacyMachine(scan = state.scan) {
  const ram = Number(scan?.ram_gb || 0);
  const vram = Number(scan?.vram_gb || 0);
  return isLegacyPascalMachine(scan) || (ram > 0 && ram <= 16 && (!vram || vram <= 6));
}

function effectiveModelMemoryGb(scan = state.scan) {
  const vram = Number(scan?.vram_gb || 0);
  const ram = Number(scan?.ram_gb || 0);
  if (!scan?.unified_memory) return vram;
  if (ram >= 128) return Math.max(vram, 48);
  if (ram >= 96) return Math.max(vram, 36);
  if (ram >= 64) return Math.max(vram, 24);
  if (ram >= 32) return Math.max(vram, 12);
  return vram;
}

function memoryDisplayLabel(scan = {}) {
  if (scan?.unified_memory) return `${formatGb(scan.ram_gb)} unifiée`;
  return formatGb(scan.vram_gb);
}

function isStarterModelRef(ref) {
  return normalizeOllamaRef(ref) === "qwen3:0.6b";
}

function isAmbitiousForLegacyModel(model) {
  const ref = actionableOllamaRef(model);
  const text = `${modelTitle(model)} ${ref} ${model?.params || ""}`.toLowerCase();
  if (isStarterModelRef(ref)) return false;
  if (/gemma\s*4|gemma4|12b|14b|27b|30b|32b|35b|70b|72b|109b|123b|235b/.test(text)) return true;
  const need = modelRequiredVram(model);
  return Boolean(need && need >= 9);
}

function modelRecommendationScore(model) {
  const ref = actionableOllamaRef(model);
  if (!ref) return -10000;
  const text = `${modelTitle(model)} ${ref} ${model?.use_case || ""}`.toLowerCase();
  const vram = effectiveModelMemoryGb(state.scan);
  const legacy = isConstrainedLegacyMachine();
  const need = modelRequiredVram(model);
  let score = 0;

  if (isOllamaModelInstalled(ref)) score += 80;
  if (hasSuccessfulBenchmarkFor(ref)) score += 45;
  score += modelRecencyScore(model);

  if (String(model?.runtime_status || "") === "ollama_available") score += 16;
  if (String(model?.runtime_status || "") === "ollama_watchlist") score -= 80;

  if (text.includes("gemma 4") || ref.startsWith("gemma4")) score += legacy ? -45 : 34;
  if (text.includes("ornith") || ref.startsWith("ornith")) score += 30;
  if (text.includes("qwen 3.6") || ref.startsWith("qwen3.6")) score += 28;
  if (text.includes("qwen3-coder") || text.includes("coder")) score += 22;
  if (text.includes("hermes")) score += 22;
  if (text.includes("mistral")) score += 10;

  if (/\b(7b|8b|9b|12b)\b/.test(text)) score += 16;
  if (/\b14b\b/.test(text)) score += 10;
  if (/\b(27b|30b|32b|35b)\b/.test(text)) score += vram >= 24 ? 18 : -20;
  if (/\b(70b|72b|109b|123b|235b)\b/.test(text)) score -= vram >= 48 ? 10 : 60;

  if (need && vram) {
    if (need <= vram) score += 28;
    else score -= 140;
    if (need <= vram * 0.7) score += 10;
    if (need >= vram * 0.92) score -= 8;
  }

  if (legacy && isAmbitiousForLegacyModel(model)) score -= 70;
  if (isStarterModelRef(ref)) score += legacy && !hasSuccessfulBenchmarkFor(ref) ? 110 : -70;
  return score;
}

function sortRecommendedModels(models = []) {
  return [...models].sort((left, right) => modelRecommendationScore(right) - modelRecommendationScore(left));
}

function modelActionability(model) {
  const rawRef = modelOllamaRef(model);
  const ref = actionableOllamaRef(model);
  if (ref) {
    return {
      className: "pilotable",
      label: "Pilotable dans l'app",
      detail: "LLM texte Ollama : installation, dialogue, benchmark et Arena locale."
    };
  }
  if (isWatchlistRuntime(model)) {
    return {
      className: "watchlist",
      label: "Surveillance catalogue",
      detail: "Visible pour suivre la compatibilité, sans Bench ni Dialogue tant que le runtime texte n'est pas confirmé."
    };
  }
  if (isMediaOrNonChatModel(model)) {
    return {
      className: "compat-only",
      label: "Compatibilité matériel seulement",
      detail: `${modelKindLabel(model)} : pas de commande LLM texte Ollama pilotée ici.`
    };
  }
  if (rawRef && !hasValidOllamaRefFormat(rawRef)) {
    return {
      className: "compat-only",
      label: "Commande non validée",
      detail: "Référence Ollama à vérifier avant d'autoriser Bench ou Dialogue."
    };
  }
  return {
    className: "compat-only",
    label: "Compatibilité matériel seulement",
    detail: "Aucune commande Ollama texte actionnable dans le catalogue."
  };
}

function benchmarkMatchesModel(model) {
  const ref = actionableOllamaRef(model);
  if (!state.benchmark?.model || !ref) return false;
  return sameOllamaModel(state.benchmark.model, ref);
}

function modelStatus(model, index = 0) {
  const ref = actionableOllamaRef(model);
  if (!ref) return isWatchlistRuntime(model) ? "Veille" : "Compatible";
  const installed = ref ? isOllamaModelInstalled(ref) : false;
  const installing = ref ? isOllamaModelInstalling(ref) : false;
  if (benchmarkMatchesModel(model)) return "Benchmarké";
  if (installing) return "Téléchargement";
  if (installed) return "Installé";
  if (index === 0) return "Recommandé";
  return "Compatible";
}

function renderModelActions(model, options = {}) {
  const ref = actionableOllamaRef(model);
  if (!ref) {
    const infoKey = modelOllamaRef(model) || modelTitle(model);
    const disabledLabel = isWatchlistRuntime(model) ? "À surveiller" : "Non piloté ici";
    return `
      <div class="model-actions">
        <button type="button" disabled>${escapeHtml(disabledLabel)} <span class="sr-only">Non piloté ici</span></button>
        <button type="button" data-model-info="${escapeHtml(infoKey)}">Fiche</button>
      </div>
    `;
  }
  const ollamaMissing = Boolean(state.scan && !hasUsableOllamaRuntime(state.scan));
  const installed = isOllamaModelInstalled(ref);
  const installing = isOllamaModelInstalling(ref);
  const installLocked = hasActiveInstall() && !installing;
  const buttons = [];
  if (ollamaMissing) {
    buttons.push(`<button type="button" data-install-ollama="true">Installer Ollama</button>`);
  } else if (installed) {
    buttons.push(`<button type="button" data-run-model="${escapeHtml(ref)}">Tester</button>`);
    buttons.push(`<button type="button" data-chat-model="${escapeHtml(ref)}">Dialogue</button>`);
    buttons.push(`<button type="button" data-delete-model="${escapeHtml(ref)}">Supprimer</button>`);
  } else {
    buttons.push(`<button type="button" data-install-model="${escapeHtml(ref)}" ${(installing || installLocked) ? "disabled" : ""}>${installing ? "Télécharge..." : installLocked ? "Attends" : options.primaryLabel || "Installer"}</button>`);
  }
  buttons.push(`<button type="button" data-model-info="${escapeHtml(ref)}">Fiche</button>`);
  buttons.push(`<button type="button" data-benchmark-model="${escapeHtml(ref)}" ${ollamaMissing ? "disabled" : ""}>${escapeHtml(benchmarkButtonLabel(ref))}</button>`);
  buttons.push(`<button type="button" data-copy-command="${escapeHtml(`${ollamaRuntimeCommandLabel(ref)} run ${ref}`)}">Copier</button>`);
  return `<div class="model-actions">${buttons.join("")}</div>`;
}

function benchmarkButtonLabel(ref, installedLabel = "Bench", missingLabel = "Installer + bench") {
  if (!ref || isOllamaModelInstalled(ref)) return installedLabel;
  if (isOllamaModelInstalling(ref)) return "Téléchargement...";
  return missingLabel;
}

function renderModelCard(model, index = 0, extraClass = "") {
  const rawRef = modelOllamaRef(model);
  const ref = actionableOllamaRef(model);
  const actionability = modelActionability(model);
  const status = modelStatus(model, index);
  const statusClass = status.toLowerCase().replaceAll("é", "e").replaceAll("è", "e");
  const info = modelInfo(ref || rawRef || modelTitle(model));
  const benchText = benchmarkMatchesModel(model)
    ? `Dernier test : ${state.benchmark.estimated_tokens_per_second ?? "--"} tok/s, ${state.benchmark.elapsed_ms ?? "--"} ms`
    : ref ? `Taille estimée : ${estimatedModelSizeLabel(ref)}`
      : isWatchlistRuntime(model) && rawRef
        ? `Veille catalogue : ${runtimeStatusLabel(model)}. Pas de Bench/Dialogue tant que le runtime n'est pas confirmé.`
        : "Compatible matériel, installation non pilotée par Ollama ici";
  const highlight = ref && index === 0 && !isOllamaModelInstalled(ref) ? `
      <div class="model-card-why">
        <strong>Pourquoi commencer ici</strong>
        <span>${escapeHtml(info.next)}</span>
      </div>
    ` : "";
  return `
    <div class="list-item model-card ${extraClass} status-${escapeHtml(statusClass)}">
      <div class="model-card-head">
        <strong>${escapeHtml(modelTitle(model))}</strong>
        <em>${escapeHtml(modelKindLabel(model))} · ${escapeHtml(status)}</em>
      </div>
      <div class="model-actionability ${escapeHtml(actionability.className)}">
        <strong>${escapeHtml(actionability.label)}</strong>
        <span>${escapeHtml(actionability.detail)}</span>
      </div>
      <span>${escapeHtml(modelLine(model))}</span>
      <div class="model-card-profile">
        <div><strong>Force</strong><span>${escapeHtml(info.strength)}</span></div>
        <div><strong>Usage</strong><span>${escapeHtml(info.fit)}</span></div>
        <div><strong>Limite</strong><span>${escapeHtml(info.limit)}</span></div>
      </div>
      <span>${escapeHtml(benchText)}</span>
      ${highlight}
      ${renderModelActions(model, { primaryLabel: index === 0 ? "Installer recommandé" : "Installer" })}
    </div>
  `;
}

function groupedModelCards(models = []) {
  const installed = [];
  const recommended = [];
  const compatible = [];
  for (const [index, model] of models.entries()) {
    const ref = actionableOllamaRef(model);
    if (ref && isOllamaModelInstalled(ref)) installed.push([model, index]);
    else if (ref && (index < 3 || /recommand|recommended|best|starter/i.test(String(model.status || model.label || model.tier || "")))) recommended.push([model, index]);
    else compatible.push([model, index]);
  }
  const section = (title, rows, className) => rows.length ? `
    <div class="model-group">
      <strong>${escapeHtml(title)}</strong>
      <div class="model-group-list">
        ${rows.map(([model, index]) => renderModelCard(model, index, className)).join("")}
      </div>
    </div>
  ` : "";
  return [
    section("Installés sur cette machine", installed, "installed-model-card"),
    section("Recommandés à tester", recommended, "recommended-model-card"),
    section("Compatibles ensuite", compatible.slice(0, 10), "compatible-model-card")
  ].join("");
}

function modelInfo(ref) {
  const clean = String(ref || "").toLowerCase();
  const size = estimatedModelSizeLabel(clean);
  const info = {
    title: ref || "Modèle local",
    strength: "Modèle généraliste à tester sur cette machine.",
    fit: "Questions simples, essais Ollama et comparaison locale.",
    limit: "Qualité et vitesse à valider avec un benchmark OutilsIA.",
    next: "Lance un benchmark court, puis compare avec un modèle plus ambitieux si la machine reste fluide."
  };
  if (clean.includes("qwen")) {
    info.strength = "Très bon candidat pour raisonnement court, français correct et usages techniques.";
    info.fit = clean.includes("0.6b") ? "Test léger, vieux PC, portable, validation rapide d'Ollama." : "Assistant général, code léger, résumé et tests de qualité/vitesse.";
    info.limit = clean.includes("0.6b") ? "Qualité limitée : parfait pour vérifier que tout marche, pas pour juger l'IA locale." : "Les tailles 14B+ demandent nettement plus de RAM/VRAM.";
  } else if (clean.includes("hermes")) {
    info.strength = "Bon profil assistant/persona, mémoire, style, MoA et workflows Obsidian/MemoryForge.";
    info.fit = "Hermes Agent, notes projet, assistant personnel, décisions, synthèses et actions confirmées.";
    info.limit = "Ce n'est pas forcément le premier modèle de test : commencer léger avec Qwen, puis utiliser Hermes pour mémoire/projets.";
    info.next = `Suivre Hermes Agent ${HERMES_AGENT_WATCH.version} : preuves de completion, mémoire visible, /learn et futurs subagents de benchmark.`;
  } else if (clean.includes("mistral")) {
    info.strength = "Bon compromis conversation, français et vitesse selon quantization.";
    info.fit = "Usage général, rédaction, résumé et assistant quotidien.";
    info.limit = "À comparer localement avec Qwen/Hermes sur la même machine.";
  } else if (clean.includes("llama")) {
    info.strength = "Famille très répandue, beaucoup d'outils et de variantes.";
    info.fit = "Usage général, tests de compatibilité, comparaison avec Qwen/Mistral.";
    info.limit = "La bonne taille/quantization compte plus que le nom seul.";
  } else if (clean.includes("code") || clean.includes("coder") || clean.includes("deepseek")) {
    info.strength = "Orienté programmation, explication de code et corrections simples.";
    info.fit = "Prompts code, scripts, debug court, génération de snippets.";
    info.limit = "Peut être moins agréable pour conversation générale ou mémoire personnelle.";
  }
  if (clean.includes("32b") || clean.includes("70b")) {
    info.limit = "Gros modèle : à réserver aux machines avec beaucoup de VRAM/RAM ou à une exécution très patiente.";
  } else if (clean.includes("14b")) {
    info.limit = "Palier sérieux : mieux avec 16 Go VRAM ou beaucoup de RAM selon quantization.";
  } else if (clean.includes("8b") || clean.includes("7b")) {
    info.limit = "Bon palier grand public, mais trop lourd pour certaines machines sans GPU ou avec peu de RAM.";
  }
  const vram = state.scan?.vram_gb ? `${state.scan.vram_gb} Go VRAM détectés` : "VRAM non scannée";
  const installed = isOllamaModelInstalled(ref) ? "installé" : "non installé";
  return { ...info, size, vram, installed };
}

function topRecommendedModel() {
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  const models = extractModels(compatibility);
  const vram = Number(state.scan?.vram_gb || 0);
  const candidates = models.filter((model) => actionableOllamaRef(model));
  const starter = candidates.find((model) => isStarterModelRef(actionableOllamaRef(model)));
  if (isConstrainedLegacyMachine() && starter && !hasSuccessfulBenchmarkFor(actionableOllamaRef(starter))) {
    return starter;
  }
  const safeCandidates = candidates.filter((model) => {
    const ref = `${modelTitle(model)} ${actionableOllamaRef(model)}`.toLowerCase();
    if (vram > 0 && vram < 20 && /\b(32b|70b|72b|120b|235b)\b/.test(ref)) return false;
    if (isConstrainedLegacyMachine() && isAmbitiousForLegacyModel(model)) return false;
    if (isStarterModelRef(actionableOllamaRef(model))) return false;
    return true;
  });
  const ranked = sortRecommendedModels(safeCandidates);
  return ranked[0] || candidates.find((model) => !isStarterModelRef(actionableOllamaRef(model))) || starter || candidates[0] || null;
}

function recommendedModelState() {
  const model = topRecommendedModel();
  const ref = actionableOllamaRef(model);
  const installed = ref ? isOllamaModelInstalled(ref) : false;
  const benchmarked = ref
    ? hasSuccessfulBenchmarkFor(ref)
    : false;
  return {
    model,
    ref,
    installed,
    benchmarked,
    title: model ? modelTitle(model) : "",
    info: ref ? modelInfo(ref) : null
  };
}

function modelSignalText(model) {
  const ref = `${modelTitle(model)} ${actionableOllamaRef(model)}`.toLowerCase();
  const groups = state.contentSignals?.signals || {};
  const labels = Array.isArray(groups.models) ? groups.models : [];
  const match = labels.find((item) => {
    const haystack = `${item.key || ""} ${item.label || ""}`.toLowerCase();
    return haystack && (ref.includes(String(item.key || "").toLowerCase()) || ref.includes(String(item.label || "").split("/")[0].trim().toLowerCase()));
  });
  return match ? `${match.label || match.key}${match.count ? ` (${match.count})` : ""}` : "";
}

function modelOfMomentState() {
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  const models = extractModels(compatibility).filter((model) => actionableOllamaRef(model));
  const profile = currentUsageProfile();
  const recommended = recommendedModelState();
  const newModels = compatibility.new || compatibility.new_models || [];
  const newLabels = Array.isArray(newModels) ? newModels.map((model) => `${modelTitle(model)} ${actionableOllamaRef(model)}`.toLowerCase()) : [];
  const scoreCandidate = (model) => {
    const ref = actionableOllamaRef(model);
    const text = `${modelTitle(model)} ${ref}`.toLowerCase();
    let score = modelRecommendationScore(model);
    if (recommended.ref && sameOllamaModel(ref, recommended.ref)) score += 60;
    if (modelSignalText(model)) score += 35;
    if (newLabels.some((label) => label && (label.includes(text.split(":")[0]) || text.includes(label.split(":")[0])))) score += 20;
    if (profile.key === "portable" && /0\.6b|mini|3b|7b|8b|qwen|phi/i.test(text)) score += 30;
    if (isConstrainedLegacyMachine() && isStarterModelRef(ref) && !hasSuccessfulBenchmarkFor(ref)) score += 130;
    if (isConstrainedLegacyMachine() && isAmbitiousForLegacyModel(model)) score -= 95;
    if (profile.key === "memory" && /hermes/i.test(text)) score += 30;
    if (profile.key === "code" && /qwen|deepseek|code|coder/i.test(text)) score += 25;
    if (profile.key === "french" && /mistral|qwen|hermes/i.test(text)) score += 20;
    if (isOllamaModelInstalled(ref)) score += 18;
    if (hasSuccessfulBenchmarkFor(ref)) score += 20;
    if (isStarterModelRef(ref) && profile.key !== "portable" && !isConstrainedLegacyMachine()) score -= 45;
    if (/\b(32b|70b|72b|109b|123b|235b)\b/i.test(text) && Number(state.scan?.vram_gb || 0) < 24) score -= 35;
    return score;
  };
  const fallback = recommended.model || models[0] || null;
  const model = models.length ? [...models].sort((left, right) => scoreCandidate(right) - scoreCandidate(left))[0] : fallback;
  const ref = actionableOllamaRef(model);
  const installed = ref ? isOllamaModelInstalled(ref) : false;
  const benchmarked = ref ? hasSuccessfulBenchmarkFor(ref) : false;
  const signal = model ? modelSignalText(model) : "";
  const reason = signal
    ? `Signal catalogue : ${signal}.`
    : profile.key === "portable"
      ? "Profil vieux PC : priorité au modèle léger et mesurable."
      : "Choix issu du diagnostic et des modèles compatibles.";
  return {
    model,
    ref,
    title: model ? modelTitle(model) : "Après scan",
    installed,
    benchmarked,
    signal,
    reason,
    profile
  };
}

function renderModelOfMomentCard() {
  const moment = modelOfMomentState();
  if (!moment.ref) {
    return `
      <div class="moment-model-card empty">
        <span class="label">Modèle du moment</span>
        <strong>Scan requis</strong>
        <p>OutilsIA affichera le modèle à essayer selon le catalogue vivant et la machine.</p>
      </div>
    `;
  }
  const action = moment.installed
    ? moment.benchmarked
      ? `<button type="button" data-post-install-chat="${escapeHtml(moment.ref)}">Dialoguer</button>`
      : `<button type="button" data-benchmark-model="${escapeHtml(moment.ref)}">${escapeHtml(benchmarkButtonLabel(moment.ref, "Tester maintenant", "Installer + tester"))}</button>`
    : `<button type="button" data-install-model="${escapeHtml(moment.ref)}">Installer</button>`;
  return `
    <div class="moment-model-card">
      <div>
        <span class="label">Modèle du moment</span>
        <strong>${escapeHtml(moment.title)}</strong>
        <p>${escapeHtml(moment.reason)} ${escapeHtml(moment.profile.label)} · ${escapeHtml(moment.installed ? moment.benchmarked ? "installé et mesuré" : "installé" : "à installer")}</p>
      </div>
      <div class="moment-model-actions">
        <span>${escapeHtml(moment.ref)}</span>
        ${action}
      </div>
    </div>
  `;
}

function preferredModelCommand(models = []) {
  const recommended = recommendedModelState();
  if (recommended.ref) {
    return {
      title: recommended.title || recommended.ref,
      ref: recommended.ref,
      command: `${ollamaRuntimeCommandLabel(recommended.ref)} run ${recommended.ref}`,
      installed: Boolean(recommended.installed),
      benchmarked: Boolean(recommended.benchmarked)
    };
  }
  const model = (Array.isArray(models) ? models : []).find((item) => actionableOllamaRef(item));
  const ref = actionableOllamaRef(model);
  return ref ? {
    title: modelTitle(model),
    ref,
    command: `${ollamaRuntimeCommandLabel(ref)} run ${ref}`,
    installed: isOllamaModelInstalled(ref),
    benchmarked: hasSuccessfulBenchmarkFor(ref)
  } : null;
}

function primaryActionState() {
  const flow = prepareFlowState();
  const recommended = recommendedModelState();
  const runtime = runtimeReadinessState(flow.testModel);

  if (!flow.scanned) {
    return {
      key: "scan",
      label: "Scanner ce PC",
      detail: "15 secondes",
      status: "Scan local : CPU, RAM, GPU, VRAM, stockage et Ollama.",
      command: "scan"
    };
  }
  if (!flow.ollamaReady) {
    return {
      key: "install-ollama",
      label: "Installer Ollama puis tester",
      detail: "moteur local",
      status: "Ollama manque : installe le moteur local, puis relance le scan.",
      command: "prepare"
    };
  }
  if (!flow.modelReady) {
    return {
      key: "install-test-model",
      label: "Installer le modèle de test",
      detail: flow.testModel,
      status: `${flow.testModel} vérifie que téléchargement, lancement et benchmark fonctionnent.`,
      command: "install-test"
    };
  }
  if (!flow.benchmarkReady) {
    if (runtime.key === "cuda-blocked") {
      return {
        key: "benchmark-test-cpu",
        label: "Retester sans GPU",
        detail: flow.testModel,
        status: "Le test CPU dira si le blocage vient bien du pilote CUDA et non du modèle.",
        command: "benchmark-test-cpu"
      };
    }
    return {
      key: "benchmark-test",
      label: "Lancer le benchmark recommandé",
      detail: flow.testModel,
      status: "Première preuve locale : temps de réponse, tokens/s et résultat lisible.",
      command: "benchmark-test"
    };
  }
  if (runtime.key === "cpu-only") {
    const intelligence = runtimeDriverIntelligence(state.scan || {});
    if (intelligence.remediation.recommended && intelligence.remediation.official_url) {
      return {
        key: "open-gpu-driver",
        label: "Vérifier le pilote GPU officiel",
        detail: "CPU validé",
        status: `${intelligence.verdict.label}. Ouvre uniquement la page officielle, puis relance le benchmark automatique.`,
        command: "open-gpu-driver"
      };
    }
  }
  if (recommended.ref && !recommended.installed) {
    return {
      key: "install-recommended",
      label: "Installer le modèle recommandé",
      detail: recommended.ref,
      status: `${recommended.title} est le prochain modèle utile proposé par OutilsIA.`,
      command: "install-recommended",
      model: recommended.ref
    };
  }
  if (recommended.ref && recommended.installed && !recommended.benchmarked) {
    return {
      key: "benchmark-recommended",
      label: "Comparer le modèle recommandé",
      detail: recommended.ref,
      status: "Le modèle conseillé est installé : mesure-le sur cette machine.",
      command: "benchmark-recommended",
      model: recommended.ref
    };
  }
  if (!flow.arenaReady && arenaInstalledCandidates().length >= 2) {
    return {
      key: "arena",
      label: "Comparer les modèles",
      detail: "Arena locale",
      status: "Le test marche : compare les modèles installés sur cette machine.",
      command: "arena"
    };
  }
  if (!flow.reportReady) {
    return {
      key: "report",
      label: "Générer le rapport final",
      detail: "MemoryForge",
      status: "Preuve obtenue : génère le rapport final.",
      command: "report"
    };
  }
  return {
    key: "save",
    label: "Sauvegarder ce PC",
    detail: "rapport",
    status: "Preuve locale obtenue : sauvegarde ou compare un autre modèle.",
    command: "save"
  };
}

function renderPrimaryAction() {
  if (!els.prepareBtn) return;
  const action = primaryActionState();
  const label = els.prepareBtn.querySelector("span");
  const detail = els.prepareBtn.querySelector("small");
  els.prepareBtn.classList.toggle("is-busy", primaryAnalysisBusy);
  if (label) label.textContent = primaryAnalysisBusy ? "Analyse en cours..." : state.scan ? "Actualiser l'analyse" : "Analyser ce PC";
  if (detail) detail.textContent = primaryAnalysisBusy ? "détection matériel et modèles" : "scan matériel + modèles";
  els.prepareBtn.dataset.primaryCommand = "analyze";
  delete els.prepareBtn.dataset.primaryModel;
  els.prepareBtn.title = "Analyse le matériel, détecte Ollama et charge les recommandations modèles.";
  if (els.statusText && !els.statusText.className.includes("bad")) {
    els.statusText.textContent = state.scan
      ? state.compatibility ? "Analyse prête : matériel et modèles détectés" : "Scan terminé : recommandations à charger"
      : "Prêt à analyser ce PC";
  }
  renderStickyAction(action);
  renderEssentialFocus(action);
  renderQuickDecision(action);
}

function renderStickyAction(action = primaryActionState()) {
  if (els.stickyActionStrip) {
    els.stickyActionStrip.hidden = !state.scan;
  }
  if (els.stickyActionText) els.stickyActionText.textContent = action.label;
  if (els.stickyActionDetail) els.stickyActionDetail.textContent = action.status;
  if (els.stickyActionBtn) {
    els.stickyActionBtn.textContent = action.label;
    els.stickyActionBtn.title = action.status;
    els.stickyActionBtn.dataset.primaryCommand = action.command;
    if (action.model) els.stickyActionBtn.dataset.primaryModel = action.model;
    else delete els.stickyActionBtn.dataset.primaryModel;
  }
  if (els.quickActionBtn) {
    els.quickActionBtn.textContent = state.scan ? action.label : "Analyser ce PC";
    els.quickActionBtn.title = state.scan ? action.status : "Analyse le matériel, détecte Ollama et charge les recommandations modèles.";
    els.quickActionBtn.dataset.primaryCommand = state.scan ? action.command : "analyze";
    if (state.scan && action.model) els.quickActionBtn.dataset.primaryModel = action.model;
    else delete els.quickActionBtn.dataset.primaryModel;
    els.quickActionBtn.disabled = Boolean(primaryAnalysisBusy);
  }
}

function renderEssentialFocus(action = primaryActionState()) {
  if (els.appShell) {
    els.appShell.dataset.primaryAction = action.key || "";
  }
  const flow = prepareFlowState();
  const proofBenchmark = successfulBenchmarkFor(flow.testModel);
  const focusedPanel = (() => {
    if (action.key === "benchmark-test" || action.key === "benchmark-recommended") return els.benchmarkPanel;
    if (action.key === "promptforge") return els.promptForgePanel;
    if (action.key === "chat") return els.chatPanel;
    if (action.key === "report" || action.key === "save") return els.readinessPanel;
    if (proofBenchmark?.success) return els.benchmarkPanel;
    return null;
  })();
  for (const panel of [els.benchmarkPanel, els.promptForgePanel, els.chatPanel, els.readinessPanel]) {
    if (!panel) continue;
    panel.classList.toggle("essential-active-panel", panel === focusedPanel);
  }
}

function renderQuickDecision(action = primaryActionState()) {
  if (!els.quickActionText) return;
  const flow = prepareFlowState();
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  const score = normalizeScore(compatibility.score ?? compatibility.compatibility_score ?? null);
  const upgrades = compatibility.upgrades || compatibility.recommended_upgrades || compatibility.shopping_list || [];
  const upgrade = upgrades.find((item) => item && typeof item === "object") || null;
  const benchmark = successfulBenchmarkFor(flow.testModel);
  const runtime = runtimeReadinessState(flow.testModel);
  const recommended = flow.recommended;
  const recommendedLabel = recommended?.ref
    ? `${recommended.title || "Modèle"}`
    : state.scan ? "Modèle test léger" : "Après scan";
  const recommendedDetail = recommended?.ref
    ? `${recommended.ref} · ${recommended.installed ? recommended.benchmarked ? "benchmarké" : "installé" : "à installer"}`
    : state.scan ? `${flow.testModel} pour valider Ollama` : "OutilsIA affichera quoi installer.";
  const proofLabel = runtime.key === "cuda-blocked"
    ? "GPU/CUDA bloqué"
    : benchmark?.success
      ? `${benchmark.model || flow.testModel}`
      : flow.benchmarkReady ? "Preuve obtenue" : "À obtenir";
  const proofDetail = runtime.key === "cuda-blocked"
    ? runtime.detail
    : benchmark?.success
      ? `${benchmark.estimated_tokens_per_second || 0} tok/s · ${benchmark.elapsed_ms || 0} ms · ${String(benchmark.execution_mode || "auto") === "cpu" ? "CPU seul" : "mode automatique"}`
      : flow.modelReady ? "Lance un benchmark court visible dans l'app." : "Installe le modèle test puis mesure.";
  const upgradeLabel = upgrade?.label || upgrade?.name || (state.scan ? "Aucun achat urgent" : "Pas encore");
  const upgradeDetail = upgrade?.reason || upgrade?.price_range_eur || (state.scan ? "Teste d'abord, achète seulement si un blocage est prouvé." : "Aucun achat avant diagnostic.");
  els.quickActionText.textContent = state.scan ? action.label : "Analyser ce PC";
  els.quickActionDetail.textContent = state.scan
    ? `${score === null ? "Potentiel à calculer" : `Potentiel matériel ${score}/100`} · Runtime : ${runtime.label}. ${action.status}`
    : localCapabilitySentence(compatibility);
  els.quickModelText.textContent = recommendedLabel;
  els.quickModelDetail.textContent = recommendedDetail;
  const moment = modelOfMomentState();
  if (els.quickMomentText) {
    els.quickMomentText.textContent = moment.ref ? moment.title : "Après scan";
    els.quickMomentDetail.textContent = moment.ref
      ? `${moment.ref} · ${moment.signal || moment.profile.label} · ${moment.installed ? moment.benchmarked ? "mesuré" : "installé" : "à tester"}`
      : "Le catalogue vivant choisira un modèle récent compatible.";
  }
  const momentRedundant = Boolean(moment.ref && recommended?.ref && sameOllamaModel(moment.ref, recommended.ref));
  els.quickDecisionStrip?.classList.toggle("moment-redundant", momentRedundant);
  els.quickProofText.textContent = proofLabel;
  els.quickProofDetail.textContent = proofDetail;
  els.quickUpgradeText.textContent = upgradeLabel;
  els.quickUpgradeDetail.textContent = upgradeDetail;
}

function localCapabilitySentence(compatibility = {}) {
  if (!state.scan) return "Lance le scan matériel. OutilsIA détecte CPU, RAM, GPU, VRAM, Ollama et modèles locaux.";
  const model = topRecommendedModel();
  const title = model ? modelTitle(model) : "";
  const compatibleCount = [
    ...(compatibility.installed_models || []),
    ...(compatibility.recommended_models || []),
    ...(compatibility.compatible_models || []),
    ...(compatibility.near_models || [])
  ].length;
  const installedCount = state.scan?.installed_models?.length || 0;
  const gpu = gpuDisplayLabel(state.scan);
  const vram = state.scan?.vram_gb == null ? "VRAM non déterminée" : `${formatGb(state.scan.vram_gb)} VRAM`;
  const ram = state.scan?.ram_gb ? `${formatGb(state.scan.ram_gb)} RAM` : "RAM à confirmer";
  const runtime = ollamaRuntimeLabel(state.scan);
  const modelPart = title ? ` Modèle conseillé : ${title}.` : "";
  return `${gpu}. ${vram} · ${ram} · ${runtime} · ${installedCount} modèle(s) installé(s). ${compatibleCount || "Des"} modèle(s) compatibles.${modelPart}`;
}

function showModelInfo(ref) {
  const info = modelInfo(ref);
  const html = `
    <div class="benchmark-card model-info-card">
      <strong>${escapeHtml(info.title)}</strong>
      <span>Statut : ${escapeHtml(info.installed)} · ${escapeHtml(info.vram)}</span>
      <span>Force : ${escapeHtml(info.strength)}</span>
      <span>Adapté à : ${escapeHtml(info.fit)}</span>
      <span>Limite : ${escapeHtml(info.limit)}</span>
      <span>Taille estimée : ${escapeHtml(info.size)}</span>
      <span>Suite : ${escapeHtml(info.next)}</span>
    </div>
  `;
  if (els.arenaBox && !els.arenaBox.classList.contains("empty")) {
    els.arenaBox.querySelector(".model-info-card")?.remove();
    els.arenaBox.insertAdjacentHTML("afterbegin", html);
  } else {
    els.benchmarkResult.innerHTML = html;
  }
  setStatus(`Fiche modèle ${ref}`, "ok");
}

function formatDoctorNumber(value, suffix = "") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const rounded = Math.round(number * 10) / 10;
  return `${rounded}${suffix}`;
}

function parseMajorVersion(value) {
  const match = String(value || "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function gpuConfidenceLabel(probe = {}, scan = {}) {
  const source = String(probe.source || "").toLowerCase();
  const vramConfidence = String(probe.vram_confidence || "");
  if (source === "nvidia-smi") return "GPU NVIDIA mesuré par nvidia-smi";
  if (source.includes("videocontroller")) return vramConfidence === "unknown_win32_32bit_limit"
    ? "GPU détecté par Windows, VRAM inconnue (limite Win32 32 bits)"
    : "GPU détecté par Windows, VRAM estimée";
  if (source.startsWith("lspci")) return "GPU détecté par Linux, VRAM à confirmer";
  if (source === "system_profiler") return scan?.unified_memory ? "Mémoire unifiée détectée, VRAM dédiée non applicable" : "GPU macOS détecté, mémoire à confirmer";
  if (source === "not_detected" || source === "none") return "Détection GPU non concluante, état CPU/GPU inconnu";
  return source ? `Source ${source}, à confirmer par benchmark` : "Source GPU inconnue";
}

function gpuProbeIsUnknown(scan = {}, probe = scan?.raw_scan?.gpu_probe || {}) {
  const source = String(probe.source || "").toLowerCase();
  return !scan?.gpu_name
    && scan?.vram_gb == null
    && (!source || source === "not_detected" || source === "none");
}

function gpuDisplayLabel(scan = {}) {
  if (scan?.gpu_name) return scan.gpu_name;
  if (scan?.vram_gb === 0 && String(scan?.gpu_category || "").toLowerCase() === "cpu-only") {
    return "Aucun GPU dédié déclaré";
  }
  return "GPU non déterminé";
}

function memoryChannelLabel(memory = {}) {
  const mode = String(memory.channel_mode || "unknown");
  if (mode === "multiple_modules_detected") return "canal inconnu · plusieurs modules";
  if (mode === "single_module_detected") return "canal inconnu · un module";
  if (mode === "dual_channel_estimated") return "dual estimé historique · non confirmé";
  if (mode === "multi_channel_estimated") return "multi estimé historique · non confirmé";
  if (mode === "single_channel_estimated") return "single estimé historique · non confirmé";
  return "canal inconnu";
}

function memoryConfidenceLabel(memory = {}) {
  const confidence = String(memory.confidence || "");
  if (confidence === "estimated_from_populated_modules") return "Canal/fréquence estimés depuis les barrettes détectées";
  if (confidence === "module_layout_only") return "Barrettes et fréquence détectées, mode canal non confirmé";
  if (confidence === "capacity_only") return "Capacité RAM seule, canal et fréquence non confirmés";
  return confidence ? confidence.replaceAll("_", " ") : "Confiance mémoire inconnue";
}

function vramConfidenceSuffix(probe = {}, scan = {}) {
  const source = String(probe.source || "").toLowerCase();
  const confidence = String(probe.vram_confidence || "");
  if (source === "nvidia-smi") return "mesurés";
  if (scan?.unified_memory) return "mémoire unifiée";
  if (confidence === "unknown_win32_32bit_limit") return "non mesurés (limite Win32)";
  if (source.includes("videocontroller")) return "estimés";
  if (source === "not_detected" || source === "none") return "non mesurés";
  return "à confirmer";
}

function detectedGpuVendor(scan = {}, probe = scan?.raw_scan?.gpu_probe || {}) {
  const vendor = String(probe.vendor || scan.gpu_vendor || "").toLowerCase();
  const name = String(probe.name || scan.gpu_name || "").toLowerCase();
  if (vendor.includes("nvidia") || /\b(rtx|gtx|quadro|tesla)\b/.test(name)) return "nvidia";
  if (vendor.includes("amd") || vendor.includes("radeon") || /\b(radeon|rx\s?\d|instinct)\b/.test(name)) return "amd";
  if (vendor.includes("intel") || name.includes("intel")) return "intel";
  if (name.includes("apple")) return "apple";
  return "";
}

function runtimeDriverSource(sourceId) {
  if (!sourceId) return null;
  const source = RUNTIME_DRIVER_MATRIX.sources?.[sourceId];
  return source ? { id: sourceId, ...source } : null;
}

function gpuDriverLink(scan = {}, probe = scan?.raw_scan?.gpu_probe || {}) {
  const vendor = detectedGpuVendor(scan, probe);
  const vendorPolicy = RUNTIME_DRIVER_MATRIX.vendors?.[vendor] || {};
  const source = runtimeDriverSource(vendorPolicy.official_driver_source_id);
  if (!source?.url) return null;
  const label = vendor === "intel"
    ? "Pilote Intel officiel · vérifier OEM"
    : `Pilote ${vendorPolicy.label || vendor.toUpperCase()} officiel`;
  return {
    label,
    url: source.url,
    source_id: source.id,
    checked_at: source.checked_at || "",
    automatic_install: false,
    explicit_consent_required: true,
    oem_warning: vendor === "intel"
  };
}

function runtimeDriverOsKey(scan = {}) {
  const os = `${scan.os_name || ""} ${scan.os_version || ""}`.toLowerCase();
  if (os.includes("windows")) return "windows";
  if (os.includes("linux") || os.includes("ubuntu") || os.includes("debian")) return "linux";
  if (os.includes("mac") || os.includes("darwin")) return "macos";
  return "unknown";
}

function runtimeDriverFamily(scan = {}, vendor = detectedGpuVendor(scan)) {
  const name = `${scan.gpu_name || ""} ${scan.cpu_name || ""}`.toLowerCase();
  const families = RUNTIME_DRIVER_MATRIX.vendors?.[vendor]?.families || [];
  return families.find((family) => (family.match_contains || []).some((needle) => name.includes(String(needle).toLowerCase()))) || null;
}

function nvidiaPublicDriverMajor(probe = {}) {
  const major = parseMajorVersion(probe.driver_version);
  if (!major) return null;
  return String(probe.source || "").toLowerCase() === "nvidia-smi" || major >= 100 ? major : null;
}

function runtimeDriverAccelerationExpected(scan = {}) {
  const probe = scan?.raw_scan?.gpu_probe || {};
  if (gpuProbeIsUnknown(scan, probe)) return false;
  const vendor = detectedGpuVendor(scan, probe);
  const family = runtimeDriverFamily(scan, vendor);
  if (vendor === "nvidia" || vendor === "apple") return true;
  if (vendor === "amd") return Boolean(scan.unified_memory || Number(scan.vram_gb || probe.vram_gb || 0) > 0 || family);
  if (vendor === "intel") return family?.id === "arc";
  return false;
}

function runtimeDriverIntelligence(scan = {}, options = {}) {
  const probe = scan?.raw_scan?.gpu_probe || {};
  const os = runtimeDriverOsKey(scan);
  const gpuUnknown = gpuProbeIsUnknown(scan, probe);
  const detectedVendor = detectedGpuVendor(scan, probe);
  const vendor = detectedVendor || (gpuUnknown ? "unknown" : "cpu");
  const vendorPolicy = RUNTIME_DRIVER_MATRIX.vendors?.[vendor] || {};
  const family = runtimeDriverFamily(scan, vendor);
  const gpuName = String(scan.gpu_name || probe.name || "");
  const gpuNameLower = gpuName.toLowerCase();
  const driverLink = gpuDriverLink(scan, probe);
  const runtimeEvidence = options.runtimeEvidence || doctorRuntimeEvidence(scan, options.model || "qwen3:0.6b");
  const wsl = scan.runtimes?.wsl || {};
  let backend = vendorPolicy.default_backend || "cpu";
  let supportTier = vendor === "cpu" ? "stable" : "unknown";
  let frameworkTier = "not_assessed";
  let supportNote = "Compatibilité non déterminée : le benchmark local reste nécessaire.";
  let minimumDriverMajor = null;
  let driverStatus = probe.driver_version ? "detected" : "unknown";

  if (vendor === "nvidia") {
    minimumDriverMajor = Number(vendorPolicy.ollama?.[os]?.minimum_driver_major || vendorPolicy.ollama?.windows?.minimum_driver_major || 0) || null;
    supportTier = family?.support_tier || vendorPolicy.ollama?.[os]?.tier || "stable";
    supportNote = family?.note || "CUDA est documenté par Ollama pour les GPU NVIDIA compatibles ; l'offload doit encore être mesuré.";
    const publicDriverMajor = nvidiaPublicDriverMajor(probe);
    if (publicDriverMajor && minimumDriverMajor && publicDriverMajor < minimumDriverMajor) driverStatus = "below_minimum";
  } else if (vendor === "amd") {
    if (family?.id === "strix_halo") {
      if (os === "linux") {
        backend = family.preferred_linux_backend || "rocm";
        supportTier = family.linux_ollama_tier || "stable_on_listed_hardware";
      } else {
        backend = family.preferred_windows_backend || "vulkan";
        supportTier = family.windows_ollama_tier || "experimental";
        frameworkTier = family.windows_framework_rocm_tier || "not_assessed";
      }
      supportNote = family.note;
    } else if (os === "windows" && (vendorPolicy.windows_stable_match_contains || []).some((needle) => gpuNameLower.includes(needle))) {
      backend = "rocm";
      supportTier = "stable_on_listed_hardware";
      supportNote = "Cette famille apparaît dans la liste ROCm Windows stable d'Ollama ; le benchmark doit confirmer l'offload.";
    } else if (os === "linux" && probe.rocm_version) {
      backend = "rocm";
      supportTier = "runtime_detected_hardware_unverified";
      supportNote = "ROCm est détecté, mais la présence du runtime ne prouve ni la liste matérielle Ollama ni l'offload du modèle.";
    } else {
      backend = "vulkan";
      supportTier = "experimental";
      supportNote = "Vulkan peut étendre le support AMD avec OLLAMA_VULKAN=1, mais ce backend reste expérimental dans Ollama.";
    }
  } else if (vendor === "intel") {
    backend = "vulkan";
    supportTier = "experimental";
    supportNote = "Ollama classe Vulkan comme expérimental. Le pilote OEM peut être préférable au pilote générique Intel.";
  } else if (vendor === "apple") {
    backend = "metal";
    supportTier = "stable";
    supportNote = "Metal est le backend stable Ollama sur Apple Silicon.";
  } else if (vendor === "cpu") {
    backend = "cpu";
    supportTier = "stable";
    supportNote = "Le chemin CPU est valide ; aucune accélération GPU ne doit être inventée.";
  }

  const apiValue = backend === "cuda"
    ? probe.cuda_version || ""
    : backend === "rocm"
      ? probe.rocm_version || ""
      : backend === "vulkan"
        ? probe.vulkan_version || ""
        : backend === "metal"
          ? "plateforme macOS"
          : "";
  const apiPolicy = RUNTIME_DRIVER_MATRIX.backends?.[backend] || {};
  const accelerationExpected = runtimeDriverAccelerationExpected(scan);
  const actualGpu = runtimeEvidence.status === "gpu-proven" || runtimeEvidence.status === "hybrid-proven";
  const cpuFallback = runtimeEvidence.status === "cpu-proven" || runtimeEvidence.status === "cpu-fallback-only";
  const remediationRecommended = Boolean(
    driverLink
    && accelerationExpected
    && (driverStatus === "below_minimum" || (!probe.driver_version && backend !== "vulkan") || (cpuFallback && supportTier !== "experimental"))
  );

  let verdict = {
    key: vendor === "unknown" ? "unknown" : vendor === "cpu" ? "cpu_path" : "supported_unverified",
    label: vendor === "unknown" ? "GPU/runtime inconnus" : vendor === "cpu" ? "Chemin CPU valide" : "Support documenté · à mesurer",
    detail: supportNote,
    tone: vendor === "unknown" ? "warn" : "neutral"
  };
  if (actualGpu) {
    verdict = {
      key: runtimeEvidence.status,
      label: runtimeEvidence.status === "gpu-proven" ? "GPU réellement utilisé" : "CPU/GPU réellement utilisés",
      detail: `${runtimeEvidence.gpu_offload_percent.toFixed(1)} % du modèle observés en VRAM via Ollama /api/ps.`,
      tone: "ok"
    };
  } else if (driverStatus === "below_minimum") {
    verdict = {
      key: "driver_below_minimum",
      label: "Pilote NVIDIA trop ancien pour la règle Ollama",
      detail: `Pilote ${probe.driver_version}; seuil documenté ${minimumDriverMajor}+ pour cette matrice.`,
      tone: "bad"
    };
  } else if (cpuFallback && accelerationExpected) {
    verdict = {
      key: "cpu_fallback",
      label: supportTier === "experimental" ? "CPU observé · backend GPU expérimental" : "CPU observé malgré un GPU compatible",
      detail: supportTier === "experimental"
        ? `${supportNote} Aucun défaut de pilote n'est affirmé sans autre preuve.`
        : "Le modèle fonctionne, mais Ollama n'a pas alloué de VRAM lors de la mesure.",
      tone: "warn"
    };
  } else if (supportTier === "legacy_supported") {
    verdict = { key: "legacy_supported", label: "GPU legacy encore pris en charge", detail: supportNote, tone: "warn" };
  } else if (supportTier === "experimental") {
    verdict = { key: "experimental_unverified", label: "Backend expérimental · à mesurer", detail: supportNote, tone: "warn" };
  } else if (apiValue) {
    verdict = {
      key: "api_reported_runtime_unverified",
      label: `${apiPolicy.label || backend.toUpperCase()} signalé · offload non prouvé`,
      detail: apiPolicy.reported_signal_meaning || supportNote,
      tone: "neutral"
    };
  }

  const sourceIds = new Set([
    ...(apiPolicy.source_ids || []),
    ...(family?.source_ids || []),
    vendorPolicy.official_driver_source_id,
    vendorPolicy.oem_driver_warning_source_id,
    os === "windows" && wsl.installed ? "microsoft_wsl_gpu" : null
  ].filter(Boolean));
  const measuredVram = numberOrNull(scan.vram_gb ?? probe.vram_gb);
  const dedicatedVram = scan.unified_memory || !(measuredVram > 0) ? null : measuredVram;
  const sharedSystemMemory = scan.unified_memory ? numberOrNull(scan.ram_gb) : null;
  return {
    schema: "outilsia.runtime_driver_intelligence.v1",
    matrix_schema: RUNTIME_DRIVER_MATRIX.schema,
    matrix_version: RUNTIME_DRIVER_MATRIX.version,
    matrix_updated_at: RUNTIME_DRIVER_MATRIX.updated_at,
    matrix_review_after: RUNTIME_DRIVER_MATRIX.review_after,
    assessed_at: new Date().toISOString(),
    vendor,
    vendor_label: vendorPolicy.label || (vendor === "unknown" ? "Inconnu" : vendor.toUpperCase()),
    family: family ? {
      id: family.id,
      label: family.label,
      support_tier: family.support_tier || supportTier,
      compute_capability: family.compute_capability || "",
      cuda_toolkit_max: family.cuda_toolkit_max || "",
      last_driver_branch: family.last_driver_branch || "",
      memory_model: family.memory_model || ""
    } : null,
    os,
    backend: {
      recommended: backend,
      label: apiPolicy.label || backend.toUpperCase(),
      ollama_support_tier: supportTier,
      framework_support_tier: frameworkTier,
      opt_in_environment: apiPolicy.opt_in_environment || (backend === "vulkan" ? "OLLAMA_VULKAN=1" : "")
    },
    driver: {
      status: driverStatus,
      version: probe.driver_version || "",
      date: probe.driver_date || "",
      provider: probe.driver_provider || "",
      kernel_driver: probe.kernel_driver || "",
      minimum_major: minimumDriverMajor,
      official_url: driverLink?.url || "",
      official_label: driverLink?.label || "",
      automatic_install_supported: false,
      explicit_consent_required: true,
      silent_elevation: false,
      oem_warning: Boolean(driverLink?.oem_warning),
      installation_plan: {
        mode: "manual_official_source",
        preflight: [
          "Noter la version actuelle et fermer les charges IA.",
          vendor === "intel" ? "Vérifier d'abord si le constructeur du PC fournit un pilote OEM personnalisé." : "Confirmer le modèle exact du GPU sur la page constructeur.",
          "Créer un point de restauration ou identifier la procédure de retour arrière du système."
        ],
        verification: [
          "Télécharger uniquement depuis la source officielle.",
          "Vérifier l'éditeur de la signature du paquet ; utiliser le hash constructeur lorsqu'il est publié.",
          "Relancer le scan puis le même benchmark pour comparer avant/après."
        ],
        rollback: "Restaurer le pilote précédent via le système ou le gestionnaire de paquets si stabilité ou performances régressent.",
        artifact_url: "",
        artifact_sha256: "",
        elevation_requested_by_outilsia: false
      }
    },
    api_signal: {
      key: backend,
      label: apiPolicy.label || backend.toUpperCase(),
      status: apiValue ? "reported" : "not_detected",
      value: apiValue,
      is_runtime_proof: false,
      meaning: apiPolicy.reported_signal_meaning || "Signal de plateforme uniquement ; le benchmark reste nécessaire."
    },
    api_capabilities: {
      cuda: {
        status: probe.cuda_version ? "reported_driver_max" : vendor === "nvidia" ? "not_detected" : "not_applicable",
        value: probe.cuda_version || "",
        is_runtime_proof: false,
        ollama_backend: vendor === "nvidia"
      },
      rocm_hip: {
        status: probe.rocm_version ? "runtime_reported" : vendor === "amd" ? "not_detected" : "not_applicable",
        value: probe.rocm_version || "",
        is_runtime_proof: false,
        ollama_backend: vendor === "amd"
      },
      vulkan: {
        status: probe.vulkan_version ? "loader_reported" : ["amd", "intel"].includes(vendor) ? "not_detected" : "not_applicable",
        value: probe.vulkan_version || "",
        is_runtime_proof: false,
        ollama_backend: ["amd", "intel"].includes(vendor),
        ollama_support_tier: "experimental"
      },
      directml: {
        status: os === "windows" ? "not_probed" : "not_applicable",
        value: "",
        is_runtime_proof: false,
        ollama_backend: false,
        note: "DirectML n'est pas utilisé comme backend Ollama dans cette matrice."
      },
      metal: {
        status: vendor === "apple" ? "platform_available" : "not_applicable",
        value: vendor === "apple" ? "macOS" : "",
        is_runtime_proof: false,
        ollama_backend: vendor === "apple"
      }
    },
    actual_execution: {
      status: runtimeEvidence.status,
      processor: runtimeEvidence.processor,
      gpu_offload_percent: runtimeEvidence.gpu_offload_percent,
      source: runtimeEvidence.source,
      runtime: runtimeEvidence.runtime || "",
      is_proven: runtimeEvidence.status.endsWith("-proven")
    },
    memory: {
      model: scan.unified_memory ? "unified" : dedicatedVram != null ? "dedicated" : vendor === "cpu" ? "none" : "unknown",
      dedicated_vram_gb: dedicatedVram,
      shared_system_memory_gb: sharedSystemMemory,
      estimated_model_budget_gb: scan.unified_memory ? effectiveModelMemoryGb(scan) : dedicatedVram,
      dedicated_vram_claimed_from_shared_memory: false,
      vram_confidence: probe.vram_confidence || (dedicatedVram != null ? "scan_reported" : "unknown"),
      note: scan.unified_memory
        ? "La RAM partagée n'est pas déclarée comme VRAM dédiée ; seul un budget prudent de modèle est estimé."
        : dedicatedVram != null
          ? "VRAM dédiée issue du scan matériel."
          : "Budget GPU non déterminé."
    },
    wsl: {
      installed: Boolean(wsl.installed),
      gpu_bridge: wsl.gpu_bridge || "unknown",
      gpu_bridge_source: wsl.gpu_bridge_source || "",
      host_driver_required: os === "windows" && Boolean(wsl.installed)
    },
    acceleration_expected: accelerationExpected,
    verdict,
    remediation: {
      recommended: remediationRecommended,
      kind: remediationRecommended ? "open_official_driver_page" : "none",
      reason: remediationRecommended ? verdict.detail : "Aucune mise à jour pilote n'est imposée sans preuve suffisante.",
      official_url: remediationRecommended ? driverLink?.url || "" : "",
      requires_explicit_user_action: true,
      automatic_install_supported: false
    },
    limitations: [
      "Une API signalée n'est pas une preuve d'exécution GPU.",
      "Le support framework ROCm Windows ne vaut pas automatiquement support stable Ollama.",
      "La mémoire unifiée reste distincte de la VRAM dédiée.",
      "Aucun pilote n'est téléchargé ou installé automatiquement dans Runtime & Driver Intelligence v1."
    ],
    sources: [...sourceIds].map(runtimeDriverSource).filter(Boolean)
  };
}

function motherboardLabel(board = {}) {
  const parts = [board.manufacturer, board.product, board.version]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" ") : "carte mère non identifiée";
}

function motherboardRamAdvice(scan = {}) {
  const board = scan?.raw_scan?.motherboard_probe || {};
  const memory = scan?.raw_scan?.memory_probe || {};
  const ram = Number(scan.ram_gb || memory.total_gb || 0);
  const maxRam = Number(board.max_memory_gb || 0);
  const slots = Number(board.memory_slots || 0);
  const modules = Number(memory.module_count || 0);
  const boardName = motherboardLabel(board);
  if (!board.source || board.source === "not_detected") {
    return {
      state: "warn",
      detail: "Carte mère non confirmée : vérifier manuel/QVL avant achat RAM.",
      row: "",
      action: "Vérifier la capacité RAM maximale de la carte mère avant d'acheter."
    };
  }
  const row = [
    boardName,
    maxRam ? `max ${maxRam} Go` : "max RAM à confirmer",
    slots ? `${modules || "?"}/${slots} slots` : modules ? `${modules} module(s)` : "",
    board.bios_version ? `BIOS ${board.bios_version}` : ""
  ].filter(Boolean).join(" · ");
  if (maxRam && ram >= maxRam) {
    return {
      state: "warn",
      detail: `${boardName} : RAM actuelle proche du plafond détecté (${formatGb(ram)} / ${formatGb(maxRam)}).`,
      row,
      action: "Ne pas acheter plus de RAM sans vérifier la fiche carte mère."
    };
  }
  if (slots && modules >= slots && maxRam && ram < maxRam) {
    return {
      state: "warn",
      detail: `${boardName} : tous les slots semblent occupés, upgrade RAM = remplacer le kit.`,
      row,
      action: "Prévoir un kit RAM complet plutôt qu'une barrette ajoutée."
    };
  }
  if (maxRam || slots) {
    return {
      state: "ok",
      detail: `${boardName} : ${maxRam ? `${formatGb(maxRam)} max détectés` : "plafond à confirmer"}${slots ? `, ${slots} slot(s)` : ""}.`,
      row,
      action: ""
    };
  }
  return {
    state: "warn",
    detail: `${boardName} détectée, mais plafond RAM non confirmé.`,
    row,
    action: "Vérifier manuel/QVL avant upgrade RAM."
  };
}

function doctorRuntimeEvidence(scan = state.scan || {}, model = "qwen3:0.6b") {
  const automatic = latestBenchmarkFor(model, { executionMode: "auto" });
  const cpu = latestBenchmarkFor(model, { executionMode: "cpu" });
  const processor = String(automatic?.runtime_processor || "unknown").toLowerCase();
  const offloadPercent = Number(automatic?.runtime_gpu_offload_percent || 0);
  const hasAllocationProof = Boolean(
    automatic?.success
    && automatic?.runtime_evidence_source === "ollama_api_ps"
    && ["gpu", "hybrid", "cpu"].includes(processor)
  );
  const speedup = automatic?.success && cpu?.success && Number(cpu.estimated_tokens_per_second || 0) > 0
    ? Math.round((Number(automatic.estimated_tokens_per_second || 0) / Number(cpu.estimated_tokens_per_second || 1)) * 100) / 100
    : 0;
  let status = "untested";
  if (hasAllocationProof) status = `${processor}-proven`;
  else if (automatic?.success) status = "automatic-only";
  else if (cpu?.success) status = "cpu-fallback-only";
  return {
    status,
    model,
    processor: hasAllocationProof ? processor : "unknown",
    gpu_offload_percent: hasAllocationProof ? offloadPercent : 0,
    model_size_bytes: Number(automatic?.runtime_model_size_bytes || 0),
    vram_bytes: Number(automatic?.runtime_vram_bytes || 0),
    source: hasAllocationProof ? "ollama_api_ps" : automatic?.measurement_source || "",
    runtime: automatic?.runtime || cpu?.runtime || "",
    automatic_tokens_per_second: Number(automatic?.estimated_tokens_per_second || 0),
    cpu_tokens_per_second: Number(cpu?.estimated_tokens_per_second || 0),
    automatic_success: Boolean(automatic?.success),
    cpu_success: Boolean(cpu?.success),
    speedup_vs_cpu: speedup,
    measured_at_ms: Number(automatic?.created_at_ms || cpu?.created_at_ms || 0),
    limitation: hasAllocationProof
      ? "Allocation observée via Ollama /api/ps après le benchmark."
      : automatic?.success
        ? "Benchmark automatique réussi, mais Ollama /api/ps n'a pas fourni de preuve d'allocation CPU/GPU."
        : "Aucun benchmark automatique réussi : l'accélération n'est pas mesurée."
  };
}

function hardwareDoctorAnalysis(scan = {}) {
  const probe = scan?.raw_scan?.gpu_probe || {};
  const memory = scan?.raw_scan?.memory_probe || {};
  const board = scan?.raw_scan?.motherboard_probe || {};
  const gpuUnknown = gpuProbeIsUnknown(scan, probe);
  const vram = Number(scan.vram_gb || probe.vram_gb || 0);
  const ram = Number(scan.ram_gb || 0);
  const unifiedEffective = effectiveModelMemoryGb(scan);
  const moduleCount = Number(memory.module_count || 0);
  const memoryClock = Number(memory.configured_clock_mhz || memory.speed_mhz || 0);
  const channelMode = String(memory.channel_mode || "");
  const temp = Number(probe.temperature_c || 0);
  const powerDraw = Number(probe.power_draw_w || 0);
  const powerLimit = Number(probe.power_limit_w || 0);
  const pcieCurrent = Number(probe.pcie_link_width_current || 0);
  const pcieMax = Number(probe.pcie_link_width_max || 0);
  const pcieGenCurrent = Number(probe.pcie_link_gen_current || 0);
  const pcieGenMax = Number(probe.pcie_link_gen_max || 0);
  const hasNvidiaSignals = probe.source === "nvidia-smi" || Boolean(probe.driver_version || probe.cuda_version);
  const vendor = detectedGpuVendor(scan, probe);
  const hasOllama = hasUsableOllamaRuntime(scan);
  const wsl = wslRuntimeInfo(scan);
  const vramSuffix = vramConfidenceSuffix(probe, scan);
  const boardAdvice = motherboardRamAdvice(scan);
  const runtimeEvidence = doctorRuntimeEvidence(scan);
  const runtimeDriver = runtimeDriverIntelligence(scan, { runtimeEvidence });
  const rebarStatus = String(probe.rebar_status || "");
  let score = 35;
  const checks = [];
  const actions = [];

  const addCheck = (label, state, detail, points = 0) => {
    score += points;
    checks.push({ label, state, detail });
  };
  const addAction = (text) => {
    if (text && !actions.includes(text)) actions.push(text);
  };

  if (scan.unified_memory && ram >= 64) {
    addCheck(
      "Mémoire unifiée",
      "ok",
      `${formatGb(ram)} partagés · enveloppe utile estimée ${formatGb(unifiedEffective)} pour modèles quantifiés.`,
      18
    );
    if (vendor === "amd") addAction("Benchmarker le runtime AMD/ROCm/Vulkan avant de comparer à une RTX CUDA.");
  } else if (scan.unified_memory) {
    addCheck("Mémoire unifiée", "warn", `${formatGb(ram)} partagés : utilisable, mais marge limitée pour gros modèles.`, 8);
    addAction("Tester un modèle léger puis valider le backend GPU/CPU.");
  } else if (gpuUnknown) {
    addCheck("VRAM", "warn", "GPU et VRAM non déterminés : le scan ne conclut pas que la machine est CPU-only.", 0);
    addAction("Vérifier le pilote GPU puis relancer l'analyse avant toute recommandation d'achat.");
  } else if (vram >= 24) addCheck("VRAM", "ok", `${formatGb(vram)} ${vramSuffix} : gros modèles quantifiés et contexte confortable.`, 22);
  else if (vram >= 16) addCheck("VRAM", "ok", `${formatGb(vram)} ${vramSuffix} : très bon palier 7B-14B, certains 32B à valider.`, 18);
  else if (vram >= 12) addCheck("VRAM", "ok", `${formatGb(vram)} ${vramSuffix} : ticket sérieux pour 7B/8B et plusieurs 14B quantifiés.`, 14);
  else if (vram >= 8) {
    addCheck("VRAM", "warn", `${formatGb(vram)} ${vramSuffix} : utile, mais il faut rester sur petits modèles ou quantization agressive.`, 8);
    addAction("Tester un 7B/8B avant tout achat.");
  } else {
    addCheck("VRAM", "bad", vram ? `${formatGb(vram)} ${vramSuffix} : limite pour gros LLM.` : "Aucune VRAM dédiée fiable détectée.", 1);
    addAction("Commencer par qwen3:0.6b ou CPU/RAM, puis envisager 12-16 Go VRAM.");
  }

  if (ram >= 64) addCheck("RAM", "ok", `${formatGb(ram)} : bon niveau RAG, multitâche, offload CPU.`, 12);
  else if (ram >= 32) addCheck("RAM", "ok", `${formatGb(ram)} : suffisant pour cockpit local et modèles courants.`, 9);
  else if (ram >= 16) {
    addCheck("RAM", "warn", `${formatGb(ram)} : utilisable, mais attention aux gros contextes.`, 5);
    addAction("Fermer les apps lourdes pendant les benchmarks.");
  } else {
    addCheck("RAM", "bad", `${formatGb(ram)} : faible pour IA locale confortable.`, 1);
    addAction("Viser 32 Go RAM si le PC le permet.");
  }

  if (channelMode === "multiple_modules_detected") {
    addCheck(
      "Canal mémoire",
      "warn",
      `${moduleCount || "?"} barrettes détectées${memoryClock ? ` · ${memoryClock} MT/s` : ""}, mais le mode single/dual/quad n'est pas exposé par le système.`,
      0
    );
  } else if (channelMode === "single_module_detected") {
    addCheck("Canal mémoire", "warn", `Une barrette détectée${memoryClock ? ` · ${memoryClock} MT/s` : ""} ; le mode canal reste à confirmer.`, 0);
    addAction("Vérifier le mode canal dans le BIOS ou un outil constructeur avant d'acheter de la RAM.");
  } else if (channelMode.includes("channel_estimated")) {
    addCheck("Canal mémoire", "warn", `${memoryChannelLabel(memory)} : ancienne estimation conservée, pas une mesure matérielle.`, 0);
  } else if (memory.source) {
    addCheck("Canal mémoire", "warn", "Canal non confirmé par le système.", 0);
  }

  const runtimeDriverPoints = runtimeDriver.verdict.tone === "ok"
    ? 16
    : runtimeDriver.verdict.key === "driver_below_minimum"
      ? -8
      : runtimeDriver.backend.ollama_support_tier === "stable"
        ? 10
        : runtimeDriver.backend.ollama_support_tier === "legacy_supported"
          ? 6
          : runtimeDriver.backend.ollama_support_tier === "experimental"
            ? 2
            : 0;
  addCheck(
    runtimeDriver.vendor === "nvidia" ? "NVIDIA/CUDA" : runtimeDriver.vendor === "amd" ? "AMD runtime" : runtimeDriver.vendor === "intel" ? "Intel/Vulkan" : "Pilote/runtime GPU",
    runtimeDriver.verdict.tone === "bad" ? "bad" : runtimeDriver.verdict.tone === "ok" ? "ok" : "warn",
    `${runtimeDriver.verdict.label} · ${runtimeDriver.verdict.detail}`,
    runtimeDriverPoints
  );
  if (runtimeDriver.family?.id === "pascal") {
    addCheck("GTX/Pascal", "warn", "CUDA toolkit 12.x maximum · dernière branche pilote R580 selon NVIDIA ; ne pas conseiller CUDA 13.", -1);
  }
  if (runtimeDriver.remediation.recommended) {
    addAction(`${runtimeDriver.driver.official_label || "Pilote officiel"} : ouvrir la page constructeur, puis relancer le benchmark.`);
  } else if (runtimeDriver.backend.ollama_support_tier === "experimental") {
    addAction(`${runtimeDriver.backend.label} est expérimental dans Ollama : mesurer avant toute conclusion ou achat.`);
  } else if (gpuUnknown) {
    addAction("Relancer l'analyse après vérification du pilote ; l'état GPU reste inconnu.");
  }

  if (temp >= 84) {
    addCheck("Thermique au scan", "warn", `${formatDoctorNumber(temp, " °C")} instantanés : risque à confirmer sous charge longue.`, -8);
    addAction("Surveiller température/ventilation avant un gros modèle.");
  } else if (temp > 0) {
    addCheck("Thermique au scan", "ok", `${formatDoctorNumber(temp, " °C")} instantanés : aucun signal critique au moment de la mesure.`, 8);
  }

  if (powerDraw > 0 && powerLimit > 0) {
    const ratio = powerDraw / powerLimit;
    if (ratio >= 0.92) {
      addCheck("Puissance", "warn", `${formatDoctorNumber(powerDraw, " W")} / ${formatDoctorNumber(powerLimit, " W")} : faible marge.`, -4);
      addAction("Éviter de lancer plusieurs gros tests en parallèle.");
    } else {
      addCheck("Puissance", "ok", `${formatDoctorNumber(powerDraw, " W")} / ${formatDoctorNumber(powerLimit, " W")} : marge disponible.`, 5);
    }
  }

  if (pcieCurrent && pcieMax) {
    const gen = pcieGenCurrent ? ` Gen${pcieGenCurrent}${pcieGenMax ? `/${pcieGenMax}` : ""}` : "";
    if (pcieCurrent < pcieMax) {
      addCheck("PCIe", "warn", `x${pcieCurrent}/x${pcieMax}${gen} : lien réduit détecté.`, -4);
      addAction("Vérifier slot PCIe, BIOS ou économie d'énergie si les perfs sont basses.");
    } else {
      addCheck("PCIe", "ok", `x${pcieCurrent}/x${pcieMax}${gen} : lien cohérent.`, 5);
    }
  }

  if (rebarStatus === "enabled") {
    addCheck("Resizable BAR", "ok", "Activé selon nvidia-smi.", 3);
  } else if (rebarStatus === "disabled") {
    addCheck("Resizable BAR", "warn", "Désactivé selon nvidia-smi ; le gain dépend du GPU et du runtime.", -1);
    addAction("Vérifier ReBAR dans le BIOS seulement si la carte mère et le GPU le supportent.");
  } else if (rebarStatus === "reported_unconfirmed") {
    addCheck("Resizable BAR", "warn", "Section détectée, état non confirmé : aucune conclusion automatique.", 0);
  }

  if (hasOllama) addCheck("Runtime IA", "ok", `${ollamaRuntimeLabel(scan)} prêt.`, 10);
  else {
    addCheck("Runtime IA", "bad", "Ollama non prêt pour lancer un modèle.", -8);
    addAction("Installer Ollama Windows ou préparer Ollama dans WSL.");
  }

  if (runtimeEvidence.status === "gpu-proven") {
    addCheck("Offload Ollama", "ok", `${runtimeEvidence.gpu_offload_percent.toFixed(1)} % du modèle observés en VRAM via /api/ps.`, 8);
  } else if (runtimeEvidence.status === "hybrid-proven") {
    addCheck("Offload Ollama", "warn", `${runtimeEvidence.gpu_offload_percent.toFixed(1)} % en VRAM : exécution hybride CPU/GPU mesurée.`, 4);
    addAction("Réduire modèle ou contexte si tu veux augmenter l'offload GPU.");
  } else if (runtimeEvidence.status === "cpu-proven" && Number(scan.vram_gb || 0) > 0) {
    addCheck("Offload Ollama", "bad", "0 % en VRAM : Ollama a exécuté le modèle sur CPU malgré le GPU détecté.", -8);
    addAction("Vérifier pilote et runtime GPU, puis relancer le benchmark automatique.");
  } else if (runtimeEvidence.status === "automatic-only") {
    addCheck("Offload Ollama", "warn", "Benchmark réussi, allocation GPU non prouvée par /api/ps.", 1);
  } else if (hasOllama) {
    addCheck("Offload Ollama", "warn", "Non mesuré : lancer le benchmark léger pour distinguer CPU, hybride et GPU.", 0);
  }

  if (runtimeEvidence.speedup_vs_cpu > 0) {
    addCheck(
      "Gain automatique/CPU",
      runtimeEvidence.speedup_vs_cpu >= 1.2 ? "ok" : "warn",
      `x${runtimeEvidence.speedup_vs_cpu.toFixed(2)} sur le même modèle (${runtimeEvidence.automatic_tokens_per_second.toFixed(1)} vs ${runtimeEvidence.cpu_tokens_per_second.toFixed(1)} tok/s).`,
      runtimeEvidence.speedup_vs_cpu >= 1.2 ? 4 : 0
    );
  }

  if (wsl.kind === "ready") addCheck("WSL", "ok", "Ollama WSL prêt pour workflows Linux.", 4);
  else if (wsl.kind === "detected") addCheck("WSL", "warn", "WSL détecté, Ollama WSL à préparer si besoin.", 1);
  else if (wsl.kind === "missing" && !hasOllama) addAction("Optionnel : installer WSL pour workflows Linux.");
  if (runtimeDriver.wsl.installed && runtimeDriver.wsl.gpu_bridge === "available") {
    addCheck("Pont GPU WSL", "ok", "/dev/dxg exposé par WSL ; l'offload reste à prouver dans Ollama.", 2);
  } else if (runtimeDriver.wsl.installed && runtimeDriver.wsl.gpu_bridge === "missing") {
    addCheck("Pont GPU WSL", "warn", "WSL répond, mais /dev/dxg n'est pas exposé dans la distribution testée.", -2);
    addAction("Mettre WSL et le pilote hôte à jour avant de conclure sur le GPU dans WSL.");
  } else if (runtimeDriver.wsl.installed) {
    addCheck("Pont GPU WSL", "warn", "État /dev/dxg non mesuré ; aucun accès GPU WSL n'est affirmé.", 0);
  }

  if (board.source && board.source !== "not_detected") {
    addCheck("Carte mère/RAM", boardAdvice.state, boardAdvice.detail, boardAdvice.state === "ok" ? 4 : -1);
  } else if (ram >= 16) {
    addCheck("Carte mère/RAM", "warn", boardAdvice.detail, 0);
  }
  if (boardAdvice.action) addAction(boardAdvice.action);

  const cudaMajor = parseMajorVersion(probe.cuda_version);
  if (cudaMajor && cudaMajor < 12) {
    addCheck("CUDA", "warn", `CUDA driver max ${probe.cuda_version} : compatible selon runtime, mais à surveiller.`, -2);
    addAction("Mettre à jour le driver NVIDIA si un modèle échoue côté GPU.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const headline = score >= 85 ? "Machine mature" : score >= 70 ? "Base solide" : score >= 50 ? "À cadrer" : "Mode prudent";
  const summary = score >= 85
    ? "Le matériel expose assez de signaux pour recommander, tester et comparer proprement."
    : score >= 70
      ? "La machine est exploitable, avec quelques points à vérifier selon les gros modèles."
      : score >= 50
        ? "Le diagnostic peut fonctionner, mais il faut valider par benchmark court avant d'acheter."
        : "OutilsIA doit privilégier les petits modèles et les recommandations prudentes.";
  const confidence = runtimeEvidence.status.endsWith("-proven") && probe.source === "nvidia-smi"
    ? "measured"
    : runtimeEvidence.automatic_success || (probe.source && !gpuUnknown)
      ? "mixed"
      : "estimated";
  return { score, headline, summary, checks, actions: actions.slice(0, 4), source: probe.source || "scan système", confidence, runtimeEvidence, runtimeDriver };
}

function hardwareDoctorSnapshot(scan = state.scan || {}) {
  if (!scan) return null;
  if (!scan.machine_key && !scan.cpu_name && !scan.gpu_name && !scan.ram_gb) return null;
  const probe = scan?.raw_scan?.gpu_probe || {};
  const memory = scan?.raw_scan?.memory_probe || {};
  const board = scan?.raw_scan?.motherboard_probe || {};
  const analysis = hardwareDoctorAnalysis(scan);
  const wslInfo = wslRuntimeInfo(scan);
  const driverLink = gpuDriverLink(scan, probe);
  const boardAdvice = motherboardRamAdvice(scan);
  const clock = Number(memory.configured_clock_mhz || memory.speed_mhz || 0);
  const channel = memoryChannelLabel(memory);
  return {
    schema: "outilsia.hardware_doctor.v2",
    measured_at: new Date().toISOString(),
    score: analysis.score,
    headline: analysis.headline,
    summary: analysis.summary,
    source: analysis.source,
    confidence: analysis.confidence,
    checks: analysis.checks,
    actions: analysis.actions,
    ram: {
      total_gb: Number(scan.ram_gb || memory.total_gb || 0),
      module_count: Number(memory.module_count || 0),
      memory_type: memory.memory_type || "",
      channel_mode: channel,
      configured_clock_mhz: Number(memory.configured_clock_mhz || 0),
      speed_mhz: Number(memory.speed_mhz || 0),
      effective_clock_label: clock ? `${clock} MT/s` : "fréquence non confirmée",
      confidence: memoryConfidenceLabel(memory),
      source: memory.source || "scan système"
    },
    gpu: {
      unified_memory: Boolean(scan.unified_memory),
      effective_model_memory_gb: effectiveModelMemoryGb(scan),
      confidence: gpuConfidenceLabel(probe, scan),
      source: probe.source || "scan système",
      vram_confidence: probe.vram_confidence || "unknown",
      driver_version: probe.driver_version || "",
      cuda_version: probe.cuda_version || "",
      rocm_version: probe.rocm_version || "",
      memory_used_mb: Number(probe.memory_used_mb || 0),
      performance_state: probe.performance_state || "",
      rebar_status: probe.rebar_status || "unknown",
      driver_url: driverLink?.url || "",
      driver_label: driverLink?.label || "",
      driver_date: probe.driver_date || "",
      driver_provider: probe.driver_provider || "",
      kernel_driver: probe.kernel_driver || "",
      pnp_device_id: probe.pnp_device_id || "",
      vulkan_version: probe.vulkan_version || "",
      temperature_c: Number(probe.temperature_c || 0),
      utilization_percent: Number(probe.utilization_percent || 0),
      power_draw_w: Number(probe.power_draw_w || 0),
      power_limit_w: Number(probe.power_limit_w || 0),
      pcie_link_width_current: Number(probe.pcie_link_width_current || 0),
      pcie_link_width_max: Number(probe.pcie_link_width_max || 0),
      pcie_link_gen_current: Number(probe.pcie_link_gen_current || 0),
      pcie_link_gen_max: Number(probe.pcie_link_gen_max || 0)
    },
    runtime: {
      ollama: ollamaRuntimeLabel(scan),
      wsl: wslInfo.title || wslInfo.kind || "non détecté",
      evidence: analysis.runtimeEvidence,
      driver_intelligence: analysis.runtimeDriver
    },
    motherboard: {
      label: motherboardLabel(board),
      manufacturer: board.manufacturer || "",
      product: board.product || "",
      version: board.version || "",
      bios_version: board.bios_version || "",
      max_memory_gb: Number(board.max_memory_gb || 0),
      memory_slots: Number(board.memory_slots || 0),
      source: board.source || "",
      advice: boardAdvice.detail
    }
  };
}

function hardwareDoctorSummaryLines(snapshot = hardwareDoctorSnapshot()) {
  if (!snapshot) return ["Hardware Doctor: scan requis."];
  const lines = [
    `Hardware Doctor 2.0: ${snapshot.score}/100 - ${snapshot.headline} - confiance ${snapshot.confidence}`,
    `RAM: ${snapshot.ram.total_gb || "?"} Go - ${snapshot.ram.memory_type || "type inconnu"} - ${snapshot.ram.module_count || "?"} module(s) - ${snapshot.ram.channel_mode} - ${snapshot.ram.effective_clock_label}`,
    `GPU: ${snapshot.gpu.confidence}${snapshot.gpu.unified_memory ? ` - mémoire unifiée utile estimée ${snapshot.gpu.effective_model_memory_gb || "?"} Go` : ""}${snapshot.gpu.driver_version ? ` - driver ${snapshot.gpu.driver_version}` : ""}${snapshot.gpu.cuda_version ? ` - CUDA driver max ${snapshot.gpu.cuda_version}` : ""}${snapshot.gpu.rocm_version ? ` - ROCm ${snapshot.gpu.rocm_version}` : ""}${snapshot.gpu.vulkan_version ? ` - Vulkan ${snapshot.gpu.vulkan_version}` : ""}`,
    snapshot.motherboard?.source && snapshot.motherboard.source !== "not_detected"
      ? `Carte mère: ${snapshot.motherboard.label}${snapshot.motherboard.max_memory_gb ? ` - max RAM ${snapshot.motherboard.max_memory_gb} Go` : ""}${snapshot.motherboard.memory_slots ? ` - ${snapshot.ram.module_count || "?"}/${snapshot.motherboard.memory_slots} slots` : ""}`
      : "",
    `Runtime: ${snapshot.runtime.ollama}${snapshot.runtime.wsl ? ` - WSL ${snapshot.runtime.wsl}` : ""}`
  ].filter(Boolean);
  if (snapshot.runtime?.driver_intelligence) {
    const intelligence = snapshot.runtime.driver_intelligence;
    lines.push(`Runtime & Driver Intelligence ${intelligence.matrix_version}: ${intelligence.verdict.label} - backend ${intelligence.backend.label} (${intelligence.backend.ollama_support_tier})`);
  }
  if (snapshot.runtime?.evidence?.status?.endsWith("-proven")) {
    lines.push(`Offload Ollama: ${snapshot.runtime.evidence.processor} - ${snapshot.runtime.evidence.gpu_offload_percent.toFixed(1)} % GPU - preuve ${snapshot.runtime.evidence.source}`);
  }
  if (snapshot.gpu.rebar_status && snapshot.gpu.rebar_status !== "unknown") lines.push(`ReBAR: ${snapshot.gpu.rebar_status}`);
  if (snapshot.gpu.temperature_c) lines.push(`Thermique: ${formatDoctorNumber(snapshot.gpu.temperature_c, " °C")}`);
  if (snapshot.gpu.pcie_link_width_current || snapshot.gpu.pcie_link_width_max) {
    lines.push(`PCIe: x${snapshot.gpu.pcie_link_width_current || "?"}/x${snapshot.gpu.pcie_link_width_max || "?"}`);
  }
  if (snapshot.actions.length) lines.push(`Action doctor: ${snapshot.actions[0]}`);
  return lines;
}

function renderHardwareDoctor(scan) {
  if (!els.hardwareDoctorBox) return;
  const probe = scan?.raw_scan?.gpu_probe || {};
  const memory = scan?.raw_scan?.memory_probe || {};
  const board = scan?.raw_scan?.motherboard_probe || {};
  const analysis = hardwareDoctorAnalysis(scan);
  const driverLink = gpuDriverLink(scan, probe);
  const boardAdvice = motherboardRamAdvice(scan);
  const source = analysis.source;
  const rows = [];
  rows.push(["Confiance GPU", gpuConfidenceLabel(probe, scan)]);
  rows.push(["Confiance RAM", memoryConfidenceLabel(memory)]);
  if (probe.driver_version) rows.push(["Driver", probe.driver_version]);
  if (probe.cuda_version) rows.push(["CUDA driver max", probe.cuda_version]);
  if (probe.rocm_version) rows.push(["ROCm", probe.rocm_version]);
  if (probe.vulkan_version) rows.push(["Vulkan", probe.vulkan_version]);
  if (probe.kernel_driver) rows.push(["Pilote noyau", probe.kernel_driver]);
  if (probe.driver_date) rows.push(["Date pilote", probe.driver_date]);
  if (probe.memory_used_mb != null) rows.push(["VRAM utilisée au scan", `${Number(probe.memory_used_mb)} Mo`]);
  if (probe.performance_state) rows.push(["État GPU", probe.performance_state]);
  if (probe.rebar_status) rows.push(["Resizable BAR", probe.rebar_status]);
  if (analysis.runtimeEvidence.status.endsWith("-proven")) {
    rows.push(["Offload Ollama", `${analysis.runtimeEvidence.processor} · ${analysis.runtimeEvidence.gpu_offload_percent.toFixed(1)} % GPU`]);
  }
  if (boardAdvice.row) rows.push(["Carte mère", boardAdvice.row]);
  if (probe.temperature_c != null) rows.push(["Température", formatDoctorNumber(probe.temperature_c, " °C")]);
  if (probe.utilization_percent != null) rows.push(["Charge GPU", formatDoctorNumber(probe.utilization_percent, " %")]);
  if (probe.power_draw_w != null) {
    const power = probe.power_limit_w != null
      ? `${formatDoctorNumber(probe.power_draw_w, " W")} / ${formatDoctorNumber(probe.power_limit_w, " W")}`
      : formatDoctorNumber(probe.power_draw_w, " W");
    rows.push(["Puissance", power]);
  }
  if (probe.pcie_link_width_current || probe.pcie_link_width_max) {
    const width = `${probe.pcie_link_width_current ? `x${probe.pcie_link_width_current}` : "x?"}${probe.pcie_link_width_max ? ` / x${probe.pcie_link_width_max}` : ""}`;
    rows.push(["PCIe", width]);
  }
  if (memory.module_count || memory.configured_clock_mhz || memory.speed_mhz) {
    const mode = memoryChannelLabel(memory);
    const clock = memory.configured_clock_mhz || memory.speed_mhz;
    rows.push(["Mémoire", `${memory.memory_type || "type inconnu"} · ${memory.module_count || "?"} module(s) · ${mode}${clock ? ` · ${clock} MT/s` : ""}`]);
  }

  const hasWarning = analysis.checks.some((check) => check.state === "warn" || check.state === "bad");

  els.hardwareDoctorBox.className = `hardware-doctor-box ${hasWarning ? "is-warning" : "is-ready"}`.trim();
  els.hardwareDoctorBox.innerHTML = `
    <div class="hardware-doctor-head">
      <div>
        <span class="label">Hardware Doctor 2.0</span>
        <strong>${escapeHtml(analysis.headline)}</strong>
        <p>${escapeHtml(analysis.summary)}</p>
      </div>
      <div class="doctor-score">
        <strong>${escapeHtml(analysis.score)}</strong>
        <span>/100</span>
      </div>
    </div>
    <div class="doctor-status-row">
      <span class="doctor-source">${escapeHtml(source)} · confiance ${escapeHtml(analysis.confidence)}</span>
      ${analysis.actions.length ? `<span>${escapeHtml(analysis.actions[0])}</span>` : "<span>Aucune action urgente détectée.</span>"}
    </div>
    <div class="doctor-checks">
      ${analysis.checks.slice(0, 8).map((check) => `
        <div class="doctor-check ${escapeHtml(check.state)}">
          <strong>${escapeHtml(check.label)}</strong>
          <span>${escapeHtml(check.detail)}</span>
        </div>
      `).join("")}
    </div>
    <div class="runtime-driver-details advanced-panel">
      <strong>Runtime & Driver Intelligence v1</strong>
      <span>${escapeHtml(analysis.runtimeDriver.vendor_label)}${analysis.runtimeDriver.family ? ` · ${escapeHtml(analysis.runtimeDriver.family.label)}` : ""} · ${escapeHtml(analysis.runtimeDriver.backend.label)} · ${escapeHtml(analysis.runtimeDriver.backend.ollama_support_tier)}</span>
      <span>${escapeHtml(analysis.runtimeDriver.api_signal.status === "reported" ? `${analysis.runtimeDriver.api_signal.label || analysis.runtimeDriver.backend.label} ${analysis.runtimeDriver.api_signal.value} signalé, offload non prouvé` : "API GPU non confirmée")}</span>
      <span>${escapeHtml(analysis.runtimeDriver.memory.note)}</span>
      <small>Matrice ${escapeHtml(analysis.runtimeDriver.matrix_version)} · revue ${escapeHtml(analysis.runtimeDriver.matrix_updated_at)} · installation pilote automatique désactivée</small>
    </div>
    ${driverLink ? `
      <div class="row-actions compact-actions doctor-actions">
        <button type="button" data-open-url="${escapeHtml(driverLink.url)}">${escapeHtml(driverLink.label)}</button>
      </div>
    ` : ""}
    ${rows.length ? `<dl class="doctor-grid">${rows.map(([label, value]) => `
      <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
    `).join("")}</dl>` : ""}
  `;
}

function readUsageProfileKey() {
  try {
    const saved = localStorage.getItem(USAGE_PROFILE_KEY);
    if (saved && USAGE_PROFILES[saved]) return saved;
  } catch (_) {
    // localStorage can be unavailable in restricted shells.
  }
  const vram = Number(state.scan?.vram_gb || 0);
  const ram = Number(state.scan?.ram_gb || 0);
  if (state.scan && (!vram || vram <= 6 || ram <= 16)) return "portable";
  return "polyvalent";
}

function currentUsageProfile() {
  const key = readUsageProfileKey();
  return { key, ...USAGE_PROFILES[key] };
}

function readRecommendationRun() {
  if (state.recommendationRun) return state.recommendationRun;
  try {
    const raw = localStorage.getItem(RECOMMENDATION_RUN_KEY);
    state.recommendationRun = raw ? JSON.parse(raw) : null;
    return state.recommendationRun;
  } catch (_) {
    return null;
  }
}

function writeRecommendationRun(run) {
  state.recommendationRun = run || null;
  try {
    if (run) localStorage.setItem(RECOMMENDATION_RUN_KEY, JSON.stringify(run));
    else localStorage.removeItem(RECOMMENDATION_RUN_KEY);
  } catch (_) {
    // The current result still remains visible for this render cycle.
  }
}

function recommendationRunMatchesCurrentMachine(run) {
  if (!run?.machine || !state.scan) return false;
  const runKey = String(run.machine.machine_key || "").trim();
  const scanKey = String(state.scan.machine_key || "").trim();
  if (runKey && scanKey) return runKey === scanKey;
  return String(run.machine.gpu_name || "") === String(state.scan.gpu_name || "")
    && Number(run.machine.vram_gb || 0) === Number(state.scan.vram_gb || 0)
    && Number(run.machine.ram_gb || 0) === Number(state.scan.ram_gb || 0);
}

function recommendationCandidateResources(candidate) {
  const model = candidate?.model || candidate || {};
  const ref = candidate?.ref || actionableOllamaRef(model) || model?.model || "";
  const vramRequired = modelRequiredVram(model);
  const machineVram = Number(state.scan?.vram_gb || 0);
  const machineRam = Number(state.scan?.ram_gb || 0);
  const storageFree = Number(state.scan?.storage_free_gb || state.scan?.free_storage_gb || 0);
  const storageLabel = estimatedModelSizeLabel(ref);
  let fit = "à confirmer";
  if (vramRequired && machineVram >= vramRequired) fit = "GPU compatible en Q4 estimé";
  else if (machineRam >= Math.max(16, vramRequired || 0)) fit = "RAM/offload possible, vitesse à mesurer";
  else if (isStarterModelRef(ref)) fit = "modèle léger adapté au test";
  return {
    storage_label: storageLabel,
    storage_free_gb: storageFree || null,
    vram_required_q4_gb: vramRequired || null,
    machine_vram_gb: machineVram || null,
    machine_ram_gb: machineRam || null,
    fit
  };
}

function recommendationProfileBonus(model, profileKey) {
  const text = `${modelTitle(model)} ${actionableOllamaRef(model)} ${model?.use_case || ""}`.toLowerCase();
  if (profileKey === "chat") return /hermes|mistral|llama/.test(text) ? 36 : 0;
  if (profileKey === "code") return /coder|code|deepseek|qwen/.test(text) ? 40 : 0;
  if (profileKey === "memory") return /hermes|mistral/.test(text) ? 42 : 0;
  if (profileKey === "french") return /mistral|hermes|qwen/.test(text) ? 34 : 0;
  if (profileKey === "portable") {
    if (/0\.6b|1b|1\.5b|3b|mini|phi/.test(text)) return 70;
    if (/7b|8b/.test(text)) return 12;
    return -20;
  }
  return /qwen|gemma|mistral|hermes/.test(text) ? 18 : 0;
}

function recommendationEngineCandidates(profileKey = readUsageProfileKey(), limit = 2) {
  if (!state.scan) return [];
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  const catalog = extractModels(compatibility).filter((model) => actionableOllamaRef(model));
  const installed = (state.scan.installed_models || []).map((model) => {
    const ref = modelLabel(model);
    return {
      name: ref,
      ollama: ref,
      size_gb: model.size_gb || null,
      reason: "Déjà installé sur cette machine."
    };
  });
  const starter = {
    name: "Qwen3 test léger",
    params: "0.6B",
    ollama: "qwen3:0.6b",
    reason: "Preuve légère pour vérifier le runtime et la réactivité."
  };
  const byRef = new Map();
  for (const model of [...catalog, ...installed, starter]) {
    const ref = normalizeOllamaRef(actionableOllamaRef(model));
    if (!ref) continue;
    const current = byRef.get(ref);
    if (!current || (!current.vram_q4 && model.vram_q4)) byRef.set(ref, model);
  }
  const availableMemory = effectiveModelMemoryGb(state.scan);
  const constrained = isConstrainedLegacyMachine();
  const candidates = [...byRef.values()].filter((model) => {
    const ref = actionableOllamaRef(model);
    const text = `${modelTitle(model)} ${ref}`.toLowerCase();
    const need = modelRequiredVram(model);
    if (need && availableMemory && need > availableMemory) return false;
    if (availableMemory < 24 && /\b(32b|70b|72b|109b|123b|235b)\b/.test(text)) return false;
    if (constrained && isAmbitiousForLegacyModel(model)) return false;
    return true;
  });
  const scored = candidates.map((model) => {
    const ref = actionableOllamaRef(model);
    let score = modelRecommendationScore(model) + recommendationProfileBonus(model, profileKey);
    if (isStarterModelRef(ref)) {
      score += profileKey === "portable" || constrained ? 55 : -25;
    }
    if (hasSuccessfulBenchmarkFor(ref)) score += 20;
    return { model, ref, score };
  }).sort((left, right) => right.score - left.score);
  const selected = [];
  const add = (item) => {
    if (!item?.ref || selected.some((entry) => sameOllamaModel(entry.ref, item.ref))) return;
    selected.push(item);
  };
  scored.filter((item) => isOllamaModelInstalled(item.ref)).forEach(add);
  scored.forEach(add);
  return selected.slice(0, limit);
}

function recommendationResourceScore(item) {
  const resources = item.resource_estimates || {};
  const vramNeed = Number(resources.vram_required_q4_gb || 0);
  const machineVram = Number(resources.machine_vram_gb || 0);
  if (!vramNeed || !machineVram) return 55;
  if (vramNeed <= machineVram * 0.5) return 100;
  if (vramNeed <= machineVram * 0.8) return 82;
  if (vramNeed <= machineVram) return 68;
  return 38;
}

function recommendationResultScore(item, profileKey) {
  if (!item?.success || !item.recommendation_proof) return 0;
  const profile = USAGE_PROFILES[profileKey] || USAGE_PROFILES.polyvalent;
  const profileScore = arenaProfileScore(item, profile.arena).score;
  const proofScore = Number(item.recommendation_proof.score || 0);
  const usagePassed = item.recommendation_proof.checks?.find((check) => check.key === "usage")?.passed ? 100 : 0;
  const resourceScore = recommendationResourceScore(item);
  return clampScore((profileScore * 0.50) + (proofScore * 0.20) + (usagePassed * 0.20) + (resourceScore * 0.10));
}

function recommendationDecision(run = readRecommendationRun()) {
  if (!run?.results?.length) return null;
  const ranked = run.results
    .filter((item) => item.success)
    .map((item) => ({ ...item, recommendation_score: recommendationResultScore(item, run.profile) }))
    .sort((left, right) => right.recommendation_score - left.recommendation_score);
  const winner = ranked[0] || null;
  if (!winner) {
    return {
      winner: null,
      ranked,
      verdict: "Aucun modèle validé",
      detail: "Vérifie Ollama, le runtime choisi et les modèles installés avant de relancer.",
      confidence: "insuffisante"
    };
  }
  const proof = winner.recommendation_proof;
  const failed = proof.checks.filter((check) => !check.passed).map((check) => check.label);
  const confidence = winner.recommendation_score >= 75 && proof.passed_count >= 6
    ? "solide"
    : winner.recommendation_score >= 55
      ? "à confirmer"
      : "limitée";
  const verdict = confidence === "solide"
    ? `Garder ${winner.model} pour ${proof.profile_label}`
    : `Meilleur candidat mesuré : ${winner.model}`;
  const limits = [];
  if (failed.length) limits.push(`À revoir : ${failed.join(", ")}.`);
  if (Number(winner.estimated_tokens_per_second || 0) < 5) limits.push("Débit inférieur à 5 tok/s : usage interactif potentiellement lent.");
  if (!limits.length) limits.push("Décision valable pour ce protocole court et cette machine ; confirmer sur vos tâches longues.");
  return {
    winner,
    ranked,
    verdict,
    confidence,
    detail: `${proof.summary} · ${winner.estimated_tokens_per_second || 0} tok/s · score usage ${winner.recommendation_score}/100.`,
    limits
  };
}

function recommendationReportSnapshot(run = readRecommendationRun()) {
  if (!recommendationRunMatchesCurrentMachine(run)) return null;
  const decision = recommendationDecision(run);
  if (!run || !decision) return null;
  return {
    schema: run.schema || "outilsia.recommendation_run.v2",
    protocol: run.protocol || RECOMMENDATION_ENGINE_PROTOCOL,
    created_at_ms: Number(run.created_at_ms || 0),
    profile: run.profile || "polyvalent",
    profile_label: run.profile_label || USAGE_PROFILES[run.profile]?.label || "Polyvalent",
    candidate_refs: run.candidate_refs || [],
    verdict: decision.verdict,
    confidence: decision.confidence,
    detail: decision.detail,
    limits: decision.limits || [],
    winner: decision.winner ? {
      model: decision.winner.model,
      score: decision.winner.recommendation_score,
      proof_score: Number(decision.winner.recommendation_proof?.score || 0),
      checks: `${decision.winner.recommendation_proof?.passed_count || 0}/${decision.winner.recommendation_proof?.total_count || 0}`,
      tokens_per_second: Number(decision.winner.estimated_tokens_per_second || 0),
      elapsed_ms: Number(decision.winner.elapsed_ms || 0),
      resources: decision.winner.resource_estimates || null
    } : null,
    results: (run.results || []).map((item) => ({
      model: item.model,
      success: Boolean(item.success),
      recommendation_score: recommendationResultScore(item, run.profile),
      resource_efficiency_score: recommendationResourceScore(item),
      proof_score: Number(item.recommendation_proof?.score || 0),
      checks: item.recommendation_proof ? `${item.recommendation_proof.passed_count}/${item.recommendation_proof.total_count}` : null,
      usage_passed: Boolean(item.recommendation_proof?.checks?.find((check) => check.key === "usage")?.passed),
      tokens_per_second: Number(item.estimated_tokens_per_second || 0),
      elapsed_ms: Number(item.elapsed_ms || 0),
      resources: item.resource_estimates || null,
      error: item.error || null
    }))
  };
}

function renderRecommendationEngine(profileKey = readUsageProfileKey()) {
  const profile = USAGE_PROFILES[profileKey] || USAGE_PROFILES.polyvalent;
  const candidates = recommendationEngineCandidates(profileKey, 2);
  const run = readRecommendationRun();
  const currentRun = run?.profile === profileKey && recommendationRunMatchesCurrentMachine(run) ? run : null;
  const decision = currentRun ? recommendationDecision(currentRun) : null;
  const missing = candidates.filter((item) => !isOllamaModelInstalled(item.ref));
  const actionLabel = recommendationEngineBusy
    ? "Comparaison en cours..."
    : missing.length
      ? `Installer ${missing.length} modèle(s) et comparer`
      : `Comparer ${candidates.length} modèle(s)`;
  return `
    <div class="recommendation-engine-card ${decision?.winner ? "has-decision" : ""}">
      <div class="recommendation-engine-head">
        <div>
          <span class="label">Recommendation Engine v2</span>
          <strong>Meilleur modèle pour ${escapeHtml(profile.label)}</strong>
          <p>Mêmes preuves communes, plus un test ${escapeHtml(recommendationUsageTask(profileKey).label.toLowerCase())}.</p>
        </div>
        <em>${decision ? `confiance ${escapeHtml(decision.confidence)}` : "à mesurer"}</em>
      </div>
      <div class="recommendation-candidates">
        ${candidates.length ? candidates.map((item) => {
          const resources = recommendationCandidateResources(item);
          return `
          <div>
            <strong>${escapeHtml(item.ref)}</strong>
            <span>${escapeHtml(isOllamaModelInstalled(item.ref) ? "installé" : `à télécharger · ${estimatedModelSizeLabel(item.ref)}`)}</span>
            <small>${escapeHtml(resources.vram_required_q4_gb ? `${resources.vram_required_q4_gb} Go VRAM Q4 estimés` : "VRAM à mesurer")} · ${escapeHtml(resources.fit)}</small>
          </div>
        `; }).join("") : "<p>Le scan et le catalogue doivent fournir au moins deux modèles actionnables.</p>"}
      </div>
      ${decision ? `
        <div class="recommendation-decision">
          <span>Décision mesurée</span>
          <strong>${escapeHtml(decision.verdict)}</strong>
          <p>${escapeHtml(decision.detail)}</p>
          <p>${escapeHtml(decision.limits.join(" "))}</p>
          <div class="recommendation-ranking">
            ${decision.ranked.map((item, index) => `<span>${index + 1}. ${escapeHtml(item.model)} · ${escapeHtml(item.recommendation_score)}/100 · ${escapeHtml(item.recommendation_proof.passed_count)}/${escapeHtml(item.recommendation_proof.total_count)} preuves · ${escapeHtml(item.estimated_tokens_per_second || 0)} tok/s · ${escapeHtml(item.elapsed_ms || 0)} ms · ${escapeHtml(item.resource_estimates?.storage_label || "stockage à confirmer")}</span>`).join("")}
          </div>
        </div>
      ` : run ? `<p class="recommendation-stale">Dernière décision obtenue pour ${escapeHtml(USAGE_PROFILES[run.profile]?.label || run.profile)} ou une autre machine. Relance pour ce profil matériel.</p>` : ""}
      <div class="row-actions compact-actions recommendation-engine-actions">
        <button type="button" data-run-recommendation="${escapeHtml(profileKey)}" ${recommendationEngineBusy || candidates.length < 2 ? "disabled" : ""}>${escapeHtml(actionLabel)}</button>
        ${decision?.winner ? `<button type="button" data-post-install-chat="${escapeHtml(decision.winner.model)}">Utiliser le gagnant</button>` : ""}
      </div>
      <p class="fine-note">Aucun modèle n'est supprimé automatiquement. La décision compare uniquement les candidats testés sur cette machine.</p>
    </div>
  `;
}

function usageProfileModelRef(profileKey = readUsageProfileKey()) {
  const profile = USAGE_PROFILES[profileKey] || USAGE_PROFILES.polyvalent;
  const recommendationRun = readRecommendationRun();
  const recommendation = recommendationRun?.profile === profileKey && recommendationRunMatchesCurrentMachine(recommendationRun)
    ? recommendationDecision(recommendationRun)
    : null;
  if (recommendation?.winner?.model && isOllamaModelInstalled(recommendation.winner.model)) {
    return normalizeOllamaRef(recommendation.winner.model);
  }
  const arena = arenaWinners(readLastArenaRun()?.results || []);
  const arenaModel = arena?.[profile.arena]?.model;
  if (arenaModel && isOllamaModelInstalled(arenaModel)) return normalizeOllamaRef(arenaModel);
  if (profileKey === "chat") {
    return installedModelForPatterns([/hermes/i, /mistral/i, /llama/i]) || recommendedModelState().ref || "qwen3:0.6b";
  }
  if (profileKey === "code") {
    return installedModelForPatterns([/deepseek/i, /coder/i, /code/i])
      || installedModelForPatterns([/qwen/i], { exclude: [/0\.6b/i] })
      || recommendedModelState().ref
      || "qwen3:0.6b";
  }
  if (profileKey === "memory") {
    return installedModelForPatterns([/hermes/i]) || recommendedModelState().ref || "qwen3:0.6b";
  }
  if (profileKey === "french") {
    return installedModelForPatterns([/mistral/i, /hermes/i, /qwen/i], { exclude: [/0\.6b/i] })
      || recommendedModelState().ref
      || "qwen3:0.6b";
  }
  if (profileKey === "portable") {
    return installedModelForPatterns([/qwen3:0\.6b/i, /mini/i, /3b/i, /7b/i, /8b/i])
      || "qwen3:0.6b";
  }
  return arena?.compromise?.model || recommendedModelState().ref || Array.from(installedOllamaRefs())[0] || "qwen3:0.6b";
}

function usageProfilePack(profileKey = readUsageProfileKey()) {
  const profile = USAGE_PROFILES[profileKey] || USAGE_PROFILES.polyvalent;
  const test = TEST_PROFILES[profile.test] || TEST_PROFILES.simple;
  const model = usageProfileModelRef(profileKey);
  const installed = model ? isOllamaModelInstalled(model) : false;
  const benchmarked = model ? hasSuccessfulBenchmarkFor(model) : false;
  const vram = Number(state.scan?.vram_gb || 0);
  const ram = Number(state.scan?.ram_gb || 0);
  const context = (() => {
    if (profileKey === "portable") return "Contexte court 2k-4k, réponse concise.";
    if (profileKey === "memory") return vram >= 16 || ram >= 48 ? "Contexte long 8k-16k si le runtime suit." : "Contexte 4k-8k, notes courtes.";
    if (profileKey === "code") return "Contexte 4k-8k, snippets et debug court.";
    if (profileKey === "french") return "Contexte moyen, sortie française naturelle.";
    return vram >= 12 ? "Contexte 8k conseillé après benchmark." : "Contexte 4k conseillé pour rester fluide.";
  })();
  const quantization = (() => {
    if (profileKey === "portable" || vram <= 8) return "Q4 prioritaire pour préserver vitesse/RAM.";
    if (vram >= 16) return "Q4/Q5 selon qualité voulue, à valider au benchmark.";
    return "Q4 recommandé, Q5 seulement si le modèle reste fluide.";
  })();
  const action = !model
    ? { label: "Choisir un modèle", detail: "Lance le scan et charge les recommandations." }
    : !installed
      ? { label: "Installer le modèle du pack", detail: model }
      : !benchmarked
        ? { label: "Benchmarker le pack", detail: model }
        : { label: "Dialoguer avec le pack", detail: `${model} déjà mesuré` };
  return {
    key: profileKey,
    profile,
    test,
    model,
    installed,
    benchmarked,
    context,
    quantization,
    action
  };
}

function applyUsageProfile(profileKey) {
  const profile = USAGE_PROFILES[profileKey];
  if (!profile) return;
  try {
    localStorage.setItem(USAGE_PROFILE_KEY, profileKey);
  } catch (_) {
    // Best effort only.
  }
  const test = TEST_PROFILES[profile.test] || TEST_PROFILES.simple;
  const model = usageProfileModelRef(profileKey);
  if (els.benchmarkPromptInput) els.benchmarkPromptInput.value = test.prompt;
  if (els.chatPromptInput) els.chatPromptInput.value = profile.chat || test.prompt;
  if (els.chatModelInput && model) els.chatModelInput.value = model;
  renderPreparePanel();
  renderReadinessPanel();
  renderChatPresets();
  renderModelAutopilot();
  setStatus(`Profil ${profile.label} prêt`, "ok");
}

function applyOldPortablePreset() {
  applyUsageProfile("portable");
  setFieldTestProfile("old_laptop");
  const model = usageProfileModelRef("portable") || "qwen3:0.6b";
  const test = TEST_PROFILES.simple;
  if (els.benchmarkModelInput) els.benchmarkModelInput.value = model;
  if (els.chatModelInput) els.chatModelInput.value = model;
  if (els.benchmarkPromptInput) {
    els.benchmarkPromptInput.value = [
      "Contexte : tu réponds à un utilisateur sur un vieux PC ou un portable modeste.",
      "Objectif : dire quoi tester en IA locale sans promettre un gros modèle impossible.",
      "",
      test.prompt
    ].join("\n");
  }
  if (els.chatPromptInput) {
    els.chatPromptInput.value = "Explique simplement ce que ce vieux PC ou portable peut faire tourner en IA locale, avec une première étape concrète et encourageante.";
  }
  renderPreparePanel();
  renderFieldTestPanel();
  renderModelAutopilot();
  setStatus("Mode vieux PC / portable prêt : petit modèle, contexte court, preuve locale d'abord", "ok");
}

function useUsageProfilePack(target = "benchmark") {
  const pack = usageProfilePack();
  applyUsageProfile(pack.key);
  if (target === "chat") {
    if (pack.model && els.chatModelInput) els.chatModelInput.value = pack.model;
    if (els.chatPromptInput) els.chatPromptInput.value = pack.profile.chat || pack.test.prompt;
    els.chatPromptInput?.focus?.();
    setStatus(`Pack ${pack.profile.label} prêt pour le dialogue`, "ok");
    return;
  }
  if (pack.model && els.benchmarkModelInput) els.benchmarkModelInput.value = pack.model;
  if (els.benchmarkPromptInput) els.benchmarkPromptInput.value = pack.test.prompt;
  els.benchmarkPromptInput?.focus?.();
  renderModelAutopilot();
  setStatus(`Pack ${pack.profile.label} prêt pour benchmark`, "ok");
}

function renderScan(scan) {
  invalidateCapabilityPassport();
  state.modelAutopilotRun = null;
  state.upgradeDigitalTwinRun = null;
  state.scan = scan;
  const savedTwin = activeDigitalTwinScenario();
  applyDigitalTwinDraftToControls(savedTwin?.result?.draft || defaultDigitalTwinDraft());
  els.sourceText.textContent = scan.source || "local";
  els.machineKey.textContent = scan.machine_key || "machine locale";
  els.cpuText.textContent = scan.cpu_name || "CPU inconnu";
  els.ramText.textContent = formatGb(scan.ram_gb);
  els.gpuText.textContent = gpuDisplayLabel(scan);
  els.vramText.textContent = memoryDisplayLabel(scan);
  els.osText.textContent = `${scan.os_name || "OS"} ${scan.os_version || ""}`.trim();
  els.ollamaText.textContent = runtimeOllama(scan);
  if (els.topMachineKey) els.topMachineKey.textContent = scan.machine_key || "machine locale";
  if (els.topCpuText) els.topCpuText.textContent = scan.cpu_name || "CPU inconnu";
  if (els.topRamText) els.topRamText.textContent = formatGb(scan.ram_gb);
  if (els.topGpuText) els.topGpuText.textContent = gpuDisplayLabel(scan);
  if (els.topVramText) els.topVramText.textContent = memoryDisplayLabel(scan);
  if (els.topOsText) els.topOsText.textContent = `${scan.os_name || "OS"} ${scan.os_version || ""}`.trim();
  if (els.topOllamaText) els.topOllamaText.textContent = topRuntimeOllama(scan);
  renderHardwareDoctor(scan);
  renderModelAutopilot();
  renderFlightRecorder();
  renderCapabilityPassportPanel();
  renderWslRuntime(scan);
  els.checkBtn.disabled = false;
  els.memoryBtn.disabled = false;
  els.saveBtn.disabled = false;
  els.refreshCatalogBtn.disabled = false;
  refreshAuthState();

  const installed = scan.installed_models || [];
  els.installedCount.textContent = `${installed.length} modèle${installed.length > 1 ? "s" : ""}`;
  els.installedList.className = installed.length ? "list" : "list empty";
  els.installedList.innerHTML = installed.length
    ? installed.map((model) => {
        const ref = modelLabel(model);
        return `
        <div class="list-item model-card installed-model-card">
          <div class="model-card-head">
            <strong>${escapeHtml(ref)}</strong>
            <em>Installé</em>
          </div>
          <span>${model.size_gb ? `${Number(model.size_gb).toFixed(1)} Go` : "taille inconnue"} - ${escapeHtml(model.source || model.runtime || "local")}</span>
          ${renderModelActions({ name: ref, ollama: ref })}
        </div>
      `;
      }).join("")
    : "Aucun modèle Ollama détecté.";
  renderFirstTestPanel();
  renderPreparePanel();
  renderReadinessPanel();
  renderArenaPanel();
  renderPrivateWorkloadPanel();
  renderStrategyBridgePanel();
  renderFieldTestPanel();
  renderFlightRecorder();
  renderPrimaryAction();
}

function renderCompatibility(payload) {
  state.compatibility = payload;
  state.upgradeDigitalTwinRun = null;
  const compatibility = payload.compatibility || payload;
  const score = normalizeScore(compatibility.score ?? compatibility.compatibility_score ?? null);
  els.scoreText.textContent = score === null ? "--" : `${score}/100`;
  els.scoreText.className = score >= 80 ? "ok" : score >= 55 ? "warn" : "bad";

  const verdict = compatibility.summary
    || compatibility.verdict
    || compatibility.recommendation
    || compatibility.score?.summary
    || compatibility.score?.label
    || fallbackVerdict(state.scan);
  els.verdictBox.innerHTML = renderVerdict(score, verdict, compatibility, state.scan);

  const upgrades = compatibility.upgrades || compatibility.recommended_upgrades || compatibility.shopping_list || [];

  const models = extractModels(compatibility);
  const rankedModels = sortRecommendedModels(models.filter((model) => actionableOllamaRef(model)));
  const visibleModels = [
    ...rankedModels,
    ...models.filter((model) => !actionableOllamaRef(model))
  ];
  els.modelCount.textContent = `${models.length} modèle${models.length > 1 ? "s" : ""}`;
  els.modelList.className = models.length ? "list" : "list empty";
  els.modelList.innerHTML = models.length
    ? groupedModelCards(visibleModels.slice(0, 16))
    : "Aucun modèle renvoyé par l'API pour cette machine.";

  const blocked = compatibility.blocked_next || compatibility.blocked || [];
  renderUpgradeImpact(compatibility, blocked, upgrades);
  const effectiveUpgrades = compatibilityUpgradesForCurrentDecision(compatibility);
  renderUpgrades(effectiveUpgrades);
  renderBuyingGuide(compatibility, effectiveUpgrades);
  const machineMemory = Math.max(Number(state.scan?.vram_gb || 0), effectiveModelMemoryGb(state.scan));
  const blockedRows = Array.isArray(blocked) ? blocked.slice(0, 12) : [];
  const nearBlocked = [];
  const avoidBlocked = [];
  for (const model of blockedRows) {
    const need = Number(model.vram_q4 || model.vram || model.vram_gb || 0);
    if (need > 0 && machineMemory > 0 && need > machineMemory * 1.7) avoidBlocked.push(model);
    else nearBlocked.push(model);
  }
  const blockedSections = [
    nearBlocked.length ? `<div class="list-section-title">Limites proches</div>${nearBlocked.slice(0, 6).map((model) => blockedModelCard(model, "Palier proche")).join("")}` : "",
    avoidBlocked.length ? `<div class="list-section-title">À éviter maintenant</div>${avoidBlocked.slice(0, 6).map((model) => blockedModelCard(model, "À éviter")).join("")}` : ""
  ].filter(Boolean);
  els.blockedCount.textContent = `${blocked.length} bloqué${blocked.length > 1 ? "s" : ""}`;
  els.blockedList.className = blocked.length ? "list" : "list empty";
  els.blockedList.innerHTML = blocked.length
    ? blockedSections.join("")
    : "Aucun palier bloqué renvoyé. La machine est cohérente pour son segment.";

  const newModels = compatibility.new || compatibility.new_models || [];
  els.newModelCount.textContent = `${newModels.length} nouveau${newModels.length > 1 ? "x" : ""}`;
  els.newModelList.className = newModels.length ? "list" : "list empty";
  els.newModelList.innerHTML = newModels.length
    ? newModels.slice(0, 8).map((model) => `
        <div class="list-item model-card new-model-card">
          <div class="model-card-head">
            <strong>${escapeHtml(model.name || model.model_name || model.model || "modèle")}</strong>
            <em>Nouveau</em>
          </div>
          <span>${escapeHtml(modelLine(model))}</span>
        </div>
      `).join("")
    : "Aucun nouveau modèle signalé par le catalogue pour cette machine.";

  renderCommands(models);
  const actions = renderActionPlan(compatibility, models, blocked, effectiveUpgrades, newModels);
  renderDecisionPack(compatibility, models, blocked, effectiveUpgrades, newModels, actions);
  renderCatalogStatus(compatibility);
  renderFirstTestPanel();
  renderPreparePanel();
  renderReadinessPanel();
  renderArenaPanel();
  renderPrivateWorkloadPanel();
  renderStrategyBridgePanel();
  renderFieldTestPanel();
  renderFlightRecorder();
  renderPrimaryAction();
}

function blockedModelCard(model, label) {
  const reason = label === "À éviter"
    ? "Trop lourd pour cette machine sans gros upgrade."
    : "Possible après upgrade ou avec fortes concessions.";
  return `
    <div class="list-item model-card blocked-card">
      <div class="model-card-head">
        <strong>${escapeHtml(model.name || model.model_name || model.model || "modèle")}</strong>
        <em>${escapeHtml(label)}</em>
      </div>
      <span>${escapeHtml(modelLine(model))}</span>
      <span>${escapeHtml(reason)}</span>
    </div>
  `;
}

function extractModels(compatibility) {
  const candidates = [
    compatibility.compatible,
    compatibility.model_recommendations,
    compatibility.models,
    compatibility.compatible_models,
    compatibility.validated_models
  ];
  return candidates.find(Array.isArray) || [];
}

function normalizeScore(value) {
  if (typeof value === "number") return value;
  if (value && typeof value.score === "number") return value.score;
  return null;
}

function scoreLabel(score) {
  if (score === null) return "À vérifier";
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Très solide";
  if (score >= 55) return "Correct";
  if (isLegacyPascalMachine() && score >= 35) return "Ancien mais utile";
  if (score >= 35) return "Limité";
  return "À upgrader";
}

function machineEncouragement(scan) {
  const gpu = String(scan?.gpu_name || "").toLowerCase();
  const gpuUnknown = gpuProbeIsUnknown(scan);
  const vram = Number(scan?.vram_gb || 0);
  const ram = Number(scan?.ram_gb || 0);
  const storage = Number(scan?.storage_free_gb || scan?.free_storage_gb || 0);
  if (!scan) {
    return {
      title: "Diagnostic à lancer",
      text: "Scanne la machine pour obtenir un verdict utile, pas une note abstraite.",
      blocker: "Aucun blocage identifié avant scan.",
      action: "Scanner ce PC"
    };
  }
  if (gpuUnknown) {
    return {
      title: "GPU à confirmer",
      text: "Le scan matériel n'a pas obtenu de preuve GPU fiable. Cela ne signifie pas que cette machine est CPU-only.",
      blocker: "Pilote, permissions ou outil système peuvent masquer le GPU et la VRAM.",
      action: "Vérifier le pilote puis rescanner"
    };
  }
  if (gpu.includes("1080 ti") || gpu.includes("1080ti")) {
    return {
      title: "Ancien GPU encore intéressant",
      text: "11 Go VRAM restent utiles pour tester de vrais modèles locaux. Commence léger, mesure, puis compare un modèle plus ambitieux.",
      blocker: "Les gros modèles seront surtout limités par VRAM, quantization et vitesse réelle.",
      action: "Tester le modèle léger"
    };
  }
  if (vram >= 24) {
    return {
      title: "Grosse marge VRAM",
      text: "La machine peut viser des modèles qualité, Hermes/Qwen plus ambitieux et des comparaisons Arena.",
      blocker: storage && storage < 80 ? "Surveille surtout le stockage disponible pour les gros modèles." : "Le prochain vrai filtre sera le benchmark local.",
      action: "Installer puis comparer"
    };
  }
  if (vram >= 16) {
    return {
      title: "Très bon PC IA locale",
      text: "Bon niveau pour des 7B/8B confortables et plusieurs 14B quantifiés selon runtime.",
      blocker: "Les 32B peuvent devenir limites : mesure avant d'acheter.",
      action: "Benchmark recommandé"
    };
  }
  if (vram >= 10) {
    return {
      title: "Bon ticket d'entrée",
      text: "La machine a assez de VRAM pour débuter sérieusement sans achat immédiat.",
      blocker: "La VRAM reste le palier principal pour monter en taille de modèle.",
      action: "Installer le test"
    };
  }
  if (vram > 0) {
    return {
      title: "GPU limité mais exploitable",
      text: "Tu peux déjà valider Ollama et des modèles légers. Évite les gros modèles tant qu'un benchmark n'a pas prouvé le contraire.",
      blocker: "Blocage probable : VRAM. L'upgrade GPU ne doit venir qu'après test.",
      action: "Commencer léger"
    };
  }
  if (ram >= 32) {
    return {
      title: "CPU/RAM à tester",
      text: "Pas de GPU IA évident, mais assez de RAM pour tenter des modèles légers et apprendre la chaîne locale.",
      blocker: "Blocage probable : vitesse et absence de VRAM dédiée.",
      action: "Test rapide"
    };
  }
  return {
    title: "Départ possible en léger",
    text: "On commence par vérifier la chaîne locale. Si ça rame, OutilsIA dira quel composant bloque vraiment.",
    blocker: "Blocage probable : RAM et/ou VRAM.",
    action: "Scanner puis tester"
  };
}

function renderVerdict(score, verdict, compatibility, scan) {
  const models = extractModels(compatibility);
  const blocked = compatibility.blocked_next || compatibility.blocked || [];
  const vram = Number.isFinite(Number(scan?.vram_gb)) ? `${Number(scan.vram_gb).toFixed(0)} Go VRAM` : "VRAM inconnue";
  const ram = Number.isFinite(Number(scan?.ram_gb)) ? `${Number(scan.ram_gb).toFixed(0)} Go RAM` : "RAM inconnue";
  const scoreText = score === null ? "--" : String(score);
  const scoreClass = score === null ? "neutral" : score >= 80 ? "ok" : score >= 55 ? "warn" : "bad";
  const encouragement = machineEncouragement(scan);
  const action = primaryActionState();
  const runtime = runtimeReadinessState();
  const recommended = topRecommendedModel();
  const recommendedRef = actionableOllamaRef(recommended);
  return `
    <div class="verdict-summary">
      <div class="score-orb ${scoreClass}">
        <strong>${escapeHtml(scoreText)}</strong>
        <span>/100</span>
      </div>
      <div>
        <span class="label">Potentiel matériel</span>
        <strong>${escapeHtml(scoreLabel(score))}</strong>
        <span>${escapeHtml(models.length)} modèle(s) compatibles · ${escapeHtml(blocked.length)} palier(s) proches</span>
      </div>
      <div class="runtime-readiness ${escapeHtml(runtime.tone)}">
        <span class="label">État du runtime</span>
        <strong>${escapeHtml(runtime.label)}</strong>
        <span>${escapeHtml(runtime.detail)}</span>
      </div>
    </div>
    <p>${escapeHtml(verdict)}</p>
    <div class="verdict-next">
      <div>
        <strong>${escapeHtml(encouragement.title)}</strong>
        <span>${escapeHtml(encouragement.text)}</span>
      </div>
      <div>
        <strong>${escapeHtml(action.label)}</strong>
        <span>${escapeHtml(action.status)}</span>
      </div>
      <div>
        <strong>${escapeHtml(recommendedRef ? "Modèle suivant" : "Blocage principal")}</strong>
        <span>${escapeHtml(recommendedRef ? `${modelTitle(recommended)} · ${recommendedRef}` : encouragement.blocker)}</span>
      </div>
    </div>
    <div class="verdict-metrics">
      <span>${escapeHtml(vram)}</span>
      <span>${escapeHtml(ram)}</span>
      <span>${escapeHtml(ollamaRuntimeLabel(scan))}</span>
    </div>
  `;
}

function upgradeText(item) {
  if (typeof item === "string") return item;
  return item.title || item.name || item.label || item.reason || JSON.stringify(item);
}

function upgradeEffectValue(item, key) {
  const effects = item?.effects && typeof item.effects === "object" ? item.effects : {};
  const value = Number(effects[key] ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function upgradeEffectPills(item) {
  const effects = [
    ["VRAM", upgradeEffectValue(item, "vram_gb"), "Go"],
    ["RAM", upgradeEffectValue(item, "ram_gb"), "Go"],
    ["Stockage", upgradeEffectValue(item, "storage_free_gb"), "Go libres"]
  ].filter(([, value]) => value > 0);
  if (!effects.length) {
    return `<span class="upgrade-effect-pill">Impact calculé après scan</span>`;
  }
  return effects.map(([label, value, unit]) => `
    <span class="upgrade-effect-pill"><strong>${escapeHtml(label)}</strong>${escapeHtml(value)} ${escapeHtml(unit)}</span>
  `).join("");
}

function renderUpgrades(upgrades) {
  if (digitalTwinSuppressesPurchases()) {
    els.upgradeList.innerHTML = `<div class="upgrade-item"><strong>N'achetez rien pour ce scénario</strong><span>Le Digital Twin actif ne démontre aucun nouveau palier utile. Modifiez le scénario ou produisez une nouvelle preuve locale avant achat.</span></div>`;
    return;
  }
  const normalized = Array.isArray(upgrades) ? upgrades.slice(0, 6) : [];
  const cards = normalized.length
    ? normalized.map((item, index) => {
        if (typeof item === "string") {
          return `<div class="upgrade-item"><strong>${escapeHtml(item)}</strong></div>`;
        }
        const guide = item.guide_url ? `<a href="${escapeHtml(absolutize(item.guide_url))}" target="_blank" rel="noopener noreferrer">Guide</a>` : "";
        const url = item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="sponsored nofollow noopener noreferrer">Voir prix</a>` : "";
        const price = item.price_range_eur ? `<span>Prix indicatif: ${escapeHtml(item.price_range_eur)}</span>` : "";
        const avoid = item.avoid ? `<span>À éviter: ${escapeHtml(item.avoid)}</span>` : "";
        const title = item.label || item.name || "Upgrade";
        const reason = item.reason || item.title || item.name || "";
        if (index === 0) {
          return `
            <div class="upgrade-item upgrade-hero-card">
              <div class="upgrade-hero-top">
                <span class="mini-pill">Upgrade prioritaire</span>
                <strong>${escapeHtml(title)}</strong>
              </div>
              <span>${escapeHtml(reason)}</span>
              <div class="upgrade-effects">${upgradeEffectPills(item)}</div>
              ${price}
              ${avoid ? `<span class="upgrade-warning">${escapeHtml(item.avoid)}</span>` : ""}
              <div class="upgrade-links">${guide}${url}</div>
            </div>
          `;
        }
        return `
          <div class="upgrade-item">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(reason)}</span>
            ${price}
            ${avoid}
            ${guide}${url}
          </div>
        `;
      }).join("")
    : `<div class="upgrade-item"><strong>Priorité VRAM</strong><span>VRAM d'abord, RAM ensuite, SSD NVMe si les modèles saturent le disque.</span></div>`;
  const disclosure = normalized.some((item) => typeof item === "object" && item?.url)
    ? `<small class="affiliate-disclosure">${escapeHtml(AFFILIATE_DISCLOSURE)}</small>`
    : "";
  els.upgradeList.innerHTML = `${cards}${disclosure}`;
}

function renderBuyingGuide(compatibility, upgrades) {
  if (digitalTwinSuppressesPurchases()) {
    els.buyingCount.textContent = "0 lien";
    els.buyingList.className = "buying-list empty";
    els.buyingList.textContent = "Aucun lien d'achat : le scénario Digital Twin actif conclut de conserver la machine.";
    return;
  }
  const links = buildBuyingLinks(compatibility, upgrades);
  els.buyingCount.textContent = `${links.length} lien${links.length > 1 ? "s" : ""}`;
  els.buyingList.className = links.length ? "buying-list" : "buying-list empty";
  els.buyingList.innerHTML = links.length
    ? `${links.map((link) => `
        <button type="button" class="buying-link" data-open-url="${escapeHtml(link.url)}">
          <strong>${escapeHtml(link.title)}</strong>
          <span>${escapeHtml(link.text)}</span>
        </button>
      `).join("")}<small class="affiliate-disclosure">${escapeHtml(AFFILIATE_DISCLOSURE)}</small>`
    : "Les liens utiles apparaîtront après diagnostic.";
}

function numberOrZero(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function knownHardwareText(value) {
  const text = String(value || "").trim();
  if (!text || /^(unknown|other|n\/a|not specified|to be filled by o\.e\.m\.)$/i.test(text)) return "";
  return text;
}

function knownNumberLabel(value, suffix = "") {
  return value === null || value === undefined ? "inconnu" : `${value}${suffix}`;
}

const DIGITAL_TWIN_RAM_COSTS = {
  32: { min: 60, max: 130 },
  64: { min: 130, max: 260 },
  128: { min: 260, max: 600 }
};

const DIGITAL_TWIN_STORAGE_COSTS = {
  1000: { min: 60, max: 110 },
  2000: { min: 100, max: 180 }
};

const DIGITAL_TWIN_PRICE_METADATA = {
  currency: "EUR",
  basis: "internal_editorial_range",
  as_of: "2026-07-11",
  source: "Estimation interne OutilsIA France ; prix non temps réel",
  is_live: false
};
const AFFILIATE_DISCLOSURE = "Certains liens matériels sont affiliés. Le prix payé reste identique ; OutilsIA peut recevoir une commission.";

function boundedDigitalTwinNumber(value, min = 0, max = 10_000) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function digitalTwinMachineSnapshot(scan = state.scan || {}) {
  const memory = scan?.raw_scan?.memory_probe || {};
  const board = scan?.raw_scan?.motherboard_probe || {};
  const gpu = scan?.raw_scan?.gpu_probe || {};
  return {
    machine_key: scan.machine_key || "",
    name: scan.name || "Machine non scannée",
    os: [scan.os_name, scan.os_version].filter(Boolean).join(" "),
    unified_memory: Boolean(scan.unified_memory),
    ram: {
      total_gb: numberOrNull(scan.ram_gb ?? memory.total_gb),
      type: knownHardwareText(memory.memory_type),
      module_count: numberOrNull(memory.module_count),
      motherboard_slots: numberOrNull(board.memory_slots),
      motherboard_max_gb: numberOrNull(board.max_memory_gb),
      channel_mode: memory.channel_mode || "unknown",
      configured_clock_mhz: numberOrNull(memory.configured_clock_mhz ?? memory.speed_mhz),
      source: memory.source || "not_detected"
    },
    motherboard: {
      label: motherboardLabel(board),
      manufacturer: board.manufacturer || "",
      product: board.product || "",
      bios_version: board.bios_version || "",
      source: board.source || "not_detected"
    },
    gpu: {
      name: scan.gpu_name || gpu.name || gpuDisplayLabel(scan),
      vendor: detectedGpuVendor(scan, gpu) || scan.gpu_vendor || "",
      vram_gb: numberOrNull(scan.vram_gb ?? gpu.vram_gb),
      driver_version: gpu.driver_version || "",
      pcie_width_current: numberOrNull(gpu.pcie_link_width_current),
      pcie_width_max: numberOrNull(gpu.pcie_link_width_max),
      pcie_generation_current: numberOrNull(gpu.pcie_link_gen_current),
      pcie_generation_max: numberOrNull(gpu.pcie_link_gen_max),
      power_limit_w: numberOrNull(gpu.power_limit_w),
      temperature_c: numberOrNull(gpu.temperature_c),
      source: gpu.source || "not_detected"
    },
    storage_free_gb: numberOrNull(scan.storage_free_gb),
    runtime: {
      ollama: Boolean(scan.runtimes?.ollama?.installed),
      ollama_wsl: Boolean(scan.runtimes?.ollama_wsl?.installed || scan.runtimes?.wsl?.ollama_ready),
      rocm_version: gpu.rocm_version || "",
      cuda_driver_max: gpu.cuda_version || ""
    }
  };
}

function defaultDigitalTwinDraft() {
  return {
    name: "Upgrade à étudier",
    gpu_target: "current",
    ram_target_gb: 0,
    storage_add_gb: 0,
    planned_psu_w: 0,
    psu_purchase_required: false,
    case_clearance_mm: 0,
    candidate_gpu_length_mm: 0,
    airflow: "unknown",
    cooling_purchase_required: false
  };
}

function normalizeDigitalTwinDraft(draft = {}) {
  const defaults = defaultDigitalTwinDraft();
  const gpuTarget = DIGITAL_TWIN_GPU_TARGETS[draft.gpu_target] ? draft.gpu_target : "current";
  const ramTarget = [0, 32, 64, 128].includes(Number(draft.ram_target_gb)) ? Number(draft.ram_target_gb) : 0;
  const storageAdd = [0, 1000, 2000].includes(Number(draft.storage_add_gb)) ? Number(draft.storage_add_gb) : 0;
  const airflow = ["unknown", "standard", "high"].includes(draft.airflow) ? draft.airflow : "unknown";
  return {
    ...defaults,
    name: String(draft.name || defaults.name).trim().slice(0, 64) || defaults.name,
    gpu_target: gpuTarget,
    ram_target_gb: ramTarget,
    storage_add_gb: storageAdd,
    planned_psu_w: boundedDigitalTwinNumber(draft.planned_psu_w, 0, 2000),
    psu_purchase_required: Boolean(draft.psu_purchase_required),
    case_clearance_mm: boundedDigitalTwinNumber(draft.case_clearance_mm, 0, 1000),
    candidate_gpu_length_mm: boundedDigitalTwinNumber(draft.candidate_gpu_length_mm, 0, 1000),
    airflow,
    cooling_purchase_required: Boolean(draft.cooling_purchase_required)
  };
}

function digitalTwinDraftFromControls() {
  return normalizeDigitalTwinDraft({
    name: els.digitalTwinScenarioName?.value,
    gpu_target: els.digitalTwinGpuSelect?.value,
    ram_target_gb: els.digitalTwinRamSelect?.value,
    storage_add_gb: els.digitalTwinStorageSelect?.value,
    planned_psu_w: els.digitalTwinPsuInput?.value,
    psu_purchase_required: Boolean(els.digitalTwinPsuPurchaseInput?.checked),
    case_clearance_mm: els.digitalTwinCaseClearanceInput?.value,
    candidate_gpu_length_mm: els.digitalTwinGpuLengthInput?.value,
    airflow: els.digitalTwinAirflowSelect?.value,
    cooling_purchase_required: Boolean(els.digitalTwinCoolingPurchaseInput?.checked)
  });
}

function applyDigitalTwinDraftToControls(draft = {}) {
  const normalized = normalizeDigitalTwinDraft(draft);
  if (els.digitalTwinScenarioName) els.digitalTwinScenarioName.value = normalized.name;
  if (els.digitalTwinGpuSelect) els.digitalTwinGpuSelect.value = normalized.gpu_target;
  if (els.digitalTwinRamSelect) els.digitalTwinRamSelect.value = String(normalized.ram_target_gb);
  if (els.digitalTwinStorageSelect) els.digitalTwinStorageSelect.value = String(normalized.storage_add_gb);
  if (els.digitalTwinPsuInput) els.digitalTwinPsuInput.value = String(normalized.planned_psu_w);
  if (els.digitalTwinPsuPurchaseInput) els.digitalTwinPsuPurchaseInput.checked = normalized.psu_purchase_required;
  if (els.digitalTwinCaseClearanceInput) els.digitalTwinCaseClearanceInput.value = String(normalized.case_clearance_mm);
  if (els.digitalTwinGpuLengthInput) els.digitalTwinGpuLengthInput.value = String(normalized.candidate_gpu_length_mm);
  if (els.digitalTwinAirflowSelect) els.digitalTwinAirflowSelect.value = normalized.airflow;
  if (els.digitalTwinCoolingPurchaseInput) els.digitalTwinCoolingPurchaseInput.checked = normalized.cooling_purchase_required;
  return normalized;
}

function digitalTwinPresetKey(draft = digitalTwinDraftFromControls()) {
  const normalized = normalizeDigitalTwinDraft(draft);
  if (normalized.gpu_target === "rtx3060_12gb") return "vram12";
  if (normalized.gpu_target === "rtx4060ti_16gb") return "vram16";
  if (normalized.gpu_target === "rtx3090_24gb") return "vram24";
  if (normalized.ram_target_gb === 64) return "ram64";
  const unchanged = normalized.gpu_target === "current"
    && normalized.ram_target_gb === 0
    && normalized.storage_add_gb === 0
    && normalized.planned_psu_w === 0
    && normalized.psu_purchase_required === false
    && normalized.airflow === "unknown"
    && normalized.cooling_purchase_required === false;
  return unchanged ? "auto" : "";
}

function readDigitalTwinStore() {
  const fallback = {
    schema: UPGRADE_DIGITAL_TWIN_PROTOCOL,
    scenarios: [],
    active_by_machine: {}
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(UPGRADE_DIGITAL_TWIN_STORE_KEY) || "null");
    if (!parsed || parsed.schema !== UPGRADE_DIGITAL_TWIN_PROTOCOL) return fallback;
    return {
      ...fallback,
      ...parsed,
      scenarios: Array.isArray(parsed.scenarios) ? parsed.scenarios.slice(0, MAX_UPGRADE_DIGITAL_TWIN_SCENARIOS) : [],
      active_by_machine: parsed.active_by_machine && typeof parsed.active_by_machine === "object" ? parsed.active_by_machine : {}
    };
  } catch (_) {
    return fallback;
  }
}

function writeDigitalTwinStore(store) {
  try {
    localStorage.setItem(UPGRADE_DIGITAL_TWIN_STORE_KEY, JSON.stringify({
      schema: UPGRADE_DIGITAL_TWIN_PROTOCOL,
      scenarios: (store.scenarios || []).slice(0, MAX_UPGRADE_DIGITAL_TWIN_SCENARIOS),
      active_by_machine: store.active_by_machine || {}
    }));
    return true;
  } catch (_) {
    return false;
  }
}

function digitalTwinCheck(key, label, status, detail, source = "") {
  return { key, label, status, detail, source };
}

function digitalTwinStatusLabel(value) {
  return ({ confirmed: "confirmé", probable: "probable", unknown: "inconnu", blocked: "bloqué", not_applicable: "conservé" })[value] || value || "inconnu";
}

function digitalTwinConfidenceLabel(value) {
  return ({ high: "élevée", mixed: "mixte", low: "faible" })[value] || value || "faible";
}

function digitalTwinCostComponents(machine, draft, gpuTarget) {
  const components = [];
  if (draft.gpu_target !== "current") {
    components.push({
      key: "gpu",
      label: gpuTarget.label,
      min_eur: gpuTarget.cost_eur.min,
      max_eur: gpuTarget.cost_eur.max,
      provenance: "catalogue OutilsIA 2026-07-11 ; prix non temps réel"
    });
  }
  if (draft.ram_target_gb > machine.ram.total_gb) {
    const range = DIGITAL_TWIN_RAM_COSTS[draft.ram_target_gb] || { min: 0, max: 0 };
    components.push({
      key: "ram",
      label: `${draft.ram_target_gb} Go ${machine.ram.type || "RAM"}`,
      min_eur: range.min,
      max_eur: range.max,
      provenance: "catalogue OutilsIA 2026-07-11 ; type et QVL à confirmer"
    });
  }
  if (draft.storage_add_gb > 0) {
    const range = DIGITAL_TWIN_STORAGE_COSTS[draft.storage_add_gb] || { min: 0, max: 0 };
    components.push({
      key: "storage",
      label: `SSD ${draft.storage_add_gb / 1000} To`,
      min_eur: range.min,
      max_eur: range.max,
      provenance: "catalogue OutilsIA 2026-07-11 ; interface à confirmer"
    });
  }
  if (draft.psu_purchase_required && draft.gpu_target !== "current") {
    const plannedPower = draft.planned_psu_w || gpuTarget.requirements.system_power_w || 0;
    components.push({
      key: "psu",
      label: plannedPower ? `Alimentation ${plannedPower} W` : "Alimentation à dimensionner",
      min_eur: plannedPower >= 850 ? 130 : 80,
      max_eur: plannedPower >= 850 ? 240 : 170,
      provenance: "fourchette OutilsIA indicative ; modèle, rendement et connecteurs à vérifier"
    });
  }
  if (draft.cooling_purchase_required) {
    components.push({
      key: "cooling",
      label: draft.airflow === "high" ? "Boîtier / refroidissement bon flux d'air" : "Boîtier / refroidissement à choisir",
      min_eur: 80,
      max_eur: 250,
      provenance: "fourchette OutilsIA indicative ; format et ventilateurs à vérifier"
    });
  }
  return components.map((item) => ({ ...item, ...DIGITAL_TWIN_PRICE_METADATA }));
}

function digitalTwinUnlockedUses(next) {
  const uses = [];
  if (next.vram_gb != null && next.vram_gb >= 12) uses.push("7B/8B confortables et plusieurs 14B quantifiés");
  if (next.vram_gb != null && next.vram_gb >= 16) uses.push("image locale, 14B plus sereins et contexte plus large");
  if (next.vram_gb != null && next.vram_gb >= 24) uses.push("32B quantifiés et davantage de marge d'offload GPU");
  if (next.ram_gb != null && next.ram_gb >= 64) uses.push("RAG, MemoryForge/Obsidian et multitâche plus lourd");
  if (next.ram_gb != null && next.ram_gb >= 128) uses.push("offload CPU et gros contextes à valider par benchmark");
  if ((next.storage_free_gb != null && next.storage_free_gb >= 500) || next.storage_added_gb >= 1000) uses.push("bibliothèque de modèles et datasets plus large");
  return [...new Set(uses)];
}

function buildUpgradeDigitalTwin(draftInput = digitalTwinDraftFromControls(), compatibilityInput = state.compatibility?.compatibility || state.compatibility || {}) {
  const draft = normalizeDigitalTwinDraft(draftInput);
  const machine = digitalTwinMachineSnapshot();
  if (!machine.machine_key) return null;
  const gpuTarget = DIGITAL_TWIN_GPU_TARGETS[draft.gpu_target] || DIGITAL_TWIN_GPU_TARGETS.current;
  const currentModelMemoryKnown = !machine.unified_memory && machine.gpu.vram_gb != null;
  const currentModelMemory = currentModelMemoryKnown ? machine.gpu.vram_gb : null;
  const targetVram = draft.gpu_target === "current" ? machine.gpu.vram_gb : gpuTarget.vram_gb;
  const ramTargetSelected = draft.ram_target_gb > 0;
  const next = {
    ram_gb: ramTargetSelected
      ? (machine.ram.total_gb == null ? draft.ram_target_gb : Math.max(machine.ram.total_gb, draft.ram_target_gb))
      : machine.ram.total_gb,
    vram_gb: draft.gpu_target === "current" ? machine.gpu.vram_gb : targetVram,
    storage_free_gb: machine.storage_free_gb == null ? null : machine.storage_free_gb + draft.storage_add_gb,
    storage_added_gb: draft.storage_add_gb,
    gpu: draft.gpu_target === "current" ? machine.gpu.name : gpuTarget.label,
    planned_psu_w: draft.planned_psu_w,
    airflow: draft.airflow
  };
  const checks = [];
  const changedComponents = [];
  if (ramTargetSelected && (machine.ram.total_gb == null || draft.ram_target_gb > machine.ram.total_gb)) {
    changedComponents.push("ram");
    if (machine.ram.total_gb == null) {
      checks.push(digitalTwinCheck("ram_baseline", "RAM actuelle", "unknown", "La capacité RAM actuelle n'est pas exposée ; aucun gain avant/après ne peut être calculé.", machine.ram.source));
    }
    if (machine.ram.motherboard_max_gb && draft.ram_target_gb > machine.ram.motherboard_max_gb) {
      checks.push(digitalTwinCheck("ram_capacity", "Capacité RAM", "blocked", `${draft.ram_target_gb} Go dépassent le plafond détecté de ${machine.ram.motherboard_max_gb} Go.`, machine.motherboard.source));
    } else if (!machine.ram.motherboard_max_gb) {
      checks.push(digitalTwinCheck("ram_capacity", "Capacité RAM", "unknown", "Plafond carte mère non exposé : manuel constructeur/QVL requis.", machine.motherboard.source));
    } else {
      checks.push(digitalTwinCheck("ram_capacity", "Capacité RAM", "confirmed", `${draft.ram_target_gb} Go restent sous le plafond détecté de ${machine.ram.motherboard_max_gb} Go.`, machine.motherboard.source));
    }
    checks.push(machine.ram.type
      ? digitalTwinCheck("ram_type", "Type RAM", "probable", `${machine.ram.type} détectée ; le type correspond, mais fréquence, kit et QVL restent à vérifier.`, machine.ram.source)
      : digitalTwinCheck("ram_type", "Type RAM", "unknown", "Type DDR non exposé : ne pas acheter avant vérification du manuel ou de la référence des barrettes.", machine.ram.source));
    if (machine.ram.motherboard_slots && machine.ram.module_count === null) {
      checks.push(digitalTwinCheck("ram_slots", "Slots RAM", "unknown", `${machine.ram.motherboard_slots} slots carte mère détectés, mais le nombre de barrettes installées n'est pas exposé.`, machine.ram.source));
    } else if (machine.ram.motherboard_slots && machine.ram.module_count >= machine.ram.motherboard_slots) {
      checks.push(digitalTwinCheck("ram_slots", "Slots RAM", "probable", `${machine.ram.module_count}/${machine.ram.motherboard_slots} slots occupés : prévoir le remplacement du kit complet.`, machine.ram.source));
    } else if (machine.ram.motherboard_slots) {
      checks.push(digitalTwinCheck("ram_slots", "Slots RAM", "probable", `${machine.ram.module_count}/${machine.ram.motherboard_slots} slots détectés ; appairage et QVL restent à vérifier.`, machine.ram.source));
    } else {
      checks.push(digitalTwinCheck("ram_slots", "Slots RAM", "unknown", "Nombre de slots non confirmé.", machine.motherboard.source));
    }
  } else {
    checks.push(digitalTwinCheck("ram", "RAM", "not_applicable", "RAM conservée."));
  }

  if (draft.gpu_target !== "current") {
    changedComponents.push("gpu");
    if (!currentModelMemoryKnown) {
      checks.push(digitalTwinCheck(
        "gpu_baseline",
        "VRAM actuelle",
        "unknown",
        machine.unified_memory
          ? "La mémoire unifiée n'est pas une VRAM GPU directement comparable ; aucun downgrade ni modèle nouvellement débloqué ne sera affirmé."
          : "La mémoire modèle actuelle n'est pas exposée ; aucun modèle nouvellement débloqué ne sera affirmé.",
        machine.gpu.source
      ));
    }
    const pcieWidth = machine.gpu.pcie_width_max || machine.gpu.pcie_width_current;
    const pcieGen = machine.gpu.pcie_generation_max || machine.gpu.pcie_generation_current;
    if (pcieWidth >= 8) {
      checks.push(digitalTwinCheck("pcie", "Slot PCIe", "probable", `Lien x${pcieWidth}${pcieGen ? ` Gen ${pcieGen}` : ""} détecté ; compatibilité électrique probable, performances/BIOS à confirmer.`, machine.gpu.source));
    } else {
      checks.push(digitalTwinCheck("pcie", "Slot PCIe", "unknown", "Largeur du slot PCIe principal non confirmée par le système.", machine.gpu.source));
    }
    const requiredPower = gpuTarget.requirements.system_power_w || 0;
    if (!draft.planned_psu_w) {
      checks.push(digitalTwinCheck("psu", "Alimentation", "unknown", `${requiredPower} W recommandés pour la cible ; puissance et qualité de l'alimentation actuelle inconnues.`, gpuTarget.source_url));
    } else if (draft.planned_psu_w < requiredPower) {
      checks.push(digitalTwinCheck("psu", "Alimentation", "blocked", `${draft.planned_psu_w} W déclarés, sous les ${requiredPower} W recommandés.`, gpuTarget.source_url));
    } else {
      checks.push(digitalTwinCheck("psu", "Alimentation", "probable", `${draft.planned_psu_w} W déclarés pour ${requiredPower} W recommandés ; qualité, rails et âge restent à contrôler.`, gpuTarget.source_url));
    }
    checks.push(digitalTwinCheck("power_connectors", "Connecteurs GPU", "unknown", "Les connecteurs varient selon la carte exacte et ne sont pas détectables par l'OS.", gpuTarget.source_url));
    const candidateLength = draft.candidate_gpu_length_mm || gpuTarget.requirements.reference_length_mm || 0;
    if (draft.case_clearance_mm && candidateLength) {
      checks.push(digitalTwinCheck(
        "case_clearance",
        "Place dans le boîtier",
        draft.case_clearance_mm >= candidateLength ? "probable" : "blocked",
        `${draft.case_clearance_mm} mm disponibles pour ${candidateLength} mm ${draft.candidate_gpu_length_mm ? "déclarés pour la carte choisie" : "sur le modèle de référence"}.`,
        draft.candidate_gpu_length_mm ? "user_declared" : gpuTarget.source_url
      ));
    } else {
      checks.push(digitalTwinCheck("case_clearance", "Place dans le boîtier", "unknown", "Mesurer le boîtier et relever la longueur du modèle exact avant achat.", gpuTarget.source_url));
    }
    if (draft.airflow === "high") {
      checks.push(digitalTwinCheck("cooling", "Refroidissement", "probable", "Bon flux d'air déclaré ; températures à revalider après montage.", "user_declared"));
    } else if (draft.airflow === "standard" && gpuTarget.requirements.gpu_power_w <= 200) {
      checks.push(digitalTwinCheck("cooling", "Refroidissement", "probable", "Flux standard déclaré, cohérent avec cette enveloppe GPU ; contrôle thermique requis.", "user_declared"));
    } else {
      checks.push(digitalTwinCheck("cooling", "Refroidissement", "unknown", `${gpuTarget.requirements.gpu_power_w || "?"} W GPU : flux d'air et dégagement thermique à confirmer.`, gpuTarget.source_url));
    }
    checks.push(digitalTwinCheck("driver", "Pilote et runtime", "unknown", "La compatibilité du pilote cible n'est pas prouvée : installer le pilote officiel puis vérifier l'offload avec un benchmark OutilsIA.", gpuTarget.source_url));
  } else {
    checks.push(digitalTwinCheck("gpu", "GPU", "not_applicable", "GPU conservé."));
  }

  if (draft.storage_add_gb > 0) {
    changedComponents.push("storage");
    if (machine.storage_free_gb == null) {
      checks.push(digitalTwinCheck("storage_baseline", "Stockage libre actuel", "unknown", "Le stockage libre actuel n'est pas exposé ; seule la capacité ajoutée est connue.", "scan OutilsIA"));
    }
    checks.push(digitalTwinCheck("storage_interface", "Interface SSD", "unknown", "Le système ne confirme pas le slot M.2 libre, sa génération ni les lignes partagées ; manuel carte mère requis.", machine.motherboard.source));
  } else {
    checks.push(digitalTwinCheck("storage", "Stockage", "not_applicable", "Stockage conservé."));
  }

  const blockedModels = compatibilityInput.blocked_next || compatibilityInput.blocked || [];
  const newlyReachable = !currentModelMemoryKnown ? [] : (Array.isArray(blockedModels) ? blockedModels : [])
    .filter((model) => {
      const needed = numberOrZero(model.vram_q4);
      return needed > currentModelMemory && needed <= next.vram_gb;
    })
    .slice(0, 8);
  const costs = digitalTwinCostComponents(machine, draft, gpuTarget);
  const cost = costs.reduce((total, item) => ({ min: total.min + item.min_eur, max: total.max + item.max_eur }), { min: 0, max: 0 });
  const unknownCount = checks.filter((item) => item.status === "unknown").length;
  const probableCount = checks.filter((item) => item.status === "probable").length;
  const blockedCount = checks.filter((item) => item.status === "blocked").length;
  const comparableBenchmark = Boolean(successfulBenchmarkFor(prepareFlowState().testModel));
  const gpuDowngrade = draft.gpu_target !== "current"
    && currentModelMemory != null
    && currentModelMemory > 0
    && targetVram > 0
    && targetVram < currentModelMemory;
  let decision = "measure_first";
  if (blockedCount) decision = "blocked";
  else if (gpuDowngrade
    || (comparableBenchmark && currentModelMemoryKnown && machine.ram.total_gb != null && changedComponents.length === 0)
    || (comparableBenchmark && currentModelMemoryKnown && changedComponents.length > 0 && !newlyReachable.length && next.vram_gb <= currentModelMemory && (machine.ram.total_gb == null || next.ram_gb <= machine.ram.total_gb) && draft.storage_add_gb === 0)) decision = "no_buy";
  else if (newlyReachable.length || changedComponents.includes("storage") || changedComponents.includes("ram")) decision = "candidate";
  const labels = {
    blocked: "Scénario bloqué",
    no_buy: "N'achetez rien pour l'instant",
    candidate: "Scénario utile à vérifier",
    measure_first: "Mesurez avant d'acheter"
  };
  const uncertaintyCount = unknownCount + probableCount;
  const confidence = uncertaintyCount === 0 ? "high" : uncertaintyCount <= 2 ? "mixed" : "low";
  const proof = releaseProof();
  return {
    schema: UPGRADE_DIGITAL_TWIN_PROTOCOL,
    scenario_version: "1.0.0",
    generated_at: new Date().toISOString(),
    simulation_only: true,
    local_only: true,
    physical_field_proof: false,
    binding: {
      machine_key: machine.machine_key,
      app_version: proof.app_version || "",
      build_id: proof.build_id || "",
      source_commit: proof.source_commit || "",
      upgrade_catalog_version: compatibilityInput.upgrade_catalog_version || state.desktopManifest?.upgrade_catalog_version || ""
    },
    draft,
    current: machine,
    target: {
      ...next,
      gpu_profile: gpuTarget,
      changed_components: changedComponents
    },
    compatibility: {
      status: blockedCount ? "blocked" : unknownCount ? "unknown" : probableCount ? "probable" : "compatible",
      confidence,
      checks,
      unknown_count: unknownCount,
      probable_count: probableCount,
      blocked_count: blockedCount,
      statement: blockedCount
        ? "Au moins une contrainte bloque ce scénario avec les données fournies."
        : unknownCount
          ? "Aucun achat ne doit être déclenché avant vérification des inconnues physiques."
          : probableCount
            ? "Les contraintes renseignées sont plausibles, mais les contrôles probables et la QVL doivent être vérifiés avant achat."
            : "Les contraintes renseignées sont cohérentes ; montage et benchmark restent nécessaires."
    },
    impact: {
      newly_reachable_models: newlyReachable,
      unlocked_uses: digitalTwinUnlockedUses(next),
      estimated_gpu_power_w: gpuTarget.requirements.gpu_power_w || machine.gpu.power_limit_w || 0,
      estimated_power_delta_w: gpuTarget.requirements.gpu_power_w && machine.gpu.power_limit_w
        ? gpuTarget.requirements.gpu_power_w - machine.gpu.power_limit_w
        : null,
      cost_eur: cost,
      cost_components: costs,
      cost_is_live: false,
      cost_metadata: DIGITAL_TWIN_PRICE_METADATA
    },
    decision: {
      key: decision,
      label: labels[decision],
      rationale: decision === "blocked"
        ? "Corriger les contraintes bloquantes avant toute commande."
        : decision === "no_buy"
          ? (gpuDowngrade
              ? "La cible réduit une capacité GPU mesurée et ne constitue pas un upgrade utile."
              : "La machine et la preuve locale ne montrent aucun nouveau palier utile dans ce scénario.")
          : decision === "candidate"
            ? "Le scénario apporte une capacité identifiable, mais les inconnues physiques doivent être levées."
            : "Le bénéfice n'est pas encore démontré par les données disponibles."
    },
    provenance: [
      { kind: "measured", source: "scan OutilsIA", fields: ["machine", "RAM si exposée", "GPU", "VRAM si exposée", "stockage si exposé", "PCIe quand exposé"] },
      { kind: "catalog", source: gpuTarget.provenance, url: gpuTarget.source_url || "", fields: ["VRAM cible", "puissance GPU", "alimentation recommandée"] },
      { kind: "user_declared", source: "contrôles Digital Twin", fields: ["alimentation disponible ou visée", "place boîtier", "longueur carte", "refroidissement", "composants à acheter"] },
      { kind: "estimated", source: "catalogue OutilsIA", fields: ["coût des composants cochés à acheter", "usages débloqués"] }
    ]
  };
}

function digitalTwinHistoryForMachine(machineKey = state.scan?.machine_key || "") {
  return readDigitalTwinStore().scenarios.filter((item) => item?.binding?.machine_key === machineKey);
}

function activeDigitalTwinScenario() {
  const machineKey = state.scan?.machine_key || "";
  if (!machineKey) return null;
  const store = readDigitalTwinStore();
  const id = store.active_by_machine[machineKey] || "";
  return store.scenarios.find((item) => item.id === id) || null;
}

function digitalTwinSummary() {
  const run = state.upgradeDigitalTwinRun || null;
  if (!run || run.binding?.machine_key !== state.scan?.machine_key) return null;
  return {
    schema: UPGRADE_DIGITAL_TWIN_PROTOCOL,
    generated_at: run.generated_at,
    local_only: true,
    simulation_only: true,
    physical_field_proof: false,
    scenario_name: run.draft?.name || "",
    decision: run.decision,
    compatibility: {
      status: run.compatibility?.status || "unknown",
      confidence: run.compatibility?.confidence || "low",
      unknown_count: Number(run.compatibility?.unknown_count || 0),
      probable_count: Number(run.compatibility?.probable_count || 0),
      blocked_count: Number(run.compatibility?.blocked_count || 0)
    },
    target: {
      gpu: run.target?.gpu || "",
      vram_gb: numberOrNull(run.target?.vram_gb),
      ram_gb: numberOrNull(run.target?.ram_gb),
      storage_free_gb: numberOrNull(run.target?.storage_free_gb),
      storage_added_gb: numberOrZero(run.target?.storage_added_gb),
      changed_components: run.target?.changed_components || []
    },
    cost_eur: run.impact?.cost_eur || { min: 0, max: 0 },
    cost: {
      ...(run.impact?.cost_eur || { min: 0, max: 0 }),
      ...(run.impact?.cost_metadata || DIGITAL_TWIN_PRICE_METADATA)
    },
    cost_components: (run.impact?.cost_components || []).map((item) => ({
      key: item.key || "",
      label: item.label || "",
      min_eur: Number(item.min_eur || 0),
      max_eur: Number(item.max_eur || 0),
      currency: item.currency || DIGITAL_TWIN_PRICE_METADATA.currency,
      as_of: item.as_of || DIGITAL_TWIN_PRICE_METADATA.as_of,
      source: item.source || DIGITAL_TWIN_PRICE_METADATA.source,
      is_live: item.is_live === true,
      provenance: item.provenance || ""
    })),
    newly_reachable_models: (run.impact?.newly_reachable_models || []).map((model) => modelTitle(model)),
    unlocked_uses: run.impact?.unlocked_uses || []
  };
}

function digitalTwinSuppressesPurchases() {
  return digitalTwinSummary()?.decision?.key === "no_buy";
}

function compatibilityUpgradesForCurrentDecision(compatibility = state.compatibility?.compatibility || state.compatibility || {}) {
  if (digitalTwinSuppressesPurchases()) return [];
  return compatibility.upgrades || compatibility.recommended_upgrades || compatibility.shopping_list || [];
}

function digitalTwinExportDocument() {
  const run = state.upgradeDigitalTwinRun || null;
  const history = digitalTwinHistoryForMachine();
  return {
    schema: UPGRADE_DIGITAL_TWIN_PROTOCOL,
    exported_at: new Date().toISOString(),
    local_only: true,
    simulation_only: true,
    physical_field_proof: false,
    active: run,
    history,
    comparison: history.map((item) => ({
      id: item.id,
      scenario_name: item.result?.draft?.name || "Scénario",
      decision: item.result?.decision?.key || "not_calculated",
      compatibility: item.result?.compatibility?.status || "unknown",
      confidence: item.result?.compatibility?.confidence || "low",
      gpu: item.result?.target?.gpu || "",
      vram_gb: numberOrNull(item.result?.target?.vram_gb),
      ram_gb: numberOrNull(item.result?.target?.ram_gb),
      cost_eur: item.result?.impact?.cost_eur || { min: 0, max: 0 },
      cost: {
        ...(item.result?.impact?.cost_eur || { min: 0, max: 0 }),
        ...(item.result?.impact?.cost_metadata || DIGITAL_TWIN_PRICE_METADATA)
      },
      physical_field_proof: false
    }))
  };
}

function digitalTwinMarkdown(document = digitalTwinExportDocument()) {
  const run = document.active;
  if (!run) return "## Upgrade Digital Twin\n\n- Aucun scénario calculé.";
  const lines = [
    "## Upgrade Digital Twin",
    "",
    `- Scénario: ${run.draft.name || "Scénario sans nom"}`,
    `- Machine: ${run.current.name}`,
    `- Décision: ${run.decision.label}`,
    `- Compatibilité: ${run.compatibility.status} · confiance ${run.compatibility.confidence}`,
    "- Portée: simulation locale, aucune preuve terrain physique et aucun achat automatique.",
    `- GPU: ${run.current.gpu.name} -> ${run.target.gpu}`,
    `- VRAM utile: ${knownNumberLabel(run.current.gpu.vram_gb)} -> ${knownNumberLabel(run.target.vram_gb)} Go`,
    `- RAM: ${knownNumberLabel(run.current.ram.total_gb)} -> ${knownNumberLabel(run.target.ram_gb)} Go`,
    `- Stockage libre estimé: ${knownNumberLabel(run.current.storage_free_gb)} -> ${knownNumberLabel(run.target.storage_free_gb)} Go`,
    `- Coût indicatif non temps réel: ${run.impact.cost_eur.min}-${run.impact.cost_eur.max} ${run.impact.cost_metadata?.currency || "EUR"}`,
    `- Source prix: ${run.impact.cost_metadata?.source || DIGITAL_TWIN_PRICE_METADATA.source} · observation ${run.impact.cost_metadata?.as_of || DIGITAL_TWIN_PRICE_METADATA.as_of}`,
    "",
    "### Contrôles",
    "",
    ...run.compatibility.checks.map((item) => `- ${item.label}: ${item.status} · ${item.detail}`),
    "",
    "### Modèles et usages potentiels",
    "",
    ...(run.impact.newly_reachable_models.length
      ? run.impact.newly_reachable_models.map((model) => `- ${modelTitle(model)}: ${modelLine(model)}`)
      : ["- Aucun nouveau modèle proche prouvé par le catalogue courant."]),
    ...run.impact.unlocked_uses.map((item) => `- Usage: ${item}`),
    "",
    "### Provenance et limites",
    "",
    ...run.provenance.map((item) => `- ${item.kind}: ${item.source} · ${item.fields.join(", ")}`),
    `- Limite: ${run.compatibility.statement}`
  ];
  return lines.join("\n");
}

function applyUpgradeEffects(scan, upgrade) {
  const effects = upgrade?.effects && typeof upgrade.effects === "object" ? upgrade.effects : {};
  const next = {
    vram_gb: numberOrZero(scan?.vram_gb),
    ram_gb: numberOrZero(scan?.ram_gb),
    storage_free_gb: numberOrZero(scan?.storage_free_gb)
  };
  if (effects.vram_gb !== undefined) next.vram_gb = Math.max(next.vram_gb, numberOrZero(effects.vram_gb));
  if (effects.ram_gb !== undefined) next.ram_gb = Math.max(next.ram_gb, numberOrZero(effects.ram_gb));
  if (effects.storage_free_gb !== undefined) next.storage_free_gb = Math.max(next.storage_free_gb, numberOrZero(effects.storage_free_gb));
  const name = String(upgrade?.name || upgrade?.label || "").toLowerCase();
  if (name.includes("3060") || name.includes("12 go") || name.includes("12gb")) next.vram_gb = Math.max(next.vram_gb, 12);
  if (name.includes("4060") || name.includes("4070") || name.includes("16 go") || name.includes("16gb")) next.vram_gb = Math.max(next.vram_gb, 16);
  if (name.includes("3090") || name.includes("4090") || name.includes("24 go") || name.includes("24gb")) next.vram_gb = Math.max(next.vram_gb, 24);
  if (name.includes("32 go") || name.includes("32gb")) next.ram_gb = Math.max(next.ram_gb, 32);
  if (name.includes("64 go") || name.includes("64gb")) next.ram_gb = Math.max(next.ram_gb, 64);
  if (name.includes("ssd") || name.includes("nvme")) next.storage_free_gb = Math.max(next.storage_free_gb, 500);
  return next;
}

function readUpgradeSimTargetKey() {
  try {
    const saved = localStorage.getItem(UPGRADE_SIM_TARGET_KEY);
    if (saved && UPGRADE_SIM_TARGETS.some((target) => target.key === saved)) return saved;
  } catch (_) {
    // Best effort only.
  }
  return "auto";
}

function setUpgradeSimTarget(key) {
  const next = UPGRADE_SIM_TARGETS.some((target) => target.key === key) ? key : "auto";
  try {
    localStorage.setItem(UPGRADE_SIM_TARGET_KEY, next);
  } catch (_) {
    // Best effort only.
  }
  if (next === "auto") {
    applyDigitalTwinDraftToControls(defaultDigitalTwinDraft());
  } else if (next === "vram12") {
    applyDigitalTwinDraftToControls({ ...digitalTwinDraftFromControls(), gpu_target: "rtx3060_12gb" });
  } else if (next === "vram16") {
    applyDigitalTwinDraftToControls({ ...digitalTwinDraftFromControls(), gpu_target: "rtx4060ti_16gb" });
  } else if (next === "vram24") {
    applyDigitalTwinDraftToControls({ ...digitalTwinDraftFromControls(), gpu_target: "rtx3090_24gb" });
  } else if (next === "ram64") {
    applyDigitalTwinDraftToControls({ ...digitalTwinDraftFromControls(), ram_target_gb: 64 });
  }
  state.upgradeDigitalTwinRun = buildUpgradeDigitalTwin();
  invalidateCapabilityPassport();
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  renderUpgradeImpact(
    compatibility,
    compatibility.blocked_next || compatibility.blocked || [],
    compatibility.upgrades || compatibility.recommended_upgrades || compatibility.shopping_list || []
  );
  renderCapabilityPassportPanel();
  renderReadinessPanel();
  renderStrategyBridgePanel();
  renderFieldTestPanel();
  setStatus(`Digital Twin : ${UPGRADE_SIM_TARGETS.find((target) => target.key === next)?.label || "Auto"}`, "ok");
}

function upgradeSimulationPrimary(upgrades, targetKey = readUpgradeSimTargetKey()) {
  const target = UPGRADE_SIM_TARGETS.find((item) => item.key === targetKey) || UPGRADE_SIM_TARGETS[0];
  if (target.key === "auto") return Array.isArray(upgrades) ? upgrades.find((item) => item && typeof item === "object") : null;
  return {
    name: target.label,
    label: target.label,
    reason: target.reason,
    effects: target.effects || {},
    simulated: true
  };
}

function buildUpgradeImpact(compatibility, blocked, upgrades, targetKey = readUpgradeSimTargetKey()) {
  const selectedTarget = UPGRADE_SIM_TARGETS.find((item) => item.key === targetKey) || UPGRADE_SIM_TARGETS[0];
  const primary = upgradeSimulationPrimary(upgrades, selectedTarget.key);
  const scan = state.scan || {};
  const current = {
    vram_gb: numberOrZero(scan.vram_gb),
    ram_gb: numberOrZero(scan.ram_gb),
    storage_free_gb: numberOrZero(scan.storage_free_gb)
  };
  const next = primary ? applyUpgradeEffects(scan, primary) : current;
  const newlyReachable = (Array.isArray(blocked) ? blocked : [])
    .filter((model) => {
      const vramNeeded = numberOrZero(model.vram_q4);
      if (!vramNeeded) return false;
      return vramNeeded > current.vram_gb && vramNeeded <= next.vram_gb;
    })
    .slice(0, 5);
  return {
    primary,
    current,
    next,
    newlyReachable,
    score: normalizeScore(compatibility.score ?? compatibility.compatibility_score ?? null),
    guide: primary?.guide_url ? absolutize(primary.guide_url) : "",
    url: primary?.url || primary?.affiliate_url || "",
    price: primary?.price_range_eur || "",
    avoid: primary?.avoid || "",
    target: selectedTarget
  };
}

function upgradeImpactMarkdown(impact = currentUpgradeImpact()) {
  const title = impact.primary?.name || impact.primary?.label || "Aucun upgrade prioritaire";
  const lines = [
    "# Impact upgrade OutilsIA Local Cockpit",
    "",
    `- Date: ${new Date().toISOString()}`,
    `- Machine: ${state.scan?.name || "non scannée"}`,
    `- Score actuel: ${impact.score === null ? "non calculé" : `${impact.score}/100`}`,
    `- Simulation: ${impact.target?.label || "Auto"}`,
    `- Upgrade prioritaire: ${title}`,
    impact.price ? `- Prix indicatif: ${impact.price}` : "",
    impact.guide ? `- Guide: ${impact.guide}` : "",
    impact.url ? `- Prix du jour: ${impact.url}` : "",
    impact.avoid ? `- À éviter: ${impact.avoid}` : "",
    "",
    "## Avant / après",
    "",
    `- VRAM: ${impact.current.vram_gb || "?"} Go -> ${impact.next.vram_gb || "?"} Go`,
    `- RAM: ${impact.current.ram_gb || "?"} Go -> ${impact.next.ram_gb || "?"} Go`,
    `- Stockage libre: ${impact.current.storage_free_gb || "?"} Go -> ${impact.next.storage_free_gb || "?"} Go`,
    "",
    "## Modeles potentiellement debloques",
    "",
    ...(impact.newlyReachable.length
      ? impact.newlyReachable.map((model) => `- ${modelTitle(model)}: ${modelLine(model)}`)
      : ["- Aucun modèle proche débloqué par cet upgrade dans le catalogue actuel."])
  ].filter((line) => line !== "");
  return lines.join("\n");
}

function currentUpgradeImpact() {
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  return buildUpgradeImpact(
    compatibility,
    compatibility.blocked_next || compatibility.blocked || [],
    compatibility.upgrades || compatibility.recommended_upgrades || compatibility.shopping_list || [],
    readUpgradeSimTargetKey()
  );
}

function renderUpgradeImpact(compatibility, blocked, upgrades) {
  if (!state.scan) {
    els.upgradeImpactState.textContent = "scan requis";
    els.upgradeImpactBox.className = "upgrade-impact-box empty";
    els.upgradeImpactBox.textContent = "Le scan construira un jumeau matériel sans modifier la machine. Les inconnues physiques resteront à confirmer avant achat.";
    for (const control of [
      els.simulateDigitalTwinBtn,
      els.saveDigitalTwinBtn,
      els.restoreDigitalTwinBtn,
      els.copyUpgradeImpactBtn,
      els.copyDigitalTwinJsonBtn,
      els.copyDigitalTwinMarkdownBtn,
      els.downloadDigitalTwinJsonBtn,
      els.downloadDigitalTwinMarkdownBtn,
      els.pdfDigitalTwinBtn
    ]) if (control) control.disabled = true;
    return;
  }
  const run = state.upgradeDigitalTwinRun || buildUpgradeDigitalTwin(digitalTwinDraftFromControls(), compatibility);
  state.upgradeDigitalTwinRun = run;
  if (!run) return;
  const history = digitalTwinHistoryForMachine();
  const decisionClass = run.decision.key === "blocked"
    ? "is-blocked"
    : run.decision.key === "no_buy"
      ? "is-no-buy"
      : ["unknown", "probable"].includes(run.compatibility.status)
        ? "is-unknown"
        : "";
  const costLabel = run.impact.cost_eur.max > 0
    ? `${run.impact.cost_eur.min}-${run.impact.cost_eur.max} EUR indicatifs`
    : "aucun coût ajouté";
  const currentRam = knownNumberLabel(run.current.ram.total_gb);
  const currentVram = knownNumberLabel(run.current.gpu.vram_gb);
  els.upgradeImpactState.textContent = `${run.decision.label} · confiance ${digitalTwinConfidenceLabel(run.compatibility.confidence)}`;
  els.upgradeImpactBox.className = "upgrade-impact-box";
  const activePreset = digitalTwinPresetKey(run.draft);
  els.upgradeImpactBox.innerHTML = `
    <div class="upgrade-simulator">
      <strong>Raccourcis</strong>
      <span>Ils préremplissent le scénario ; le scan réel reste inchangé.</span>
      <div class="upgrade-sim-actions">
        ${UPGRADE_SIM_TARGETS.map((target) => `
          <button type="button" data-upgrade-sim-target="${escapeHtml(target.key)}" class="${target.key === activePreset ? "active" : ""}">${escapeHtml(target.label)}</button>
        `).join("")}
      </div>
    </div>
    <div class="digital-twin-verdict ${decisionClass}">
      <strong>${escapeHtml(run.decision.label)}</strong>
      <span>${escapeHtml(run.decision.rationale)}</span>
      <span>${escapeHtml(run.compatibility.statement)}</span>
    </div>
    <div class="digital-twin-section-title">Avant / après</div>
    <div class="digital-twin-grid">
      <div class="digital-twin-stat"><strong>GPU / VRAM</strong><span>${escapeHtml(run.current.gpu.name)} (${escapeHtml(currentVram)} Go) -> ${escapeHtml(run.target.gpu)} (${escapeHtml(knownNumberLabel(run.target.vram_gb))} Go)</span></div>
      <div class="digital-twin-stat"><strong>RAM</strong><span>${escapeHtml(currentRam)} -> ${escapeHtml(knownNumberLabel(run.target.ram_gb))} Go · ${escapeHtml(run.current.ram.type || "type inconnu")}</span></div>
      <div class="digital-twin-stat"><strong>Stockage</strong><span>${escapeHtml(knownNumberLabel(run.current.storage_free_gb))} -> ${escapeHtml(knownNumberLabel(run.target.storage_free_gb))} Go libres estimés${run.target.storage_added_gb ? ` · +${escapeHtml(run.target.storage_added_gb)} Go ajoutés` : ""}</span></div>
      <div class="digital-twin-stat"><strong>Budget</strong><span>${escapeHtml(costLabel)} · prix non temps réel</span></div>
      <div class="digital-twin-stat"><strong>Puissance GPU</strong><span>${escapeHtml(run.impact.estimated_gpu_power_w || "?")} W estimés${run.impact.estimated_power_delta_w == null ? " · delta inconnu" : ` · delta ${run.impact.estimated_power_delta_w >= 0 ? "+" : ""}${run.impact.estimated_power_delta_w} W`}</span></div>
      <div class="digital-twin-stat"><strong>Carte mère</strong><span>${escapeHtml(run.current.motherboard.label)}${run.current.motherboard.bios_version ? ` · BIOS ${escapeHtml(run.current.motherboard.bios_version)}` : ""}</span></div>
    </div>
    <div class="digital-twin-section-title">Contrôles de compatibilité</div>
    <div class="digital-twin-checks">
      ${run.compatibility.checks.map((item) => `
        <div class="digital-twin-check" data-status="${escapeHtml(item.status)}">
          <strong>${escapeHtml(item.label)} · ${escapeHtml(digitalTwinStatusLabel(item.status))}</strong>
          <span>${escapeHtml(item.detail)}</span>
          <small>Source : ${escapeHtml(item.source || "non exposée")}</small>
        </div>
      `).join("")}
    </div>
    <div class="digital-twin-section-title">Capacités potentielles</div>
    <ul class="digital-twin-list">
      ${run.impact.newly_reachable_models.length
        ? run.impact.newly_reachable_models.map((model) => `<li>Modèle : ${escapeHtml(modelTitle(model))}</li>`).join("")
        : "<li>Aucun nouveau modèle proche prouvé dans le catalogue courant.</li>"}
      ${run.impact.unlocked_uses.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
    <div class="digital-twin-section-title">Scénarios locaux</div>
    <div class="digital-twin-scenarios">
      ${history.length
        ? history.slice(0, 6).map((item) => `
          <div class="digital-twin-scenario">
            <strong>${escapeHtml(item.result?.draft?.name || "Scénario")}</strong>
            <span>${escapeHtml(item.result?.decision?.label || "non calculé")} · ${escapeHtml(item.result?.target?.gpu || "GPU actuel")} · ${escapeHtml(item.result?.target?.ram_gb || "?")} Go RAM</span>
            <button type="button" data-digital-twin-scenario="${escapeHtml(item.id)}">Activer</button>
          </div>
        `).join("")
        : '<div class="digital-twin-scenario"><strong>Aucun scénario enregistré</strong><span>La simulation courante reste locale tant que vous ne cliquez pas sur Enregistrer.</span></div>'}
    </div>
    <p class="flight-recorder-note">Simulation locale uniquement. Alimentation, connecteurs, dimensions exactes, slots libres et QVL nécessitent une vérification physique ou constructeur.</p>
  `;
  if (els.simulateDigitalTwinBtn) els.simulateDigitalTwinBtn.disabled = false;
  if (els.saveDigitalTwinBtn) els.saveDigitalTwinBtn.disabled = false;
  if (els.restoreDigitalTwinBtn) els.restoreDigitalTwinBtn.disabled = history.length < 2;
  for (const control of [els.copyUpgradeImpactBtn, els.copyDigitalTwinJsonBtn, els.copyDigitalTwinMarkdownBtn, els.downloadDigitalTwinJsonBtn, els.downloadDigitalTwinMarkdownBtn, els.pdfDigitalTwinBtn]) {
    if (control) control.disabled = false;
  }
}

async function copyUpgradeImpact() {
  if (!state.compatibility) {
    setStatus("Diagnostic requis avant copie de l'impact upgrade", "bad");
    return;
  }
  if (!state.upgradeDigitalTwinRun) simulateUpgradeDigitalTwin();
  const summary = digitalTwinSummary();
  await navigator.clipboard.writeText([
    "# Impact upgrade OutilsIA",
    "",
    `- Scénario: ${summary?.scenario_name || "non calculé"}`,
    `- Décision: ${summary?.decision?.label || "mesurer avant achat"}`,
    `- Compatibilité: ${summary?.compatibility?.status || "inconnue"} · confiance ${summary?.compatibility?.confidence || "faible"}`,
    `- Cible: ${summary?.target?.gpu || "GPU actuel"} · ${summary?.target?.ram_gb || "?"} Go RAM`,
    `- Budget indicatif non temps réel: ${summary?.cost_eur?.min || 0}-${summary?.cost_eur?.max || 0} EUR`,
    "- Simulation locale uniquement ; vérifier physiquement alimentation, connecteurs, dimensions et slots avant achat."
  ].join("\n"));
  setStatus("Impact Digital Twin copié", "ok");
}

function refreshDigitalTwinDependents() {
  invalidateCapabilityPassport();
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  const effectiveUpgrades = compatibilityUpgradesForCurrentDecision(compatibility);
  const models = extractModels(compatibility);
  const blocked = compatibility.blocked_next || compatibility.blocked || [];
  const newModels = compatibility.new || compatibility.new_models || [];
  renderUpgradeImpact(
    compatibility,
    blocked,
    effectiveUpgrades
  );
  renderUpgrades(effectiveUpgrades);
  renderBuyingGuide(compatibility, effectiveUpgrades);
  const actions = renderActionPlan(compatibility, models, blocked, effectiveUpgrades, newModels);
  renderCapabilityPassportPanel();
  renderReadinessPanel();
  renderStrategyBridgePanel();
  renderFieldTestPanel();
  renderDecisionPack(
    compatibility,
    models,
    blocked,
    effectiveUpgrades,
    newModels,
    actions
  );
}

function refreshDigitalTwinAfterProofChange() {
  if (!state.scan || !state.compatibility) return null;
  state.upgradeDigitalTwinRun = buildUpgradeDigitalTwin();
  refreshDigitalTwinDependents();
  return state.upgradeDigitalTwinRun;
}

function simulateUpgradeDigitalTwin() {
  if (!state.scan) {
    setStatus("Scan requis avant simulation Digital Twin", "warn");
    return null;
  }
  state.upgradeDigitalTwinRun = buildUpgradeDigitalTwin();
  refreshDigitalTwinDependents();
  const run = state.upgradeDigitalTwinRun;
  setStatus(`${run.decision.label} · compatibilité ${run.compatibility.status}`, run.decision.key === "blocked" ? "bad" : ["unknown", "probable"].includes(run.compatibility.status) ? "warn" : "ok");
  return run;
}

function saveUpgradeDigitalTwinScenario() {
  const result = simulateUpgradeDigitalTwin();
  if (!result) return null;
  const store = readDigitalTwinStore();
  const scenario = {
    id: `twin-${Date.now()}-${store.scenarios.length + 1}`,
    saved_at: new Date().toISOString(),
    binding: result.binding,
    result
  };
  store.scenarios = [scenario, ...store.scenarios].slice(0, MAX_UPGRADE_DIGITAL_TWIN_SCENARIOS);
  store.active_by_machine[result.binding.machine_key] = scenario.id;
  if (!writeDigitalTwinStore(store)) {
    setStatus("Impossible d'enregistrer le scénario Digital Twin", "bad");
    return null;
  }
  refreshDigitalTwinDependents();
  setStatus("Scénario Digital Twin enregistré localement", "ok");
  return scenario;
}

function activateUpgradeDigitalTwinScenario(scenarioId) {
  const store = readDigitalTwinStore();
  const scenario = store.scenarios.find((item) => item.id === scenarioId);
  if (!scenario || scenario.binding?.machine_key !== state.scan?.machine_key) {
    setStatus("Ce scénario ne correspond pas à la machine active", "warn");
    return null;
  }
  store.active_by_machine[state.scan.machine_key] = scenario.id;
  writeDigitalTwinStore(store);
  applyDigitalTwinDraftToControls(scenario.result?.draft || {});
  state.upgradeDigitalTwinRun = buildUpgradeDigitalTwin(scenario.result?.draft || {});
  refreshDigitalTwinDependents();
  setStatus("Scénario Digital Twin réactivé et recalculé sur le scan actuel", "ok");
  return state.upgradeDigitalTwinRun;
}

function restorePreviousUpgradeDigitalTwinScenario() {
  const history = digitalTwinHistoryForMachine();
  const activeId = readDigitalTwinStore().active_by_machine[state.scan?.machine_key || ""] || "";
  const previous = history.find((item) => item.id !== activeId);
  if (!previous) {
    setStatus("Aucun scénario Digital Twin précédent", "warn");
    return null;
  }
  return activateUpgradeDigitalTwinScenario(previous.id);
}

async function copyUpgradeDigitalTwinJson() {
  if (!state.upgradeDigitalTwinRun) simulateUpgradeDigitalTwin();
  await navigator.clipboard.writeText(JSON.stringify(digitalTwinExportDocument(), null, 2));
  setStatus("Digital Twin JSON copié", "ok");
}

async function copyUpgradeDigitalTwinMarkdown() {
  if (!state.upgradeDigitalTwinRun) simulateUpgradeDigitalTwin();
  await navigator.clipboard.writeText(digitalTwinMarkdown());
  setStatus("Digital Twin Markdown copié", "ok");
}

function downloadUpgradeDigitalTwinJson() {
  if (!state.upgradeDigitalTwinRun) simulateUpgradeDigitalTwin();
  const machine = String(state.scan?.machine_key || "machine").replace(/[^a-z0-9_-]/gi, "-");
  downloadTextFile(`outilsia-upgrade-digital-twin-${machine}.json`, JSON.stringify(digitalTwinExportDocument(), null, 2), "application/json;charset=utf-8");
  setStatus("Digital Twin JSON téléchargé", "ok");
}

function downloadUpgradeDigitalTwinMarkdown() {
  if (!state.upgradeDigitalTwinRun) simulateUpgradeDigitalTwin();
  const machine = String(state.scan?.machine_key || "machine").replace(/[^a-z0-9_-]/gi, "-");
  downloadTextFile(`outilsia-upgrade-digital-twin-${machine}.md`, digitalTwinMarkdown(), "text/markdown;charset=utf-8");
  setStatus("Digital Twin Markdown téléchargé", "ok");
}

function catalogSnapshot(compatibility = state.compatibility?.compatibility || state.compatibility || {}) {
  const manifest = state.desktopManifest || {};
  const contentSignals = state.contentSignals || {};
  const signalGroups = contentSignals.signals || {};
  const newModels = compatibility.new || compatibility.new_models || [];
  const upgrades = compatibility.upgrades || compatibility.recommended_upgrades || compatibility.shopping_list || [];
  const models = extractModels(compatibility);
  const blocked = compatibility.blocked_next || compatibility.blocked || [];
  return {
    manifest_catalog_version: manifest.catalog_version || "",
    manifest_upgrade_catalog_version: manifest.upgrade_catalog_version || "",
    manifest_content_signals_version: manifest.content_signals_version || "",
    diagnostic_catalog_version: compatibility.catalog_version || "",
    diagnostic_upgrade_catalog_version: compatibility.upgrade_catalog_version || "",
    content_signals_version: contentSignals.version || "",
    content_pages_scanned: contentSignals.pages_scanned || 0,
    content_pages_with_signals: contentSignals.pages_with_signals || 0,
    top_model_signals: topSignalLabels(signalGroups.models),
    top_hardware_signals: topSignalLabels(signalGroups.hardware),
    top_runtime_signals: topSignalLabels(signalGroups.runtimes),
    top_content_pages: Array.isArray(contentSignals.top_pages) ? contentSignals.top_pages.slice(0, 5).map((page) => page.path || page.title || "") : [],
    catalog_count: compatibility.catalog_count || 0,
    compatible_count: models.length,
    blocked_count: Array.isArray(blocked) ? blocked.length : 0,
    new_count: Array.isArray(newModels) ? newModels.length : 0,
    upgrade_count: Array.isArray(upgrades) ? upgrades.length : 0,
    new_models: Array.isArray(newModels) ? newModels.slice(0, 5).map((model) => modelTitle(model)) : [],
    upgrades: Array.isArray(upgrades) ? upgrades.slice(0, 5).map((item) => upgradeText(item)) : [],
    release_build: state.release?.build_id || "",
    checked_at: new Date().toISOString()
  };
}

function renderCatalogStatus(compatibility = state.compatibility?.compatibility || state.compatibility || {}) {
  const snapshot = catalogSnapshot(compatibility);
  const modelVersion = snapshot.diagnostic_catalog_version || snapshot.manifest_catalog_version || "non chargé";
  const upgradeVersion = snapshot.diagnostic_upgrade_catalog_version || snapshot.manifest_upgrade_catalog_version || "non chargé";
  const signalsVersion = snapshot.content_signals_version || snapshot.manifest_content_signals_version || "non chargé";
  const hasDiagnostic = Boolean(state.compatibility);
  els.catalogState.textContent = hasDiagnostic ? `modèles ${modelVersion}` : "manifeste";
  els.catalogBox.className = "catalog-box";
  els.catalogBox.innerHTML = `
    <div><strong>Moteur serveur</strong><span>Recommandations rafraîchies via OutilsIA.fr : l'app lit les catalogues live sans attendre un nouvel exe.</span></div>
    <div><strong>Catalogue modèles</strong><span>${escapeHtml(modelVersion)}${snapshot.catalog_count ? ` - ${escapeHtml(snapshot.catalog_count)} modèles suivis` : ""}</span></div>
    <div><strong>Catalogue upgrades</strong><span>${escapeHtml(upgradeVersion)}${snapshot.upgrade_count ? ` - ${escapeHtml(snapshot.upgrade_count)} upgrade(s) proposés` : ""}</span></div>
    <div><strong>Signaux contenus</strong><span>${escapeHtml(signalsVersion)}${snapshot.content_pages_scanned ? ` - ${escapeHtml(snapshot.content_pages_scanned)} pages scannées` : ""}</span></div>
    <div><strong>Modèles chauds</strong><span>${snapshot.top_model_signals.length ? escapeHtml(snapshot.top_model_signals.join(", ")) : "En attente du radar éditorial."}</span></div>
    <div><strong>Modèle du moment</strong><span>${escapeHtml(modelOfMomentState().title)}${modelOfMomentState().ref ? ` - ${escapeHtml(modelOfMomentState().ref)}` : ""}</span></div>
    <div><strong>Matériel chaud</strong><span>${snapshot.top_hardware_signals.length ? escapeHtml(snapshot.top_hardware_signals.join(", ")) : "En attente du radar éditorial."}</span></div>
    <div><strong>Nouveautés machine</strong><span>${snapshot.new_count ? escapeHtml(snapshot.new_models.join(", ")) : "Aucune nouveauté compatible signalée pour l'instant."}</span></div>
    <div><strong>Veille Hermes Agent</strong><span>${escapeHtml(HERMES_AGENT_WATCH.version)} - ${escapeHtml(HERMES_AGENT_WATCH.release)} (${escapeHtml(HERMES_AGENT_WATCH.date)}) : ${escapeHtml(HERMES_AGENT_WATCH.summary)}</span></div>
    <div><strong>Prochains paliers</strong><span>${escapeHtml(snapshot.blocked_count)} bloqué(s) proche(s), ${escapeHtml(snapshot.compatible_count)} modèle(s) compatibles affichés.</span></div>
    <div><strong>IA assistée</strong><span>Prévu : synthèse optionnelle via API DeepSeek côté site pour expliquer les choix. Les règles VRAM/RAM/prix restent déterministes.</span></div>
  `;
  els.copyCatalogReportBtn.disabled = false;
  els.refreshCatalogBtn.disabled = !state.scan;
}

function catalogReportMarkdown() {
  const snapshot = catalogSnapshot();
  return [
    "# État catalogues OutilsIA Local Cockpit",
    "",
    `- Date: ${snapshot.checked_at}`,
    `- Catalogue modèles manifeste: ${snapshot.manifest_catalog_version || "non chargé"}`,
    `- Catalogue modèles diagnostic: ${snapshot.diagnostic_catalog_version || "non chargé"}`,
    `- Catalogue upgrades manifeste: ${snapshot.manifest_upgrade_catalog_version || "non chargé"}`,
    `- Catalogue upgrades diagnostic: ${snapshot.diagnostic_upgrade_catalog_version || "non chargé"}`,
    `- Signaux contenus manifeste: ${snapshot.manifest_content_signals_version || "non chargé"}`,
    `- Signaux contenus chargés: ${snapshot.content_signals_version || "non chargé"}`,
    `- Pages scannées: ${snapshot.content_pages_scanned || 0}`,
    `- Veille Hermes Agent: ${HERMES_AGENT_WATCH.version} ${HERMES_AGENT_WATCH.release} (${HERMES_AGENT_WATCH.date})`,
    `- Source Hermes Agent: ${HERMES_AGENT_WATCH.url}`,
    `- Build release: ${snapshot.release_build || "non chargé"}`,
    `- Modèles suivis: ${snapshot.catalog_count || "non communiqué"}`,
    `- Modèles compatibles affichés: ${snapshot.compatible_count}`,
    `- Modèles proches bloqués: ${snapshot.blocked_count}`,
    `- Nouveaux modèles utiles: ${snapshot.new_count}`,
    `- Upgrades proposés: ${snapshot.upgrade_count}`,
    "",
    "## Nouveaux modèles",
    "",
    ...(snapshot.new_models.length ? snapshot.new_models.map((name) => `- ${name}`) : ["- Aucun nouveau modèle compatible signalé."]),
    "",
    "## Signaux éditoriaux",
    "",
    ...(snapshot.top_model_signals.length ? snapshot.top_model_signals.map((name) => `- Modèle: ${name}`) : ["- Aucun signal modèle chargé."]),
    ...(snapshot.top_hardware_signals.length ? snapshot.top_hardware_signals.map((name) => `- Matériel: ${name}`) : ["- Aucun signal matériel chargé."]),
    ...(snapshot.top_runtime_signals.length ? snapshot.top_runtime_signals.map((name) => `- Runtime: ${name}`) : ["- Aucun signal runtime chargé."]),
    "",
    "## Pages sources",
    "",
    ...(snapshot.top_content_pages.length ? snapshot.top_content_pages.map((path) => `- ${path}`) : ["- Aucune page source chargée."]),
    "",
    "## Upgrades proposés",
    "",
    ...(snapshot.upgrades.length ? snapshot.upgrades.map((name) => `- ${name}`) : ["- Aucun upgrade proposé sur ce diagnostic."])
  ].join("\n");
}

async function copyCatalogReport() {
  await navigator.clipboard.writeText(catalogReportMarkdown());
  setStatus("État catalogues copié", "ok");
}

async function refreshCatalogFromServer() {
  if (!state.scan) {
    setStatus("Scan requis avant actualisation catalogue", "warn");
    return;
  }
  els.refreshCatalogBtn.disabled = true;
  setStatus("Actualisation catalogue OutilsIA...");
  try {
    await loadContentSignals();
    await checkCompatibility();
    setStatus("Catalogue relu depuis OutilsIA", "ok");
  } catch (error) {
    setStatus(String(error), "bad");
  } finally {
    els.refreshCatalogBtn.disabled = !state.scan;
  }
}

function buildBuyingLinks(compatibility, upgrades) {
  if (Array.isArray(compatibility.buying_guides) && compatibility.buying_guides.length) {
    return dedupeLinks(compatibility.buying_guides.map((link) => ({
      title: link.title || "Guide OutilsIA",
      text: link.text || "Ouvrir le guide adapte a cette machine.",
      url: absolutize(link.url || "/materiel")
    }))).slice(0, 6);
  }

  const scan = state.scan || {};
  const vram = Number(scan.vram_gb || 0);
  const ram = Number(scan.ram_gb || 0);
  const gpu = String(scan.gpu_name || "").toLowerCase();
  const blocked = compatibility.blocked_next || compatibility.blocked || [];
  const upgradeTextBlob = [
    ...(Array.isArray(upgrades) ? upgrades.map(upgradeText) : []),
    ...blocked.map(modelLine)
  ].join(" ").toLowerCase();
  const links = [];

  links.push({
    title: "Comparer les GPU IA locale",
    text: "Voir le guide principal VRAM, budgets et modèles compatibles.",
    url: "https://outilsia.fr/materiel"
  });

  if (vram > 0 && vram < 12) {
    links.push({
      title: "Passer le cap 12 Go VRAM",
      text: "Le minimum confortable pour Ollama, Hermes et Qwen quantifies.",
      url: "https://outilsia.fr/blog/rtx-3060-12go-ia-locale-2026"
    });
  }

  if (vram >= 12 && vram < 16) {
    links.push({
      title: "12 Go ou 16 Go VRAM ?",
      text: "Vérifier si l'upgrade RTX 4060 Ti 16 Go vaut le coup pour ton usage.",
      url: "https://outilsia.fr/blog/rtx-4060-ti-16go-vs-rtx-3060-ia-locale-2026"
    });
  }

  if (vram >= 16 && vram < 24) {
    links.push({
      title: "Atteindre le palier 24 Go",
      text: "Comparer RTX 3090, 4090 et gros modèles locaux.",
      url: "https://outilsia.fr/blog/rtx-3090-occasion-deal-ia-2026"
    });
  }

  if (vram >= 24 || gpu.includes("3090") || gpu.includes("4090")) {
    links.push({
      title: "Exploiter une grosse VRAM",
      text: "Installer Qwen, Hermes et gros contextes sans gaspiller la machine.",
      url: "https://outilsia.fr/blog/installer-hermes-nous-research-guide-2026"
    });
  }

  if (ram > 0 && ram < 32) {
    links.push({
      title: "RAM pour IA locale",
      text: "Priorité 32 Go minimum si la machine swap ou sature vite.",
      url: "https://outilsia.fr/upgrade-ia"
    });
  }

  if (upgradeTextBlob.includes("ssd") || upgradeTextBlob.includes("stockage") || Number(scan.storage_free_gb || 0) < 80) {
    links.push({
      title: "Stockage modèles Ollama",
      text: "Prévoir un SSD NVMe dédié si les modèles prennent trop de place.",
      url: "https://outilsia.fr/blog/ollama-out-of-memory-solutions-2026"
    });
  }

  links.push({
    title: "Sauver cette config",
    text: "Ouvrir le compte OutilsIA pour retrouver machines, benchmarks et MemoryForge.",
    url: "https://outilsia.fr/compte"
  });

  return dedupeLinks(links).slice(0, 5);
}

function dedupeLinks(links) {
  const seen = new Set();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function normalizeOllamaRef(value) {
  return String(value || "").trim().toLowerCase();
}

function ollamaRefAliases(value) {
  const clean = normalizeOllamaRef(value);
  if (!clean) return [];
  const aliases = new Set([clean]);
  const [base, tag = ""] = clean.split(":");
  if (base && (!tag || tag === "latest")) aliases.add(base);
  if (clean === "mistral:latest") aliases.add("mistral:7b");
  if (clean === "qwen2.5:latest") aliases.add("qwen2.5:7b");
  if (clean === "llama3.1:latest") aliases.add("llama3.1:8b");
  if (clean === "hermes3:8b" || clean.includes("nous-hermes2theta-llama3-8b")) {
    aliases.add("hermes3:8b");
    aliases.add("hermes3");
    aliases.add("adrienbrault/nous-hermes2theta-llama3-8b:q4");
    aliases.add("adrienbrault/nous-hermes2theta-llama3-8b");
  }
  return [...aliases];
}

function sameOllamaModel(left, right) {
  const leftAliases = new Set(ollamaRefAliases(left));
  return ollamaRefAliases(right).some((alias) => leftAliases.has(alias));
}

function installedOllamaRefs({ includeOptimistic = true } = {}) {
  const refs = [];
  for (const model of state.scan?.installed_models || []) {
    const name = model.name || model.model_name || "";
    const tag = model.tag || model.model_tag || "";
    refs.push(...ollamaRefAliases(tag ? `${name}:${tag}` : name));
  }
  if (includeOptimistic) {
    for (const ref of state.optimisticInstalledModels || []) {
      refs.push(...ollamaRefAliases(ref));
    }
  }
  return new Set(refs);
}

function isOllamaModelInstalled(model) {
  const clean = normalizeOllamaRef(model);
  if (!clean) return false;
  const refs = installedOllamaRefs();
  return ollamaRefAliases(clean).some((alias) => refs.has(alias));
}

function isOllamaModelInstalledInScan(model) {
  const clean = normalizeOllamaRef(model);
  if (!clean) return false;
  const refs = installedOllamaRefs({ includeOptimistic: false });
  return ollamaRefAliases(clean).some((alias) => refs.has(alias));
}

function preferredInstallRef(model) {
  const clean = normalizeOllamaRef(model);
  if (!clean) return "";
  if (clean.includes("nous-hermes2theta-llama3-8b")) return "hermes3:8b";
  return clean;
}

function installedOllamaCanonicalRef(model) {
  const clean = normalizeOllamaRef(model);
  if (!clean) return "";
  const aliases = new Set(ollamaRefAliases(clean));
  const installed = [
    ...(state.scan?.installed_models || []).map(modelLabel),
    ...(state.optimisticInstalledModels || [])
  ];
  for (const ref of installed) {
    const candidate = normalizeOllamaRef(ref);
    if (!candidate) continue;
    if (ollamaRefAliases(candidate).some((alias) => aliases.has(alias))) return candidate;
  }
  return "";
}

function ollamaActionRef(model) {
  const clean = preferredInstallRef(model);
  if (!clean) return "";
  return installedOllamaCanonicalRef(clean) || clean;
}

function isOllamaModelInstalling(model) {
  const clean = normalizeOllamaRef(model);
  if (!clean) return false;
  const aliases = new Set(ollamaRefAliases(clean));
  return Object.keys(state.installingModels || {})
    .some((ref) => ollamaRefAliases(ref).some((alias) => aliases.has(alias)));
}

function hasActiveInstall() {
  return Object.keys(state.installingModels || {}).length > 0;
}

function hasSuccessfulBenchmarkFor(model) {
  const clean = normalizeOllamaRef(model);
  if (!clean) return false;
  if (state.benchmark?.success && sameOllamaModel(state.benchmark.model, clean)) return true;
  return readBenchmarkHistory().some((item) => item.success && sameOllamaModel(item.model, clean));
}

function successfulBenchmarkFor(model) {
  const clean = normalizeOllamaRef(model);
  if (!clean) return null;
  if (state.benchmark?.success && sameOllamaModel(state.benchmark.model, clean)) return state.benchmark;
  return readBenchmarkHistory()
    .find((item) => item.success && sameOllamaModel(item.model, clean)) || null;
}

function latestBenchmarkFor(model, { executionMode = "" } = {}) {
  const clean = normalizeOllamaRef(model);
  if (!clean) return null;
  const matchesMode = (item) => !executionMode || String(item?.execution_mode || "auto") === executionMode;
  if (state.benchmark && sameOllamaModel(state.benchmark.model, clean) && matchesMode(state.benchmark)) {
    return state.benchmark;
  }
  return readBenchmarkHistory()
    .find((item) => sameOllamaModel(item.model, clean) && matchesMode(item)) || null;
}

function isCudaBenchmarkFailure(result) {
  if (!result || result.success) return false;
  const message = String(result.error || result.output_preview || "").toLowerCase();
  return [
    "unsupported toolchain",
    "cuda error",
    "llama-server process has terminated",
    "0xc0000409",
    "ptx was compiled"
  ].some((signal) => message.includes(signal));
}

function runtimeReadinessState(model = "qwen3:0.6b") {
  if (!state.scan) {
    return { key: "unscanned", label: "À analyser", detail: "Aucun runtime vérifié.", tone: "neutral" };
  }
  if (!hasUsableOllamaRuntime(state.scan)) {
    return { key: "missing", label: "Ollama absent", detail: "Installe le moteur local avant le test.", tone: "bad" };
  }
  const automaticResult = latestBenchmarkFor(model, { executionMode: "auto" });
  if (automaticResult?.success) {
    const evidence = doctorRuntimeEvidence(state.scan, model);
    if (evidence.status === "gpu-proven") {
      return {
        key: "ready",
        label: "Accélération GPU observée",
        detail: `${automaticResult.estimated_tokens_per_second || 0} tok/s · ${evidence.gpu_offload_percent.toFixed(1)} % du modèle en VRAM selon Ollama /api/ps.`,
        tone: "ok",
        evidence
      };
    }
    if (evidence.status === "hybrid-proven") {
      return {
        key: "ready",
        label: "Exécution hybride observée",
        detail: `${automaticResult.estimated_tokens_per_second || 0} tok/s · ${evidence.gpu_offload_percent.toFixed(1)} % du modèle en VRAM, reste sur CPU.`,
        tone: "ok",
        evidence
      };
    }
    if (evidence.status === "cpu-proven") {
      const gpuExpected = runtimeDriverAccelerationExpected(state.scan);
      return {
        key: gpuExpected ? "cpu-only" : "ready",
        label: gpuExpected ? "Runtime automatique sur CPU" : "Exécution CPU observée",
        detail: `${automaticResult.estimated_tokens_per_second || 0} tok/s · Ollama /api/ps observe 0 % du modèle en VRAM.`,
        tone: gpuExpected ? "warn" : "ok",
        evidence
      };
    }
    return {
      key: "ready",
      label: "Runtime automatique validé · GPU non prouvé",
      detail: `${automaticResult.estimated_tokens_per_second || 0} tok/s, sans preuve d'allocation CPU/GPU renvoyée par Ollama /api/ps.`,
      tone: "warn",
      evidence
    };
  }
  const cpuSuccess = readBenchmarkHistory().find((item) =>
    item.success
    && sameOllamaModel(item.model, model)
    && String(item.execution_mode || "") === "cpu"
  ) || (state.benchmark?.success
    && sameOllamaModel(state.benchmark.model, model)
    && String(state.benchmark.execution_mode || "") === "cpu"
      ? state.benchmark
      : null);
  if (cpuSuccess) {
    const gpuExpected = runtimeDriverAccelerationExpected(state.scan);
    return {
      key: gpuExpected ? "cpu-only" : "ready",
      label: gpuExpected ? "CPU validé · accélération GPU à vérifier" : "Exécution CPU validée",
      detail: gpuExpected
        ? `${cpuSuccess.estimated_tokens_per_second || 0} tok/s sans GPU. Le modèle fonctionne ; pilote et backend restent à vérifier sans conclure trop vite.`
        : `${cpuSuccess.estimated_tokens_per_second || 0} tok/s sur CPU. Aucun GPU accélérateur attendu n'est affirmé.`,
      tone: gpuExpected ? "warn" : "ok",
      evidence: doctorRuntimeEvidence(state.scan, model)
    };
  }
  if (isCudaBenchmarkFailure(automaticResult)) {
    return {
      key: "cuda-blocked",
      label: "GPU/CUDA bloqué",
      detail: "Reteste sans GPU pour isoler le pilote du reste de la machine.",
      tone: "bad"
    };
  }
  return { key: "untested", label: "À mesurer", detail: "Lance le modèle léger pour vérifier la chaîne locale.", tone: "neutral" };
}

function markOllamaModelInstalled(model) {
  const clean = preferredInstallRef(model);
  if (!clean) return;
  if (!state.scan) state.scan = { installed_models: [] };
  if (!Array.isArray(state.scan.installed_models)) state.scan.installed_models = [];
  if (!Array.isArray(state.optimisticInstalledModels)) state.optimisticInstalledModels = [];
  const alreadyInstalled = isOllamaModelInstalled(clean);
  if (!state.optimisticInstalledModels.some((ref) => normalizeOllamaRef(ref) === normalizeOllamaRef(clean))) {
    state.optimisticInstalledModels.push(clean);
  }
  if (alreadyInstalled) return;
  state.scan.installed_models.push({
    name: clean,
    source: "ollama",
    runtime: "ollama"
  });
}

function unmarkOllamaModelInstalled(model) {
  const clean = normalizeOllamaRef(model);
  if (!clean) return;
  const aliases = new Set(ollamaRefAliases(clean));
  state.optimisticInstalledModels = (state.optimisticInstalledModels || [])
    .filter((ref) => !ollamaRefAliases(ref).some((alias) => aliases.has(alias)));
  if (Array.isArray(state.scan?.installed_models)) {
    state.scan.installed_models = state.scan.installed_models.filter((item) => {
      const name = item.name || item.model_name || "";
      const tag = item.tag || item.model_tag || "";
      return !ollamaRefAliases(tag ? `${name}:${tag}` : name).some((alias) => aliases.has(alias));
    });
  }
}

function estimatedModelSizeLabel(model) {
  const clean = String(model || "").toLowerCase();
  if (clean.includes("70b")) return "40 Go ou plus";
  if (clean.includes("32b")) return "18-24 Go";
  if (clean.includes("14b")) return "8-12 Go";
  if (clean.includes("8b") || clean.includes("7b")) return "4-6 Go";
  if (clean.includes("4b")) return "2-4 Go";
  if (clean.includes("0.6b") || clean.includes("1.7b")) return "moins de 2 Go";
  if (clean.includes("3b") || clean.includes("1.5b")) return "1-3 Go";
  return "taille variable";
}

function catalogModelForOllamaRef(model) {
  const clean = normalizeOllamaRef(model);
  if (!clean) return null;
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  return extractModels(compatibility)
    .find((item) => {
      const ref = actionableOllamaRef(item);
      return ref && sameOllamaModel(ref, clean);
    }) || null;
}

function fallbackInstallModelSizeGb(model) {
  const clean = normalizeOllamaRef(model);
  if (!clean) return null;
  if (/0[._-]?6b|0\.6b/.test(clean)) return 0.6;
  if (/8x7b/.test(clean)) return 14;
  const tagged = clean.match(/(?:^|[:/_-])(\d+(?:\.\d+)?)b(?:$|[^a-z0-9])/i)
    || clean.match(/(\d+(?:\.\d+)?)b/i);
  if (!tagged) return null;
  const params = Number(tagged[1]);
  if (!Number.isFinite(params) || params <= 0) return null;
  return Math.max(0.5, Number((params * 0.64).toFixed(1)));
}

function modelInstallSizeBudget(model) {
  const clean = normalizeOllamaRef(model);
  const catalog = catalogModelForOllamaRef(clean);
  const installed = (state.scan?.installed_models || [])
    .find((item) => sameOllamaModel(modelLabel(item), clean));
  const installedSize = Number(installed?.size_gb || 0);
  const catalogSize = Number(catalog?.vram_q4 || 0);
  const fallbackSize = fallbackInstallModelSizeGb(clean);
  const estimated = installedSize > 0
    ? installedSize
    : catalogSize > 0
      ? catalogSize
      : fallbackSize;
  const source = installedSize > 0
    ? "installed_model_size"
    : catalogSize > 0
      ? "catalog_q4_proxy"
      : estimated
        ? "parameter_count_estimate"
        : "unknown";
  if (!Number.isFinite(estimated) || estimated <= 0) {
    return {
      estimated_download_gb: null,
      estimated_upper_gb: null,
      reserve_gb: 8,
      required_free_gb: null,
      source
    };
  }
  const upper = Number(Math.max(estimated + 0.4, estimated * 1.18).toFixed(1));
  const reserve = estimated <= 1
    ? INSTALL_SAFETY_MIN_RESERVE_GB
    : estimated <= 10
      ? 6
      : 10;
  return {
    estimated_download_gb: Number(estimated.toFixed(1)),
    estimated_upper_gb: upper,
    reserve_gb: reserve,
    required_free_gb: Number((upper + reserve).toFixed(1)),
    source
  };
}

function evaluateInstallSafetyPreflight(model, probe = {}) {
  const clean = normalizeOllamaRef(model);
  const budget = modelInstallSizeBudget(clean);
  const hasStorageValue = probe.storage_free_gb !== null
    && probe.storage_free_gb !== undefined
    && probe.storage_free_gb !== "";
  const freeValue = Number(probe.storage_free_gb);
  const storageFree = hasStorageValue && Number.isFinite(freeValue) && freeValue >= 0
    ? Number(freeValue.toFixed(1))
    : null;
  const runtime = probe.runtime || defaultOllamaRuntime(clean);
  const runtimeReady = probe.runtime_ready !== false;
  const alreadyInstalled = Boolean(probe.model_already_installed || isOllamaModelInstalled(clean));
  const blockers = [];
  const warnings = [];
  if (!runtimeReady) blockers.push(`Le runtime ${runtime === "ollama-wsl" || runtime === "wsl" ? "Ollama WSL" : "Ollama"} ne répond pas.`);
  if (storageFree != null && budget.required_free_gb != null && storageFree < budget.required_free_gb) {
    blockers.push(`${storageFree} Go libres mesurés, ${budget.required_free_gb} Go requis avec réserve.`);
  }
  if (storageFree == null) warnings.push("L'espace du volume Ollama n'a pas pu être mesuré.");
  if (probe.storage_scope === "system_volume_fallback") {
    warnings.push("Le volume système est utilisé comme repli ; un dossier Ollama personnalisé reste à confirmer.");
  }
  if (budget.estimated_download_gb == null) warnings.push("La taille du modèle est inconnue dans le catalogue local.");

  const catalog = catalogModelForOllamaRef(clean);
  const neededMemory = Number(catalog?.vram_q4 || 0);
  const availableMemory = effectiveModelMemoryGb(state.scan);
  if (neededMemory > 0 && availableMemory > 0 && neededMemory > availableMemory) {
    warnings.push(`${neededMemory} Go estimés en Q4 pour ${availableMemory} Go de mémoire modèle disponible ; offload CPU ou échec possible.`);
  }

  const verdict = alreadyInstalled
    ? "already_installed"
    : blockers.length
      ? "blocked"
      : warnings.length
        ? "warning"
        : "ready";
  return {
    schema: INSTALL_SAFETY_PREFLIGHT_SCHEMA,
    checked_at: new Date(Number(probe.checked_at_ms || Date.now())).toISOString(),
    machine_key: state.scan?.machine_key || "",
    model: clean,
    runtime: runtime === "ollama-wsl" ? "wsl" : runtime,
    verdict,
    allowed: verdict !== "blocked",
    requires_confirmation: verdict === "warning" && !isStarterModelRef(clean),
    runtime_ready: runtimeReady,
    model_already_installed: alreadyInstalled,
    storage_free_gb: storageFree,
    storage_scope: probe.storage_scope || "unknown_model_store",
    storage_source: probe.storage_source || "unknown",
    storage_path_exposed: false,
    ...budget,
    blockers,
    warnings,
    limitations: [
      "La taille de téléchargement reste une estimation tant qu'Ollama n'expose pas le manifeste complet avant le pull.",
      "Le préflight ne prouve ni la vitesse du modèle ni son offload GPU."
    ]
  };
}

function installSafetyPreflightSummary() {
  const preflight = state.installSafetyPreflight;
  if (!preflight || preflight.machine_key !== (state.scan?.machine_key || "")) return null;
  return {
    schema: preflight.schema,
    checked_at: preflight.checked_at,
    model: preflight.model,
    runtime: preflight.runtime,
    verdict: preflight.verdict,
    allowed: preflight.allowed,
    storage_free_gb: preflight.storage_free_gb,
    estimated_download_gb: preflight.estimated_download_gb,
    required_free_gb: preflight.required_free_gb,
    reserve_gb: preflight.reserve_gb,
    storage_scope: preflight.storage_scope,
    storage_source: preflight.storage_source,
    storage_path_exposed: false,
    blockers: [...preflight.blockers],
    warnings: [...preflight.warnings]
  };
}

function appendInstallSafetyPreflight(preflight) {
  const tone = preflight.verdict === "blocked" ? "erreur" : preflight.verdict === "warning" ? "alerte" : "ok";
  const runtimeLabel = preflight.runtime === "wsl"
    ? "Ollama WSL"
    : /linux/i.test(String(state.scan?.os_name || ""))
      ? "Ollama Linux"
      : "Ollama Windows";
  appendOperationLine(
    `Préflight ${runtimeLabel}: ${preflight.storage_free_gb == null ? "espace inconnu" : `${preflight.storage_free_gb} Go libres`} · ${preflight.required_free_gb == null ? "besoin inconnu" : `${preflight.required_free_gb} Go requis avec réserve`}.`,
    tone
  );
  for (const message of preflight.blockers) appendOperationLine(message, "erreur");
  for (const message of preflight.warnings) appendOperationLine(message, "alerte");
}

async function runInstallSafetyPreflight(model) {
  const clean = preferredInstallRef(model);
  const runtime = defaultOllamaRuntime(clean);
  const probe = invoke
    ? await invoke("preflight_ollama_install", {
        request: {
          model: clean,
          ...(runtime === "wsl" ? { runtime: "wsl" } : {})
        }
      })
    : {
        schema: INSTALL_SAFETY_PREFLIGHT_SCHEMA,
        model: clean,
        runtime,
        runtime_ready: hasUsableOllamaRuntime(state.scan),
        model_already_installed: isOllamaModelInstalled(clean),
        storage_free_gb: state.scan?.storage_free_gb ?? null,
        storage_scope: "system_volume_fallback",
        storage_source: "browser_demo",
        storage_path_exposed: false,
        checked_at_ms: Date.now()
      };
  const decision = evaluateInstallSafetyPreflight(clean, probe);
  state.installSafetyPreflight = decision;
  invalidateCapabilityPassport();
  appendInstallSafetyPreflight(decision);
  return decision;
}

function friendlyOllamaError(error) {
  const message = String(error || "");
  const lower = message.toLowerCase();
  if (
    lower.includes("unsupported toolchain")
    || lower.includes("cuda error")
    || lower.includes("llama-server process has terminated")
    || lower.includes("0xc0000409")
    || lower.includes("ptx was compiled")
  ) {
    return "Ollama a planté côté CUDA sur ce GPU/driver. Utilise « Retester sans GPU » : si le modèle marche en CPU, le pilote/runtime GPU est bien la cause et le matériel principal reste utilisable.";
  }
  if (lower.includes("impossible de lancer ollama") || lower.includes("no such file") || lower.includes("os error 2")) {
    return "Ollama n'est pas détecté. Installe Ollama, relance l'app, puis réessaie.";
  }
  if (lower.includes("stopp") || lower.includes("timeout") || lower.includes("timed out")) {
    return "Téléchargement interrompu : connexion lente ou modèle trop lourd. Réessaie avec un modèle plus petit ou augmente le délai.";
  }
  if (lower.includes("not found") || lower.includes("pull model manifest")) {
    return "Modèle introuvable dans Ollama. Le catalogue doit être corrigé ou le nom du modèle a changé.";
  }
  return message;
}

function renderCommands(models) {
  const ollamaMissing = Boolean(state.scan && !hasUsableOllamaRuntime(state.scan));
  const starter = {
    label: "Premier test conseillé",
    ollama: "qwen3:0.6b",
    command: `${ollamaRuntimeCommandLabel("qwen3:0.6b")} run qwen3:0.6b`,
    reason: "Modèle ultra léger pour vérifier que le téléchargement, le lancement et le benchmark fonctionnent."
  };
  const commands = models
    .filter((model) => actionableOllamaRef(model))
    .slice(0, 8)
    .map((model) => ({
      label: `${model.name || "Modele"} ${model.params || ""}`.trim(),
      ollama: actionableOllamaRef(model),
      command: `${ollamaRuntimeCommandLabel(actionableOllamaRef(model))} run ${actionableOllamaRef(model)}`,
      reason: modelLine(model)
    }));
  const deduped = [
    starter,
    ...commands.filter((item) => normalizeOllamaRef(item.ollama) !== normalizeOllamaRef(starter.ollama))
  ];
  els.commandCount.textContent = `${deduped.length} commande${deduped.length > 1 ? "s" : ""}`;
  els.commandList.className = deduped.length ? "list" : "list empty";
  els.commandList.innerHTML = deduped.length
    ? deduped.map((item, index) => {
        const actionRef = ollamaActionRef(item.ollama);
        const command = `${ollamaRuntimeCommandLabel(actionRef)} run ${actionRef}`;
        const installed = isOllamaModelInstalled(actionRef);
        const installing = isOllamaModelInstalling(actionRef);
        const installLocked = hasActiveInstall() && !installing;
        const status = installed ? "Installé" : installing ? "Téléchargement..." : index === 0 ? "Test léger" : estimatedModelSizeLabel(actionRef);
        const actionLabel = installed ? "Lancer" : index === 0 ? "Installer le test" : "Télécharger";
        const primaryAction = ollamaMissing
          ? `<button type="button" data-install-ollama="true">Installer Ollama</button>`
          : installed
            ? `<button type="button" data-run-model="${escapeHtml(actionRef)}">Lancer</button>`
            : `<button type="button" data-install-model="${escapeHtml(actionRef)}" ${(installing || installLocked) ? "disabled" : ""}>${installing ? "Télécharge..." : installLocked ? "Attends" : actionLabel}</button>`;
        return `
        <div class="command-item ${index === 0 ? "starter-command" : ""} ${installed ? "installed-command" : ""} ${installing ? "installing-command" : ""}">
          <div class="command-head">
            <strong>${escapeHtml(item.label)}</strong>
            <em>${escapeHtml(status)}</em>
          </div>
          <span class="command-reason">${escapeHtml(item.reason || "")}</span>
          <div class="command-line">
            <code>${escapeHtml(command)}</code>
            ${primaryAction}
            <button type="button" data-copy-command="${escapeHtml(command)}">Copier</button>
            <button type="button" data-benchmark-model="${escapeHtml(actionRef)}" ${ollamaMissing ? "disabled" : ""}>${escapeHtml(benchmarkButtonLabel(actionRef))}</button>
          </div>
        </div>
      `;
      }).join("")
    : "Aucune commande Ollama directe pour les modèles renvoyés.";
  renderFirstTestPanel();
}

function firstTestReportText() {
  const scan = state.scan || {};
  const model = "qwen3:0.6b";
  const ollamaReady = hasUsableOllamaRuntime(scan);
  const modelReady = isOllamaModelInstalled(model);
  const benchmark = state.benchmark && normalizeOllamaRef(state.benchmark.model) === normalizeOllamaRef(model)
    ? state.benchmark
    : successfulBenchmarkFor(model);
  return [
    "Rapport premier test OutilsIA Local Cockpit",
    "",
    `Machine: ${scan.name || "non scannée"}`,
    `CPU: ${scan.cpu_name || "non scanné"}`,
    `RAM: ${formatGb(scan.ram_gb)}`,
    `GPU: ${scan.gpu_name || "non scanné"}`,
    `VRAM: ${formatGb(scan.vram_gb)}`,
    `Runtime IA: ${ollamaReady ? ollamaRuntimeLabel(scan) : "non détecté"}`,
    `Modèle test: ${modelReady ? `${model} installé` : `${model} non installé`}`,
    benchmark ? `Benchmark: ${benchmark.success ? "réussi" : "erreur"} - ${benchmark.estimated_tokens_per_second ?? "--"} tok/s - ${benchmark.elapsed_ms ?? "--"} ms` : "Benchmark: non lancé",
    benchmark?.output_preview ? `Réponse: ${benchmark.output_preview}` : "",
    "",
    "Prochaine étape: relancer le scan, sauvegarder ce PC ou tester un modèle plus ambitieux selon le diagnostic."
  ].filter(Boolean).join("\n");
}

function prepareFlowState() {
  const testModel = "qwen3:0.6b";
  const scanned = Boolean(state.scan);
  const ollamaReady = hasUsableOllamaRuntime(state.scan);
  const modelReady = isOllamaModelInstalled(testModel);
  const benchmarkReady = hasSuccessfulBenchmarkFor(testModel);
  const benchmarkSpeed = benchmarkSpeedFor(testModel);
  const recommended = recommendedModelState();
  const recommendedReady = !recommended.ref || recommended.installed;
  const recommendedBenchmarked = !recommended.ref || !recommended.installed || recommended.benchmarked;
  const chatReady = Boolean(state.chatResult?.success);
  const promptReady = Boolean(currentPromptForgeResult()?.optimized);
  const arenaReady = Boolean(readLastArenaRun()?.results?.length);
  const reportReady = Boolean(state.markdown && String(state.markdown).trim());
  const steps = [
    { key: "scan", label: "Scan PC", ok: scanned, text: scanned ? "machine détectée" : "à lancer" },
    { key: "ollama", label: "Runtime IA", ok: ollamaReady, text: ollamaReady ? ollamaRuntimeLabel(state.scan) : scanned ? "à installer" : "après scan" },
    { key: "model", label: "Modèle test", ok: modelReady, text: modelReady ? `${testModel} installé` : ollamaReady ? "à télécharger" : "en attente" },
    { key: "benchmark", label: "Benchmark", ok: benchmarkReady, text: benchmarkReady ? `${benchmarkSpeed ?? "--"} tok/s` : modelReady ? "à lancer" : "en attente" },
    { key: "recommended", label: "2e modèle", ok: recommendedReady, text: recommended.ref ? recommended.installed ? `${recommended.ref} prêt` : "à installer" : "non choisi" },
    { key: "recommended-benchmark", label: "Comparaison", ok: recommendedBenchmarked, text: recommended.ref && recommended.installed ? recommended.benchmarked ? "2e modèle mesuré" : "à benchmarker" : "après installation" },
    { key: "arena", label: "Arena", ok: arenaReady, text: arenaReady ? "comparaison faite" : benchmarkReady ? "si 2 modèles" : "après benchmark" },
    { key: "chat", label: "Dialogue", ok: chatReady, text: chatReady ? "réponse reçue" : benchmarkReady ? "optionnel" : "après benchmark" },
    { key: "report", label: "Rapport", ok: reportReady, text: reportReady ? "MemoryForge prêt" : benchmarkReady ? "à générer" : "en attente" },
    { key: "promptforge", label: "PromptForge", ok: promptReady, text: promptReady ? "prompt optimisé" : benchmarkReady ? "optionnel" : "plus tard" }
  ];
  let status = "prêt";
  let next = "Lancer l'assistant pour scanner et préparer le premier modèle local.";
  if (!scanned) {
    status = "scan requis";
    next = "Scanner la machine.";
  } else if (!ollamaReady) {
    status = "Ollama requis";
    next = "Installer Ollama, puis relancer le scan.";
  } else if (!modelReady) {
    status = "modèle requis";
    next = `Installer ${testModel}.`;
  } else if (!benchmarkReady) {
    status = "test prêt";
    next = `Lancer le benchmark ${testModel}.`;
  } else if (recommended.ref && !recommended.installed) {
    status = "2e modèle prêt";
    next = `Installer ${recommended.ref} pour comparer un vrai modèle adapté à cette machine.`;
  } else if (recommended.ref && recommended.installed && !recommended.benchmarked) {
    status = "comparaison prête";
    next = `Benchmarker ${recommended.ref} pour mesurer le modèle conseillé sur cette machine.`;
  } else if (!arenaReady && arenaInstalledCandidates().length >= 2) {
    status = "Arena prête";
    next = "Comparer les modèles installés dans l'Arena locale.";
  } else if (!reportReady) {
    status = "rapport prêt";
    next = "Générer le rapport final de cette machine.";
  } else {
    status = "machine prête";
    next = "Sauvegarder ce PC ou tester un autre modèle.";
  }
  return { testModel, scanned, ollamaReady, modelReady, benchmarkReady, recommended, recommendedReady, recommendedBenchmarked, promptReady, chatReady, arenaReady, reportReady, steps, status, next };
}

function renderPreparePanel() {
  if (!els.prepareBox) return;
  const flow = prepareFlowState();
  renderChatPresets();
  const recommended = flow.recommended;
  const usage = currentUsageProfile();
  const usageModel = usageProfileModelRef(usage.key);
  const usagePack = usageProfilePack(usage.key);
  const testSpeed = flow.benchmarkReady ? `${benchmarkSpeedFor(flow.testModel) ?? "--"} tok/s` : "à mesurer";
  const reportLabel = flow.reportReady ? "Journal MemoryForge prêt" : flow.benchmarkReady ? "à générer" : "après benchmark";
  const secondLabel = recommended.ref
    ? recommended.installed
      ? `${recommended.title || recommended.ref} prêt`
      : `${recommended.title || recommended.ref} à installer`
    : "non déterminé";
  const secondAction = recommended.ref
    ? recommended.installed
      ? `<button type="button" data-benchmark-model="${escapeHtml(recommended.ref)}">${recommended.benchmarked ? "Retester" : "Benchmarker"}</button>`
      : `<button type="button" data-install-model="${escapeHtml(recommended.ref)}">Installer</button>`
    : "";
  const journey = [
    { label: "Scanner", ok: flow.scanned, text: flow.scanned ? "PC reconnu" : "matériel" },
    { label: "Tester", ok: flow.benchmarkReady, text: flow.benchmarkReady ? "preuve locale" : "qwen léger" },
    { label: "Comparer", ok: flow.arenaReady, text: flow.arenaReady ? "Arena prête" : "modèles" },
    { label: "Rapport", ok: flow.reportReady, text: flow.reportReady ? "partageable" : "à finaliser" }
  ];
  els.prepareState.textContent = flow.status;
  els.prepareBox.innerHTML = `
    <div class="prepare-journey" aria-label="Parcours principal">
      ${journey.map((step, index) => `
        <div class="prepare-journey-step ${step.ok ? "ok-step" : ""}">
          <strong>${escapeHtml(`${index + 1}. ${step.label}`)}</strong>
          <span>${escapeHtml(step.text)}</span>
        </div>
      `).join("")}
    </div>
    ${renderModelOfMomentCard()}
    <div class="usage-profile-box" aria-label="Profil d'usage">
      <div class="usage-profile-head">
        <div>
          <span class="label">Profil d'usage</span>
          <strong>${escapeHtml(usage.label)}</strong>
          <p>${escapeHtml(usage.detail)}</p>
        </div>
        <span>${escapeHtml(usageModel || "modèle à choisir")}</span>
      </div>
      <div class="usage-profile-actions">
        ${Object.entries(USAGE_PROFILES).map(([key, profile]) => `
          <button type="button" data-usage-profile="${escapeHtml(key)}" class="${key === usage.key ? "active" : ""}">
            ${escapeHtml(profile.label)}
          </button>
        `).join("")}
      </div>
      <div class="usage-pack-card">
        <div class="usage-pack-head">
          <div>
            <span class="label">Pack conseillé</span>
            <strong>${escapeHtml(usagePack.action.label)}</strong>
            <p>${escapeHtml(usagePack.action.detail)}</p>
          </div>
          <em>${escapeHtml(usagePack.benchmarked ? "mesuré" : usagePack.installed ? "installé" : "à préparer")}</em>
        </div>
        <div class="usage-pack-grid">
          <div>
            <strong>Modèle</strong>
            <span>${escapeHtml(usagePack.model || "après scan")}</span>
          </div>
          <div>
            <strong>Test</strong>
            <span>${escapeHtml(usagePack.test.label)}</span>
          </div>
          <div>
            <strong>Contexte</strong>
            <span>${escapeHtml(usagePack.context)}</span>
          </div>
          <div>
            <strong>Quantization</strong>
            <span>${escapeHtml(usagePack.quantization)}</span>
          </div>
        </div>
        <div class="row-actions compact-actions usage-pack-actions">
          <button type="button" data-usage-pack="benchmark">Utiliser pour benchmark</button>
          <button type="button" data-usage-pack="chat">Utiliser pour dialogue</button>
          ${usagePack.model
            ? usagePack.installed
              ? `<button type="button" data-benchmark-model="${escapeHtml(usagePack.model)}">${usagePack.benchmarked ? "Retester le pack" : "Benchmarker le pack"}</button>`
              : `<button type="button" data-install-model="${escapeHtml(usagePack.model)}">Installer le pack</button>`
            : ""}
        </div>
      </div>
      ${renderRecommendationEngine(usage.key)}
    </div>
    <div class="cockpit-focus">
      <div class="cockpit-focus-card ${flow.benchmarkReady ? "ok-step" : ""}">
        <strong>Preuve locale</strong>
        <span>${escapeHtml(flow.testModel)} · ${escapeHtml(testSpeed)}</span>
      </div>
      <div class="cockpit-focus-card ${recommended.installed ? "ok-step" : ""}">
        <strong>Prochain modèle</strong>
        <span>${escapeHtml(secondLabel)}</span>
        <div class="compact-actions">${secondAction}</div>
      </div>
      <div class="cockpit-focus-card ${flow.reportReady ? "ok-step" : ""}">
        <strong>Rapport</strong>
        <span>${escapeHtml(reportLabel)}</span>
        <div class="compact-actions">
          <button type="button" data-generate-cockpit-report="true" ${flow.benchmarkReady ? "" : "disabled"}>Générer</button>
        </div>
      </div>
    </div>
    <details class="prepare-details">
      <summary>Détails techniques du parcours</summary>
      <div class="prepare-steps">
        ${flow.steps.map((step) => `
          <div class="prepare-step ${step.ok ? "ok-step" : ""}">
            <strong>${escapeHtml(step.label)}</strong>
            <span>${escapeHtml(step.text)}</span>
          </div>
        `).join("")}
      </div>
    </details>
    <div class="prepare-next">
      <strong>Action conseillée</strong>
      <span>${escapeHtml(flow.next)}</span>
    </div>
    ${recommended.ref ? `
      <div class="prepare-next recommended-next">
        <strong>Deuxième modèle recommandé</strong>
        <span>${escapeHtml(recommended.title)} · ${escapeHtml(recommended.ref)}</span>
        <span>${escapeHtml(recommended.info?.fit || "Modèle conseillé après le test léger.")}</span>
        <div class="row-actions compact-actions">
          ${recommended.installed
            ? `<button type="button" data-benchmark-model="${escapeHtml(recommended.ref)}">${recommended.benchmarked ? "Retester ce modèle" : "Benchmarker ce modèle"}</button>`
            : `<button type="button" data-install-model="${escapeHtml(recommended.ref)}">Installer ce modèle</button>`}
        </div>
      </div>
    ` : ""}
  `;
  renderPrimaryAction();
}

function readinessReport() {
  const flow = prepareFlowState();
  const proof = releaseProof();
  const scan = state.scan || {};
  const usage = currentUsageProfile();
  const usageModel = usageProfileModelRef(usage.key);
  const usagePack = usageProfilePack(usage.key);
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  const score = normalizeScore(compatibility.score ?? compatibility.compatibility_score ?? null);
  const verdict = compatibility.summary
    || compatibility.verdict
    || compatibility.recommendation
    || compatibility.score?.summary
    || compatibility.score?.label
    || (state.scan ? fallbackVerdict(state.scan) : "");
  const benchmark = successfulBenchmarkFor(flow.testModel);
  const runtimeReadiness = runtimeReadinessState(flow.testModel);
  const promptForge = currentPromptForgeResult();
  const arenaRun = readLastArenaRun();
  const arena = arenaRun ? arenaWinners(arenaRun.results || []) : null;
  const recommendationEngine = recommendationReportSnapshot();
  const hardwareDoctor = hardwareDoctorSnapshot(scan);
  const runtimeDriver = hardwareDoctor?.runtime?.driver_intelligence || null;
  const flightRecorder = flightRecorderSummary();
  const upgradeDigitalTwin = digitalTwinSummary();
  const models = extractModels(compatibility).slice(0, 5).map((model) => ({
    title: modelTitle(model),
    command: actionableOllamaRef(model) ? `${ollamaRuntimeCommandLabel(actionableOllamaRef(model))} run ${actionableOllamaRef(model)}` : "",
    reason: modelLine(model)
  }));
  const effectiveUpgrades = compatibilityUpgradesForCurrentDecision(compatibility);
  const upgrades = effectiveUpgrades
    .slice(0, 3)
    .map((item) => typeof item === "string" ? { title: item, reason: "" } : {
      title: item.title || item.label || item.name || "Upgrade",
      reason: item.reason || item.price_range_eur || "",
      price: item.price || item.price_range_eur || "",
      avoid: item.avoid || item.warning || "",
      url: item.guide_url || item.url || ""
    });
  const buyingLinks = digitalTwinSuppressesPurchases() ? [] : buildBuyingLinks(compatibility, effectiveUpgrades);
  const ready = flow.scanned && flow.ollamaReady && flow.modelReady && flow.benchmarkReady && runtimeReadiness.key === "ready";
  const driverRemediation = Boolean(runtimeDriver?.remediation?.recommended);
  const status = ready
    ? "prêt"
    : runtimeReadiness.key === "cpu-only"
      ? driverRemediation ? "CPU prêt · pilote GPU à vérifier" : "CPU prêt · accélération GPU non validée"
      : flow.status;
  const title = ready
    ? "Machine prête pour l'IA locale"
    : runtimeReadiness.key === "cpu-only"
      ? driverRemediation
        ? "IA locale validée en CPU · pilote GPU à vérifier"
        : "IA locale validée en CPU · backend GPU à mesurer"
      : "Machine à compléter";
  const next = [];
  if (!flow.scanned) next.push("Scanner la machine.");
  if (flow.scanned && !flow.ollamaReady) next.push("Installer Ollama puis relancer le scan.");
  if (flow.ollamaReady && !flow.modelReady) next.push(`Installer ${flow.testModel}.`);
  if (flow.modelReady && !flow.benchmarkReady) next.push(`Lancer le benchmark ${flow.testModel}.`);
  if (runtimeReadiness.key === "cpu-only") {
    next.push(driverRemediation
      ? "Ouvrir la page officielle du pilote, vérifier la version, puis relancer le benchmark automatique."
      : `Consulter Runtime & Driver Intelligence : ${runtimeDriver?.backend?.label || "backend GPU"} reste ${runtimeDriver?.backend?.ollama_support_tier || "à mesurer"}, sans défaut pilote affirmé.`);
  }
  if (runtimeReadiness.key === "ready" && flow.benchmarkReady && flow.recommended?.ref && !flow.recommended.installed) next.push(`Installer le deuxième modèle recommandé : ${flow.recommended.ref}.`);
  if (runtimeReadiness.key === "ready" && flow.recommended?.ref && flow.recommended.installed && !flow.recommended.benchmarked) next.push(`Benchmarker le deuxième modèle recommandé : ${flow.recommended.ref}.`);
  if (flow.benchmarkReady && !flow.chatReady) next.push("Poser une première question au modèle local.");
  if (flow.chatReady && !flow.arenaReady && arenaInstalledCandidates().length >= 2) next.push("Lancer Arena locale pour comparer les modèles installés.");
  if (flow.benchmarkReady && !flow.promptReady) next.push("Optionnel : améliorer un prompt avec PromptForge.");
  if (ready) next.push("Sauvegarder dans MemoryForge, exporter Obsidian ou comparer d'autres modèles dans l'Arena.");
  return {
    generated_at: new Date().toISOString(),
    title,
    status,
    ready,
    score,
    runtime_readiness: runtimeReadiness,
    verdict,
    release: proof,
    machine: {
      name: scan.name || "Machine IA locale",
      cpu: scan.cpu_name || "non scanné",
      ram: formatGb(scan.ram_gb),
      gpu: gpuDisplayLabel(scan),
      vram: memoryDisplayLabel(scan),
      os: [scan.os_name, scan.os_version].filter(Boolean).join(" ") || "non scanné",
      ollama: runtimeOllama(scan)
    },
    hardware_doctor: hardwareDoctor,
    flight_recorder: flightRecorder,
    upgrade_digital_twin: upgradeDigitalTwin,
    purchases_suppressed_by_digital_twin: digitalTwinSuppressesPurchases(),
    capability_passport: capabilityPassportSummary(),
    local_capability_bridge: localCapabilityBridgeSummary(),
    install_safety_preflight: installSafetyPreflightSummary(),
    model_autopilot: modelAutopilotSnapshot(),
    usage_profile: {
      key: usage.key,
      label: usage.label,
      detail: usage.detail,
      recommended_model: usageModel,
      arena_profile: usage.arena,
      benchmark_test: usagePack.test.label,
      context: usagePack.context,
      quantization: usagePack.quantization
    },
    test_model: flow.testModel,
    recommended_model: flow.recommended?.ref ? {
      title: flow.recommended.title,
      ref: flow.recommended.ref,
      installed: flow.recommended.installed,
      benchmarked: flow.recommended.benchmarked,
      strength: flow.recommended.info?.strength || "",
      fit: flow.recommended.info?.fit || "",
      limit: flow.recommended.info?.limit || ""
    } : null,
    benchmark,
    promptForge: promptForge ? {
      model: promptForge.model,
      before_score: promptForge.before.score,
      after_score: promptForge.after.score,
      optimized: promptForge.optimized
    } : null,
    arena: arenaRun ? {
      protocol: arenaRun.protocol || "legacy_estimate",
      objective: arenaRun.protocol === ARENA_OBJECTIVE_PROTOCOL,
      recommended: arena?.recommended?.model || "",
      recommended_score: arena?.recommended ? arenaDisplayScore(arena.recommended, "compromise") : 0,
      compromise: arena?.compromise?.model || "",
      compromise_score: arena?.compromise ? arenaDisplayScore(arena.compromise, "compromise") : 0,
      fastest: arena?.fastest?.model || "",
      fastest_tps: arena?.fastest?.estimated_tokens_per_second || 0,
      assistant: arena?.assistant?.model || "",
      assistant_score: arena?.assistant ? arenaDisplayScore(arena.assistant, "assistant") : 0,
      code: arena?.code?.model || "",
      code_score: arena?.code ? arenaDisplayScore(arena.code, "code") : 0,
      memory: arena?.memory?.model || "",
      memory_score: arena?.memory ? arenaDisplayScore(arena.memory, "memory") : 0,
      reasoning: arena?.reasoning?.model || "",
      reasoning_score: arena?.reasoning ? arenaDisplayScore(arena.reasoning, "reasoning") : 0,
      french: arena?.french?.model || "",
      french_score: arena?.french ? arenaDisplayScore(arena.french, "french") : 0,
      light_laptop: arena?.light_laptop?.model || "",
      light_laptop_score: arena?.light_laptop ? arenaDisplayScore(arena.light_laptop, "light_laptop") : 0,
      long_context: arena?.long_context?.model || "",
      long_context_score: arena?.long_context ? arenaDisplayScore(arena.long_context, "long_context") : 0,
      quality: arena?.quality?.model || "",
      quality_score: arena?.quality ? arenaDisplayScore(arena.quality, "quality") : 0,
      responsive: arena?.responsive?.model || "",
      responsive_ms: arena?.responsive?.elapsed_ms || 0,
      successful_count: arena?.successful_count || 0,
      failed_count: arena?.failed_count || 0,
      proof_results: (arenaRun.results || []).map((item) => ({
        model: item.model,
        score: item.arena_objective?.score ?? null,
        checks: item.arena_objective ? `${item.arena_objective.passed_count}/${item.arena_objective.total_count}` : null
      }))
    } : null,
    recommendation_engine: recommendationEngine,
    private_workload_pack: privateWorkloadPackSummary(),
    models,
    upgrades,
    buying_links: buyingLinks,
    account_ready: Boolean(lastSyncedMachineId),
    chat_ready: flow.chatReady,
    share_url: lastShareReportUrl,
    next
  };
}

function readinessMarkdown(report = readinessReport()) {
  return [
    `# ${report.title}`,
    "",
    `- Date: ${report.generated_at}`,
    `- Statut: ${report.status}`,
    `- Potentiel matériel: ${report.score === null ? "non calculé" : `${report.score}/100`}`,
    `- État du runtime: ${report.runtime_readiness?.label || "non vérifié"} - ${report.runtime_readiness?.detail || ""}`,
    `- AI Capability Passport: ${report.capability_passport ? `SHA-256 ${report.capability_passport.digest}` : "non généré ou à régénérer"}`,
    `- Passerelle locale: ${report.local_capability_bridge?.running ? `active en lecture seule jusqu'à ${new Date(report.local_capability_bridge.expires_at_ms).toISOString()}` : "désactivée par défaut"}`,
    report.install_safety_preflight
      ? `- Préflight installation: ${report.install_safety_preflight.model} · ${report.install_safety_preflight.verdict} · ${report.install_safety_preflight.storage_free_gb == null ? "espace inconnu" : `${report.install_safety_preflight.storage_free_gb} Go libres`} · aucun chemin personnel exporté`
      : "- Préflight installation: non lancé.",
    `- Machine: ${report.machine.name}`,
    `- CPU: ${report.machine.cpu}`,
    `- RAM: ${report.machine.ram}`,
    `- GPU: ${report.machine.gpu}`,
    `- VRAM: ${report.machine.vram}`,
    `- OS: ${report.machine.os}`,
    `- Ollama: ${report.machine.ollama}`,
    "",
    "## Hardware Doctor",
    "",
    ...hardwareDoctorSummaryLines(report.hardware_doctor).map((line) => `- ${line}`),
    ...(report.hardware_doctor?.checks?.length ? [
      "",
      "### Signaux",
      ...report.hardware_doctor.checks.slice(0, 8).map((check) => `- ${check.label}: ${check.detail}`)
    ] : []),
    `- Profil d'usage: ${report.usage_profile.label}${report.usage_profile.recommended_model ? ` - ${report.usage_profile.recommended_model}` : ""}`,
    `- Modèle test: ${report.test_model}`,
    report.recommended_model ? `- Deuxième modèle recommandé: ${report.recommended_model.ref} (${report.recommended_model.installed ? "installé" : "à installer"})` : "",
    "",
    "## Build et release",
    "",
    `- App: ${report.release.app_version} (${report.release.channel})`,
    `- Build réellement lancé: ${report.release.build_id || "non chargé"}`,
    `- Commit source: ${report.release.source_commit || "non embarqué"}`,
    `- Release publique: ${report.release.release_label || "non chargée"}`,
    `- Build public: ${report.release.public_build_id || "non chargé"}`,
    `- Build lancé = public: ${report.release.build_matches_public ? "oui" : "non"}`,
    `- Installateur: ${report.release.file_name || "non chargé"}`,
    `- SHA256: ${report.release.sha256 || "non chargé"}`,
    `- Date release: ${report.release.published_at || "non chargée"}`,
    "",
    "## Preuve locale",
    "",
    report.benchmark
      ? `- Benchmark: ${report.benchmark.model} - ${report.benchmark.estimated_tokens_per_second} tok/s - ${report.benchmark.elapsed_ms} ms - ${benchmarkMeasurementLabel(report.benchmark)} - ${benchmarkExecutionLabel(report.benchmark)} - succès ${report.benchmark.success ? "oui" : "non"}`
      : "- Aucun benchmark lancé.",
    report.model_autopilot?.active
      ? `- Model Autopilot: profil ${report.model_autopilot.active.label} actif - ${modelAutopilotTuningLabel(report.model_autopilot.active.tuning)}`
      : report.model_autopilot?.recommended
        ? `- Model Autopilot: ${report.model_autopilot.recommended.label} recommandé, non appliqué`
        : "- Model Autopilot: non mesuré.",
    report.flight_recorder?.comparison
      ? `- Flight Recorder: ${report.flight_recorder.comparison.headline} · comparable ${report.flight_recorder.comparison.comparable ? "oui" : "non"} · confiance ${report.flight_recorder.comparison.confidence}`
      : "- Flight Recorder: aucune référence locale.",
    ...(report.flight_recorder?.comparison?.metrics || []).map((item) => `- Flight Recorder ${item.label}: ${item.reference} -> ${item.current} ${item.unit} (${item.status})`),
    ...(report.flight_recorder?.comparison?.possible_causes || []).map((item) => `- Cause possible Flight Recorder: ${item}`),
    report.benchmark?.output_preview ? `- Réponse: ${report.benchmark.output_preview}` : "",
    `- Dialogue local: ${report.chat_ready ? "réponse reçue" : "non validé"}`,
    report.promptForge ? `- PromptForge: ${report.promptForge.before_score}/100 -> ${report.promptForge.after_score}/100 (${report.promptForge.model})` : "- PromptForge: non utilisé.",
    report.arena?.compromise ? `- Arena locale: ${report.arena.objective ? "protocole objectif v1" : "ancien protocole estimatif"}, compromis ${report.arena.compromise} (${report.arena.compromise_score}/100), plus rapide ${report.arena.fastest || "n/a"}, assistant ${report.arena.assistant || "n/a"}, code ${report.arena.code || "n/a"}, mémoire ${report.arena.memory || "n/a"}, français ${report.arena.french || "n/a"}, portable ${report.arena.light_laptop || "n/a"}, rappel de contexte ${report.arena.long_context || "n/a"}, qualité ${report.arena.quality || "n/a"}` : "- Arena locale: non lancée.",
    ...(report.arena?.proof_results || []).map((item) => `- Preuve Arena ${item.model}: ${item.checks || "ancien protocole"}${item.score !== null ? `, ${item.score}/100` : ""}`),
    report.recommendation_engine
      ? `- Recommendation Engine v2 (${report.recommendation_engine.profile_label}): ${report.recommendation_engine.verdict} · confiance ${report.recommendation_engine.confidence}`
      : "- Recommendation Engine v2: non lancé.",
    ...(report.recommendation_engine?.results || []).map((item) => `- Candidat ${item.model}: score ${item.recommendation_score}/100 · preuves ${item.checks || "0/7"} · ${item.tokens_per_second} tok/s · ${item.elapsed_ms} ms · ${item.resources?.vram_required_q4_gb ? `${item.resources.vram_required_q4_gb} Go VRAM Q4 estimés` : "VRAM à confirmer"} · ${item.resources?.storage_label || "stockage à confirmer"}`),
    ...(report.recommendation_engine?.limits || []).map((item) => `- Limite Recommendation Engine: ${item}`),
    report.private_workload_pack?.winner
      ? `- Tests privés (${report.private_workload_pack.pack}): gagnant ${report.private_workload_pack.winner.model} · ${report.private_workload_pack.winner.score}/100 · confiance ${report.private_workload_pack.confidence} · aucun contenu brut exporté`
      : "- Tests privés: non lancés.",
    ...(report.private_workload_pack?.results || []).map((item) => `- Preuve privée ${item.model}: ${item.score}/100 · ${item.checks} checks · sortie SHA-256 ${item.output_digest}`),
    report.recommended_model ? `- Modèle sérieux suivant: ${report.recommended_model.title} - ${report.recommended_model.fit || "à comparer après le modèle test"}` : "",
    "",
    "## Simulation d'upgrade - aucune preuve physique",
    "",
    report.upgrade_digital_twin
      ? `- Upgrade Digital Twin: ${report.upgrade_digital_twin.decision.label} · compatibilité ${report.upgrade_digital_twin.compatibility.status} · confiance ${report.upgrade_digital_twin.compatibility.confidence} · budget ${report.upgrade_digital_twin.cost_eur.min}-${report.upgrade_digital_twin.cost_eur.max} EUR non temps réel`
      : "- Upgrade Digital Twin: aucun scénario calculé.",
    "- Portée: simulation locale uniquement ; aucune preuve terrain physique et aucun achat automatique.",
    ...(report.upgrade_digital_twin?.newly_reachable_models || []).map((model) => `- Modèle potentiellement débloqué par le Digital Twin: ${model}`),
    "",
    "## Prompt optimisé",
    "",
    report.promptForge?.optimized ? "```text" : "",
    report.promptForge?.optimized || "- Aucun prompt optimisé sauvegardé dans ce rapport.",
    report.promptForge?.optimized ? "```" : "",
    "",
    "## Modèles conseillés",
    "",
    ...(report.models.length
      ? report.models.map((model) => `- ${model.title}${model.command ? `: \`${model.command}\`` : ""} - ${model.reason}`)
      : ["- Aucun modèle conseillé exporté."]),
    "",
    "## Upgrade utile",
    "",
    ...(report.upgrades.length
      ? report.upgrades.map((upgrade) => `- ${upgrade.title}${upgrade.reason ? `: ${upgrade.reason}` : ""}`)
      : ["- Aucun achat prioritaire: mesurer davantage avant d'acheter."]),
    "",
    "## Partage",
    "",
    report.account_ready
      ? "- Machine synchronisée: créer ou copier le rapport partageable depuis le compte OutilsIA."
      : "- Connecter le compte OutilsIA puis cliquer sur Sauver ce PC pour générer un rapport partageable.",
    "",
    "## Prochaines actions",
    "",
    ...report.next.map((item) => `- ${item}`)
  ].filter(Boolean).join("\n");
}

function readinessArenaLabel(report = readinessReport()) {
  if (!report.arena?.compromise) return "Arena locale non lancée";
  const parts = [
    report.arena.objective ? "preuve objective v1" : "protocole estimatif",
    report.arena.fastest ? `rapide ${report.arena.fastest}` : "",
    report.arena.assistant ? `assistant ${report.arena.assistant}` : "",
    report.arena.code ? `code ${report.arena.code}` : "",
    report.arena.memory ? `mémoire ${report.arena.memory}` : "",
    report.arena.reasoning ? `raisonnement ${report.arena.reasoning}` : "",
    `compromis ${report.arena.compromise} (${report.arena.compromise_score}/100)`
  ].filter(Boolean);
  return parts.join(" · ");
}

function readinessSummaryText(report = readinessReport()) {
  const benchmark = report.benchmark
    ? `${report.benchmark.model} à ${report.benchmark.estimated_tokens_per_second ?? "--"} tok/s (${report.benchmark.elapsed_ms ?? "--"} ms)`
    : "benchmark non lancé";
  const recommended = report.recommended_model
    ? `${report.recommended_model.ref} - ${report.recommended_model.installed ? "installé" : "à installer"}`
    : "non déterminé";
  const upgrade = report.upgrades[0]
    ? `${report.upgrades[0].title}${report.upgrades[0].reason ? ` (${report.upgrades[0].reason})` : ""}`
    : "aucun achat prioritaire";
  const prompt = report.promptForge
    ? `PromptForge ${report.promptForge.before_score}/100 -> ${report.promptForge.after_score}/100`
    : "PromptForge non lancé";
  const lines = [
    "Résumé OutilsIA Local Cockpit",
    `Machine: ${report.machine.gpu} / ${report.machine.vram} VRAM / ${report.machine.ram} RAM`,
    `Score: ${report.score === null ? "non calculé" : `${report.score}/100`}`,
    `Hardware Doctor: ${report.hardware_doctor ? `${report.hardware_doctor.score}/100 - ${report.hardware_doctor.headline}` : "non calculé"}`,
    `Build: ${report.release.build_id || report.release.app_version || "non chargé"}`,
    `Preuve locale: ${benchmark}`,
    `Deuxième modèle: ${recommended}`,
    `Prompt: ${prompt}`,
    `Arena: ${readinessArenaLabel(report)}`,
    `Recommandation mesurée: ${report.recommendation_engine?.winner ? `${report.recommendation_engine.verdict} (${report.recommendation_engine.winner.score}/100, confiance ${report.recommendation_engine.confidence})` : "non lancée"}`,
    `Flight Recorder: ${report.flight_recorder?.comparison ? `${report.flight_recorder.comparison.headline} (confiance ${report.flight_recorder.comparison.confidence})` : "aucune référence"}`,
    `Upgrade Digital Twin: ${report.upgrade_digital_twin ? `${report.upgrade_digital_twin.decision.label} (${report.upgrade_digital_twin.compatibility.status}, confiance ${report.upgrade_digital_twin.compatibility.confidence})` : "aucun scénario"}`,
    `AI Capability Passport: ${report.capability_passport ? `SHA-256 ${report.capability_passport.digest}` : "non généré"}`,
    `Passerelle locale: ${report.local_capability_bridge?.running ? "active · 127.0.0.1 · lecture seule" : "désactivée"}`,
    `Préflight installation: ${report.install_safety_preflight ? `${report.install_safety_preflight.model} · ${report.install_safety_preflight.verdict}` : "non lancé"}`,
    `Upgrade utile: ${upgrade}`,
    `Prochaine action: ${report.next[0] || "sauvegarder le rapport"}`
  ];
  if (lastShareReportUrl) lines.push(`Rapport partagé: ${lastShareReportUrl}`);
  return lines.join("\n");
}

function pdfExcerpt(value, max = 360) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function pdfMetricBar(label, value, unit, max, caption) {
  const safeValue = numberOrZero(value);
  const safeMax = Math.max(numberOrZero(max), 1);
  const percent = Math.max(4, Math.min(100, Math.round((safeValue / safeMax) * 100)));
  return `
    <div class="pdf-metric">
      <div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(safeValue ? `${safeValue}${unit}` : "à confirmer")}</span></div>
      <div class="pdf-meter" aria-label="${escapeHtml(label)} ${percent}%"><i style="width:${percent}%"></i></div>
      <p>${escapeHtml(caption)}</p>
    </div>
  `;
}

function premiumReportHtml(report = readinessReport()) {
  const model = report.recommended_model || {};
  const upgrade = report.upgrades[0] || {};
  const upgradeDigitalTwin = report.upgrade_digital_twin || null;
  const digitalTwinRun = state.upgradeDigitalTwinRun || null;
  const legacyUpgradeImpact = currentUpgradeImpact();
  const upgradeImpact = digitalTwinRun ? {
    current: {
      vram_gb: digitalTwinRun.current?.gpu?.vram_gb ?? null,
      ram_gb: digitalTwinRun.current?.ram?.total_gb ?? null
    },
    next: {
      vram_gb: digitalTwinRun.target?.vram_gb ?? null,
      ram_gb: digitalTwinRun.target?.ram_gb ?? null
    },
    primary: {
      name: digitalTwinRun.decision?.label || "Simulation à vérifier",
      reason: digitalTwinRun.decision?.rationale || "Mesurer avant d'acheter."
    },
    price: `${digitalTwinRun.impact?.cost_eur?.min || 0}-${digitalTwinRun.impact?.cost_eur?.max || 0} EUR · estimation interne ${digitalTwinRun.impact?.cost_metadata?.as_of || DIGITAL_TWIN_PRICE_METADATA.as_of}, non temps réel`,
    avoid: digitalTwinRun.compatibility?.statement || "Vérifier les inconnues physiques avant achat.",
    guide: "",
    url: "",
    newlyReachable: digitalTwinRun.impact?.newly_reachable_models || []
  } : legacyUpgradeImpact;
  const benchmark = report.benchmark || null;
  const recommendation = report.recommendation_engine || null;
  const privateWorkload = report.private_workload_pack || null;
  const models = (report.models || []).slice(0, 5);
  const links = digitalTwinRun ? [] : (report.buying_links || []).slice(0, 4);
  const arenaRoles = [
    ["Rapide", report.arena?.fastest, report.arena?.fastest_tps ? `${report.arena.fastest_tps} tok/s` : ""],
    ["Assistant", report.arena?.assistant, report.arena?.assistant_score ? `${report.arena.assistant_score}/100` : ""],
    ["Code", report.arena?.code, report.arena?.code_score ? `${report.arena.code_score}/100` : ""],
    ["Mémoire", report.arena?.memory, report.arena?.memory_score ? `${report.arena.memory_score}/100` : ""],
    ["Français", report.arena?.french, report.arena?.french_score ? `${report.arena.french_score}/100` : ""],
    ["Portable", report.arena?.light_laptop, report.arena?.light_laptop_score ? `${report.arena.light_laptop_score}/100` : ""]
  ].filter(([, value]) => value);
  const modelStatus = model.ref
    ? model.installed ? model.benchmarked ? "Installé et benchmarké" : "Installé, à benchmarker" : "À installer"
    : "À déterminer";
  const scoreText = report.score === null ? "--" : `${report.score}/100`;
  const speedText = benchmark
    ? `${benchmark.estimated_tokens_per_second ?? "--"} tok/s · ${benchmark.elapsed_ms ?? "--"} ms`
    : "Benchmark local à lancer";
  const upgradeTitle = upgradeImpact.primary?.name || upgradeImpact.primary?.label || upgrade.title || "Pas d'achat urgent";
  const upgradeReason = upgradeImpact.primary?.reason || upgrade.reason || "Mesurer davantage avant d'acheter.";
  const upgradePrice = upgradeImpact.price || upgrade.price || "";
  const upgradeAvoid = upgradeImpact.avoid || upgrade.avoid || "";
  const upgradeGuide = upgradeImpact.guide || upgrade.url || "";
  const upgradeShopUrl = digitalTwinRun ? "" : upgradeImpact.url || "";
  const unlockedModels = upgradeImpact.newlyReachable || [];
  const upgradeText = `${upgradeTitle}${upgradeReason ? ` - ${upgradeReason}` : ""}`;
  const next = report.next.length
    ? report.next.slice(0, 4)
    : ["Sauvegarder ce PC.", "Tester un autre modèle local."];
  const scoreValue = report.score === null ? 0 : Number(report.score || 0);
  const vramValue = numberOrZero(state.scan?.vram_gb);
  const ramValue = numberOrZero(state.scan?.ram_gb);
  const compatibleCount = Array.isArray(state.compatibility?.compatible_models)
    ? state.compatibility.compatible_models.length
    : models.length;
  const compatibilityModels = extractModels(state.compatibility || {});
  const compatibilityOnlyCount = compatibilityModels.filter((item) => !actionableOllamaRef(item)).length;
  const fieldProfile = state.scan ? effectiveFieldTestProfile(state.scan) : null;
  const fieldSummary = state.scan ? fieldTestProfile() : null;
  const hardwareDoctor = report.hardware_doctor || hardwareDoctorSnapshot();
  const flightRecorder = report.flight_recorder || null;
  const proofLabel = benchmark
    ? `${benchmark.model} · ${benchmark.estimated_tokens_per_second ?? "--"} tok/s`
    : "Benchmark à lancer";
  const proofItems = [
    benchmark ? `Benchmark réel : ${benchmark.model} à ${benchmark.estimated_tokens_per_second ?? "--"} tok/s` : "Benchmark court à lancer",
    report.promptForge ? `PromptForge : ${report.promptForge.before_score}/100 -> ${report.promptForge.after_score}/100` : "PromptForge non utilisé",
    report.arena?.compromise ? `Arena : ${readinessArenaLabel(report)}` : "Arena locale à comparer",
    recommendation?.winner ? `Recommendation Engine : ${recommendation.verdict} (${recommendation.winner.score}/100)` : "Recommendation Engine v2 à lancer",
    privateWorkload?.winner ? `Tests privés : ${privateWorkload.winner.model} (${privateWorkload.winner.score}/100 · ${privateWorkload.pack})` : "Tests privés à lancer dans Détails",
    flightRecorder?.comparison ? `Flight Recorder : ${flightRecorder.comparison.headline} · confiance ${flightRecorder.comparison.confidence}` : "Flight Recorder : aucune référence locale",
    report.capability_passport ? `Capability Passport : SHA-256 ${report.capability_passport.digest}` : "AI Capability Passport à générer dans Détails",
    report.local_capability_bridge?.running ? "Passerelle locale : active sur 127.0.0.1 · lecture seule" : "Passerelle locale : désactivée par défaut",
    report.install_safety_preflight ? `Préflight installation : ${report.install_safety_preflight.model} · ${report.install_safety_preflight.verdict}` : "Préflight installation : non lancé",
    model.ref ? `Modèle suivant : ${model.ref}` : "Modèle suivant à déterminer"
  ];
  const installNow = model.ref || report.test_model || "qwen3:0.6b";
  const installNowReason = model.fit || model.strength || "Valider la machine avec un modèle local actionnable avant de monter en gamme.";
  const buyOnlyIf = digitalTwinRun
    ? `${upgradeTitle}. ${upgradeReason}`
    : upgrade.title
      ? `${upgrade.title} seulement si le modèle visé reste bloqué ou trop lent après benchmark.`
      : "Aucun achat prioritaire tant qu'un benchmark local n'a pas montré un vrai blocage.";
  const shareProof = report.share_url
    ? `Rapport partageable : ${report.share_url}`
    : "Rapport local prêt à exporter, sauvegarder ou partager depuis le compte OutilsIA.";
  const shareUrl = report.share_url || "À générer depuis le bouton Partager après sauvegarde compte.";
  const shareDecision = report.share_url
    ? "Lien public prêt pour comparer, demander un avis ou préparer un achat matériel."
    : "Génère un lien après sauvegarde compte pour conserver une preuve propre avant achat.";
  const currentVram = upgradeImpact.current?.vram_gb ?? (vramValue || null);
  const currentRam = upgradeImpact.current?.ram_gb ?? (ramValue || null);
  const nextVram = upgradeImpact.next?.vram_gb ?? currentVram;
  const nextRam = upgradeImpact.next?.ram_gb ?? currentRam;
  const blockedModels = ((state.compatibility?.compatibility || state.compatibility || {}).blocked_next || (state.compatibility?.compatibility || state.compatibility || {}).blocked || [])
    .slice(0, 4);
  const currentLimits = [
    vramValue ? `VRAM actuelle : ${vramValue} Go, suffisante pour les modèles compatibles mais limitante pour les gros paliers.` : "VRAM à confirmer par un scan matériel.",
    ramValue ? `RAM actuelle : ${ramValue} Go, utile pour RAG, multitâche et offload CPU.` : "RAM à confirmer par un scan matériel.",
    blockedModels.length ? `Paliers bloqués : ${blockedModels.map(modelTitle).join(", ")}.` : "Aucun palier proche bloqué dans le catalogue actuel.",
    benchmark ? `Preuve locale disponible : ${benchmark.model} à ${benchmark.estimated_tokens_per_second ?? "--"} tok/s.` : "Benchmark local requis avant achat matériel."
  ];
  const upgradeBuyRule = digitalTwinRun
    ? digitalTwinRun.decision?.key === "no_buy"
      ? "Ne pas acheter pour ce scénario : aucun nouveau palier utile n'est démontré."
      : "Acheter seulement après avoir levé toutes les inconnues et confirmé le besoin par benchmark."
    : upgrade.title
      ? `Acheter si ${model.ref || "le modèle visé"} reste trop lent, manque de VRAM ou bloque après benchmark local.`
      : "Acheter seulement après un benchmark qui montre une limite claire.";
  const upgradeWaitRule = benchmark
    ? "Attendre si les modèles recommandés répondent déjà vite et que l'usage reste chat, code léger, résumé ou mémoire locale."
    : "Attendre tant qu'aucune preuve locale tokens/s n'a été produite.";
  const upgradeControlRule = "Contrôler VRAM, alimentation, refroidissement, longueur de carte, garantie et prix réel avant achat.";
  const unlockedText = unlockedModels.length
    ? unlockedModels.map(modelTitle).join(", ")
    : "Aucun modèle proche débloqué dans les paliers actuels : l'upgrade apporte surtout de la marge.";
  return `
    <article class="pdf-sheet">
      <header class="pdf-hero">
        <div>
          <p class="pdf-eyebrow">OutilsIA Local Cockpit</p>
          <h1>Rapport IA locale</h1>
          <p>${escapeHtml(report.machine.gpu)} · ${escapeHtml(report.machine.vram)} VRAM · ${escapeHtml(report.machine.ram)} RAM</p>
        </div>
        <div class="pdf-score">
          <strong>${escapeHtml(scoreText)}</strong>
          <span>Score IA locale</span>
        </div>
      </header>

      <section class="pdf-decision-strip">
        <div>
          <span>Décision immédiate</span>
          <strong>${escapeHtml(report.verdict || "Tester avant d'acheter")}</strong>
        </div>
        <div>
          <span>Modèle à privilégier</span>
          <strong>${escapeHtml(recommendation?.winner?.model || model.ref || report.test_model || "à déterminer")}</strong>
        </div>
        <div>
          <span>Preuve locale</span>
          <strong>${escapeHtml(proofLabel)}</strong>
        </div>
        <div>
          <span>Upgrade utile</span>
          <strong>${escapeHtml(upgradeTitle)}</strong>
        </div>
      </section>

      <section class="pdf-exec-grid">
        <div>
          <span>Ce PC peut faire</span>
          <strong>${escapeHtml(report.verdict || `${compatibleCount} modèle(s) compatibles`)}</strong>
          <p>${escapeHtml(`${report.machine.gpu} avec ${report.machine.vram} VRAM et ${report.machine.ram} RAM : privilégier les modèles compatibles puis confirmer par benchmark.`)}</p>
        </div>
        <div>
          <span>À installer maintenant</span>
          <strong>${escapeHtml(installNow)}</strong>
          <p>${escapeHtml(pdfExcerpt(installNowReason, 220))}</p>
        </div>
        <div>
          <span>Achat seulement si blocage</span>
          <strong>${escapeHtml(upgradeTitle)}</strong>
          <p>${escapeHtml(pdfExcerpt(buyOnlyIf, 220))}</p>
        </div>
        <div>
          <span>Preuve partageable</span>
          <strong>${escapeHtml(benchmark ? speedText : "Benchmark à produire")}</strong>
          <p>${escapeHtml(pdfExcerpt(shareProof, 220))}</p>
        </div>
      </section>

      <section class="pdf-proof-band">
        <div>
          <span>Ce rapport sépare</span>
          <strong>Preuves locales, simulation d'upgrade et contrôles physiques</strong>
        </div>
        <ul>
          ${proofItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>

      <section class="pdf-share-panel">
        <div>
          <span>Rapport partageable</span>
          <strong>${escapeHtml(report.share_url ? "Lien public prêt" : "Lien à générer")}</strong>
          <p>${escapeHtml(`Rapport local prêt. ${shareDecision}`)}</p>
        </div>
        <code>${escapeHtml(shareUrl)}</code>
        <div>
          <span>Décision d'achat</span>
          <strong>${escapeHtml(digitalTwinRun?.decision?.key === "no_buy" ? "Aucun achat proposé" : "Achat seulement après vérification")}</strong>
          <p>${escapeHtml(digitalTwinRun?.decision?.key === "no_buy" ? "Le scénario actif ne démontre aucun nouveau palier utile et masque les liens d'achat." : "Les liens matériels servent à comparer VRAM, RAM, refroidissement et budget après benchmark et vérification physique.")}</p>
        </div>
      </section>

      <section class="pdf-field-summary">
        <div class="pdf-field-title">
          <span>Synthèse terrain</span>
          <strong>Ce qui doit rester lisible dans le PDF</strong>
          <p>Le lecteur doit comprendre le matériel, le modèle conseillé, la preuve locale et l'achat utile sans relire toute l'application.</p>
        </div>
        <div class="pdf-field-cards">
          <div>
            <span>Profil terrain</span>
            <strong>${escapeHtml(fieldProfile?.label || fieldSummary?.machineClass || "Machine scannée")}</strong>
            <p>${escapeHtml(fieldSummary?.verdict || "Profil déterminé par le scan matériel.")}</p>
          </div>
          <div>
            <span>Compatibilité modèles</span>
            <strong>${escapeHtml(`${compatibleCount} compatibles`)}</strong>
            <p>${escapeHtml(`${models.length} modèle(s) mis en avant dans le rapport, benchmark local requis avant décision finale.`)}</p>
          </div>
          <div>
            <span>Garde-fou médias</span>
            <strong>${escapeHtml(`${compatibilityOnlyCount} compatibilité seulement`)}</strong>
            <p>Image, audio ou vidéo restent visibles pour le matériel, sans bouton Bench chat ni Dialogue.</p>
          </div>
          <div>
            <span>Achat utile</span>
            <strong>${escapeHtml(upgradeTitle)}</strong>
            <p>${escapeHtml(digitalTwinRun?.decision?.key === "no_buy" ? "Aucun lien d'achat pour ce scénario." : "Liens utiles seulement après benchmark et contrôles physiques.")}</p>
          </div>
        </div>
      </section>

      <section class="pdf-grid">
        <div class="pdf-card pdf-card-wide">
          <span>Profil technique</span>
          <strong>${escapeHtml(compatibleCount)} modèle(s) compatibles détectés</strong>
          <div class="pdf-metrics">
            ${pdfMetricBar("Score", scoreValue, "/100", 100, "Lecture rapide du potentiel IA locale de cette machine.")}
            ${pdfMetricBar("VRAM", vramValue, " Go", 24, "La VRAM détermine les gros modèles confortables en local.")}
            ${pdfMetricBar("RAM", ramValue, " Go", 128, "La RAM aide le RAG, les gros contextes et le multitâche.")}
          </div>
        </div>
        <div class="pdf-card pdf-card-wide">
          <span>Machine détectée</span>
          <strong>${escapeHtml(report.machine.name || report.machine.gpu)}</strong>
          <p>CPU : ${escapeHtml(report.machine.cpu)}</p>
          <p>GPU : ${escapeHtml(report.machine.gpu)}</p>
          <p>RAM : ${escapeHtml(report.machine.ram)} · VRAM : ${escapeHtml(report.machine.vram)}</p>
          <p>OS : ${escapeHtml(report.machine.os)} · Ollama : ${escapeHtml(report.machine.ollama)}</p>
          <p>Build : ${escapeHtml(report.release.build_id || report.release.app_version || "non chargé")} · SHA : ${escapeHtml(shortHash(report.release.sha256) || "non chargé")}</p>
        </div>
        <div class="pdf-card pdf-card-wide">
          <span>Hardware Doctor</span>
          <strong>${escapeHtml(hardwareDoctor ? `${hardwareDoctor.score}/100 · ${hardwareDoctor.headline}` : "À calculer")}</strong>
          <p>${escapeHtml(hardwareDoctor?.summary || "Le scan affichera RAM, driver, runtime et signaux GPU disponibles.")}</p>
          <p>${escapeHtml(hardwareDoctor ? `RAM : ${hardwareDoctor.ram.module_count || "?"} module(s), ${hardwareDoctor.ram.channel_mode}, ${hardwareDoctor.ram.effective_clock_label}` : "RAM : à confirmer")}</p>
          <p>${escapeHtml(hardwareDoctor ? `GPU : ${hardwareDoctor.gpu.confidence}${hardwareDoctor.gpu.cuda_version ? ` · CUDA ${hardwareDoctor.gpu.cuda_version}` : ""}` : "GPU : à confirmer")}</p>
          <p>${escapeHtml(hardwareDoctor?.actions?.[0] || "Aucune action doctor urgente détectée.")}</p>
        </div>
        <div class="pdf-card pdf-card-wide">
          <span>Flight Recorder</span>
          <strong>${escapeHtml(flightRecorder?.comparison?.headline || "Aucune référence locale")}</strong>
          <p>${escapeHtml(flightRecorder?.comparison ? `Comparable : ${flightRecorder.comparison.comparable ? "oui" : "non"} · confiance ${flightRecorder.comparison.confidence} · ${flightRecorder.history_count} référence(s)` : "Définissez volontairement une référence après un benchmark exact.")}</p>
          <p>${escapeHtml(pdfExcerpt(flightRecorder?.comparison?.possible_causes?.[0] || "Les causes restent des hypothèses tant qu'aucun changement déterministe n'est prouvé.", 320))}</p>
          <p>Référence locale uniquement : ce signal ne valide pas une machine physique de la campagne terrain.</p>
        </div>
        <div class="pdf-card pdf-card-wide">
          <span>Upgrade Digital Twin</span>
          <strong>${escapeHtml(upgradeDigitalTwin?.decision?.label || "Scénario à calculer")}</strong>
          <p>${escapeHtml(upgradeDigitalTwin ? `Cible ${upgradeDigitalTwin.target.gpu} · ${knownNumberLabel(upgradeDigitalTwin.target.ram_gb, " Go RAM")} · pré-évaluation ${upgradeDigitalTwin.compatibility.status} · confiance ${upgradeDigitalTwin.compatibility.confidence}.` : "Le laboratoire Détails simule GPU, RAM, stockage, alimentation et boîtier sans modifier la machine.")}</p>
          <p>${escapeHtml(upgradeDigitalTwin ? `Budget indicatif non temps réel : ${upgradeDigitalTwin.cost.min}-${upgradeDigitalTwin.cost.max} ${upgradeDigitalTwin.cost.currency} · estimation ${upgradeDigitalTwin.cost.as_of} · ${upgradeDigitalTwin.compatibility.unknown_count} inconnue(s) · ${upgradeDigitalTwin.compatibility.blocked_count} blocage(s).` : "Aucun budget ne doit être utilisé avant vérification des inconnues physiques.")}</p>
          <p>Simulation locale uniquement : aucune preuve terrain physique et aucun achat automatique.</p>
        </div>
        <div class="pdf-card">
          <span>Modèle conseillé</span>
          <strong>${escapeHtml(model.ref || report.test_model || "qwen3:0.6b")}</strong>
          <p>${escapeHtml(model.title || "Modèle local à valider")}</p>
          <p>${escapeHtml(model.fit || "Tester la qualité et la vitesse sur cette machine.")}</p>
          <em>${escapeHtml(modelStatus)}</em>
        </div>
        <div class="pdf-card">
          <span>Preuve locale</span>
          <strong>${escapeHtml(benchmark?.model || "À benchmarker")}</strong>
          <p>${escapeHtml(speedText)}</p>
          <p>${escapeHtml(pdfExcerpt(benchmark?.output_preview || "Lance un test court pour obtenir une preuve locale lisible.", 260))}</p>
        </div>
        <div class="pdf-card">
          <span>PromptForge</span>
          <strong>${escapeHtml(report.promptForge ? `${report.promptForge.before_score}/100 → ${report.promptForge.after_score}/100` : "Non utilisé")}</strong>
          <p>${escapeHtml(pdfExcerpt(report.promptForge?.optimized || "Optimise un prompt avant benchmark/dialogue pour mesurer le modèle dans de meilleures conditions.", 340))}</p>
        </div>
        <div class="pdf-card">
          <span>Arena locale</span>
          <strong>${escapeHtml(report.arena?.compromise || "À lancer")}</strong>
          <p>${escapeHtml(pdfExcerpt(report.arena?.compromise ? readinessArenaLabel(report) : "Compare les modèles installés pour séparer vitesse, assistant, code, mémoire et compromis.", 300))}</p>
        </div>
        <div class="pdf-card pdf-card-wide">
          <span>Recommendation Engine v2</span>
          <strong>${escapeHtml(recommendation?.verdict || "Comparaison par usage à lancer")}</strong>
          <p>${escapeHtml(recommendation?.winner ? `${recommendation.profile_label} · score ${recommendation.winner.score}/100 · confiance ${recommendation.confidence} · ${recommendation.winner.tokens_per_second} tok/s · ${recommendation.winner.elapsed_ms} ms` : "Deux modèles compatibles sont soumis aux mêmes preuves objectives et à un test propre à l'usage choisi.")}</p>
          <p>${escapeHtml(recommendation?.winner?.resources ? `Ressources estimées : ${recommendation.winner.resources.vram_required_q4_gb || "?"} Go VRAM Q4 · ${recommendation.winner.resources.machine_ram_gb || "?"} Go RAM disponibles · ${recommendation.winner.resources.storage_label || "stockage à confirmer"}.` : "Les besoins VRAM, la RAM disponible et le stockage sont affichés sans inventer une mesure système absente.")}</p>
          <p>${escapeHtml(recommendation?.limits?.join(" ") || "La décision reste limitée au protocole court et doit être confirmée sur les tâches longues de l'utilisateur.")}</p>
        </div>
        <div class="pdf-card pdf-card-wide">
          <span>Tests privés</span>
          <strong>${escapeHtml(privateWorkload?.winner ? `${privateWorkload.winner.model} · ${privateWorkload.winner.score}/100` : "Pack local à lancer")}</strong>
          <p>${escapeHtml(privateWorkload?.winner ? `Pack ${privateWorkload.pack} · confiance ${privateWorkload.confidence} · ${privateWorkload.model_count} modèles soumis à la même tâche.` : "Code, Français, résumé, mémoire/Obsidian ou tâche métier personnalisée, uniquement sur des modèles déjà installés.")}</p>
          <p>La consigne et les réponses brutes ne sont ni placées dans ce PDF, ni envoyées au cloud. Seuls scores, checks et empreintes SHA-256 sont exportés.</p>
        </div>
        <div class="pdf-card pdf-card-wide">
          <span>Upgrade utile</span>
          <strong>${escapeHtml(upgradeTitle)}</strong>
          <p>${escapeHtml(upgradeReason || upgradeText)}</p>
          <div class="pdf-upgrade-comparison">
            <div>
              <span>Avant upgrade</span>
              <strong>${escapeHtml(currentVram ? `${currentVram} Go VRAM` : "VRAM à confirmer")}</strong>
              <p>${escapeHtml(currentRam ? `${currentRam} Go RAM` : "RAM à confirmer")}</p>
            </div>
            <div>
              <span>Après upgrade</span>
              <strong>${escapeHtml(nextVram ? `${nextVram} Go VRAM` : "Palier à confirmer")}</strong>
              <p>${escapeHtml(nextRam ? `${nextRam} Go RAM` : "RAM stable ou à confirmer")}</p>
            </div>
            <div>
              <span>Budget indicatif</span>
              <strong>${escapeHtml(upgradePrice || "à vérifier")}</strong>
              <p>${escapeHtml(unlockedModels.length ? `${unlockedModels.length} modèle(s) potentiellement débloqué(s)` : "Aucun modèle proche débloqué dans le catalogue actuel.")}</p>
            </div>
          </div>
          ${upgradeAvoid ? `<p><strong class="pdf-inline-warning">À éviter</strong> ${escapeHtml(upgradeAvoid)}</p>` : ""}
          ${upgradeGuide || upgradeShopUrl ? `<p>${upgradeGuide ? `Guide : ${escapeHtml(upgradeGuide)}` : ""}${upgradeGuide && upgradeShopUrl ? " · " : ""}${upgradeShopUrl ? `Prix : ${escapeHtml(upgradeShopUrl)}` : ""}</p>` : ""}
        </div>
      </section>

      <section class="pdf-upgrade-dossier">
        <div class="pdf-dossier-head">
          <span>Dossier upgrade IA locale</span>
          <strong>${escapeHtml(upgradeTitle)}</strong>
          <p>${escapeHtml(pdfExcerpt(upgradeReason || buyOnlyIf, 260))}</p>
        </div>
        <div class="pdf-upgrade-rules">
          <div>
            <span>Acheter si</span>
            <strong>${escapeHtml(upgradeTitle)}</strong>
            <p>${escapeHtml(upgradeBuyRule)}</p>
          </div>
          <div>
            <span>Attendre si</span>
            <strong>les modèles actuels suffisent</strong>
            <p>${escapeHtml(upgradeWaitRule)}</p>
          </div>
          <div>
            <span>Contrôler avant achat</span>
            <strong>compatibilité à confirmer</strong>
            <p>${escapeHtml(upgradeControlRule)}</p>
          </div>
        </div>
        <div class="pdf-dossier-columns">
          <div>
            <span>Limites actuelles</span>
            <ul class="pdf-limit-list">
              ${currentLimits.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </div>
          <div>
            <span>Modèles débloqués</span>
            <p>${escapeHtml(unlockedText)}</p>
            <p>${escapeHtml(upgradePrice ? `Budget indicatif : ${upgradePrice}.` : "Budget indicatif à vérifier selon le marché.")}</p>
          </div>
        </div>
      </section>

      <section class="pdf-grid pdf-grid-compact">
        <div class="pdf-card pdf-card-wide">
          <span>Modèles à tester</span>
          <div class="pdf-table">
            ${models.length ? models.map((item) => `
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(pdfExcerpt(item.reason, 180))}</p>
                ${item.command ? `<code>${escapeHtml(item.command)}</code>` : `<em>Compatibilité visible, commande non pilotée ici.</em>`}
              </div>
            `).join("") : "<p>Aucun modèle exporté dans ce rapport.</p>"}
          </div>
        </div>
        <div class="pdf-card">
          <span>Gagnants par usage</span>
          ${arenaRoles.length ? `<ul class="pdf-role-list">${arenaRoles.map(([label, value, score]) => `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}${score ? ` · ${escapeHtml(score)}` : ""}</span></li>`).join("")}</ul>` : "<p>Arena locale non lancée.</p>"}
        </div>
        <div class="pdf-card">
          <span>Shopping / guides</span>
          <strong>Liens utiles avant achat</strong>
          ${links.length ? `<ul class="pdf-link-list">${links.map((link) => `<li><strong>${escapeHtml(link.title)}</strong><span>${escapeHtml(link.text || "")}</span><code>${escapeHtml(link.url || "")}</code></li>`).join("")}</ul>` : `<p>${escapeHtml(digitalTwinRun ? "Les liens d'achat sont masqués pendant la simulation Digital Twin ; vérifiez d'abord les inconnues physiques." : "Aucun lien d'achat ou guide prioritaire.")}</p>`}
          <div class="pdf-buy-checklist">
            <span>Checklist achat</span>
            <p>Comparer la VRAM, vérifier le refroidissement, contrôler l'alimentation, puis acheter seulement si le benchmark local montre un vrai blocage.</p>
          </div>
        </div>
      </section>

      <section class="pdf-actions">
        <h2>Décision OutilsIA</h2>
        <p>${escapeHtml(report.verdict || "Diagnostic prêt. Tester localement avant d'acheter.")}</p>
        <ol>
          ${next.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ol>
      </section>

      <footer class="pdf-footer">
        <span>Généré localement le ${escapeHtml(new Date().toLocaleString("fr-FR"))}</span>
        <span>${report.share_url ? `Rapport partagé : ${escapeHtml(report.share_url)}` : "Scan, modèles, preuve locale, upgrade utile."}</span>
      </footer>
    </article>
  `;
}

function printPremiumReport() {
  if (!state.scan) {
    setStatus("Scan requis avant rapport PDF", "warn");
    return;
  }
  if (!els.printReportRoot) {
    setStatus("Zone d'impression introuvable", "bad");
    return;
  }
  els.printReportRoot.innerHTML = premiumReportHtml();
  window.setTimeout(() => {
    window.print();
    setStatus("Rapport PDF prêt : choisis Enregistrer en PDF", "ok");
  }, 80);
}

function memoryYaml(fields = {}) {
  const entries = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${JSON.stringify(String(value))}`);
  return entries.length ? ["---", ...entries, "---", ""].join("\n") : "";
}

function memoryMachineCard(report = readinessReport()) {
  return [
    memoryYaml({
      type: "machine",
      source: "outilsia-local-cockpit",
      machine: report.machine.name,
      gpu: report.machine.gpu,
      vram: report.machine.vram,
      score: report.score === null ? "" : report.score
    }),
    "# Fiche machine OutilsIA",
    "",
    `- Machine: ${report.machine.name}`,
    `- CPU: ${report.machine.cpu}`,
    `- RAM: ${report.machine.ram}`,
    `- GPU: ${report.machine.gpu}`,
    `- VRAM: ${report.machine.vram}`,
    `- OS: ${report.machine.os}`,
    `- Ollama: ${report.machine.ollama}`,
    `- Score IA locale: ${report.score === null ? "non calculé" : `${report.score}/100`}`,
    "",
    "## Décision",
    "",
    report.verdict || "Diagnostic non calculé.",
    "",
    "## Prochaine action",
    "",
    ...(report.next.length ? report.next.slice(0, 5).map((item) => `- ${item}`) : ["- Lancer un benchmark local puis sauvegarder le rapport."])
  ].join("\n");
}

function memoryModelCards(report = readinessReport()) {
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  const models = extractModels(compatibility).slice(0, 8);
  const lines = [
    "# Fiches modèles OutilsIA",
    "",
    "Ces fiches séparent le modèle test, le modèle recommandé et les modèles compatibles à comparer."
  ];
  const recommendedRef = report.recommended_model?.ref || "";
  const appendModel = (model, index) => {
    const ref = actionableOllamaRef(model);
    const info = modelInfo(ref || modelTitle(model));
    const benchmark = ref ? successfulBenchmarkFor(ref) : null;
    const status = ref
      ? isOllamaModelInstalled(ref)
        ? "installé"
        : "à installer"
      : "compatible non piloté ici";
    lines.push(
      "",
      `## ${modelTitle(model)}`,
      "",
      `- Rôle: ${ref && sameOllamaModel(ref, "qwen3:0.6b") ? "test léger" : ref === recommendedRef ? "modèle recommandé" : index < 3 ? "candidat prioritaire" : "compatible"}`,
      `- Référence Ollama: ${ref || "non actionnable dans l'app"}`,
      `- Statut: ${status}`,
      `- Force: ${info.strength}`,
      `- Usage: ${info.fit}`,
      `- Limite: ${info.limit}`,
      `- Taille estimée: ${ref ? estimatedModelSizeLabel(ref) : "variable"}`,
      benchmark ? `- Dernier benchmark: ${benchmark.estimated_tokens_per_second} tok/s, ${benchmark.elapsed_ms} ms` : "- Dernier benchmark: non mesuré",
      ref ? `- Commande: ${ollamaRuntimeCommandLabel(ref)} run ${ref}` : "- Commande: non fournie"
    );
  };
  const starter = { name: "Qwen3 test léger", params: "0.6B", ollama: "qwen3:0.6b" };
  appendModel(starter, 0);
  models.forEach(appendModel);
  return lines.join("\n");
}

function memoryBenchmarkCards() {
  const benchmarks = readBenchmarkHistory().slice(0, 8);
  const arena = readLastArenaRun();
  const winners = arena?.results?.length ? arenaWinners(arena.results) : null;
  const lines = [
    "# Fiches benchmarks locaux",
    "",
    benchmarks.length
      ? "Chaque fiche conserve le modèle, la vitesse, la latence et la lecture utile."
      : "Aucun benchmark local sauvegardé pour l'instant."
  ];
  for (const item of benchmarks) {
    lines.push(
      "",
      `## Benchmark ${item.model || "modèle local"}`,
      "",
      `- Date: ${new Date(Number(item.created_at_ms || Date.now())).toISOString()}`,
      `- Succès: ${item.success ? "oui" : "non"}`,
      `- ${benchmarkSpeedLabel(item)}: ${item.estimated_tokens_per_second || 0} tok/s`,
      `- Méthode: ${benchmarkMeasurementLabel(item)}`,
      `- Latence: ${item.elapsed_ms || 0} ms`,
      `- Tokens: ${item.estimated_tokens || 0}`,
      item.arena_objective ? `- Preuve Arena objective: ${item.arena_objective.passed_count}/${item.arena_objective.total_count} (${item.arena_objective.score}/100)` : "",
      item.arena_objective ? `- Vérifications: ${item.arena_objective.checks.map((check) => `${check.label} ${check.passed ? "OK" : "NON"}`).join(" · ")}` : "",
      item.recommendation_proof ? `- Recommendation Engine ${item.recommendation_proof.profile_label}: ${item.recommendation_proof.passed_count}/${item.recommendation_proof.total_count} (${item.recommendation_proof.score}/100)` : "",
      item.resource_estimates ? `- Ressources: ${item.resource_estimates.vram_required_q4_gb || "?"} Go VRAM Q4 estimés · ${item.resource_estimates.machine_ram_gb || "?"} Go RAM disponibles · ${item.resource_estimates.storage_label || "stockage à confirmer"}` : "",
      item.error ? `- Erreur: ${item.error}` : "",
      "",
      "```text",
      item.output_preview || "",
      "```"
    );
  }
  if (winners) {
    lines.push(
      "",
      "## Lecture Arena",
      "",
      `- Plus rapide: ${winners.fastest ? arenaWinnerLabel(winners.fastest, "speed") : "aucun"}`,
      `- Assistant: ${winners.assistant ? arenaWinnerLabel(winners.assistant, "assistant") : "aucun"}`,
      `- Code: ${winners.code ? arenaWinnerLabel(winners.code, "code") : "aucun"}`,
      `- Mémoire / Obsidian: ${winners.memory ? arenaWinnerLabel(winners.memory, "memory") : "aucun"}`,
      `- Protocole: ${arena?.protocol === ARENA_OBJECTIVE_PROTOCOL ? "Arena objective v1" : "ancien protocole estimatif"}`,
      `- Raisonnement court: ${winners.reasoning ? arenaWinnerLabel(winners.reasoning, "reasoning") : "aucun"}`,
      `- Compromis: ${winners.compromise ? arenaWinnerLabel(winners.compromise, "compromise") : "aucun"}`
    );
  }
  const recommendation = recommendationReportSnapshot();
  if (recommendation) {
    lines.push(
      "",
      "## Décision Recommendation Engine v2",
      "",
      `- Profil: ${recommendation.profile_label}`,
      `- Verdict: ${recommendation.verdict}`,
      `- Confiance: ${recommendation.confidence}`,
      recommendation.winner ? `- Modèle à garder: ${recommendation.winner.model} (${recommendation.winner.score}/100, ${recommendation.winner.checks} preuves)` : "- Aucun modèle validé.",
      ...recommendation.results.map((item) => `- ${item.model}: ${item.recommendation_score}/100 · ${item.checks || "0/7"} · ${item.tokens_per_second} tok/s · ${item.elapsed_ms} ms`),
      ...recommendation.limits.map((item) => `- Limite: ${item}`)
    );
  }
  return lines.join("\n");
}

function memoryDecisionCard(report = readinessReport()) {
  const pack = currentDecisionPack();
  return [
    "# Décisions et prochaines actions",
    "",
    "## Décisions",
    "",
    `- Modèle test: ${report.test_model || "qwen3:0.6b"}`,
    `- Deuxième modèle: ${report.recommended_model?.ref || "non déterminé"}`,
    `- Recommandation mesurée: ${report.recommendation_engine?.verdict || "non lancée"}`,
    report.recommendation_engine?.winner ? `- Modèle à garder: ${report.recommendation_engine.winner.model} (${report.recommendation_engine.winner.score}/100, confiance ${report.recommendation_engine.confidence})` : "",
    report.upgrade_digital_twin ? `- Digital Twin: ${report.upgrade_digital_twin.decision.label} · ${report.upgrade_digital_twin.compatibility.status}` : "- Digital Twin: non calculé",
    `- PromptForge: ${report.promptForge ? `${report.promptForge.before_score}/100 -> ${report.promptForge.after_score}/100` : "non lancé"}`,
    `- Rapport partagé: ${lastShareReportUrl || "non partagé"}`,
    "",
    "## Actions à faire",
    "",
    ...(report.next.length ? report.next.map((item) => `- ${item}`) : ["- Sauvegarder la machine puis relancer un benchmark avec un modèle plus sérieux."]),
    "",
    "## Shopping list utile",
    "",
    ...(pack.upgrades.length
      ? pack.upgrades.slice(0, 4).map((upgrade) => `- ${upgrade.label}${upgrade.price ? ` (${upgrade.price})` : ""}: ${upgrade.reason || "à vérifier"}`)
      : ["- Aucun achat prioritaire calculé."])
  ].join("\n");
}

function memoryVaultIndex(report = readinessReport()) {
  return [
    memoryYaml({
      type: "index",
      source: "outilsia-local-cockpit",
      generated_at: report.generated_at,
      machine: report.machine.name,
      score: report.score === null ? "" : report.score
    }),
    "# MEMORY - OutilsIA Local Cockpit",
    "",
    "## Résumé utile",
    "",
    `- Machine: ${report.machine.gpu} · ${report.machine.vram} VRAM · ${report.machine.ram} RAM`,
    `- Score: ${report.score === null ? "non calculé" : `${report.score}/100`}`,
    `- Modèle test: ${report.test_model}`,
    `- Modèle suivant: ${report.recommended_model?.ref || "à déterminer"}`,
    `- Rapport partagé: ${lastShareReportUrl || "non partagé"}`,
    "",
    "## Fichiers logiques du vault",
    "",
    "- `MEMORY.md`: décisions utiles, prochaine action, résumé exploitable.",
    "- `MANIFESTE.md`: liste des fichiers exportés et règle de mémoire.",
    "- `00-Machine.md`: machine, runtimes, RAM, GPU, VRAM et état Ollama.",
    "- `01-Modeles-compatibles.md`: modèles recommandés et compatibles.",
    "- `02-Modeles-installes.md`: modèles Ollama déjà présents localement.",
    "- `03-Benchmarks.md`: mesures locales, erreurs et lecture Arena.",
    "- `10-Journal-cockpit.md`: journal complet, dont les preuves privées sans contenu brut.",
    "- `HERMES.md`: rôle Hermes Agent, limites et actions confirmées.",
    "",
    "## Prochaine action",
    "",
    ...(report.next.length ? report.next.slice(0, 4).map((item) => `- ${item}`) : ["- Lancer un benchmark local."])
  ].join("\n");
}

function memoryVaultManifest(report = readinessReport()) {
  const files = [
    ["INDEX.md", "sommaire du vault et liens vers les fiches utiles"],
    ["MANIFESTE.md", "inventaire des fichiers exportés et règles de mémoire locale"],
    ["00-Machine.md", "fiche matérielle CPU/RAM/GPU/VRAM et runtime"],
    ["01-Modeles-compatibles.md", "modèles recommandés et compatibles avec la machine"],
    ["02-Modeles-installes.md", "modèles Ollama déjà présents localement"],
    ["03-Benchmarks.md", "mesures locales, latence, tokens/s et erreurs éventuelles"],
    ["04-Achats-guides.md", "upgrades utiles seulement si un blocage est prouvé"],
    ["05-Dialogues-locaux.md", "réponses locales sauvegardées depuis le dialogue"],
    ["06-Shopping-list.md", "liste d'achat contextualisée par la machine"],
    ["07-Rapport-partageable.md", "résumé court prêt à copier ou partager"],
    ["08-Fiches-modeles.md", "forces, usages et limites des modèles"],
    ["09-Catalogues-OutilsIA.md", "versions des catalogues modèles/upgrades"],
    ["10-Journal-cockpit.md", "journal complet MemoryForge et preuves privées sans contenu brut"],
    ["MEMORY.md", "mémoire principale exploitable par Obsidian ou un agent local"],
    ["HERMES.md", "règles Hermes Agent et garde-fous d'action"]
  ];
  return [
    memoryYaml({
      type: "vault_manifest",
      source: "outilsia-local-cockpit",
      generated_at: report.generated_at,
      machine: report.machine.name
    }),
    "# Manifeste vault Obsidian",
    "",
    "Ce manifeste décrit les fichiers exportés par OutilsIA Local Cockpit. Il évite de transformer MemoryForge en simple bloc de logs.",
    "",
    "## Fichiers exportés",
    "",
    ...files.map(([name, purpose]) => `- [[${name}]] - ${purpose}`),
    "",
    "## Règle de mémoire",
    "",
    "- Garder les preuves utiles : machine, modèles, benchmarks, décisions, prompts et dialogues validés.",
    "- Ne pas envoyer de conversations personnelles au compte OutilsIA sans action explicite.",
    "- Utiliser Hermes pour résumer et relier les notes, pas pour agir sans confirmation."
  ].join("\n");
}

function hermesAgentMemory(report = readinessReport()) {
  return [
    memoryYaml({
      type: "hermes_agent",
      source: "outilsia-local-cockpit",
      model: report.recommended_model?.ref || "hermes",
      status: report.recommended_model?.installed ? "installed" : "candidate"
    }),
    "# HERMES - Agent local contrôlé",
    "",
    "Hermes doit rester le copilote local du cockpit : mémoire, décisions, notes projet et actions confirmées.",
    "",
    "## Règles",
    "",
    "- Lire le contexte machine et les benchmarks avant de recommander un modèle.",
    "- Proposer une mémoire candidate avant écriture dans Obsidian.",
    "- Demander confirmation avant installation, suppression, sync ou publication.",
    "- Ne pas générer ni backtester de stratégies financières dans OutilsIA.",
    "",
    "## Contexte actuel",
    "",
    `- Machine: ${report.machine.gpu} · ${report.machine.vram} VRAM`,
    `- Meilleur modèle mémoire: ${report.arena?.memory || report.recommended_model?.ref || "à tester"}`,
    `- PromptForge: ${report.promptForge ? `${report.promptForge.before_score}/100 -> ${report.promptForge.after_score}/100` : "non lancé"}`
  ].join("\n");
}

function localContextMemory(report = readinessReport()) {
  return [
    memoryYaml({
      type: "local_context",
      source: "outilsia-local-cockpit",
      machine: report.machine.name,
      gpu: report.machine.gpu,
      ollama: report.machine.ollama
    }),
    "# LOCAL_CONTEXT - Machine IA locale",
    "",
    `- CPU: ${report.machine.cpu}`,
    `- RAM: ${report.machine.ram}`,
    `- GPU: ${report.machine.gpu}`,
    `- VRAM: ${report.machine.vram}`,
    `- OS: ${report.machine.os}`,
    `- Ollama: ${report.machine.ollama}`,
    "",
    "## Modèles à retenir",
    "",
    ...(report.models.length
      ? report.models.map((model) => `- ${model.title}: ${model.command || "commande absente"} - ${model.reason}`)
      : ["- Aucun modèle conseillé dans ce rapport."]),
    "",
    "## Upgrades",
    "",
    ...(report.upgrades.length
      ? report.upgrades.map((upgrade) => `- ${upgrade.title}: ${upgrade.reason || "à vérifier"}`)
      : ["- Aucun upgrade prioritaire."])
  ].join("\n");
}

function cockpitMemoryMarkdown() {
  const sections = [];
  const report = readinessReport();
  sections.push(memoryVaultIndex(report));
  sections.push(memoryVaultManifest(report));
  sections.push(localContextMemory(report));
  sections.push(hermesAgentMemory(report));
  sections.push(memoryMachineCard());
  sections.push(memoryModelCards());
  sections.push(memoryBenchmarkCards());
  sections.push(memoryDecisionCard());
  sections.push(readinessMarkdown());
  sections.push(capabilityPassportMarkdown());
  sections.push(localCapabilityBridgeMarkdown());
  if (digitalTwinSummary()) sections.push(digitalTwinMarkdown());
  const arena = readLastArenaRun();
  if (arena?.results?.length) {
    sections.push(arenaRunMarkdown(arena));
  }
  const privateWorkload = privateWorkloadMarkdown();
  if (privateWorkload) {
    sections.push(privateWorkload);
  }
  const prompt = currentPromptForgeResult();
  if (prompt) {
    sections.push(promptForgeMarkdown(prompt));
  }
  if (state.chatResult?.output_preview) {
    sections.push(localChatMemoryMarkdown(state.chatResult));
  }
  const chatHistory = readChatHistory();
  if (chatHistory.length) {
    sections.push(chatHistoryMarkdown(chatHistory));
  }
  const benchmarks = readBenchmarkHistory();
  if (benchmarks.length) {
    sections.push(benchmarkHistoryMarkdown(benchmarks));
  }
  const prompts = readPromptLibrary();
  if (prompts.length) {
    sections.push(promptLibraryMarkdown(prompts));
  }
  return sections.filter(Boolean).join("\n\n---\n\n");
}

function renderReadinessPanel() {
  if (!els.readinessBox) return;
  const report = readinessReport();
  els.readinessState.textContent = report.status;
  els.readinessBox.className = report.ready ? "readiness-box" : "readiness-box empty";
  els.readinessBox.innerHTML = `
    <div class="readiness-summary">
      <strong>${escapeHtml(report.title)}</strong>
      <span>${escapeHtml(report.machine.gpu)} · ${escapeHtml(report.machine.vram)} VRAM · ${escapeHtml(report.machine.ram)} RAM</span>
      <span>Score : ${escapeHtml(report.score === null ? "non calculé" : `${report.score}/100`)} · Modèles conseillés : ${escapeHtml(report.models.length)}</span>
      <span>${report.benchmark ? `Preuve : ${escapeHtml(report.benchmark.model)} à ${escapeHtml(report.benchmark.estimated_tokens_per_second)} tok/s` : "Preuve locale non encore obtenue."}</span>
      <span>${report.promptForge ? `PromptForge : ${escapeHtml(report.promptForge.before_score)} -> ${escapeHtml(report.promptForge.after_score)}/100` : "PromptForge non encore utilisé."}</span>
      <span>${report.recommended_model ? `2e modèle : ${escapeHtml(report.recommended_model.ref)} · ${report.recommended_model.installed ? "installé" : "à installer"}` : "Deuxième modèle recommandé non déterminé."}</span>
      <span>${report.arena?.compromise ? `Arena : rapide ${escapeHtml(report.arena.fastest || "n/a")} · assistant ${escapeHtml(report.arena.assistant || "n/a")} · compromis ${escapeHtml(report.arena.compromise)} (${escapeHtml(report.arena.compromise_score)}/100)` : "Arena locale non encore lancée."}</span>
      <span>${report.recommendation_engine?.winner ? `Recommandation mesurée : ${escapeHtml(report.recommendation_engine.verdict)} · ${escapeHtml(report.recommendation_engine.winner.score)}/100 · confiance ${escapeHtml(report.recommendation_engine.confidence)}` : "Recommendation Engine v2 non encore lancé."}</span>
      ${report.private_workload_pack?.winner ? `<span>Test privé : ${escapeHtml(report.private_workload_pack.winner.model)} · ${escapeHtml(report.private_workload_pack.winner.score)}/100 · pack ${escapeHtml(report.private_workload_pack.pack)} · contenu brut non conservé.</span>` : ""}
      <span>${report.model_autopilot?.active ? `Profil Ollama : ${escapeHtml(report.model_autopilot.active.label)} · ${escapeHtml(modelAutopilotTuningLabel(report.model_autopilot.active.tuning))}` : report.model_autopilot?.recommended ? `Autopilot : ${escapeHtml(report.model_autopilot.recommended.label)} recommandé, à appliquer dans Détails.` : "Model Autopilot non encore mesuré."}</span>
      <span>${report.flight_recorder?.comparison ? `Flight Recorder : ${escapeHtml(report.flight_recorder.comparison.headline)} · confiance ${escapeHtml(report.flight_recorder.comparison.confidence)}` : "Flight Recorder : aucune référence locale."}</span>
      <span>${report.upgrade_digital_twin ? `Upgrade Digital Twin : ${escapeHtml(report.upgrade_digital_twin.decision.label)} · ${escapeHtml(report.upgrade_digital_twin.compatibility.status)} · confiance ${escapeHtml(report.upgrade_digital_twin.compatibility.confidence)}` : "Upgrade Digital Twin : aucun scénario calculé."}</span>
      <span>${report.capability_passport ? `Passport : SHA-256 ${escapeHtml(`${report.capability_passport.digest.slice(0, 16)}…`)}` : "AI Capability Passport disponible dans Détails après génération."}</span>
      <span>${report.local_capability_bridge?.running ? `Passerelle locale : active sur 127.0.0.1 · lecture seule · expiration automatique.` : "Passerelle locale : désactivée par défaut dans Détails."}</span>
      ${report.install_safety_preflight ? `<span>Préflight installation : ${escapeHtml(report.install_safety_preflight.model)} · ${escapeHtml(report.install_safety_preflight.verdict)} · ${report.install_safety_preflight.storage_free_gb == null ? "espace inconnu" : `${escapeHtml(report.install_safety_preflight.storage_free_gb)} Go libres`} · aucun chemin exporté.</span>` : ""}
      <span>${report.upgrades[0] ? `Upgrade utile : ${escapeHtml(report.upgrades[0].title)}` : "Aucun achat prioritaire pour l'instant."}</span>
      <span>${report.account_ready ? "Compte prêt : rapport partageable disponible après synchronisation." : "Connecte le compte pour sauvegarder et partager ce rapport."}</span>
    </div>
    <div class="readiness-next">
      ${report.next.slice(0, 4).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
    </div>
  `;
  els.copyReadinessSummaryBtn.disabled = !state.scan;
  els.copyReadinessBtn.disabled = !state.scan;
  els.saveReadinessMemoryBtn.disabled = !state.scan;
  els.saveReadinessAccountBtn.disabled = !state.scan;
  els.shareReadinessBtn.disabled = !lastSyncedMachineId;
  if (els.pdfReportBtn) els.pdfReportBtn.disabled = !state.scan;
  if (els.pdfReadinessBtn) els.pdfReadinessBtn.disabled = !state.scan;
  els.copyWindowsRecipeBtn.disabled = !state.scan;
  els.downloadWindowsRecipeBtn.disabled = !state.scan;
  els.topCopyWindowsRecipeBtn.disabled = !state.scan;
  els.topDownloadWindowsRecipeBtn.disabled = !state.scan;
  queueWindowsRecipeAutosave();
  renderCapabilityPassportPanel();
}

async function copyReadinessSummary() {
  if (!state.scan) {
    setStatus("Scan requis avant résumé machine prête", "warn");
    return;
  }
  await navigator.clipboard.writeText(readinessSummaryText());
  setStatus("Résumé machine prête copié", "ok");
}

async function copyReadinessReport() {
  if (!state.scan) {
    setStatus("Scan requis avant rapport machine prête", "warn");
    return;
  }
  await navigator.clipboard.writeText(readinessMarkdown());
  readinessProof.copied = true;
  setStatus("Rapport machine prête copié", "ok");
}

function saveReadinessToMemory() {
  if (!state.scan) {
    setStatus("Scan requis avant ajout MemoryForge", "warn");
    return;
  }
  const note = cockpitMemoryMarkdown();
  els.memoryText.value = note;
  state.markdown = els.memoryText.value;
  els.copyBtn.disabled = false;
  els.downloadBtn.disabled = false;
  els.vaultBtn.disabled = false;
  if (els.vaultResult) {
    els.vaultResult.innerHTML = `
      <strong>MemoryForge prêt pour Obsidian</strong>
      <span>Sections : MEMORY, manifeste vault, machine, modèles, benchmarks, Hermes, décisions et journal cockpit.</span>
    `;
  }
  setStatus("Vault MemoryForge généré : machine, modèles, benchmarks et décisions", "ok");
  renderPreparePanel();
  renderReadinessPanel();
}

async function saveReadinessToAccount() {
  if (!state.scan) {
    setStatus("Scan requis avant sauvegarde compte", "warn");
    return;
  }
  await syncDesktop();
  readinessProof.savedAccount = Boolean(lastSyncedMachineId);
  renderReadinessPanel();
}

async function shareReadinessReport() {
  if (!state.scan) {
    setStatus("Scan requis avant partage", "warn");
    return;
  }
  if (!lastSyncedMachineId) {
    setStatus("Sauve ce PC dans le compte avant de partager", "warn");
    await syncDesktop();
    renderReadinessPanel();
    if (!lastSyncedMachineId) return;
  }
  await createShareReport();
  renderReadinessPanel();
}

function benchmarkSpeedFor(model) {
  const clean = normalizeOllamaRef(model);
  if (!clean) return null;
  if (state.benchmark?.success && sameOllamaModel(state.benchmark.model, clean)) {
    return state.benchmark.estimated_tokens_per_second ?? null;
  }
  const hit = readBenchmarkHistory()
    .find((item) => item.success && sameOllamaModel(item.model, clean));
  return hit?.estimated_tokens_per_second ?? null;
}

function windowsRecipeEvidence() {
  const flow = prepareFlowState();
  const report = readinessReport();
  const release = report.release || releaseProof();
  const second = report.recommended_model || {};
  const nativeFlow = {
    scan: Boolean(flow.scanned),
    ollama_install_or_ready: Boolean(flow.ollamaReady),
    qwen_install_or_ready: Boolean(flow.modelReady),
    qwen_benchmark: Boolean(flow.benchmarkReady),
    promptforge: Boolean(flow.promptReady),
    dialogue: Boolean(flow.chatReady),
    arena: Boolean(flow.arenaReady),
    readiness_report: Boolean(flow.reportReady)
  };
  const reportProof = {
    has_score: report.score !== null,
    has_best_model: Boolean(report.arena?.compromise || report.arena?.assistant || second.ref),
    has_speed: Boolean(report.benchmark?.estimated_tokens_per_second),
    has_prompt: Boolean(report.promptForge?.optimized),
    has_upgrade: Boolean(report.upgrades.length),
    has_next_actions: Boolean(report.next.length),
    copied: Boolean(readinessProof.copied),
    saved_account: Boolean(readinessProof.savedAccount && lastSyncedMachineId),
    shared: Boolean(readinessProof.shared && lastShareReportUrl),
    share_url: lastShareReportUrl
  };
  const secondModel = {
    ref: second.ref || "",
    installed: Boolean(second.installed),
    benchmarked: Boolean(second.benchmarked),
    tokens_per_second: second.ref ? benchmarkSpeedFor(second.ref) : null
  };
  const requiredNative = Object.values(nativeFlow).every(Boolean);
  const requiredReport = Object.entries(reportProof)
    .filter(([key]) => key !== "share_url")
    .every(([, value]) => value === true);
  const secondReady = Boolean(secondModel.ref && (secondModel.installed || secondModel.benchmarked));
  const ok = Boolean(requiredNative && requiredReport && secondReady && release.freshness_ok);
  const recipe = {
    ok,
    tested_at: new Date().toISOString(),
    tester: "",
    machine: report.machine.name || report.machine.gpu || "",
    app_version: release.app_version || "0.1.1",
    platform: "windows-x64",
    build_id: release.build_id || "",
    release_freshness_ok: Boolean(release.freshness_ok),
    native_flow: nativeFlow,
    second_model: secondModel,
    report: reportProof,
    public_release: {
      name: release.file_name || "",
      sha256: release.sha256 || "",
      url: release.url ? absoluteOutisiaUrl(release.url) : "https://outilsia.fr/static/downloads/local-cockpit/release.json"
    }
  };
  recipe.notes = ok
    ? "Recette générée depuis OutilsIA Local Cockpit."
    : `Recette incomplète : ${windowsRecipeMissingSteps(recipe).join(" ; ")}`;
  return recipe;
}

function windowsRecipeMissingSteps(recipe) {
  const missing = [];
  const flow = recipe.native_flow || {};
  const report = recipe.report || {};
  if (!flow.scan) missing.push("scanner le PC");
  if (!flow.ollama_install_or_ready) missing.push("installer ou détecter Ollama");
  if (!flow.qwen_install_or_ready) missing.push("installer qwen3:0.6b");
  if (!flow.qwen_benchmark) missing.push("tester qwen3:0.6b");
  if (!flow.promptforge) missing.push("optimiser le prompt avec PromptForge");
  if (!flow.dialogue) missing.push("envoyer une question dans Dialogue local");
  if (!flow.arena) missing.push("lancer Arena locale");
  if (!flow.readiness_report) missing.push("afficher le rapport machine prête");
  if (!recipe.second_model?.ref) missing.push("obtenir un deuxième modèle recommandé");
  if (recipe.second_model?.ref && !recipe.second_model.installed && !recipe.second_model.benchmarked) {
    missing.push(`installer ou benchmarker ${recipe.second_model.ref}`);
  }
  if (!report.has_score) missing.push("avoir un score");
  if (!report.has_best_model) missing.push("avoir un meilleur modèle ou un deuxième modèle");
  if (!report.has_speed) missing.push("avoir une vitesse benchmark");
  if (!report.has_prompt) missing.push("avoir un prompt optimisé");
  if (!report.has_upgrade) missing.push("avoir un upgrade utile");
  if (!report.has_next_actions) missing.push("avoir des prochaines actions");
  if (!report.copied) missing.push("cliquer Copier rapport");
  if (!report.saved_account) missing.push("cliquer Sauver compte");
  if (!report.shared) missing.push("cliquer Partager");
  if (!recipe.release_freshness_ok) missing.push("utiliser la dernière release publique");
  return missing;
}

function windowsRecipeStatus(recipe, action) {
  if (recipe.ok) return `Recette bêta complète ${action}`;
  const missing = windowsRecipeMissingSteps(recipe).slice(0, 4).join(" ; ");
  return `Recette ${action}, encore à faire : ${missing}`;
}

function windowsRecipeStatusKind(recipe) {
  return recipe.ok ? "ok" : "warn";
}

function queueWindowsRecipeAutosave() {
  if (!invoke || !state.scan) return;
  window.clearTimeout(recipeAutoSaveTimer);
  recipeAutoSaveTimer = window.setTimeout(async () => {
    try {
      const recipe = windowsRecipeEvidence();
      const content = `${JSON.stringify(recipe, null, 2)}\n`;
      await invoke("write_windows_recipe_file", { content });
    } catch (error) {
      console.warn("Recipe autosave failed", error);
    }
  }, 700);
}

async function copyWindowsRecipeEvidence() {
  if (!state.scan) {
    setStatus("Scan requis avant recette bêta", "warn");
    return;
  }
  const recipe = windowsRecipeEvidence();
  await navigator.clipboard.writeText(JSON.stringify(recipe, null, 2));
  setStatus(windowsRecipeStatus(recipe, "copiée"), windowsRecipeStatusKind(recipe));
}

async function downloadWindowsRecipeEvidence() {
  if (!state.scan) {
    setStatus("Scan requis avant téléchargement recette bêta", "warn");
    return;
  }
  const recipe = windowsRecipeEvidence();
  const content = `${JSON.stringify(recipe, null, 2)}\n`;
  if (invoke) {
    try {
      const path = await invoke("write_windows_recipe_file", { content });
      setStatus(
        recipe.ok
          ? `RECETTE-RESULTAT.json écrit : ${path}`
          : `${windowsRecipeStatus(recipe, "écrite")} (${path})`,
        windowsRecipeStatusKind(recipe)
      );
      return;
    } catch (error) {
      setStatus(`Écriture native impossible, téléchargement navigateur: ${error}`, "warn");
    }
  }
  downloadTextFile("RECETTE-RESULTAT.json", content, "application/json;charset=utf-8");
  setStatus(windowsRecipeStatus(recipe, "téléchargée"), windowsRecipeStatusKind(recipe));
}

function generateFinalCockpitReport() {
  if (!state.scan) {
    setStatus("Scan requis avant rapport final", "warn");
    return;
  }
  els.memoryText.value = cockpitMemoryMarkdown();
  state.markdown = els.memoryText.value;
  els.copyBtn.disabled = false;
  els.downloadBtn.disabled = false;
  els.vaultBtn.disabled = false;
  setStatus("Journal MemoryForge cockpit généré", "ok");
  renderPreparePanel();
  renderReadinessPanel();
  renderPrimaryAction();
}

function renderFirstTestPanel() {
  if (!els.firstTestBox) return;
  const model = "qwen3:0.6b";
  const scanned = Boolean(state.scan);
  const ollamaReady = hasUsableOllamaRuntime(state.scan);
  const benchmark = successfulBenchmarkFor(model);
  const benchmarkReady = Boolean(benchmark);
  const benchmarkMatches = Boolean(state.benchmark?.success && normalizeOllamaRef(state.benchmark?.model || "") === normalizeOllamaRef(model));
  const modelReady = isOllamaModelInstalled(model) || (benchmarkReady && benchmarkMatches);

  const steps = [
    { label: "Runtime IA", ok: ollamaReady, text: ollamaReady ? ollamaRuntimeLabel(state.scan) : scanned ? "À installer" : "Scan requis" },
    { label: "Modèle test", ok: modelReady, text: modelReady ? `${model} installé` : ollamaReady ? "À télécharger" : "En attente d'Ollama" },
    { label: "Benchmark", ok: benchmarkReady, text: benchmarkReady ? `${benchmark.estimated_tokens_per_second ?? "--"} tok/s` : modelReady ? "Prêt à lancer" : "En attente du modèle" }
  ];
  const stepHtml = steps.map((step) => `
    <div class="first-test-step ${step.ok ? "ok-step" : ""}">
      <strong>${escapeHtml(step.label)}</strong>
      <span>${escapeHtml(step.text)}</span>
    </div>
  `).join("");

  const recommended = topRecommendedModel();
  const recommendedRef = actionableOllamaRef(recommended);
  const recommendedInstalled = recommendedRef ? isOllamaModelInstalled(recommendedRef) : false;
  const recommendedInfo = recommendedRef ? modelInfo(recommendedRef) : null;
  const recommendedHtml = recommendedRef ? `
    <div class="first-test-recommended">
      <strong>Prochain modèle utile</strong>
      <span>${escapeHtml(modelTitle(recommended))} · ${escapeHtml(recommendedRef)}</span>
      <span>Force : ${escapeHtml(recommendedInfo.strength)}</span>
      <span>Usage : ${escapeHtml(recommendedInfo.fit)}</span>
      <span>Limite : ${escapeHtml(recommendedInfo.limit)}</span>
      <span>${recommendedInstalled ? "Déjà installé : prêt à comparer." : "À installer après le modèle de test léger."}</span>
    </div>
  ` : "";

  let stateLabel = "à lancer";
  let cta = `<button class="first-test-primary" type="button" data-run-scan="true">Scanner ce PC</button>`;
  if (scanned && !ollamaReady) {
    stateLabel = "Ollama requis";
    cta = `<button class="first-test-primary" type="button" data-install-ollama="true">Installer Ollama puis tester</button>`;
  } else if (ollamaReady && !modelReady) {
    stateLabel = "modèle à installer";
    cta = `<button class="first-test-primary" type="button" data-install-model="${model}">Installer le modèle de test</button>`;
  } else if (modelReady && !benchmarkReady) {
    stateLabel = "test prêt";
    cta = `<button class="first-test-primary" type="button" data-benchmark-model="${model}">${escapeHtml(benchmarkButtonLabel(model, "Lancer le benchmark recommandé", "Installer + benchmarker"))}</button>`;
  } else if (benchmarkReady) {
    stateLabel = "test réussi";
    cta = `
      ${recommendedRef && !recommendedInstalled ? `<button class="first-test-primary" type="button" data-install-model="${escapeHtml(recommendedRef)}">Installer le modèle recommandé</button>` : ""}
      ${recommendedRef && recommendedInstalled ? `<button class="first-test-primary" type="button" data-benchmark-model="${escapeHtml(recommendedRef)}">Comparer le modèle recommandé</button>` : ""}
      <button type="button" data-copy-test-report="true">Copier le rapport</button>
      <button type="button" data-focus-feedback="true">Signaler un résultat</button>
    `;
  }

  els.firstTestState.textContent = stateLabel;
  els.firstTestBox.innerHTML = `
    <div class="first-test-steps">${stepHtml}</div>
    ${benchmarkReady ? `
      <div class="benchmark-card">
        <strong>Test réussi - ${escapeHtml(benchmark.model)}</strong>
        <span>Temps de réponse : ${escapeHtml(benchmark.elapsed_ms ?? "--")} ms</span>
        <span>${escapeHtml(benchmarkSpeedLabel(benchmark))} : ${escapeHtml(benchmark.estimated_tokens_per_second ?? "--")} tok/s · ${escapeHtml(benchmarkMeasurementLabel(benchmark))}</span>
        <span>${escapeHtml(benchmark.output_preview || "Réponse vide")}</span>
      </div>
    ` : `
      <p>Objectif : obtenir une première preuve locale en lançant ${model}, puis mesurer une réponse courte.</p>
    `}
    ${recommendedHtml}
    <div class="row-actions">${cta}</div>
    ${benchmarkReady && !benchmarkMatches ? `<p class="fine-note">Dernier benchmark affiché depuis l'historique : ${escapeHtml(benchmark.model)}.</p>` : ""}
  `;
  renderPrimaryAction();
}

function arenaCandidates() {
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  const recommended = sortRecommendedModels(extractModels(compatibility).filter((model) => actionableOllamaRef(model))).slice(0, 4);
  const installed = (state.scan?.installed_models || []).map((model) => {
    const ref = modelLabel(model);
    return {
      name: ref,
      params: model.size_gb ? `${Number(model.size_gb).toFixed(1)} Go` : "",
      ollama: ref,
      reason: "Déjà installé sur cette machine."
    };
  });
  const starter = {
    name: "Qwen3 test léger",
    params: "0.6B",
    ollama: "qwen3:0.6b",
    reason: "Premier modèle conseillé pour vérifier qu'Ollama, le téléchargement et le benchmark fonctionnent."
  };
  const byRef = new Map();
  for (const model of [starter, ...recommended, ...installed]) {
    const ref = normalizeOllamaRef(actionableOllamaRef(model));
    if (ref && !byRef.has(ref)) byRef.set(ref, model);
  }
  return [...byRef.values()].slice(0, 6);
}

function promptForgeModelContext() {
  const model = els.chatModelInput?.value?.trim() || els.benchmarkModelInput?.value?.trim() || "modèle local";
  const info = modelInfo(model);
  return { model, info };
}

function scorePromptText(prompt) {
  const text = String(prompt || "").trim();
  let score = 20;
  if (text.length >= 40) score += 12;
  if (text.length >= 120) score += 10;
  if (/[?]/.test(text)) score += 6;
  if (/\b(réponds|explique|résume|compare|écris|transforme|analyse)\b/i.test(text)) score += 10;
  if (/\b(en|avec|sans|sous|format|liste|tableau|points|phrases?)\b/i.test(text)) score += 10;
  if (/\b(contexte|objectif|contraintes?|critères?|exemple|sortie)\b/i.test(text)) score += 14;
  if (text.split(/\s+/).length > 90) score -= 8;
  if (/\btruc|ça|fais mieux|améliore|aide moi\b/i.test(text)) score -= 8;
  return Math.max(0, Math.min(100, score));
}

function promptForgeAnalyze(prompt) {
  const text = String(prompt || "").trim();
  const issues = [];
  const strengths = [];
  if (text.length < 40) issues.push("Prompt trop court : le modèle doit deviner le contexte.");
  else strengths.push("Longueur suffisante pour donner une intention.");
  if (!/\b(contexte|objectif|but|situation)\b/i.test(text)) issues.push("Contexte peu explicite.");
  else strengths.push("Contexte détecté.");
  if (!/\b(format|liste|tableau|json|markdown|points|phrases?)\b/i.test(text)) issues.push("Format de sortie non précisé.");
  else strengths.push("Format de sortie demandé.");
  if (!/\b(contraintes?|évite|sans|maximum|minimum|court|détaillé)\b/i.test(text)) issues.push("Contraintes faibles ou absentes.");
  else strengths.push("Contraintes présentes.");
  if (!/[?]/.test(text) && !/\b(réponds|explique|résume|compare|écris|transforme|analyse)\b/i.test(text)) issues.push("Action demandée peu claire.");
  return { score: scorePromptText(text), issues, strengths };
}

function promptForgeOptimize(prompt) {
  const raw = String(prompt || "").trim();
  const { model, info } = promptForgeModelContext();
  const task = raw || "Explique ce que cette machine peut faire tourner en IA locale.";
  const optimized = [
    "Contexte : tu réponds dans OutilsIA Local Cockpit, une app qui teste des modèles IA locaux avec Ollama.",
    `Modèle ciblé : ${model}.`,
    `Profil du modèle : ${info.fit}`,
    "",
    "Objectif : répondre clairement à la demande utilisateur ci-dessous, sans inventer de données non fournies.",
    "",
    "Demande utilisateur :",
    task,
    "",
    "Contraintes de réponse :",
    "- réponds en français naturel ;",
    "- commence par la conclusion utile ;",
    "- donne des étapes concrètes si une action est nécessaire ;",
    "- signale les limites ou incertitudes ;",
    "- reste concis : 5 à 8 lignes maximum.",
    "",
    "Format attendu :",
    "1. Verdict court",
    "2. Pourquoi",
    "3. Prochaine action"
  ].join("\n");
  const before = promptForgeAnalyze(raw);
  const after = promptForgeAnalyze(optimized);
  return {
    raw,
    optimized,
    before,
    after,
    model,
    created_at_ms: Date.now()
  };
}

function renderPromptForge(result) {
  if (!els.promptForgeResult) return;
  if (!result) {
    els.promptForgeState.textContent = "prêt";
    els.promptForgeResult.className = "promptforge-result empty";
    els.promptForgeResult.textContent = "PromptForge transforme un prompt flou en instruction claire pour Qwen, Hermes, Llama ou Mistral.";
    els.promptForgeUseBenchmarkBtn.disabled = true;
    els.promptForgeUseChatBtn.disabled = true;
    els.promptForgeSaveMemoryBtn.disabled = true;
    return;
  }
  els.promptForgeState.textContent = `${result.after.score}/100`;
  els.promptForgeResult.className = "promptforge-result";
  els.promptForgeResult.innerHTML = `
    <div class="promptforge-score">
      <div><strong>Avant</strong><span>${escapeHtml(result.before.score)}/100</span></div>
      <div><strong>Après</strong><span>${escapeHtml(result.after.score)}/100</span></div>
      <div><strong>Modèle</strong><span>${escapeHtml(result.model)}</span></div>
    </div>
    <div class="promptforge-analysis">
      <strong>Corrections</strong>
      ${(result.before.issues.length ? result.before.issues : ["Prompt déjà exploitable."]).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
    </div>
    <label class="field-label" for="promptForgeOptimizedOutput">Prompt optimisé</label>
    <textarea id="promptForgeOptimizedOutput" readonly spellcheck="false">${escapeHtml(result.optimized)}</textarea>
  `;
  els.promptForgeUseBenchmarkBtn.disabled = false;
  els.promptForgeUseChatBtn.disabled = false;
  els.promptForgeSaveMemoryBtn.disabled = false;
}

function currentPromptForgeResult() {
  const output = document.getElementById("promptForgeOptimizedOutput");
  if (!output?.value?.trim()) return null;
  return {
    optimized: output.value.trim(),
    raw: els.promptForgeInput.value.trim(),
    model: promptForgeModelContext().model,
    before: promptForgeAnalyze(els.promptForgeInput.value.trim()),
    after: promptForgeAnalyze(output.value.trim()),
    created_at_ms: Date.now()
  };
}

function promptForgeMarkdown(result = currentPromptForgeResult()) {
  if (!result) return "";
  return [
    "# PromptForge Local",
    "",
    `- Date: ${new Date(Number(result.created_at_ms || Date.now())).toISOString()}`,
    `- Modèle cible: ${result.model}`,
    `- Score avant: ${result.before.score}/100`,
    `- Score après: ${result.after.score}/100`,
    "",
    "## Prompt original",
    "",
    "```text",
    result.raw || "",
    "```",
    "",
    "## Prompt optimisé",
    "",
    "```text",
    result.optimized,
    "```",
    "",
    "## Usage conseillé",
    "",
    "- Tester ce prompt dans Benchmark Ollama.",
    "- Comparer ensuite le même prompt sur 2 ou 3 modèles dans Arena locale.",
    "- Sauvegarder le prompt dans Obsidian si le résultat est meilleur."
  ].join("\n");
}

function readPromptLibrary() {
  try {
    const raw = window.localStorage?.getItem(PROMPT_LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePromptLibrary(items) {
  const normalized = Array.isArray(items) ? items.slice(0, MAX_PROMPT_LIBRARY) : [];
  window.localStorage?.setItem(PROMPT_LIBRARY_KEY, JSON.stringify(normalized));
  renderPromptLibrary(normalized);
}

function promptLibraryEntry(result = currentPromptForgeResult()) {
  if (!result) return null;
  const titleSource = result.raw || result.optimized || "Prompt optimisé";
  const title = titleSource.split(/\n+/)[0].replace(/^Demande utilisateur\s*:\s*/i, "").slice(0, 90) || "Prompt optimisé";
  return {
    id: `prompt-${Date.now()}`,
    title,
    model: result.model || promptForgeModelContext().model,
    raw: result.raw || "",
    optimized: result.optimized || "",
    before_score: result.before?.score ?? 0,
    after_score: result.after?.score ?? 0,
    created_at_ms: Number(result.created_at_ms || Date.now())
  };
}

function renderPromptLibrary(items = readPromptLibrary()) {
  if (!els.promptLibraryList) return;
  const count = items.length;
  els.promptLibraryState.textContent = `${count} prompt${count > 1 ? "s" : ""}`;
  els.promptLibraryList.className = count ? "prompt-library-list" : "prompt-library-list empty";
  els.copyPromptLibraryBtn.disabled = !count;
  els.clearPromptLibraryBtn.disabled = !count;
  if (!count) {
    els.promptLibraryList.textContent = "Sauvegarde un prompt optimisé depuis PromptForge pour le réutiliser dans Benchmark, Dialogue ou Arena.";
    return;
  }
  els.promptLibraryList.innerHTML = items.map((item) => `
    <div class="prompt-library-item">
      <div class="model-card-head">
        <strong>${escapeHtml(item.title)}</strong>
        <em>${escapeHtml(item.after_score || 0)}/100</em>
      </div>
      <span>${escapeHtml(item.model || "modèle local")} · ${new Date(Number(item.created_at_ms || Date.now())).toLocaleDateString("fr-FR")}</span>
      <div class="model-actions">
        <button type="button" data-use-prompt-benchmark="${escapeHtml(item.id)}">Benchmark</button>
        <button type="button" data-use-prompt-chat="${escapeHtml(item.id)}">Dialogue</button>
        <button type="button" data-copy-prompt="${escapeHtml(item.id)}">Copier</button>
        <button type="button" data-delete-prompt="${escapeHtml(item.id)}">Supprimer</button>
      </div>
    </div>
  `).join("");
}

function savePromptToLibrary(result = currentPromptForgeResult()) {
  const entry = promptLibraryEntry(result);
  if (!entry) {
    setStatus("Aucun prompt optimisé à sauvegarder", "warn");
    return null;
  }
  const items = readPromptLibrary();
  const deduped = items.filter((item) => item.optimized !== entry.optimized);
  writePromptLibrary([entry, ...deduped]);
  return entry;
}

function promptLibraryMarkdown(items = readPromptLibrary()) {
  return [
    "# Bibliothèque PromptForge OutilsIA",
    "",
    `- Date: ${new Date().toISOString()}`,
    `- Prompts: ${items.length}`,
    "",
    ...items.map((item, index) => [
      `## ${index + 1}. ${item.title}`,
      "",
      `- Modèle cible: ${item.model}`,
      `- Score: ${item.before_score}/100 -> ${item.after_score}/100`,
      "",
      "```text",
      item.optimized,
      "```"
    ].join("\n"))
  ].join("\n");
}

async function copyPromptLibrary() {
  const items = readPromptLibrary();
  if (!items.length) {
    setStatus("Bibliothèque prompts vide", "warn");
    return;
  }
  await navigator.clipboard.writeText(promptLibraryMarkdown(items));
  setStatus("Bibliothèque prompts copiée", "ok");
}

function clearPromptLibrary() {
  const ok = window.confirm("Vider la bibliothèque locale de prompts optimisés ?");
  if (!ok) return;
  writePromptLibrary([]);
  setStatus("Bibliothèque prompts vidée", "ok");
}

function usePromptLibraryItem(id, target) {
  const item = readPromptLibrary().find((entry) => entry.id === id);
  if (!item) {
    setStatus("Prompt introuvable", "warn");
    return;
  }
  if (target === "chat") {
    els.chatPromptInput.value = item.optimized;
    els.chatModelInput.value = item.model || els.chatModelInput.value;
    setStatus("Prompt envoyé vers Dialogue", "ok");
    return;
  }
  els.benchmarkPromptInput.value = item.optimized;
  els.benchmarkModelInput.value = item.model || els.benchmarkModelInput.value;
  setStatus("Prompt envoyé vers Benchmark", "ok");
}

async function copyPromptLibraryItem(id) {
  const item = readPromptLibrary().find((entry) => entry.id === id);
  if (!item) {
    setStatus("Prompt introuvable", "warn");
    return;
  }
  await navigator.clipboard.writeText(item.optimized);
  setStatus("Prompt optimisé copié", "ok");
}

function deletePromptLibraryItem(id) {
  writePromptLibrary(readPromptLibrary().filter((entry) => entry.id !== id));
  setStatus("Prompt supprimé", "ok");
}

function fillPromptForgeFrom(source) {
  const value = source === "chat" ? els.chatPromptInput.value : els.benchmarkPromptInput.value;
  els.promptForgeInput.value = value.trim();
  setStatus(`PromptForge rempli depuis ${source === "chat" ? "Dialogue" : "Benchmark"}`, "ok");
}

function optimizePromptForge() {
  const input = els.promptForgeInput.value.trim();
  if (!input) {
    setStatus("Prompt requis pour PromptForge", "warn");
    return;
  }
  const result = promptForgeOptimize(input);
  renderPromptForge(result);
  setStatus(`Prompt optimisé ${result.before.score}/100 -> ${result.after.score}/100`, "ok");
}

function usePromptForge(target) {
  const result = currentPromptForgeResult();
  if (!result) {
    setStatus("Optimise un prompt avant de l'utiliser", "warn");
    return;
  }
  if (target === "chat") {
    els.chatPromptInput.value = result.optimized;
    els.chatPromptInput.focus();
    setStatus("Prompt optimisé envoyé vers Dialogue local", "ok");
    return;
  }
  els.benchmarkPromptInput.value = result.optimized;
  els.benchmarkPromptInput.focus();
  setStatus("Prompt optimisé envoyé vers Benchmark", "ok");
}

function savePromptForgeToMemory() {
  const note = promptForgeMarkdown();
  if (!note) {
    setStatus("Aucun prompt optimisé à sauvegarder", "warn");
    return;
  }
  const saved = savePromptToLibrary();
  const current = els.memoryText.value.trim();
  els.memoryText.value = current ? `${current}\n\n---\n\n${note}` : note;
  state.markdown = els.memoryText.value;
  els.copyBtn.disabled = false;
  els.downloadBtn.disabled = false;
  els.vaultBtn.disabled = !state.scan;
  setStatus(saved ? "Prompt sauvegardé dans MemoryForge et Mes prompts" : "Prompt sauvegardé dans MemoryForge", "ok");
}

function arenaInstalledCandidates(limit = 3) {
  const candidates = arenaCandidates().filter((model) => isOllamaModelInstalled(actionableOllamaRef(model)));
  const preferred = [];
  const seen = new Set();
  const add = (model) => {
    const ref = normalizeOllamaRef(actionableOllamaRef(model));
    if (!ref || seen.has(ref)) return;
    seen.add(ref);
    preferred.push(model);
  };
  candidates.find((model) => normalizeOllamaRef(actionableOllamaRef(model)) === "qwen3:0.6b") && add(candidates.find((model) => normalizeOllamaRef(actionableOllamaRef(model)) === "qwen3:0.6b"));
  candidates.filter((model) => normalizeOllamaRef(actionableOllamaRef(model)).includes("hermes")).forEach(add);
  candidates.filter((model) => !normalizeOllamaRef(actionableOllamaRef(model)).includes("hermes")).forEach(add);
  return preferred.slice(0, limit);
}

function arenaRole(model, index) {
  const ref = normalizeOllamaRef(actionableOllamaRef(model));
  if (ref === "qwen3:0.6b") return "test léger";
  if (benchmarkMatchesModel(model)) return "dernier gagnant";
  if (isOllamaModelInstalled(ref)) return "installé";
  if (index === 0 || index === 1) return "à comparer";
  return "option";
}

function readLastArenaRun() {
  try {
    const raw = window.localStorage?.getItem(ARENA_RUN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLastArenaRun(run) {
  if (run) window.localStorage?.setItem(ARENA_RUN_KEY, JSON.stringify(run));
  else window.localStorage?.removeItem(ARENA_RUN_KEY);
}

function arenaWinner(results = []) {
  const successful = results.filter((item) => item.success);
  if (!successful.length) return null;
  return arenaRankedResults(successful)[0] || null;
}

function normalizeArenaAnswer(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseArenaObjectiveJson(output) {
  const raw = String(output || "").trim();
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(unfenced.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function evaluateArenaObjective(output) {
  const parsed = parseArenaObjectiveJson(output);
  const required = ["instruction", "memory", "calculation", "correction", "action"];
  const formatPassed = Boolean(parsed)
    && Object.keys(parsed).length === required.length
    && required.every((key) => Object.prototype.hasOwnProperty.call(parsed, key))
    && required.filter((key) => key !== "calculation").every((key) => typeof parsed[key] === "string")
    && ["number", "string"].includes(typeof parsed.calculation);
  const correction = normalizeArenaAnswer(parsed?.correction);
  const action = normalizeArenaAnswer(parsed?.action);
  const checks = [
    { key: "format", label: "JSON conforme", passed: formatPassed, weight: 20 },
    { key: "instruction", label: "Instruction exacte", passed: normalizeArenaAnswer(parsed?.instruction).includes("bleu-47"), weight: 16 },
    { key: "memory", label: "Rappel mémoire", passed: String(parsed?.memory || "").trim() === "RIVIERE-29", weight: 18 },
    { key: "calculation", label: "Calcul court", passed: Number(parsed?.calculation) === 42 || /(^|[^0-9])42([^0-9]|$)/.test(String(parsed?.calculation || "")), weight: 16 },
    {
      key: "french",
      label: "Correction française",
      passed: ["vram", "accelere", "inference", "locale"].every((word) => correction.includes(word)),
      weight: 15
    },
    {
      key: "action",
      label: "Action concrète",
      passed: action.includes("tester") && action.includes("comparer"),
      weight: 15
    }
  ];
  const score = checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0);
  const passedCount = checks.filter((check) => check.passed).length;
  return {
    protocol: ARENA_OBJECTIVE_PROTOCOL,
    score,
    passed_count: passedCount,
    total_count: checks.length,
    valid_json: formatPassed,
    checks,
    summary: `${passedCount}/${checks.length} preuves objectives validées`
  };
}

function recommendationUsageTask(profileKey = readUsageProfileKey()) {
  return RECOMMENDATION_USAGE_TASKS[profileKey] || RECOMMENDATION_USAGE_TASKS.polyvalent;
}

function recommendationEnginePrompt(profileKey = readUsageProfileKey()) {
  const task = recommendationUsageTask(profileKey);
  return `Micro-test Recommendation Engine v2 OutilsIA. Lis toutes les consignes avant de répondre.
1. Mémorise le code RIVIERE-29.
2. Calcule (17 * 3) - 9.
3. Corrige en français naturel : "la vram accelere inference local".
4. L'instruction à restituer contient BLEU-47.
5. Donne comme action concrète : "Tester le modèle puis comparer les résultats."
6. Pour le champ usage (${task.label}) : ${task.prompt}.
Réponds uniquement avec un objet JSON sur une ligne, sans Markdown, avec exactement ces clés : instruction, memory, calculation, correction, action, usage.`;
}

function recommendationUsagePassed(value, profileKey) {
  const raw = String(value || "");
  const text = normalizeArenaAnswer(raw);
  if (profileKey === "chat") {
    return ["assistant quotidien", "modele leger", "benchmark"].every((needle) => text.includes(needle));
  }
  if (profileKey === "code") {
    return /return\s+a\s*\+\s*b/i.test(raw) && /(^|[^0-9])9([^0-9]|$)/.test(raw);
  }
  if (profileKey === "memory") {
    return text.includes("obsidien-84") && text.includes("prochaine action");
  }
  if (profileKey === "french") {
    return ["ia locale", "repond", "francais"].every((needle) => text.includes(needle));
  }
  if (profileKey === "portable") {
    const words = text.split(/\s+/).filter(Boolean);
    return words.length <= 14 && text.includes("modele leger") && text.includes("benchmark");
  }
  return ["tester", "comparer", "garder"].every((needle) => text.includes(needle));
}

function evaluateRecommendationProof(output, profileKey = readUsageProfileKey()) {
  const parsed = parseArenaObjectiveJson(output);
  const required = ["instruction", "memory", "calculation", "correction", "action", "usage"];
  const formatPassed = Boolean(parsed)
    && Object.keys(parsed).length === required.length
    && required.every((key) => Object.prototype.hasOwnProperty.call(parsed, key))
    && required.filter((key) => key !== "calculation").every((key) => typeof parsed[key] === "string")
    && ["number", "string"].includes(typeof parsed.calculation);
  const basePayload = parsed ? {
    instruction: parsed.instruction,
    memory: parsed.memory,
    calculation: parsed.calculation,
    correction: parsed.correction,
    action: parsed.action
  } : {};
  const base = evaluateArenaObjective(JSON.stringify(basePayload));
  const weights = { format: 16, instruction: 13, memory: 14, calculation: 13, french: 12, action: 12 };
  const checks = base.checks.map((check) => ({
    ...check,
    passed: check.key === "format" ? formatPassed : check.passed,
    weight: weights[check.key]
  }));
  checks.push({
    key: "usage",
    label: recommendationUsageTask(profileKey).label,
    passed: Boolean(parsed) && recommendationUsagePassed(parsed.usage, profileKey),
    weight: 20
  });
  const score = checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0);
  const passedCount = checks.filter((check) => check.passed).length;
  return {
    protocol: RECOMMENDATION_ENGINE_PROTOCOL,
    profile: profileKey,
    profile_label: USAGE_PROFILES[profileKey]?.label || USAGE_PROFILES.polyvalent.label,
    score,
    passed_count: passedCount,
    total_count: checks.length,
    valid_json: formatPassed,
    checks,
    summary: `${passedCount}/${checks.length} preuves validées pour ${USAGE_PROFILES[profileKey]?.label || "Polyvalent"}`
  };
}

function demoRecommendationOutput(profileKey = "polyvalent") {
  const usage = {
    polyvalent: "Tester, comparer et garder le modèle le plus adapté.",
    chat: "Un assistant quotidien commence par un modèle léger puis un benchmark.",
    code: "function add(a,b){return a + b;} puis add(4,5) vaut 9",
    memory: "OBSIDIEN-84 · prochaine action",
    french: "Mon IA locale répond bien en français.",
    portable: "Choisir un modèle léger puis lancer un benchmark."
  }[profileKey] || "Tester, comparer et garder le modèle le plus adapté.";
  return JSON.stringify({
    instruction: "BLEU-47",
    memory: "RIVIERE-29",
    calculation: 42,
    correction: "La VRAM accélère l'inférence locale.",
    action: "Tester le modèle puis comparer les résultats.",
    usage
  });
}

function arenaObjectiveCheckScore(objective, key) {
  return objective?.checks?.find((check) => check.key === key)?.passed ? 100 : 0;
}

function arenaObjectiveFailureLabel(objective) {
  if (!objective) return "Ancien protocole estimatif";
  const failed = objective.checks.filter((check) => !check.passed).map((check) => check.label);
  return failed.length ? `À revoir : ${failed.join(", ")}` : "Les 6 vérifications sont validées";
}

function arenaObjectiveProfileScore(item, profileKey) {
  const objective = item?.arena_objective;
  if (!objective) return null;
  const check = (key) => arenaObjectiveCheckScore(objective, key);
  const tps = Number(item.estimated_tokens_per_second || 0);
  const elapsed = Number(item.elapsed_ms || 0);
  const speed = clampScore((tps / 80) * 100);
  const latency = elapsed <= 1200 ? 100 : elapsed <= 2500 ? 80 : elapsed <= 5000 ? 60 : elapsed <= 12000 ? 35 : 15;
  const objectiveScore = clampScore(objective.score);
  let score;
  if (profileKey === "speed") score = (speed * 0.75) + (latency * 0.25);
  else if (profileKey === "assistant") score = (check("format") * 0.20) + (check("instruction") * 0.15) + (check("memory") * 0.10) + (check("calculation") * 0.10) + (check("french") * 0.20) + (check("action") * 0.15) + (speed * 0.05) + (latency * 0.05);
  else if (profileKey === "code") score = (check("format") * 0.25) + (check("instruction") * 0.20) + (check("calculation") * 0.20) + (check("memory") * 0.10) + (check("french") * 0.10) + (check("action") * 0.10) + (speed * 0.05);
  else if (profileKey === "memory") score = (check("format") * 0.20) + (check("instruction") * 0.20) + (check("memory") * 0.40) + (check("action") * 0.10) + (check("french") * 0.05) + (speed * 0.05);
  else if (profileKey === "reasoning") score = (check("format") * 0.20) + (check("instruction") * 0.20) + (check("calculation") * 0.35) + (check("memory") * 0.10) + (check("action") * 0.10) + (speed * 0.05);
  else if (profileKey === "french") score = (check("format") * 0.20) + (check("instruction") * 0.15) + (check("memory") * 0.10) + (check("calculation") * 0.05) + (check("french") * 0.35) + (check("action") * 0.10) + (speed * 0.05);
  else if (profileKey === "long_context") score = (check("format") * 0.20) + (check("instruction") * 0.15) + (check("memory") * 0.50) + (check("action") * 0.10) + (speed * 0.05);
  else if (profileKey === "light_laptop") score = (objectiveScore * 0.30) + (speed * 0.50) + (latency * 0.20);
  else if (profileKey === "quality") score = (objectiveScore * 0.75) + (speed * 0.10) + (latency * 0.15);
  else score = (objectiveScore * 0.60) + (speed * 0.25) + (latency * 0.15);
  score = clampScore(score - (item.timed_out ? 10 : 0));
  const label = score >= 78 ? "excellent" : score >= 62 ? "bon" : score >= 45 ? "correct" : "limite";
  return {
    score,
    label,
    reason: `${ARENA_USAGE_PROFILES[profileKey]?.label || "Profil"} : ${score}/100, preuve objective ${objective.passed_count}/${objective.total_count}.`,
    speed,
    latency,
    objective: objectiveScore
  };
}

function arenaScoreResult(item) {
  if (!item?.success) {
    return {
      score: 0,
      speedScore: 0,
      latencyScore: 0,
      answerScore: 0,
      label: "échec",
      reason: item?.error || "Le modèle n'a pas répondu correctement."
    };
  }
  if (item.arena_objective) {
    const objective = item.arena_objective;
    const tps = Number(item.estimated_tokens_per_second || 0);
    const elapsed = Number(item.elapsed_ms || 0);
    const speedScore = Math.min(20, Math.round((tps / 80) * 20));
    const latencyScore = elapsed <= 1500 ? 10 : elapsed <= 3000 ? 8 : elapsed <= 6000 ? 6 : elapsed <= 12000 ? 3 : 1;
    const answerScore = clampScore(objective.score);
    const score = clampScore((answerScore * 0.70) + speedScore + latencyScore - (item.timed_out ? 12 : 0));
    const label = score >= 78 ? "excellent" : score >= 62 ? "bon compromis" : score >= 45 ? "correct" : "limite";
    return {
      score,
      speedScore,
      latencyScore,
      answerScore,
      label,
      reason: `${objective.passed_count}/${objective.total_count} preuves objectives, ${tps || 0} tok/s, ${elapsed || 0} ms.`
    };
  }
  const tps = Number(item.estimated_tokens_per_second || 0);
  const elapsed = Number(item.elapsed_ms || 0);
  const preview = String(item.output_preview || "").trim();
  const speedScore = Math.min(45, Math.round((tps / 80) * 45));
  const latencyScore = elapsed <= 1500 ? 25 : elapsed <= 3000 ? 20 : elapsed <= 6000 ? 14 : elapsed <= 12000 ? 8 : 4;
  const answerScore = preview.length >= 120 ? 25 : preview.length >= 60 ? 18 : preview.length >= 20 ? 11 : 5;
  const timeoutPenalty = item.timed_out ? 12 : 0;
  const score = Math.max(1, Math.min(100, speedScore + latencyScore + answerScore + 5 - timeoutPenalty));
  const label = score >= 78 ? "excellent" : score >= 62 ? "bon compromis" : score >= 45 ? "correct" : "limite";
  const reason = `${tps || 0} tok/s, ${elapsed || 0} ms, réponse ${preview.length >= 60 ? "exploitable" : "courte"}.`;
  return { score, speedScore, latencyScore, answerScore, label, reason };
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function arenaFamilyBoost(model, profileKey) {
  const profile = ARENA_USAGE_PROFILES[profileKey] || {};
  const text = String(model || "").toLowerCase();
  if (!profile.family?.length) return 0;
  return profile.family.some((pattern) => pattern.test(text)) ? 16 : -8;
}

function arenaModelScaleSignal(model) {
  const text = String(model || "").toLowerCase();
  if (/(0\.5b|0\.6b|1b|1\.5b|1\.7b)/i.test(text)) return { score: 4, tier: "test léger" };
  if (/(3b|4b|mini)/i.test(text)) return { score: 12, tier: "léger" };
  if (/(7b|8b|9b)/i.test(text)) return { score: 22, tier: "assistant local" };
  if (/(12b|14b|17b|mixtral|8x7b)/i.test(text)) return { score: 28, tier: "qualité" };
  if (/(27b|32b|70b)/i.test(text)) return { score: 30, tier: "gros modèle" };
  return { score: 16, tier: "standard" };
}

function arenaTinyModelPenalty(item, profileKey) {
  const text = String(item?.model || "").toLowerCase();
  const tiny = /(0\.5b|0\.6b|1b|1\.5b|1\.7b)/i.test(text);
  if (!tiny) return 0;
  if (profileKey === "speed" || profileKey === "light_laptop") return 0;
  if (profileKey === "compromise") return 18;
  if (["assistant", "memory", "quality", "long_context", "reasoning"].includes(profileKey)) return 14;
  return 8;
}

function arenaOutputSignal(preview, profileKey) {
  const text = String(preview || "").trim();
  const lower = text.toLowerCase();
  if (!text) return 0;
  const hasStructure = /(^|\n)\s*[-*0-9#]/.test(text) || text.includes(":");
  if (profileKey === "code") {
    return clampScore(
      (/\b(function|def |class |const |let |import|return|```)\b/i.test(text) ? 24 : 6)
      + (text.length > 100 ? 10 : 0)
    );
  }
  if (profileKey === "memory") {
    return clampScore(
      (/tags?:|#|obsidian|prochaine action|décision|decision|note/i.test(text) ? 24 : 8)
      + (hasStructure ? 10 : 0)
    );
  }
  if (profileKey === "reasoning") {
    return clampScore(
      (/\b(parce que|donc|éviter|priorité|conseille|vram|ram)\b/i.test(lower) ? 22 : 8)
      + (text.length >= 80 ? 10 : 0)
    );
  }
  if (profileKey === "french") {
    return clampScore(
      (/\b(vous|votre|machine|modèle|réponse|important|conseil|étape)\b/i.test(lower) ? 20 : 7)
      + (/[àâçéèêëîïôûùüÿñæœ]/i.test(text) ? 8 : 0)
      + (text.length >= 70 ? 8 : 0)
    );
  }
  if (profileKey === "long_context") {
    return clampScore(
      (text.length >= 180 ? 22 : text.length >= 100 ? 14 : 6)
      + (hasStructure ? 8 : 0)
    );
  }
  if (profileKey === "light_laptop") {
    return clampScore(
      (text.length >= 40 ? 12 : 6)
      + (/\b(simple|rapide|léger|test|installer)\b/i.test(lower) ? 12 : 0)
    );
  }
  if (profileKey === "quality") {
    return clampScore(
      (text.length >= 120 ? 18 : 8)
      + (hasStructure ? 8 : 0)
      + (/\b(limite|incertitude|prochaine|action|verdict)\b/i.test(lower) ? 8 : 0)
    );
  }
  if (profileKey === "assistant") {
    return clampScore(
      (text.length >= 80 ? 18 : 8)
      + (/[.!?]\s/.test(text) ? 8 : 0)
      + (hasStructure ? 6 : 0)
    );
  }
  return clampScore(text.length >= 80 ? 20 : text.length >= 30 ? 12 : 5);
}

function arenaProfileScore(item, profileKey = "compromise") {
  if (!item?.success) {
    return {
      score: 0,
      label: "échec",
      reason: item?.error || "Le modèle n'a pas répondu correctement."
    };
  }
  const objectiveProfile = arenaObjectiveProfileScore(item, profileKey);
  if (objectiveProfile) return objectiveProfile;
  const meta = arenaScoreResult(item);
  const tps = Number(item.estimated_tokens_per_second || 0);
  const elapsed = Number(item.elapsed_ms || 0);
  const preview = String(item.output_preview || "");
  const speed = Math.min(40, Math.round((tps / 100) * 40));
  const latency = elapsed <= 1200 ? 24 : elapsed <= 2500 ? 20 : elapsed <= 5000 ? 14 : elapsed <= 12000 ? 7 : 3;
  const output = arenaOutputSignal(preview, profileKey);
  const family = arenaFamilyBoost(item.model, profileKey);
  const scale = arenaModelScaleSignal(item.model);
  const tinyPenalty = arenaTinyModelPenalty(item, profileKey);
  let score = meta.score;
  if (profileKey === "speed") score = speed + latency + Math.min(18, meta.answerScore) + 12;
  else if (profileKey === "assistant") score = (meta.score * 0.34) + output + family + (scale.score * 0.35) + 14;
  else if (profileKey === "code") score = (meta.speedScore * 0.35) + (meta.latencyScore * 0.35) + output + family + 14;
  else if (profileKey === "memory") score = (meta.score * 0.30) + output + family + (scale.score * 0.45) + 18;
  else if (profileKey === "reasoning") score = (meta.score * 0.44) + output + family + 10;
  else if (profileKey === "french") score = (meta.score * 0.46) + output + family + 10;
  else if (profileKey === "long_context") score = (meta.answerScore * 1.05) + (meta.speedScore * 0.20) + output + family + (scale.score * 0.45) + (elapsed <= 20000 ? 8 : -6);
  else if (profileKey === "light_laptop") score = (speed * 0.62) + (latency * 0.72) + output + family + (tps >= 20 ? 10 : 0);
  else if (profileKey === "quality") score = (meta.score * 0.42) + output + family + (scale.score * 0.40) + (elapsed <= 15000 ? 8 : -4);
  else score = 14 + (meta.score * 0.30) + (speed * 0.14) + (latency * 0.14) + (output * 0.28) + (scale.score * 0.54);
  score = clampScore(score - (item.timed_out ? 10 : 0) - tinyPenalty);
  const label = score >= 78 ? "excellent" : score >= 62 ? "bon" : score >= 45 ? "correct" : "limite";
  const reason = `${ARENA_USAGE_PROFILES[profileKey]?.label || "Profil"} : ${score}/100, ${tps || 0} tok/s, ${elapsed || 0} ms, ${scale.tier}.`;
  return { score, label, reason, speed, latency, output, family, scale: scale.score, tinyPenalty };
}

function arenaProfileWinner(results = [], profileKey = "compromise") {
  return results
    .filter((item) => item.success)
    .map((item) => ({
      ...item,
      arena_profile: profileKey,
      arena_profile_score: arenaProfileScore(item, profileKey).score,
      arena_profile_meta: arenaProfileScore(item, profileKey)
    }))
    .sort((a, b) => Number(b.arena_profile_score || 0) - Number(a.arena_profile_score || 0))[0] || null;
}

function arenaRankedResults(results = []) {
  return results
    .map((item) => ({
      ...item,
      arena_score: arenaScoreResult(item).score,
      arena_meta: arenaScoreResult(item),
      arena_profiles: Object.fromEntries(Object.keys(ARENA_USAGE_PROFILES).map((key) => [key, arenaProfileScore(item, key)]))
    }))
    .sort((a, b) => Number(b.arena_score || 0) - Number(a.arena_score || 0));
}

function arenaWinners(results = []) {
  const successful = results.filter((item) => item.success);
  const rankedSuccessful = arenaRankedResults(successful);
  const bestSuccessful = rankedSuccessful[0] || null;
  const fastest = successful.slice().sort((a, b) => Number(b.estimated_tokens_per_second || 0) - Number(a.estimated_tokens_per_second || 0))[0] || null;
  const responsive = successful.slice().sort((a, b) => Number(a.elapsed_ms || 999999) - Number(b.elapsed_ms || 999999))[0] || null;
  const assistant = arenaProfileWinner(successful, "assistant") || bestSuccessful;
  const code = arenaProfileWinner(successful, "code") || bestSuccessful;
  const memory = arenaProfileWinner(successful, "memory") || assistant || bestSuccessful;
  const reasoning = arenaProfileWinner(successful, "reasoning") || bestSuccessful;
  const french = arenaProfileWinner(successful, "french") || reasoning || bestSuccessful;
  const longContext = arenaProfileWinner(successful, "long_context") || bestSuccessful;
  const lightLaptop = arenaProfileWinner(successful, "light_laptop") || fastest || bestSuccessful;
  const quality = arenaProfileWinner(successful, "quality") || reasoning || bestSuccessful;
  const compromise = arenaProfileWinner(successful, "compromise") || bestSuccessful;
  return {
    recommended: compromise || bestSuccessful,
    compromise,
    fastest,
    responsive,
    assistant,
    code,
    memory,
    reasoning,
    french,
    long_context: longContext,
    light_laptop: lightLaptop,
    quality,
    successful_count: successful.length,
    failed_count: results.length - successful.length
  };
}

function arenaWinnerLabel(item, profileKey = "") {
  if (!item) return "aucun";
  const score = arenaDisplayScore(item, profileKey);
  const speed = item.estimated_tokens_per_second ? ` · ${item.estimated_tokens_per_second} tok/s` : "";
  return `${item.model} · ${score}/100${speed}`;
}

function safeDisplayScore(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clampScore(numeric) : null;
}

function arenaDisplayScore(item, profileKey = "") {
  if (!item) return 0;
  if (profileKey) {
    const directScore = safeDisplayScore(item.arena_profile_score);
    if (directScore !== null) return directScore;
    const profileScore = safeDisplayScore(item.arena_profiles?.[profileKey]?.score);
    if (profileScore !== null) return profileScore;
    return safeDisplayScore(arenaProfileScore(item, profileKey).score) ?? 0;
  }
  const arenaScore = safeDisplayScore(item.arena_score);
  if (arenaScore !== null) return arenaScore;
  return safeDisplayScore(arenaScoreResult(item).score) ?? 0;
}

function arenaRunMarkdown(run = readLastArenaRun()) {
  if (!run) return arenaMarkdown();
  const winners = arenaWinners(run.results || []);
  const winner = winners.recommended;
  const ranked = arenaRankedResults(run.results || []);
  const objectiveProtocol = run.protocol === ARENA_OBJECTIVE_PROTOCOL;
  return [
    "# Arena automatique OutilsIA",
    "",
    `- Date: ${new Date(Number(run.created_at_ms || Date.now())).toISOString()}`,
    `- Machine: ${run.machine?.name || "Machine IA locale"}`,
    `- GPU: ${run.machine?.gpu_name || "non détecté"} (${formatVram(run.machine?.vram_gb)})`,
    `- RAM: ${run.machine?.ram_gb || 0} Go`,
    `- Protocole: ${objectiveProtocol ? "Arena objective v1 (6 vérifications reproductibles)" : "ancien protocole estimatif"}`,
    `- Prompt: ${run.prompt}`,
    `- Meilleur compromis: ${winners.compromise ? `${winners.compromise.model} (score ${arenaDisplayScore(winners.compromise, "compromise")}/100)` : "aucun succès"}`,
    `- Plus rapide: ${winners.fastest ? `${winners.fastest.model} (${winners.fastest.estimated_tokens_per_second} tok/s)` : "aucun succès"}`,
    `- Plus réactif: ${winners.responsive ? `${winners.responsive.model} (${winners.responsive.elapsed_ms} ms)` : "aucun succès"}`,
    `- Meilleur assistant: ${winners.assistant ? arenaWinnerLabel(winners.assistant) : "aucun succès"}`,
    `- Meilleur code: ${winners.code ? arenaWinnerLabel(winners.code, "code") : "aucun succès"}`,
    `- Meilleur mémoire: ${winners.memory ? arenaWinnerLabel(winners.memory, "memory") : "aucun succès"}`,
    `- Meilleur raisonnement court: ${winners.reasoning ? arenaWinnerLabel(winners.reasoning, "reasoning") : "aucun succès"}`,
    `- Meilleur français: ${winners.french ? arenaWinnerLabel(winners.french, "french") : "aucun succès"}`,
    `- Vieux PC / portable: ${winners.light_laptop ? arenaWinnerLabel(winners.light_laptop, "light_laptop") : "aucun succès"}`,
    `- Rappel de contexte: ${winners.long_context ? arenaWinnerLabel(winners.long_context, "long_context") : "aucun succès"}`,
    `- Qualité: ${winners.quality ? arenaWinnerLabel(winners.quality, "quality") : "aucun succès"}`,
    "",
    "## Résultats",
    "",
    ...ranked.map((item, index) => [
      `### ${index + 1}. ${item.model} - ${item.success ? item.arena_meta.label : "échec"}`,
      "",
      `- Score Arena: ${item.arena_score}/100`,
      `- Profil vitesse: ${item.arena_profiles?.speed?.score ?? 0}/100`,
      `- Profil assistant: ${item.arena_profiles?.assistant?.score ?? 0}/100`,
      `- Profil code: ${item.arena_profiles?.code?.score ?? 0}/100`,
      `- Profil mémoire: ${item.arena_profiles?.memory?.score ?? 0}/100`,
      `- Profil raisonnement court: ${item.arena_profiles?.reasoning?.score ?? 0}/100`,
      `- Profil français: ${item.arena_profiles?.french?.score ?? 0}/100`,
      `- Profil vieux PC/portable: ${item.arena_profiles?.light_laptop?.score ?? 0}/100`,
      `- Profil rappel de contexte: ${item.arena_profiles?.long_context?.score ?? 0}/100`,
      `- Profil qualité: ${item.arena_profiles?.quality?.score ?? 0}/100`,
      item.arena_objective ? `- Preuve objective: ${item.arena_objective.passed_count}/${item.arena_objective.total_count} (${item.arena_objective.score}/100)` : "- Preuve: ancien protocole estimatif",
      item.arena_objective ? `- Vérifications: ${item.arena_objective.checks.map((check) => `${check.label} ${check.passed ? "OK" : "NON"}`).join(" · ")}` : "",
      `- Temps: ${item.elapsed_ms} ms`,
      `- ${benchmarkSpeedLabel(item)}: ${item.estimated_tokens_per_second} tok/s`,
      `- Méthode: ${benchmarkMeasurementLabel(item)}`,
      `- Tokens: ${item.estimated_tokens}`,
      benchmarkMetricDetails(item) ? `- Détails: ${benchmarkMetricDetails(item)}` : "",
      `- Lecture: ${item.arena_meta.reason}`,
      item.error ? `- Erreur: ${item.error}` : "",
      "",
      "```text",
      item.output_preview || "",
      "```"
    ].filter(Boolean).join("\n")),
    "",
    "## Lecture OutilsIA",
    "",
    winner
      ? `- Sur cette machine et pour ce micro-test reproductible, ${winner.model} est le meilleur compromis entre preuves réussies et vitesse. Ce résultat ne remplace pas une évaluation longue sur tes usages réels.`
      : "- Aucun modèle n'a répondu correctement. Vérifier Ollama, les modèles installés et relancer un test simple."
  ].join("\n");
}

function renderArenaRun(run = readLastArenaRun()) {
  if (!run) return "";
  const winners = arenaWinners(run.results || []);
  const winner = winners.recommended;
  const ranked = arenaRankedResults(run.results || []);
  const objectiveProtocol = run.protocol === ARENA_OBJECTIVE_PROTOCOL;
  return `
      <div class="arena-run-card">
      <strong>${winner ? `Meilleur compromis : ${escapeHtml(winner.model)}` : "Arena terminée sans gagnant"}</strong>
      <span>${winner ? `Score ${escapeHtml(arenaDisplayScore(winner, "compromise"))}/100 · ${escapeHtml(winner.estimated_tokens_per_second)} tok/s · ${escapeHtml(winner.elapsed_ms)} ms` : "Aucun succès dans ce run."}</span>
      <span>${objectiveProtocol ? "Protocole objectif v1 : JSON, instruction, mémoire, calcul, français et action." : "Ancien protocole estimatif : relance l’Arena pour obtenir des preuves objectives."}</span>
      <div class="arena-winner-grid">
        <div><strong>Plus rapide</strong><span>${winners.fastest ? `${escapeHtml(winners.fastest.model)} · ${escapeHtml(winners.fastest.estimated_tokens_per_second)} tok/s` : "aucun"}</span></div>
        <div><strong>Meilleur assistant</strong><span>${escapeHtml(arenaWinnerLabel(winners.assistant, "assistant"))}</span></div>
        <div><strong>Meilleur code</strong><span>${escapeHtml(arenaWinnerLabel(winners.code, "code"))}</span></div>
        <div><strong>Mémoire / Obsidian</strong><span>${escapeHtml(arenaWinnerLabel(winners.memory, "memory"))}</span></div>
        <div><strong>Raisonnement court</strong><span>${escapeHtml(arenaWinnerLabel(winners.reasoning, "reasoning"))}</span></div>
        <div><strong>Français naturel</strong><span>${escapeHtml(arenaWinnerLabel(winners.french, "french"))}</span></div>
        <div><strong>Vieux PC / portable</strong><span>${escapeHtml(arenaWinnerLabel(winners.light_laptop, "light_laptop"))}</span></div>
        <div><strong>Rappel de contexte</strong><span>${escapeHtml(arenaWinnerLabel(winners.long_context, "long_context"))}</span></div>
        <div><strong>Qualité</strong><span>${escapeHtml(arenaWinnerLabel(winners.quality, "quality"))}</span></div>
        <div><strong>Meilleur compromis</strong><span>${escapeHtml(arenaWinnerLabel(winners.compromise, "compromise"))}</span></div>
        <div><strong>Fiabilité</strong><span>${escapeHtml(winners.successful_count)} succès · ${escapeHtml(winners.failed_count)} échec(s)</span></div>
      </div>
      <div class="arena-run-results">
        ${ranked.map((item) => `
          <div class="arena-run-result ${item.success ? "ok-run" : "bad-run"}">
            <strong>${escapeHtml(item.model)}</strong>
            <span>Score ${escapeHtml(arenaDisplayScore(item))}/100 · ${escapeHtml(item.success ? item.arena_meta.label : "échec")} · ${escapeHtml(item.estimated_tokens_per_second || 0)} tok/s · ${escapeHtml(item.elapsed_ms || 0)} ms</span>
            <span>${item.arena_objective ? `Preuve objective ${escapeHtml(item.arena_objective.passed_count)}/${escapeHtml(item.arena_objective.total_count)} · ${escapeHtml(item.arena_objective.score)}/100` : "Ancien protocole estimatif"}</span>
            ${item.arena_objective ? `<span>${escapeHtml(arenaObjectiveFailureLabel(item.arena_objective))}</span>` : ""}
            ${item.success ? `<span>Profils : assistant ${escapeHtml(arenaDisplayScore(item, "assistant"))}/100 · code ${escapeHtml(arenaDisplayScore(item, "code"))}/100 · mémoire ${escapeHtml(arenaDisplayScore(item, "memory"))}/100 · portable ${escapeHtml(arenaDisplayScore(item, "light_laptop"))}/100 · qualité ${escapeHtml(arenaDisplayScore(item, "quality"))}/100</span>` : ""}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderArenaPanel() {
  if (!els.arenaBox) return;
  const candidates = arenaCandidates();
  const scanned = Boolean(state.scan);
  if (!scanned) {
    els.arenaState.textContent = "scan requis";
    els.arenaBox.className = "arena-box empty";
    els.arenaBox.textContent = "Scanne un PC fixe, portable ou vieille config pour obtenir une sélection de modèles à comparer.";
    els.copyArenaBtn.disabled = true;
    els.runArenaBtn.disabled = true;
    els.clearArenaRunBtn.disabled = true;
    return;
  }
  const installedCandidates = arenaInstalledCandidates();
  const lastRun = readLastArenaRun();
  const benchmark = successfulBenchmarkFor("qwen3:0.6b");
  els.arenaState.textContent = benchmark?.success ? "preuve locale" : "à comparer";
  els.arenaBox.className = "arena-box";
  els.arenaBox.innerHTML = `
    <div class="arena-summary">
      <strong>${escapeHtml(state.scan.name || "Machine IA locale")}</strong>
      <span>${escapeHtml(gpuDisplayLabel(state.scan))} - ${escapeHtml(formatVram(state.scan.vram_gb))} - ${escapeHtml(formatGb(state.scan.ram_gb))} RAM</span>
      <span>${benchmark?.success ? `Dernier test : ${escapeHtml(benchmark.model)} à ${escapeHtml(benchmark.estimated_tokens_per_second)} tok/s` : "Prochaine étape : benchmarker le modèle léger puis comparer un modèle recommandé."}</span>
      <span>Sélection Arena : ${escapeHtml(candidates.length)} candidat(s). Liste complète : panneau Ollama installé.</span>
      <span>Run auto : ${installedCandidates.length >= 2 ? `${escapeHtml(installedCandidates.length)} modèle(s) installés prêts` : "installer au moins 2 modèles pour comparer automatiquement"}.</span>
      <span>Chaque modèle reçoit le même micro-test objectif : JSON, instruction, mémoire, calcul, français et action.</span>
    </div>
    ${renderArenaRun(lastRun)}
    <div class="arena-grid">
      ${candidates.map((model, index) => `
        <div class="arena-candidate">
          <div class="model-card-head">
            <strong>${escapeHtml(modelTitle(model))}</strong>
            <em>${escapeHtml(arenaRole(model, index))}</em>
          </div>
          <span>${escapeHtml(modelLine(model))}</span>
          ${renderModelActions(model, { primaryLabel: index === 0 ? "Installer test" : "Installer" })}
        </div>
      `).join("")}
    </div>
  `;
  els.copyArenaBtn.disabled = false;
  els.runArenaBtn.disabled = installedCandidates.length < 2;
  els.clearArenaRunBtn.disabled = !lastRun;
}

function arenaMarkdown() {
  const scan = state.scan || {};
  const candidates = arenaCandidates();
  const benchmark = successfulBenchmarkFor("qwen3:0.6b");
  return [
    "# Arena locale OutilsIA",
    "",
    `- Date: ${new Date().toISOString()}`,
    `- Machine: ${scan.name || "non scannée"}`,
    `- CPU: ${scan.cpu_name || "non scanné"}`,
    `- RAM: ${formatGb(scan.ram_gb)}`,
    `- GPU: ${scan.gpu_name || "non scanné"}`,
    `- VRAM: ${formatGb(scan.vram_gb)}`,
    `- Ollama: ${runtimeOllama(scan)}`,
    "",
    "## Modèles à comparer",
    "",
    ...(candidates.length
      ? candidates.map((model, index) => `- ${modelTitle(model)} (${arenaRole(model, index)}): ${actionableOllamaRef(model) || "commande absente"} - ${modelLine(model)}`)
      : ["- Aucun modèle candidat. Lance le diagnostic OutilsIA."]),
    "",
    "## Dernier benchmark",
    "",
    benchmark
      ? `- ${benchmark.model}: ${benchmark.estimated_tokens_per_second} tok/s, ${benchmark.elapsed_ms} ms, succès ${benchmark.success ? "oui" : "non"}`
      : "- Aucun benchmark lancé.",
    "",
    "## Prochaine action",
    "",
    "- Installer le modèle test léger, lancer un benchmark, puis comparer le modèle recommandé par le diagnostic."
  ].join("\n");
}

async function copyArenaReport() {
  if (!state.scan) {
    setStatus("Scan requis avant copie Arena", "warn");
    return;
  }
  await navigator.clipboard.writeText(readLastArenaRun() ? arenaRunMarkdown() : arenaMarkdown());
  setStatus("Rapport Arena copié", "ok");
}

function renderArenaProgress(models, results = [], activeRef = "") {
  const scan = state.scan || {};
  els.arenaState.textContent = "run en cours";
  els.arenaBox.className = "arena-box";
  els.arenaBox.innerHTML = `
    <div class="arena-summary">
      <strong>Arena automatique en cours</strong>
      <span>${escapeHtml(gpuDisplayLabel(scan))} - ${escapeHtml(formatVram(scan.vram_gb))} - ${escapeHtml(formatGb(scan.ram_gb))} RAM</span>
      <span>Micro-test objectif : ${escapeHtml(results.length)} / ${escapeHtml(models.length)} modèle(s) terminé(s).</span>
    </div>
    <div class="arena-grid">
      ${models.map((model) => {
        const ref = actionableOllamaRef(model);
        const result = results.find((item) => normalizeOllamaRef(item.model) === normalizeOllamaRef(ref));
        const status = result ? (result.success ? `${result.estimated_tokens_per_second} tok/s` : "échec") : normalizeOllamaRef(ref) === normalizeOllamaRef(activeRef) ? "test en cours" : "en attente";
        return `
          <div class="arena-candidate">
            <div class="model-card-head">
              <strong>${escapeHtml(modelTitle(model))}</strong>
              <em>${escapeHtml(status)}</em>
            </div>
            <span>${escapeHtml(modelLine(model))}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

async function runAutomaticArena() {
  if (!state.scan) {
    setStatus("Scan requis avant Arena", "warn");
    return;
  }
  const models = arenaInstalledCandidates(3);
  if (models.length < 2) {
    setStatus("Installe au moins 2 modèles pour lancer l'Arena", "warn");
    return;
  }
  const prompt = ARENA_OBJECTIVE_PROMPT;
  const results = [];
  els.runArenaBtn.disabled = true;
  els.copyArenaBtn.disabled = true;
  els.clearArenaRunBtn.disabled = true;
  setStatus(`Arena automatique: ${models.length} modèles...`);
  resetOperationConsole(`Arena automatique : ${models.map((model) => actionableOllamaRef(model)).join(", ")}`);
  for (const model of models) {
    const ref = actionableOllamaRef(model);
    renderArenaProgress(models, results, ref);
    appendOperationLine(`Micro-test objectif Arena : ${ref}`, "cmd");
    try {
      const result = invoke
        ? await invoke("benchmark_ollama", {
            request: {
              model: ref,
              prompt,
              timeout_seconds: 60,
              protocol: ARENA_OBJECTIVE_PROTOCOL,
              ...ollamaRuntimePayload(ref)
            }
          })
        : demoBenchmark(ref);
      const measured = {
        ...result,
        benchmark_protocol: ARENA_OBJECTIVE_PROTOCOL,
        arena_objective: evaluateArenaObjective(result.output_preview)
      };
      results.push(measured);
      state.benchmark = measured;
      saveBenchmarkHistoryEntry(measured);
      appendOperationLine(`${ref}: ${measured.success ? `${measured.arena_objective.summary}, ${measured.estimated_tokens_per_second} tok/s` : "échec"}`, measured.success ? "ok" : "erreur");
    } catch (error) {
      const failed = {
        model: ref,
        prompt,
        elapsed_ms: 0,
        estimated_tokens: 0,
        estimated_tokens_per_second: 0,
        success: false,
        timed_out: false,
        output_preview: "",
        error: friendlyOllamaError(error),
        created_at_ms: Date.now(),
        benchmark_protocol: ARENA_OBJECTIVE_PROTOCOL,
        arena_objective: evaluateArenaObjective("")
      };
      results.push(failed);
      saveBenchmarkHistoryEntry(failed);
      appendOperationLine(`${ref}: ${failed.error}`, "erreur");
    }
  }
  const run = {
    id: `arena-${Date.now()}`,
    created_at_ms: Date.now(),
    protocol: ARENA_OBJECTIVE_PROTOCOL,
    protocol_label: "Arena objective v1",
    prompt,
    machine: {
      name: state.scan.name || "Machine IA locale",
      gpu_name: state.scan.gpu_name || "",
      vram_gb: state.scan.vram_gb || 0,
      ram_gb: state.scan.ram_gb || 0,
      machine_key: state.scan.machine_key || ""
    },
    results
  };
  writeLastArenaRun(run);
  const winner = arenaWinner(results);
  renderBenchmark(results[results.length - 1]);
  renderFirstTestPanel();
  renderArenaPanel();
  renderStrategyBridgePanel();
  renderFieldTestPanel();
  finishOperationMonitor(winner ? "Arena terminée" : "Arena terminée sans gagnant");
  els.runArenaBtn.disabled = false;
  els.copyArenaBtn.disabled = false;
  els.clearArenaRunBtn.disabled = false;
  setStatus(winner ? `Arena terminée: ${winner.model} gagne` : "Arena terminée sans gagnant", winner ? "ok" : "warn");
}

function privateWorkloadPolicy() {
  return PRIVATE_WORKLOAD_CATALOG.policy || {};
}

function privateWorkloadPacks() {
  return Array.isArray(PRIVATE_WORKLOAD_CATALOG.packs) ? PRIVATE_WORKLOAD_CATALOG.packs : [];
}

function privateWorkloadPack(key = "") {
  const packs = privateWorkloadPacks();
  return packs.find((item) => item.key === key) || packs[0] || null;
}

function privateWorkloadPackKey() {
  return els.privateWorkloadPackSelect?.value || privateWorkloadPacks()[0]?.key || "";
}

function privateWorkloadTerms(value = els.privateWorkloadRequiredTerms?.value || "") {
  return [...new Set(String(value || "")
    .split(/[,;\n]/)
    .map((item) => normalizeArenaAnswer(item))
    .filter(Boolean))]
    .slice(0, 8);
}

function privateWorkloadInstalledModels(limit = 6) {
  const installed = (state.scan?.installed_models || [])
    .map((model) => normalizeOllamaRef(modelLabel(model)))
    .filter(Boolean);
  const preferred = arenaInstalledCandidates(3)
    .map((model) => normalizeOllamaRef(actionableOllamaRef(model)))
    .map((candidate) => installed.find((ref) => sameOllamaModel(ref, candidate)) || "")
    .filter(Boolean);
  const result = [];
  for (const value of [...preferred, ...installed]) {
    const ref = normalizeOllamaRef(value);
    if (!ref || result.some((existing) => sameOllamaModel(existing, ref))) continue;
    result.push(ref);
  }
  return result.slice(0, limit);
}

function syncPrivateWorkloadSelections(models = privateWorkloadInstalledModels()) {
  const allowed = new Set(models);
  for (const ref of [...privateWorkloadSelections]) {
    if (!allowed.has(ref)) privateWorkloadSelections.delete(ref);
  }
  const policy = privateWorkloadPolicy();
  const minimum = Number(policy.min_models_per_run || 2);
  const maximum = Number(policy.max_models_per_run || 3);
  for (const ref of models) {
    if (privateWorkloadSelections.size >= minimum) break;
    privateWorkloadSelections.add(ref);
  }
  while (privateWorkloadSelections.size > maximum) {
    privateWorkloadSelections.delete([...privateWorkloadSelections].at(-1));
  }
}

function privateWorkloadSelectedModels() {
  const installed = new Set(privateWorkloadInstalledModels());
  return [...privateWorkloadSelections].filter((ref) => installed.has(ref));
}

function readPrivateWorkloadRuns() {
  try {
    const parsed = JSON.parse(window.localStorage?.getItem(PRIVATE_WORKLOAD_RUNS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistedPrivateWorkloadRun(run) {
  if (!run) return null;
  return {
    schema: run.schema,
    protocol: run.protocol,
    catalog_version: run.catalog_version,
    id: run.id,
    created_at_ms: run.created_at_ms,
    machine_key: run.machine_key,
    pack: run.pack,
    custom: Boolean(run.custom),
    prompt_digest: run.prompt_digest,
    prompt_length: Number(run.prompt_length || 0),
    prompt_persisted: false,
    required_term_count: Number(run.required_term_count || 0),
    model_count: Number(run.model_count || 0),
    results: (run.results || []).map((item) => ({
      model: item.model,
      runtime: item.runtime || "",
      success: Boolean(item.success),
      timed_out: Boolean(item.timed_out),
      elapsed_ms: Number(item.elapsed_ms || 0),
      tokens_per_second: Number(item.tokens_per_second || 0),
      score: Number(item.score || 0),
      passed_count: Number(item.passed_count || 0),
      total_count: Number(item.total_count || 0),
      valid_json: Boolean(item.valid_json),
      output_digest: item.output_digest || "",
      output_persisted: false,
      checks: (item.checks || []).map((check) => ({
        key: check.key,
        label: check.label,
        passed: Boolean(check.passed),
        weight: Number(check.weight || 0)
      })),
      error_code: item.success ? "" : item.timed_out ? "timeout" : "local_execution_failed",
      error: item.success ? "" : item.timed_out ? "Délai local dépassé" : "Échec local ; détails bruts non conservés"
    })),
    winner: run.winner ? {
      model: run.winner.model,
      score: Number(run.winner.score || 0),
      tokens_per_second: Number(run.winner.tokens_per_second || 0)
    } : null,
    confidence: run.confidence || "faible",
    privacy: {
      local_only: true,
      cloud_upload: false,
      prompt_persisted: false,
      output_persisted: false,
      raw_content_in_passport: false
    }
  };
}

function writePrivateWorkloadRun(run) {
  const persisted = persistedPrivateWorkloadRun(run);
  if (!persisted) return;
  const history = readPrivateWorkloadRuns().filter((item) => item.id !== persisted.id);
  window.localStorage?.setItem(PRIVATE_WORKLOAD_RUNS_KEY, JSON.stringify([persisted, ...history].slice(0, MAX_PRIVATE_WORKLOAD_RUNS)));
  state.privateWorkloadRun = persisted;
}

function privateWorkloadFieldValue(parsed, field = "*") {
  if (!parsed) return "";
  if (field === "*") return Object.values(parsed).map((value) => String(value ?? "")).join(" ");
  return String(parsed[field] ?? "");
}

function privateWorkloadCheckPassed(check, parsed, requiredTerms = []) {
  const responseKeys = PRIVATE_WORKLOAD_CATALOG.response_keys || ["answer", "evidence", "action"];
  if (check.rule === "exact_json_keys") {
    return Boolean(parsed)
      && Object.keys(parsed).length === responseKeys.length
      && responseKeys.every((key) => Object.prototype.hasOwnProperty.call(parsed, key))
      && responseKeys.every((key) => typeof parsed[key] === "string");
  }
  if (!parsed) return false;
  const raw = privateWorkloadFieldValue(parsed, check.field);
  const normalized = normalizeArenaAnswer(raw);
  if (check.rule === "regex") {
    try {
      return new RegExp(check.pattern || "", String(check.flags || "").replace(/[^gimsuy]/g, "")).test(raw);
    } catch {
      return false;
    }
  }
  if (check.rule === "includes_all") {
    return (check.terms || []).every((term) => normalized.includes(normalizeArenaAnswer(term)));
  }
  if (check.rule === "includes_any") {
    return (check.terms || []).some((term) => normalized.includes(normalizeArenaAnswer(term)));
  }
  if (check.rule === "dynamic_required_terms") {
    return requiredTerms.length > 0 && requiredTerms.every((term) => normalized.includes(normalizeArenaAnswer(term)));
  }
  return false;
}

function evaluatePrivateWorkloadPack(output, packKey = privateWorkloadPackKey(), requiredTerms = []) {
  const pack = privateWorkloadPack(packKey);
  if (!pack) {
    return {
      protocol: PRIVATE_WORKLOAD_PROTOCOL,
      pack: packKey,
      score: 0,
      passed_count: 0,
      total_count: 0,
      valid_json: false,
      checks: [],
      summary: "Pack privé introuvable"
    };
  }
  const parsed = parseArenaObjectiveJson(output);
  const checks = (pack.checks || []).map((check) => ({
    key: check.key,
    label: check.label,
    passed: privateWorkloadCheckPassed(check, parsed, requiredTerms),
    weight: Number(check.weight || 0)
  }));
  const score = checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0);
  const passedCount = checks.filter((check) => check.passed).length;
  return {
    protocol: PRIVATE_WORKLOAD_PROTOCOL,
    catalog_version: PRIVATE_WORKLOAD_CATALOG.version,
    pack: pack.key,
    pack_label: pack.label,
    score,
    passed_count: passedCount,
    total_count: checks.length,
    valid_json: Boolean(checks.find((check) => check.key === "format")?.passed),
    checks,
    summary: `${passedCount}/${checks.length} preuves déterministes validées`
  };
}

function demoPrivateWorkloadOutput(packKey, requiredTerms = []) {
  if (packKey === "code") {
    return JSON.stringify({
      answer: "function add(a,b){return a + b;}",
      evidence: "L'addition de 4 et 5 produit la somme 9 après correction.",
      action: "Tester add(4,5) dans JavaScript."
    });
  }
  if (packKey === "french") {
    return JSON.stringify({
      answer: "Mon IA locale répond bien en français.",
      evidence: "Accord de locale et accents sur répond et français.",
      action: "Relire puis comparer la phrase corrigée."
    });
  }
  if (packKey === "summary") {
    return JSON.stringify({
      answer: "La machine est déjà solide et aucun achat n'est requis avant comparaison.",
      evidence: "16 Go de VRAM, 64 Go de RAM, qwen3:8b mesuré à 42 tok/s.",
      action: "Lancer un second benchmark puis comparer."
    });
  }
  if (packKey === "memory") {
    return JSON.stringify({
      answer: "Titre : Mémoire projet\nTags : #obsidian #local-ai",
      evidence: "OBSIDIAN-84 · MEMORY-21 · garder hermes3:8b pour la mémoire projet.",
      action: "Prochaine action : lancer un benchmark."
    });
  }
  return JSON.stringify({
    answer: requiredTerms.join(" "),
    evidence: "Réponse construite uniquement depuis la consigne locale.",
    action: "Vérifier puis valider le résultat."
  });
}

function privateWorkloadDescriptor() {
  const pack = privateWorkloadPack(privateWorkloadPackKey());
  if (!pack) throw new Error("Aucun pack privé disponible");
  if (pack.key !== "custom") {
    return { pack, prompt: pack.prompt, requiredTerms: [], custom: false };
  }
  const customPrompt = String(els.privateWorkloadCustomPrompt?.value || "").trim();
  const requiredTerms = privateWorkloadTerms();
  if (customPrompt.length < 20) throw new Error("La consigne métier doit contenir au moins 20 caractères");
  if (!requiredTerms.length) throw new Error("Ajoute au moins un terme obligatoire pour une preuve déterministe");
  const prompt = String(pack.prompt_template || "")
    .replace("{{CUSTOM_PROMPT}}", customPrompt)
    .replace("{{REQUIRED_TERMS}}", requiredTerms.join(", "));
  return { pack, prompt, requiredTerms, custom: true };
}

function privateWorkloadWinner(results = []) {
  return results
    .filter((item) => item.success)
    .slice()
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0)
      || Number(b.tokens_per_second || 0) - Number(a.tokens_per_second || 0))[0] || null;
}

function privateWorkloadConfidence(results = [], winner = privateWorkloadWinner(results)) {
  const successful = results.filter((item) => item.success).sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  if (!winner || successful.length < 2) return "faible";
  const gap = Number(successful[0].score || 0) - Number(successful[1].score || 0);
  if (successful.every((item) => item.valid_json) && gap >= 15) return "élevée";
  return gap >= 5 ? "moyenne" : "faible";
}

function privateWorkloadPackSummary(run = state.privateWorkloadRun || readPrivateWorkloadRuns()[0] || null) {
  if (!run?.results?.length) return null;
  return {
    schema: run.schema,
    protocol: run.protocol,
    catalog_version: run.catalog_version,
    created_at_ms: Number(run.created_at_ms || 0),
    pack: run.pack,
    custom: Boolean(run.custom),
    prompt_digest: run.prompt_digest || "",
    prompt_persisted: false,
    model_count: Number(run.model_count || run.results.length || 0),
    winner: run.winner || null,
    confidence: run.confidence || "faible",
    results: run.results.map((item) => ({
      model: item.model,
      success: Boolean(item.success),
      score: Number(item.score || 0),
      checks: `${Number(item.passed_count || 0)}/${Number(item.total_count || 0)}`,
      tokens_per_second: Number(item.tokens_per_second || 0),
      output_digest: item.output_digest || "",
      output_persisted: false
    })),
    privacy: {
      local_only: true,
      cloud_upload: false,
      raw_content_included: false
    }
  };
}

function privateWorkloadMarkdown(run = state.privateWorkloadRun || readPrivateWorkloadRuns()[0] || null) {
  const summary = privateWorkloadPackSummary(run);
  if (!summary) return "";
  const pack = privateWorkloadPack(summary.pack);
  return [
    "# Tests privés OutilsIA",
    "",
    `- Date: ${new Date(summary.created_at_ms || Date.now()).toISOString()}`,
    `- Protocole: ${summary.protocol}`,
    `- Catalogue: ${summary.catalog_version}`,
    `- Pack: ${pack?.label || summary.pack}${summary.custom ? " (personnalisé)" : ""}`,
    `- Empreinte de la consigne: SHA-256 ${summary.prompt_digest}`,
    "- Consigne brute conservée: non",
    "- Réponses brutes conservées: non",
    "- Envoi cloud: non",
    `- Confiance du classement: ${summary.confidence}`,
    summary.winner ? `- Modèle gagnant: ${summary.winner.model} (${summary.winner.score}/100)` : "- Modèle gagnant: aucun",
    "",
    "## Résultats",
    "",
    ...summary.results.map((item) => `- ${item.model}: ${item.success ? `${item.score}/100 · ${item.checks} checks · ${item.tokens_per_second} tok/s` : "échec"} · sortie SHA-256 ${item.output_digest || "absente"}`),
    "",
    "## Limites",
    "",
    "- Le score vérifie des critères déterministes bornés ; il ne mesure pas toute la qualité du modèle.",
    "- Aucun raisonnement interne ou contenu privé brut n'est exporté dans cette preuve.",
    "- Le résultat décrit cette machine, ce runtime, ce pack et ce moment précis."
  ].join("\n");
}

function renderPrivateWorkloadPanel() {
  if (!els.privateWorkloadBox || !els.privateWorkloadPackSelect) return;
  const packs = privateWorkloadPacks();
  const selectedKey = privateWorkloadPackKey() || packs[0]?.key || "";
  const options = packs.map((pack) => `<option value="${escapeHtml(pack.key)}"${pack.key === selectedKey ? " selected" : ""}>${escapeHtml(pack.label)} · ${escapeHtml(pack.description)}</option>`).join("");
  if (els.privateWorkloadPackSelect.innerHTML !== options) {
    els.privateWorkloadPackSelect.innerHTML = options;
    els.privateWorkloadPackSelect.value = selectedKey;
  }
  const custom = selectedKey === "custom";
  els.privateWorkloadCustomFields?.classList.toggle("hidden", !custom);
  const models = privateWorkloadInstalledModels();
  syncPrivateWorkloadSelections(models);
  if (!models.length) {
    els.privateWorkloadModelList.className = "private-workload-models empty";
    els.privateWorkloadModelList.textContent = "Aucun modèle Ollama installé n'est disponible pour un test privé.";
  } else {
    els.privateWorkloadModelList.className = "private-workload-models";
    els.privateWorkloadModelList.innerHTML = models.map((ref) => {
      const benchmark = successfulBenchmarkFor(ref);
      return `
        <label class="private-workload-model">
          <input type="checkbox" data-private-workload-model="${escapeHtml(ref)}"${privateWorkloadSelections.has(ref) ? " checked" : ""}>
          <span>
            <strong>${escapeHtml(ref)}</strong>
            <span>${benchmark?.success ? `${escapeHtml(benchmark.estimated_tokens_per_second)} tok/s déjà mesurés` : "installé · pas encore mesuré"}</span>
          </span>
        </label>
      `;
    }).join("");
  }
  const run = state.privateWorkloadRun || readPrivateWorkloadRuns()[0] || null;
  const summary = privateWorkloadPackSummary(run);
  if (!summary) {
    const pack = privateWorkloadPack(selectedKey);
    els.privateWorkloadState.textContent = "local uniquement";
    els.privateWorkloadBox.className = "private-workload-box empty";
    els.privateWorkloadBox.textContent = pack
      ? `${pack.label} : ${pack.description} Sélectionne 2 ou 3 modèles installés.`
      : "Catalogue de tests privés indisponible.";
  } else {
    const runPack = privateWorkloadPack(summary.pack);
    els.privateWorkloadState.textContent = summary.winner ? `${summary.winner.model} · ${summary.winner.score}/100` : "aucun gagnant";
    els.privateWorkloadBox.className = "private-workload-box";
    els.privateWorkloadBox.innerHTML = `
      <div class="private-workload-summary">
        <strong>${escapeHtml(runPack?.label || summary.pack)} · classement local</strong>
        <span>${summary.winner ? `Gagnant : ${escapeHtml(summary.winner.model)} · ${escapeHtml(summary.winner.score)}/100 · confiance ${escapeHtml(summary.confidence)}` : "Aucun modèle n'a produit une preuve exploitable."}</span>
        <span>SHA-256 consigne : ${escapeHtml(shortHash(summary.prompt_digest))} · contenu brut non conservé</span>
      </div>
      <div class="private-workload-results">
        ${(run.results || []).map((item) => `
          <div class="private-workload-result${summary.winner?.model === item.model ? " winner" : ""}">
            <strong>${escapeHtml(item.model)} · ${escapeHtml(item.score)}/100</strong>
            <span>${item.success ? `${escapeHtml(item.passed_count)}/${escapeHtml(item.total_count)} checks · ${escapeHtml(item.tokens_per_second)} tok/s · ${escapeHtml(item.elapsed_ms)} ms` : escapeHtml(item.error || "échec")}</span>
            <div class="private-workload-checks">
              ${(item.checks || []).map((check) => `<small class="${check.passed ? "ok" : ""}">${escapeHtml(check.label)} ${check.passed ? "OK" : "NON"}</small>`).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }
  const policy = privateWorkloadPolicy();
  const selectedCount = privateWorkloadSelectedModels().length;
  const customReady = !custom
    || (String(els.privateWorkloadCustomPrompt?.value || "").trim().length >= 20 && privateWorkloadTerms().length > 0);
  els.runPrivateWorkloadBtn.disabled = privateWorkloadBusy
    || !state.scan
    || !hasUsableOllamaRuntime(state.scan)
    || selectedCount < Number(policy.min_models_per_run || 2)
    || selectedCount > Number(policy.max_models_per_run || 3)
    || !customReady;
  els.copyPrivateWorkloadBtn.disabled = !summary;
  els.clearPrivateWorkloadBtn.disabled = !summary;
}

function renderPrivateWorkloadProgress(models, results = [], activeRef = "") {
  const pack = privateWorkloadPack(privateWorkloadPackKey());
  els.privateWorkloadState.textContent = "run en cours";
  els.privateWorkloadBox.className = "private-workload-box";
  els.privateWorkloadBox.innerHTML = `
    <div class="private-workload-summary">
      <strong>${escapeHtml(pack?.label || "Pack privé")} · ${escapeHtml(results.length)}/${escapeHtml(models.length)} modèle(s)</strong>
      <span>Même consigne, mêmes critères, aucune persistance brute.</span>
    </div>
    <div class="private-workload-results">
      ${models.map((ref) => {
        const result = results.find((item) => item.model === ref);
        const label = result ? (result.success ? `${result.score}/100` : "échec") : ref === activeRef ? "test en cours" : "en attente";
        return `<div class="private-workload-result"><strong>${escapeHtml(ref)}</strong><span>${escapeHtml(label)}</span></div>`;
      }).join("")}
    </div>
  `;
}

async function runPrivateWorkloadPack() {
  if (!state.scan || !hasUsableOllamaRuntime(state.scan)) {
    setStatus("Scan et Ollama requis avant un test privé", "warn");
    return null;
  }
  if (privateWorkloadBusy) {
    setStatus("Un test privé est déjà en cours", "warn");
    return null;
  }
  const policy = privateWorkloadPolicy();
  const models = privateWorkloadSelectedModels();
  const minimum = Number(policy.min_models_per_run || 2);
  const maximum = Number(policy.max_models_per_run || 3);
  if (models.length < minimum || models.length > maximum) {
    setStatus(`Sélectionne entre ${minimum} et ${maximum} modèles installés`, "warn");
    return null;
  }
  let descriptor;
  try {
    descriptor = privateWorkloadDescriptor();
  } catch (error) {
    setStatus(String(error.message || error), "warn");
    renderPrivateWorkloadPanel();
    return null;
  }
  if (!window.confirm(`Lancer ${descriptor.pack.label} sur ${models.length} modèles déjà installés ? Aucun téléchargement ni envoi cloud.`)) {
    return null;
  }
  privateWorkloadBusy = true;
  renderPrivateWorkloadPanel();
  resetOperationConsole(`Tests privés · ${descriptor.pack.label}`);
  setStatus(`Pack privé ${descriptor.pack.label} en cours...`);
  appendOperationLine(`Modèles : ${models.join(", ")} · téléchargement 0 · cloud 0`, "info");
  const promptDigest = await sha256Hex(descriptor.prompt);
  const measuredResults = [];
  try {
    for (const ref of models) {
      renderPrivateWorkloadProgress(models, measuredResults, ref);
      appendOperationLine(`Test privé ${descriptor.pack.key} : ${ref}`, "cmd");
      try {
        const result = invoke
          ? await invoke("benchmark_ollama", {
              request: {
                model: ref,
                prompt: descriptor.prompt,
                timeout_seconds: Number(policy.timeout_seconds_per_model || 60),
                protocol: PRIVATE_WORKLOAD_PROTOCOL,
                ...ollamaRuntimePayload(ref)
              }
            })
          : { ...demoBenchmark(ref), output_preview: demoPrivateWorkloadOutput(descriptor.pack.key, descriptor.requiredTerms) };
        const proof = evaluatePrivateWorkloadPack(result.output_preview, descriptor.pack.key, descriptor.requiredTerms);
        const outputDigest = await sha256Hex(String(result.output_preview || ""));
        const measured = {
          model: ref,
          runtime: defaultOllamaRuntime(ref),
          success: Boolean(result.success),
          timed_out: Boolean(result.timed_out),
          elapsed_ms: Number(result.elapsed_ms || 0),
          tokens_per_second: Number(result.estimated_tokens_per_second || 0),
          score: result.success ? proof.score : 0,
          passed_count: result.success ? proof.passed_count : 0,
          total_count: proof.total_count,
          valid_json: result.success && proof.valid_json,
          checks: result.success ? proof.checks : proof.checks.map((check) => ({ ...check, passed: false })),
          output_digest: outputDigest,
          error: result.success ? "" : friendlyOllamaError(result.error || "Le modèle n'a pas répondu")
        };
        measuredResults.push(measured);
        appendOperationLine(`${ref}: ${measured.success ? `${measured.score}/100 · ${measured.passed_count}/${measured.total_count} checks` : measured.error}`, measured.success ? "ok" : "erreur");
      } catch (error) {
        measuredResults.push({
          model: ref,
          runtime: defaultOllamaRuntime(ref),
          success: false,
          timed_out: false,
          elapsed_ms: 0,
          tokens_per_second: 0,
          score: 0,
          passed_count: 0,
          total_count: descriptor.pack.checks?.length || 0,
          valid_json: false,
          checks: (descriptor.pack.checks || []).map((check) => ({ key: check.key, label: check.label, passed: false, weight: check.weight })),
          output_digest: await sha256Hex(""),
          error: friendlyOllamaError(error)
        });
        appendOperationLine(`${ref}: ${friendlyOllamaError(error)}`, "erreur");
      }
    }
    const winner = privateWorkloadWinner(measuredResults);
    const run = {
      schema: "outilsia.private_workload_run.v1",
      protocol: PRIVATE_WORKLOAD_PROTOCOL,
      catalog_version: PRIVATE_WORKLOAD_CATALOG.version,
      id: `private-workload-${Date.now()}`,
      created_at_ms: Date.now(),
      machine_key: state.scan.machine_key || "",
      pack: descriptor.pack.key,
      custom: descriptor.custom,
      prompt_digest: promptDigest,
      prompt_length: descriptor.prompt.length,
      required_term_count: descriptor.requiredTerms.length,
      model_count: models.length,
      results: measuredResults,
      winner,
      confidence: privateWorkloadConfidence(measuredResults, winner)
    };
    writePrivateWorkloadRun(run);
    invalidateCapabilityPassport();
    renderCapabilityPassportPanel();
    renderReadinessPanel();
    renderPrivateWorkloadPanel();
    finishOperationMonitor(winner ? "Tests privés terminés" : "Tests privés sans gagnant");
    setStatus(winner ? `Tests privés : ${winner.model} gagne ${winner.score}/100` : "Tests privés terminés sans gagnant", winner ? "ok" : "warn");
    return state.privateWorkloadRun;
  } finally {
    privateWorkloadBusy = false;
    renderPrivateWorkloadPanel();
  }
}

async function copyPrivateWorkloadProof() {
  const markdown = privateWorkloadMarkdown();
  if (!markdown) {
    setStatus("Aucune preuve de test privé à copier", "warn");
    return;
  }
  await navigator.clipboard.writeText(markdown);
  setStatus("Preuve privée copiée sans contenu brut", "ok");
}

function clearPrivateWorkloadRuns() {
  if (!readPrivateWorkloadRuns().length) return;
  if (!window.confirm("Vider l'historique local des tests privés ?")) return;
  window.localStorage?.removeItem(PRIVATE_WORKLOAD_RUNS_KEY);
  state.privateWorkloadRun = null;
  invalidateCapabilityPassport();
  renderCapabilityPassportPanel();
  renderReadinessPanel();
  renderPrivateWorkloadPanel();
  setStatus("Historique local des tests privés vidé", "ok");
}

async function runRecommendationEngine(profileKey = readUsageProfileKey()) {
  const profile = USAGE_PROFILES[profileKey] || USAGE_PROFILES.polyvalent;
  if (!state.scan) {
    setStatus("Scan requis avant la recommandation mesurée", "warn");
    return null;
  }
  if (!hasUsableOllamaRuntime(state.scan)) {
    setStatus("Ollama requis avant de comparer les modèles", "warn");
    return null;
  }
  if (recommendationEngineBusy) {
    setStatus("Recommendation Engine déjà en cours", "warn");
    return null;
  }
  const candidates = recommendationEngineCandidates(profileKey, 2);
  if (candidates.length < 2) {
    setStatus("Deux modèles compatibles et actionnables sont requis", "warn");
    return null;
  }

  recommendationEngineBusy = true;
  renderPreparePanel();
  setStatus(`Recommendation Engine ${profile.label} : préparation...`);
  resetOperationConsole(`Recommendation Engine v2 · ${profile.label}`);
  appendOperationLine(`Candidats : ${candidates.map((item) => item.ref).join(", ")}`, "info");

  const results = [];
  try {
    for (const candidate of candidates) {
      if (isOllamaModelInstalled(candidate.ref)) continue;
      appendOperationLine(`Installation consentie par le bouton : ${candidate.ref}`, "cmd");
      await installRecommendedModel(candidate.ref);
      if (!isOllamaModelInstalled(candidate.ref)) {
        results.push({
          model: candidate.ref,
          prompt: recommendationEnginePrompt(profileKey),
          elapsed_ms: 0,
          estimated_tokens: 0,
          estimated_tokens_per_second: 0,
          success: false,
          timed_out: false,
          output_preview: "",
          error: "Modèle non confirmé après installation.",
          benchmark_protocol: RECOMMENDATION_ENGINE_PROTOCOL,
          recommendation_proof: evaluateRecommendationProof("", profileKey),
          resource_estimates: recommendationCandidateResources(candidate),
          created_at_ms: Date.now()
        });
      }
    }

    resetOperationConsole(`Comparaison mesurée · ${profile.label}`);
    const prompt = recommendationEnginePrompt(profileKey);
    for (const candidate of candidates) {
      if (results.some((item) => sameOllamaModel(item.model, candidate.ref) && !item.success)) continue;
      appendOperationLine(`Test ${profile.label} : ${candidate.ref}`, "cmd");
      try {
        const result = invoke
          ? await invoke("benchmark_ollama", {
              request: {
                model: candidate.ref,
                prompt,
                timeout_seconds: 75,
                protocol: RECOMMENDATION_ENGINE_PROTOCOL,
                ...ollamaRuntimePayload(candidate.ref)
              }
            })
          : { ...demoBenchmark(candidate.ref), output_preview: demoRecommendationOutput(profileKey) };
        const proof = evaluateRecommendationProof(result.output_preview, profileKey);
        const measured = {
          ...result,
          benchmark_protocol: RECOMMENDATION_ENGINE_PROTOCOL,
          recommendation_proof: proof,
          arena_objective: proof,
          resource_estimates: recommendationCandidateResources(candidate)
        };
        results.push(measured);
        saveBenchmarkHistoryEntry(measured);
        appendOperationLine(`${candidate.ref}: ${proof.summary}, ${measured.estimated_tokens_per_second || 0} tok/s`, measured.success ? "ok" : "erreur");
      } catch (error) {
        const failed = {
          model: candidate.ref,
          prompt,
          elapsed_ms: 0,
          estimated_tokens: 0,
          estimated_tokens_per_second: 0,
          success: false,
          timed_out: false,
          output_preview: "",
          error: friendlyOllamaError(error),
          benchmark_protocol: RECOMMENDATION_ENGINE_PROTOCOL,
          recommendation_proof: evaluateRecommendationProof("", profileKey),
          resource_estimates: recommendationCandidateResources(candidate),
          created_at_ms: Date.now()
        };
        results.push(failed);
        saveBenchmarkHistoryEntry(failed);
        appendOperationLine(`${candidate.ref}: ${failed.error}`, "erreur");
      }
    }

    const run = {
      id: `recommendation-${Date.now()}`,
      schema: "outilsia.recommendation_run.v2",
      protocol: RECOMMENDATION_ENGINE_PROTOCOL,
      created_at_ms: Date.now(),
      profile: profileKey,
      profile_label: profile.label,
      prompt,
      candidate_refs: candidates.map((item) => item.ref),
      machine: {
        name: state.scan.name || "Machine IA locale",
        gpu_name: state.scan.gpu_name || "",
        vram_gb: state.scan.vram_gb || 0,
        ram_gb: state.scan.ram_gb || 0,
        machine_key: state.scan.machine_key || ""
      },
      results
    };
    writeRecommendationRun(run);
    const decision = recommendationDecision(run);
    if (decision?.winner) state.benchmark = decision.winner;
    renderPreparePanel();
    renderReadinessPanel();
    renderFieldTestPanel();
    renderStrategyBridgePanel();
    finishOperationMonitor(decision?.winner ? "Recommandation mesurée" : "Comparaison sans gagnant");
    setStatus(decision?.verdict || "Aucun modèle validé", decision?.winner ? "ok" : "warn");
    return run;
  } finally {
    recommendationEngineBusy = false;
    renderPreparePanel();
    renderPrimaryAction();
  }
}

function clearArenaRun() {
  const ok = window.confirm("Vider le dernier run Arena automatique ?");
  if (!ok) return;
  writeLastArenaRun(null);
  renderArenaPanel();
  setStatus("Run Arena vidé", "ok");
}

function strategyArenaReadiness() {
  const scan = state.scan || {};
  const arenaRun = readLastArenaRun();
  const winners = arenaRun?.results?.length ? arenaWinners(arenaRun.results) : null;
  const recommendation = recommendationReportSnapshot();
  const installed = (scan.installed_models || []).map((model) => ({
    name: modelLabel(model),
    size_gb: model.size_gb || null,
    runtime: model.source || model.runtime || "ollama"
  }));
  const candidates = arenaCandidates().map((model, index) => ({
    name: modelTitle(model),
    ollama: actionableOllamaRef(model),
    role: arenaRole(model, index),
    reason: modelLine(model),
    actionable_text: Boolean(actionableOllamaRef(model)),
    source: actionableOllamaRef(model) ? "outilsia_ollama_text" : "outilsia_compatibility_only"
  }));
  const hasScan = Boolean(state.scan);
  const hasOllama = hasUsableOllamaRuntime(scan);
  const hasModel = installed.length > 0;
  const benchmark = successfulBenchmarkFor("qwen3:0.6b");
  const runtimeDriver = hardwareDoctorSnapshot(scan)?.runtime?.driver_intelligence || null;
  const hasBenchmark = Boolean(benchmark?.success);
  const preferred = preferredModelCommand(candidates.map((model) => ({
    name: model.name,
    ollama: model.ollama,
    use_case: model.role,
    reason: model.reason
  })).filter((model) => model.ollama));
  let status = "scan_required";
  let label = "scan requis";
  let next = "Scanner la machine avec OutilsIA avant d'ouvrir le mode local dans Strategy Arena.";
  if (hasScan && !hasOllama) {
    status = "ollama_required";
    label = "Ollama requis";
    next = "Installer Ollama Windows ou préparer Ollama dans WSL, puis relancer le scan.";
  } else if (hasScan && hasOllama && !hasModel) {
    status = "model_required";
    label = "modèle requis";
    next = "Installer un modèle local conseillé, par exemple qwen3:0.6b pour valider le flux.";
  } else if (hasScan && hasOllama && hasModel && !hasBenchmark) {
    status = "benchmark_recommended";
    label = "prêt à tester";
    next = "Lancer un benchmark OutilsIA pour indiquer à Strategy Arena quel modèle local est le plus fiable.";
  } else if (hasScan && hasOllama && hasModel && hasBenchmark) {
    status = "ready";
    label = "profil prêt";
    next = "Strategy Arena peut consommer ce profil local pour proposer un mode Local Quant, puis valider par backtest côté Strategy Arena.";
  }
  return {
    schema: "outilsia.strategy_arena_readiness.v1",
    contract_version: "2026-07-04",
    generated_at: new Date().toISOString(),
    status,
    label,
    next_action: next,
    import_file: "outilsia-strategy-arena-profile.json",
    source_app: {
      name: "OutilsIA Local Cockpit",
      role: "prepare_local_ai_runtime",
      public_download: "https://outilsia.fr/telecharger-scanner-ia-local"
    },
    allowed_use: [
      "select_local_model",
      "generate_strategy_draft_inside_strategy_arena",
      "explain_backtest_inside_strategy_arena",
      "critique_strategy_inside_strategy_arena",
      "document_strategy_inside_strategy_arena"
    ],
    runtime_recommended: defaultOllamaRuntime(),
    runtime_label: ollamaRuntimeLabel(scan),
    runtime_command_prefix: ollamaRuntimeCommandLabel(),
    recommended_model: recommendation?.winner?.model || preferred?.ref || winners?.compromise?.model || winners?.assistant?.model || winners?.fastest?.model || "",
    local_models_available_via_outilsia: installed.length > 0,
    bridge_summary: "Modèles locaux disponibles via OutilsIA; Strategy Arena consomme le profil et valide par compilation/backtest.",
    handoff_manifest: {
      file_name: "outilsia-strategy-arena-profile.json",
      producer: "OutilsIA Local Cockpit",
      consumer: "Strategy Arena",
      import_label: "Modèles locaux disponibles via OutilsIA",
      version: "2026-07-04",
      capabilities: {
        list_installed_models: true,
        list_candidate_models: true,
        expose_recommended_roles: true,
        expose_benchmark_proof: Boolean(benchmark?.success),
        expose_usage_recommendation: Boolean(recommendation?.winner),
        expose_model_autopilot_profile: Boolean(modelAutopilotSnapshot()?.active),
        expose_flight_recorder_summary_read_only: Boolean(flightRecorderSummary()),
        expose_upgrade_digital_twin_summary_read_only: Boolean(digitalTwinSummary()),
        expose_runtime_driver_intelligence_read_only: Boolean(runtimeDriver),
        expose_local_capability_bridge_read_only: true,
        expose_runtime_command_prefix: true,
        install_or_delete_models_inside_strategy_arena: false,
        run_backtests_inside_outilsia: false
      }
    },
    strategy_arena_import: {
      mode: "Local Quant Mode",
      profile_kind: "outilsia_local_runtime_profile",
      expected_file: "outilsia-strategy-arena-profile.json",
      local_model_provider: "ollama",
      command_prefix: ollamaRuntimeCommandLabel(),
      display_label: "Modèles locaux disponibles via OutilsIA",
      can_generate_strategy_draft: status === "ready",
      must_validate_with_backtest: true,
      must_not_manage_ollama_installation: true,
      must_not_install_or_delete_models: true,
      suggested_next_step: next
    },
    strategy_arena_contract: {
      input_kind: "local_ai_runtime_profile",
      owner: "OutilsIA Local Cockpit",
      consumer: "Strategy Arena",
      handoff_rule: "OutilsIA prépare les modèles locaux; Strategy Arena les utilise pour workflows quant et valide par backtest.",
      no_trading_execution_in_outilsia: true,
      no_model_management_in_strategy_arena: true,
      required_strategy_arena_label: "Modèles locaux disponibles via OutilsIA"
    },
    separation_rules: {
      outilsia: "diagnostique, installe, teste et organise les modèles IA locaux",
      strategy_arena: "génère, backteste, optimise et valide les stratégies",
      forbidden_in_outilsia: ["generation_strategie", "backtest_financier", "optimisation_quant", "export_pine"],
      validation_rule: "Le modèle local propose; Strategy Arena compile, backteste, optimise et valide."
    },
    machine: {
      name: scan.name || "",
      machine_key: scan.machine_key || "",
      os: [scan.os_name, scan.os_version].filter(Boolean).join(" "),
      cpu: scan.cpu_name || "",
      cpu_cores: scan.cpu_cores || null,
      ram_gb: scan.ram_gb || null,
      gpu: scan.gpu_name || "",
      gpu_vendor: scan.gpu_vendor || "",
      vram_gb: scan.vram_gb || null,
      storage_free_gb: scan.storage_free_gb || null,
      gpu_readiness: scan.gpu_name
        ? "gpu_detected"
        : scan.vram_gb == null
          ? "gpu_unknown"
          : Number(scan.vram_gb) === 0
            ? "cpu_only_reported"
            : "gpu_detected_without_name"
    },
    runtimes: scan.runtimes || {},
    runtime_driver_intelligence: runtimeDriver ? {
      schema: runtimeDriver.schema,
      matrix_version: runtimeDriver.matrix_version,
      vendor: runtimeDriver.vendor,
      family: runtimeDriver.family,
      backend: runtimeDriver.backend,
      driver_status: runtimeDriver.driver.status,
      api_signal: runtimeDriver.api_signal,
      actual_execution: runtimeDriver.actual_execution,
      verdict: runtimeDriver.verdict,
      read_only: true
    } : null,
    installed_models: installed,
    candidate_models: candidates,
    best_models: {
      fastest: winners?.fastest ? {
        model: winners.fastest.model,
        tokens_per_second: winners.fastest.estimated_tokens_per_second || null,
        elapsed_ms: winners.fastest.elapsed_ms || null
      } : null,
      assistant: winners?.assistant ? {
        model: winners.assistant.model,
        score: winners.assistant.arena_profile_score ?? winners.assistant.arena_score ?? null,
        tokens_per_second: winners.assistant.estimated_tokens_per_second || null
      } : null,
      compromise: winners?.compromise ? {
        model: winners.compromise.model,
        score: winners.compromise.arena_profile_score ?? winners.compromise.arena_score ?? null,
        tokens_per_second: winners.compromise.estimated_tokens_per_second || null
      } : null
    },
    arena_proof: arenaRun ? {
      protocol: arenaRun.protocol || "legacy_estimate",
      objective: arenaRun.protocol === ARENA_OBJECTIVE_PROTOCOL,
      model_count: arenaRun.results?.length || 0,
      results: (arenaRun.results || []).map((item) => ({
        model: item.model,
        success: Boolean(item.success),
        objective_score: item.arena_objective?.score ?? null,
        objective_checks: item.arena_objective ? `${item.arena_objective.passed_count}/${item.arena_objective.total_count}` : null,
        tokens_per_second: item.estimated_tokens_per_second || null
      }))
    } : null,
    recommendation_engine: recommendation ? {
      protocol: recommendation.protocol,
      profile: recommendation.profile,
      profile_label: recommendation.profile_label,
      verdict: recommendation.verdict,
      confidence: recommendation.confidence,
      winner: recommendation.winner,
      candidate_refs: recommendation.candidate_refs,
      results: recommendation.results
    } : null,
    model_autopilot: modelAutopilotSnapshot(),
    flight_recorder: flightRecorderSummary(),
    upgrade_digital_twin: digitalTwinSummary(),
    capability_passport: capabilityPassportSummary(),
    local_capability_bridge: localCapabilityBridgeSummary(),
    recommended_roles: {
      fastest: winners?.fastest?.model || "",
      assistant: winners?.assistant?.model || "",
      code: winners?.code?.model || "",
      memory: winners?.memory?.model || "",
      french: winners?.french?.model || "",
      quality: winners?.quality?.model || "",
      compromise: winners?.compromise?.model || ""
    },
    benchmark: benchmark ? {
      model: benchmark.model,
      success: benchmark.success,
      elapsed_ms: benchmark.elapsed_ms,
      estimated_tokens_per_second: benchmark.estimated_tokens_per_second,
      created_at_ms: benchmark.created_at_ms
    } : null
  };
}

function renderStrategyBridgePanel() {
  if (!els.strategyBridgeBox) return;
  const profile = strategyArenaReadiness();
  if (!state.scan) {
    els.strategyBridgeState.textContent = "scan requis";
    els.strategyBridgeBox.className = "strategy-bridge-box empty";
    els.strategyBridgeBox.textContent = "Scanne la machine pour préparer un profil local lisible par Strategy Arena.";
    els.copyStrategyBridgeJsonBtn.disabled = true;
    if (els.downloadStrategyBridgeJsonBtn) els.downloadStrategyBridgeJsonBtn.disabled = true;
    els.copyStrategyBridgeMdBtn.disabled = true;
    return;
  }
  els.strategyBridgeState.textContent = profile.label;
  els.strategyBridgeBox.className = "strategy-bridge-box";
  els.strategyBridgeBox.innerHTML = `
    <div class="bridge-summary">
      <strong>${escapeHtml(profile.label)} - ${escapeHtml(profile.machine.gpu || "GPU non détecté")}</strong>
      <span>${escapeHtml(formatVram(profile.machine.vram_gb))} - ${escapeHtml(profile.machine.ram_gb || 0)} Go RAM - ${escapeHtml(profile.runtime_label)}</span>
      <span>${escapeHtml(profile.installed_models.length)} modèle(s) installé(s), ${escapeHtml(profile.candidate_models.length)} candidat(s) OutilsIA.</span>
      <span>${escapeHtml(profile.next_action)}</span>
      <span>Commande modèle : ${escapeHtml(profile.runtime_command_prefix)} run &lt;modele&gt;</span>
      ${profile.model_autopilot?.active ? `<span>Profil Ollama : ${escapeHtml(profile.model_autopilot.active.label)} · ${escapeHtml(modelAutopilotTuningLabel(profile.model_autopilot.active.tuning))}</span>` : ""}
      ${profile.flight_recorder?.comparison ? `<span>Flight Recorder : ${escapeHtml(profile.flight_recorder.comparison.headline)} · lecture seule</span>` : ""}
      ${profile.upgrade_digital_twin ? `<span>Upgrade Digital Twin : ${escapeHtml(profile.upgrade_digital_twin.decision.label)} · lecture seule</span>` : ""}
      <span>Passerelle locale : ${profile.local_capability_bridge?.running ? "active sur 127.0.0.1" : "désactivée"} · lecture seule</span>
    </div>
    <div class="bridge-rules">
      <span>OutilsIA prépare les modèles locaux.</span>
      <span>Strategy Arena exploite ce profil pour stratégies, backtests et CUDA.</span>
      <span>Aucun backtest ni génération de stratégie dans OutilsIA.</span>
    </div>
  `;
  els.copyStrategyBridgeJsonBtn.disabled = false;
  if (els.downloadStrategyBridgeJsonBtn) els.downloadStrategyBridgeJsonBtn.disabled = false;
  els.copyStrategyBridgeMdBtn.disabled = false;
}

function strategyBridgeMarkdown() {
  const profile = strategyArenaReadiness();
  return [
    "# Profil local pour Strategy Arena",
    "",
    `- Date: ${profile.generated_at}`,
    `- Statut: ${profile.label}`,
    `- Machine: ${profile.machine.name || "non scannée"}`,
    `- CPU: ${profile.machine.cpu || "non scanné"}`,
    `- RAM: ${profile.machine.ram_gb || "?"} Go`,
    `- GPU: ${profile.machine.gpu || "non détecté"}`,
    `- VRAM: ${profile.machine.vram_gb || "?"} Go`,
    `- Runtime IA: ${profile.runtime_label}`,
    `- Runtime/driver: ${profile.runtime_driver_intelligence ? `${profile.runtime_driver_intelligence.verdict.label} · backend ${profile.runtime_driver_intelligence.backend.label} · matrice ${profile.runtime_driver_intelligence.matrix_version} · lecture seule` : "non évalué"}`,
    `- Préfixe commande: ${profile.runtime_command_prefix}`,
    `- Import Strategy Arena: ${profile.handoff_manifest?.import_label || "Modèles locaux disponibles via OutilsIA"}`,
    `- Fichier attendu: ${profile.handoff_manifest?.file_name || profile.import_file}`,
    `- Résumé: ${profile.bridge_summary}`,
    `- AI Capability Passport: ${profile.capability_passport ? `${profile.capability_passport.schema} · SHA-256 ${profile.capability_passport.digest}` : "non généré"}`,
    `- Passerelle locale: ${profile.local_capability_bridge?.running ? "active sur 127.0.0.1 · lecture seule" : "désactivée par défaut"}`,
    `- Model Autopilot: ${profile.model_autopilot?.active ? `${profile.model_autopilot.active.label} · ${modelAutopilotTuningLabel(profile.model_autopilot.active.tuning)}` : "profil Ollama par défaut"}`,
    `- Flight Recorder: ${profile.flight_recorder?.comparison ? `${profile.flight_recorder.comparison.headline} · confiance ${profile.flight_recorder.comparison.confidence} · lecture seule` : "aucune référence"}`,
    `- Upgrade Digital Twin: ${profile.upgrade_digital_twin ? `${profile.upgrade_digital_twin.decision.label} · compatibilité ${profile.upgrade_digital_twin.compatibility.status} · lecture seule` : "aucun scénario"}`,
    "",
    "## Modèles installés",
    "",
    ...(profile.installed_models.length
      ? profile.installed_models.map((model) => `- ${model.name}${model.size_gb ? ` (${model.size_gb} Go)` : ""}`)
      : ["- Aucun modèle installé détecté."]),
    "",
    "## Candidats OutilsIA",
    "",
    ...(profile.candidate_models.length
      ? profile.candidate_models.map((model) => `- ${model.name} (${model.role}): ${model.ollama || "commande absente"}`)
      : ["- Aucun candidat."]),
    "",
    "## Rôles recommandés",
    "",
    `- Plus rapide: ${profile.recommended_roles.fastest || "à tester"}`,
    `- Assistant: ${profile.recommended_roles.assistant || "à tester"}`,
    `- Code: ${profile.recommended_roles.code || "à tester"}`,
    `- Mémoire: ${profile.recommended_roles.memory || "à tester"}`,
    `- Français: ${profile.recommended_roles.french || "à tester"}`,
    `- Qualité: ${profile.recommended_roles.quality || "à tester"}`,
    `- Compromis: ${profile.recommended_roles.compromise || "à tester"}`,
    "",
    "## Dernier benchmark",
    "",
    profile.benchmark
      ? `- ${profile.benchmark.model}: ${profile.benchmark.estimated_tokens_per_second} tok/s, ${profile.benchmark.elapsed_ms} ms`
      : "- Aucun benchmark lancé.",
    "",
    "## Séparation produit",
    "",
    "- OutilsIA diagnostique, installe, teste et organise les modèles IA locaux.",
    "- Strategy Arena génère, backteste, optimise et valide les stratégies.",
    "- OutilsIA ne génère pas et ne backteste pas de stratégies financières.",
    "- Strategy Arena ne gère pas l'installation, la suppression ou le benchmark généraliste des modèles.",
    `- Règle de validation: ${profile.separation_rules.validation_rule}`,
    "",
    "## Capacités exposées",
    "",
    `- Modèles installés: ${profile.handoff_manifest?.capabilities?.list_installed_models ? "oui" : "non"}`,
    `- Modèles candidats: ${profile.handoff_manifest?.capabilities?.list_candidate_models ? "oui" : "non"}`,
    `- Rôles recommandés: ${profile.handoff_manifest?.capabilities?.expose_recommended_roles ? "oui" : "non"}`,
    `- Preuve benchmark: ${profile.handoff_manifest?.capabilities?.expose_benchmark_proof ? "oui" : "non"}`,
    `- Profil Model Autopilot: ${profile.handoff_manifest?.capabilities?.expose_model_autopilot_profile ? "oui" : "non"}`,
    `- Gestion modèles dans Strategy Arena: ${profile.handoff_manifest?.capabilities?.install_or_delete_models_inside_strategy_arena ? "oui" : "non"}`,
    `- Backtests dans OutilsIA: ${profile.handoff_manifest?.capabilities?.run_backtests_inside_outilsia ? "oui" : "non"}`,
    "",
    "## Prochaine action",
    "",
    `- ${profile.next_action}`
  ].join("\n");
}

function stableCanonicalValue(value) {
  if (Array.isArray(value)) return value.map(stableCanonicalValue);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableCanonicalValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(stableCanonicalValue(value));
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 indisponible dans ce runtime");
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function capabilityPassportSourceRevision() {
  const proof = releaseProof();
  const benchmark = readBenchmarkHistory()[0] || state.benchmark || {};
  const recommendation = readRecommendationRun() || {};
  const arena = readLastArenaRun() || {};
  return [
    state.scan?.machine_key || "unscanned",
    proof.app_version || "",
    proof.build_id || "",
    benchmark.created_at_ms || 0,
    benchmark.model || "",
    canonicalJson(modelAutopilotSnapshot() || {}),
    canonicalJson(flightRecorderSummary() || {}),
    canonicalJson(digitalTwinSummary() || {}),
    canonicalJson(privateWorkloadPackSummary() || {}),
    canonicalJson(installSafetyPreflightSummary() || {}),
    recommendation.created_at_ms || recommendation.id || "",
    arena.created_at_ms || arena.id || "",
    (state.scan?.installed_models || []).map(modelLabel).sort().join(","),
    canonicalJson({
      gpu: state.scan?.raw_scan?.gpu_probe || {},
      memory: state.scan?.raw_scan?.memory_probe || {},
      motherboard: state.scan?.raw_scan?.motherboard_probe || {},
      runtimes: state.scan?.runtimes || {}
    })
  ].join("|");
}

function capabilityPassportIsCurrent(passport = state.capabilityPassport) {
  return Boolean(
    passport
    && passport.schema === "outilsia.ai_capability_passport.v1"
    && passport.source_revision === capabilityPassportSourceRevision()
    && passport.binding?.machine_key === (state.scan?.machine_key || "")
  );
}

function capabilityPassportSummary(passport = state.capabilityPassport) {
  if (!capabilityPassportIsCurrent(passport)) return null;
  return {
    schema: passport.schema,
    passport_version: passport.passport_version,
    generated_at: passport.generated_at,
    machine_key: passport.binding.machine_key,
    app_version: passport.binding.app_version,
    build_id: passport.binding.build_id,
    doctor_score: passport.hardware_doctor?.score ?? null,
    runtime_status: passport.runtime_readiness?.key || "untested",
    upgrade_digital_twin_decision: passport.upgrade_digital_twin?.decision?.key || "not_simulated",
    install_safety_preflight_verdict: passport.install_safety_preflight?.verdict || "not_run",
    digest_algorithm: passport.integrity?.algorithm || "",
    digest: passport.integrity?.digest || "",
    identity_signature: false,
    verified: true
  };
}

function capabilityPassportDocument() {
  if (!state.scan) throw new Error("Scan requis avant création du passeport");
  const proof = releaseProof();
  const scan = state.scan;
  const report = readinessReport();
  const doctor = hardwareDoctorSnapshot(scan);
  const bridge = strategyArenaReadiness();
  const history = readBenchmarkHistory();
  const successful = history.filter((item) => item?.success).slice(0, 12);
  const runtimeEvidence = doctorRuntimeEvidence(scan, report.test_model || "qwen3:0.6b");
  const memorySource = scan.ram_gb == null ? "not_detected" : scan.raw_scan?.memory_probe?.source || "scan";
  const gpuSource = scan.vram_gb == null ? "not_detected" : scan.raw_scan?.gpu_probe?.source || "scan";
  const storageSource = scan.storage_free_gb == null ? "not_detected" : "scan";
  return {
    schema: "outilsia.ai_capability_passport.v1",
    passport_version: "1.3.0",
    generated_at: new Date().toISOString(),
    source_revision: capabilityPassportSourceRevision(),
    issuer: {
      name: "OutilsIA Local Cockpit",
      url: "https://outilsia.fr/telecharger-scanner-ia-local",
      role: "local_ai_capability_assessment"
    },
    binding: {
      machine_key: scan.machine_key || "",
      app_version: proof.app_version || "0.1.1",
      build_id: proof.build_id || "unknown-build",
      source_commit: proof.source_commit || "",
      os: [scan.os_name, scan.os_version].filter(Boolean).join(" ")
    },
    machine: {
      cpu: scan.cpu_name || "non détecté",
      cpu_cores: numberOrNull(scan.cpu_cores),
      ram_gb: numberOrNull(scan.ram_gb),
      gpu: gpuDisplayLabel(scan),
      gpu_vendor: scan.gpu_vendor || "",
      vram_gb: numberOrNull(scan.vram_gb),
      unified_memory: Boolean(scan.unified_memory),
      storage_free_gb: numberOrNull(scan.storage_free_gb)
    },
    machine_provenance: {
      ram_gb: memorySource,
      vram_gb: gpuSource,
      storage_free_gb: storageSource
    },
    hardware_doctor: doctor,
    runtime_readiness: {
      ...report.runtime_readiness,
      evidence: runtimeEvidence
    },
    capabilities: {
      scan_hardware: true,
      detect_windows_ollama: Boolean(scan.runtimes?.ollama?.installed),
      detect_wsl: Boolean(scan.runtimes?.wsl?.installed),
      detect_wsl_ollama: Boolean(scan.runtimes?.ollama_wsl?.installed || scan.runtimes?.wsl?.ollama_ready),
      manage_ollama_models: hasUsableOllamaRuntime(scan),
      run_local_benchmark: hasUsableOllamaRuntime(scan),
      run_local_dialogue: hasUsableOllamaRuntime(scan),
      gpu_allocation_proven: runtimeEvidence.status === "gpu-proven" || runtimeEvidence.status === "hybrid-proven",
      hardware_doctor_v2: doctor?.schema === "outilsia.hardware_doctor.v2",
      runtime_driver_intelligence_v1: doctor?.runtime?.driver_intelligence?.schema === "outilsia.runtime_driver_intelligence.v1",
      recommendation_engine_v2: Boolean(report.recommendation_engine?.winner),
      model_autopilot_v1: Boolean(report.model_autopilot?.active || report.model_autopilot?.recommended),
      flight_recorder_v1: Boolean(report.flight_recorder?.reference),
      upgrade_digital_twin_v1: Boolean(report.upgrade_digital_twin),
      private_workload_packs_v1: true,
      local_capability_bridge_v1: true,
      install_safety_preflight_v1: true,
      local_arena: Boolean(report.arena),
      strategy_arena_profile_export: true
    },
    installed_models: (scan.installed_models || []).map((model) => ({
      ref: modelLabel(model),
      size_gb: model.size_gb == null ? null : Number(model.size_gb),
      runtime: model.source || model.runtime || "ollama"
    })),
    benchmark_proofs: successful.map((item) => ({
      model: item.model,
      measured_at_ms: Number(item.created_at_ms || 0),
      execution_mode: item.execution_mode || "auto",
      measurement_source: item.measurement_source || "legacy_history",
      tokens_per_second: Number(item.estimated_tokens_per_second || 0),
      elapsed_ms: Number(item.elapsed_ms || 0),
      runtime_processor: item.runtime_processor || "unknown",
      gpu_offload_percent: Number(item.runtime_gpu_offload_percent || 0),
      runtime_evidence_source: item.runtime_evidence_source || "",
      autopilot_profile: item.autopilot_active_profile || item.autopilot_profile || "",
      tuning: item.tuning || null
    })),
    recommendation: {
      usage_profile: report.usage_profile,
      recommended_model: report.recommended_model,
      engine: report.recommendation_engine,
      upgrade: report.upgrades?.[0] || null
    },
    model_autopilot: report.model_autopilot,
    flight_recorder: report.flight_recorder,
    upgrade_digital_twin: report.upgrade_digital_twin,
    private_workload_pack: report.private_workload_pack,
    install_safety_preflight: report.install_safety_preflight,
    arena: report.arena,
    strategy_arena_handoff: {
      schema: bridge.schema,
      status: bridge.status,
      recommended_model: bridge.recommended_model,
      recommended_roles: bridge.recommended_roles,
      boundary: bridge.separation_rules
    },
    interoperability: {
      local_capability_bridge: localCapabilityBridgePolicy(),
      default_state: "disabled",
      consent_required: true,
      snapshot_only: true,
      mutating_commands_exposed: false
    },
    privacy: {
      local_generation: true,
      excludes_account_tokens: true,
      excludes_prompt_and_model_outputs: true,
      excludes_private_workload_prompts: true,
      excludes_private_workload_outputs: true,
      excludes_personal_files: true,
      excludes_ollama_storage_path: true,
      machine_key_is_local_pseudonymous_identifier: true
    },
    limitations: [
      "Le diagnostic décrit les signaux exposés au moment du scan et du benchmark ; il ne certifie pas la stabilité sous charge longue.",
      "La fréquence et le canal mémoire peuvent être estimés selon les informations fournies par le système.",
      "La preuve d'offload GPU dépend de la disponibilité de l'API Ollama /api/ps après le benchmark.",
      "Model Autopilot compare des réglages d'exécution sur le même modèle ; il ne mesure pas une nouvelle quantification et n'améliore pas les poids du modèle.",
      "Flight Recorder compare des mesures locales liées à une référence explicite ; ses causes possibles restent des hypothèses et ne constituent pas une preuve terrain physique.",
      "Upgrade Digital Twin simule des scénarios ; alimentation, connecteurs, dimensions, slots et QVL doivent être vérifiés physiquement avant achat.",
      "Tests privés compare des sorties avec des critères déterministes bornés ; les prompts et réponses bruts ne sont pas inclus dans le Passport.",
      "Install Safety Preflight estime le budget du modèle et mesure l'espace du volume Ollama sans exporter son chemin ; il ne prédit pas la vitesse ni l'offload GPU.",
      "La passerelle locale est désactivée par défaut, liée à 127.0.0.1, bornée dans le temps et strictement en lecture seule ; son jeton éphémère n'est pas inclus dans ce Passport.",
      "L'empreinte SHA-256 détecte une modification du document ; elle ne prouve ni l'identité du PC ni celle du propriétaire.",
      "Ce passeport ne constitue pas une validation de stratégie financière ni un résultat de backtest."
    ]
  };
}

async function verifyCapabilityPassportIntegrity(passport) {
  if (!passport?.integrity?.digest) return false;
  const unsigned = JSON.parse(JSON.stringify(passport));
  delete unsigned.integrity;
  const digest = await sha256Hex(unsigned);
  return digest === passport.integrity.digest;
}

async function buildCapabilityPassport() {
  const passport = capabilityPassportDocument();
  passport.integrity = {
    algorithm: "SHA-256",
    canonicalization: "recursive-key-sort-json-v1",
    scope: "canonical_document_without_integrity",
    digest: await sha256Hex(passport),
    identity_signature: false,
    statement: "Empreinte d'intégrité uniquement : elle ne prouve pas l'identité de la machine ou du propriétaire."
  };
  return passport;
}

function renderCapabilityPassportPanel() {
  if (!els.capabilityPassportBox) return;
  queueMicrotask(renderLocalCapabilityBridgePanel);
  const passport = capabilityPassportIsCurrent() ? state.capabilityPassport : null;
  els.generateCapabilityPassportBtn.disabled = !state.scan;
  els.copyCapabilityPassportBtn.disabled = !passport;
  els.downloadCapabilityPassportBtn.disabled = !passport;
  if (!state.scan) {
    els.capabilityPassportState.textContent = "scan requis";
    els.capabilityPassportBox.className = "capability-passport-box empty";
    els.capabilityPassportBox.textContent = "Scanne la machine pour créer un passeport portable de ses capacités IA locales.";
    return;
  }
  if (!passport) {
    els.capabilityPassportState.textContent = state.capabilityPassport ? "à régénérer" : "prêt à générer";
    els.capabilityPassportBox.className = "capability-passport-box empty";
    els.capabilityPassportBox.innerHTML = `
      <strong>${state.capabilityPassport ? "Les preuves locales ont changé." : "Le scan est prêt."}</strong>
      <span>Génère un JSON versionné après les benchmarks utiles. Aucun prompt, réponse de modèle ou jeton de compte n'y est inclus.</span>
    `;
    return;
  }
  const digest = passport.integrity.digest;
  els.capabilityPassportState.textContent = "intégrité vérifiée";
  els.capabilityPassportBox.className = "capability-passport-box";
  els.capabilityPassportBox.innerHTML = `
    <div class="passport-proof-grid">
      <div><span>Doctor</span><strong>${escapeHtml(passport.hardware_doctor?.score ?? "?")}/100</strong></div>
      <div><span>Runtime</span><strong>${escapeHtml(passport.runtime_readiness?.label || "à mesurer")}</strong></div>
      <div><span>Modèles</span><strong>${escapeHtml(passport.installed_models.length)} installé(s)</strong></div>
    </div>
    <div class="doctor-status-row">
      <span>SHA-256 ${escapeHtml(`${digest.slice(0, 16)}…${digest.slice(-8)}`)}</span>
      <span>Empreinte d'intégrité, pas signature d'identité.</span>
    </div>
  `;
}

async function generateCapabilityPassport() {
  if (!state.scan) {
    setStatus("Scan requis avant passeport IA", "warn");
    return null;
  }
  try {
    state.capabilityPassport = await buildCapabilityPassport();
    const verified = await verifyCapabilityPassportIntegrity(state.capabilityPassport);
    if (!verified) throw new Error("l'empreinte générée n'a pas pu être relue");
    renderCapabilityPassportPanel();
    renderReadinessPanel();
    setStatus("AI Capability Passport généré et vérifié", "ok");
    return state.capabilityPassport;
  } catch (error) {
    invalidateCapabilityPassport();
    renderCapabilityPassportPanel();
    setStatus(`Passeport impossible : ${error}`, "error");
    return null;
  }
}

async function copyCapabilityPassport() {
  if (!capabilityPassportIsCurrent()) {
    setStatus("Génère d'abord un passeport à jour", "warn");
    return;
  }
  await navigator.clipboard.writeText(`${JSON.stringify(state.capabilityPassport, null, 2)}\n`);
  setStatus("AI Capability Passport copié", "ok");
}

function downloadCapabilityPassport() {
  if (!capabilityPassportIsCurrent()) {
    setStatus("Génère d'abord un passeport à jour", "warn");
    return;
  }
  const blob = new Blob([`${JSON.stringify(state.capabilityPassport, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `outilsia-ai-capability-passport-${state.scan.machine_key || "local"}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("AI Capability Passport téléchargé", "ok");
}

function capabilityPassportMarkdown(passport = state.capabilityPassport) {
  const summary = capabilityPassportSummary(passport);
  if (!summary) return "## AI Capability Passport\n\n- Non généré ou à régénérer après les dernières mesures.";
  return [
    "## AI Capability Passport",
    "",
    `- Schéma: ${summary.schema}`,
    `- Généré: ${summary.generated_at}`,
    `- Doctor: ${summary.doctor_score}/100`,
    `- Runtime: ${summary.runtime_status}`,
    `- Build: ${summary.build_id}`,
    `- SHA-256: ${summary.digest}`,
    `- Upgrade Digital Twin: ${passport.upgrade_digital_twin?.decision?.label || "aucun scénario"}`,
    "- Portée: intégrité du document uniquement, pas signature d'identité."
  ].join("\n");
}

function invalidateCapabilityPassport() {
  const bridgeWasRunning = localCapabilityBridgeIsRunning();
  state.capabilityPassport = null;
  state.localCapabilityBridge = null;
  if (bridgeWasRunning && invoke) {
    void invoke("stop_local_capability_bridge").catch(() => {});
  }
}

function localCapabilityBridgePolicy() {
  return {
    schema: LOCAL_CAPABILITY_BRIDGE_SCHEMA,
    contract_version: LOCAL_CAPABILITY_BRIDGE_CONTRACT_VERSION,
    enabled_by_default: false,
    bind: "127.0.0.1",
    read_only: true,
    authentication: "ephemeral_bearer_token",
    ttl_seconds: LOCAL_CAPABILITY_BRIDGE_TTL_SECONDS,
    max_ttl_seconds: 30 * 60,
    token_persisted: false,
    allowed_origins: [
      "https://strategyarena.io",
      "https://www.strategyarena.io",
      "http://localhost:<port>",
      "http://127.0.0.1:<port>"
    ],
    endpoints: [
      "/v1/health",
      "/v1/capabilities",
      "/v1/passport",
      "/v1/models",
      "/v1/strategy-arena"
    ]
  };
}

function localCapabilityBridgeIsRunning(runtime = state.localCapabilityBridge) {
  return Boolean(runtime?.running && Number(runtime.expires_at_ms || 0) > Date.now());
}

function localCapabilityBridgeSummary(runtime = state.localCapabilityBridge) {
  const policy = localCapabilityBridgePolicy();
  const running = localCapabilityBridgeIsRunning(runtime);
  return {
    schema: policy.schema,
    contract_version: policy.contract_version,
    supported: Boolean(invoke),
    enabled_by_default: false,
    running,
    bind: policy.bind,
    base_url: running ? runtime.base_url || "" : "",
    expires_at_ms: running ? Number(runtime.expires_at_ms || 0) : 0,
    read_only: true,
    token_persisted: false,
    token_exposed_in_summary: false,
    snapshot_passport_digest: running ? runtime.passport_digest || "" : "",
    endpoints: policy.endpoints
  };
}

function localCapabilityBridgeMarkdown(runtime = state.localCapabilityBridge) {
  const summary = localCapabilityBridgeSummary(runtime);
  return [
    "## Passerelle locale OutilsIA",
    "",
    `- Schéma: ${summary.schema}`,
    `- État: ${summary.running ? "active" : "désactivée"}`,
    "- Liaison: 127.0.0.1 uniquement",
    "- Accès: lecture seule avec jeton Bearer éphémère",
    "- Durée: 15 minutes par défaut, 30 minutes maximum",
    "- Jeton stocké sur disque: non",
    "- Prompt ou réponse brute exposé: non",
    "- Installation/suppression de modèle: non",
    "- Benchmark, backtest ou trading: non",
    summary.running && summary.snapshot_passport_digest
      ? `- Passport servi: SHA-256 ${summary.snapshot_passport_digest}`
      : "- Passport servi: aucun instantané actif"
  ].join("\n");
}

function localCapabilityBridgePayload() {
  if (!capabilityPassportIsCurrent()) throw new Error("AI Capability Passport à jour requis");
  const passport = state.capabilityPassport;
  const report = readinessReport();
  const strategy = strategyArenaReadiness();
  const winner = report.recommendation_engine?.winner || null;
  return {
    schema: LOCAL_CAPABILITY_BRIDGE_SCHEMA,
    contract_version: LOCAL_CAPABILITY_BRIDGE_CONTRACT_VERSION,
    generated_at: new Date().toISOString(),
    read_only: true,
    producer: {
      name: "OutilsIA Local Cockpit",
      role: "local_ai_capability_provider",
      app_version: passport.binding?.app_version || "",
      build_id: passport.binding?.build_id || ""
    },
    permissions: {
      read_capabilities: true,
      install_models: false,
      delete_models: false,
      run_benchmark: false,
      run_chat: false,
      access_personal_files: false,
      run_backtests: false,
      execute_trades: false,
      write_configuration: false
    },
    privacy: {
      local_only: true,
      ephemeral: true,
      raw_prompts_included: false,
      raw_model_outputs_included: false,
      account_tokens_included: false,
      token_persisted: false
    },
    passport,
    installed_models: passport.installed_models || [],
    benchmark_proofs: passport.benchmark_proofs || [],
    recommendation: {
      usage_profile: report.usage_profile?.key || "",
      recommended_model: winner?.model || report.recommended_model?.ref || strategy.recommended_model || "",
      confidence: report.recommendation_engine?.confidence || "",
      source: winner ? "recommendation_engine_v2" : "outilsia_compatibility"
    },
    strategy_arena: {
      schema: strategy.schema,
      status: strategy.status,
      read_only: true,
      recommended_model: strategy.recommended_model,
      recommended_roles: strategy.recommended_roles,
      import_label: strategy.handoff_manifest?.import_label || "Modèles locaux disponibles via OutilsIA",
      mode: strategy.strategy_arena_import?.mode || "Local Quant Mode",
      boundary: strategy.separation_rules
    }
  };
}

function localCapabilityBridgePairingDocument() {
  const runtime = state.localCapabilityBridge;
  if (!localCapabilityBridgeIsRunning(runtime) || !runtime?.token) {
    throw new Error("La connexion locale doit être redémarrée pour obtenir un nouveau jeton");
  }
  return {
    schema: "outilsia.local_capability_bridge_connection.v1",
    contract_version: LOCAL_CAPABILITY_BRIDGE_CONTRACT_VERSION,
    base_url: runtime.base_url,
    expires_at_ms: Number(runtime.expires_at_ms || 0),
    authorization: {
      scheme: "Bearer",
      token: runtime.token,
      header: `Authorization: Bearer ${runtime.token}`
    },
    endpoints: runtime.endpoints || localCapabilityBridgePolicy().endpoints,
    permissions: {
      read_only: true,
      model_management: false,
      benchmark_execution: false,
      file_access: false,
      backtests: false,
      trading_execution: false
    },
    warning: "Secret éphémère : ne pas publier. La passerelle s'arrête automatiquement à expiration."
  };
}

let localCapabilityBridgeStopPending = false;

function renderLocalCapabilityBridgePanel() {
  if (!els.localCapabilityBridgeBox) return;
  const runtime = state.localCapabilityBridge;
  const running = localCapabilityBridgeIsRunning(runtime);
  const passportCurrent = capabilityPassportIsCurrent();
  els.startLocalCapabilityBridgeBtn.disabled = !invoke || !passportCurrent || running;
  els.copyLocalCapabilityBridgeBtn.disabled = !running || !runtime?.token;
  els.refreshLocalCapabilityBridgeBtn.disabled = !invoke;
  els.stopLocalCapabilityBridgeBtn.disabled = !invoke || !running;

  if (running && !passportCurrent && !localCapabilityBridgeStopPending) {
    localCapabilityBridgeStopPending = true;
    void stopLocalCapabilityBridge(true).finally(() => {
      localCapabilityBridgeStopPending = false;
    });
    els.localCapabilityBridgeState.textContent = "arrêt sécurité";
    els.localCapabilityBridgeBox.className = "local-capability-bridge-box empty";
    els.localCapabilityBridgeBox.textContent = "Les preuves ont changé. La passerelle locale est arrêtée pour ne pas servir un Passport périmé.";
    return;
  }
  if (!invoke && !runtime?.test_mode) {
    els.localCapabilityBridgeState.textContent = "app native requise";
    els.localCapabilityBridgeBox.className = "local-capability-bridge-box empty";
    els.localCapabilityBridgeBox.textContent = "La passerelle loopback est disponible uniquement dans l'application Windows/Linux, jamais dans la page web.";
    return;
  }
  if (!state.scan) {
    els.localCapabilityBridgeState.textContent = "scan requis";
    els.localCapabilityBridgeBox.className = "local-capability-bridge-box empty";
    els.localCapabilityBridgeBox.textContent = "Scanne la machine puis génère son AI Capability Passport.";
    return;
  }
  if (!passportCurrent && !running) {
    els.localCapabilityBridgeState.textContent = "Passport requis";
    els.localCapabilityBridgeBox.className = "local-capability-bridge-box empty";
    els.localCapabilityBridgeBox.textContent = "Génère un Passport à jour. Aucun serveur local ne démarre automatiquement.";
    return;
  }
  if (!running) {
    els.localCapabilityBridgeState.textContent = "désactivée";
    els.localCapabilityBridgeBox.className = "local-capability-bridge-box empty";
    els.localCapabilityBridgeBox.innerHTML = `
      <strong>Prête, mais arrêtée par défaut.</strong>
      <span>Un clic ouvre une API sur 127.0.0.1 pendant 15 minutes. Lecture seule, jeton éphémère, zéro persistance et aucune commande Ollama.</span>
    `;
    return;
  }
  const remainingMinutes = Math.max(1, Math.ceil((Number(runtime.expires_at_ms) - Date.now()) / 60_000));
  const digest = runtime.passport_digest || "";
  els.localCapabilityBridgeState.textContent = `active · ${remainingMinutes} min`;
  els.localCapabilityBridgeBox.className = "local-capability-bridge-box";
  els.localCapabilityBridgeBox.innerHTML = `
    <div class="local-bridge-summary">
      <strong>${escapeHtml(runtime.base_url || "127.0.0.1")}</strong>
      <span>Lecture seule · expiration automatique dans ${escapeHtml(remainingMinutes)} min</span>
      <span>Passport SHA-256 ${escapeHtml(digest ? `${digest.slice(0, 16)}…${digest.slice(-8)}` : "non affiché")}</span>
    </div>
    <div class="local-bridge-rules">
      <span>Jeton conservé uniquement en mémoire.</span>
      <span>Aucun prompt, résultat brut, fichier personnel ou jeton de compte exposé.</span>
      <span>Aucune installation, suppression, exécution de benchmark ou backtest disponible.</span>
    </div>
  `;
}

async function startLocalCapabilityBridge() {
  if (!invoke) {
    setStatus("Passerelle disponible uniquement dans l'app native", "warn");
    return null;
  }
  if (!capabilityPassportIsCurrent()) {
    setStatus("Génère d'abord un AI Capability Passport à jour", "warn");
    return null;
  }
  const confirmed = window.confirm(
    "Ouvrir pendant 15 minutes une API locale en lecture seule sur 127.0.0.1 ? Aucun modèle, fichier ou réglage ne pourra être modifié."
  );
  if (!confirmed) return null;
  try {
    const payload = localCapabilityBridgePayload();
    const result = await invoke("start_local_capability_bridge", {
      request: { payload, ttl_seconds: LOCAL_CAPABILITY_BRIDGE_TTL_SECONDS }
    });
    if (result?.schema !== LOCAL_CAPABILITY_BRIDGE_SCHEMA || !result?.running || !result?.token) {
      throw new Error("réponse native incomplète");
    }
    state.localCapabilityBridge = {
      ...result,
      passport_digest: state.capabilityPassport.integrity.digest,
      token_persisted: false
    };
    renderLocalCapabilityBridgePanel();
    renderStrategyBridgePanel();
    renderReadinessPanel();
    setStatus("Passerelle locale active pour 15 minutes", "ok");
    return state.localCapabilityBridge;
  } catch (error) {
    state.localCapabilityBridge = null;
    renderLocalCapabilityBridgePanel();
    setStatus(`Passerelle locale impossible : ${error}`, "error");
    return null;
  }
}

async function stopLocalCapabilityBridge(silent = false) {
  try {
    if (invoke) await invoke("stop_local_capability_bridge");
  } catch (error) {
    if (!silent) setStatus(`Arrêt passerelle incomplet : ${error}`, "error");
  } finally {
    state.localCapabilityBridge = null;
    renderLocalCapabilityBridgePanel();
    renderStrategyBridgePanel();
    renderReadinessPanel();
  }
  if (!silent) setStatus("Passerelle locale arrêtée", "ok");
}

async function refreshLocalCapabilityBridgeStatus(silent = false) {
  if (!invoke) return null;
  try {
    const status = await invoke("get_local_capability_bridge_status");
    if (!status?.running) {
      state.localCapabilityBridge = null;
    } else if (state.localCapabilityBridge) {
      state.localCapabilityBridge = { ...state.localCapabilityBridge, ...status };
    } else {
      state.localCapabilityBridge = { ...status, token: "", passport_digest: "" };
    }
    renderLocalCapabilityBridgePanel();
    if (!silent) setStatus(status?.running ? "Passerelle locale vérifiée" : "Passerelle locale arrêtée", "ok");
    return status;
  } catch (error) {
    if (!silent) setStatus(`Vérification locale impossible : ${error}`, "error");
    return null;
  }
}

async function copyLocalCapabilityBridgeConnection() {
  try {
    const pairing = localCapabilityBridgePairingDocument();
    await navigator.clipboard.writeText(`${JSON.stringify(pairing, null, 2)}\n`);
    setStatus("Connexion locale copiée · secret éphémère", "ok");
  } catch (error) {
    setStatus(String(error), "warn");
  }
}

async function copyStrategyBridgeJson() {
  if (!state.scan) {
    setStatus("Scan requis avant copie du profil Strategy Arena", "warn");
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify(strategyArenaReadiness(), null, 2));
  setStatus("Profil Strategy Arena JSON copié", "ok");
}

function downloadStrategyBridgeJson() {
  if (!state.scan) {
    setStatus("Scan requis avant téléchargement du profil Strategy Arena", "warn");
    return;
  }
  const profile = strategyArenaReadiness();
  const blob = new Blob([JSON.stringify(profile, null, 2) + "\n"], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = profile.import_file || "outilsia-strategy-arena-profile.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Profil Strategy Arena téléchargé", "ok");
}

async function copyStrategyBridgeMarkdown() {
  if (!state.scan) {
    setStatus("Scan requis avant copie du résumé Strategy Arena", "warn");
    return;
  }
  await navigator.clipboard.writeText(strategyBridgeMarkdown());
  setStatus("Résumé Strategy Arena copié", "ok");
}

function fieldTestProfile() {
  const scan = state.scan || {};
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  const models = extractModels(compatibility);
  const vram = Number(scan.vram_gb || 0);
  const ram = Number(scan.ram_gb || 0);
  const gpu = String(scan.gpu_name || "").toLowerCase();
  const installedCount = (scan.installed_models || []).length;
  const ollamaReady = hasUsableOllamaRuntime(scan);
  const benchmarkReady = Boolean(successfulBenchmarkFor("qwen3:0.6b"));
  let machineClass = "Machine à scanner";
  let verdict = "Scanne la machine pour obtenir un plan d'essai.";
  if (state.scan) {
    if (gpu.includes("1080 ti") || gpu.includes("1080ti")) {
      machineClass = "Vieux GPU intéressant";
      verdict = "GTX 1080 Ti : très bon cas de test terrain. Vise d'abord les petits modèles et compare CPU/GPU selon Ollama.";
    } else if (vram >= 24) {
      machineClass = "Grosse VRAM";
      verdict = "Machine forte : teste le modèle léger, puis un modèle qualité/Hermes/Qwen plus ambitieux.";
    } else if (vram >= 12) {
      machineClass = "Bon PC IA locale";
      verdict = "Très bon ticket d'entrée : 12 Go VRAM ouvrent des modèles utiles sans acheter tout de suite.";
    } else if (vram > 0) {
      machineClass = "GPU limité mais utile";
      verdict = "GPU détecté mais VRAM limitée : commence léger, évite les gros modèles, regarde si RAM/SSD suffisent.";
    } else if (ram >= 32) {
      machineClass = "CPU/RAM à tester";
      verdict = "Pas de GPU exploitable détecté, mais assez de RAM pour tester des modèles légers en local.";
    } else {
      machineClass = "Machine débutant";
      verdict = "Commence par le modèle test. Si ça rame, le diagnostic dira quel composant bloque vraiment.";
    }
  }
  const nextActions = [];
  if (!state.scan) nextActions.push("Scanner ce PC.");
  else if (!ollamaReady) nextActions.push("Installer Ollama Windows ou préparer Ollama dans WSL, puis relancer le scan.");
  else if (!installedCount) nextActions.push("Installer qwen3:0.6b pour valider le flux local.");
  else if (!benchmarkReady) nextActions.push("Lancer un benchmark court sur le modèle installé.");
  else nextActions.push("Comparer un modèle recommandé avec le modèle test dans Arena locale.");
  const preferred = preferredModelCommand(models);
  if (preferred?.ref) {
    nextActions.push(`${preferred.benchmarked ? "Retester" : "Tester"} le modèle recommandé : ${preferred.ref}.`);
  }
  nextActions.push("Copier le rapport Arena ou sauvegarder la machine dans le compte.");
  return {
    machineClass,
    verdict,
    nextActions: nextActions.slice(0, 3),
    ollamaReady,
    installedCount,
    benchmarkReady,
    modelCount: models.length
  };
}

function inferFieldTestProfile(scan = state.scan || {}) {
  const gpu = String(scan.gpu_name || "").toLowerCase();
  const cpu = String(scan.cpu_name || "").toLowerCase();
  const os = String(`${scan.os_name || ""} ${scan.os_version || ""}`).toLowerCase();
  const vram = Number(scan.vram_gb || 0);
  const ram = Number(scan.ram_gb || 0);
  if (!vram || gpu.includes("cpu only") || gpu.includes("aucun")) return "cpu_only";
  if (gpu.includes("1080 ti") || gpu.includes("1080ti")) return "core_i7_gtx_1080_ti";
  if (gpu.includes("3060") && vram >= 10 && vram <= 13) return "rtx_3060_12gb";
  if (gpu.includes("4080") || gpu.includes("4090")) return "rtx_4080_4090";
  if (os.includes("laptop") || cpu.includes("mobile") || gpu.includes("laptop") || vram <= 6 || ram <= 16) return "old_laptop";
  if (vram >= 16) return "rtx_4080_4090";
  if (vram >= 10) return "rtx_3060_12gb";
  return "old_laptop";
}

const FIELD_TEST_PROFILE_LABELS = {
  auto: "Auto selon le scan",
  old_laptop: "Vieux laptop / portable modeste",
  core_i7_gtx_1080_ti: "Core i7 + GTX 1080 Ti 11 Go",
  rtx_3060_12gb: "RTX 3060 12 Go",
  rtx_4080_4090: "RTX 4080 / RTX 4090",
  cpu_only: "Machine CPU-only"
};

function selectedFieldTestProfile() {
  const value = els.fieldTestProfileSelect?.value || localStorage.getItem(FIELD_TEST_PROFILE_KEY) || "auto";
  return FIELD_TEST_PROFILE_LABELS[value] ? value : "auto";
}

function effectiveFieldTestProfile(scan = state.scan || {}) {
  const selected = selectedFieldTestProfile();
  const inferred = inferFieldTestProfile(scan);
  return {
    selected,
    inferred,
    profile: selected === "auto" ? inferred : selected,
    source: selected === "auto" ? "auto" : "manual",
    label: FIELD_TEST_PROFILE_LABELS[selected === "auto" ? inferred : selected] || "Profil terrain"
  };
}

function setFieldTestProfile(value = "auto") {
  const next = FIELD_TEST_PROFILE_LABELS[value] ? value : "auto";
  if (els.fieldTestProfileSelect) els.fieldTestProfileSelect.value = next;
  localStorage.setItem(FIELD_TEST_PROFILE_KEY, next);
  renderFieldTestPanel();
  return effectiveFieldTestProfile();
}

function fieldTestFirst30sProof({ scan = {}, report = {}, action = {}, profile = {}, benchmark = null, upgrade = null } = {}) {
  const model = report.recommended_model?.ref || report.models?.[0]?.title || report.test_model || "";
  const doctor = report.hardware_doctor || hardwareDoctorSnapshot(scan);
  const firstAction = action.label || profile.nextActions?.[0] || "";
  const hardwareVisible = Boolean(
    scan.cpu_name &&
    Number(scan.ram_gb || 0) > 0 &&
    (scan.gpu_name || scan.vram_gb != null)
  );
  const scoreVisible = report.score !== null && report.score !== undefined && Number.isFinite(Number(report.score));
  const benchmarkProof = Boolean(benchmark?.success && Number(benchmark?.estimated_tokens_per_second || 0) > 0);
  const benchmarkCta = /bench|test|tester|lancer/i.test(firstAction);
  const upgradeTitle = upgrade?.title || "Aucun achat prioritaire avant benchmark terrain complet";
  return {
    hardware_visible: hardwareVisible,
    score_visible: scoreVisible,
    recommended_model_visible: Boolean(model),
    benchmark_cta_or_proof_visible: benchmarkProof || benchmarkCta,
    upgrade_visible: Boolean(upgradeTitle),
    summary: [
      hardwareVisible ? `${scan.gpu_name || "GPU"} · ${formatVram(scan.vram_gb)} · ${Number(scan.ram_gb || 0)} Go RAM` : "matériel à confirmer",
      scoreVisible ? `score ${Number(report.score)}/100` : "score absent",
      model ? `modèle ${model}` : "modèle absent",
      benchmarkProof ? `preuve ${benchmark.model || "benchmark"} à ${Number(benchmark.estimated_tokens_per_second || 0).toFixed(1)} tok/s (${benchmarkExecutionLabel(benchmark)})` : "benchmark à lancer",
      doctor ? `doctor ${doctor.score}/100` : "doctor absent",
      `upgrade: ${upgradeTitle}`
    ].join(" | ")
  };
}

function fieldTestMachineEntry() {
  const scan = state.scan || {};
  const report = readinessReport();
  const action = primaryActionState();
  const profile = fieldTestProfile();
  const fieldProfile = effectiveFieldTestProfile(scan);
  const benchmark = report.benchmark || null;
  const promptForge = currentPromptForgeResult();
  const arena = readLastArenaRun();
  const successfulArena = (arena?.results || []).some((item) => item?.success);
  const objectiveArenaResults = (arena?.results || [])
    .filter((item) => item?.success && item?.arena_objective)
    .sort((a, b) => Number(b.arena_objective?.score || 0) - Number(a.arena_objective?.score || 0));
  const bestObjectiveArena = objectiveArenaResults[0] || null;
  const recommendation = report.recommendation_engine || null;
  const upgrade = report.upgrades[0];
  const doctor = report.hardware_doctor || hardwareDoctorSnapshot(scan);
  const passport = capabilityPassportSummary();
  const autopilot = report.model_autopilot || null;
  const flightRecorder = report.flight_recorder || null;
  const upgradeDigitalTwin = report.upgrade_digital_twin || null;
  const runtimeEvidence = report.runtime_readiness?.evidence || doctorRuntimeEvidence(scan, benchmark?.model || report.test_model || "qwen3:0.6b");
  const os = [scan.os_name, scan.os_version].filter(Boolean).join(" ").trim();
  return {
    profile: fieldProfile.profile,
    profile_source: fieldProfile.source,
    profile_inferred: fieldProfile.inferred,
    machine_label: scan.name || [scan.gpu_name, scan.cpu_name].filter(Boolean).join(" / ") || "Machine OutilsIA",
    os: os || "non renseigné",
    cpu: scan.cpu_name || "non renseigné",
    gpu: scan.gpu_name || (scan.vram_gb == null ? "GPU non déterminé" : Number(scan.vram_gb) > 0 ? "GPU détecté" : "CPU only / aucun GPU dédié"),
    ram_gb: numberOrNull(scan.ram_gb),
    vram_gb: numberOrNull(scan.vram_gb),
    hardware_provenance: {
      ram_gb: scan.ram_gb == null ? "not_detected" : scan.raw_scan?.memory_probe?.source || "scan",
      vram_gb: scan.vram_gb == null ? "not_detected" : scan.raw_scan?.gpu_probe?.source || "scan"
    },
    hardware_doctor: doctor ? {
      schema: doctor.schema || "outilsia.hardware_doctor.v1",
      score: doctor.score,
      headline: doctor.headline,
      summary: doctor.summary,
      ram_total_gb: doctor.ram.total_gb,
      ram_modules: doctor.ram.module_count,
      ram_type: doctor.ram.memory_type || "",
      ram_channel: doctor.ram.channel_mode,
      ram_clock: doctor.ram.effective_clock_label,
      ram_confidence: doctor.ram.confidence,
      gpu_confidence: doctor.gpu.confidence,
      gpu_driver: doctor.gpu.driver_version,
      cuda_driver_max: doctor.gpu.cuda_version,
      rocm_version: doctor.gpu.rocm_version,
      driver_url: doctor.gpu.driver_url,
      motherboard: doctor.motherboard?.label || "",
      motherboard_max_memory_gb: doctor.motherboard?.max_memory_gb || 0,
      motherboard_slots: doctor.motherboard?.memory_slots || 0,
      motherboard_bios: doctor.motherboard?.bios_version || "",
      temperature_c: doctor.gpu.temperature_c,
      pcie: doctor.gpu.pcie_link_width_current || doctor.gpu.pcie_link_width_max
        ? `x${doctor.gpu.pcie_link_width_current || "?"}/x${doctor.gpu.pcie_link_width_max || "?"}`
        : "",
      ollama_runtime: doctor.runtime.ollama,
      wsl_runtime: doctor.runtime.wsl,
      runtime_driver_intelligence: doctor.runtime?.driver_intelligence ? {
        schema: doctor.runtime.driver_intelligence.schema,
        matrix_version: doctor.runtime.driver_intelligence.matrix_version,
        vendor: doctor.runtime.driver_intelligence.vendor,
        family: doctor.runtime.driver_intelligence.family?.id || "",
        backend: doctor.runtime.driver_intelligence.backend?.recommended || "",
        ollama_support_tier: doctor.runtime.driver_intelligence.backend?.ollama_support_tier || "unknown",
        driver_status: doctor.runtime.driver_intelligence.driver?.status || "unknown",
        api_signal_status: doctor.runtime.driver_intelligence.api_signal?.status || "not_detected",
        actual_execution_status: doctor.runtime.driver_intelligence.actual_execution?.status || "untested",
        verdict: doctor.runtime.driver_intelligence.verdict?.key || "unknown",
        automatic_driver_install_supported: false
      } : null,
      first_action: doctor.actions[0] || ""
    } : null,
    capability_passport_ok: Boolean(passport),
    capability_passport_schema: passport?.schema || "",
    capability_passport_digest: passport?.digest || "",
    model_autopilot_ok: Boolean(autopilot?.active),
    model_autopilot_profile: autopilot?.active?.key || "",
    model_autopilot_num_ctx: Number(autopilot?.active?.tuning?.num_ctx || 0),
    model_autopilot_num_batch: Number(autopilot?.active?.tuning?.num_batch || 0),
    model_autopilot_num_thread: Number(autopilot?.active?.tuning?.num_thread || 0),
    flight_recorder_reference_ok: Boolean(flightRecorder?.reference),
    flight_recorder_overall: flightRecorder?.comparison?.overall || "not_measured",
    flight_recorder_comparable: Boolean(flightRecorder?.comparison?.comparable),
    flight_recorder_confidence: flightRecorder?.comparison?.confidence || "none",
    flight_recorder_physical_proof: false,
    upgrade_digital_twin_ok: Boolean(upgradeDigitalTwin),
    upgrade_digital_twin_decision: upgradeDigitalTwin?.decision?.key || "not_simulated",
    upgrade_digital_twin_compatibility: upgradeDigitalTwin?.compatibility?.status || "unknown",
    upgrade_digital_twin_confidence: upgradeDigitalTwin?.compatibility?.confidence || "none",
    upgrade_digital_twin_physical_proof: false,
    scan_ok: Boolean(state.scan),
    score: report.score === null ? 0 : Number(report.score),
    score_label: scoreLabel(report.score),
    runtime_readiness: report.runtime_readiness?.key || "untested",
    runtime_readiness_label: report.runtime_readiness?.label || "À mesurer",
    recommended_model: report.recommended_model?.ref || report.models[0]?.title || report.test_model || "",
    first_action: action.label || profile.nextActions[0] || "",
    upgrade_recommendation: upgrade?.title || "Aucun achat prioritaire avant benchmark terrain complet",
    benchmark_model: benchmark?.model || "",
    benchmark_tokens_per_second: Number(benchmark?.estimated_tokens_per_second || 0),
    benchmark_elapsed_ms: Number(benchmark?.elapsed_ms || 0),
    benchmark_execution_mode: benchmark?.execution_mode || "auto",
    benchmark_measurement_source: benchmark?.measurement_source || "legacy_history",
    benchmark_runtime_processor: benchmark?.runtime_processor || runtimeEvidence?.processor || "unknown",
    benchmark_gpu_offload_percent: Number(benchmark?.runtime_gpu_offload_percent || runtimeEvidence?.gpu_offload_percent || 0),
    benchmark_runtime_evidence_source: benchmark?.runtime_evidence_source || runtimeEvidence?.source || "",
    benchmark_runtime_model_size_bytes: Number(benchmark?.runtime_model_size_bytes || runtimeEvidence?.model_size_bytes || 0),
    benchmark_runtime_vram_bytes: Number(benchmark?.runtime_vram_bytes || runtimeEvidence?.vram_bytes || 0),
    benchmark_load_duration_ms: Number(benchmark?.load_duration_ms || 0),
    benchmark_prompt_tokens_per_second: Number(benchmark?.prompt_tokens_per_second || 0),
    benchmark_eval_duration_ms: Number(benchmark?.eval_duration_ms || 0),
    promptforge_ok: Boolean(promptForge?.optimized),
    dialogue_ok: Boolean(state.chatResult?.success && state.chatResult?.output_preview),
    arena_ok: Boolean(successfulArena),
    arena_protocol: arena?.protocol || "legacy_estimate",
    arena_objective: arena?.protocol === ARENA_OBJECTIVE_PROTOCOL,
    arena_objective_best_model: bestObjectiveArena?.model || "",
    arena_objective_best_score: Number(bestObjectiveArena?.arena_objective?.score || 0),
    arena_objective_best_checks: bestObjectiveArena ? `${bestObjectiveArena.arena_objective.passed_count}/${bestObjectiveArena.arena_objective.total_count}` : "",
    recommendation_engine_ok: Boolean(recommendation?.winner),
    recommendation_engine_protocol: recommendation?.protocol || "",
    recommendation_engine_profile: recommendation?.profile || "",
    recommendation_engine_winner: recommendation?.winner?.model || "",
    recommendation_engine_score: Number(recommendation?.winner?.score || 0),
    recommendation_engine_confidence: recommendation?.confidence || "",
    recommendation_engine_checks: recommendation?.winner?.checks || "",
    report_ok: Boolean(state.scan && benchmark?.success && lastShareReportUrl),
    first_30s: fieldTestFirst30sProof({ scan, report, action, profile, benchmark, upgrade }),
    share_url: lastShareReportUrl || "",
    notes: [
      profile.machineClass,
      `Profil terrain: ${fieldProfile.label} (${fieldProfile.source}).`,
      profile.verdict,
      report.ready ? "Parcours prêt." : "Parcours encore incomplet : compléter benchmark, PromptForge, dialogue, Arena et rapport avant import final."
    ].filter(Boolean).join(" ")
  };
}

function fieldTestEntryPayload() {
  const proof = releaseProof();
  return {
    schema: "outilsia.local_cockpit_field_tests.v1",
    generated_at: new Date().toISOString(),
    app_version: proof.app_version || "0.1.1",
    build_id: proof.build_id || "",
    source: "outilsia-local-cockpit-single-machine-export",
    machines: [fieldTestMachineEntry()],
    notes: "Fiche terrain unitaire. Réunir les cinq profils requis dans FIELD-TESTS.json avant import final."
  };
}

function renderFieldTestPanel() {
  if (!els.fieldTestBox) return;
  const profile = fieldTestProfile();
  const fieldProfile = effectiveFieldTestProfile();
  if (!state.scan) {
    els.fieldTestState.textContent = "scan requis";
    els.fieldTestBox.className = "field-test-box empty";
    els.fieldTestBox.textContent = "Scanne un portable, un vieux Core i7, une GTX 1080 Ti ou une RTX récente : OutilsIA dira quoi tenter, quoi éviter et quelle preuve locale obtenir.";
    els.copyFieldTestBtn.disabled = true;
    if (els.copyFieldTestJsonBtn) els.copyFieldTestJsonBtn.disabled = true;
    if (els.downloadFieldTestJsonBtn) els.downloadFieldTestJsonBtn.disabled = true;
    return;
  }
  els.fieldTestState.textContent = profile.benchmarkReady ? "preuve obtenue" : profile.machineClass;
  els.fieldTestBox.className = "field-test-box";
  const doctor = hardwareDoctorSnapshot(state.scan);
  const doctorLine = doctor
    ? `Doctor : ${doctor.score}/100 · ${doctor.ram.module_count || "?"} module(s) RAM · ${doctor.ram.channel_mode} · ${doctor.ram.effective_clock_label}`
    : "Doctor : signaux à confirmer";
  els.fieldTestBox.innerHTML = `
    <div class="field-test-summary">
      <strong>${escapeHtml(profile.machineClass)}</strong>
      <span>${escapeHtml(profile.verdict)}</span>
      <span>Profil exporté : ${escapeHtml(fieldProfile.label)} · source : ${escapeHtml(fieldProfile.source)}${fieldProfile.source === "manual" ? ` · auto aurait choisi ${escapeHtml(FIELD_TEST_PROFILE_LABELS[fieldProfile.inferred] || fieldProfile.inferred)}` : ""}</span>
      <span>Runtime : ${escapeHtml(profile.ollamaReady ? ollamaRuntimeLabel(state.scan) : "à installer")} · modèles installés : ${escapeHtml(profile.installedCount)} · benchmark : ${profile.benchmarkReady ? "oui" : "non"}</span>
      <span>${escapeHtml(doctorLine)}</span>
    </div>
    <div class="field-test-steps">
      ${profile.nextActions.map((action, index) => `
        <div>
          <strong>${escapeHtml(`Étape ${index + 1}`)}</strong>
          <span>${escapeHtml(action)}</span>
        </div>
      `).join("")}
    </div>
  `;
  els.copyFieldTestBtn.disabled = false;
  if (els.copyFieldTestJsonBtn) els.copyFieldTestJsonBtn.disabled = false;
  if (els.downloadFieldTestJsonBtn) els.downloadFieldTestJsonBtn.disabled = false;
}

function fieldTestMarkdown() {
  const scan = state.scan || {};
  const profile = fieldTestProfile();
  const fieldProfile = effectiveFieldTestProfile(scan);
  const benchmark = successfulBenchmarkFor("qwen3:0.6b");
  return [
    "# Checklist test terrain OutilsIA Local Cockpit",
    "",
    `- Date: ${new Date().toISOString()}`,
    `- Machine: ${scan.name || "non scannée"}`,
    `- Profil terrain exporté: ${fieldProfile.profile} (${fieldProfile.source})`,
    `- Profil inféré: ${fieldProfile.inferred}`,
    `- Classe: ${profile.machineClass}`,
    `- Verdict: ${profile.verdict}`,
    `- CPU: ${scan.cpu_name || "non scanné"}`,
    `- RAM: ${formatGb(scan.ram_gb)}`,
    `- GPU: ${scan.gpu_name || "non détecté"}`,
    `- VRAM: ${formatGb(scan.vram_gb)}`,
    "",
    "## Hardware Doctor",
    "",
    ...hardwareDoctorSummaryLines(hardwareDoctorSnapshot(scan)).map((line) => `- ${line}`),
    "",
    `- Ollama: ${profile.ollamaReady ? "prêt" : "à installer"}`,
    `- Modèles installés: ${profile.installedCount}`,
    `- Benchmark: ${profile.benchmarkReady && benchmark ? `${benchmark.model} - ${benchmark.estimated_tokens_per_second} tok/s` : "non lancé"}`,
    "",
    "## Prochaines étapes",
    "",
    ...profile.nextActions.map((action) => `- ${action}`),
    "",
    "## Règle",
    "",
    "- OutilsIA sert à savoir quoi faire tourner, installer et tester sur cette machine.",
    "- Les usages quant/backtests restent dans Strategy Arena."
  ].join("\n");
}

async function copyFieldTestMarkdown() {
  if (!state.scan) {
    setStatus("Scan requis avant copie de la checklist terrain", "warn");
    return;
  }
  await navigator.clipboard.writeText(fieldTestMarkdown());
  setStatus("Checklist terrain copiée", "ok");
}

async function copyFieldTestJson() {
  if (!state.scan) {
    setStatus("Scan requis avant copie de la fiche terrain", "warn");
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify(fieldTestEntryPayload(), null, 2));
  setStatus("Fiche terrain JSON copiée", "ok");
}

function downloadFieldTestJson() {
  if (!state.scan) {
    setStatus("Scan requis avant téléchargement de la fiche terrain", "warn");
    return;
  }
  const entry = fieldTestMachineEntry();
  const safeProfile = String(entry.profile || "machine").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  downloadTextFile(`outilsia-field-test-${safeProfile}.json`, JSON.stringify(fieldTestEntryPayload(), null, 2), "application/json;charset=utf-8");
  setStatus("Fiche terrain téléchargée", "ok");
}

function renderActionPlan(compatibility, models, blocked, upgrades, newModels = []) {
  const actions = [];
  const score = normalizeScore(compatibility.score ?? null);
  const preferred = preferredModelCommand(models);
  if (preferred?.ref) {
    actions.push({
      title: "Tester le meilleur modèle compatible",
      text: `${preferred.installed ? "Teste" : "Installe puis teste"} ${preferred.ref} avec Ollama pour valider la machine en conditions reelles.`
    });
  }
  if ((state.scan?.installed_models || []).length === 0) {
    actions.push({
      title: "Installer au moins un modèle local",
      text: "Aucun modèle Ollama installé n'a été détecté. Commence par un 7B/8B rapide avant les gros modèles."
    });
  }
  if (Array.isArray(blocked) && blocked.length) {
    const next = blocked[0];
    actions.push({
      title: "Prochain palier bloque",
      text: `${next.name || "Modele"} demande environ ${next.vram_q4 || "?"} Go VRAM en Q4.`
    });
  }
  if (Array.isArray(newModels) && newModels.length) {
    const latest = newModels[0];
    actions.push({
      title: "Tester un nouveau modèle",
      text: `${latest.name || "Nouveau modèle"} ${latest.params || ""} est dans le catalogue récent. Vérifie s'il remplace ton modèle actuel.`
    });
  }
  if (digitalTwinSuppressesPurchases()) {
    actions.push({
      title: "Conserver la machine",
      text: "Le scénario Digital Twin actif ne justifie aucun achat. Modifie la cible ou produis une nouvelle preuve locale avant de réévaluer."
    });
  } else if (Array.isArray(upgrades) && upgrades.length) {
    const first = upgrades[0];
    actions.push({
      title: "Upgrade prioritaire",
      text: typeof first === "string" ? first : `${first.name || first.label || "Upgrade"}: ${first.reason || "a verifier selon ton budget"}`
    });
  }
  if (score !== null && score >= 85) {
    actions.push({
      title: "Capitaliser",
      text: "Machine assez forte pour sauvegarder benchmarks, commandes et contexte dans MemoryForge/Obsidian."
    });
  }
  els.actionCount.textContent = `${actions.length} action${actions.length > 1 ? "s" : ""}`;
  els.actionList.className = actions.length ? "list" : "list empty";
  els.actionList.innerHTML = actions.length
    ? actions.slice(0, 6).map((item) => `
        <div class="list-item">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.text)}</span>
        </div>
      `).join("")
    : "Aucune action prioritaire calculee.";
  return actions;
}

function topModels(models) {
  return (Array.isArray(models) ? models : []).slice(0, 5).map((model) => ({
    name: model.name || model.model_name || model.model || "modèle",
    detail: modelLine(model),
    command: model.ollama ? `${ollamaRuntimeCommandLabel(model.ollama)} run ${model.ollama}` : ""
  }));
}

function topUpgrades(upgrades) {
  return (Array.isArray(upgrades) ? upgrades : []).slice(0, 4).map((item) => {
    if (typeof item === "string") {
      return { label: item, reason: "", price: "", url: "", avoid: "" };
    }
    return {
      label: item.label || item.name || item.title || "Upgrade",
      reason: item.reason || item.title || "",
      price: item.price_range_eur || "",
      url: item.url || item.affiliate_url || item.guide_url || "",
      avoid: item.avoid || ""
    };
  });
}

function buildDecisionPack(compatibility, models, blocked, upgrades, newModels = [], actions = []) {
  const scan = state.scan || {};
  const score = normalizeScore(compatibility.score ?? compatibility.compatibility_score ?? null);
  const modelRows = topModels(models);
  const effectiveUpgrades = digitalTwinSuppressesPurchases() ? [] : upgrades;
  const upgradeRows = topUpgrades(effectiveUpgrades);
  const links = digitalTwinSuppressesPurchases() ? [] : buildBuyingLinks(compatibility, effectiveUpgrades).slice(0, 5);
  const blockedRows = (Array.isArray(blocked) ? blocked : []).slice(0, 3).map((model) => ({
    name: model.name || model.model_name || model.model || "modèle",
    detail: modelLine(model)
  }));
  const newRows = (Array.isArray(newModels) ? newModels : []).slice(0, 3).map((model) => ({
    name: model.name || model.model_name || model.model || "modèle",
    detail: modelLine(model)
  }));
  return {
    generated_at: new Date().toISOString(),
    machine: {
      name: scan.name || "Machine IA locale",
      cpu: scan.cpu_name || "CPU inconnu",
      ram: formatGb(scan.ram_gb),
      gpu: gpuDisplayLabel(scan),
      vram: memoryDisplayLabel(scan),
      os: `${scan.os_name || "OS"} ${scan.os_version || ""}`.trim(),
      ollama: runtimeOllama(scan)
    },
    score,
    verdict: compatibility.summary || compatibility.verdict || fallbackVerdict(scan),
    models: modelRows,
    blocked: blockedRows,
    new_models: newRows,
    upgrades: upgradeRows,
    buying_links: links,
    purchases_suppressed_by_digital_twin: digitalTwinSuppressesPurchases(),
    actions: actions.slice(0, 6),
    synced_machine_id: lastSyncedMachineId,
    benchmark: state.benchmark || null
  };
}

function decisionPackMarkdown(pack = currentDecisionPack()) {
  const impact = currentUpgradeImpact();
  const lines = [
    "# Pack decision OutilsIA Local Cockpit",
    "",
    `- Date: ${pack.generated_at}`,
    `- Machine: ${pack.machine.name}`,
    `- CPU: ${pack.machine.cpu}`,
    `- RAM: ${pack.machine.ram}`,
    `- GPU: ${pack.machine.gpu}`,
    `- VRAM: ${pack.machine.vram}`,
    `- OS: ${pack.machine.os}`,
    `- Ollama: ${pack.machine.ollama}`,
    `- Score IA locale: ${pack.score === null ? "non calculé" : `${pack.score}/100`}`,
    `- Machine compte: ${pack.synced_machine_id || "non synchronisee"}`,
    "",
    "## Verdict",
    "",
    pack.verdict || "Diagnostic non calculé.",
    "",
    "## Modeles a tester",
    "",
    ...(pack.models.length
      ? pack.models.map((model) => `- ${model.name}: ${model.command || model.detail}`)
      : ["- Aucun modèle compatible calculé."]),
    "",
    "## Prochains paliers bloques",
    "",
    ...(pack.blocked.length
      ? pack.blocked.map((model) => `- ${model.name}: ${model.detail}`)
      : ["- Aucun palier bloque prioritaire."]),
    "",
    "## Upgrades prioritaires",
    "",
    ...(pack.upgrades.length
      ? pack.upgrades.map((upgrade) => [
          `- ${upgrade.label}`,
          upgrade.price ? `prix indicatif ${upgrade.price}` : "",
          upgrade.reason,
          upgrade.avoid ? `à éviter: ${upgrade.avoid}` : "",
          upgrade.url ? `lien: ${upgrade.url}` : ""
        ].filter(Boolean).join(" - "))
      : [pack.purchases_suppressed_by_digital_twin
          ? "- Digital Twin : le scénario actif ne justifie aucun achat."
          : "- Aucun upgrade prioritaire calculé."]),
    "",
    "## Impact upgrade prioritaire",
    "",
    `- VRAM: ${impact.current.vram_gb || "?"} Go -> ${impact.next.vram_gb || "?"} Go`,
    `- RAM: ${impact.current.ram_gb || "?"} Go -> ${impact.next.ram_gb || "?"} Go`,
    ...(impact.newlyReachable.length
      ? impact.newlyReachable.map((model) => `- Debloque: ${modelTitle(model)}`)
      : ["- Aucun modèle proche débloqué par cet upgrade dans le catalogue actuel."]),
    "",
    "## Actions",
    "",
    ...(pack.actions.length
      ? pack.actions.map((action) => `- ${action.title}: ${action.text}`)
      : ["- Lancer un diagnostic complet puis sauvegarder la machine."]),
    "",
    "## Liens utiles",
    "",
    ...(pack.buying_links.length
      ? [`- ${AFFILIATE_DISCLOSURE}`, ...pack.buying_links.map((link) => `- ${link.title}: ${link.url}`)]
      : [pack.purchases_suppressed_by_digital_twin
          ? "- Aucun lien d'achat : le scénario actif est classé no_buy."
          : "- https://outilsia.fr/materiel"]),
  ];
  if (pack.benchmark) {
    lines.push(
      "",
      "## Benchmark session",
      "",
      `- Modele: ${pack.benchmark.model}`,
      `- ${benchmarkSpeedLabel(pack.benchmark)}: ${pack.benchmark.estimated_tokens_per_second} tok/s`,
      `- Methode: ${benchmarkMeasurementLabel(pack.benchmark)}`,
      `- Succes: ${pack.benchmark.success ? "oui" : "non"}`
    );
  }
  return lines.join("\n");
}

function shoppingListMarkdown(pack = currentDecisionPack()) {
  const lines = [
    "# Shopping list OutilsIA Local Cockpit",
    "",
    `- Date: ${pack.generated_at}`,
    `- Machine: ${pack.machine.name}`,
    `- GPU actuel: ${pack.machine.gpu}`,
    `- VRAM actuelle: ${pack.machine.vram}`,
    `- RAM actuelle: ${pack.machine.ram}`,
    `- Score IA locale: ${pack.score === null ? "non calculé" : `${pack.score}/100`}`,
    "",
    "## Achats prioritaires",
    "",
  ];

  if (pack.upgrades.length) {
    for (const [index, upgrade] of pack.upgrades.entries()) {
      lines.push(`${index + 1}. ${upgrade.label}`);
      if (upgrade.reason) lines.push(`   - Pourquoi: ${upgrade.reason}`);
      if (upgrade.price) lines.push(`   - Prix indicatif: ${upgrade.price}`);
      if (upgrade.url) lines.push(`   - Lien prix/guide: ${upgrade.url}`);
      if (upgrade.avoid) lines.push(`   - À éviter: ${upgrade.avoid}`);
    }
  } else {
    lines.push(pack.purchases_suppressed_by_digital_twin
      ? "1. N'achetez rien pour ce scénario : le Digital Twin n'identifie aucun nouveau palier utile."
      : "1. Aucun achat prioritaire calculé. Garde la machine actuelle et lance des benchmarks.");
  }

  lines.push(
    "",
    "## Alternatives et guides",
    "",
    ...(pack.buying_links.length
      ? [`- ${AFFILIATE_DISCLOSURE}`, ...pack.buying_links.map((link) => `- ${link.title}: ${link.url}`)]
      : [pack.purchases_suppressed_by_digital_twin
          ? "- Aucun lien d'achat tant que le scénario reste no_buy."
          : "- https://outilsia.fr/materiel"]),
    "",
    "## Vérification avant achat",
    "",
    "- Relancer le scan après upgrade.",
    "- Vérifier la VRAM effective et l'alimentation.",
    "- Lancer au moins un benchmark Ollama avant de conclure.",
    "- Ne pas acheter un GPU 8 Go si le besoin est LLM local confortable."
  );
  return lines.join("\n");
}

function currentDecisionPack() {
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  return buildDecisionPack(
    compatibility,
    extractModels(compatibility),
    compatibility.blocked_next || compatibility.blocked || [],
    compatibility.upgrades || compatibility.recommended_upgrades || compatibility.shopping_list || [],
    compatibility.new || compatibility.new_models || [],
    []
  );
}

function renderDecisionPack(compatibility, models, blocked, upgrades, newModels, actions) {
  const pack = buildDecisionPack(compatibility, models, blocked, upgrades, newModels, actions);
  const preferred = preferredModelCommand(models);
  const command = preferred?.command || pack.models.find((model) => model.command)?.command || "";
  const upgrade = pack.upgrades[0];
  els.decisionPackState.textContent = pack.score === null ? "score absent" : `${pack.score}/100`;
  els.decisionPackBox.className = "decision-pack";
  els.decisionPackBox.innerHTML = `
    <strong>${escapeHtml(pack.verdict || "Diagnostic pret")}</strong>
    <span>${escapeHtml(pack.machine.gpu)} - ${escapeHtml(pack.machine.vram)} VRAM - ${escapeHtml(pack.machine.ram)} RAM</span>
    <span>${command ? `Commande prioritaire: ${escapeHtml(command)}` : "Aucune commande Ollama prioritaire calculee."}</span>
    <span>${upgrade ? `Upgrade prioritaire: ${escapeHtml(upgrade.label)}${upgrade.price ? ` (${escapeHtml(upgrade.price)})` : ""}` : "Aucun achat prioritaire."}</span>
    ${upgrade ? `<small class="affiliate-disclosure">${escapeHtml(AFFILIATE_DISCLOSURE)}</small>` : ""}
  `;
  els.copyDecisionPackBtn.disabled = false;
  els.copyShoppingListBtn.disabled = false;
  els.saveDecisionPackBtn.disabled = false;
}

async function copyDecisionPack() {
  if (!state.compatibility) {
    setStatus("Diagnostic requis avant copie du pack", "bad");
    return;
  }
  await navigator.clipboard.writeText(decisionPackMarkdown());
  setStatus("Pack décision copié", "ok");
}

async function copyShoppingList() {
  if (!state.compatibility) {
    setStatus("Diagnostic requis avant copie de la shopping list", "bad");
    return;
  }
  await navigator.clipboard.writeText(shoppingListMarkdown());
  setStatus("Shopping list copiee", "ok");
}

async function saveDecisionPackLocal() {
  if (!state.scan || !state.compatibility) {
    setStatus("Scan et diagnostic requis avant sauvegarde du pack", "bad");
    return;
  }
  state.markdown = decisionPackMarkdown();
  els.memoryText.value = state.markdown;
  els.copyBtn.disabled = false;
  els.downloadBtn.disabled = false;
  els.vaultBtn.disabled = false;
  await saveLocalSnapshot();
  setStatus("Pack décision sauvegardé localement", "ok");
}

function runtimeStatusLabel(model) {
  const status = String(model?.runtime_status || "").trim();
  if (!status) return "";
  if (status === "ollama_available") return "runtime Ollama signalé";
  if (status === "ollama_frontier_available") return "Ollama confirmé, frontier gardé";
  if (status === "ollama_watchlist") return "watchlist Ollama à confirmer";
  if (status === "frontier_watchlist") return "frontier à surveiller, test prudent";
  return status.replaceAll("_", " ");
}

function modelLine(model) {
  const actionRef = actionableOllamaRef(model);
  const rawRef = modelOllamaRef(model);
  const bits = [
    modelKindLabel(model),
    model.params,
    model.status || model.label || model.tier,
    model.vram_q4 ? `${model.vram_q4} Go VRAM Q4` : null,
    runtimeStatusLabel(model),
    actionRef ? `ollama: ${actionRef}` : rawRef ? `ref non pilotée ici: ${rawRef}` : null,
    model.use_case,
    model.reason
  ].filter(Boolean);
  return bits.join(" - ") || "compatible selon diagnostic";
}

function fallbackVerdict(scan) {
  const vram = scan?.vram_gb || 0;
  const ram = scan?.ram_gb || 0;
  if (scan?.unified_memory && ram >= 96) return "Machine mémoire unifiée très intéressante pour IA locale : gros contextes et modèles quantifiés possibles, à valider selon backend AMD/ROCm/Vulkan.";
  if (scan?.unified_memory && ram >= 64) return "Bonne machine à mémoire unifiée : modèles 7B-14B confortables et certains gros modèles quantifiés à benchmarker selon runtime.";
  if (vram >= 24) return "Machine tres solide pour LLM locaux: Qwen, Hermes, Mixtral quantifie et gros contextes deviennent realistes.";
  if (vram >= 16) return "Bonne machine IA locale: vise les modèles 7B à 14B confortablement, certains 32B quantifiés selon contexte.";
  if (vram >= 12) return "Bon ticket d'entree IA locale: RTX 3060 12 Go ou equivalent, parfait pour debuter avec Ollama.";
  if (ram >= 32) return "Possible en CPU/RAM, mais l'upgrade prioritaire reste une carte graphique avec 12 a 16 Go de VRAM.";
  return "Machine limitee pour LLM locaux: commence par RAM 32 Go minimum puis GPU 12 Go VRAM.";
}

async function scanMachine() {
  setStatus("Scan local en cours...");
  els.scanBtn.disabled = true;
  try {
    const scan = invoke ? await invoke("scan_machine") : demoScan();
    if (invoke) state.optimisticInstalledModels = [];
    renderScan(scan);
    setStatus("Scan termine", "ok");
    renderPrimaryAction();
  } catch (error) {
    setStatus(String(error), "bad");
  } finally {
    els.scanBtn.disabled = false;
  }
}

async function checkCompatibility() {
  if (!state.scan) return;
  setStatus("Vérification OutilsIA...");
  els.checkBtn.disabled = true;
  try {
    const payload = invoke
      ? await invoke("check_compatibility", { scan: state.scan })
      : demoCompatibility();
    renderCompatibility(payload);
    setStatus("Diagnostic OutilsIA chargé", "ok");
    renderPrimaryAction();
  } catch (error) {
    renderCompatibility({ compatibility: {} });
    setStatus(String(error), "bad");
  } finally {
    els.checkBtn.disabled = false;
  }
}

async function ensureCompatibilityLoaded() {
  if (!state.scan || state.compatibility) return;
  await checkCompatibility();
}

async function generateMemory() {
  if (!state.scan) return;
  try {
    state.markdown = cockpitMemoryMarkdown() || (invoke
      ? await invoke("generate_memoryforge", {
          scan: state.scan,
          compatibility: state.compatibility
        })
      : demoMarkdown());
    els.memoryText.value = state.markdown;
    els.copyBtn.disabled = false;
    els.downloadBtn.disabled = false;
    els.vaultBtn.disabled = false;
    setStatus("Journal MemoryForge prêt", "ok");
  } catch (error) {
    setStatus(String(error), "bad");
  }
}

function readModelAutopilotStore() {
  try {
    const raw = window.localStorage?.getItem(MODEL_AUTOPILOT_PROFILES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.schema === "outilsia.model_autopilot.profiles.v1" && parsed.profiles && typeof parsed.profiles === "object") {
      return parsed;
    }
  } catch (_) {
    // A corrupt optional profile must never block a benchmark.
  }
  return { schema: "outilsia.model_autopilot.profiles.v1", profiles: {} };
}

function writeModelAutopilotStore(store) {
  try {
    window.localStorage?.setItem(MODEL_AUTOPILOT_PROFILES_KEY, JSON.stringify(store));
    return true;
  } catch (_) {
    return false;
  }
}

function modelAutopilotBindingKey(model) {
  const machine = state.scan?.machine_key || "unscanned";
  const runtime = defaultOllamaRuntime(model);
  return `${machine}|${runtime}|${normalizeOllamaRef(model)}`;
}

function modelAutopilotBinding(model) {
  const clean = normalizeOllamaRef(model);
  if (!clean) return null;
  return readModelAutopilotStore().profiles[modelAutopilotBindingKey(clean)] || null;
}

function activeModelAutopilotProfile(model) {
  const active = modelAutopilotBinding(model)?.active;
  if (!active?.tuning) return null;
  return active;
}

function modelAutopilotTuningPayload(model) {
  const active = activeModelAutopilotProfile(model);
  return active?.tuning ? { tuning: { ...active.tuning } } : {};
}

function modelAutopilotInstalledModel(model) {
  return (state.scan?.installed_models || []).find((item) => sameOllamaModel(modelLabel(item), model)) || null;
}

function modelAutopilotCandidates(model) {
  const cores = Math.max(1, Math.min(64, Number(state.scan?.cpu_cores || 4)));
  const ram = Number(state.scan?.ram_gb || 0);
  const vram = Number(state.scan?.vram_gb || 0);
  const installed = modelAutopilotInstalledModel(model);
  const modelSize = Number(installed?.size_gb || 0);
  const constrained = (ram > 0 && ram <= 12) || (modelSize > 0 && ram > 0 && modelSize >= ram * 0.65);
  const qualityContext = constrained ? 4096 : (ram >= 32 || vram >= 12 ? 8192 : 6144);
  const balancedContext = qualityContext <= 4096 ? 3072 : 4096;
  const balancedBatch = vram >= 8 || state.scan?.unified_memory ? 256 : 128;
  return [
    {
      key: "fast",
      label: "Rapide",
      detail: "Contexte court et charge mémoire contenue.",
      tuning: { num_ctx: 2048, num_batch: 128, num_thread: Math.min(cores, 8) }
    },
    {
      key: "balanced",
      label: "Équilibré",
      detail: "Réglage quotidien entre débit et contexte.",
      tuning: { num_ctx: balancedContext, num_batch: balancedBatch, num_thread: Math.min(cores, 12) }
    },
    {
      key: "quality",
      label: "Qualité / contexte",
      detail: "Plus de contexte ; la quantification du modèle reste inchangée.",
      tuning: { num_ctx: qualityContext, num_batch: 128, num_thread: Math.min(cores, 16) }
    }
  ];
}

function modelAutopilotTuningLabel(tuning = {}) {
  return `ctx ${Number(tuning.num_ctx || 0)} · batch ${Number(tuning.num_batch || 0)} · threads ${Number(tuning.num_thread || 0)}`;
}

function scoreModelAutopilotResults(results = []) {
  const successful = results.filter((item) => item.success);
  if (!successful.length) return { results, recommended: null };
  const maxSpeed = Math.max(...successful.map((item) => Number(item.estimated_tokens_per_second || 0)), 1);
  const maxPrompt = Math.max(...successful.map((item) => Number(item.prompt_tokens_per_second || 0)), 1);
  const maxContext = Math.max(...successful.map((item) => Number(item.tuning?.num_ctx || 0)), 1);
  const minContext = Math.min(...successful.map((item) => Number(item.tuning?.num_ctx || maxContext)), maxContext);
  const balancedContext = Number(successful.find((item) => item.autopilot_profile === "balanced")?.tuning?.num_ctx || maxContext);
  const usage = readUsageProfileKey();
  const weights = usage === "portable"
    ? { speed: 0.55, prompt: 0.20, context: 0.15, proof: 0.10 }
    : usage === "memory"
      ? { speed: 0.28, prompt: 0.12, context: 0.50, proof: 0.10 }
      : { speed: 0.42, prompt: 0.18, context: 0.30, proof: 0.10 };
  const targetContext = usage === "portable" ? minContext : usage === "memory" ? maxContext : balancedContext;
  const scored = results.map((item) => {
    if (!item.success) return { ...item, autopilot_score: 0 };
    const speed = Number(item.estimated_tokens_per_second || 0) / maxSpeed;
    const prompt = Number(item.prompt_tokens_per_second || 0) > 0
      ? Number(item.prompt_tokens_per_second || 0) / maxPrompt
      : speed;
    const itemContext = Number(item.tuning?.num_ctx || 0);
    const context = Math.max(0, 1 - (Math.abs(itemContext - targetContext) / Math.max(targetContext, 1)));
    const proof = item.autopilot_proof_ok ? 1 : 0.4;
    const score = Math.round(100 * (
      (speed * weights.speed)
      + (prompt * weights.prompt)
      + (context * weights.context)
      + (proof * weights.proof)
    ));
    return { ...item, autopilot_score: Math.max(0, Math.min(100, score)) };
  });
  const recommended = scored
    .filter((item) => item.success)
    .sort((left, right) => right.autopilot_score - left.autopilot_score)[0] || null;
  return { results: scored, recommended };
}

function modelAutopilotSnapshot() {
  const run = state.modelAutopilotRun;
  const model = normalizeOllamaRef(run?.model || els.benchmarkModelInput?.value || "");
  const active = model ? activeModelAutopilotProfile(model) : null;
  if (!run && !active) return null;
  return {
    schema: MODEL_AUTOPILOT_PROTOCOL,
    model,
    runtime: run?.runtime || defaultOllamaRuntime(model),
    measured_at: run?.measured_at || null,
    budget: run?.budget || { profiles: 3, timeout_seconds_each: 55, downloads: 0 },
    recommended: run?.recommended ? {
      key: run.recommended.autopilot_profile,
      label: run.recommended.autopilot_label,
      score: run.recommended.autopilot_score,
      tuning: run.recommended.tuning,
      tokens_per_second: Number(run.recommended.estimated_tokens_per_second || 0),
      prompt_tokens_per_second: Number(run.recommended.prompt_tokens_per_second || 0)
    } : null,
    active: active ? {
      key: active.key,
      label: active.label,
      tuning: active.tuning,
      applied_at: active.applied_at,
      measured_tokens_per_second: Number(active.measured_tokens_per_second || 0)
    } : null,
    results: (run?.results || []).map((item) => ({
      key: item.autopilot_profile,
      label: item.autopilot_label,
      success: Boolean(item.success),
      score: Number(item.autopilot_score || 0),
      tuning: item.tuning,
      tokens_per_second: Number(item.estimated_tokens_per_second || 0),
      prompt_tokens_per_second: Number(item.prompt_tokens_per_second || 0),
      elapsed_ms: Number(item.elapsed_ms || 0),
      measurement_source: item.measurement_source || "",
      runtime_processor: item.runtime_processor || "unknown",
      gpu_offload_percent: Number(item.runtime_gpu_offload_percent || 0)
    }))
  };
}

function renderModelAutopilot() {
  if (!els.modelAutopilotBox) return;
  const model = ollamaActionRef(els.benchmarkModelInput?.value || "");
  const installed = Boolean(model && isOllamaModelInstalled(model));
  const running = Boolean(state.modelAutopilotRun?.running);
  const run = state.modelAutopilotRun?.model === model ? state.modelAutopilotRun : null;
  const binding = model ? modelAutopilotBinding(model) : null;
  const active = binding?.active || null;
  const recommendationApplied = Boolean(
    active
    && run?.recommended
    && active.key === run.recommended.autopilot_profile
    && canonicalJson(active.tuning) === canonicalJson(run.recommended.tuning)
  );
  els.runModelAutopilotBtn.disabled = !state.scan || !installed || running;
  els.applyModelAutopilotBtn.disabled = running || !run?.recommended?.success || recommendationApplied;
  els.applyModelAutopilotBtn.textContent = recommendationApplied ? "Profil appliqué" : "Appliquer le profil";
  els.rollbackModelAutopilotBtn.disabled = running || !binding?.rollback_available;

  if (!state.scan) {
    els.modelAutopilotState.textContent = "scan requis";
    els.modelAutopilotBox.className = "model-autopilot-box empty";
    els.modelAutopilotBox.textContent = "Scannez la machine avant de mesurer les réglages Ollama.";
    return;
  }
  if (!model || !installed) {
    els.modelAutopilotState.textContent = "modèle installé requis";
    els.modelAutopilotBox.className = "model-autopilot-box empty";
    els.modelAutopilotBox.textContent = model
      ? `${model} doit déjà être installé. Model Autopilot ne télécharge aucun modèle.`
      : "Choisissez un modèle Ollama déjà installé dans le benchmark.";
    return;
  }

  const activeHtml = active ? `
    <div class="autopilot-active">
      <strong>Actif dans OutilsIA · ${escapeHtml(active.label)}</strong>
      <span>${escapeHtml(modelAutopilotTuningLabel(active.tuning))}</span>
    </div>
  ` : "";
  const resultsHtml = run?.results?.length ? `
    <div class="autopilot-results">
      ${run.results.map((item) => `
        <div class="autopilot-profile ${item.autopilot_profile === run.recommended?.autopilot_profile ? "recommended" : ""} ${item.success ? "" : "failed"}">
          <strong>${escapeHtml(item.autopilot_label)}${item.autopilot_profile === run.recommended?.autopilot_profile ? " · recommandé" : ""}</strong>
          <span>${escapeHtml(modelAutopilotTuningLabel(item.tuning))}</span>
          <span>${item.success ? `${escapeHtml(item.estimated_tokens_per_second || 0)} tok/s · score ${escapeHtml(item.autopilot_score || 0)}/100` : escapeHtml(friendlyOllamaError(item.error || "test en erreur"))}</span>
        </div>
      `).join("")}
    </div>
  ` : "";
  const headline = running
    ? `Campagne en cours · ${escapeHtml(model)}`
    : run?.recommended
      ? `${escapeHtml(run.recommended.autopilot_label)} recommandé pour le profil ${escapeHtml(currentUsageProfile().label)}`
      : `${escapeHtml(model)} prêt · trois réglages bornés`;
  const detail = run?.recommended
    ? `${modelAutopilotTuningLabel(run.recommended.tuning)} · mesure API Ollama · aucune application automatique.`
    : "Rapide, Équilibré et Qualité / contexte. Le modèle et sa quantification ne changent pas.";
  els.modelAutopilotState.textContent = running ? "mesure en cours" : active ? "profil actif" : run?.recommended ? "comparaison prête" : "prêt";
  els.modelAutopilotBox.className = "model-autopilot-box";
  els.modelAutopilotBox.innerHTML = `
    <div class="arena-summary">
      <strong>${headline}</strong>
      <span>${escapeHtml(detail)}</span>
    </div>
    ${activeHtml}
    ${resultsHtml}
  `;
}

async function runModelAutopilot() {
  const model = ollamaActionRef(els.benchmarkModelInput?.value || "");
  if (!state.scan || !model || !isOllamaModelInstalled(model)) {
    setStatus("Model Autopilot exige un modèle déjà installé", "warn");
    renderModelAutopilot();
    return;
  }
  const approved = window.confirm(
    `Tester 3 profils Ollama sur ${model} ?\n\nBudget maximum : 3 minutes. Aucun modèle ne sera téléchargé et aucun réglage ne sera appliqué sans votre confirmation.`
  );
  if (!approved) {
    setStatus("Campagne Model Autopilot annulée", "warn");
    return;
  }
  const candidates = modelAutopilotCandidates(model);
  const runtime = defaultOllamaRuntime(model);
  invalidateCapabilityPassport();
  state.modelAutopilotRun = {
    schema: MODEL_AUTOPILOT_PROTOCOL,
    model,
    runtime,
    running: true,
    measured_at: null,
    budget: { profiles: candidates.length, timeout_seconds_each: 55, downloads: 0 },
    results: [],
    recommended: null
  };
  renderCapabilityPassportPanel();
  renderModelAutopilot();
  resetOperationConsole(`Model Autopilot · ${model}`);
  setOperationFocus(`Model Autopilot : ${model}`, [
    "Trois profils bornés, un seul modèle déjà installé.",
    "Aucun téléchargement et aucune modification silencieuse.",
    "Chaque test exige les métriques de l'API Ollama."
  ]);
  try {
    for (const profile of candidates) {
      appendOperationLine(`${profile.label} · ${modelAutopilotTuningLabel(profile.tuning)}`, "cmd");
      setStatus(`Model Autopilot ${profile.label} : ${model}...`);
      try {
        const result = invoke
          ? await invoke("benchmark_ollama", {
              request: {
                model,
                prompt: "Réponds uniquement sur une ligne : AUTO-42 | VRAM | benchmark local.",
                timeout_seconds: 55,
                protocol: MODEL_AUTOPILOT_PROTOCOL,
                tuning: profile.tuning,
                ...ollamaRuntimePayload(model)
              }
            })
          : {
              ...demoBenchmark(model),
              measurement_source: "ollama_api",
              output_preview: "AUTO-42 | VRAM | benchmark local.",
              estimated_tokens_per_second: Number((demoBenchmark(model).estimated_tokens_per_second * ({ fast: 1.08, balanced: 1, quality: 0.88 }[profile.key] || 1)).toFixed(1))
            };
        const measured = {
          ...result,
          machine_key: state.scan?.machine_key || "",
          runtime,
          benchmark_protocol: MODEL_AUTOPILOT_PROTOCOL,
          protocol: MODEL_AUTOPILOT_PROTOCOL,
          autopilot_profile: profile.key,
          autopilot_label: profile.label,
          tuning: profile.tuning,
          autopilot_proof_ok: /AUTO-42/i.test(result.output_preview || "") && /VRAM/i.test(result.output_preview || "")
        };
        state.modelAutopilotRun.results.push(measured);
        appendOperationLine(`${profile.label}: ${measured.success ? `${measured.estimated_tokens_per_second} tok/s` : friendlyOllamaError(measured.error)}`, measured.success ? "bench" : "erreur");
      } catch (error) {
        state.modelAutopilotRun.results.push({
          model,
          success: false,
          error: friendlyOllamaError(error),
          autopilot_profile: profile.key,
          autopilot_label: profile.label,
          tuning: profile.tuning,
          autopilot_score: 0
        });
        appendOperationLine(`${profile.label}: ${friendlyOllamaError(error)}`, "erreur");
      }
      renderModelAutopilot();
    }
    const scored = scoreModelAutopilotResults(state.modelAutopilotRun.results);
    state.modelAutopilotRun = {
      ...state.modelAutopilotRun,
      running: false,
      measured_at: new Date().toISOString(),
      results: scored.results,
      recommended: scored.recommended
    };
    finishOperationMonitor(scored.recommended ? "Model Autopilot terminé" : "Model Autopilot sans profil valide");
    setStatus(
      scored.recommended ? `${scored.recommended.autopilot_label} recommandé, application manuelle requise` : "Aucun profil Autopilot validé",
      scored.recommended ? "ok" : "warn"
    );
  } finally {
    if (state.modelAutopilotRun) state.modelAutopilotRun.running = false;
    renderModelAutopilot();
    renderFlightRecorder();
    renderReadinessPanel();
  }
}

function applyModelAutopilotRecommendation() {
  const run = state.modelAutopilotRun;
  const recommended = run?.recommended;
  if (!run || !recommended?.success) {
    setStatus("Aucun profil Model Autopilot valide à appliquer", "warn");
    return;
  }
  const store = readModelAutopilotStore();
  const key = modelAutopilotBindingKey(run.model);
  const existing = store.profiles[key] || null;
  const active = {
    key: recommended.autopilot_profile,
    label: recommended.autopilot_label,
    tuning: { ...recommended.tuning },
    applied_at: new Date().toISOString(),
    measured_tokens_per_second: Number(recommended.estimated_tokens_per_second || 0),
    measurement_source: recommended.measurement_source || "ollama_api"
  };
  store.profiles[key] = {
    machine_key: state.scan?.machine_key || "",
    model: run.model,
    runtime: run.runtime,
    active,
    previous: existing?.active || null,
    rollback_available: true
  };
  if (!writeModelAutopilotStore(store)) {
    setStatus("Impossible d'enregistrer le profil Model Autopilot", "bad");
    return;
  }
  const appliedResult = { ...recommended, autopilot_applied: true };
  state.benchmark = appliedResult;
  invalidateCapabilityPassport();
  saveBenchmarkHistoryEntry(appliedResult);
  renderBenchmark(appliedResult);
  renderModelAutopilot();
  renderFlightRecorder();
  renderCapabilityPassportPanel();
  renderReadinessPanel();
  setStatus(`Profil ${active.label} appliqué à ${run.model} dans OutilsIA`, "ok");
}

function rollbackModelAutopilotProfile() {
  const model = ollamaActionRef(els.benchmarkModelInput?.value || "");
  const store = readModelAutopilotStore();
  const key = modelAutopilotBindingKey(model);
  const binding = store.profiles[key];
  if (!binding?.rollback_available) {
    setStatus("Aucun profil précédent à restaurer", "warn");
    return;
  }
  if (binding.previous) {
    store.profiles[key] = {
      ...binding,
      active: binding.previous,
      previous: null,
      rollback_available: false
    };
  } else {
    delete store.profiles[key];
  }
  writeModelAutopilotStore(store);
  invalidateCapabilityPassport();
  renderModelAutopilot();
  renderFlightRecorder();
  renderCapabilityPassportPanel();
  renderReadinessPanel();
  const restored = activeModelAutopilotProfile(model);
  setStatus(restored ? `Profil ${restored.label} restauré` : "Réglages Ollama par défaut restaurés", "ok");
}

function readFlightRecorderStore() {
  try {
    const raw = window.localStorage?.getItem(FLIGHT_RECORDER_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.schema === FLIGHT_RECORDER_PROTOCOL && Array.isArray(parsed.references)) {
      return {
        schema: FLIGHT_RECORDER_PROTOCOL,
        references: parsed.references.slice(0, MAX_FLIGHT_RECORDER_REFERENCES),
        active_by_binding: parsed.active_by_binding && typeof parsed.active_by_binding === "object"
          ? parsed.active_by_binding
          : {}
      };
    }
  } catch (_) {
    // A corrupt optional recorder must never block scan or benchmark.
  }
  return { schema: FLIGHT_RECORDER_PROTOCOL, references: [], active_by_binding: {} };
}

function writeFlightRecorderStore(store) {
  const normalized = {
    schema: FLIGHT_RECORDER_PROTOCOL,
    references: Array.isArray(store?.references)
      ? store.references.slice(0, MAX_FLIGHT_RECORDER_REFERENCES)
      : [],
    active_by_binding: store?.active_by_binding && typeof store.active_by_binding === "object"
      ? store.active_by_binding
      : {}
  };
  try {
    window.localStorage?.setItem(FLIGHT_RECORDER_STORE_KEY, JSON.stringify(normalized));
    return true;
  } catch (_) {
    return false;
  }
}

function flightRecorderMachineKey(value = {}) {
  return String(value.machine_key || value.machine?.machine_key || "").trim();
}

function flightRecorderBenchmarkFor(model) {
  const clean = normalizeOllamaRef(model);
  const machineKey = String(state.scan?.machine_key || "").trim();
  if (!clean || !machineKey) return null;
  const candidates = [state.benchmark, ...readBenchmarkHistory()].filter(Boolean);
  return candidates.find((item) => (
    item.success
    && sameOllamaModel(item.model, clean)
    && flightRecorderMachineKey(item) === machineKey
  )) || null;
}

function flightRecorderOllamaVersion(scan, runtime) {
  if (runtime === "wsl") {
    return scan?.runtimes?.ollama_wsl?.version
      || scan?.runtimes?.wsl?.ollama_version
      || "";
  }
  return scan?.runtimes?.ollama?.version || "";
}

function flightRecorderCapture(model = els.benchmarkModelInput?.value || state.benchmark?.model || "") {
  const scan = state.scan;
  const clean = normalizeOllamaRef(model);
  if (!scan?.machine_key || !clean) return null;
  const benchmark = flightRecorderBenchmarkFor(clean);
  if (!benchmark) return null;
  const doctor = hardwareDoctorSnapshot(scan);
  const proof = releaseProof();
  const runtime = defaultOllamaRuntime(clean);
  const runtimeEvidence = doctorRuntimeEvidence(scan, clean);
  const tuning = benchmark.tuning || activeModelAutopilotProfile(clean)?.tuning || null;
  const autopilotKey = benchmark.autopilot_active_profile || activeModelAutopilotProfile(clean)?.key || "default";
  const measurementSource = String(benchmark.measurement_source || "legacy_history");
  const exactBenchmark = measurementSource === "ollama_api";
  const runtimeEvidenceSource = benchmark.runtime_evidence_source || runtimeEvidence?.source || "";
  const capturedAtMs = Number(benchmark.created_at_ms || Date.now());
  const trustLevel = exactBenchmark && runtimeEvidenceSource
    ? "high"
    : exactBenchmark
      ? "mixed"
      : "low";
  return {
    schema: "outilsia.flight_recorder.capture.v1",
    captured_at: new Date(capturedAtMs).toISOString(),
    captured_at_ms: capturedAtMs,
    binding: {
      machine_key: scan.machine_key,
      model: clean,
      runtime,
      execution_mode: benchmark.execution_mode || "auto",
      benchmark_protocol: benchmark.benchmark_protocol || benchmark.protocol || "standard",
      prompt: benchmark.prompt || "",
      autopilot_profile: autopilotKey,
      tuning
    },
    release: {
      app_version: proof.app_version || "",
      build_id: proof.build_id || "",
      source_commit: proof.source_commit || ""
    },
    machine: {
      name: scan.name || "Machine IA locale",
      os: [scan.os_name, scan.os_version].filter(Boolean).join(" "),
      cpu: scan.cpu_name || "",
      ram_gb: Number(scan.ram_gb || 0),
      gpu: scan.gpu_name || "",
      vram_gb: Number(scan.vram_gb || 0)
    },
    environment: {
      gpu_driver: doctor?.gpu?.driver_version || "",
      cuda_driver_max: doctor?.gpu?.cuda_version || "",
      rocm_version: doctor?.gpu?.rocm_version || "",
      vulkan_version: doctor?.gpu?.vulkan_version || "",
      runtime_driver_matrix: doctor?.runtime?.driver_intelligence?.matrix_version || "",
      recommended_gpu_backend: doctor?.runtime?.driver_intelligence?.backend?.recommended || "",
      ollama_version: flightRecorderOllamaVersion(scan, runtime),
      performance_state: doctor?.gpu?.performance_state || "",
      rebar_status: doctor?.gpu?.rebar_status || "unknown",
      pcie_link: doctor?.gpu?.pcie_link_width_current || doctor?.gpu?.pcie_link_width_max
        ? `x${doctor?.gpu?.pcie_link_width_current || "?"}/x${doctor?.gpu?.pcie_link_width_max || "?"}`
        : ""
    },
    metrics: {
      generation_tokens_per_second: Number(benchmark.estimated_tokens_per_second || 0),
      prompt_tokens_per_second: Number(benchmark.prompt_tokens_per_second || 0),
      load_duration_ms: Number(benchmark.load_duration_ms || 0),
      total_duration_ms: Number(benchmark.total_duration_ms || benchmark.elapsed_ms || 0),
      eval_duration_ms: Number(benchmark.eval_duration_ms || 0),
      gpu_offload_percent: Number(benchmark.runtime_gpu_offload_percent ?? runtimeEvidence?.gpu_offload_percent ?? 0),
      temperature_c: Number(doctor?.gpu?.temperature_c || 0),
      power_draw_w: Number(doctor?.gpu?.power_draw_w || 0)
    },
    provenance: {
      benchmark_source: measurementSource,
      runtime_evidence_source: runtimeEvidenceSource,
      hardware_source: doctor?.gpu?.source || doctor?.source || "scan système",
      thermal_is_instantaneous: true
    },
    trust: {
      level: trustLevel,
      reasons: [
        exactBenchmark ? "métriques exactes Ollama API" : `mesure ${measurementSource || "non documentée"}`,
        runtimeEvidenceSource ? `allocation ${runtimeEvidenceSource}` : "allocation CPU/GPU non prouvée",
        doctor?.gpu?.source ? `matériel ${doctor.gpu.source}` : "matériel issu du scan"
      ],
      physical_field_proof: false
    }
  };
}

function flightRecorderBindingKey(capture) {
  if (!capture?.binding?.machine_key || !capture?.binding?.model) return "";
  return `${capture.binding.machine_key}|${normalizeOllamaRef(capture.binding.model)}`;
}

function activeFlightRecorderReference(capture = flightRecorderCapture()) {
  const bindingKey = flightRecorderBindingKey(capture);
  if (!bindingKey) return null;
  const store = readFlightRecorderStore();
  const activeId = store.active_by_binding[bindingKey] || "";
  return store.references.find((item) => item.id === activeId)
    || store.references.find((item) => flightRecorderBindingKey(item.capture) === bindingKey)
    || null;
}

function flightRecorderMetricDelta(spec, referenceValue, currentValue, comparable) {
  const reference = Number(referenceValue || 0);
  const current = Number(currentValue || 0);
  if (!spec.zero_valid && (reference <= 0 || current <= 0)) return null;
  if (spec.zero_valid && (!Number.isFinite(reference) || !Number.isFinite(current))) return null;
  const delta = current - reference;
  const percent = reference !== 0 ? (delta / Math.abs(reference)) * 100 : null;
  let rawStatus = "stable";
  if (spec.kind === "lower_percent") {
    if (percent <= spec.bad) rawStatus = "regression";
    else if (percent <= spec.warn) rawStatus = "watch";
    else if (percent >= Math.abs(spec.warn)) rawStatus = "improved";
  } else if (spec.kind === "higher_percent") {
    if (percent >= spec.bad) rawStatus = "regression";
    else if (percent >= spec.warn) rawStatus = "watch";
    else if (percent <= -Math.abs(spec.warn)) rawStatus = "improved";
  } else if (spec.kind === "lower_absolute") {
    if (delta <= spec.bad) rawStatus = "regression";
    else if (delta <= spec.warn) rawStatus = "watch";
    else if (delta >= Math.abs(spec.warn)) rawStatus = "improved";
  } else if (spec.kind === "higher_absolute") {
    if (delta >= spec.bad) rawStatus = "regression";
    else if (delta >= spec.warn) rawStatus = "watch";
    else if (delta <= -Math.abs(spec.warn)) rawStatus = "improved";
  }
  return {
    key: spec.key,
    label: spec.label,
    unit: spec.unit,
    reference,
    current,
    delta: Number(delta.toFixed(2)),
    delta_percent: percent == null ? null : Number(percent.toFixed(1)),
    status: comparable ? rawStatus : "informational",
    raw_status: rawStatus,
    interpretation: spec.interpretation
  };
}

function compareFlightRecorderCaptures(referenceCapture, currentCapture) {
  if (!referenceCapture || !currentCapture) return null;
  const sameTuning = canonicalJson(referenceCapture.binding?.tuning || {}) === canonicalJson(currentCapture.binding?.tuning || {});
  const comparableChecks = [
    [referenceCapture.binding?.machine_key === currentCapture.binding?.machine_key, "machine différente"],
    [sameOllamaModel(referenceCapture.binding?.model, currentCapture.binding?.model), "modèle différent"],
    [referenceCapture.binding?.runtime === currentCapture.binding?.runtime, "runtime différent"],
    [referenceCapture.binding?.execution_mode === currentCapture.binding?.execution_mode, "mode CPU/GPU différent"],
    [referenceCapture.binding?.benchmark_protocol === currentCapture.binding?.benchmark_protocol, "protocole différent"],
    [referenceCapture.binding?.prompt === currentCapture.binding?.prompt, "prompt différent"],
    [sameTuning, "réglage Autopilot différent"]
  ];
  const blockers = comparableChecks.filter(([ok]) => !ok).map(([, label]) => label);
  const comparable = blockers.length === 0;
  const specs = [
    { key: "generation_tokens_per_second", label: "Génération", unit: "tok/s", kind: "lower_percent", warn: -10, bad: -20, interpretation: "Débit de génération Ollama." },
    { key: "prompt_tokens_per_second", label: "Préremplissage", unit: "tok/s", kind: "lower_percent", warn: -12, bad: -25, interpretation: "Traitement du prompt avant génération." },
    { key: "load_duration_ms", label: "Chargement", unit: "ms", kind: "higher_percent", warn: 25, bad: 50, interpretation: "Chargement du modèle ; le cache chaud ou froid peut influencer ce signal." },
    { key: "gpu_offload_percent", label: "Offload GPU", unit: "%", kind: "lower_absolute", warn: -10, bad: -30, zero_valid: true, interpretation: "Part du modèle observée en VRAM par Ollama." },
    { key: "temperature_c", label: "Température", unit: "°C", kind: "higher_absolute", warn: 10, bad: 18, interpretation: "Instantané du scan, corrélé mais non synchronisé avec toute la charge." }
  ];
  const metrics = specs.map((spec) => {
    if (spec.key === "gpu_offload_percent" && (!referenceCapture.provenance?.runtime_evidence_source || !currentCapture.provenance?.runtime_evidence_source)) return null;
    if (spec.key === "temperature_c" && (!referenceCapture.metrics?.temperature_c || !currentCapture.metrics?.temperature_c)) return null;
    return flightRecorderMetricDelta(spec, referenceCapture.metrics?.[spec.key], currentCapture.metrics?.[spec.key], comparable);
  }).filter(Boolean);
  const changedFacts = [];
  const factFields = [
    ["gpu_driver", "Pilote GPU"],
    ["cuda_driver_max", "CUDA pilote"],
    ["rocm_version", "ROCm"],
    ["ollama_version", "Ollama"],
    ["performance_state", "État GPU"],
    ["rebar_status", "ReBAR"],
    ["pcie_link", "Lien PCIe"]
  ];
  for (const [key, label] of factFields) {
    const before = String(referenceCapture.environment?.[key] || "");
    const after = String(currentCapture.environment?.[key] || "");
    if (before && after && before !== after) changedFacts.push({ key, label, before, after });
  }
  if (referenceCapture.release?.build_id !== currentCapture.release?.build_id) {
    changedFacts.push({
      key: "app_build",
      label: "Build OutilsIA",
      before: referenceCapture.release?.build_id || "inconnu",
      after: currentCapture.release?.build_id || "inconnu"
    });
  }
  const possibleCauses = [];
  if (changedFacts.some((item) => item.key === "gpu_driver" || item.key === "cuda_driver_max" || item.key === "rocm_version")) {
    possibleCauses.push("Le pilote ou le runtime GPU a changé ; c'est une cause possible, pas une causalité démontrée.");
  }
  if (changedFacts.some((item) => item.key === "ollama_version")) {
    possibleCauses.push("La version d'Ollama a changé et peut expliquer une partie de l'écart.");
  }
  if (metrics.some((item) => item.key === "gpu_offload_percent" && ["watch", "regression"].includes(item.raw_status))) {
    possibleCauses.push("L'offload GPU observé a diminué ; davantage de calcul peut être reparti vers le CPU ou la RAM.");
  }
  if (metrics.some((item) => item.key === "temperature_c" && ["watch", "regression"].includes(item.raw_status))) {
    possibleCauses.push("La température instantanée est plus haute ; une pression thermique est possible, sans preuve de throttling continu.");
  }
  if (comparable && metrics.some((item) => ["watch", "regression"].includes(item.raw_status)) && !possibleCauses.length) {
    possibleCauses.push("Aucun changement déterministe n'est identifié ; charge système, cache du modèle ou état thermique restent des causes possibles.");
  }
  const regressionCount = metrics.filter((item) => item.status === "regression").length;
  const watchCount = metrics.filter((item) => item.status === "watch").length;
  const improvedCount = metrics.filter((item) => item.status === "improved").length;
  const overall = !comparable
    ? "not_comparable"
    : regressionCount
      ? "regression"
      : watchCount
        ? "watch"
        : improvedCount
          ? "improved"
          : "stable";
  const environmentChanged = changedFacts.some((item) => item.key !== "app_build");
  const confidence = !comparable
    ? "low"
    : referenceCapture.trust?.level === "high" && currentCapture.trust?.level === "high" && !environmentChanged
      ? "high"
      : "mixed";
  const headlines = {
    not_comparable: "Mesures affichées, conclusion suspendue",
    regression: "Régression locale détectée",
    watch: "Écart à surveiller",
    improved: "Performance locale en hausse",
    stable: "Performance locale stable"
  };
  return {
    schema: "outilsia.flight_recorder.comparison.v1",
    compared_at: currentCapture.captured_at || new Date().toISOString(),
    overall,
    headline: headlines[overall],
    comparable,
    blockers,
    confidence,
    metrics,
    changed_facts: changedFacts,
    possible_causes: possibleCauses,
    statement: comparable
      ? "Le verdict compare des mesures locales comparables ; les causes restent des hypothèses sauf preuve explicite."
      : `Pas de verdict de régression : ${blockers.join(", ")}.`,
    physical_field_proof: false
  };
}

function flightRecorderSnapshot() {
  const current = flightRecorderCapture();
  const reference = activeFlightRecorderReference(current);
  const comparison = reference ? compareFlightRecorderCaptures(reference.capture, current) : null;
  return { current, reference, comparison };
}

function flightRecorderSummary() {
  const snapshot = flightRecorderSnapshot();
  const bindingKey = flightRecorderBindingKey(snapshot.current);
  const store = readFlightRecorderStore();
  const historyCount = bindingKey
    ? store.references.filter((item) => flightRecorderBindingKey(item.capture) === bindingKey).length
    : 0;
  if (!snapshot.reference) return null;
  return {
    schema: FLIGHT_RECORDER_PROTOCOL,
    local_only: true,
    physical_field_proof: false,
    history_count: historyCount,
    reference: {
      id: snapshot.reference.id,
      captured_at: snapshot.reference.capture?.captured_at || "",
      model: snapshot.reference.capture?.binding?.model || "",
      runtime: snapshot.reference.capture?.binding?.runtime || "",
      trust: snapshot.reference.capture?.trust?.level || "low"
    },
    comparison: snapshot.comparison ? {
      compared_at: snapshot.comparison.compared_at,
      overall: snapshot.comparison.overall,
      headline: snapshot.comparison.headline,
      comparable: snapshot.comparison.comparable,
      confidence: snapshot.comparison.confidence,
      blockers: snapshot.comparison.blockers,
      metrics: snapshot.comparison.metrics,
      changed_facts: snapshot.comparison.changed_facts,
      possible_causes: snapshot.comparison.possible_causes,
      statement: snapshot.comparison.statement
    } : null
  };
}

function flightRecorderExportDocument() {
  const snapshot = flightRecorderSnapshot();
  const store = readFlightRecorderStore();
  const bindingKey = flightRecorderBindingKey(snapshot.current);
  return {
    schema: FLIGHT_RECORDER_PROTOCOL,
    exported_at: new Date().toISOString(),
    scope: "local_performance_reference",
    local_only: true,
    physical_field_proof: false,
    current: snapshot.current,
    active_reference: snapshot.reference,
    comparison: snapshot.comparison,
    history: bindingKey
      ? store.references.filter((item) => flightRecorderBindingKey(item.capture) === bindingKey)
      : []
  };
}

function flightRecorderMarkdown(document = flightRecorderExportDocument()) {
  const comparison = document.comparison;
  const reference = document.active_reference?.capture;
  const current = document.current;
  if (!reference) return "## Flight Recorder\n\n- Aucune référence locale définie.";
  const lines = [
    "## Flight Recorder",
    "",
    `- Référence: ${reference.captured_at} · ${reference.binding.model}`,
    `- Mesure actuelle: ${current?.captured_at || "indisponible"}`,
    `- Verdict: ${comparison?.headline || "comparaison indisponible"}`,
    `- Comparable: ${comparison?.comparable ? "oui" : "non"}`,
    `- Confiance: ${comparison?.confidence || "faible"}`,
    "- Portée: référence locale uniquement, aucune preuve terrain physique.",
    ""
  ];
  if (comparison?.metrics?.length) {
    lines.push("### Mesures", "");
    for (const metric of comparison.metrics) {
      const delta = metric.delta_percent == null
        ? `${metric.delta >= 0 ? "+" : ""}${metric.delta}`
        : `${metric.delta_percent >= 0 ? "+" : ""}${metric.delta_percent} %`;
      lines.push(`- ${metric.label}: ${metric.reference} -> ${metric.current} ${metric.unit} (${delta}, ${metric.status})`);
    }
    lines.push("");
  }
  if (comparison?.changed_facts?.length) {
    lines.push("### Faits modifiés", "", ...comparison.changed_facts.map((item) => `- ${item.label}: ${item.before} -> ${item.after}`), "");
  }
  if (comparison?.possible_causes?.length) {
    lines.push("### Causes possibles", "", ...comparison.possible_causes.map((item) => `- ${item}`), "");
  }
  lines.push(`- Limite: ${comparison?.statement || "les causes ne sont pas établies."}`);
  return lines.join("\n");
}

function saveFlightRecorderReference() {
  const capture = flightRecorderCapture();
  if (!capture || capture.trust?.level === "low" || capture.metrics.generation_tokens_per_second <= 0) {
    setStatus("Benchmark Ollama API réussi requis avant de définir la référence", "warn");
    renderFlightRecorder();
    return;
  }
  const store = readFlightRecorderStore();
  const reference = { id: `flight-${Date.now()}-${store.references.length + 1}`, capture };
  const bindingKey = flightRecorderBindingKey(capture);
  store.references = [reference, ...store.references.filter((item) => item.id !== reference.id)];
  store.active_by_binding[bindingKey] = reference.id;
  if (!writeFlightRecorderStore(store)) {
    setStatus("Impossible d'enregistrer la référence locale", "bad");
    return;
  }
  invalidateCapabilityPassport();
  renderFlightRecorder();
  renderCapabilityPassportPanel();
  renderReadinessPanel();
  renderStrategyBridgePanel();
  renderFieldTestPanel();
  setStatus("Référence Flight Recorder enregistrée localement", "ok");
}

function activateFlightRecorderReference(referenceId) {
  const current = flightRecorderCapture();
  const store = readFlightRecorderStore();
  const reference = store.references.find((item) => item.id === referenceId);
  if (!current || !reference || flightRecorderBindingKey(reference.capture) !== flightRecorderBindingKey(current)) {
    setStatus("Cette référence ne correspond pas à la machine et au modèle actifs", "warn");
    return;
  }
  store.active_by_binding[flightRecorderBindingKey(current)] = reference.id;
  writeFlightRecorderStore(store);
  invalidateCapabilityPassport();
  renderFlightRecorder();
  renderCapabilityPassportPanel();
  renderReadinessPanel();
  renderStrategyBridgePanel();
  renderFieldTestPanel();
  setStatus("Référence Flight Recorder réactivée", "ok");
}

function restorePreviousFlightRecorderReference() {
  const current = flightRecorderCapture();
  const bindingKey = flightRecorderBindingKey(current);
  const store = readFlightRecorderStore();
  const matching = store.references.filter((item) => flightRecorderBindingKey(item.capture) === bindingKey);
  const activeId = store.active_by_binding[bindingKey] || matching[0]?.id || "";
  const previous = matching.find((item) => item.id !== activeId);
  if (!previous) {
    setStatus("Aucune ancienne référence disponible", "warn");
    return;
  }
  activateFlightRecorderReference(previous.id);
}

function compareCurrentFlightRecorder() {
  const snapshot = flightRecorderSnapshot();
  if (!snapshot.reference || !snapshot.current) {
    setStatus("Référence et benchmark actuel requis pour comparer", "warn");
    renderFlightRecorder();
    return;
  }
  renderFlightRecorder();
  renderReadinessPanel();
  renderStrategyBridgePanel();
  const tone = snapshot.comparison.overall === "regression"
    ? "bad"
    : snapshot.comparison.overall === "watch" || !snapshot.comparison.comparable
      ? "warn"
      : "ok";
  setStatus(snapshot.comparison.comparable ? snapshot.comparison.headline : "Comparaison informative : conditions différentes", tone);
}

async function copyFlightRecorderJson() {
  await navigator.clipboard.writeText(JSON.stringify(flightRecorderExportDocument(), null, 2));
  setStatus("Flight Recorder JSON copié", "ok");
}

async function copyFlightRecorderMarkdown() {
  await navigator.clipboard.writeText(flightRecorderMarkdown());
  setStatus("Flight Recorder Markdown copié", "ok");
}

function renderFlightRecorder() {
  if (!els.flightRecorderBox) return;
  const snapshot = flightRecorderSnapshot();
  const current = snapshot.current;
  const reference = snapshot.reference;
  const comparison = snapshot.comparison;
  const store = readFlightRecorderStore();
  const bindingKey = flightRecorderBindingKey(current);
  const history = bindingKey
    ? store.references.filter((item) => flightRecorderBindingKey(item.capture) === bindingKey)
    : [];
  const activeId = reference?.id || "";
  els.saveFlightReferenceBtn.disabled = !current || current.trust?.level === "low";
  els.compareFlightReferenceBtn.disabled = !current || !reference;
  els.restoreFlightReferenceBtn.disabled = history.filter((item) => item.id !== activeId).length === 0;
  els.copyFlightRecorderJsonBtn.disabled = !reference;
  els.copyFlightRecorderMarkdownBtn.disabled = !reference;
  els.saveFlightReferenceBtn.textContent = reference ? "Nouvelle référence" : "Définir la référence";
  if (!state.scan) {
    els.flightRecorderState.textContent = "scan requis";
    els.flightRecorderBox.className = "flight-recorder-box empty";
    els.flightRecorderBox.textContent = "Scannez la machine puis lancez un benchmark Ollama exact.";
    return;
  }
  if (!current) {
    els.flightRecorderState.textContent = "benchmark requis";
    els.flightRecorderBox.className = "flight-recorder-box empty";
    els.flightRecorderBox.textContent = "Lancez un benchmark sur le modèle choisi. Les anciens tests d'une autre machine ne sont jamais réutilisés comme référence.";
    return;
  }
  if (!reference) {
    els.flightRecorderState.textContent = "référence à définir";
    els.flightRecorderBox.className = "flight-recorder-box";
    els.flightRecorderBox.innerHTML = `
      <div class="flight-recorder-head neutral">
        <strong>${escapeHtml(current.binding.model)} prêt pour une référence locale</strong>
        <span>${escapeHtml(current.metrics.generation_tokens_per_second)} tok/s · ${escapeHtml(current.binding.runtime)} · confiance ${escapeHtml(current.trust.level)}</span>
      </div>
      <p class="flight-recorder-note">La sauvegarde est explicite, locale et liée à cette machine. Elle ne devient pas une preuve terrain physique.</p>
    `;
    return;
  }
  const tone = comparison?.overall === "regression"
    ? "bad"
    : comparison?.overall === "watch" || comparison?.overall === "not_comparable"
      ? "warn"
      : comparison?.overall === "improved"
        ? "ok"
        : "neutral";
  const metricHtml = (comparison?.metrics || []).map((metric) => {
    const delta = metric.delta_percent == null
      ? `${metric.delta >= 0 ? "+" : ""}${metric.delta}`
      : `${metric.delta_percent >= 0 ? "+" : ""}${metric.delta_percent} %`;
    return `
      <div class="flight-metric ${escapeHtml(metric.status)}">
        <span>${escapeHtml(metric.label)}</span>
        <strong>${escapeHtml(metric.current)} ${escapeHtml(metric.unit)}</strong>
        <small>réf. ${escapeHtml(metric.reference)} · ${escapeHtml(delta)}</small>
      </div>
    `;
  }).join("");
  const factsHtml = comparison?.changed_facts?.length
    ? `<div class="flight-recorder-list"><strong>Faits modifiés</strong>${comparison.changed_facts.map((item) => `<span>${escapeHtml(item.label)} : ${escapeHtml(item.before)} → ${escapeHtml(item.after)}</span>`).join("")}</div>`
    : "";
  const causesHtml = comparison?.possible_causes?.length
    ? `<div class="flight-recorder-list"><strong>Causes possibles</strong>${comparison.possible_causes.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
    : "";
  const historyHtml = history.length > 1 ? `
    <div class="flight-history">
      <strong>Références locales</strong>
      ${history.slice(0, 5).map((item) => `
        <button type="button" data-flight-reference="${escapeHtml(item.id)}" ${item.id === activeId ? "disabled" : ""}>
          ${item.id === activeId ? "Active · " : ""}${escapeHtml(new Date(item.capture.captured_at).toLocaleString("fr-FR"))} · ${escapeHtml(item.capture.metrics.generation_tokens_per_second)} tok/s
        </button>
      `).join("")}
    </div>
  ` : "";
  els.flightRecorderState.textContent = comparison?.headline || "référence prête";
  els.flightRecorderBox.className = "flight-recorder-box";
  els.flightRecorderBox.innerHTML = `
    <div class="flight-recorder-head ${tone}">
      <strong>${escapeHtml(comparison?.headline || "Référence prête")}</strong>
      <span>Confiance ${escapeHtml(comparison?.confidence || "faible")} · référence ${escapeHtml(new Date(reference.capture.captured_at).toLocaleString("fr-FR"))}</span>
    </div>
    ${comparison?.blockers?.length ? `<p class="flight-recorder-warning">Conclusion suspendue : ${escapeHtml(comparison.blockers.join(", "))}.</p>` : ""}
    ${metricHtml ? `<div class="flight-metrics">${metricHtml}</div>` : ""}
    ${factsHtml}
    ${causesHtml}
    <p class="flight-recorder-note">${escapeHtml(comparison?.statement || "La référence reste locale.")}</p>
    ${historyHtml}
  `;
}

async function runBenchmark(options = {}) {
  const forceCpu = Boolean(options.forceCpu);
  const rawModel = els.benchmarkModelInput.value.trim();
  const model = ollamaActionRef(rawModel);
  if (!model) {
    setStatus("Modele Ollama requis pour benchmark", "bad");
    return;
  }
  els.benchmarkModelInput.value = model;
  els.chatModelInput.value = model;
  if (isOllamaModelInstalling(model)) {
    const message = `${model} est encore en téléchargement. Attends la fin du pull avant de lancer le benchmark.`;
    appendOperationLine(message, "alerte");
    setOperationLive(true);
    renderOperationMonitor("Téléchargement en cours");
    setStatus(message, "warn");
    return;
  }
  if (!isOllamaModelInstalled(model)) {
    const message = `${model} n'est pas encore installé. OutilsIA l'installe avant de lancer le benchmark.`;
    appendOperationLine(message, "info");
    setStatus(`Installation préalable de ${model}...`, "warn");
    await installRecommendedModel(model);
    if (!isOllamaModelInstalled(model)) {
      const blocked = `${model} n'est pas confirmé dans Ollama. Relance le scan ou termine le téléchargement avant le benchmark.`;
      appendOperationLine(blocked, "alerte");
      setStatus(blocked, "warn");
      return;
    }
  }
  els.benchmarkBtn.disabled = true;
  const activeTuning = forceCpu ? null : activeModelAutopilotProfile(model);
  resetOperationConsole(`${forceCpu ? "Retest CPU" : "Benchmark Ollama"} lancé : ${model}`);
  setOperationFocus(`${forceCpu ? "Retest CPU sans GPU" : "Benchmark en cours"} : ${model}`, [
    forceCpu ? "Ollama force num_gpu=0 pour isoler le pilote GPU." : "Ollama reçoit un prompt court.",
    activeTuning ? `Profil actif : ${activeTuning.label} · ${modelAutopilotTuningLabel(activeTuning.tuning)}.` : "Réglages Ollama par défaut.",
    "Le résultat séparera chargement, préremplissage et débit de génération quand l'API Ollama les expose.",
    "Reste sur cet écran : le suivi direct apparaît ici."
  ]);
  appendOperationLine(`Prompt : ${els.benchmarkPromptInput.value.trim() || "prompt court par défaut"}`, "info");
  els.benchmarkResult.textContent = forceCpu ? "Retest CPU Ollama en cours..." : "Benchmark Ollama en cours...";
  setStatus(`${forceCpu ? "Retest CPU" : "Benchmark"} ${model} en cours...`);
  try {
    const result = invoke
      ? await invoke("benchmark_ollama", {
          request: {
            model,
            prompt: els.benchmarkPromptInput.value.trim(),
            timeout_seconds: 45,
            force_cpu: forceCpu,
            ...(forceCpu ? {} : modelAutopilotTuningPayload(model)),
            ...ollamaRuntimePayload(model)
          }
        })
      : { ...demoBenchmark(model), execution_mode: forceCpu ? "cpu" : "auto" };
    const normalizedResult = {
      ...result,
      machine_key: state.scan?.machine_key || "",
      runtime: defaultOllamaRuntime(model),
      execution_mode: result.execution_mode || (forceCpu ? "cpu" : "auto"),
      autopilot_active_profile: activeTuning?.key || "",
      tuning: activeTuning?.tuning || null
    };
    state.benchmark = normalizedResult;
    renderBenchmark(normalizedResult);
    appendBenchmarkToConsole(normalizedResult);
    saveBenchmarkHistoryEntry(normalizedResult);
    refreshDigitalTwinAfterProofChange();
    renderPrimaryAction();
    renderFirstTestPanel();
    renderPreparePanel();
    renderReadinessPanel();
    renderArenaPanel();
    renderPrivateWorkloadPanel();
    renderStrategyBridgePanel();
    renderFieldTestPanel();
    renderModelAutopilot();
    renderFlightRecorder();
    await refreshAuthState();
    finishOperationMonitor(normalizedResult.success ? "Benchmark terminé" : "Benchmark terminé avec erreur");
    setStatus(normalizedResult.success ? "Benchmark terminé" : "Benchmark terminé avec erreur", normalizedResult.success ? "ok" : "warn");
  } catch (error) {
    const message = friendlyOllamaError(error);
    appendOperationLine(message, "erreur");
    finishOperationMonitor("Benchmark en erreur");
    els.benchmarkResult.textContent = message;
    setStatus(message, "bad");
  } finally {
    els.benchmarkBtn.disabled = false;
    renderModelAutopilot();
    renderFlightRecorder();
  }
}

function appendBenchmarkToConsole(result) {
  appendOperationLine(`${result.success ? "Test réussi" : "Test terminé avec erreur"} : ${result.model}`, result.success ? "ok" : "erreur");
  appendOperationLine(`Temps: ${result.elapsed_ms ?? 0} ms · ${benchmarkSpeedLabel(result)}: ${result.estimated_tokens_per_second ?? 0} tok/s · ${benchmarkMeasurementLabel(result)} · Mode: ${String(result.execution_mode || "auto") === "cpu" ? "CPU seul" : "automatique"}`, "bench");
  const metricDetails = benchmarkMetricDetails(result);
  if (metricDetails) appendOperationLine(metricDetails, "bench");
  const output = result.success
    ? result.output_preview || "Sortie vide"
    : friendlyOllamaError(result.error || result.output_preview || "Sortie vide");
  appendOperationLine(output, result.success ? "réponse" : "erreur");
}

function preferredChatModel() {
  const benchmarkModel = els.benchmarkModelInput?.value?.trim();
  const chatModel = els.chatModelInput?.value?.trim();
  const installed = (state.scan?.installed_models || []).map(modelLabel).find(Boolean);
  return chatModel || benchmarkModel || installed || "qwen3:0.6b";
}

function installedModelForPatterns(patterns = [], options = {}) {
  const installed = Array.from(installedOllamaRefs());
  const exclude = options.exclude || [];
  return installed.find((ref) => {
    const text = String(ref || "");
    return patterns.some((pattern) => pattern.test(text))
      && !exclude.some((pattern) => pattern.test(text));
  }) || "";
}

function chatModelPresets() {
  const presets = [];
  const add = (key, label, model, reason) => {
    const clean = normalizeOllamaRef(model);
    if (!clean || presets.some((item) => item.key === key)) return;
    presets.push({
      key,
      label,
      model: clean,
      reason,
      installed: isOllamaModelInstalled(clean),
      benchmark: successfulBenchmarkFor(clean)
    });
  };
  const recommended = recommendedModelState();
  const arena = arenaWinners(readLastArenaRun()?.results || []);
  const assistantModel = installedModelForPatterns([/hermes/i, /mistral/i, /llama/i]) || recommended.ref;
  const codeModel = installedModelForPatterns([/deepseek/i, /coder/i, /code/i])
    || installedModelForPatterns([/qwen/i], { exclude: [/0\.6b/i] })
    || recommended.ref;
  const memoryModel = installedModelForPatterns([/hermes/i]) || arena.memory?.model || assistantModel || recommended.ref;
  const compromiseModel = arena.compromise?.model || recommended.ref || assistantModel;
  add("quick", "Rapide", "qwen3:0.6b", "Vérifier vite que le dialogue local répond.");
  add("assistant", "Assistant", assistantModel, "Conversation, synthèse, mémoire et décisions.");
  add("code", "Code", codeModel, "Code, debug court et explications techniques.");
  add("memory", "Mémoire", memoryModel, "Notes projet, MemoryForge et Obsidian.");
  add("compromise", "Compromis", compromiseModel, "Meilleur équilibre mesuré par l'Arena locale.");
  return presets;
}

function chatPresetPrompt(key, model) {
  if (key === "code") {
    return "Explique ce court script ou propose une version plus robuste en restant concis.";
  }
  if (key === "memory") {
    return "Résume cette session OutilsIA en note MemoryForge utile : décision, modèle testé, résultat, prochaine action.";
  }
  if (key === "assistant") {
    return "Explique simplement ce que mon PC peut faire tourner en IA locale et quel modèle essayer ensuite.";
  }
  if (key === "compromise") {
    return `Teste ${model} sur une réponse utile : que dois-je faire ensuite avec cette machine IA locale ?`;
  }
  return "Pourquoi la VRAM est importante pour un LLM local ?";
}

function readChatHistory() {
  try {
    const raw = window.localStorage?.getItem(CHAT_HISTORY_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function writeChatHistory(items = []) {
  window.localStorage?.setItem(CHAT_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_CHAT_HISTORY)));
  renderChatHistory();
}

function chatSystemPrompt(model) {
  const clean = normalizeOllamaRef(model);
  const scan = state.scan || {};
  const info = modelInfo(clean);
  const role = clean.includes("hermes")
    ? "assistant mémoire/projets, utile pour MemoryForge et décisions"
    : clean.includes("deepseek") || clean.includes("coder") || clean.includes("code")
      ? "assistant code/debug, utile pour explications techniques"
      : clean.includes("qwen")
        ? "assistant général rapide, utile pour test, raisonnement court et français"
        : clean.includes("mistral") || clean.includes("llama")
          ? "assistant généraliste, utile pour rédaction et synthèse"
          : "assistant IA local";
  return [
    "Contexte système OutilsIA Local Cockpit.",
    `Modèle: ${clean || "modèle local"}.`,
    `Rôle conseillé: ${role}.`,
    `Force connue: ${info.strength}`,
    `Limite connue: ${info.limit}`,
    `Machine: ${scan.gpu_name || "GPU non scanné"}, ${formatGb(scan.vram_gb)} VRAM, ${formatGb(scan.ram_gb)} RAM.`,
    "Réponds en français naturel, commence par le verdict utile, reste concret et n'invente pas de mesure absente.",
    "Si une action est utile, donne la prochaine action OutilsIA en une ligne."
  ].join("\n");
}

function buildLocalChatPrompt(model, userPrompt) {
  return [
    chatSystemPrompt(model),
    "",
    "Question utilisateur :",
    userPrompt
  ].join("\n");
}

function saveChatHistoryEntry(result, userPrompt, systemPrompt) {
  if (!result?.output_preview) return;
  const entry = {
    id: `chat-${Date.now()}`,
    created_at_ms: Date.now(),
    model: result.model || "",
    prompt: userPrompt || result.prompt || "",
    system_prompt: systemPrompt || "",
    output_preview: result.output_preview || "",
    elapsed_ms: Number(result.elapsed_ms || 0),
    estimated_tokens_per_second: Number(result.estimated_tokens_per_second || 0),
    success: Boolean(result.success)
  };
  writeChatHistory([entry, ...readChatHistory()].slice(0, MAX_CHAT_HISTORY));
}

function chatHistoryMarkdown(items = readChatHistory()) {
  const rows = Array.isArray(items) ? items : [];
  return [
    "# Historique dialogue local OutilsIA",
    "",
    rows.length ? "Conversations conservées localement depuis l'interface OutilsIA." : "Aucun dialogue local sauvegardé.",
    "",
    ...rows.slice(0, 12).map((item, index) => [
      `## ${index + 1}. ${item.model || "modèle local"}`,
      "",
      `- Date: ${new Date(Number(item.created_at_ms || Date.now())).toISOString()}`,
      `- Succès: ${item.success ? "oui" : "non"}`,
      `- Temps: ${item.elapsed_ms || 0} ms`,
      `- Vitesse: ${item.estimated_tokens_per_second || 0} tok/s`,
      "",
      "### Prompt système",
      "",
      "```text",
      item.system_prompt || "",
      "```",
      "",
      "### Question",
      "",
      "```text",
      item.prompt || "",
      "```",
      "",
      "### Réponse",
      "",
      "```text",
      item.output_preview || "",
      "```"
    ].join("\n"))
  ].join("\n");
}

function renderChatHistory() {
  if (!els.chatHistoryBox) return;
  const items = readChatHistory();
  els.chatHistoryState.textContent = `${items.length} échange${items.length > 1 ? "s" : ""}`;
  els.chatHistoryBox.className = items.length ? "chat-history-box" : "chat-history-box empty";
  els.chatHistoryBox.innerHTML = items.length
    ? items.slice(0, 3).map((item) => `
      <div class="chat-history-item">
        <strong>${escapeHtml(item.model || "modèle local")} · ${escapeHtml(item.estimated_tokens_per_second || 0)} tok/s</strong>
        <span>${escapeHtml(item.prompt || "")}</span>
        <span>${escapeHtml(item.output_preview || "")}</span>
      </div>
    `).join("")
    : "Les échanges locaux apparaîtront ici après une réponse du modèle.";
  if (els.copyChatHistoryBtn) els.copyChatHistoryBtn.disabled = !items.length;
  if (els.clearChatHistoryBtn) els.clearChatHistoryBtn.disabled = !items.length;
}

async function copyChatHistory() {
  const items = readChatHistory();
  if (!items.length) {
    setStatus("Historique dialogue vide", "warn");
    return;
  }
  await navigator.clipboard.writeText(chatHistoryMarkdown(items));
  setStatus("Historique dialogue copié", "ok");
}

function clearChatHistory() {
  const ok = window.confirm("Vider l'historique local du dialogue ?");
  if (!ok) return;
  writeChatHistory([]);
  setStatus("Historique dialogue vidé", "ok");
}

function renderChatPresets() {
  if (!els.chatPresetBox) return;
  const presets = chatModelPresets();
  els.chatPresetBox.className = presets.length ? "chat-preset-box" : "chat-preset-box empty";
  els.chatPresetBox.innerHTML = presets.length
    ? presets.map((preset) => {
        const bench = preset.benchmark
          ? `${preset.benchmark.estimated_tokens_per_second ?? "--"} tok/s`
          : preset.installed ? "installé" : "à installer";
        return `
          <button type="button" data-chat-preset="${escapeHtml(preset.key)}" ${preset.installed ? "" : "disabled"}>
            <strong>${escapeHtml(preset.label)}</strong>
            <span>${escapeHtml(preset.model)}</span>
            <em>${escapeHtml(bench)}</em>
          </button>
        `;
      }).join("")
    : "Lance un scan pour choisir automatiquement le meilleur modèle de dialogue.";
}

function applyChatPreset(key) {
  const preset = chatModelPresets().find((item) => item.key === key);
  if (!preset) {
    setStatus("Preset dialogue introuvable", "warn");
    return;
  }
  if (!preset.installed) {
    setStatus(`${preset.model} doit être installé avant le dialogue`, "warn");
    return;
  }
  els.chatModelInput.value = preset.model;
  const current = els.chatPromptInput.value.trim();
  if (!current || /Explique simplement ce que mon PC peut faire tourner|Pourquoi la VRAM/.test(current)) {
    els.chatPromptInput.value = chatPresetPrompt(preset.key, preset.model);
  }
  els.chatPromptInput.focus();
  setStatus(`Dialogue prêt avec ${preset.label} (${preset.model})`, "ok");
}

async function runLocalChat() {
  const model = preferredChatModel();
  const activeTuning = activeModelAutopilotProfile(model);
  const userPrompt = els.chatPromptInput.value.trim();
  if (!userPrompt) {
    setStatus("Question requise pour le dialogue local", "bad");
    return;
  }
  const systemPrompt = chatSystemPrompt(model);
  const prompt = buildLocalChatPrompt(model, userPrompt);
  els.chatModelInput.value = model;
  els.chatSendBtn.disabled = true;
  els.chatCopyBtn.disabled = true;
  els.chatMemoryBtn.disabled = true;
  els.chatResult.innerHTML = `
    <strong>Dialogue local en cours</strong>
    <span>${escapeHtml(model)} répond avec Ollama. La réponse apparaît ici.</span>
  `;
  setStatus(`Dialogue local ${model}...`);
  try {
    const result = invoke
      ? await invoke("chat_ollama", {
          request: {
            model,
            prompt,
            timeout_seconds: 90,
            ...modelAutopilotTuningPayload(model),
            ...ollamaRuntimePayload(model)
          }
        })
      : demoChat(model, prompt);
    result.prompt = userPrompt;
    result.system_prompt = systemPrompt;
    result.sent_prompt = prompt;
    result.autopilot_active_profile = activeTuning?.key || "";
    result.tuning = activeTuning?.tuning || null;
    result.created_at_ms = result.created_at_ms || Date.now();
    state.chatResult = result;
    saveChatHistoryEntry(result, userPrompt, systemPrompt);
    renderLocalChat(result);
    renderChatPresets();
    renderPreparePanel();
    renderReadinessPanel();
    setStatus(result.success ? "Réponse locale reçue" : "Réponse locale avec erreur", result.success ? "ok" : "warn");
  } catch (error) {
    state.chatResult = null;
    els.chatResult.textContent = friendlyOllamaError(error);
    setStatus(friendlyOllamaError(error), "bad");
  } finally {
    els.chatSendBtn.disabled = false;
    els.chatCopyBtn.disabled = !state.chatResult?.output_preview;
    els.chatMemoryBtn.disabled = !state.chatResult?.output_preview;
  }
}

async function prepareLocalAiFlow() {
  const flow = prepareFlowState();
  const model = flow.testModel;
  els.prepareBtn.disabled = true;
  els.preparePanelBtn.disabled = true;
  try {
    resetOperationConsole("Assistant local : parcours cockpit complet");
    appendOperationLine("Objectif : scan, Ollama, modèle test, benchmark, 2e modèle recommandé, PromptForge, dialogue local, Arena et rapport.", "info");
    if (!flow.scanned) {
      appendOperationLine("Étape 1/9 : scan de la machine.", "cmd");
      await scanMachine();
    }
    if (state.scan && !state.compatibility) {
      appendOperationLine("Étape 2/9 : diagnostic OutilsIA et modèles recommandés.", "cmd");
      await ensureCompatibilityLoaded();
    }
    let current = prepareFlowState();
    if (!current.ollamaReady) {
      appendOperationLine("Ollama n'est pas prêt. L'assistant ouvre l'installation puis s'arrête ici.", "alerte");
      await installOllamaRuntime();
      renderPreparePanel();
      return;
    }
    if (!current.modelReady) {
      appendOperationLine(`Étape 3/9 : installation du modèle test ${model}.`, "cmd");
      await installRecommendedModel(model);
    }
    current = prepareFlowState();
    if (!current.modelReady) {
      appendOperationLine(`Le modèle ${model} n'est pas encore détecté. Relance le scan puis reprends l'assistant.`, "alerte");
      renderPreparePanel();
      return;
    }
    if (!current.benchmarkReady) {
      appendOperationLine(`Étape 4/9 : benchmark visible de ${model}.`, "cmd");
      els.benchmarkModelInput.value = model;
      els.chatModelInput.value = model;
      await runBenchmark({ source: "prepare-flow" });
    }
    current = prepareFlowState();
    if (current.recommended?.ref) {
      if (current.recommended.installed) {
        appendOperationLine(`Étape 5/9 : deuxième modèle recommandé déjà prêt (${current.recommended.ref}).`, "ok");
      } else {
        appendOperationLine(`Étape 5/9 : deuxième modèle recommandé proposé (${current.recommended.ref}). Clique sur le bouton dédié pour le télécharger sans lancer un gros téléchargement par surprise.`, "alerte");
      }
    } else {
      appendOperationLine("Étape 5/9 : aucun deuxième modèle recommandé fiable pour l'instant.", "alerte");
    }
    current = prepareFlowState();
    if (!current.promptReady) {
      appendOperationLine("Étape 6/9 : optimisation du prompt avec PromptForge local.", "cmd");
      els.promptForgeInput.value = els.benchmarkPromptInput.value.trim() || "Explique ce que cette machine peut faire tourner en IA locale.";
      const promptResult = promptForgeOptimize(els.promptForgeInput.value);
      renderPromptForge(promptResult);
      usePromptForge("chat");
      usePromptForge("benchmark");
      savePromptToLibrary(promptResult);
      appendOperationLine(`PromptForge : ${promptResult.before.score}/100 -> ${promptResult.after.score}/100.`, "ok");
    }
    current = prepareFlowState();
    if (!current.chatReady) {
      appendOperationLine("Étape 7/9 : dialogue local préparé avec le prompt optimisé.", "ok");
      els.chatModelInput.value = model;
      if (!els.chatPromptInput.value.trim()) {
        els.chatPromptInput.value = "Explique en trois phrases ce que cette machine peut faire tourner en IA locale.";
      }
      await runLocalChat();
    }
    current = prepareFlowState();
    if (!current.arenaReady && arenaInstalledCandidates().length >= 2) {
      appendOperationLine("Étape 8/9 : Arena locale automatique sur les modèles installés.", "cmd");
      await runAutomaticArena();
    } else if (!current.arenaReady) {
      appendOperationLine("Étape 8/9 : Arena locale sautée, il faut au moins deux modèles installés.", "alerte");
    }
    current = prepareFlowState();
    if (!current.reportReady) {
      appendOperationLine("Étape 9/9 : génération du rapport final MemoryForge.", "cmd");
      generateFinalCockpitReport();
      appendOperationLine("Rapport final prêt : score, benchmark, PromptForge, Arena et recommandations.", "ok");
    }
    renderPreparePanel();
  } catch (error) {
    const message = friendlyOllamaError(error);
    appendOperationLine(message, "erreur");
    setStatus(message, "bad");
  } finally {
    els.prepareBtn.disabled = false;
    els.preparePanelBtn.disabled = false;
  }
}

async function runPrimaryCommand(command, model = "") {
  const flow = prepareFlowState();
  const recommendedRef = actionableOllamaRef(flow.recommended);
  const requestedModel = normalizeOllamaRef(model || "");
  const nextModel = requestedModel || recommendedRef || flow.testModel;

  switch (command) {
    case "prepare":
      setStatus("Préparation d'Ollama en cours...");
      await installOllamaRuntime();
      await scanMachine();
      await ensureCompatibilityLoaded();
      setStatus("Ollama prêt, recommandations chargées", "ok");
      break;
    case "install-test":
      setStatus(`Installation du modèle test ${flow.testModel}...`);
      await installRecommendedModel(flow.testModel);
      break;
    case "benchmark-test":
      els.benchmarkModelInput.value = flow.testModel;
      els.chatModelInput.value = flow.testModel;
      setStatus(`Benchmark du modèle test ${flow.testModel}...`);
      await runBenchmark({ source: "primary-action" });
      break;
    case "benchmark-test-cpu":
      els.benchmarkModelInput.value = flow.testModel;
      els.chatModelInput.value = flow.testModel;
      setStatus(`Retest CPU du modèle ${flow.testModel}...`);
      await runBenchmark({ source: "primary-action", forceCpu: true });
      break;
    case "open-gpu-driver": {
      const driver = gpuDriverLink(state.scan || {});
      if (!driver?.url) throw new Error("Aucun pilote GPU officiel identifié pour cette machine");
      if (invoke) await invoke("open_external_url", { url: driver.url });
      else window.open(driver.url, "_blank", "noopener,noreferrer");
      setStatus(`${driver.label} ouvert. Après mise à jour, relance le benchmark automatique.`, "ok");
      break;
    }
    case "install-recommended":
      if (!nextModel) throw new Error("Aucun modèle recommandé à installer");
      setStatus(`Installation du modèle recommandé ${nextModel}...`);
      await installRecommendedModel(nextModel);
      break;
    case "benchmark-recommended":
      if (!nextModel) throw new Error("Aucun modèle recommandé à benchmarker");
      els.benchmarkModelInput.value = nextModel;
      els.chatModelInput.value = nextModel;
      setStatus(`Benchmark du modèle recommandé ${nextModel}...`);
      await runBenchmark({ source: "primary-action" });
      break;
    case "arena":
      setStatus("Comparaison Arena locale en cours...");
      await runAutomaticArena();
      break;
    case "report":
      generateFinalCockpitReport();
      break;
    case "save":
      await syncDesktop();
      break;
    case "analyze":
    case "scan":
    default:
      setStatus("Analyse du PC en cours...");
      await scanMachine();
      await ensureCompatibilityLoaded();
      setStatus("Analyse prête : matériel et modèles recommandés chargés", "ok");
      break;
  }
}

async function handlePrimaryAction(event) {
  if (primaryAnalysisBusy) {
    setStatus("Une action OutilsIA est déjà en cours", "warn");
    return;
  }
  const button = event?.currentTarget || els.prepareBtn;
  const command = button?.dataset?.primaryCommand || "analyze";
  const model = button?.dataset?.primaryModel || "";
  primaryAnalysisBusy = true;
  if (button) button.disabled = true;
  renderPrimaryAction();
  try {
    await runPrimaryCommand(command, model);
  } catch (error) {
    setStatus(String(error?.message || error), "bad");
  } finally {
    primaryAnalysisBusy = false;
    if (button) button.disabled = false;
    renderPrimaryAction();
  }
}

function renderLocalChat(result) {
  const memoryHint = result.success
    ? localChatMemorySummary(result)
    : "";
  els.chatResult.innerHTML = `
    <div class="benchmark-card chat-card">
      <strong>${escapeHtml(result.success ? "Réponse locale" : "Réponse avec erreur")} - ${escapeHtml(result.model)}</strong>
      <span>Temps : ${escapeHtml(result.elapsed_ms ?? 0)} ms${result.timed_out ? " - interrompu" : ""}</span>
      <span>${escapeHtml(benchmarkSpeedLabel(result))} : ${escapeHtml(result.estimated_tokens_per_second ?? 0)} tok/s · ${escapeHtml(benchmarkMeasurementLabel(result))}</span>
      <span>${escapeHtml(result.error || result.output_preview || "Réponse vide")}</span>
      ${memoryHint ? `<span class="memory-candidate">${escapeHtml(memoryHint)}</span>` : ""}
    </div>
  `;
}

async function copyLocalChatAnswer() {
  if (!state.chatResult?.output_preview) {
    setStatus("Aucune réponse locale à copier", "warn");
    return;
  }
  const text = [
    `Modele: ${state.chatResult.model}`,
    `Temps: ${state.chatResult.elapsed_ms} ms`,
    `${benchmarkSpeedLabel(state.chatResult)}: ${state.chatResult.estimated_tokens_per_second} tok/s`,
    `Methode: ${benchmarkMeasurementLabel(state.chatResult)}`,
    "",
    state.chatResult.output_preview
  ].join("\n");
  await navigator.clipboard.writeText(text);
  setStatus("Réponse locale copiée", "ok");
}

function localChatMemoryMarkdown(result = state.chatResult) {
  const scan = state.scan || {};
  if (!result?.output_preview) return "";
  const info = modelInfo(result.model || "");
  const benchmark = successfulBenchmarkFor(result.model) || result;
  const createdAt = new Date(Number(result.created_at_ms || Date.now())).toISOString();
  const modelTag = String(result.model || "local").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return [
    "---",
    "type: dialogue_local",
    `date: ${createdAt}`,
    `machine: ${JSON.stringify(scan.name || "Machine IA locale")}`,
    `model: ${JSON.stringify(result.model || "modèle local")}`,
    "runtime: ollama",
    `elapsed_ms: ${Number(result.elapsed_ms || 0)}`,
    `tokens_per_second: ${Number(result.estimated_tokens_per_second || 0)}`,
    `success: ${Boolean(result.success)}`,
    "tags:",
    "  - outilsia",
    "  - ia-locale",
    "  - memoryforge",
    `  - modele-${modelTag || "local"}`,
    "---",
    "",
    `# Dialogue local - ${result.model}`,
    "",
    "## Contexte machine",
    "",
    `- Machine: ${scan.name || "Machine IA locale"}`,
    `- CPU: ${scan.cpu_name || "non scanné"}`,
    `- RAM: ${formatGb(scan.ram_gb)}`,
    `- GPU: ${scan.gpu_name || "non détecté"}`,
    `- VRAM: ${formatGb(scan.vram_gb)}`,
    "",
    "## Modèle",
    "",
    `- Modèle: ${result.model}`,
    `- Force: ${info.strength}`,
    `- Usage conseillé: ${info.fit}`,
    `- Limite: ${info.limit}`,
    `- Temps: ${result.elapsed_ms} ms`,
    `- ${benchmarkSpeedLabel(result)}: ${result.estimated_tokens_per_second} tok/s`,
    `- Méthode: ${benchmarkMeasurementLabel(result)}`,
    benchmark?.estimated_tokens_per_second ? `- Meilleur benchmark local connu: ${benchmark.estimated_tokens_per_second} tok/s` : "",
    "",
    result.system_prompt ? "## Prompt système OutilsIA" : "",
    result.system_prompt ? "" : "",
    result.system_prompt ? "```text" : "",
    result.system_prompt || "",
    result.system_prompt ? "```" : "",
    result.system_prompt ? "" : "",
    "## Prompt",
    "",
    "```text",
    result.prompt || els.chatPromptInput.value.trim() || "",
    "```",
    "",
    "## Réponse conservée",
    "",
    "```text",
    result.output_preview || "",
    "```",
    "",
    "## Décision OutilsIA",
    "",
    `- Conversation utile sauvegardée depuis le dialogue local avec ${result.model}.`,
    `- Profil retenu: ${info.fit}`,
    "- À relire avant de choisir ce modèle comme modèle quotidien.",
    "- Si la réponse est fiable, enrichir la fiche modèle correspondante dans Obsidian.",
    "",
    "## Prochaine action",
    "",
    "- Comparer ce résultat avec l'Arena locale ou tester un prompt plus exigeant via PromptForge."
  ].filter(Boolean).join("\n");
}

function localChatMemorySummary(result = state.chatResult) {
  if (!result?.success) return "";
  const info = modelInfo(result.model || "");
  const speed = result.estimated_tokens_per_second ? `${result.estimated_tokens_per_second} tok/s` : "vitesse non mesurée";
  return `Mémoire candidate : ${result.model} · ${speed} · ${info.fit}`;
}

async function saveLocalChatToMemory() {
  if (!state.chatResult?.output_preview) {
    setStatus("Aucune réponse locale à sauvegarder", "warn");
    return;
  }
  const note = localChatMemoryMarkdown(state.chatResult);
  const current = els.memoryText.value.trim();
  els.memoryText.value = current ? `${current}\n\n---\n\n${note}` : note;
  state.markdown = els.memoryText.value;
  els.copyBtn.disabled = false;
  els.downloadBtn.disabled = false;
  els.vaultBtn.disabled = !state.scan;
  await navigator.clipboard.writeText(note).catch(() => {});
  setStatus("Note MemoryForge ajoutée", "ok");
}

async function installRecommendedModel(model, button = null) {
  const requested = String(model || "").trim();
  const clean = preferredInstallRef(requested);
  if (!clean) {
    setStatus("Modèle Ollama manquant", "bad");
    return;
  }
  const activeModel = Object.keys(state.installingModels || {})[0] || "";
  if (activeModel && !sameOllamaModel(activeModel, clean)) {
    const message = `${activeModel} est déjà en téléchargement. Annule ou attends la fin avant d'installer ${clean}.`;
    appendOperationLine(message, "alerte");
    renderOperationMonitor("Téléchargement déjà en cours");
    setStatus(message, "warn");
    return;
  }
  resetOperationConsole(`Installation Ollama demandée : ${clean}`);
  if (requested && normalizeOllamaRef(requested) !== normalizeOllamaRef(clean)) {
    appendOperationLine(`Référence corrigée : ${requested} -> ${clean}`, "info");
  }
  setOperationFocus(`Vérification avant téléchargement : ${clean}`, [
    `Runtime ciblé : ${ollamaRuntimeCommandLabel(clean)}`,
    `Taille estimée : ${estimatedModelSizeLabel(clean)}`,
    "OutilsIA vérifie le runtime et le volume de modèles avant tout pull."
  ]);
  setStatus(`Préflight installation ${clean}...`);
  if (!hasUsableOllamaRuntime(state.scan) && invoke) {
    const message = "Aucun runtime Ollama utilisable n'est détecté. Installe Ollama Windows ou prépare Ollama dans WSL, relance le scan, puis réessaie.";
    els.benchmarkResult.innerHTML = `
      <strong>Ollama requis</strong>
      <span>${escapeHtml(message)}</span>
      <button type="button" data-install-ollama="true">Installer Ollama</button>
    `;
    appendOperationLine(message, "erreur");
    appendOperationLine("Clique sur Installer Ollama pour Windows, ou installe Ollama dans ta distribution WSL puis relance le scan.", "info");
    els.operationState.textContent = "bloqué";
    setStatus(message, "bad");
    return;
  }
  let preflight;
  try {
    preflight = await runInstallSafetyPreflight(clean);
  } catch (_) {
    preflight = evaluateInstallSafetyPreflight(clean, {
      runtime: defaultOllamaRuntime(clean),
      runtime_ready: hasUsableOllamaRuntime(state.scan),
      model_already_installed: isOllamaModelInstalled(clean),
      storage_free_gb: null,
      storage_scope: "unknown_model_store",
      storage_source: "preflight_command_unavailable",
      checked_at_ms: Date.now()
    });
    preflight.warnings.unshift("La sonde native du volume Ollama est indisponible ; vérification manuelle requise.");
    preflight.verdict = preflight.blockers.length ? "blocked" : "warning";
    preflight.allowed = preflight.verdict !== "blocked";
    preflight.requires_confirmation = preflight.allowed && !isStarterModelRef(clean);
    state.installSafetyPreflight = preflight;
    invalidateCapabilityPassport();
    appendInstallSafetyPreflight(preflight);
  }
  if (!preflight.allowed) {
    const reason = preflight.blockers[0] || "Le préflight a bloqué cette installation.";
    els.operationState.textContent = "bloqué";
    finishOperationMonitor("Installation bloquée avant téléchargement");
    els.benchmarkResult.innerHTML = `
      <strong>Installation bloquée avant téléchargement</strong>
      <span>${escapeHtml(reason)}</span>
      <span>Aucun octet du modèle n'a été téléchargé.</span>
    `;
    setStatus(reason, "bad");
    renderReadinessPanel();
    return;
  }
  if (preflight.model_already_installed) {
    els.operationState.textContent = "déjà installé";
    finishOperationMonitor("Modèle déjà présent dans le runtime ciblé");
    els.benchmarkModelInput.value = clean;
    els.chatModelInput.value = clean;
    els.benchmarkResult.innerHTML = `
      <strong>${escapeHtml(clean)} est déjà installé</strong>
      <span>Aucun téléchargement relancé. Tu peux le tester, dialoguer ou le comparer dans l'Arena.</span>
    `;
    setStatus(`${clean} déjà installé`, "ok");
    renderReadinessPanel();
    return;
  }
  if (preflight.requires_confirmation) {
    const detail = [
      `Modèle : ${clean}`,
      `Taille haute estimée : ${preflight.estimated_upper_gb == null ? "inconnue" : `${preflight.estimated_upper_gb} Go`}`,
      `Espace libre mesuré : ${preflight.storage_free_gb == null ? "inconnu" : `${preflight.storage_free_gb} Go`}`,
      ...preflight.warnings,
      "Continuer le téléchargement ?"
    ].join("\n");
    if (!window.confirm(detail)) {
      els.operationState.textContent = "annulé";
      finishOperationMonitor("Téléchargement annulé avant démarrage");
      setStatus("Téléchargement annulé avant le pull Ollama", "warn");
      renderReadinessPanel();
      return;
    }
  }
  setOperationFocus(`Téléchargement en cours : ${clean}`, [
    `Commande : ${ollamaRuntimeCommandLabel(clean)} pull ${clean}`,
    `Budget : ${preflight.estimated_upper_gb == null ? "taille inconnue" : `${preflight.estimated_upper_gb} Go maximum estimé`} + ${preflight.reserve_gb} Go de réserve`,
    "La progression apparaît ici et dans la console détaillée."
  ]);
  await ensureInstallProgressListener().catch((error) => {
    appendOperationLine(`Console temps réel non initialisée : ${error}`, "erreur");
  });
  const warning = preflight.warnings.length ? ` ${preflight.warnings[0]}` : "";
  state.installingModels[clean] = true;
  setCancelOperationEnabled(true, clean);
  const compatibility = state.compatibility?.compatibility || state.compatibility || {};
  renderCommands(extractModels(compatibility));
  if (button) button.disabled = true;
  els.benchmarkResult.innerHTML = `
    <strong>Téléchargement de ${escapeHtml(clean)}</strong>
    <span>Taille estimée : ${escapeHtml(estimatedModelSizeLabel(clean))}.${escapeHtml(warning)}</span>
    <span>Ollama télécharge le modèle. L'app reste utilisable pendant l'opération.</span>
  `;
  setStatus(`Téléchargement ${clean}...`);
  appendOperationLine(`Commande lancée : ${ollamaRuntimeCommandLabel(clean)} pull ${clean}`, "cmd");
  try {
    const result = invoke
      ? await invoke("install_ollama_model", {
          request: {
            model: clean,
            timeout_seconds: 1800,
            ...ollamaRuntimePayload(clean)
          }
        })
      : { success: true, model: clean, output_preview: "Démo navigateur" };
    if (result.success) {
      els.operationState.textContent = "vérification";
      appendOperationLine(`${clean} téléchargé. Rescan de la machine...`, "ok");
      renderOperationMonitor("Vérification du modèle");
      setStatus(`Vérification ${clean}...`);
      els.benchmarkModelInput.value = clean;
      els.chatModelInput.value = clean;
      if (!invoke) markOllamaModelInstalled(clean);
      els.benchmarkResult.innerHTML = `
        <strong>${escapeHtml(clean)} téléchargé</strong>
        <span>Vérification par scan local en cours...</span>
      `;
      await scanMachine().catch(() => {});
      const confirmed = invoke ? isOllamaModelInstalledInScan(clean) : isOllamaModelInstalled(clean);
      els.operationState.textContent = confirmed ? "installé" : "à vérifier";
      appendOperationLine(
        confirmed
          ? `${clean} confirmé dans Ollama.`
          : `${clean} non confirmé par le scan. Rafraîchis Ollama ou relance le scan.`,
        confirmed ? "ok" : "alerte"
      );
      finishOperationMonitor(confirmed ? "Modèle installé" : "Modèle à vérifier");
      setStatus(confirmed ? `${clean} installé` : `${clean} téléchargé, scan à vérifier`, confirmed ? "ok" : "warn");
      els.benchmarkResult.innerHTML = `
        <strong>${escapeHtml(clean)} ${confirmed ? "installé" : "téléchargé"}</strong>
        <span>${confirmed ? "Prêt : teste maintenant, dialogue avec ce modèle, compare dans l'Arena ou garde-le installé." : "Le téléchargement est terminé, mais le scan local ne l'a pas encore confirmé."}</span>
        <div class="post-install-actions">
          <button type="button" data-benchmark-model="${escapeHtml(clean)}" ${confirmed ? "" : "disabled"}>Tester maintenant</button>
          <button type="button" data-post-install-chat="${escapeHtml(clean)}" ${confirmed ? "" : "disabled"}>Dialogue</button>
          <button type="button" data-post-install-arena="${escapeHtml(clean)}" ${confirmed ? "" : "disabled"}>Comparer</button>
          <button type="button" data-keep-installed-model="${escapeHtml(clean)}" ${confirmed ? "" : "disabled"}>Garder</button>
          <button type="button" data-delete-model="${escapeHtml(clean)}" ${confirmed ? "" : "disabled"}>Supprimer</button>
        </div>
      `;
      if (state.compatibility) renderCompatibility(state.compatibility);
      renderPreparePanel();
      renderReadinessPanel();
      renderArenaPanel();
      renderStrategyBridgePanel();
      renderFieldTestPanel();
      return;
    }
    const failed = friendlyOllamaError(result.error || result.output_preview || "Installation incomplète.");
    els.operationState.textContent = "échec";
    appendOperationLine(failed, "erreur");
    finishOperationMonitor("Installation en erreur");
    els.benchmarkResult.textContent = failed;
    setStatus(`Installation ${clean} incomplète`, "warn");
  } catch (error) {
    const friendly = friendlyOllamaError(error);
    els.operationState.textContent = "échec";
    appendOperationLine(friendly, "erreur");
    finishOperationMonitor("Installation en erreur");
    els.benchmarkResult.textContent = friendly;
    setStatus(friendly, "bad");
  } finally {
    delete state.installingModels[clean];
    setCancelOperationEnabled(false);
    if (state.compatibility) renderCommands(extractModels(state.compatibility?.compatibility || state.compatibility || {}));
    if (button) button.disabled = false;
    renderFirstTestPanel();
    renderPrimaryAction();
  }
}

async function cancelActiveInstall(model = activeInstallModel) {
  const clean = ollamaActionRef(model);
  if (!clean) {
    setStatus("Aucun téléchargement actif à annuler", "warn");
    return;
  }
  setCancelOperationEnabled(false);
  appendOperationLine(`Annulation demandée : ${clean}`, "alerte");
  renderOperationMonitor("Annulation en cours");
  setStatus(`Annulation ${clean}...`, "warn");
  try {
    const result = invoke
      ? await invoke("cancel_ollama_install", { model: clean })
      : { cancelled: true, model: clean, message: "Démo navigateur : annulation simulée." };
    appendOperationLine(result.message || "Annulation demandée.", result.cancelled ? "alerte" : "erreur");
    els.operationState.textContent = result.cancelled ? "annulation" : "à vérifier";
    finishOperationMonitor(result.cancelled ? "Annulation demandée" : "Annulation à vérifier");
    setStatus(result.message || "Annulation demandée", result.cancelled ? "warn" : "bad");
  } catch (error) {
    const message = String(error || "Annulation impossible");
    appendOperationLine(message, "erreur");
    els.operationState.textContent = "échec";
    finishOperationMonitor("Annulation en erreur");
    setStatus(message, "bad");
  }
}

async function deleteInstalledModel(model, button = null) {
  const clean = String(model || "").trim();
  if (!clean) {
    setStatus("Modèle Ollama manquant", "bad");
    return;
  }
  const typed = window.prompt(`Supprimer le modèle Ollama local ?\n\nCette action libère l'espace disque mais le modèle devra être retéléchargé.\n\nTape exactement ${clean} pour confirmer.`);
  if (typed !== clean) {
    setStatus("Suppression annulée", "warn");
    return;
  }
  resetOperationConsole(`Suppression Ollama demandée : ${clean}`);
  await ensureInstallProgressListener().catch((error) => {
    appendOperationLine(`Console temps réel non initialisée : ${error}`, "erreur");
  });
  appendOperationLine(`Commande lancée : ${ollamaRuntimeCommandLabel(clean)} rm ${clean}`, "cmd");
  if (button) button.disabled = true;
  setStatus(`Suppression ${clean}...`);
  els.operationState.textContent = "suppression";
  try {
    const result = invoke
      ? await invoke("delete_ollama_model", {
          request: {
            model: clean,
            timeout_seconds: 120,
            ...ollamaRuntimePayload(clean)
          }
        })
      : { success: true, model: clean, output_preview: "Démo navigateur" };
    if (result.success) {
      appendOperationLine(`${clean} supprimé. Rescan de la machine...`, "ok");
      setStatus(`${clean} supprimé`, "ok");
      els.operationState.textContent = "supprimé";
      finishOperationMonitor("Modèle supprimé");
      unmarkOllamaModelInstalled(clean);
      if (normalizeOllamaRef(els.benchmarkModelInput.value) === normalizeOllamaRef(clean)) {
        els.benchmarkModelInput.value = "";
      }
      if (normalizeOllamaRef(els.chatModelInput.value) === normalizeOllamaRef(clean)) {
        els.chatModelInput.value = "";
      }
      await scanMachine().catch(() => {});
      if (state.compatibility) renderCompatibility(state.compatibility);
      renderPreparePanel();
      renderReadinessPanel();
      renderArenaPanel();
      renderStrategyBridgePanel();
      renderFieldTestPanel();
      return;
    }
    const failed = friendlyOllamaError(result.error || result.output_preview || "Suppression incomplète.");
    appendOperationLine(failed, "erreur");
    els.operationState.textContent = "échec";
    finishOperationMonitor("Suppression en erreur");
    setStatus(`Suppression ${clean} incomplète`, "warn");
  } catch (error) {
    const friendly = friendlyOllamaError(error);
    appendOperationLine(friendly, "erreur");
    els.operationState.textContent = "échec";
    finishOperationMonitor("Suppression en erreur");
    setStatus(friendly, "bad");
  } finally {
    if (button) button.disabled = false;
    renderFirstTestPanel();
    renderPrimaryAction();
  }
}

async function installOllamaRuntime(button = null) {
  resetOperationConsole("Installation d'Ollama demandée");
  setOperationFocus("Installation Ollama en cours", [
    "L'app tente l'installation automatique si la plateforme le permet.",
    "Si Windows ouvre un installeur, termine l'installation puis relance le scan.",
    "Aucun fichier personnel n'est lu."
  ]);
  await ensureInstallProgressListener().catch((error) => {
    appendOperationLine(`Console temps réel non initialisée : ${error}`, "erreur");
  });
  if (button) button.disabled = true;
  setStatus("Installation d'Ollama...");
  els.benchmarkResult.innerHTML = `
    <strong>Installation d'Ollama</strong>
    <span>L'app tente l'installation automatique sur Windows. La console affiche le déroulement.</span>
  `;
  appendOperationLine("Tentative d'installation automatique Ollama.", "cmd");
  try {
    const result = invoke
      ? await invoke("install_ollama_runtime")
      : { success: false, error: "Mode navigateur : installation native indisponible." };
    if (result.success) {
      els.operationState.textContent = "installeur lancé";
      appendOperationLine("Termine l'installation Ollama dans la fenêtre Windows, puis clique sur Scanner ce PC.", "ok");
      finishOperationMonitor("Installeur Ollama lancé");
      setStatus("Installeur Ollama lancé", "ok");
      els.benchmarkResult.innerHTML = `
        <strong>Installeur Ollama lancé</strong>
        <span>Termine l'installation dans la fenêtre Windows, puis relance le scan dans l'app.</span>
        <button type="button" data-run-scan="true">Relancer le scan</button>
      `;
      return;
    }
    const message = friendlyOllamaError(result.error || result.output_preview || "Installation automatique impossible.");
    els.operationState.textContent = "action requise";
    appendOperationLine(message, "erreur");
    appendOperationLine("Ouverture de la page officielle Ollama.", "info");
    finishOperationMonitor("Installation Ollama manuelle");
    setStatus("Installation Ollama manuelle requise", "warn");
    await openOutilsiaUrl("https://ollama.com/download").catch((error) => {
      appendOperationLine(`Impossible d'ouvrir la page Ollama : ${error}`, "erreur");
    });
  } catch (error) {
    const message = friendlyOllamaError(error);
    els.operationState.textContent = "action requise";
    appendOperationLine(message, "erreur");
    finishOperationMonitor("Installation Ollama manuelle");
    setStatus("Installation Ollama manuelle requise", "warn");
    await openOutilsiaUrl("https://ollama.com/download").catch(() => {});
  } finally {
    if (button) button.disabled = false;
    renderFirstTestPanel();
    renderPreparePanel();
    renderPrimaryAction();
  }
}

async function installWslRuntime(button = els.installWslBtn) {
  const info = wslRuntimeInfo();
  if (!info.canInstall) {
    setStatus("WSL ne nécessite pas d'installation depuis ce panneau", "warn");
    return;
  }
  resetOperationConsole("Installation WSL demandée");
  setOperationFocus("Installation WSL en cours", [
    "Windows peut demander une confirmation administrateur.",
    "Un redémarrage peut être nécessaire avant que la distribution Linux soit utilisable.",
    "OutilsIA ne lit aucun fichier personnel."
  ]);
  await ensureInstallProgressListener().catch((error) => {
    appendOperationLine(`Console temps réel non initialisée : ${error}`, "erreur");
  });
  if (button) button.disabled = true;
  setStatus("Installation WSL...");
  appendOperationLine(info.command || "wsl.exe --install", "cmd");
  try {
    const result = invoke
      ? await invoke("install_wsl_runtime")
      : { success: true, output_preview: "Démo navigateur : installation WSL simulée." };
    if (result.success) {
      appendOperationLine(result.output_preview || "Installation WSL lancée.", "ok");
      els.operationState.textContent = "wsl";
      finishOperationMonitor("Installation WSL lancée");
      setStatus("Installation WSL lancée", "ok");
    } else {
      const message = result.error || result.output_preview || "Installation WSL impossible.";
      appendOperationLine(message, "erreur");
      els.operationState.textContent = "action requise";
      finishOperationMonitor("Installation WSL à vérifier");
      setStatus(message, "bad");
    }
  } catch (error) {
    const message = String(error || "Installation WSL impossible");
    appendOperationLine(message, "erreur");
    els.operationState.textContent = "échec";
    finishOperationMonitor("Installation WSL en erreur");
    setStatus(message, "bad");
  } finally {
    if (button) button.disabled = false;
    renderWslRuntime();
  }
}

async function copyWslCommand() {
  const info = wslRuntimeInfo();
  if (!info.command) {
    setStatus("Commande WSL indisponible", "bad");
    return;
  }
  await navigator.clipboard.writeText(info.command);
  setStatus("Commande WSL copiée", "ok");
}

async function syncBenchmark() {
  if (!state.scan || !state.benchmark) {
    setStatus("Scan et benchmark requis avant synchronisation", "bad");
    return;
  }
  els.syncBenchmarkBtn.disabled = true;
  setStatus("Synchronisation benchmark...");
  try {
    const payload = invoke
      ? await invoke("sync_benchmark_with_token", {
          scan: state.scan,
          benchmark: state.benchmark
        })
      : { ok: true, benchmark: { id: 1 } };
    setStatus(`Benchmark synchronisé #${payload.benchmark?.id || ""}`, "ok");
  } catch (error) {
    setStatus(String(error), "bad");
  } finally {
    await refreshAuthState();
  }
}

function benchmarkQualityVerdict(result) {
  if (!result?.success) {
    const message = friendlyOllamaError(result?.error || result?.output_preview || "");
    if (message.includes("CUDA")) return "Échec benchmark : problème CUDA/Ollama probable, ne juge pas le modèle tant que le runtime n'est pas stabilisé.";
    return "Qualité courte : échec ou réponse incomplète, ne pas retenir ce modèle sans retest.";
  }
  const tps = Number(result.estimated_tokens_per_second || 0);
  const elapsed = Number(result.elapsed_ms || 0);
  const preview = String(result.output_preview || "").trim();
  if (tps >= 40 && elapsed <= 6000 && preview.length >= 80) {
    return "Qualité courte : très bon candidat, réponse exploitable et vitesse confortable.";
  }
  if (tps >= 12 && preview.length >= 60) {
    return "Qualité courte : correct pour valider la machine, à comparer avec un modèle plus qualitatif.";
  }
  if (tps > 0 && preview.length >= 30) {
    return "Qualité courte : utilisable pour test léger, mais probablement limité au quotidien.";
  }
  return "Qualité courte : preuve technique obtenue, qualité à confirmer avec un prompt plus long.";
}

function benchmarkExecutionLabel(result) {
  return String(result?.execution_mode || "auto") === "cpu" ? "CPU seulement" : "Automatique GPU/CPU";
}

function benchmarkMeasurementIsExact(result) {
  return String(result?.measurement_source || "") === "ollama_api";
}

function benchmarkMeasurementLabel(result) {
  const source = String(result?.measurement_source || "legacy_history");
  if (source === "ollama_api") return "Mesuré par Ollama API";
  if (source === "ollama_api_estimate") return "API Ollama · débit partiellement estimé";
  if (source === "ollama_cli_estimate") return "Estimation de secours via Ollama CLI";
  return "Ancienne mesure locale · méthode non enregistrée";
}

function benchmarkSpeedLabel(result) {
  return benchmarkMeasurementIsExact(result) ? "Débit mesuré" : "Débit estimé";
}

function benchmarkMetricDetails(result) {
  const details = [];
  if (Number(result?.load_duration_ms || 0) > 0) details.push(`chargement ${Number(result.load_duration_ms)} ms`);
  if (Number(result?.prompt_tokens_per_second || 0) > 0) details.push(`préremplissage ${Number(result.prompt_tokens_per_second)} tok/s`);
  if (Number(result?.eval_duration_ms || 0) > 0) details.push(`génération ${Number(result.eval_duration_ms)} ms`);
  return details.join(" · ");
}

function renderBenchmark(result) {
  const model = ollamaActionRef(result.model || "");
  const quality = benchmarkQualityVerdict(result);
  const executionMode = benchmarkExecutionLabel(result);
  const measurement = benchmarkMeasurementLabel(result);
  const metricDetails = benchmarkMetricDetails(result);
  const cpuRetry = model && isCudaBenchmarkFailure(result)
    ? `<button type="button" class="cpu-retry-btn" data-retry-benchmark-cpu="${escapeHtml(model)}">Retester sans GPU</button>`
    : "";
  const output = result.success
    ? result.output_preview || "Sortie vide"
    : friendlyOllamaError(result.error || result.output_preview || "Sortie vide");
  els.benchmarkResult.innerHTML = `
    <div class="benchmark-card">
      <strong>${escapeHtml(result.success ? "Test réussi" : "Test terminé avec erreur")} - ${escapeHtml(result.model)}</strong>
      <span>Temps de réponse : ${escapeHtml(result.elapsed_ms ?? 0)} ms${result.timed_out ? " - test interrompu" : ""}</span>
      <span>${escapeHtml(benchmarkSpeedLabel(result))} : ${escapeHtml(result.estimated_tokens_per_second ?? 0)} tok/s</span>
      <span>Méthode : ${escapeHtml(measurement)}</span>
      ${metricDetails ? `<span>Détails : ${escapeHtml(metricDetails)}</span>` : ""}
      <span>Exécution : ${escapeHtml(executionMode)}</span>
      <span>${escapeHtml(quality)}</span>
      <span>${escapeHtml(output)}</span>
    </div>
    <div class="row-actions">
      ${model ? `<button type="button" data-keep-installed-model="${escapeHtml(model)}">Garder</button>` : ""}
      ${model ? `<button type="button" data-delete-model="${escapeHtml(model)}">Supprimer</button>` : ""}
      ${model ? `<button type="button" data-post-install-arena="${escapeHtml(model)}">Comparer</button>` : ""}
      <button type="button" data-copy-test-report="true">Copier le rapport</button>
      <button type="button" data-focus-feedback="true">Signaler un résultat</button>
      ${cpuRetry}
    </div>
  `;
  renderFlightRecorder();
}

function readBenchmarkHistory() {
  try {
    const raw = window.localStorage?.getItem(BENCHMARK_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBenchmarkHistory(items) {
  const normalized = Array.isArray(items) ? items.slice(0, MAX_BENCHMARK_HISTORY) : [];
  window.localStorage?.setItem(BENCHMARK_HISTORY_KEY, JSON.stringify(normalized));
  renderBenchmarkHistory(normalized);
}

function benchmarkHistoryEntry(result) {
  const scan = state.scan || {};
  return {
    id: `bench-${Date.now()}`,
    created_at_ms: Number(result.created_at_ms || Date.now()),
    model: result.model || "modele",
    machine_key: result.machine_key || scan.machine_key || "",
    runtime: result.runtime || defaultOllamaRuntime(result.model || ""),
    prompt: result.prompt || "",
    elapsed_ms: Number(result.elapsed_ms || 0),
    estimated_tokens: Number(result.estimated_tokens || 0),
    estimated_tokens_per_second: Number(result.estimated_tokens_per_second || 0),
    measurement_source: result.measurement_source || "legacy_history",
    measurement_note: result.measurement_note || "",
    total_duration_ms: Number(result.total_duration_ms || 0),
    load_duration_ms: Number(result.load_duration_ms || 0),
    prompt_eval_count: Number(result.prompt_eval_count || 0),
    prompt_eval_duration_ms: Number(result.prompt_eval_duration_ms || 0),
    prompt_tokens_per_second: Number(result.prompt_tokens_per_second || 0),
    eval_count: Number(result.eval_count || result.estimated_tokens || 0),
    eval_duration_ms: Number(result.eval_duration_ms || 0),
    success: Boolean(result.success),
    timed_out: Boolean(result.timed_out),
    output_preview: result.output_preview || "",
    error: result.error || "",
    execution_mode: result.execution_mode || "auto",
    runtime_model_size_bytes: Number(result.runtime_model_size_bytes || 0),
    runtime_vram_bytes: Number(result.runtime_vram_bytes || 0),
    runtime_gpu_offload_percent: Number(result.runtime_gpu_offload_percent || 0),
    runtime_processor: result.runtime_processor || "unknown",
    runtime_evidence_source: result.runtime_evidence_source || "",
    autopilot_active_profile: result.autopilot_active_profile || "",
    tuning: result.tuning || null,
    benchmark_protocol: result.benchmark_protocol || "",
    arena_objective: result.arena_objective || null,
    recommendation_proof: result.recommendation_proof || null,
    resource_estimates: result.resource_estimates || null,
    machine: {
      name: scan.name || "Machine IA locale",
      cpu_name: scan.cpu_name || "",
      gpu_name: scan.gpu_name || "",
      ram_gb: scan.ram_gb || 0,
      vram_gb: scan.vram_gb || 0,
      machine_key: scan.machine_key || ""
    }
  };
}

function saveBenchmarkHistoryEntry(result) {
  if (!result?.model) return;
  const items = readBenchmarkHistory();
  items.unshift(benchmarkHistoryEntry(result));
  writeBenchmarkHistory(items);
}

function bestBenchmarkByModel(items) {
  const grouped = new Map();
  for (const item of items) {
    const key = normalizeOllamaRef(item.model || "");
    if (!key) continue;
    const current = grouped.get(key) || { model: item.model, count: 0, best: null, last: null };
    current.count += 1;
    if (!current.last || Number(item.created_at_ms || 0) > Number(current.last.created_at_ms || 0)) {
      current.last = item;
    }
    if (item.success && (!current.best || Number(item.estimated_tokens_per_second || 0) > Number(current.best.estimated_tokens_per_second || 0))) {
      current.best = item;
    }
    grouped.set(key, current);
  }
  return Array.from(grouped.values()).sort((a, b) => {
    const aSpeed = Number(a.best?.estimated_tokens_per_second || 0);
    const bSpeed = Number(b.best?.estimated_tokens_per_second || 0);
    return bSpeed - aSpeed;
  });
}

function renderBenchmarkHistory(items = readBenchmarkHistory()) {
  const count = items.length;
  if (!els.benchmarkHistoryBox) return;
  els.benchmarkHistoryState.textContent = `${count} test${count > 1 ? "s" : ""}`;
  els.copyBenchmarkHistoryBtn.disabled = !count;
  els.clearBenchmarkHistoryBtn.disabled = !count;
  els.benchmarkHistoryBox.className = count ? "benchmark-history-box" : "benchmark-history-box empty";
  if (!count) {
    els.benchmarkHistoryBox.textContent = "Chaque test Ollama réussi ou échoué sera conservé localement pour comparer les modèles de cette machine.";
    return;
  }
  const leaders = bestBenchmarkByModel(items);
  const latest = items.slice(0, 5);
  els.benchmarkHistoryBox.innerHTML = `
    <div class="benchmark-history-summary">
      ${leaders.slice(0, 4).map((item, index) => `
        <div class="benchmark-history-rank">
          <strong>${escapeHtml(index === 0 ? "Meilleur local" : `#${index + 1}`)} · ${escapeHtml(item.model)}</strong>
          <span>${item.best ? `${escapeHtml(item.best.estimated_tokens_per_second)} tok/s · ${escapeHtml(item.best.elapsed_ms)} ms` : "aucun succès"}</span>
          <span>${escapeHtml(item.count)} test${item.count > 1 ? "s" : ""}</span>
        </div>
      `).join("")}
    </div>
    <div class="benchmark-history-latest">
      ${latest.map((item) => `
        <div class="list-item">
          <strong>${escapeHtml(item.model)} ${item.success ? "" : "· échec"}</strong>
          <span>${escapeHtml(new Date(Number(item.created_at_ms || Date.now())).toLocaleString("fr-FR"))} · ${escapeHtml(item.estimated_tokens_per_second || 0)} tok/s · ${escapeHtml(item.elapsed_ms || 0)} ms</span>
          <span>${escapeHtml(item.output_preview || item.error || "Sortie vide")}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function benchmarkHistoryMarkdown(items = readBenchmarkHistory()) {
  const leaders = bestBenchmarkByModel(items);
  return [
    "# Historique benchmarks OutilsIA Local Cockpit",
    "",
    `- Date export: ${new Date().toISOString()}`,
    `- Tests locaux: ${items.length}`,
    state.scan ? `- Machine active: ${state.scan.name || "Machine IA locale"}` : "- Machine active: non scannée",
    "",
    "## Classement local par meilleur débit",
    "",
    ...(leaders.length
      ? leaders.map((item, index) => `- ${index + 1}. ${item.model}: ${item.best ? `${item.best.estimated_tokens_per_second} tok/s, ${item.best.elapsed_ms} ms` : "aucun succès"} (${item.count} test${item.count > 1 ? "s" : ""})`)
      : ["- Aucun benchmark enregistré."]),
    "",
    "## Derniers tests",
    "",
    ...items.slice(0, 20).map((item) => [
      `### ${item.model} - ${item.success ? "succès" : "échec"}`,
      "",
      `- Date: ${new Date(Number(item.created_at_ms || Date.now())).toISOString()}`,
      `- Machine: ${item.machine?.name || "Machine IA locale"}`,
      `- GPU: ${item.machine?.gpu_name || "non détecté"} (${formatVram(item.machine?.vram_gb)})`,
      `- RAM: ${item.machine?.ram_gb || 0} Go`,
      `- Temps: ${item.elapsed_ms} ms`,
      `- ${benchmarkSpeedLabel(item)}: ${item.estimated_tokens_per_second} tok/s`,
      `- Méthode: ${benchmarkMeasurementLabel(item)}`,
      `- Tokens: ${item.estimated_tokens}`,
      item.error ? `- Erreur: ${item.error}` : "",
      "",
      "```text",
      item.output_preview || "",
      "```",
      ""
    ].filter(Boolean).join("\n"))
  ].join("\n");
}

async function copyBenchmarkHistory() {
  const items = readBenchmarkHistory();
  if (!items.length) {
    setStatus("Aucun benchmark à copier", "warn");
    return;
  }
  await navigator.clipboard.writeText(benchmarkHistoryMarkdown(items));
  setStatus("Historique benchmarks copié", "ok");
}

function clearBenchmarkHistory() {
  const ok = window.confirm("Vider l'historique local des benchmarks Ollama ?");
  if (!ok) return;
  writeBenchmarkHistory([]);
  setStatus("Historique benchmarks vidé", "ok");
}

function appendBenchmarkMarkdown(markdown) {
  if (!state.benchmark) return markdown;
  const b = state.benchmark;
  return `${markdown}

## Benchmark local Ollama

- Modele: ${b.model}
- Prompt: ${b.prompt}
- Temps: ${b.elapsed_ms} ms
- Tokens: ${b.estimated_tokens}
- ${benchmarkSpeedLabel(b)}: ${b.estimated_tokens_per_second} tok/s
- Methode: ${benchmarkMeasurementLabel(b)}
${benchmarkMetricDetails(b) ? `- Details: ${benchmarkMetricDetails(b)}` : ""}
- Succes: ${b.success ? "oui" : "non"}
${b.error ? `- Erreur: ${b.error}` : ""}

### Sortie

\`\`\`text
${b.output_preview || ""}
\`\`\`
`;
}

async function saveLocalSnapshot() {
  if (!state.scan) return;
  setStatus("Sauvegarde locale...");
  try {
    const snapshot = invoke
      ? await invoke("save_local_snapshot", {
          scan: state.scan,
          compatibility: state.compatibility,
          benchmark: state.benchmark
        })
      : demoSnapshot();
    setStatus(`Diagnostic sauvegardé: ${snapshot.id}`, "ok");
    await loadHistory();
  } catch (error) {
    setStatus(String(error), "bad");
  }
}

async function syncDesktop() {
  if (!state.scan) return;
  els.syncBtn.disabled = true;
  els.syncState.textContent = "sync en cours";
  setStatus("Synchronisation compte OutilsIA...");
  try {
    const payload = invoke
      ? await invoke("sync_desktop_with_token", { scan: state.scan })
      : demoSync();
    lastSyncedMachineId = Number(payload.machine?.id || 0) || null;
    lastShareReportUrl = "";
    readinessProof.savedAccount = Boolean(lastSyncedMachineId);
    readinessProof.shared = false;
    els.syncState.textContent = "synchronisé";
    els.syncResult.innerHTML = renderSyncResult(payload);
    els.shareReportBtn.disabled = !lastSyncedMachineId;
    setStatus("Machine synchronisee avec le compte", "ok");
  } catch (error) {
    els.syncState.textContent = "echec";
    els.syncResult.textContent = String(error);
    setStatus(String(error), "bad");
  } finally {
    els.syncBtn.disabled = false;
  }
}

async function createShareReport() {
  if (!lastSyncedMachineId) {
    setStatus("Synchronise le PC avant de creer le rapport", "bad");
    return;
  }
  els.shareReportBtn.disabled = true;
  setStatus("Creation du rapport partageable...");
  try {
    const payload = invoke
      ? await invoke("create_share_report_with_token", { machineId: lastSyncedMachineId })
      : demoShareReport();
    const url = payload.absolute_url || absolutize(payload.share_url || "/compte");
    lastShareReportUrl = url;
    readinessProof.shared = true;
    els.syncResult.innerHTML = `
      <strong>Rapport partageable pret</strong>
      <span><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a></span>
    `;
    if (invoke) {
      await invoke("open_external_url", { url }).catch(() => {});
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    setStatus("Rapport partageable créé et URL copiée", "ok");
  } catch (error) {
    setStatus(String(error), "bad");
  } finally {
    els.shareReportBtn.disabled = !lastSyncedMachineId;
  }
}

async function deleteSyncedMachine(machineId) {
  const id = Number(machineId || 0);
  if (!id) return;
  const ok = window.confirm("Supprimer cette machine du compte OutilsIA et effacer ses benchmarks ?");
  if (!ok) return;
  setStatus("Suppression machine compte...");
  try {
    const payload = invoke
      ? await invoke("delete_machine_with_token", { machineId: id })
      : { ok: true, deleted: true, machine_id: id };
    if (!payload?.ok) throw new Error(payload?.error || "suppression_impossible");
    if (lastSyncedMachineId === id) {
      lastSyncedMachineId = null;
      lastShareReportUrl = "";
      readinessProof.savedAccount = false;
      readinessProof.shared = false;
      els.shareReportBtn.disabled = true;
    }
    setStatus("Machine supprimee du compte", "ok");
    await refreshDesktopUpdates();
  } catch (error) {
    setStatus(String(error), "bad");
  }
}

function renderDesktopUpdates(payload) {
  const updates = payload?.updates || [];
  if (payload?.catalog_version || payload?.upgrade_catalog_version) {
    renderCatalogStatus({
      ...(state.compatibility?.compatibility || state.compatibility || {}),
      catalog_version: payload.catalog_version,
      upgrade_catalog_version: payload.upgrade_catalog_version,
      catalog_count: payload.catalog_count || (state.compatibility?.compatibility || state.compatibility || {}).catalog_count,
      new: updates.flatMap((item) => item.new_models || []).slice(0, 8)
    });
  }
  els.updatesList.className = updates.length ? "list" : "list empty";
  if (!updates.length) {
    els.updatesList.textContent = payload?.ok
      ? "Aucune machine synchronisée pour le moment."
      : "Updates indisponibles.";
    return;
  }
  els.updatesList.innerHTML = updates.slice(0, 6).map((item) => {
    const score = item.score?.score ?? "--";
    const afterScore = item.score_after_primary_upgrade?.score ?? null;
    const newModels = (item.new_models || []).slice(0, 2).map(modelTitle).join(", ");
    const upgrade = item.primary_upgrade?.name || "";
    const unlocked = (item.unlocked_by_primary_upgrade || []).slice(0, 3).map(modelTitle).join(", ");
    const guide = item.buying_guides?.[0];
    const commands = (item.recommended_commands || []).slice(0, 2).map((command) => `
      <button type="button" data-copy-command="${escapeHtml(command.ollama ? `${ollamaRuntimeCommandLabel(command.ollama)} run ${command.ollama}` : command.command || "")}">${escapeHtml(command.ollama ? `${ollamaRuntimeCommandLabel(command.ollama)} run ${command.ollama}` : command.command || `${ollamaRuntimeCommandLabel()} run`)}</button>
      <button type="button" data-benchmark-model="${escapeHtml(command.ollama || "")}">${escapeHtml(benchmarkButtonLabel(command.ollama || ""))}</button>
    `).join("");
    return `
      <div class="list-item">
        <strong>${escapeHtml(item.name || "Machine IA locale")} - ${escapeHtml(score)}/100</strong>
        <span>${escapeHtml(item.gpu_name || "GPU inconnu")} - ${escapeHtml(formatVram(item.vram_gb))} - ${escapeHtml(item.ram_gb || 0)} Go RAM</span>
        <span>${newModels ? `Nouveaux modèles: ${escapeHtml(newModels)}` : "Watchlist à jour"}</span>
        ${upgrade ? `<span>Upgrade prioritaire: ${escapeHtml(upgrade)}</span>` : ""}
        ${afterScore !== null ? `<span>Score après upgrade: ${escapeHtml(afterScore)}/100</span>` : ""}
        ${unlocked ? `<span>Débloque: ${escapeHtml(unlocked)}</span>` : ""}
        ${commands}
        ${guide ? `<button type="button" data-open-url="${escapeHtml(absolutize(guide.url || "/materiel"))}">${escapeHtml(guide.title || "Guide OutilsIA")}</button>` : ""}
        <button type="button" data-create-share="${escapeHtml(item.machine_id || "")}">Rapport</button>
        <button type="button" data-fetch-memoryforge="${escapeHtml(item.machine_id || "")}">MemoryForge</button>
        <button type="button" data-feedback-machine="${escapeHtml(item.machine_id || "")}">Signaler</button>
        <button type="button" data-delete-machine="${escapeHtml(item.machine_id || "")}">Supprimer</button>
      </div>
    `;
  }).join("");
}

async function sendFeedback(machineId = lastSyncedMachineId) {
  const message = els.feedbackMessage.value.trim();
  if (message.length < 8) {
    setStatus("Feedback trop court", "bad");
    els.feedbackResult.textContent = "Ajoute au moins quelques mots pour qu'on puisse reproduire le problème.";
    return;
  }
  els.feedbackBtn.disabled = true;
  els.feedbackState.textContent = "envoi...";
  setStatus("Envoi retour test...");
  try {
    const payload = invoke
      ? await invoke("send_feedback_with_token", {
          request: {
            machine_id: Number(machineId || 0) || null,
            category: els.feedbackCategory.value || "detection",
            message,
            scan: state.scan,
            compatibility: state.compatibility,
            context: {
              app_surface: "local-cockpit",
              release_label: state.release?.label || "",
              catalog_version: state.desktopManifest?.catalog_version || "",
              has_scan: Boolean(state.scan),
              has_compatibility: Boolean(state.compatibility),
              last_synced_machine_id: lastSyncedMachineId
            }
          }
        })
      : demoFeedback();
    els.feedbackState.textContent = `reçu #${payload.feedback?.id || ""}`.trim();
    els.feedbackResult.innerHTML = `
      <strong>Retour test envoyé</strong>
      <span>Ce retour servira à corriger les détections avant publication large.</span>
    `;
    els.feedbackMessage.value = "";
    setStatus("Retour test envoyé", "ok");
  } catch (error) {
    els.feedbackState.textContent = "échec";
    els.feedbackResult.textContent = String(error);
    setStatus(String(error), "bad");
  } finally {
    await refreshAuthState();
  }
}

async function refreshDesktopUpdates() {
  els.refreshUpdatesBtn.disabled = true;
  els.updatesList.className = "list empty";
  els.updatesList.textContent = "Chargement des updates OutilsIA...";
  try {
    const payload = invoke
      ? await invoke("fetch_desktop_updates_with_token")
      : demoDesktopUpdates();
    renderDesktopUpdates(payload);
    setStatus("Updates OutilsIA chargées", "ok");
  } catch (error) {
    els.updatesList.textContent = String(error);
    setStatus(String(error), "bad");
  } finally {
    await refreshAuthState();
  }
}

async function startPairing() {
  setStatus("Connexion au compte...");
  els.pairBtn.disabled = true;
  if (els.topAccountBtn) els.topAccountBtn.disabled = true;
  if (els.topAccountBtn) els.topAccountBtn.textContent = "Connexion...";
  try {
    const payload = invoke
      ? await invoke("start_pairing", { scan: state.scan })
      : demoPairing();
    pendingPairing = payload;
    const authorizeUrl = absolutize(payload.authorize_url || "/desktop/pair");
    els.claimBtn.disabled = false;
    els.openPairBtn.disabled = false;
    pendingPairingUrl = authorizeUrl;
    els.pairBox.innerHTML = `
      <strong>Connexion en attente</strong>
      <span>Valide sur OutilsIA.fr. L'app se connecte ensuite.</span>
      <span><a href="${escapeHtml(authorizeUrl)}" data-open-url="${escapeHtml(authorizeUrl)}">Ouvrir la validation</a></span>
    `;
    await openOutilsiaUrl(authorizeUrl).catch(() => {});
    await navigator.clipboard?.writeText(authorizeUrl).catch(() => {});
    beginPairingPolling();
    setStatus("Page ouverte. En attente de validation.", "ok");
  } catch (error) {
    setStatus(String(error), "bad");
  } finally {
    els.pairBtn.disabled = false;
    if (els.topAccountBtn) els.topAccountBtn.disabled = false;
    await refreshAuthState().catch(() => {});
  }
}

function stopPairingPolling() {
  if (pairingPollTimer) {
    clearInterval(pairingPollTimer);
    pairingPollTimer = null;
  }
}

function beginPairingPolling() {
  stopPairingPolling();
  pairingPollAttempts = 0;
  pairingPollTimer = setInterval(async () => {
    pairingPollAttempts += 1;
    if (!pendingPairing?.code || !pendingPairing?.poll_token) {
      stopPairingPolling();
      return;
    }
    if (pairingPollAttempts > 40) {
      stopPairingPolling();
      setStatus("Connexion en attente. Valide sur le site ou rouvre la page.", "warn");
      return;
    }
    await claimPairing({ silentPending: true });
  }, 3000);
}

async function openPairingPage() {
  if (!pendingPairingUrl) {
    setStatus("Aucune URL pairing en attente", "bad");
    return;
  }
  await openOutilsiaUrl(pendingPairingUrl);
  setStatus("Page de connexion ouverte", "ok");
}

async function claimPairing(options = {}) {
  if (!pendingPairing?.code || !pendingPairing?.poll_token) {
    setStatus("Aucune connexion en attente", "bad");
    return;
  }
  els.claimBtn.disabled = true;
  if (!options.silentPending) setStatus("Vérification...");
  try {
    const payload = invoke
      ? await invoke("claim_pairing", {
          request: {
            code: pendingPairing.code,
            poll_token: pendingPairing.poll_token
          }
        })
      : demoClaim();
    if (payload.status === "pending") {
      els.claimBtn.disabled = false;
      els.syncState.textContent = "en attente";
      if (!options.silentPending) setStatus("Pas encore validé sur le site", "warn");
      return;
    }
    stopPairingPolling();
    pendingPairing = null;
    pendingPairingUrl = "";
    els.claimBtn.disabled = true;
    els.openPairBtn.disabled = true;
    await refreshAuthState();
    setStatus("Compte connecté", "ok");
  } catch (error) {
    els.claimBtn.disabled = false;
    if (!options.silentPending) setStatus(String(error), "bad");
  }
}

async function refreshAuthState() {
  const auth = invoke ? await invoke("get_desktop_auth") : { desktop_token: "demo" };
  if (auth?.desktop_token) {
    els.syncState.textContent = "connecté";
    if (els.topAccountBtn) els.topAccountBtn.textContent = "Connecté";
    els.pairBtn.textContent = "Changer";
    const accountLabel = auth.account_email || "compte OutilsIA";
    els.syncBtn.disabled = !state.scan;
    els.syncBenchmarkBtn.disabled = !(state.scan && state.benchmark);
    els.feedbackBtn.disabled = false;
    els.shareReportBtn.disabled = !lastSyncedMachineId;
    els.refreshUpdatesBtn.disabled = false;
    els.disconnectBtn.disabled = false;
    els.openPairBtn.disabled = true;
    els.claimBtn.disabled = true;
    els.pairBox.innerHTML = `
      <strong>Connecté</strong>
      <span>${escapeHtml(accountLabel)}</span>
    `;
  } else {
    els.syncState.textContent = pendingPairingUrl ? "en attente" : "non connecté";
    if (els.topAccountBtn) els.topAccountBtn.textContent = pendingPairingUrl ? "En attente" : "Compte";
    els.pairBtn.textContent = pendingPairingUrl ? "Recommencer" : "Connecter";
    els.syncBtn.disabled = true;
    els.syncBenchmarkBtn.disabled = true;
    els.feedbackBtn.disabled = true;
    els.shareReportBtn.disabled = true;
    els.refreshUpdatesBtn.disabled = true;
    els.disconnectBtn.disabled = true;
    els.openPairBtn.disabled = !pendingPairingUrl;
    els.claimBtn.disabled = !pendingPairing;
    if (!pendingPairingUrl) {
      els.pairBox.innerHTML = `
        <strong>Compte non connecté</strong>
        <span>Sauvegarde ce PC, tes modèles et tes benchmarks.</span>
      `;
    }
  }
}

async function handleTopAccountClick() {
  const auth = invoke ? await invoke("get_desktop_auth") : { desktop_token: "demo" };
  if (auth?.desktop_token) {
    await openOutilsiaUrl("https://outilsia.fr/compte");
    setStatus("Compte OutilsIA ouvert dans le navigateur", "ok");
    return;
  }
  if (pendingPairingUrl) {
    await openPairingPage();
    return;
  }
  await startPairing();
}

async function disconnectDesktop() {
  if (invoke) {
    try {
      await invoke("revoke_desktop_auth");
    } catch (error) {
      await invoke("clear_desktop_auth");
      setStatus(`Token local supprime, revocation serveur non confirmee: ${error}`, "warn");
    }
  }
  pendingPairing = null;
  pendingPairingUrl = "";
  stopPairingPolling();
  lastSyncedMachineId = null;
  lastShareReportUrl = "";
  readinessProof.savedAccount = false;
  readinessProof.shared = false;
  els.openPairBtn.disabled = true;
  els.shareReportBtn.disabled = true;
  await refreshAuthState();
  setStatus("Compte desktop deconnecte", "ok");
}

async function loadHistory() {
  try {
    const snapshots = invoke ? await invoke("list_local_snapshots") : [demoSnapshot()];
    renderHistory(snapshots);
  } catch (error) {
    els.historyList.className = "list empty";
    els.historyList.textContent = String(error);
  }
}

async function deleteLocalHistoryItem(snapshotId) {
  if (!snapshotId) return;
  const ok = window.confirm("Supprimer ce diagnostic de l'historique local ?");
  if (!ok) return;
  setStatus("Suppression historique local...");
  try {
    const snapshots = invoke
      ? await invoke("delete_local_snapshot", { snapshotId })
      : [];
    renderHistory(snapshots);
    setStatus("Diagnostic local supprime", "ok");
  } catch (error) {
    setStatus(String(error), "bad");
  }
}

async function clearLocalHistory() {
  const ok = window.confirm("Vider tout l'historique local OutilsIA sur cette machine ?");
  if (!ok) return;
  setStatus("Vidage historique local...");
  try {
    const snapshots = invoke
      ? await invoke("clear_local_snapshots")
      : [];
    renderHistory(snapshots);
    setStatus("Historique local vide", "ok");
  } catch (error) {
    setStatus(String(error), "bad");
  }
}

function restoreLocalSnapshot(snapshotId) {
  const snapshot = state.localSnapshots.find((item) => item.id === snapshotId);
  if (!snapshot) {
    setStatus("Snapshot local introuvable", "bad");
    return;
  }
  state.scan = snapshot.scan || null;
  state.compatibility = snapshot.compatibility || null;
  state.benchmark = snapshot.benchmark || null;
  state.markdown = "";
  lastSyncedMachineId = null;
  lastShareReportUrl = "";
  readinessProof.savedAccount = false;
  readinessProof.shared = false;

  if (state.scan) {
    renderScan(state.scan);
  }
  if (state.compatibility) {
    renderCompatibility(state.compatibility);
  } else {
    renderCompatibility({ compatibility: {} });
    els.decisionPackState.textContent = "non genere";
    els.decisionPackBox.className = "decision-pack empty";
    els.decisionPackBox.textContent = "Relance un diagnostic pour reconstruire le pack decision.";
    els.copyDecisionPackBtn.disabled = true;
    els.copyShoppingListBtn.disabled = true;
    els.saveDecisionPackBtn.disabled = true;
  }
  if (state.benchmark) {
    renderBenchmark(state.benchmark);
  } else {
    els.benchmarkResult.textContent = "Aucun benchmark dans ce snapshot.";
  }
  renderArenaPanel();
  renderStrategyBridgePanel();
  renderFieldTestPanel();
  state.chatResult = null;
  if (els.chatResult) {
    els.chatResult.textContent = "Snapshot rechargé. Pose une question pour interroger un modèle local.";
    els.chatCopyBtn.disabled = true;
    els.chatMemoryBtn.disabled = true;
  }
  els.memoryText.value = "";
  els.copyBtn.disabled = true;
  els.downloadBtn.disabled = true;
  els.vaultBtn.disabled = !state.scan;
  els.openVaultBtn.disabled = !lastVaultPath;
  els.shareReportBtn.disabled = true;
  els.syncState.textContent = "snapshot local";
  els.syncResult.textContent = "Snapshot rechargé localement. Vous pouvez resynchroniser le PC pour recréer une machine compte.";
  setStatus("Snapshot local rechargé", "ok");
}

async function refreshSnapshotCompatibility(snapshotId) {
  const snapshot = state.localSnapshots.find((item) => item.id === snapshotId);
  if (!snapshot?.scan) {
    setStatus("Snapshot local introuvable ou sans scan", "bad");
    return;
  }
  const previousCompatibility = snapshot.compatibility?.compatibility || snapshot.compatibility || {};
  restoreLocalSnapshot(snapshotId);
  setStatus("Actualisation avec le catalogue OutilsIA actuel...");
  await checkCompatibility();
  if (state.compatibility) {
    const currentCompatibility = state.compatibility?.compatibility || state.compatibility || {};
    renderSnapshotRefreshDelta(snapshot, previousCompatibility, currentCompatibility);
    await saveLocalSnapshot();
    setStatus("Snapshot actualisé avec le catalogue actuel", "ok");
  }
}

function modelIdentity(model) {
  return [
    model?.id,
    model?.slug,
    model?.ollama,
    model?.name || model?.model_name || model?.model,
    model?.params,
    model?.quantization
  ].filter(Boolean).join("|").toLowerCase();
}

function newModelTitles(previousCompatibility, currentCompatibility) {
  const previous = new Set(extractModels(previousCompatibility).map(modelIdentity).filter(Boolean));
  return extractModels(currentCompatibility)
    .filter((model) => {
      const key = modelIdentity(model);
      return key && !previous.has(key);
    })
    .slice(0, 8)
    .map(modelTitle);
}

function newUpgradeTitles(previousCompatibility, currentCompatibility) {
  const previous = new Set((previousCompatibility.upgrades || previousCompatibility.recommended_upgrades || previousCompatibility.shopping_list || []).map(upgradeLabel));
  return (currentCompatibility.upgrades || currentCompatibility.recommended_upgrades || currentCompatibility.shopping_list || [])
    .map(upgradeLabel)
    .filter((title) => title && !previous.has(title))
    .slice(0, 6);
}

function snapshotRefreshDeltaMarkdown(snapshot, previousCompatibility, currentCompatibility) {
  const previousScore = normalizeScore(previousCompatibility.score ?? previousCompatibility.compatibility_score ?? null);
  const currentScore = normalizeScore(currentCompatibility.score ?? currentCompatibility.compatibility_score ?? null);
  const models = newModelTitles(previousCompatibility, currentCompatibility);
  const upgrades = newUpgradeTitles(previousCompatibility, currentCompatibility);
  return [
    "# Actualisation catalogue OutilsIA",
    "",
    `- Date: ${new Date().toISOString()}`,
    `- Snapshot source: ${snapshot.id || "sans-id"}`,
    `- Machine: ${snapshot.scan?.name || "Machine IA locale"}`,
    `- Catalogue modèles: ${currentCompatibility.catalog_version || "non communiqué"}`,
    `- Catalogue upgrades: ${currentCompatibility.upgrade_catalog_version || "non communiqué"}`,
    `- Score avant: ${previousScore === null ? "non calculé" : `${previousScore}/100`}`,
    `- Score après: ${currentScore === null ? "non calculé" : `${currentScore}/100`}`,
    "",
    "## Nouveaux modèles détectés",
    "",
    ...(models.length ? models.map((title) => `- ${title}`) : ["- Aucun nouveau modèle compatible par rapport au snapshot source."]),
    "",
    "## Nouveaux upgrades proposés",
    "",
    ...(upgrades.length ? upgrades.map((title) => `- ${title}`) : ["- Aucun nouvel upgrade prioritaire par rapport au snapshot source."])
  ].join("\n");
}

function renderSnapshotRefreshDelta(snapshot, previousCompatibility, currentCompatibility) {
  const markdown = snapshotRefreshDeltaMarkdown(snapshot, previousCompatibility, currentCompatibility);
  const previousScore = normalizeScore(previousCompatibility.score ?? previousCompatibility.compatibility_score ?? null);
  const currentScore = normalizeScore(currentCompatibility.score ?? currentCompatibility.compatibility_score ?? null);
  const models = newModelTitles(previousCompatibility, currentCompatibility);
  const upgrades = newUpgradeTitles(previousCompatibility, currentCompatibility);
  state.markdown = markdown;
  els.memoryText.value = markdown;
  els.copyBtn.disabled = false;
  els.downloadBtn.disabled = false;
  els.syncResult.innerHTML = `
    <strong>Catalogue actualisé pour ${escapeHtml(snapshot.scan?.name || "Machine IA locale")}</strong>
    <span>Score: ${escapeHtml(previousScore === null ? "non calculé" : `${previousScore}/100`)} -> ${escapeHtml(currentScore === null ? "non calculé" : `${currentScore}/100`)}</span>
    <span>Nouveaux modèles: ${models.length ? escapeHtml(models.join(", ")) : "aucun changement compatible"}</span>
    <span>Nouveaux upgrades: ${upgrades.length ? escapeHtml(upgrades.join(", ")) : "aucun changement prioritaire"}</span>
  `;
}

function renderHistory(snapshots) {
  state.localSnapshots = Array.isArray(snapshots) ? snapshots : [];
  els.copyHistoryBtn.disabled = !state.localSnapshots.length;
  els.historyList.className = snapshots.length ? "list" : "list empty";
  els.historyList.innerHTML = snapshots.length
    ? snapshots.slice(0, 8).map((snapshot) => {
        const scan = snapshot.scan || {};
        const score = normalizeScore(snapshot.compatibility?.compatibility?.score ?? null);
        const bench = snapshot.benchmark;
        const benchText = bench?.estimated_tokens_per_second
          ? ` - ${bench.model || "modèle"} ${bench.estimated_tokens_per_second} tok/s`
          : "";
        const date = new Date(Number(snapshot.saved_at_ms || Date.now())).toLocaleString("fr-FR");
        return `
          <div class="list-item">
            <strong>${escapeHtml(scan.name || "Machine IA locale")}</strong>
            <span>${escapeHtml(date)} - ${score === null ? "score non calculé" : `score ${score}/100`}${escapeHtml(benchText)}</span>
            <button type="button" data-restore-snapshot="${escapeHtml(snapshot.id || "")}">Recharger</button>
            <button type="button" data-refresh-snapshot="${escapeHtml(snapshot.id || "")}">Actualiser catalogue</button>
            <button type="button" data-delete-snapshot="${escapeHtml(snapshot.id || "")}">Supprimer</button>
          </div>
        `;
      }).join("")
    : "Aucun diagnostic sauvegardé.";
}

function localHistoryMarkdown(snapshots = state.localSnapshots) {
  const items = Array.isArray(snapshots) ? snapshots : [];
  const lines = [
    "# Historique local OutilsIA Local Cockpit",
    "",
    `- Snapshots: ${items.length}`,
    `- Généré: ${new Date().toLocaleString("fr-FR")}`,
    "",
  ];

  if (!items.length) {
    lines.push("Aucun diagnostic sauvegardé.");
    return lines.join("\n");
  }

  for (const snapshot of items) {
    const scan = snapshot.scan || {};
    const compatibility = snapshot.compatibility?.compatibility || snapshot.compatibility || {};
    const score = normalizeScore(compatibility.score ?? compatibility.compatibility_score ?? null);
    const models = extractModels(compatibility).slice(0, 5).map(modelTitle);
    const blocked = (compatibility.blocked_next || compatibility.blocked || []).slice(0, 4).map(modelTitle);
    const upgrades = (compatibility.upgrades || compatibility.recommended_upgrades || compatibility.shopping_list || []).slice(0, 4);
    const benchmark = snapshot.benchmark || null;

    lines.push(`## ${scan.name || "Machine IA locale"}`);
    lines.push("");
    lines.push(`- Snapshot: ${snapshot.id || "sans-id"}`);
    lines.push(`- Date: ${new Date(Number(snapshot.saved_at_ms || Date.now())).toLocaleString("fr-FR")}`);
    lines.push(`- Score: ${score === null ? "non calculé" : `${score}/100`}`);
    lines.push(`- CPU: ${scan.cpu_name || "inconnu"} (${scan.cpu_cores || 0} coeurs)`);
    lines.push(`- RAM: ${scan.ram_gb || 0} Go`);
    lines.push(`- GPU: ${scan.gpu_name || "non détecté"}`);
    lines.push(`- VRAM: ${formatVram(scan.vram_gb).replace(" VRAM", "")}`);
    lines.push(`- OS: ${[scan.os_name, scan.os_version].filter(Boolean).join(" ") || "inconnu"}`);
    lines.push(`- Ollama: ${runtimeOllama(scan)}`);
    lines.push(`- Modèles installés: ${(scan.installed_models || []).map(modelLabel).slice(0, 8).join(", ") || "aucun"}`);
    lines.push(`- Modèles conseillés: ${models.join(", ") || "non calculés"}`);
    lines.push(`- Paliers bloqués: ${blocked.join(", ") || "aucun"}`);
    lines.push(`- Upgrades prioritaires: ${upgrades.map(upgradeLabel).join(", ") || "aucun"}`);
    if (benchmark) {
      lines.push(`- Benchmark: ${benchmark.model || "modèle"} - ${benchmark.estimated_tokens_per_second || 0} tok/s estimés`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function upgradeLabel(upgrade) {
  if (!upgrade) return "upgrade";
  if (typeof upgrade === "string") return upgrade;
  return upgrade.title || upgrade.label || upgrade.name || upgrade.component || "upgrade";
}

async function copyLocalHistory() {
  if (!state.localSnapshots.length) {
    setStatus("Aucun historique local à copier", "warn");
    return;
  }
  await navigator.clipboard.writeText(localHistoryMarkdown());
  setStatus("Historique local copié en Markdown", "ok");
}

function renderSyncResult(payload) {
  const machine = payload.machine || {};
  const url = payload.memoryforge_url
    ? `https://outilsia.fr${payload.memoryforge_url}`
    : "https://outilsia.fr/compte";
  return `
    <strong>${escapeHtml(machine.name || state.scan?.name || "Machine synchronisée")}</strong>
    <span>Export MemoryForge: <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a></span>
  `;
}

function absolutize(path) {
  if (String(path).startsWith("http")) return path;
  return `https://outilsia.fr${path}`;
}

async function copyMarkdown() {
  await navigator.clipboard.writeText(els.memoryText.value);
  setStatus("Markdown copié", "ok");
}

function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadMarkdown() {
  downloadTextFile("outilsia-machine-ia-locale.md", els.memoryText.value, "text/markdown;charset=utf-8");
}

async function exportVault() {
  if (!state.scan) return;
  setStatus("Export Obsidian en cours...");
  els.vaultBtn.disabled = true;
  const memoryMarkdown = els.memoryText.value.trim() || state.markdown || cockpitMemoryMarkdown();
  try {
    const result = invoke
      ? await invoke("export_obsidian_vault", {
          scan: state.scan,
          compatibility: state.compatibility,
          benchmark: state.benchmark,
          memoryMarkdown
        })
      : {
          path: "mode navigateur - export Tauri requis",
          files: [
            "INDEX.md",
            "MANIFESTE.md",
            "00-Machine.md",
            "01-Modeles-compatibles.md",
            "02-Modeles-installes.md",
            "03-Benchmarks.md",
            "04-Achats-guides.md",
            "05-Dialogues-locaux.md",
            "06-Shopping-list.md",
            "07-Rapport-partageable.md",
            "08-Fiches-modeles.md",
            "09-Catalogues-OutilsIA.md",
            "10-Journal-cockpit.md",
            "MEMORY.md",
            "HERMES.md"
          ]
        };
    lastVaultPath = result.path || "";
    els.vaultResult.innerHTML = `
      <strong>${escapeHtml(result.path || "Vault créé")}</strong>
      <span>${escapeHtml((result.files || []).join(", "))}</span>
    `;
    els.openVaultBtn.disabled = !invoke || !lastVaultPath;
    setStatus("Vault Obsidian exporté", "ok");
  } catch (error) {
    els.vaultResult.textContent = String(error);
    setStatus(String(error), "bad");
  } finally {
    els.vaultBtn.disabled = false;
  }
}

async function openVault() {
  if (!lastVaultPath) {
    setStatus("Aucun vault exporté dans cette session", "bad");
    return;
  }
  if (!invoke) {
    setStatus("Ouverture dossier disponible dans l'app Tauri", "warn");
    return;
  }
  await invoke("open_obsidian_vault", { path: lastVaultPath });
  setStatus("Dossier vault ouvert", "ok");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function demoScan() {
  return {
    name: "RTX 3090 / Ryzen 9",
    machine_key: "demo-local",
    source: "browser-demo",
    os_name: "Demo",
    os_version: "navigateur",
    cpu_name: "Ryzen 9",
    cpu_cores: 16,
    ram_gb: 64,
    gpu_name: "NVIDIA GeForce RTX 3090",
    gpu_vendor: "NVIDIA",
    gpu_category: "high-end",
    vram_gb: 24,
    unified_memory: false,
    storage_free_gb: 420,
    runtimes: {
      ollama: { installed: true, version: "ollama demo" },
      ollama_wsl: { installed: false, version: null, source: "ollama-wsl" },
      wsl: {
        installed: true,
        version: "WSL version demo",
        state: "wsl_detected",
        source: "wsl.exe",
        default_distribution: "Ubuntu",
        distributions: ["Ubuntu"],
        ollama_ready: false,
        install_command: "wsl.exe --install",
        ollama_install_command: "wsl.exe sh -lc \"curl -fsSL https://ollama.com/install.sh | sh\"",
        ollama_test_command: "wsl.exe ollama run qwen3:0.6b"
      }
    },
    installed_models: [
      { model_name: "qwen3", model_tag: "0.6b", size_gb: 0.5, runtime: "ollama" },
      { model_name: "qwen3", model_tag: "latest", size_gb: 5.2, runtime: "ollama" },
      { model_name: "hermes3", model_tag: "8b", size_gb: 4.7, runtime: "ollama" }
    ],
    raw_scan: {
      gpu_probe: {
        name: "NVIDIA GeForce RTX 3090",
        vendor: "NVIDIA",
        category: "high-end",
        vram_gb: 24,
        vram_confidence: "measured_nvidia_smi",
        source: "nvidia-smi",
        driver_version: "576.80",
        cuda_version: "12.9",
        rocm_version: null,
        memory_used_mb: 820,
        performance_state: "P2",
        rebar_status: "enabled",
        temperature_c: 48,
        utilization_percent: 12,
        power_draw_w: 72,
        power_limit_w: 350,
        pcie_link_width_current: 16,
        pcie_link_width_max: 16,
        pcie_link_gen_current: 4,
        pcie_link_gen_max: 4
      },
      memory_probe: {
        total_gb: 64,
        module_count: 2,
        memory_type: "DDR5",
        configured_clock_mhz: 6000,
        speed_mhz: 6000,
        channel_mode: "multiple_modules_detected",
        confidence: "module_layout_only",
        source: "demo",
        modules: [
          { size_gb: 32, memory_type: "DDR5", configured_clock_mhz: 6000, speed_mhz: 6000, manufacturer: "Demo", part_number: "DDR5-6000", slot: "A2" },
          { size_gb: 32, memory_type: "DDR5", configured_clock_mhz: 6000, speed_mhz: 6000, manufacturer: "Demo", part_number: "DDR5-6000", slot: "B2" }
        ]
      },
      motherboard_probe: {
        manufacturer: "MSI",
        product: "MPG X870E CARBON WIFI",
        version: "1.0",
        bios_version: "1A20",
        max_memory_gb: 256,
        memory_slots: 4,
        source: "demo"
      }
    }
  };
}

function demoCompatibility() {
  return {
    compatibility: {
      score: 96,
      catalog_version: "demo-modeles-2026-06-22",
      upgrade_catalog_version: "demo-upgrades-2026-06-30",
      catalog_count: 31,
      summary: "Machine excellente pour IA locale: 24 Go VRAM ouvrent Qwen, Hermes, gros contextes et multi-modèles.",
      model_recommendations: [
        { name: "Qwen3 test léger", params: "0.6B", kind: "text", use_case: "test rapide Ollama", reason: "Premier test fiable", ollama: "qwen3:0.6b" },
        { name: "Hermes 3", params: "8B", kind: "text", use_case: "MemoryForge, Obsidian, décisions", reason: "Très bon modèle assistant", ollama: "hermes3:8b" },
        { name: "Qwen 3", params: "14B", kind: "text", use_case: "qualité et raisonnement", reason: "Bon palier qualité", ollama: "qwen3:14b" },
        { name: "Flux Schnell", params: "Image", kind: "image", use_case: "image locale, runtime dédié", reason: "Compatible matériel, non piloté comme chat", ollama: "" },
        { name: "Whisper Large v3", params: "Audio", kind: "audio", use_case: "transcription, non piloté comme chat", reason: "Compatible matériel, pas une commande Ollama chat", ollama: "" }
      ],
      blocked_next: [
        { name: "Qwen 3", params: "32B", kind: "text", vram_q4: 20, reason: "Demande un palier 24 Go pour garder de la marge" },
        { name: "Llama 4 Maverick", params: "109B MoE", kind: "text", vram_q4: 65, reason: "Trop lourd sans grosse VRAM" }
      ],
      upgrades: [
        {
          name: "RTX 3090 24 Go",
          label: "Gros LLM 24 Go",
          component: "gpu",
          reason: "24 Go VRAM ouvrent les 32B quantifiés et plus de marge pour Hermes/Mixtral.",
          price_range_eur: "650-950 occasion selon état",
          avoid: "Occasion sans test température/ventilation/alimentation.",
          effects: { vram_gb: 24 },
          cost_eur: { min: 650, max: 950 },
          requirements: { system_power_w: 750, gpu_power_w: 350, pcie_generation: 4, reference_case_clearance_mm: 313, reference_slots: 3 }
        }
      ]
    }
  };
}

function demoMarkdown() {
  return "# Machine IA locale\n\n- Demo RTX 3090\n- Qwen3 / Hermes / Ollama\n";
}

function demoBenchmark(model) {
  return {
    model,
    machine_key: state.scan?.machine_key || "demo-local",
    runtime: "native",
    prompt: els.benchmarkPromptInput.value,
    elapsed_ms: 1200,
    output_chars: 180,
    estimated_tokens: 45,
    estimated_tokens_per_second: 37.5,
    measurement_source: "ollama_api",
    total_duration_ms: 1200,
    load_duration_ms: 120,
    prompt_eval_count: 30,
    prompt_eval_duration_ms: 150,
    prompt_tokens_per_second: 200,
    eval_count: 45,
    eval_duration_ms: 1200,
    success: true,
    timed_out: false,
    output_preview: "La VRAM stocke les poids du modèle et le contexte, ce qui évite les allers-retours lents avec la RAM.",
    error: null,
    execution_mode: "auto",
    runtime_model_size_bytes: 5_200_000_000,
    runtime_vram_bytes: 5_200_000_000,
    runtime_gpu_offload_percent: 100,
    runtime_processor: "gpu",
    runtime_evidence_source: "ollama_api_ps",
    created_at_ms: Date.now()
  };
}

function demoChat(model, prompt) {
  return {
    model,
    prompt,
    elapsed_ms: 980,
    output_chars: 220,
    estimated_tokens: 55,
    estimated_tokens_per_second: 56.1,
    measurement_source: "ollama_api",
    total_duration_ms: 980,
    load_duration_ms: 40,
    prompt_eval_count: 42,
    prompt_eval_duration_ms: 120,
    prompt_tokens_per_second: 350,
    eval_count: 55,
    eval_duration_ms: 980,
    success: true,
    timed_out: false,
    output_preview: "Ton PC peut faire tourner des modèles légers à moyens avec Ollama ; commence par qwen3:0.6b pour valider l'installation, puis monte vers un modèle plus lourd selon la RAM et la VRAM détectées.",
    error: null,
    created_at_ms: Date.now()
  };
}

function demoSnapshot() {
  return {
    id: "snapshot-demo",
    saved_at_ms: Date.now(),
    scan: state.scan || demoScan(),
    compatibility: state.compatibility || demoCompatibility(),
    benchmark: state.benchmark || demoBenchmark("qwen3:8b")
  };
}

function demoSync() {
  return {
    ok: true,
    machine: { id: 1, name: state.scan?.name || "Machine demo" },
    memoryforge_url: "/api/account/machines/1/memoryforge.md"
  };
}

function installTestHarness() {
  if (!window || window.__OUTILSIA_TEST__) return;
  window.__OUTILSIA_TEST__ = {
    demoScan,
    demoCompatibility,
    demoBenchmark,
    evaluateArenaObjective,
    evaluateRecommendationProof,
    recommendationEnginePrompt,
    recommendationDecision,
    recommendationEngineCandidates,
    demoRecommendationOutput,
    arenaObjectiveProfileScore,
    doctorRuntimeEvidence,
    gpuProbeIsUnknown,
    gpuDisplayLabel,
    memoryChannelLabel,
    hardwareDoctorAnalysis,
    hardwareDoctorSnapshot,
    runtimeDriverIntelligence,
    runtimeDriverAccelerationExpected,
    primaryActionState,
    buildCapabilityPassport,
    verifyCapabilityPassportIntegrity,
    capabilityPassportSummary,
    strategyArenaReadiness,
    modelInstallSizeBudget,
    evaluateInstallSafetyPreflight,
    installSafetyPreflightSummary,
    setViewMode,
    defaultOllamaRuntime,
    ollamaRuntimePayload,
    ollamaRuntimeCommandLabel,
    installedOllamaRuntimeFor,
    modelAutopilotCandidates,
    scoreModelAutopilotResults,
    modelAutopilotSnapshot,
    privateWorkloadPolicy,
    privateWorkloadPacks,
    privateWorkloadPack,
    privateWorkloadInstalledModels,
    evaluatePrivateWorkloadPack,
    privateWorkloadPackSummary,
    privateWorkloadMarkdown,
    flightRecorderCapture,
    compareFlightRecorderCaptures,
    flightRecorderSummary,
    flightRecorderExportDocument,
    flightRecorderMarkdown,
    saveFlightRecorderReference,
    restorePreviousFlightRecorderReference,
    buildUpgradeDigitalTwin,
    digitalTwinSummary,
    digitalTwinExportDocument,
    digitalTwinMarkdown,
    simulateUpgradeDigitalTwin,
    saveUpgradeDigitalTwinScenario,
    restorePreviousUpgradeDigitalTwinScenario,
    applyModelAutopilotRecommendation,
    rollbackModelAutopilotProfile,
    async applyInstallSafetyPreflightState() {
      this.applyDemoState();
      const ready = evaluateInstallSafetyPreflight("qwen3:14b", {
        schema: INSTALL_SAFETY_PREFLIGHT_SCHEMA,
        model: "qwen3:14b",
        runtime: "native",
        runtime_ready: true,
        model_already_installed: false,
        storage_free_gb: 120,
        storage_scope: "default_model_store",
        storage_source: "native_model_store_volume",
        storage_path_exposed: false,
        checked_at_ms: Date.now()
      });
      const blocked = evaluateInstallSafetyPreflight("qwen3:70b", {
        runtime: "native",
        runtime_ready: true,
        model_already_installed: false,
        storage_free_gb: 20,
        storage_scope: "custom_model_store",
        storage_source: "native_model_store_volume",
        storage_path_exposed: false,
        checked_at_ms: Date.now()
      });
      const unknown = evaluateInstallSafetyPreflight("qwen3-coder-next", {
        runtime: "wsl",
        runtime_ready: true,
        model_already_installed: false,
        storage_free_gb: null,
        storage_scope: "unknown_model_store",
        storage_source: "wsl_storage_unavailable",
        storage_path_exposed: false,
        checked_at_ms: Date.now()
      });
      const alreadyInstalled = evaluateInstallSafetyPreflight("qwen3:0.6b", {
        runtime: "native",
        runtime_ready: true,
        model_already_installed: true,
        storage_free_gb: 120,
        storage_scope: "default_model_store",
        storage_source: "native_model_store_volume",
        storage_path_exposed: false,
        checked_at_ms: Date.now()
      });
      state.installSafetyPreflight = ready;
      if (els.operationState) els.operationState.textContent = "préflight validé";
      appendInstallSafetyPreflight(ready);
      renderReadinessPanel();
      const report = readinessReport();
      const passport = await buildCapabilityPassport();
      state.capabilityPassport = passport;
      renderCapabilityPassportPanel();
      return {
        ready,
        blocked,
        unknown,
        alreadyInstalled,
        summary: installSafetyPreflightSummary(),
        report,
        passport,
        markdown: readinessMarkdown(report),
        panel: els.readinessBox?.textContent || "",
        operation: els.operationConsole?.textContent || ""
      };
    },
    async applyPrivateWorkloadPackState() {
      const secretPrompt = "Prépare la décision privée DOSSIER-PRIVATE-7788 sans envoyer son contenu.";
      const requiredTerms = ["dossier-private-7788", "validation-locale"];
      window.localStorage?.removeItem(PRIVATE_WORKLOAD_RUNS_KEY);
      state.privateWorkloadRun = null;
      this.applyDemoState();
      els.privateWorkloadPackSelect.value = "custom";
      els.privateWorkloadCustomPrompt.value = secretPrompt;
      els.privateWorkloadRequiredTerms.value = requiredTerms.join(", ");
      syncPrivateWorkloadSelections();

      const descriptor = privateWorkloadDescriptor();
      const goodOutput = JSON.stringify({
        answer: "DOSSIER-PRIVATE-7788 est traité en validation-locale.",
        evidence: "Les deux termes obligatoires sont présents dans la réponse locale.",
        action: "Vérifier le résultat puis comparer les modèles."
      });
      const partialOutput = JSON.stringify({
        answer: "DOSSIER-PRIVATE-7788 est traité localement.",
        evidence: "Un terme obligatoire manque volontairement.",
        action: "Relire le résultat."
      });
      const samples = [
        { model: "qwen3:0.6b", output: goodOutput, tokens_per_second: 37.5, elapsed_ms: 1200 },
        { model: "hermes3:8b", output: partialOutput, tokens_per_second: 28.4, elapsed_ms: 2500 }
      ];
      const results = [];
      for (const sample of samples) {
        const proof = evaluatePrivateWorkloadPack(sample.output, descriptor.pack.key, descriptor.requiredTerms);
        results.push({
          model: sample.model,
          runtime: "native",
          success: true,
          timed_out: false,
          elapsed_ms: sample.elapsed_ms,
          tokens_per_second: sample.tokens_per_second,
          score: proof.score,
          passed_count: proof.passed_count,
          total_count: proof.total_count,
          valid_json: proof.valid_json,
          checks: proof.checks,
          output_digest: await sha256Hex(sample.output),
          error: ""
        });
      }
      const winner = privateWorkloadWinner(results);
      writePrivateWorkloadRun({
        schema: "outilsia.private_workload_run.v1",
        protocol: PRIVATE_WORKLOAD_PROTOCOL,
        catalog_version: PRIVATE_WORKLOAD_CATALOG.version,
        id: "private-workload-test-harness",
        created_at_ms: Date.now(),
        machine_key: state.scan.machine_key || "",
        pack: descriptor.pack.key,
        custom: true,
        prompt_digest: await sha256Hex(descriptor.prompt),
        prompt_length: descriptor.prompt.length,
        required_term_count: descriptor.requiredTerms.length,
        model_count: results.length,
        results,
        winner,
        confidence: privateWorkloadConfidence(results, winner)
      });
      invalidateCapabilityPassport();
      renderPrivateWorkloadPanel();
      renderReadinessPanel();
      const report = readinessReport();
      const memory = cockpitMemoryMarkdown();
      const passport = await buildCapabilityPassport();
      state.capabilityPassport = passport;
      renderCapabilityPassportPanel();
      const passportVerified = await verifyCapabilityPassportIntegrity(passport);
      const sanitizedFailure = persistedPrivateWorkloadRun({
        schema: "outilsia.private_workload_run.v1",
        protocol: PRIVATE_WORKLOAD_PROTOCOL,
        catalog_version: PRIVATE_WORKLOAD_CATALOG.version,
        id: "private-workload-failure-sanitizer",
        created_at_ms: Date.now(),
        machine_key: state.scan.machine_key || "",
        pack: "custom",
        custom: true,
        prompt_digest: await sha256Hex(descriptor.prompt),
        results: [{
          model: "qwen3:0.6b",
          success: false,
          timed_out: false,
          error: `${secretPrompt} ${goodOutput}`,
          checks: []
        }]
      });
      return {
        secretPrompt,
        requiredTerms,
        catalog: PRIVATE_WORKLOAD_CATALOG,
        run: state.privateWorkloadRun,
        stored: JSON.parse(window.localStorage?.getItem(PRIVATE_WORKLOAD_RUNS_KEY) || "[]"),
        summary: privateWorkloadPackSummary(),
        markdown: privateWorkloadMarkdown(),
        report,
        memory,
        passport,
        passportVerified,
        sanitizedFailure,
        pdf: premiumReportHtml(report),
        panel: els.privateWorkloadBox?.textContent || ""
      };
    },
    applyRuntimeDriverIntelligenceState() {
      const makeScan = ({
        name,
        vendor = "",
        vram = null,
        ram = 64,
        unified = false,
        os = "Windows 11",
        source = "powershell-win32-videocontroller",
        driver = "",
        cuda = "",
        rocm = "",
        vulkan = "",
        kernelDriver = "",
        category = "unknown",
        wslBridge = "unknown"
      }) => {
        const scan = JSON.parse(JSON.stringify(demoScan()));
        scan.name = name || "Machine runtime test";
        scan.machine_key = `runtime-${String(name || "test").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        scan.os_name = os;
        scan.os_version = "test";
        scan.ram_gb = ram;
        scan.gpu_name = name || null;
        scan.gpu_vendor = vendor || null;
        scan.gpu_category = category;
        scan.vram_gb = vram;
        scan.unified_memory = unified;
        scan.runtimes.wsl.gpu_bridge = wslBridge;
        scan.runtimes.wsl.gpu_bridge_source = wslBridge === "unknown" ? "" : "wsl_dev_dxg";
        scan.raw_scan.memory_probe.total_gb = ram;
        scan.raw_scan.gpu_probe = {
          name: name || null,
          vendor: vendor || null,
          category,
          vram_gb: vram,
          source,
          vram_confidence: unified
            ? "unified_memory_not_dedicated_vram"
            : source === "nvidia-smi"
              ? "measured_nvidia_smi"
              : vram > 0
                ? "estimated_win32_adapter_ram"
                : "unknown",
          driver_version: driver || null,
          driver_date: driver ? "2026-06-15" : null,
          driver_provider: vendor || null,
          pnp_device_id: vendor ? `PCI\\VEN_${vendor.toUpperCase()}` : null,
          cuda_version: cuda || null,
          rocm_version: rocm || null,
          vulkan_version: vulkan || null,
          kernel_driver: kernelDriver || null
        };
        return scan;
      };
      const untested = {
        status: "untested",
        processor: "unknown",
        gpu_offload_percent: 0,
        source: "",
        automatic_success: false,
        cpu_success: false
      };
      const cpuProven = {
        ...untested,
        status: "cpu-proven",
        processor: "cpu",
        source: "ollama_api_ps",
        automatic_success: true
      };
      const gpuProven = {
        ...untested,
        status: "gpu-proven",
        processor: "gpu",
        gpu_offload_percent: 100,
        source: "ollama_api_ps",
        automatic_success: true
      };
      const pascalScan = makeScan({
        name: "NVIDIA GeForce GTX 1080 Ti",
        vendor: "NVIDIA",
        vram: 11,
        ram: 16,
        source: "nvidia-smi",
        driver: "576.80",
        cuda: "12.9",
        category: "unknown",
        wslBridge: "available"
      });
      const oldPascalScan = JSON.parse(JSON.stringify(pascalScan));
      oldPascalScan.raw_scan.gpu_probe.driver_version = "528.49";
      const rtxScan = makeScan({
        name: "NVIDIA GeForce RTX 4080 SUPER",
        vendor: "NVIDIA",
        vram: 16,
        source: "nvidia-smi",
        driver: "576.80",
        cuda: "12.9",
        category: "performance"
      });
      const amdScan = makeScan({
        name: "AMD Radeon RX 7900 XTX",
        vendor: "AMD",
        vram: 24,
        driver: "32.0.21031.1005",
        rocm: "7.2.1",
        vulkan: "1.3.290",
        category: "high-end"
      });
      const strixWindowsScan = makeScan({
        name: "AMD Radeon 8060S",
        vendor: "AMD",
        ram: 128,
        unified: true,
        driver: "32.0.21031.1005",
        rocm: "7.2.1",
        vulkan: "1.3.290",
        category: "unified-memory"
      });
      const strixLinuxScan = makeScan({
        name: "AMD Radeon 8060S",
        vendor: "AMD",
        ram: 128,
        unified: true,
        os: "Linux",
        source: "lspci-nnk",
        driver: "",
        rocm: "7.0.0",
        vulkan: "1.3.290",
        kernelDriver: "amdgpu",
        category: "unified-memory"
      });
      const intelScan = makeScan({
        name: "Intel Arc B580",
        vendor: "Intel",
        vram: 12,
        driver: "32.0.101.6739",
        vulkan: "1.3.290",
        category: "entry-local-ai"
      });
      const cpuScan = makeScan({
        name: "",
        vendor: "",
        vram: 0,
        ram: 16,
        source: "cpu-only-declared",
        category: "cpu-only"
      });

      const results = {
        matrix: RUNTIME_DRIVER_MATRIX,
        pascal: runtimeDriverIntelligence(pascalScan, { runtimeEvidence: untested }),
        pascalOldDriver: runtimeDriverIntelligence(oldPascalScan, { runtimeEvidence: untested }),
        pascalGpuProven: runtimeDriverIntelligence(pascalScan, { runtimeEvidence: gpuProven }),
        rtx: runtimeDriverIntelligence(rtxScan, { runtimeEvidence: untested }),
        amdWindows: runtimeDriverIntelligence(amdScan, { runtimeEvidence: untested }),
        strixWindows: runtimeDriverIntelligence(strixWindowsScan, { runtimeEvidence: untested }),
        strixLinux: runtimeDriverIntelligence(strixLinuxScan, { runtimeEvidence: untested }),
        intelArc: runtimeDriverIntelligence(intelScan, { runtimeEvidence: cpuProven }),
        cpuOnly: runtimeDriverIntelligence(cpuScan, { runtimeEvidence: cpuProven })
      };

      renderScan(cpuScan);
      renderCompatibility(demoCompatibility());
      const cpuBenchmark = {
        ...demoBenchmark("qwen3:0.6b"),
        runtime_processor: "cpu",
        runtime_gpu_offload_percent: 0,
        runtime_vram_bytes: 0,
        runtime_evidence_source: "ollama_api_ps",
        execution_mode: "auto"
      };
      state.benchmark = cpuBenchmark;
      writeBenchmarkHistory([cpuBenchmark]);
      state.markdown = "";
      results.cpuOnlyPrimaryAction = primaryActionState();

      renderScan(pascalScan);
      renderCompatibility(demoCompatibility());
      state.benchmark = cpuBenchmark;
      writeBenchmarkHistory([cpuBenchmark]);
      state.markdown = "";
      results.pascalCpuFallback = runtimeDriverIntelligence(pascalScan, { runtimeEvidence: cpuProven });
      results.pascalPrimaryAction = primaryActionState();
      results.pascalDoctor = hardwareDoctorSnapshot(pascalScan);
      results.pascalPanel = els.hardwareDoctorBox?.textContent || "";
      return results;
    },
    async applyModelAutopilotState() {
      window.localStorage?.removeItem(MODEL_AUTOPILOT_PROFILES_KEY);
      this.applyDemoState();
      const model = "qwen3:0.6b";
      els.benchmarkModelInput.value = model;
      const factors = { fast: 1.08, balanced: 1, quality: 0.88 };
      const candidates = modelAutopilotCandidates(model);
      const measured = candidates.map((profile, index) => ({
        ...demoBenchmark(model),
        created_at_ms: Date.now() + index,
        measurement_source: "ollama_api",
        prompt_tokens_per_second: 180 - (index * 15),
        estimated_tokens_per_second: Number((120 * factors[profile.key]).toFixed(1)),
        output_preview: "AUTO-42 | VRAM | benchmark local.",
        protocol: MODEL_AUTOPILOT_PROTOCOL,
        autopilot_profile: profile.key,
        autopilot_label: profile.label,
        tuning: profile.tuning,
        autopilot_proof_ok: true
      }));
      const scored = scoreModelAutopilotResults(measured);
      state.modelAutopilotRun = {
        schema: MODEL_AUTOPILOT_PROTOCOL,
        model,
        runtime: "native",
        running: false,
        measured_at: new Date().toISOString(),
        budget: { profiles: 3, timeout_seconds_each: 55, downloads: 0 },
        results: scored.results,
        recommended: scored.recommended
      };
      renderModelAutopilot();
      const measuredSnapshot = modelAutopilotSnapshot();
      applyModelAutopilotRecommendation();
      const appliedSnapshot = modelAutopilotSnapshot();
      const field = fieldTestMachineEntry();
      const bridge = strategyArenaReadiness();
      const report = readinessReport();
      const passport = await buildCapabilityPassport();
      const passportVerified = await verifyCapabilityPassportIntegrity(passport);
      const panel = els.modelAutopilotBox?.textContent || "";
      rollbackModelAutopilotProfile();
      const rolledBackSnapshot = modelAutopilotSnapshot();
      return { measuredSnapshot, appliedSnapshot, rolledBackSnapshot, field, bridge, report, passport, passportVerified, panel };
    },
    async applyCapabilityPassportState() {
      this.applyDemoState();
      const passport = await generateCapabilityPassport();
      const verified = await verifyCapabilityPassportIntegrity(passport);
      const originalScan = state.scan;
      const unknownScan = JSON.parse(JSON.stringify(originalScan));
      delete unknownScan.ram_gb;
      delete unknownScan.vram_gb;
      delete unknownScan.storage_free_gb;
      delete unknownScan.raw_scan.memory_probe.total_gb;
      delete unknownScan.raw_scan.gpu_probe.vram_gb;
      state.scan = unknownScan;
      invalidateCapabilityPassport();
      const unknownPassport = capabilityPassportDocument();
      const unknownField = fieldTestMachineEntry();
      state.scan = originalScan;
      state.capabilityPassport = passport;
      const tampered = JSON.parse(JSON.stringify(passport));
      tampered.machine.ram_gb += 1;
      const tamperedVerified = await verifyCapabilityPassportIntegrity(tampered);
      const historyBefore = readBenchmarkHistory();
      writeBenchmarkHistory([{ ...demoBenchmark("qwen3:0.6b"), created_at_ms: Date.now() + 10_000 }, ...historyBefore]);
      const staleSummary = capabilityPassportSummary();
      writeBenchmarkHistory(historyBefore);
      return {
        passport,
        unknownPassport,
        unknownField,
        verified,
        tamperedVerified,
        staleSummary,
        summary: capabilityPassportSummary(),
        doctor: hardwareDoctorSnapshot(),
        readiness: readinessReport(),
        bridge: strategyArenaReadiness(),
        field: fieldTestMachineEntry(),
        memory: cockpitMemoryMarkdown(),
        panel: els.capabilityPassportBox?.textContent || ""
      };
    },
    async applyLocalCapabilityBridgeState() {
      const passportState = await this.applyCapabilityPassportState();
      const digest = passportState.passport.integrity.digest;
      state.localCapabilityBridge = {
        schema: LOCAL_CAPABILITY_BRIDGE_SCHEMA,
        contract_version: LOCAL_CAPABILITY_BRIDGE_CONTRACT_VERSION,
        running: true,
        base_url: "http://127.0.0.1:43127",
        token: `bridge-test-${"a".repeat(52)}`,
        expires_at_ms: Date.now() + (LOCAL_CAPABILITY_BRIDGE_TTL_SECONDS * 1000),
        ttl_seconds: LOCAL_CAPABILITY_BRIDGE_TTL_SECONDS,
        bind: "127.0.0.1",
        read_only: true,
        token_persisted: false,
        passport_digest: digest,
        endpoints: localCapabilityBridgePolicy().endpoints,
        test_mode: true
      };
      renderLocalCapabilityBridgePanel();
      renderStrategyBridgePanel();
      renderReadinessPanel();
      return {
        payload: localCapabilityBridgePayload(),
        pairing: localCapabilityBridgePairingDocument(),
        summary: localCapabilityBridgeSummary(),
        passport: passportState.passport,
        report: readinessReport(),
        bridge: strategyArenaReadiness(),
        panel: els.localCapabilityBridgeBox?.textContent || ""
      };
    },
    invalidateLocalCapabilityBridgeState() {
      invalidateCapabilityPassport();
      renderCapabilityPassportPanel();
      renderLocalCapabilityBridgePanel();
      return {
        summary: localCapabilityBridgeSummary(),
        hasRuntime: Boolean(state.localCapabilityBridge),
        panel: els.localCapabilityBridgeBox?.textContent || ""
      };
    },
    applyFlightRecorderState() {
      window.localStorage?.removeItem(FLIGHT_RECORDER_STORE_KEY);
      this.applyDemoState();
      saveFlightRecorderReference();
      const baseline = flightRecorderExportDocument();
      const currentScan = state.scan;
      state.scan = {
        ...currentScan,
        raw_scan: {
          ...(currentScan.raw_scan || {}),
      gpu_probe: {
            ...(currentScan.raw_scan?.gpu_probe || {}),
            driver_version: "577.10",
            temperature_c: 66
          }
        }
      };
      const degraded = {
        ...demoBenchmark("qwen3:0.6b"),
        created_at_ms: Date.now() + 10_000,
        estimated_tokens_per_second: 26,
        prompt_tokens_per_second: 130,
        load_duration_ms: 240,
        runtime_gpu_offload_percent: 60,
        prompt: baseline.current.binding.prompt
      };
      state.benchmark = degraded;
      writeBenchmarkHistory([degraded, ...readBenchmarkHistory()]);
      renderBenchmark(degraded);
      renderFlightRecorder();
      const regression = flightRecorderExportDocument();
      const nonComparableCapture = JSON.parse(JSON.stringify(regression.current));
      nonComparableCapture.binding.tuning = { num_ctx: 8192, num_batch: 128, num_thread: 8 };
      const nonComparable = compareFlightRecorderCaptures(regression.active_reference.capture, nonComparableCapture);
      saveFlightRecorderReference();
      const activeAfterSecondReference = flightRecorderSummary();
      restorePreviousFlightRecorderReference();
      const activeAfterRestore = flightRecorderSummary();
      return {
        baseline,
        regression,
        nonComparable,
        activeAfterSecondReference,
        activeAfterRestore,
        report: readinessReport(),
        passportDocument: capabilityPassportDocument(),
        bridge: strategyArenaReadiness(),
        field: fieldTestMachineEntry(),
        markdown: flightRecorderMarkdown(),
        panel: els.flightRecorderBox?.textContent || ""
      };
    },
    async applyUpgradeDigitalTwinState() {
      window.localStorage?.removeItem(UPGRADE_DIGITAL_TWIN_STORE_KEY);
      this.applyDemoState();
      const scan = demoScan();
      scan.name = "Demo Core i7 GTX 1080 Ti";
      scan.machine_key = "demo-z97-1080ti";
      scan.cpu_name = "Intel Core i7-4790K";
      scan.cpu_cores = 4;
      scan.ram_gb = 16;
      scan.gpu_name = "NVIDIA GeForce GTX 1080 Ti";
      scan.gpu_vendor = "NVIDIA";
      scan.vram_gb = 11;
      scan.raw_scan.gpu_probe = {
        ...scan.raw_scan.gpu_probe,
        name: scan.gpu_name,
        vram_gb: 11,
        power_limit_w: 250,
        pcie_link_gen_current: 3,
        pcie_link_gen_max: 3,
        temperature_c: 54
      };
      scan.raw_scan.memory_probe = {
        ...scan.raw_scan.memory_probe,
        total_gb: 16,
        module_count: 4,
        memory_type: "DDR3",
        configured_clock_mhz: 1600,
        speed_mhz: 1600,
        modules: [
          { size_gb: 4, memory_type: "DDR3", slot: "A1" },
          { size_gb: 4, memory_type: "DDR3", slot: "A2" },
          { size_gb: 4, memory_type: "DDR3", slot: "B1" },
          { size_gb: 4, memory_type: "DDR3", slot: "B2" }
        ]
      };
      scan.raw_scan.motherboard_probe = {
        manufacturer: "ASUSTeK COMPUTER INC.",
        product: "Z97-A",
        version: "Rev 1.xx",
        bios_version: "3503",
        max_memory_gb: 32,
        memory_slots: 4,
        source: "demo"
      };
      renderScan(scan);
      const compatibility = demoCompatibility();
      compatibility.compatibility.score = 54;
      renderCompatibility(compatibility);

      writeBenchmarkHistory([]);
      state.benchmark = null;
      applyDigitalTwinDraftToControls({ name: "Conserver sans preuve", gpu_target: "current" });
      const beforeBenchmark = simulateUpgradeDigitalTwin();
      const transitionResult = {
        ...demoBenchmark("qwen3:0.6b"),
        machine_key: scan.machine_key,
        runtime: "ollama"
      };
      state.benchmark = transitionResult;
      saveBenchmarkHistoryEntry(transitionResult);
      refreshDigitalTwinAfterProofChange();
      const transitionTestModel = prepareFlowState().testModel;
      const transitionBenchmark = successfulBenchmarkFor(transitionTestModel);
      const afterBenchmark = state.upgradeDigitalTwinRun;
      renderCompatibility(compatibility);
      const afterCompatibility = state.upgradeDigitalTwinRun;
      const afterCompatibilityUi = [els.upgradeList, els.buyingList, els.actionList]
        .map((element) => element?.textContent || "")
        .join("\n");

      applyDigitalTwinDraftToControls({
        name: "RTX 3090 + 64 Go sur Z97",
        gpu_target: "rtx3090_24gb",
        ram_target_gb: 64,
        storage_add_gb: 2000,
        planned_psu_w: 650,
        case_clearance_mm: 300,
        candidate_gpu_length_mm: 313,
        airflow: "standard"
      });
      const blocked = simulateUpgradeDigitalTwin();

      applyDigitalTwinDraftToControls({
        name: "RTX 3090 + 32 Go DDR3 à vérifier",
        gpu_target: "rtx3090_24gb",
        ram_target_gb: 32,
        storage_add_gb: 1000,
        planned_psu_w: 850,
        case_clearance_mm: 350,
        candidate_gpu_length_mm: 313,
        airflow: "high"
      });
      const candidate = simulateUpgradeDigitalTwin();
      const candidateVisibleUi = [els.upgradeList, els.buyingList, els.decisionPackBox]
        .map((element) => element?.textContent || "")
        .join("\n");
      const savedCandidate = saveUpgradeDigitalTwinScenario();

      applyDigitalTwinDraftToControls({ name: "Conserver la machine", gpu_target: "current" });
      const noChange = simulateUpgradeDigitalTwin();
      const savedNoChange = saveUpgradeDigitalTwinScenario();
      const restored = restorePreviousUpgradeDigitalTwinScenario();

      const purchaseBudget = buildUpgradeDigitalTwin({
        ...candidate.draft,
        psu_purchase_required: true,
        cooling_purchase_required: true
      }, compatibility.compatibility);

      const missingModuleScan = JSON.parse(JSON.stringify(scan));
      delete missingModuleScan.raw_scan.memory_probe.module_count;
      delete missingModuleScan.raw_scan.memory_probe.modules;
      renderScan(missingModuleScan);
      renderCompatibility(compatibility);
      applyDigitalTwinDraftToControls({ name: "RAM sans comptage modules", gpu_target: "current", ram_target_gb: 32 });
      const missingModules = simulateUpgradeDigitalTwin();

      const unknownResourceScan = JSON.parse(JSON.stringify(scan));
      delete unknownResourceScan.ram_gb;
      delete unknownResourceScan.vram_gb;
      delete unknownResourceScan.storage_free_gb;
      delete unknownResourceScan.raw_scan.memory_probe.total_gb;
      delete unknownResourceScan.raw_scan.gpu_probe.vram_gb;
      renderScan(unknownResourceScan);
      renderCompatibility(compatibility);
      applyDigitalTwinDraftToControls({ name: "Ressources non exposées", gpu_target: "current" });
      const unknownResources = simulateUpgradeDigitalTwin();

      const unifiedScan = JSON.parse(JSON.stringify(scan));
      unifiedScan.name = "Demo Strix Halo 128 Go";
      unifiedScan.machine_key = "demo-strix-halo-128";
      unifiedScan.gpu_name = "AMD Radeon 8060S";
      unifiedScan.gpu_vendor = "AMD";
      unifiedScan.unified_memory = true;
      unifiedScan.ram_gb = 128;
      delete unifiedScan.vram_gb;
      unifiedScan.raw_scan.memory_probe.total_gb = 128;
      unifiedScan.raw_scan.gpu_probe.name = unifiedScan.gpu_name;
      delete unifiedScan.raw_scan.gpu_probe.vram_gb;
      renderScan(unifiedScan);
      renderCompatibility(compatibility);
      applyDigitalTwinDraftToControls({ name: "Strix Halo vers RTX 3090", gpu_target: "rtx3090_24gb" });
      const unifiedMemoryTarget = simulateUpgradeDigitalTwin();

      state.upgradeDigitalTwinRun = candidate;
      const upgradedScan = JSON.parse(JSON.stringify(scan));
      upgradedScan.ram_gb = 64;
      upgradedScan.raw_scan.memory_probe.total_gb = 64;
      renderScan(upgradedScan);
      const staleSummaryAfterRescan = digitalTwinSummary();
      renderCompatibility(compatibility);
      const recalculatedAfterRescan = digitalTwinSummary();

      const strongerGpuScan = JSON.parse(JSON.stringify(scan));
      strongerGpuScan.gpu_name = "NVIDIA GeForce RTX 3090";
      strongerGpuScan.vram_gb = 24;
      strongerGpuScan.raw_scan.gpu_probe.name = strongerGpuScan.gpu_name;
      strongerGpuScan.raw_scan.gpu_probe.vram_gb = 24;
      strongerGpuScan.raw_scan.gpu_probe.power_limit_w = 350;
      renderScan(strongerGpuScan);
      renderCompatibility(compatibility);
      applyDigitalTwinDraftToControls({ name: "Downgrade 24 vers 12 Go", gpu_target: "rtx3060_12gb" });
      const downgrade = simulateUpgradeDigitalTwin();
      const noBuyReport = readinessReport();
      const noBuyPack = currentDecisionPack();
      const noBuyPdf = premiumReportHtml(noBuyReport);
      const noBuyVisibleUi = [els.upgradeList, els.buyingList, els.actionList, els.decisionPackBox]
        .map((element) => element?.textContent || "")
        .join("\n");

      renderScan(scan);
      renderCompatibility(compatibility);
      activateUpgradeDigitalTwinScenario(savedCandidate.id);
      const passport = await buildCapabilityPassport();
      return {
        blocked,
        beforeBenchmark,
        transitionTestModel,
        transitionBenchmark,
        afterBenchmark,
        afterCompatibility,
        afterCompatibilityUi,
        candidate,
        candidateVisibleUi,
        noChange,
        noBuy: downgrade,
        savedCandidate,
        savedNoChange,
        noBuyReport,
        noBuyPack,
        noBuyPdf,
        noBuyVisibleUi,
        restored,
        purchaseBudget,
        missingModules,
        unknownResources,
        unifiedMemoryTarget,
        staleSummaryAfterRescan,
        recalculatedAfterRescan,
        downgrade,
        exportDocument: digitalTwinExportDocument(),
        summary: digitalTwinSummary(),
        report: readinessReport(),
        passport,
        bridge: strategyArenaReadiness(),
        field: fieldTestMachineEntry(),
        memory: cockpitMemoryMarkdown(),
        markdown: digitalTwinMarkdown(),
        readinessMarkdown: readinessMarkdown(),
        pdf: premiumReportHtml(),
        panel: els.upgradeImpactBox?.textContent || ""
      };
    },
    applyHardwareTruthState() {
      this.applyDemoState();
      const unknownScan = JSON.parse(JSON.stringify(demoScan()));
      unknownScan.name = "Machine GPU à confirmer";
      unknownScan.machine_key = "demo-gpu-unknown";
      delete unknownScan.gpu_name;
      delete unknownScan.gpu_vendor;
      delete unknownScan.vram_gb;
      unknownScan.gpu_category = "unknown";
      unknownScan.raw_scan.gpu_probe = {
        name: null,
        vendor: null,
        category: "unknown",
        vram_gb: null,
        source: "not_detected"
      };
      renderScan(unknownScan);
      renderCompatibility(demoCompatibility());
      const unknownDoctor = hardwareDoctorSnapshot(unknownScan);
      const unknownField = fieldTestMachineEntry();
      const unknownPassport = capabilityPassportDocument();
      const unknownUi = {
        gpu: els.gpuText?.textContent || "",
        topGpu: els.topGpuText?.textContent || "",
        doctor: els.hardwareDoctorBox?.textContent || ""
      };

      const fourModuleScan = JSON.parse(JSON.stringify(demoScan()));
      fourModuleScan.raw_scan.memory_probe = {
        ...fourModuleScan.raw_scan.memory_probe,
        module_count: 4,
        channel_mode: "multiple_modules_detected",
        confidence: "module_layout_only",
        modules: ["A1", "A2", "B1", "B2"].map((slot) => ({
          size_gb: 16,
          memory_type: "DDR5",
          configured_clock_mhz: 6000,
          speed_mhz: 6000,
          slot
        }))
      };
      renderScan(fourModuleScan);
      renderCompatibility(demoCompatibility());
      const fourModuleDoctor = hardwareDoctorSnapshot(fourModuleScan);
      const fourModuleUi = els.hardwareDoctorBox?.textContent || "";

      return {
        unknownDoctor,
        unknownField,
        unknownPassport,
        unknownUi,
        fourModuleDoctor,
        fourModuleUi
      };
    },
    applyDemoState() {
      writeRecommendationRun(null);
      const scan = demoScan();
      renderScan(scan);
      renderCompatibility(demoCompatibility());
      const qwen = demoBenchmark("qwen3:0.6b");
      const hermes = { ...demoBenchmark("hermes3:8b"), estimated_tokens_per_second: 28.4, elapsed_ms: 2500 };
      state.benchmark = qwen;
      writeBenchmarkHistory([qwen, hermes]);
      writeLastArenaRun({
        id: "arena-test-harness",
        created_at_ms: Date.now(),
        prompt: "Pourquoi la VRAM est importante pour un LLM local ?",
        machine: {
          name: scan.name,
          gpu_name: scan.gpu_name,
          vram_gb: scan.vram_gb,
          ram_gb: scan.ram_gb,
          machine_key: scan.machine_key
        },
        results: [qwen, hermes]
      });
      const prompt = promptForgeOptimize("Pourquoi la VRAM est importante pour un LLM local ?");
      state.promptForge = prompt;
      state.chatResult = demoChat("hermes3:8b", "Résume cette machine pour Obsidian.");
      lastSyncedMachineId = 1;
      lastShareReportUrl = "https://outilsia.fr/r/demo";
      readinessProof.savedAccount = true;
      readinessProof.shared = true;
      renderBenchmark(qwen);
      renderPromptForge(prompt);
      renderLocalChat(state.chatResult);
      renderPreparePanel();
      renderReadinessPanel();
      renderArenaPanel();
      renderStrategyBridgePanel();
      renderFieldTestPanel();
      renderModelAutopilot();
      renderPrimaryAction();
      state.markdown = cockpitMemoryMarkdown();
      els.memoryText.value = state.markdown;
      els.copyBtn.disabled = false;
      els.downloadBtn.disabled = false;
      els.vaultBtn.disabled = false;
      return {
        quick: {
          action: els.quickActionText?.textContent || "",
          model: els.quickModelText?.textContent || "",
          proof: els.quickProofText?.textContent || "",
          upgrade: els.quickUpgradeText?.textContent || ""
        },
        memory: state.markdown,
        bridge: strategyArenaReadiness(),
        wsl: wslRuntimeInfo(scan)
      };
    },
    applyObjectiveArenaState() {
      this.applyDemoState();
      const validOutput = '{"instruction":"BLEU-47","memory":"RIVIERE-29","calculation":42,"correction":"La VRAM accélère l’inférence locale.","action":"Tester le modèle puis comparer les résultats."}';
      const partialOutput = '{"instruction":"BLEU-47","memory":"AUTRE","calculation":41,"correction":"La VRAM accélère l’inférence locale.","action":"Tester le modèle puis comparer les résultats."}';
      const qwen = {
        ...demoBenchmark("qwen3:0.6b"),
        output_preview: validOutput,
        benchmark_protocol: ARENA_OBJECTIVE_PROTOCOL,
        arena_objective: evaluateArenaObjective(validOutput)
      };
      const hermes = {
        ...demoBenchmark("hermes3:8b"),
        output_preview: partialOutput,
        estimated_tokens_per_second: 28.4,
        elapsed_ms: 2500,
        benchmark_protocol: ARENA_OBJECTIVE_PROTOCOL,
        arena_objective: evaluateArenaObjective(partialOutput)
      };
      writeBenchmarkHistory([qwen, hermes]);
      writeLastArenaRun({
        id: "arena-objective-test-harness",
        created_at_ms: Date.now(),
        protocol: ARENA_OBJECTIVE_PROTOCOL,
        protocol_label: "Arena objective v1",
        prompt: ARENA_OBJECTIVE_PROMPT,
        machine: {
          name: state.scan?.name || "Machine demo",
          gpu_name: state.scan?.gpu_name || "",
          vram_gb: state.scan?.vram_gb || 0,
          ram_gb: state.scan?.ram_gb || 0,
          machine_key: state.scan?.machine_key || ""
        },
        results: [qwen, hermes]
      });
      state.benchmark = qwen;
      renderBenchmark(qwen);
      renderArenaPanel();
      renderStrategyBridgePanel();
      state.markdown = cockpitMemoryMarkdown();
      return {
        arena: els.arenaBox?.textContent || "",
        memory: state.markdown,
        bridge: strategyArenaReadiness()
      };
    },
    applyRecommendationEngineState(profileKey = "code") {
      this.applyDemoState();
      localStorage.setItem(USAGE_PROFILE_KEY, profileKey);
      const qwenOutput = demoRecommendationOutput(profileKey);
      const hermesOutput = JSON.stringify({
        instruction: "BLEU-47",
        memory: "RIVIERE-29",
        calculation: 42,
        correction: "La VRAM accélère l'inférence locale.",
        action: "Tester le modèle puis comparer les résultats.",
        usage: profileKey === "code" ? "function add(a,b){return a - b;} puis add(4,5) vaut 8" : "réponse partielle"
      });
      const candidateResources = {
        storage_label: "4-6 Go",
        storage_free_gb: 420,
        vram_required_q4_gb: 5,
        machine_vram_gb: Number(state.scan?.vram_gb || 0),
        machine_ram_gb: Number(state.scan?.ram_gb || 0),
        fit: "GPU compatible en Q4 estimé"
      };
      const qwen = {
        ...demoBenchmark("qwen3:latest"),
        output_preview: qwenOutput,
        estimated_tokens_per_second: 37.5,
        elapsed_ms: 1880,
        benchmark_protocol: RECOMMENDATION_ENGINE_PROTOCOL,
        recommendation_proof: evaluateRecommendationProof(qwenOutput, profileKey),
        resource_estimates: candidateResources
      };
      qwen.arena_objective = qwen.recommendation_proof;
      const hermes = {
        ...demoBenchmark("hermes3:8b"),
        output_preview: hermesOutput,
        estimated_tokens_per_second: 28.4,
        elapsed_ms: 2500,
        benchmark_protocol: RECOMMENDATION_ENGINE_PROTOCOL,
        recommendation_proof: evaluateRecommendationProof(hermesOutput, profileKey),
        resource_estimates: candidateResources
      };
      hermes.arena_objective = hermes.recommendation_proof;
      const run = {
        id: "recommendation-test-harness",
        schema: "outilsia.recommendation_run.v2",
        protocol: RECOMMENDATION_ENGINE_PROTOCOL,
        created_at_ms: Date.now(),
        profile: profileKey,
        profile_label: USAGE_PROFILES[profileKey]?.label || "Polyvalent",
        prompt: recommendationEnginePrompt(profileKey),
        candidate_refs: [qwen.model, hermes.model],
        machine: {
          name: state.scan?.name || "Machine demo",
          gpu_name: state.scan?.gpu_name || "",
          vram_gb: state.scan?.vram_gb || 0,
          ram_gb: state.scan?.ram_gb || 0,
          machine_key: state.scan?.machine_key || ""
        },
        results: [qwen, hermes]
      };
      writeBenchmarkHistory([qwen, hermes]);
      writeRecommendationRun(run);
      state.benchmark = qwen;
      renderPreparePanel();
      renderReadinessPanel();
      renderStrategyBridgePanel();
      renderFieldTestPanel();
      state.markdown = cockpitMemoryMarkdown();
      const report = readinessReport();
      const currentScan = state.scan;
      state.scan = { ...currentScan, machine_key: "different-machine" };
      const staleRecommendation = recommendationReportSnapshot();
      state.scan = currentScan;
      return {
        prepare: els.prepareBox?.textContent || "",
        readiness: els.readinessBox?.textContent || "",
        report,
        markdown: state.markdown,
        pdf: premiumReportHtml(report),
        bridge: strategyArenaReadiness(),
        field: fieldTestMachineEntry(),
        decision: recommendationDecision(run),
        staleRecommendation
      };
    },
    wslRuntimeInfo,
    applyCudaFailureState() {
      const scan = demoScan();
      scan.installed_models = [
        ...(scan.installed_models || []),
        { model_name: "qwen3", model_tag: "0.6b", size_gb: 0.5, runtime: "ollama", source: "ollama" }
      ];
      const failure = {
        ...demoBenchmark("qwen3:0.6b"),
        success: false,
        estimated_tokens_per_second: 0,
        output_preview: "",
        error: "CUDA error: the provided PTX was compiled with an unsupported toolchain.",
        execution_mode: "auto"
      };
      renderScan(scan);
      renderCompatibility(demoCompatibility());
      state.benchmark = failure;
      writeBenchmarkHistory([failure]);
      renderBenchmark(failure);
      renderPreparePanel();
      renderReadinessPanel();
      renderPrimaryAction();
      return {
        action: primaryActionState(),
        runtime: runtimeReadinessState("qwen3:0.6b"),
        cpuRetryVisible: Boolean(document.querySelector("[data-retry-benchmark-cpu]")),
        proof: els.quickProofText?.textContent || ""
      };
    },
    applyCpuFallbackSuccessState() {
      const failed = this.applyCudaFailureState();
      const cpu = {
        ...demoBenchmark("qwen3:0.6b"),
        estimated_tokens_per_second: 5.4,
        elapsed_ms: 6200,
        execution_mode: "cpu"
      };
      state.benchmark = cpu;
      writeBenchmarkHistory([cpu, latestBenchmarkFor("qwen3:0.6b", { executionMode: "auto" })].filter(Boolean));
      renderBenchmark(cpu);
      renderPreparePanel();
      renderReadinessPanel();
      renderPrimaryAction();
      return {
        previous: failed,
        action: primaryActionState(),
        runtime: runtimeReadinessState("qwen3:0.6b"),
        report: readinessReport()
      };
    },
    applyPromptForgeNeededState() {
      const scan = demoScan();
      const qwen = demoBenchmark("qwen3:0.6b");
      renderScan(scan);
      renderCompatibility(demoCompatibility());
      state.benchmark = qwen;
      state.chatResult = null;
      writeBenchmarkHistory([qwen]);
      writeLastArenaRun(null);
      if (els.promptForgeInput) els.promptForgeInput.value = "";
      if (els.promptForgeResult) {
        els.promptForgeResult.className = "promptforge-result empty";
        els.promptForgeResult.textContent = "PromptForge transforme un prompt flou en instruction claire pour Qwen, Hermes, Llama ou Mistral.";
      }
      if (els.chatResult) els.chatResult.textContent = "Interroge un modèle Ollama installé directement depuis l'app.";
      renderBenchmark(qwen);
      renderPromptLibrary();
      renderPreparePanel();
      renderReadinessPanel();
      renderArenaPanel();
      renderStrategyBridgePanel();
      renderFieldTestPanel();
      renderPrimaryAction();
      return {
        action: primaryActionState(),
        visibleTools: [...document.querySelectorAll(".benchmark-panel, .promptforge-panel, .chat-panel")]
          .filter((panel) => panel.offsetParent !== null)
          .map((panel) => panel.className)
      };
    },
    applyReportNeededState() {
      const scan = demoScan();
      scan.installed_models = [
        ...(scan.installed_models || []),
        { model_name: "qwen3", model_tag: "0.6b", size_gb: 0.5, runtime: "ollama" }
      ];
      const qwen = demoBenchmark("qwen3:0.6b");
      const hermes = { ...demoBenchmark("hermes3:8b"), estimated_tokens_per_second: 28.4, elapsed_ms: 2500 };
      renderScan(scan);
      renderCompatibility(demoCompatibility());
      state.benchmark = qwen;
      state.chatResult = demoChat("hermes3:8b", "Résume cette machine pour Obsidian.");
      writeBenchmarkHistory([qwen, hermes]);
      writeLastArenaRun({
        id: "arena-report-harness",
        created_at_ms: Date.now(),
        prompt: "Pourquoi la VRAM est importante pour un LLM local ?",
        machine: {
          name: scan.name,
          gpu_name: scan.gpu_name,
          vram_gb: scan.vram_gb,
          ram_gb: scan.ram_gb,
          machine_key: scan.machine_key
        },
        results: [qwen, hermes]
      });
      state.markdown = "";
      els.memoryText.value = "";
      renderBenchmark(qwen);
      renderPreparePanel();
      renderReadinessPanel();
      renderArenaPanel();
      renderStrategyBridgePanel();
      renderFieldTestPanel();
      renderPrimaryAction();
      return {
        action: primaryActionState(),
        reportReady: prepareFlowState().reportReady,
        readinessVisible: Boolean(els.readinessPanel?.offsetParent)
      };
    },
    applyDualRuntimeWslModelState() {
      const scan = demoScan();
      scan.runtimes = {
        ...(scan.runtimes || {}),
        ollama: { installed: true, version: "ollama windows", source: "ollama-cli" },
        ollama_wsl: { installed: true, version: "ollama wsl", source: "ollama-wsl" },
        wsl: {
          installed: true,
          version: "WSL version demo",
          state: "wsl_ready",
          source: "wsl.exe",
          default_distribution: "Ubuntu",
          distributions: ["Ubuntu"],
          ollama_ready: true,
          install_command: "wsl.exe --install",
          ollama_install_command: "wsl.exe sh -lc \"curl -fsSL https://ollama.com/install.sh | sh\"",
          ollama_test_command: "wsl.exe ollama run qwen3:0.6b"
        }
      };
      scan.installed_models = [
        { model_name: "qwen3", model_tag: "0.6b", size_gb: 0.5, runtime: "ollama-wsl", source: "ollama-wsl" },
        { model_name: "hermes3", model_tag: "8b", size_gb: 4.7, runtime: "ollama", source: "ollama" }
      ];
      renderScan(scan);
      renderPrimaryAction();
      return {
        qwenRuntime: installedOllamaRuntimeFor("qwen3:0.6b"),
        qwenDefault: defaultOllamaRuntime("qwen3:0.6b"),
        qwenPayload: ollamaRuntimePayload("qwen3:0.6b"),
        qwenCommand: ollamaRuntimeCommandLabel("qwen3:0.6b"),
        hermesRuntime: installedOllamaRuntimeFor("hermes3:8b"),
        hermesDefault: defaultOllamaRuntime("hermes3:8b"),
        hermesPayload: ollamaRuntimePayload("hermes3:8b"),
        hermesCommand: ollamaRuntimeCommandLabel("hermes3:8b")
      };
    },
    applyInstallProgressState() {
      const scan = demoScan();
      renderScan(scan);
      renderCompatibility(demoCompatibility());
      const model = "phi4:14b";
      state.installingModels = { [model]: true };
      resetOperationConsole(`Installation Ollama demandée : ${model}`);
      setCancelOperationEnabled(true, model);
      setOperationFocus(`Téléchargement en cours : ${model}`, [
        `Commande : ${ollamaRuntimeCommandLabel()} pull ${model}`,
        "La progression apparaît ici et dans la console détaillée."
      ]);
      appendOperationLine("pulling 96e6f7d988dd: 49% ████████ 12 GB/ 26 GB 26 MB/s 8m23s", "ollama");
      renderCommands(extractModels(state.compatibility?.compatibility || state.compatibility || {}));
      renderPrimaryAction();
      return {
        operationTitle: els.operationMonitorTitle?.textContent || "",
        operationState: els.operationState?.textContent || "",
        operationLines: els.operationMonitorLines?.textContent || "",
        commandText: els.commandList?.textContent || "",
        modelText: els.modelList?.textContent || "",
        jumpVisible: Boolean(els.operationJumpBtn?.offsetParent),
        cancelVisible: Boolean(els.cancelOperationBtn?.offsetParent) && !els.cancelOperationBtn.disabled,
        panelVisible: Boolean(els.operationPanel?.offsetParent),
        monitorLive: Boolean(els.operationMonitor?.classList.contains("operation-live")),
        installed: isOllamaModelInstalledInScan(model),
        installing: isOllamaModelInstalling(model)
      };
    },
    memoryMarkdown: () => cockpitMemoryMarkdown(),
    arenaWinners,
    arenaWinner,
    arenaDisplayScore,
    strategyBridge: () => strategyArenaReadiness(),
    strategyBridgeMarkdown,
    readiness: () => readinessReport(),
    setFieldTestProfile,
    effectiveFieldTestProfile: () => effectiveFieldTestProfile(),
    fieldTestEntry: () => fieldTestMachineEntry(),
    fieldTestPayload: () => fieldTestEntryPayload(),
    pdfHtml: () => premiumReportHtml()
  };
}

function demoShareReport() {
  return {
    ok: true,
    share_url: "/r/demo",
    absolute_url: "https://outilsia.fr/r/demo"
  };
}

function demoFeedback() {
  return {
    ok: true,
    feedback: {
      id: 1,
      machine_id: lastSyncedMachineId,
      category: els.feedbackCategory.value || "detection",
      status: "new"
    }
  };
}

function demoPairing() {
  return {
    ok: true,
    code: "DEMO-2026",
    poll_token: "demo",
    authorize_url: "/desktop/pair?code=DEMO-2026"
  };
}

function demoClaim() {
  return {
    ok: true,
    status: "approved",
    desktop_token: "demo",
    account_url: "/compte"
  };
}

function demoDesktopManifest() {
  return {
    ok: true,
    channel: "demo",
    current_version: "0.1.0",
    catalog_version: "demo",
    upgrade_catalog_version: "demo-upgrades-2026-06-30",
    content_signals_version: "content-signals-demo",
    download_url: "https://outilsia.fr/telecharger-scanner-ia-local",
    release_feed_url: "https://outilsia.fr/static/downloads/local-cockpit/release.json",
    downloads_base_url: "https://outilsia.fr/static/downloads/local-cockpit/",
    features: {
      sync_machine: true,
      share_report: true,
      memoryforge_export: true,
      obsidian_vault_export: true,
      delete_machine: true
    }
  };
}

function demoContentSignals() {
  return {
    ok: true,
    version: "content-signals-demo",
    updated_at: "2026-07-02",
    pages_scanned: 17,
    pages_with_signals: 16,
    signals: {
      models: [
        { key: "qwen", label: "Qwen", count: 252, pages: [{ path: "/blog/rtx-3090-qwen-3-6-hermes-ia-locale-2026", title: "RTX 3090 + Qwen 3.6 + Hermes" }] },
        { key: "hermes", label: "Hermes / Nous Hermes", count: 88, pages: [{ path: "/blog/rtx-3090-qwen-3-6-hermes-ia-locale-2026", title: "RTX 3090 + Qwen 3.6 + Hermes" }] }
      ],
      hardware: [
        { key: "rtx_3090", label: "RTX 3090 24 Go", count: 40, pages: [{ path: "/blog/rtx-3090-qwen-3-6-hermes-ia-locale-2026", title: "RTX 3090 + Qwen 3.6 + Hermes" }] },
        { key: "ram", label: "RAM / DDR5", count: 35, pages: [{ path: "/materiel", title: "Matériel IA locale" }] }
      ],
      runtimes: [
        { key: "ollama", label: "Ollama", count: 120, pages: [{ path: "/scanner-ia-local", title: "Scanner IA local" }] }
      ]
    },
    top_pages: [
      { path: "/blog/rtx-3090-qwen-3-6-hermes-ia-locale-2026", title: "RTX 3090 + Qwen 3.6 + Hermes", signal_count: 5 },
      { path: "/materiel", title: "Matériel IA locale", signal_count: 4 }
    ]
  };
}

function demoDesktopUpdates() {
  return {
    ok: true,
    catalog_version: "demo",
      machine_count: 1,
      upgrade_catalog_version: "demo-upgrades-2026-06-30",
      catalog_count: 31,
      updates: [{
      machine_id: 1,
      name: "Demo RTX 3090",
      gpu_name: "RTX 3090",
      vram_gb: 24,
      ram_gb: 64,
      score: { score: 97 },
      new_models: [{ name: "Qwen 3", params: "32B" }, { name: "Hermes 3", params: "8B" }],
      recommended_commands: [
        { model: "Qwen 3", params: "8B", ollama: "qwen3:8b" },
        { model: "Hermes 3", params: "8B", ollama: "adrienbrault/nous-hermes2theta-llama3-8b:q4" }
      ],
      score_after_primary_upgrade: { score: 99 },
      unlocked_by_primary_upgrade: [{ name: "Qwen 3", params: "32B" }],
      primary_upgrade: { name: "SSD NVMe modèle local" },
      buying_guides: [{ title: "Exploiter une grosse VRAM", url: "/blog/installer-hermes-nous-research-guide-2026" }]
    }]
  };
}

els.prepareBtn.addEventListener("click", handlePrimaryAction);
els.stickyActionBtn?.addEventListener("click", handlePrimaryAction);
els.quickActionBtn?.addEventListener("click", handlePrimaryAction);
if (els.viewEssentialBtn) els.viewEssentialBtn.addEventListener("click", () => setViewMode("essential"));
if (els.viewAdvancedBtn) els.viewAdvancedBtn.addEventListener("click", () => setViewMode("advanced"));
els.preparePanelBtn.addEventListener("click", prepareLocalAiFlow);
els.oldPortablePresetBtn?.addEventListener("click", applyOldPortablePreset);
els.scanBtn.addEventListener("click", scanMachine);
els.checkBtn.addEventListener("click", checkCompatibility);
els.memoryBtn.addEventListener("click", generateMemory);
els.saveBtn.addEventListener("click", saveLocalSnapshot);
if (els.topAccountBtn) els.topAccountBtn.addEventListener("click", handleTopAccountClick);
els.pairBtn.addEventListener("click", startPairing);
els.openPairBtn.addEventListener("click", openPairingPage);
els.claimBtn.addEventListener("click", claimPairing);
els.syncBtn.addEventListener("click", syncDesktop);
els.shareReportBtn.addEventListener("click", createShareReport);
els.refreshUpdatesBtn.addEventListener("click", refreshDesktopUpdates);
els.disconnectBtn.addEventListener("click", disconnectDesktop);
els.benchmarkBtn.addEventListener("click", runBenchmark);
els.syncBenchmarkBtn.addEventListener("click", syncBenchmark);
els.runModelAutopilotBtn?.addEventListener("click", runModelAutopilot);
els.applyModelAutopilotBtn?.addEventListener("click", applyModelAutopilotRecommendation);
els.rollbackModelAutopilotBtn?.addEventListener("click", rollbackModelAutopilotProfile);
els.benchmarkModelInput?.addEventListener("input", renderModelAutopilot);
els.benchmarkModelInput?.addEventListener("input", renderFlightRecorder);
els.saveFlightReferenceBtn?.addEventListener("click", saveFlightRecorderReference);
els.compareFlightReferenceBtn?.addEventListener("click", compareCurrentFlightRecorder);
els.restoreFlightReferenceBtn?.addEventListener("click", restorePreviousFlightRecorderReference);
els.copyFlightRecorderJsonBtn?.addEventListener("click", copyFlightRecorderJson);
els.copyFlightRecorderMarkdownBtn?.addEventListener("click", copyFlightRecorderMarkdown);
els.chatSendBtn.addEventListener("click", runLocalChat);
els.chatCopyBtn.addEventListener("click", copyLocalChatAnswer);
els.chatMemoryBtn.addEventListener("click", saveLocalChatToMemory);
els.copyChatHistoryBtn.addEventListener("click", copyChatHistory);
els.clearChatHistoryBtn.addEventListener("click", clearChatHistory);
els.feedbackBtn.addEventListener("click", () => sendFeedback());
els.releaseRefreshBtn.addEventListener("click", loadReleaseMetadata);
els.selfTestBtn.addEventListener("click", runBetaSelfTest);
els.copyBetaReportBtn.addEventListener("click", copyBetaReport);
els.topCopyWindowsRecipeBtn.addEventListener("click", copyWindowsRecipeEvidence);
els.topDownloadWindowsRecipeBtn.addEventListener("click", downloadWindowsRecipeEvidence);
els.copyDecisionPackBtn.addEventListener("click", copyDecisionPack);
els.copyShoppingListBtn.addEventListener("click", copyShoppingList);
els.saveDecisionPackBtn.addEventListener("click", saveDecisionPackLocal);
els.refreshCatalogBtn.addEventListener("click", refreshCatalogFromServer);
els.copyCatalogReportBtn.addEventListener("click", copyCatalogReport);
els.copyUpgradeImpactBtn.addEventListener("click", copyUpgradeImpact);
els.simulateDigitalTwinBtn?.addEventListener("click", simulateUpgradeDigitalTwin);
els.saveDigitalTwinBtn?.addEventListener("click", saveUpgradeDigitalTwinScenario);
els.restoreDigitalTwinBtn?.addEventListener("click", restorePreviousUpgradeDigitalTwinScenario);
els.copyDigitalTwinJsonBtn?.addEventListener("click", copyUpgradeDigitalTwinJson);
els.copyDigitalTwinMarkdownBtn?.addEventListener("click", copyUpgradeDigitalTwinMarkdown);
els.downloadDigitalTwinJsonBtn?.addEventListener("click", downloadUpgradeDigitalTwinJson);
els.downloadDigitalTwinMarkdownBtn?.addEventListener("click", downloadUpgradeDigitalTwinMarkdown);
els.pdfDigitalTwinBtn?.addEventListener("click", printPremiumReport);
els.copyReadinessSummaryBtn.addEventListener("click", copyReadinessSummary);
els.copyReadinessBtn.addEventListener("click", copyReadinessReport);
els.saveReadinessMemoryBtn.addEventListener("click", saveReadinessToMemory);
els.saveReadinessAccountBtn.addEventListener("click", saveReadinessToAccount);
els.shareReadinessBtn.addEventListener("click", shareReadinessReport);
els.pdfReportBtn?.addEventListener("click", printPremiumReport);
els.pdfReadinessBtn?.addEventListener("click", printPremiumReport);
els.copyWindowsRecipeBtn.addEventListener("click", copyWindowsRecipeEvidence);
els.downloadWindowsRecipeBtn.addEventListener("click", downloadWindowsRecipeEvidence);
els.copyHistoryBtn.addEventListener("click", copyLocalHistory);
els.refreshHistoryBtn.addEventListener("click", loadHistory);
els.clearHistoryBtn.addEventListener("click", clearLocalHistory);
els.copyBenchmarkHistoryBtn.addEventListener("click", copyBenchmarkHistory);
els.clearBenchmarkHistoryBtn.addEventListener("click", clearBenchmarkHistory);
els.promptForgeFromBenchmarkBtn.addEventListener("click", () => fillPromptForgeFrom("benchmark"));
els.promptForgeFromChatBtn.addEventListener("click", () => fillPromptForgeFrom("chat"));
els.promptForgeOptimizeBtn.addEventListener("click", optimizePromptForge);
els.promptForgeUseBenchmarkBtn.addEventListener("click", () => usePromptForge("benchmark"));
els.promptForgeUseChatBtn.addEventListener("click", () => usePromptForge("chat"));
els.promptForgeSaveMemoryBtn.addEventListener("click", savePromptForgeToMemory);
els.copyPromptLibraryBtn.addEventListener("click", copyPromptLibrary);
els.clearPromptLibraryBtn.addEventListener("click", clearPromptLibrary);
els.runArenaBtn.addEventListener("click", runAutomaticArena);
els.copyArenaBtn.addEventListener("click", copyArenaReport);
els.clearArenaRunBtn.addEventListener("click", clearArenaRun);
els.runPrivateWorkloadBtn?.addEventListener("click", runPrivateWorkloadPack);
els.copyPrivateWorkloadBtn?.addEventListener("click", copyPrivateWorkloadProof);
els.clearPrivateWorkloadBtn?.addEventListener("click", clearPrivateWorkloadRuns);
els.privateWorkloadPackSelect?.addEventListener("change", renderPrivateWorkloadPanel);
els.privateWorkloadCustomPrompt?.addEventListener("input", renderPrivateWorkloadPanel);
els.privateWorkloadRequiredTerms?.addEventListener("input", renderPrivateWorkloadPanel);
els.privateWorkloadModelList?.addEventListener("change", (event) => {
  const input = event.target?.closest?.("[data-private-workload-model]");
  if (!input) return;
  const ref = normalizeOllamaRef(input.getAttribute("data-private-workload-model") || "");
  const maximum = Number(privateWorkloadPolicy().max_models_per_run || 3);
  if (input.checked && privateWorkloadSelections.size >= maximum) {
    input.checked = false;
    setStatus(`Maximum ${maximum} modèles par test privé`, "warn");
    return;
  }
  if (input.checked) privateWorkloadSelections.add(ref);
  else privateWorkloadSelections.delete(ref);
  renderPrivateWorkloadPanel();
});
els.operationJumpBtn.addEventListener("click", revealOperationConsole);
els.cancelOperationBtn.addEventListener("click", () => cancelActiveInstall());
els.cancelOperationPanelBtn.addEventListener("click", () => cancelActiveInstall());
els.installWslBtn?.addEventListener("click", () => installWslRuntime());
els.copyWslCommandBtn?.addEventListener("click", copyWslCommand);
els.copyStrategyBridgeJsonBtn.addEventListener("click", copyStrategyBridgeJson);
els.downloadStrategyBridgeJsonBtn?.addEventListener("click", downloadStrategyBridgeJson);
els.copyStrategyBridgeMdBtn.addEventListener("click", copyStrategyBridgeMarkdown);
els.generateCapabilityPassportBtn?.addEventListener("click", generateCapabilityPassport);
els.copyCapabilityPassportBtn?.addEventListener("click", copyCapabilityPassport);
els.downloadCapabilityPassportBtn?.addEventListener("click", downloadCapabilityPassport);
els.startLocalCapabilityBridgeBtn?.addEventListener("click", startLocalCapabilityBridge);
els.copyLocalCapabilityBridgeBtn?.addEventListener("click", copyLocalCapabilityBridgeConnection);
els.refreshLocalCapabilityBridgeBtn?.addEventListener("click", () => refreshLocalCapabilityBridgeStatus(false));
els.stopLocalCapabilityBridgeBtn?.addEventListener("click", () => stopLocalCapabilityBridge(false));
els.copyFieldTestBtn.addEventListener("click", copyFieldTestMarkdown);
els.copyFieldTestJsonBtn?.addEventListener("click", copyFieldTestJson);
els.downloadFieldTestJsonBtn?.addEventListener("click", downloadFieldTestJson);
if (els.fieldTestProfileSelect) {
  els.fieldTestProfileSelect.value = selectedFieldTestProfile();
  els.fieldTestProfileSelect.addEventListener("change", () => setFieldTestProfile(els.fieldTestProfileSelect.value));
}
els.copyBtn.addEventListener("click", copyMarkdown);
els.downloadBtn.addEventListener("click", downloadMarkdown);
els.vaultBtn.addEventListener("click", exportVault);
els.openVaultBtn.addEventListener("click", openVault);
document.addEventListener("click", async (event) => {
  const link = event.target?.closest?.("a[href]");
  const linkUrl = link?.getAttribute?.("data-open-url") || link?.getAttribute?.("href") || "";
  if (link && (linkUrl.startsWith("https://outilsia.fr") || linkUrl.startsWith("/"))) {
    event.preventDefault();
    try {
      await openOutilsiaUrl(linkUrl);
      setStatus("Page OutilsIA ouverte dans le navigateur", "ok");
    } catch (error) {
      setStatus(String(error), "bad");
    }
    return;
  }

  const restoreSnapshotId = event.target?.getAttribute?.("data-restore-snapshot") || "";
  if (restoreSnapshotId) {
    restoreLocalSnapshot(restoreSnapshotId);
    return;
  }

  const flightReferenceId = event.target?.closest?.("[data-flight-reference]")?.getAttribute?.("data-flight-reference") || "";
  if (flightReferenceId) {
    activateFlightRecorderReference(flightReferenceId);
    return;
  }

  const digitalTwinScenarioId = event.target?.closest?.("[data-digital-twin-scenario]")?.getAttribute?.("data-digital-twin-scenario") || "";
  if (digitalTwinScenarioId) {
    activateUpgradeDigitalTwinScenario(digitalTwinScenarioId);
    return;
  }

  const refreshSnapshotId = event.target?.getAttribute?.("data-refresh-snapshot") || "";
  if (refreshSnapshotId) {
    await refreshSnapshotCompatibility(refreshSnapshotId);
    return;
  }

  const deleteSnapshotId = event.target?.getAttribute?.("data-delete-snapshot") || "";
  if (deleteSnapshotId) {
    await deleteLocalHistoryItem(deleteSnapshotId);
    return;
  }

  const deleteMachineId = Number(event.target?.getAttribute?.("data-delete-machine") || 0);
  if (deleteMachineId) {
    await deleteSyncedMachine(deleteMachineId);
    return;
  }

  const shareMachineId = Number(event.target?.getAttribute?.("data-create-share") || 0);
  if (shareMachineId) {
    lastSyncedMachineId = shareMachineId;
    await createShareReport();
    return;
  }

  const memoryforgeMachineId = Number(event.target?.getAttribute?.("data-fetch-memoryforge") || 0);
  if (memoryforgeMachineId) {
    try {
      setStatus("Chargement MemoryForge compte...");
      const markdown = invoke
        ? await invoke("fetch_desktop_memoryforge_with_token", { machineId: memoryforgeMachineId })
        : demoMarkdown();
      state.markdown = markdown;
      els.memoryText.value = markdown;
      els.copyBtn.disabled = false;
      els.downloadBtn.disabled = false;
      els.vaultBtn.disabled = false;
      setStatus("MemoryForge compte chargé", "ok");
    } catch (error) {
      setStatus(String(error), "bad");
    }
    return;
  }

  const feedbackMachineId = Number(event.target?.getAttribute?.("data-feedback-machine") || 0);
  if (feedbackMachineId) {
    lastSyncedMachineId = feedbackMachineId;
    els.feedbackMessage.focus();
    els.feedbackResult.textContent = `Feedback lié à la machine #${feedbackMachineId}. Décris ce qui est faux puis clique sur Envoyer feedback.`;
    setStatus("Feedback machine prêt", "ok");
    return;
  }

  const openUrl = event.target?.closest?.("[data-open-url]")?.getAttribute?.("data-open-url");
  if (openUrl) {
    if (invoke) {
      await invoke("open_external_url", { url: openUrl });
    } else {
      window.open(openUrl, "_blank", "noopener,noreferrer");
    }
    setStatus("Page OutilsIA ouverte", "ok");
    return;
  }

  const commandButton = event.target?.closest?.("[data-copy-command]");
  const command = commandButton?.getAttribute?.("data-copy-command");
  if (command) {
    await navigator.clipboard.writeText(command);
    setStatus("Commande Ollama copiée", "ok");
    return;
  }
  const profileButton = event.target?.closest?.("[data-test-profile]");
  const profileKey = profileButton?.getAttribute?.("data-test-profile");
  if (profileKey && TEST_PROFILES[profileKey]) {
    const profile = TEST_PROFILES[profileKey];
    els.benchmarkPromptInput.value = profile.prompt;
    els.chatPromptInput.value = profile.prompt;
    setStatus(`Profil ${profile.label} prêt`, "ok");
    return;
  }
  const usageProfileButton = event.target?.closest?.("[data-usage-profile]");
  const usageProfileKey = usageProfileButton?.getAttribute?.("data-usage-profile");
  if (usageProfileKey && USAGE_PROFILES[usageProfileKey]) {
    applyUsageProfile(usageProfileKey);
    return;
  }
  const usagePackButton = event.target?.closest?.("[data-usage-pack]");
  const usagePackTarget = usagePackButton?.getAttribute?.("data-usage-pack");
  if (usagePackTarget) {
    useUsageProfilePack(usagePackTarget);
    return;
  }
  const recommendationButton = event.target?.closest?.("[data-run-recommendation]");
  const recommendationProfile = recommendationButton?.getAttribute?.("data-run-recommendation");
  if (recommendationProfile && USAGE_PROFILES[recommendationProfile]) {
    await runRecommendationEngine(recommendationProfile);
    return;
  }
  const oldPortablePresetButton = event.target?.closest?.("[data-old-portable-preset]");
  if (oldPortablePresetButton) {
    applyOldPortablePreset();
    return;
  }
  const cpuRetryButton = event.target?.closest?.("[data-retry-benchmark-cpu]");
  const cpuRetryModel = cpuRetryButton?.getAttribute?.("data-retry-benchmark-cpu");
  if (cpuRetryModel) {
    const model = ollamaActionRef(cpuRetryModel);
    els.benchmarkModelInput.value = model;
    els.chatModelInput.value = model;
    await runBenchmark({ source: "cuda-fallback", forceCpu: true });
    return;
  }
  const postInstallChatButton = event.target?.closest?.("[data-post-install-chat]");
  const postInstallChatModel = postInstallChatButton?.getAttribute?.("data-post-install-chat");
  if (postInstallChatModel) {
    const model = ollamaActionRef(postInstallChatModel);
    els.chatModelInput.value = model;
    if (!els.chatPromptInput.value.trim() || /Explique simplement ce que/.test(els.chatPromptInput.value)) {
      els.chatPromptInput.value = chatPresetPrompt("assistant", model);
    }
    els.chatPromptInput.focus();
    setStatus(`Dialogue prêt avec ${model}`, "ok");
    return;
  }
  const postInstallArenaButton = event.target?.closest?.("[data-post-install-arena]");
  const postInstallArenaModel = postInstallArenaButton?.getAttribute?.("data-post-install-arena");
  if (postInstallArenaModel) {
    const model = ollamaActionRef(postInstallArenaModel);
    els.benchmarkModelInput.value = model;
    els.chatModelInput.value = model;
    if (arenaInstalledCandidates().length >= 2) {
      await runAutomaticArena();
    } else {
      setStatus("Arena prête après installation d'un deuxième modèle", "warn");
    }
    return;
  }
  const keepInstalledButton = event.target?.closest?.("[data-keep-installed-model]");
  const keepInstalledModel = keepInstalledButton?.getAttribute?.("data-keep-installed-model");
  if (keepInstalledModel) {
    setStatus(`${ollamaActionRef(keepInstalledModel)} gardé installé`, "ok");
    renderReadinessPanel();
    return;
  }
  const upgradeSimButton = event.target?.closest?.("[data-upgrade-sim-target]");
  const upgradeSimTarget = upgradeSimButton?.getAttribute?.("data-upgrade-sim-target");
  if (upgradeSimTarget) {
    setUpgradeSimTarget(upgradeSimTarget);
    return;
  }
  const modelInfoButton = event.target?.closest?.("[data-model-info]");
  const modelInfoRef = modelInfoButton?.getAttribute?.("data-model-info");
  if (modelInfoRef) {
    showModelInfo(modelInfoRef);
    return;
  }
  const promptBenchmarkButton = event.target?.closest?.("[data-use-prompt-benchmark]");
  const promptBenchmarkId = promptBenchmarkButton?.getAttribute?.("data-use-prompt-benchmark");
  if (promptBenchmarkId) {
    usePromptLibraryItem(promptBenchmarkId, "benchmark");
    return;
  }
  const promptChatButton = event.target?.closest?.("[data-use-prompt-chat]");
  const promptChatId = promptChatButton?.getAttribute?.("data-use-prompt-chat");
  if (promptChatId) {
    usePromptLibraryItem(promptChatId, "chat");
    return;
  }
  const copyPromptButton = event.target?.closest?.("[data-copy-prompt]");
  const copyPromptId = copyPromptButton?.getAttribute?.("data-copy-prompt");
  if (copyPromptId) {
    await copyPromptLibraryItem(copyPromptId);
    return;
  }
  const deletePromptButton = event.target?.closest?.("[data-delete-prompt]");
  const deletePromptId = deletePromptButton?.getAttribute?.("data-delete-prompt");
  if (deletePromptId) {
    deletePromptLibraryItem(deletePromptId);
    return;
  }
  const chatModelButton = event.target?.closest?.("[data-chat-model]");
  const chatModelRef = chatModelButton?.getAttribute?.("data-chat-model");
  if (chatModelRef) {
    const model = ollamaActionRef(chatModelRef);
    els.chatModelInput.value = model;
    els.chatPromptInput.focus();
    setStatus(`Dialogue prêt avec ${model}`, "ok");
    return;
  }
  const chatPresetButton = event.target?.closest?.("[data-chat-preset]");
  const chatPreset = chatPresetButton?.getAttribute?.("data-chat-preset");
  if (chatPreset) {
    applyChatPreset(chatPreset);
    return;
  }
  const generateCockpitReportButton = event.target?.closest?.("[data-generate-cockpit-report]");
  if (generateCockpitReportButton) {
    generateFinalCockpitReport();
    return;
  }
  const scanButton = event.target?.closest?.("[data-run-scan]");
  if (scanButton) {
    await scanMachine();
    return;
  }
  const copyTestReportButton = event.target?.closest?.("[data-copy-test-report]");
  if (copyTestReportButton) {
    await navigator.clipboard.writeText(firstTestReportText());
    setStatus("Rapport du test copié", "ok");
    return;
  }
  const focusFeedbackButton = event.target?.closest?.("[data-focus-feedback]");
  if (focusFeedbackButton) {
    els.feedbackCategory.value = "benchmark";
    els.feedbackMessage.value = `Résultat benchmark à vérifier :\n\n${firstTestReportText()}`;
    els.feedbackMessage.focus();
    setStatus("Feedback benchmark prêt", "ok");
    return;
  }
  const installButton = event.target?.closest?.("[data-install-model]");
  const installModel = installButton?.getAttribute?.("data-install-model");
  if (installModel) {
    await installRecommendedModel(installModel, installButton);
    return;
  }
  const deleteModelButton = event.target?.closest?.("[data-delete-model]");
  const deleteModel = deleteModelButton?.getAttribute?.("data-delete-model");
  if (deleteModel) {
    await deleteInstalledModel(ollamaActionRef(deleteModel), deleteModelButton);
    return;
  }
  const installOllamaButton = event.target?.closest?.("[data-install-ollama]");
  if (installOllamaButton) {
    await installOllamaRuntime(installOllamaButton);
    return;
  }
  const runButton = event.target?.closest?.("[data-run-model]");
  const runModel = runButton?.getAttribute?.("data-run-model");
  if (runModel) {
    const model = ollamaActionRef(runModel);
    els.benchmarkModelInput.value = model;
    els.chatModelInput.value = model;
    setStatus(`Test court ${model}...`);
    await runBenchmark({ source: "model-card" });
    return;
  }
  const benchmarkButton = event.target?.closest?.("[data-benchmark-model]");
  const benchmarkModel = benchmarkButton?.getAttribute?.("data-benchmark-model");
  if (benchmarkModel) {
    const model = ollamaActionRef(benchmarkModel);
    els.benchmarkModelInput.value = model;
    els.chatModelInput.value = model;
    setStatus(`Test court ${model}...`);
    await runBenchmark({ source: "arena" });
    return;
  }
});

if (!invoke) {
  setStatus("Mode navigateur démo: lance l'app Tauri pour scanner le PC", "warn");
}

restoreViewMode();
loadHistory();
renderBenchmarkHistory();
renderModelAutopilot();
renderFlightRecorder();
renderPromptLibrary();
renderChatHistory();
renderPrivateWorkloadPanel();
renderLocalCapabilityBridgePanel();
renderPreparePanel();
renderReadinessPanel();
renderPrimaryAction();
installTestHarness();
refreshAuthState();

if (invoke) {
  void refreshLocalCapabilityBridgeStatus(true);
  window.setInterval(() => {
    if (state.localCapabilityBridge) void refreshLocalCapabilityBridgeStatus(true);
  }, 15_000);
  window.addEventListener("beforeunload", () => {
    void invoke("stop_local_capability_bridge");
  });
}

async function initializeAppMetadata() {
  await loadAppBuildInfo();
  await loadDesktopManifest();
}

initializeAppMetadata();
