#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const files = {
  hub: readFileSync(resolve(root, "server-work/static/pages/scanner-ia-local.html"), "utf8"),
  download: readFileSync(resolve(root, "server-work/static/pages/telecharger-scanner-ia-local.html"), "utf8"),
  llms: readFileSync(resolve(root, "server-work/static/llms.txt"), "utf8")
};

const contracts = {
  hub: [
    "un préflight séparé vérifie d'abord qu'une page Chromium minimale démarre réellement",
    "sans réseau",
    "propose au maximum une commande Playwright à copier",
    "ne l'exécute jamais",
    "sources postérieures au build public actuel"
  ],
  download: [
    "un préflight séparé vérifie d'abord Chromium dans Linux ou WSL",
    "propose seulement une commande Playwright à copier",
    "elle ne télécharge ni n'élève rien",
    "absente du téléchargement disponible aujourd'hui"
  ],
  llms: [
    "ForgeBench Chromium Runtime Preflight v1 (source candidate, not in the current public build)",
    "minimal headless page inside the Linux or WSL network namespace",
    "OutilsIA never executes the command",
    "Ollama and Codex candidates remain blocked until the browser canary passes"
  ]
};

for (const [name, needles] of Object.entries(contracts)) {
  for (const needle of needles) {
    if (!files[name].includes(needle)) {
      throw new Error(`${name} missing ForgeBench Chromium contract: ${needle}`);
    }
  }
}

for (const [name, content] of Object.entries(files)) {
  for (const forbidden of [
    "Chromium installé automatiquement par OutilsIA",
    "Chromium garanti",
    "worker Internet autorisé",
    "ForgeBench Chromium Runtime Preflight v1 · build public"
  ]) {
    if (content.includes(forbidden)) {
      throw new Error(`${name} contains unsafe Chromium claim: ${forbidden}`);
    }
  }
}

console.log("forgebench_runtime_seo_ok hub=source-candidate download=source-candidate llms=bounded");
