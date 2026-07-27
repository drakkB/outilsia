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
    "Local MCP v0.1 + Capability Bridge · candidat",
    "127.0.0.1",
    "15 minutes",
    "8 outils + 4 ressources",
    "Codex CLI et Claude Code",
    "Lecture seule",
    "Aucun scan, téléchargement, benchmark, chat, fichier, backtest ou ordre de trading",
    "confirm:true",
    "ne sera jamais un consentement",
    "ne constitue pas une preuve terrain physique"
  ],
  download: [
    "Local Capability Bridge v1 · candidat",
    "Désactivée par défaut",
    "GET uniquement",
    "Pas d'installation, suppression, benchmark, chat, configuration ou accès fichiers",
    "Fonction candidate non incluse dans le build public actuel"
  ],
  llms: [
    "Local Capability Bridge v1 (source candidate, not in the current public build)",
    "random 256-bit Bearer token kept only in memory",
    "read-only",
    "no model installation/deletion",
    "does not count as physical field-validation evidence",
    "Local MCP v0.1 (source candidate, not in the current public build)",
    "eight read-only tools and four resources",
    "A model-provided field such as `confirm:true` is not human consent"
  ]
};

for (const [name, needles] of Object.entries(contracts)) {
  for (const needle of needles) {
    if (!files[name].includes(needle)) {
      throw new Error(`${name} missing Local Capability Bridge contract: ${needle}`);
    }
  }
}

for (const [name, text] of Object.entries(files)) {
  for (const forbidden of ["accessible depuis Internet", "contrôle à distance", "installe depuis Strategy Arena"] ) {
    if (text.includes(forbidden)) throw new Error(`${name} contains unsafe claim: ${forbidden}`);
  }
}

console.log("local_capability_bridge_seo_ok hub=ok download=ok llms=ok");
