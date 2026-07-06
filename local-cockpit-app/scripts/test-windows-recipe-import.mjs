#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importWindowsRecipe, validateRecipe } from "./import-windows-recipe.mjs";

function baseRecipe() {
  return {
    ok: true,
    tested_at: "2026-07-03T10:00:00.000Z",
    tester: "test",
    machine: "windows test",
    app_version: "0.1.1",
    platform: "windows-x64",
    build_id: "20260703100000",
    release_freshness_ok: true,
    native_flow: {
      scan: true,
      ollama_install_or_ready: true,
      qwen_install_or_ready: true,
      qwen_benchmark: true,
      promptforge: true,
      dialogue: true,
      arena: true,
      readiness_report: true,
    },
    second_model: {
      ref: "qwen3:14b",
      installed: true,
      benchmarked: false,
      tokens_per_second: null,
    },
    report: {
      has_score: true,
      has_best_model: true,
      has_speed: true,
      has_prompt: true,
      has_upgrade: true,
      has_next_actions: true,
      copied: true,
      saved_account: true,
      shared: true,
      share_url: "https://outilsia.fr/r/test",
    },
    public_release: {
      name: "OutilsIA-Local-Cockpit-0.1.1-beta-test-windows-x64.exe",
      sha256: "a".repeat(64),
      url: "https://outilsia.fr/static/downloads/local-cockpit/release.json",
    },
    notes: "",
  };
}

function writeRecipe(dir, recipe, name = "recipe.json") {
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(recipe, null, 2)}\n`);
  return path;
}

function assertThrows(fn, pattern, label) {
  try {
    fn();
  } catch (error) {
    const text = error.message || String(error);
    if (!text.includes(pattern)) {
      throw new Error(`${label} should mention ${pattern}, got: ${text}`);
    }
    return;
  }
  throw new Error(`${label} should fail`);
}

const dir = mkdtempSync(join(tmpdir(), "outilsia-recipe-import-"));
const outputPath = ".artifacts/windows-native-recipe.json";
const reportPath = ".artifacts/windows-native-recipe.md";
const hadOutput = existsSync(outputPath);
const previousOutput = hadOutput ? readFileSync(outputPath, "utf8") : "";
const hadReport = existsSync(reportPath);
const previousReport = hadReport ? readFileSync(reportPath, "utf8") : "";
try {
  const valid = writeRecipe(dir, baseRecipe(), "valid.json");
  importWindowsRecipe(valid);

  const copied = JSON.parse(readFileSync(".artifacts/windows-native-recipe.json", "utf8"));
  if (copied.build_id !== "20260703100000" || copied.second_model.ref !== "qwen3:14b") {
    throw new Error("Imported recipe content mismatch");
  }
  const report = readFileSync(reportPath, "utf8");
  for (const expected of ["Recette Windows OutilsIA Local Cockpit", "OK beta diffusable", "qwen3:14b", "https://outilsia.fr/r/test"]) {
    if (!report.includes(expected)) throw new Error(`Imported Markdown report missing ${expected}`);
  }

  const missingShare = baseRecipe();
  missingShare.report.share_url = "";
  assertThrows(() => validateRecipe(missingShare), "report.share_url is required", "missing share_url");

  const missingSecond = baseRecipe();
  missingSecond.second_model.ref = "";
  assertThrows(() => validateRecipe(missingSecond), "second_model.ref is missing", "missing second model");

  const missingFlow = baseRecipe();
  missingFlow.native_flow.arena = false;
  assertThrows(() => validateRecipe(missingFlow), "native_flow.arena must be true", "missing arena");

  const notApproved = baseRecipe();
  notApproved.ok = false;
  assertThrows(() => validateRecipe(notApproved), "Recipe ok must be true", "recipe not approved");

  console.log("windows_recipe_import_test_ok");
} finally {
  if (hadOutput) writeFileSync(outputPath, previousOutput);
  else if (existsSync(outputPath)) unlinkSync(outputPath);
  if (hadReport) writeFileSync(reportPath, previousReport);
  else if (existsSync(reportPath)) unlinkSync(reportPath);
  rmSync(dir, { recursive: true, force: true });
}
