#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(appRoot, ".artifacts", "windows-native-recipe.json");
const reportPath = join(appRoot, ".artifacts", "windows-native-recipe.md");

function usage() {
  console.log(`Usage:
  node scripts/import-windows-recipe.mjs --input <RECETTE-RESULTAT.json>

Copies the completed Windows native beta recipe into:
  ${outputPath}

Then run:
  npm run verify:beta:goal`);
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const opts = { input: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--input") {
      opts.input = resolve(argv[++i] || "");
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!opts.input) fail("Missing --input <RECETTE-RESULTAT.json>");
  return opts;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertBooleanTrue(root, path) {
  const parts = path.split(".");
  let value = root;
  for (const part of parts) value = value?.[part];
  if (value !== true) fail(`${path} must be true`);
}

export function validateRecipe(recipe) {
  if (!recipe || typeof recipe !== "object") fail("Recipe must be a JSON object");
  if (recipe.ok !== true) fail("Recipe ok must be true");
  if (recipe.platform !== "windows-x64") fail("Recipe platform must be windows-x64");
  if (!recipe.app_version) fail("Recipe app_version is missing");
  if (!recipe.build_id) fail("Recipe build_id is missing");
  if (recipe.release_freshness_ok !== true) fail("Recipe release_freshness_ok must be true");

  for (const key of [
    "native_flow.scan",
    "native_flow.ollama_install_or_ready",
    "native_flow.qwen_install_or_ready",
    "native_flow.qwen_benchmark",
    "native_flow.promptforge",
    "native_flow.dialogue",
    "native_flow.arena",
    "native_flow.readiness_report",
    "report.has_score",
    "report.has_best_model",
    "report.has_speed",
    "report.has_prompt",
    "report.has_upgrade",
    "report.has_next_actions",
    "report.copied",
    "report.saved_account",
    "report.shared",
  ]) {
    assertBooleanTrue(recipe, key);
  }

  if (!recipe.second_model?.ref) fail("second_model.ref is missing");
  if (recipe.second_model.installed !== true && recipe.second_model.benchmarked !== true) {
    fail("second_model.installed or second_model.benchmarked must be true");
  }
  if (!recipe.public_release?.name || !recipe.public_release?.sha256) {
    fail("public_release name and sha256 are required");
  }
  if (recipe.report.shared === true && !recipe.report.share_url) {
    fail("report.share_url is required when report.shared is true");
  }
}

export function recipeMarkdown(recipe) {
  const second = recipe.second_model || {};
  const report = recipe.report || {};
  const release = recipe.public_release || {};
  return [
    "# Recette Windows OutilsIA Local Cockpit",
    "",
    `- Statut: ${recipe.ok ? "OK beta diffusable" : "KO"}`,
    `- Date test: ${recipe.tested_at || "non renseignée"}`,
    `- Testeur: ${recipe.tester || "non renseigné"}`,
    `- Machine: ${recipe.machine || "non renseignée"}`,
    `- Version app: ${recipe.app_version}`,
    `- Build ID: ${recipe.build_id}`,
    `- Release fraîche: ${recipe.release_freshness_ok ? "oui" : "non"}`,
    "",
    "## Parcours natif",
    "",
    `- Scan: ${recipe.native_flow?.scan ? "OK" : "KO"}`,
    `- Ollama: ${recipe.native_flow?.ollama_install_or_ready ? "OK" : "KO"}`,
    `- qwen3:0.6b installé/prêt: ${recipe.native_flow?.qwen_install_or_ready ? "OK" : "KO"}`,
    `- Benchmark qwen3:0.6b: ${recipe.native_flow?.qwen_benchmark ? "OK" : "KO"}`,
    `- PromptForge: ${recipe.native_flow?.promptforge ? "OK" : "KO"}`,
    `- Dialogue local: ${recipe.native_flow?.dialogue ? "OK" : "KO"}`,
    `- Arena locale: ${recipe.native_flow?.arena ? "OK" : "KO"}`,
    `- Rapport machine prête: ${recipe.native_flow?.readiness_report ? "OK" : "KO"}`,
    "",
    "## Deuxième modèle recommandé",
    "",
    `- Modèle: ${second.ref}`,
    `- Installé: ${second.installed ? "oui" : "non"}`,
    `- Benchmarké: ${second.benchmarked ? "oui" : "non"}`,
    `- Vitesse: ${second.tokens_per_second ?? "non renseignée"} tok/s`,
    "",
    "## Rapport partageable",
    "",
    `- Score: ${report.has_score ? "OK" : "KO"}`,
    `- Meilleur modèle: ${report.has_best_model ? "OK" : "KO"}`,
    `- Vitesse: ${report.has_speed ? "OK" : "KO"}`,
    `- Prompt optimisé: ${report.has_prompt ? "OK" : "KO"}`,
    `- Upgrade utile: ${report.has_upgrade ? "OK" : "KO"}`,
    `- Prochaines actions: ${report.has_next_actions ? "OK" : "KO"}`,
    `- Copié: ${report.copied ? "oui" : "non"}`,
    `- Sauvé compte: ${report.saved_account ? "oui" : "non"}`,
    `- Partagé: ${report.shared ? "oui" : "non"}`,
    `- URL partage: ${report.share_url || "non renseignée"}`,
    "",
    "## Release publique",
    "",
    `- Fichier: ${release.name}`,
    `- SHA256: ${release.sha256}`,
    `- Manifeste: ${release.url}`,
    "",
    "## Notes",
    "",
    recipe.notes || "Aucune note.",
    ""
  ].join("\n");
}

export function importWindowsRecipe(input) {
  const inputPath = resolve(input || "");
  if (!existsSync(inputPath)) fail(`Input recipe not found: ${inputPath}`);
  const recipe = readJson(inputPath);
  validateRecipe(recipe);
  mkdirSync(dirname(outputPath), { recursive: true });
  copyFileSync(inputPath, outputPath);
  writeFileSync(reportPath, recipeMarkdown(recipe), "utf8");
  return { recipe, outputPath, reportPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const result = importWindowsRecipe(opts.input);
    console.log(`windows_recipe_imported ${result.outputPath}`);
    console.log(`windows_recipe_report ${result.reportPath}`);
    console.log(`build_id=${result.recipe.build_id} second_model=${result.recipe.second_model.ref}`);
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
}
