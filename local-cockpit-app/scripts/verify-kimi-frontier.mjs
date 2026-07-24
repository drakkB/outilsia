#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(appRoot, "..");
const read = (...parts) => readFileSync(resolve(...parts), "utf8");

const catalog = JSON.parse(read(repoRoot, "server-work", "static", "data", "local-ai-models.json"));
const article = read(repoRoot, "server-work", "static", "pages", "blog-kimi-k3-k2-7-code-local-2026.html");
const blog = read(repoRoot, "server-work", "static", "pages", "blog.html");
const hub = read(repoRoot, "server-work", "static", "pages", "scanner-ia-local.html");
const download = read(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html");
const llms = read(repoRoot, "server-work", "static", "llms.txt");
const router = read(appRoot, "src-tauri", "src", "capability_router.rs");
const policy = read(appRoot, "src-tauri", "src", "agent_adapter_policy.rs");

function fail(message) {
  throw new Error(message);
}

const models = (catalog.categories || []).flatMap((category) => category.models || []);
const kimi = models.find((model) => model.name === "Kimi K2.7 Code");
if (!kimi) fail("Kimi K2.7 Code missing from the model catalog");
if (
  kimi.params !== "1T-A32B MoE"
  || kimi.runtime_status !== "frontier_watchlist"
  || kimi.actionable_text !== false
  || kimi.pilotable_text !== false
  || String(kimi.ollama || "") !== ""
  || Number(kimi.vram_q4) !== 595
  || Number(kimi.vram_q8) < 1000
  || Number(kimi.vram_fp16) < 1900
  || kimi.source_url !== "https://huggingface.co/moonshotai/Kimi-K2.7-Code"
) {
  fail(`Kimi catalog entry is actionable or understates frontier memory: ${JSON.stringify(kimi)}`);
}

for (const marker of [
  "<title>Kimi K3 et K2.7 Code en local",
  "595 177 988 208 octets",
  "64 fichiers",
  "8× NVIDIA H200",
  "8× NVIDIA L20 + 2× Intel 6454S",
  "1,97 To de RAM",
  "poids complets sont annoncés pour le 27 juillet",
  "Le programme est local, l'inférence Kimi est distante",
  "Ils ne permettent pas de charger K2.7 Code en entier",
  "tag=boiral21-21",
  "kimi --version",
  "kimi doctor",
  "source postérieur au build public actuel",
  "https://huggingface.co/moonshotai/Kimi-K2.7-Code",
  "https://github.com/MoonshotAI/kimi-code",
]) {
  if (!article.includes(marker)) fail(`Kimi article missing truth marker: ${marker}`);
}
if (/ollama\s+run\s+kimi/i.test(article)) {
  fail("Kimi article must not publish an unverified Ollama command");
}

const jsonLdBlocks = [...article.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1].trim());
if (jsonLdBlocks.length < 4) fail("Kimi article requires article, author, breadcrumb and FAQ JSON-LD");
for (const block of jsonLdBlocks) JSON.parse(block);

for (const [label, source] of [
  ["blog", blog],
  ["scanner hub", hub],
  ["download page", download],
  ["llms.txt", llms],
]) {
  if (!source.includes("/blog/kimi-k3-k2-7-code-local-2026")) {
    fail(`${label} does not link the canonical Kimi guide`);
  }
}
for (const marker of [
  'id: "kimi-code"',
  'provider: "moonshot-ai"',
  'executables: &["kimi"]',
  '"hermes-agent" | "kimi"',
]) {
  if (!router.includes(marker)) fail(`Capability Router missing Kimi detect-only marker: ${marker}`);
}
for (const marker of [
  'const KIMI_ADAPTER_ID: &str = "kimi-code"',
  'KIMI_ADAPTER_ID,',
  '"moonshot-ai"',
  '"subscription_or_api_cost_unverified"',
]) {
  if (!policy.includes(marker)) fail(`Agent Adapter Policy missing Kimi guard: ${marker}`);
}

console.log(
  "kimi_frontier_contract_ok",
  "catalog=watchlist",
  "ollama_action=false",
  "int4_weights_gb=595",
  "cli=detect_only",
  "article=linked",
  `jsonld=${jsonLdBlocks.length}`,
);
