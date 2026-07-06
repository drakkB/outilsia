#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const catalogPath = join(repoRoot, "server-work", "static", "data", "local-ai-models.json");
const appJsPath = join(appRoot, "src", "app.js");
const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(path) {
  if (!existsSync(path)) {
    fail(`missing file: ${path}`);
    return {};
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function readText(path) {
  if (!existsSync(path)) {
    fail(`missing file: ${path}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function flattenModels(catalog) {
  return (catalog.categories || []).flatMap((category) =>
    (category.models || []).map((model) => ({
      ...model,
      category: category.name || "",
    }))
  );
}

function modelLabel(model) {
  return `${model.category ? `${model.category}/` : ""}${model.name || "?"} ${model.params || ""}`.trim();
}

const catalog = readJson(catalogPath);
const appJs = readText(appJsPath);
const models = flattenModels(catalog);
const mediaKinds = new Set(["image", "audio", "video"]);
const mediaModels = models.filter((model) => mediaKinds.has(String(model.kind || "text").toLowerCase()));
const actionableTextModels = models.filter((model) => model.actionable_text === true);

if (!models.length) fail("catalog has no models");
if (!mediaModels.length) fail("catalog has no media compatibility models to guard");
if (!actionableTextModels.length) fail("catalog has no actionable text models");

for (const model of mediaModels) {
  const label = modelLabel(model);
  if (model.actionable_text !== false) {
    fail(`${label}: media model must declare actionable_text=false`);
  }
  if (String(model.ollama || "").trim()) {
    fail(`${label}: media model must not expose an Ollama chat command`);
  }
}

for (const needle of [
  "function isMediaOrNonChatModel(model)",
  "function isActionableTextModel(model)",
  "function isWatchlistRuntime(model)",
  "function isPilotableTextRuntime(model)",
  "function actionableOllamaRef(model)",
  "function modelActionability(model)",
  "if (typeof model !== \"string\" && !isActionableTextModel(model)) return \"\";",
  "if (typeof model !== \"string\" && !isPilotableTextRuntime(model)) return \"\";",
  "Compatibilité matériel seulement",
  "LLM texte Ollama : installation, dialogue, benchmark et Arena locale.",
  "model-actionability",
  "function renderModelActions(model, options = {})",
  "Non piloté ici</span></button>",
]) {
  if (!appJs.includes(needle)) fail(`app.js missing media guard snippet: ${needle}`);
}

const noRefBranchMatch = appJs.match(/function renderModelActions\(model, options = \{\}\) \{[\s\S]*?if \(!ref\) \{([\s\S]*?)\n  \}\n  const ollamaMissing/);
if (!noRefBranchMatch) {
  fail("cannot locate renderModelActions no-ref branch");
} else {
  const noRefBranch = noRefBranchMatch[1];
  for (const forbidden of [
    "data-install-model",
    "data-run-model",
    "data-chat-model",
    "data-delete-model",
    "data-benchmark-model",
    "data-copy-command",
    "Installer",
    "Tester",
    "Dialogue",
    "Bench",
    "Copier",
  ]) {
    if (noRefBranch.includes(forbidden)) {
      fail(`non-actionable branch must not expose ${forbidden}`);
    }
  }
  if (!noRefBranch.includes("Non piloté ici") || !noRefBranch.includes("data-model-info")) {
    fail("non-actionable branch must keep only disabled state plus Fiche");
  }
  if (!noRefBranch.includes("À surveiller") || !noRefBranch.includes("isWatchlistRuntime(model)")) {
    fail("watchlist branch must show a non-pilotable watch state");
  }
}

const watchlistModels = models.filter((model) =>
  ["ollama_watchlist", "frontier_watchlist", "ollama_frontier_available"].includes(String(model.runtime_status || "").trim())
);
if (!watchlistModels.length) fail("catalog has no watchlist models to guard");
for (const model of watchlistModels) {
  if (model.pilotable_text !== false) {
    fail(`${modelLabel(model)}: watchlist/frontier model must declare pilotable_text=false`);
  }
}
const availableRuntimeModels = models.filter((model) => String(model.runtime_status || "").trim() === "ollama_available");
for (const model of availableRuntimeModels) {
  if (model.pilotable_text === false) {
    fail(`${modelLabel(model)}: ollama_available model cannot declare pilotable_text=false`);
  }
}
for (const needle of [
  "model.pilotable_text === false",
  "model.pilotable_text === true",
]) {
  if (!appJs.includes(needle)) fail(`app.js missing pilotable_text guard snippet: ${needle}`);
}

const candidateFilters = [
  "const candidates = models.filter((model) => actionableOllamaRef(model));",
  ".filter((model) => actionableOllamaRef(model))",
  "sortRecommendedModels(extractModels(compatibility).filter((model) => actionableOllamaRef(model))).slice(0, 4);",
];
for (const needle of candidateFilters) {
  if (!appJs.includes(needle)) fail(`app.js missing actionable filter: ${needle}`);
}

for (const error of errors) console.error(`error: ${error}`);
console.log(
  `media_action_guard_ok models=${models.length} actionable_text=${actionableTextModels.length} media_guarded=${mediaModels.length} catalog=${catalog.version || "unknown"}`
);

if (errors.length) process.exit(1);
