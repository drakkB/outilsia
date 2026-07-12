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
    "Install Safety Preflight v1 · candidat",
    "avant le premier octet",
    "Windows, WSL ou Linux",
    "Passport 1.3.0",
    "ne compte pas comme preuve terrain physique"
  ],
  download: [
    "Install Safety Preflight v1 · candidat",
    "volume Ollama",
    "insuffisance mesurée bloque le pull avant le premier octet",
    "Aucun chemin exporté",
    "Fonction candidate, absente du build public actuel"
  ],
  llms: [
    "Install Safety Preflight v1 (source candidate, not in the current public build)",
    "actual default or custom model-store volume",
    "blocks a measured shortage before downloading any model bytes",
    "never the personal model-store path",
    "not physical field-validation evidence"
  ]
};

for (const [name, needles] of Object.entries(contracts)) {
  for (const needle of needles) {
    if (!files[name].includes(needle)) {
      throw new Error(name + " missing Install Safety Preflight contract: " + needle);
    }
  }
}

for (const [name, content] of Object.entries(files)) {
  for (const forbidden of [
    "espace garanti",
    "vitesse garantie",
    "offload GPU garanti",
    "chemin du dossier exporté"
  ]) {
    if (content.includes(forbidden)) {
      throw new Error(name + " contains unsafe preflight claim: " + forbidden);
    }
  }
}

console.log("install_safety_preflight_seo_ok hub=ok download=ok llms=ok");
