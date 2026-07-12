#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const hub = readFileSync(join(repoRoot, "server-work", "static", "pages", "scanner-ia-local.html"), "utf8");
const download = readFileSync(join(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html"), "utf8");
const llms = readFileSync(join(repoRoot, "server-work", "static", "llms.txt"), "utf8");
const catalog = JSON.parse(readFileSync(join(repoRoot, "server-work", "static", "data", "private-workload-packs.json"), "utf8"));

function fail(message) {
  console.error(`private_workload_seo_error ${message}`);
  process.exit(1);
}

function jsonLdDocuments(html, label) {
  const blocks = [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  if (!blocks.length) fail(`${label}: JSON-LD missing`);
  return blocks.map((match, index) => {
    try {
      return JSON.parse(match[1].trim());
    } catch (error) {
      fail(`${label}: invalid JSON-LD block ${index + 1}: ${error.message}`);
    }
  });
}

for (const [label, html] of [["hub", hub], ["download", download]]) {
  for (const token of [
    "Private Workload Packs v1",
    "2 à 3 modèles",
    "60 secondes maximum par modèle",
    "réponses brutes",
    "Passport 1.2.0",
    "ne compte jamais comme validation physique"
  ]) {
    if (!html.includes(token)) fail(`${label}: missing ${token}`);
  }
  if (!html.includes("Aucun téléchargement") && !html.includes("Zéro téléchargement")) {
    fail(`${label}: zero-download claim missing`);
  }
  const documents = jsonLdDocuments(html, label);
  const software = documents.find((item) => item?.["@type"] === "SoftwareApplication");
  const faq = documents.find((item) => item?.["@type"] === "FAQPage");
  if (!software || !String(software.description || "").includes("Tests privés")) {
    fail(`${label}: SoftwareApplication must mention Tests privés`);
  }
  if (!faq || !Array.isArray(faq.mainEntity)) fail(`${label}: FAQPage missing`);
  const question = faq.mainEntity.find((item) => String(item?.name || "").includes("tâche privée sans cloud"));
  if (!question) fail(`${label}: private-workload FAQ missing`);
  const visibleHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  if (!visibleHtml.includes(question.name)) fail(`${label}: private-workload FAQ not visible`);
}

for (const token of [
  "Private Workload Packs v1",
  "2 or 3 already-installed Ollama models",
  "60-second limit per model",
  "zero downloads or cloud uploads",
  "never the raw custom prompt or model outputs",
  "not a physical field-validation proof"
]) {
  if (!llms.includes(token)) fail(`llms.txt missing ${token}`);
}
if (catalog.schema !== "outilsia.private_workload_pack_catalog.v1") fail("catalog schema mismatch");
if (catalog.policy?.cloud_upload !== false || catalog.policy?.downloads_per_run !== 0) fail("catalog privacy budget mismatch");
if (catalog.policy?.persist_raw_custom_prompt !== false || catalog.policy?.persist_raw_model_output !== false) {
  fail("catalog raw-content policy mismatch");
}

console.log(`private_workload_seo_ok catalog=${catalog.version} hub=ok download=ok llms=ok`);
