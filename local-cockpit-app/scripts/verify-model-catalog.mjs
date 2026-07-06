#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const catalogPath = join(repoRoot, "server-work", "static", "data", "local-ai-models.json");
const errors = [];
const warnings = [];
const stats = {
  categories: 0,
  models: 0,
  withOllama: 0,
  withoutOllama: 0,
  actionableText: 0,
  recent: 0,
};

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function statusFor(model, vramGb, ramGb = 64, unified = false) {
  const need = number(model.vram_q4);
  const memory = Math.max(vramGb, unified ? ramGb : vramGb);
  if (!Number.isFinite(need)) return "non";
  if (memory <= 0) {
    if (ramGb > 0 && need <= ramGb * 0.5) return "lent";
    return "non";
  }
  if (need <= memory * 0.9) return "rapide";
  if (need <= memory) return "ok";
  if (need <= memory + Math.max(0, ramGb) * 0.5) return "lent";
  return "non";
}

function hasValidOllamaRefFormat(ref) {
  const clean = String(ref || "").trim().replace(/^ollama\s+run\s+/i, "");
  if (!clean) return false;
  if (clean === "whisper-large-v3") return false;
  return /^[a-z0-9][a-z0-9._/-]*(?::[a-z0-9][a-z0-9._-]*)?$/.test(clean);
}

if (!existsSync(catalogPath)) {
  console.error(`catalog_missing ${catalogPath}`);
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
if (!catalog.version) fail("catalog.version missing");
if (!isDate(catalog.updated_at)) fail("catalog.updated_at must be YYYY-MM-DD");
if (!Array.isArray(catalog.categories) || !catalog.categories.length) fail("catalog.categories must be non-empty");

const seen = new Map();
const allModels = [];

for (const [catIndex, category] of (catalog.categories || []).entries()) {
  stats.categories += 1;
  const catName = String(category.name || "").trim();
  if (!catName) fail(`category[${catIndex}].name missing`);
  if (!Array.isArray(category.models) || !category.models.length) fail(`${catName || `category[${catIndex}]`} has no models`);
  for (const [modelIndex, model] of (category.models || []).entries()) {
    stats.models += 1;
    allModels.push({ category: catName, model });
    const label = `${catName}#${modelIndex}`;
    const name = String(model.name || "").trim();
    const params = String(model.params || "").trim();
    if (!name) fail(`${label}: name missing`);
    if (!params) fail(`${label}: params missing`);
    const key = `${name.toLowerCase()}|${params.toLowerCase()}`;
    if (seen.has(key)) warn(`duplicate model identity: ${name} ${params} in ${catName} and ${seen.get(key)}`);
    else seen.set(key, catName);

    const q4 = number(model.vram_q4);
    const q8 = number(model.vram_q8);
    const fp16 = number(model.vram_fp16);
    if (!Number.isFinite(q4) || q4 <= 0) fail(`${name} ${params}: invalid vram_q4`);
    if (!Number.isFinite(q8) || q8 <= 0) fail(`${name} ${params}: invalid vram_q8`);
    if (!Number.isFinite(fp16) || fp16 <= 0) fail(`${name} ${params}: invalid vram_fp16`);
    if (Number.isFinite(q4) && Number.isFinite(q8) && q8 < q4) fail(`${name} ${params}: vram_q8 < vram_q4`);
    if (Number.isFinite(q8) && Number.isFinite(fp16) && fp16 < q8) fail(`${name} ${params}: vram_fp16 < vram_q8`);
    if (!isDate(model.date_added)) fail(`${name} ${params}: date_added must be YYYY-MM-DD`);

    const ollama = String(model.ollama || "").trim();
    const kind = String(model.kind || "text").trim().toLowerCase();
    const runtimeStatus = String(model.runtime_status || "").trim();
    if (!["text", "image", "video", "audio"].includes(kind)) fail(`${name} ${params}: invalid kind ${kind}`);
    if (runtimeStatus && !["ollama_available", "ollama_watchlist", "frontier_watchlist", "ollama_frontier_available"].includes(runtimeStatus)) {
      fail(`${name} ${params}: invalid runtime_status ${runtimeStatus}`);
    }
    if (Object.hasOwn(model, "pilotable_text") && typeof model.pilotable_text !== "boolean") {
      fail(`${name} ${params}: pilotable_text must be boolean when present`);
    }
    if (["ollama_watchlist", "frontier_watchlist", "ollama_frontier_available"].includes(runtimeStatus) && model.pilotable_text !== false) {
      fail(`${name} ${params}: watchlist/frontier model must declare pilotable_text=false`);
    }
    if (runtimeStatus === "ollama_available" && model.pilotable_text === false) {
      fail(`${name} ${params}: ollama_available model cannot declare pilotable_text=false`);
    }
    if (String(model.date_added || "") >= "2026-07-01" && !/^https:\/\/.+/.test(String(model.source_url || ""))) {
      fail(`${name} ${params}: recent model requires https source_url`);
    }
    if (typeof model.actionable_text !== "boolean") fail(`${name} ${params}: actionable_text must be boolean`);
    if (model.actionable_text) {
      stats.actionableText += 1;
      if (kind !== "text") fail(`${name} ${params}: actionable_text=true requires kind=text`);
      if (!ollama) fail(`${name} ${params}: actionable_text=true requires ollama command`);
      if (!hasValidOllamaRefFormat(ollama)) fail(`${name} ${params}: invalid actionable ollama ref ${ollama}`);
    }
    if (kind !== "text" && model.actionable_text) fail(`${name} ${params}: media model cannot be actionable_text`);
    if (kind !== "text" && ollama) warn(`${name} ${params}: media model has ollama command but is not chat-actionable`);
    if (kind === "text" && ollama && model.actionable_text !== true) {
      fail(`${name} ${params}: text model with ollama must explicitly set actionable_text=true`);
    }
    if (ollama) stats.withOllama += 1;
    else stats.withoutOllama += 1;
    if (String(model.date_added || "") >= "2026-06-01") {
      stats.recent += 1;
      if (!ollama && !["Image", "Video", "Vidéo", "Audio"].includes(params)) {
        warn(`${name} ${params}: recent model has no Ollama command`);
      }
    }
  }
}

if (stats.models < 25) warn(`catalog has only ${stats.models} models`);
if (stats.withOllama < 12) warn(`low Ollama command coverage: ${stats.withOllama}/${stats.models}`);

const tiers = [
  { label: "cpu_8gb", vram: 0, ram: 8 },
  { label: "rtx_3060_12gb", vram: 12, ram: 32 },
  { label: "rtx_4070ti_16gb", vram: 16, ram: 64 },
  { label: "rtx_3090_24gb", vram: 24, ram: 64 },
  { label: "workstation_48gb", vram: 48, ram: 128 },
];

const tierSummary = tiers.map((tier) => {
  const compatible = allModels.filter(({ model }) => statusFor(model, tier.vram, tier.ram) !== "non");
  return { ...tier, compatible: compatible.length };
});

for (const tier of tierSummary) {
  if (tier.label === "cpu_8gb" && tier.compatible < 2) {
    fail(`${tier.label}: CPU/RAM fallback should keep at least tiny local models visible`);
  }
  if (tier.vram >= 12 && tier.compatible < 8) {
    warn(`${tier.label}: only ${tier.compatible} compatible models`);
  }
}

for (const error of errors) console.error(`error: ${error}`);
for (const warning of warnings) console.warn(`warn: ${warning}`);
console.log(
  `model_catalog_ok categories=${stats.categories} models=${stats.models} ollama=${stats.withOllama}/${stats.models} actionable_text=${stats.actionableText}/${stats.models} recent=${stats.recent} warnings=${warnings.length}`
);
for (const tier of tierSummary) {
  console.log(`tier ${tier.label} compatible=${tier.compatible}`);
}

if (errors.length) process.exit(1);
