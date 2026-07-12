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
    "Local Capability Bridge v1 · candidat",
    "127.0.0.1",
    "15 minutes",
    "Lecture seule",
    "Aucun prompt, résultat brut, fichier personnel, jeton de compte, backtest ou ordre de trading",
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
    "does not count as physical field-validation evidence"
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
