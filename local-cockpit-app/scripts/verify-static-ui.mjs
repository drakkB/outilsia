#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "src/index.html"), "utf8");
const js = readFileSync(resolve(root, "src/app.js"), "utf8");
const rust = readFileSync(resolve(root, "src-tauri/src/lib.rs"), "utf8");

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const jsIds = new Set([...js.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]));
const missingIds = [...jsIds].filter((id) => !htmlIds.has(id));

const invoked = new Set([...js.matchAll(/invoke\("([^"]+)"/g)].map((match) => match[1]));
const rustCommands = new Set(
  [...rust.matchAll(/(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(/g)].map((match) => match[1])
);
const missingCommands = [...invoked].filter((command) => !rustCommands.has(command));

const scanIsAsync = /async\s+fn\s+scan_machine\s*\(/.test(rust)
  && rust.includes("spawn_blocking(scan_machine_inner)");
if (!scanIsAsync) {
  console.error("scan_machine must remain async and delegate blocking hardware detection to spawn_blocking(scan_machine_inner)");
  process.exit(1);
}

if (missingIds.length || missingCommands.length) {
  if (missingIds.length) {
    console.error("Missing HTML ids:", missingIds.join(", "));
  }
  if (missingCommands.length) {
    console.error("Missing Rust commands:", missingCommands.join(", "));
  }
  process.exit(1);
}

const requiredFeatureText = [
  ["html decision pack panel", html, "decisionPackBox"],
  ["html copy decision pack button", html, "copyDecisionPackBtn"],
  ["html copy shopping list button", html, "copyShoppingListBtn"],
  ["html save decision pack button", html, "saveDecisionPackBtn"],
  ["js decision markdown", js, "decisionPackMarkdown"],
  ["js shopping list markdown", js, "shoppingListMarkdown"],
  ["js copy decision pack", js, "copyDecisionPack"],
  ["js copy shopping list", js, "copyShoppingList"],
  ["js save decision pack", js, "saveDecisionPackLocal"],
  ["css decision pack", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".decision-pack"],
  ["css brand mark", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".brand-mark"],
  ["css desktop grid", readFileSync(resolve(root, "src/styles.css"), "utf8"), "repeat(12"],
  ["html catalog panel", html, "catalogBox"],
  ["html copy catalog report button", html, "copyCatalogReportBtn"],
  ["js catalog snapshot", js, "catalogSnapshot"],
  ["js catalog markdown", js, "catalogReportMarkdown"],
  ["css catalog box", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".catalog-box"],
  ["html upgrade impact panel", html, "upgradeImpactBox"],
  ["html copy upgrade impact button", html, "copyUpgradeImpactBtn"],
  ["js upgrade impact", js, "buildUpgradeImpact"],
  ["js upgrade impact markdown", js, "upgradeImpactMarkdown"],
  ["css upgrade impact", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".upgrade-impact-box"],
  ["html copy history button", html, "copyHistoryBtn"],
  ["js local history markdown", js, "localHistoryMarkdown"],
  ["js copy local history", js, "copyLocalHistory"],
  ["js refresh snapshot compatibility", js, "refreshSnapshotCompatibility"],
  ["js refresh snapshot button", js, "data-refresh-snapshot"],
  ["js snapshot refresh delta", js, "snapshotRefreshDeltaMarkdown"],
  ["js render snapshot refresh delta", js, "renderSnapshotRefreshDelta"],
  ["html readiness summary button", html, "copyReadinessSummaryBtn"],
  ["html readiness account button", html, "saveReadinessAccountBtn"],
  ["html readiness share button", html, "shareReadinessBtn"],
  ["js readiness summary", js, "readinessSummaryText"],
  ["js copy readiness summary", js, "copyReadinessSummary"],
  ["js readiness account save", js, "saveReadinessToAccount"],
  ["js readiness share", js, "shareReadinessReport"],
  ["js recommended model state", js, "recommendedModelState"],
  ["js second recommended model step", js, "Deuxième modèle recommandé"],
  ["js release proof", js, "releaseProof"],
  ["js readiness build section", js, "## Build et release"],
  ["js beta report build id", js, "Build ID public"],
  ["js beta report native checklist", js, "Deuxieme modele recommande visible OK"],
  ["js benchmark quality verdict", js, "benchmarkQualityVerdict"],
  ["js benchmark quality short label", js, "Qualité courte"],
  ["js post install test now", js, "Tester maintenant"],
  ["js benchmark keep action", js, "data-keep-installed-model"],
  ["js benchmark delete action", js, "data-delete-model"],
  ["js benchmark compare action", js, "data-post-install-arena"],
  ["js objective arena protocol", js, "outilsia.arena.objective.v1"],
  ["js objective arena evaluator", js, "evaluateArenaObjective"],
  ["js objective arena evidence", js, "preuves objectives validées"],
  ["rust objective arena protocol", rust, "protocol: Option<String>"],
  ["rust objective arena output budget", rust, "Some(\"outilsia.recommendation.v2\") => Some(224)"],
  ["js recommendation protocol", js, "outilsia.recommendation.v2"],
  ["js recommendation evaluator", js, "evaluateRecommendationProof"],
  ["js recommendation decision", js, "Garder ${winner.model}"],
  ["js recommendation report", js, "recommendation_engine"],
  ["css recommendation engine", readFileSync(resolve(root, "src/styles.css"), "utf8"), ".recommendation-engine-card"],
];

const missingFeature = requiredFeatureText.filter(([, text, needle]) => !text.includes(needle));
if (missingFeature.length) {
  for (const [label, , needle] of missingFeature) {
    console.error(`Missing ${label}: ${needle}`);
  }
  process.exit(1);
}

console.log("static_ui_ok", `${htmlIds.size} ids`, `${invoked.size} tauri commands`);
