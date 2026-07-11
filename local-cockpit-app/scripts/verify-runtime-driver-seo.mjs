#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const hub = readFileSync(join(repoRoot, "server-work", "static", "pages", "scanner-ia-local.html"), "utf8");
const download = readFileSync(join(repoRoot, "server-work", "static", "pages", "telecharger-scanner-ia-local.html"), "utf8");
const llms = readFileSync(join(repoRoot, "server-work", "static", "llms.txt"), "utf8");
const matrix = JSON.parse(readFileSync(join(repoRoot, "server-work", "static", "data", "runtime-driver-matrix.json"), "utf8"));

function fail(message) {
  console.error(`runtime_driver_seo_error ${message}`);
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
    "Runtime &amp; Driver Intelligence v1",
    "CUDA toolkit 12.x maximum",
    "Strix Halo",
    "DirectML n'est pas présenté comme backend Ollama",
    "installé silencieusement"
  ]) {
    if (!html.includes(token)) fail(`${label}: missing ${token}`);
  }
  const documents = jsonLdDocuments(html, label);
  const software = documents.find((item) => item?.["@type"] === "SoftwareApplication");
  const faq = documents.find((item) => item?.["@type"] === "FAQPage");
  if (!software || !String(software.description || "").includes("Runtime & Driver Intelligence")) {
    fail(`${label}: SoftwareApplication must mention Runtime & Driver Intelligence`);
  }
  if (!faq || !Array.isArray(faq.mainEntity)) fail(`${label}: FAQPage missing`);
  const visibleHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  for (const question of faq.mainEntity) {
    if (!visibleHtml.includes(String(question?.name || ""))) fail(`${label}: FAQ question not visible: ${question?.name || "?"}`);
  }
}

for (const token of [
  "Runtime & Driver Intelligence v1",
  "CUDA toolkit 12.x maximum",
  "Strix Halo",
  "DirectML is not presented as an Ollama backend",
  "installs no graphics driver automatically"
]) {
  if (!llms.includes(token)) fail(`llms.txt missing ${token}`);
}
if (matrix.schema !== "outilsia.runtime_driver_matrix.v1") fail("matrix schema mismatch");
if (matrix.policy?.driver_installation?.automatic_install_supported !== false) fail("matrix must disable automatic driver install");

console.log(`runtime_driver_seo_ok matrix=${matrix.version} hub=ok download=ok llms=ok`);
