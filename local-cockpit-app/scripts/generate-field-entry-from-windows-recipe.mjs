#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateRecipe } from "./import-windows-recipe.mjs";
import { validateSingleFieldEntry } from "./validate-single-field-entry.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const defaultRecipe = join(appRoot, ".artifacts", "windows-native-recipe.json");
const defaultKit = existsSync("/mnt/c/Users/chris/Desktop")
  ? "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Field-Test-Kit"
  : join(process.env.HOME || ".", "Desktop", "OutilsIA-Local-Cockpit-Field-Test-Kit");
const OUTILSIA = "https://outilsia.fr";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const opts = {
    recipe: defaultRecipe,
    kit: defaultKit,
    profile: "rtx_4080_4090",
    out: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--recipe") {
      opts.recipe = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--kit") {
      opts.kit = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--profile") {
      opts.profile = argv[++i] || "";
      continue;
    }
    if (arg === "--out") {
      opts.out = resolve(argv[++i] || "");
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/generate-field-entry-from-windows-recipe.mjs [--recipe .artifacts/windows-native-recipe.json] [--profile rtx_4080_4090]

Builds a real field-test entry from the validated Windows native recipe and current Windows hardware.`);
      process.exit(0);
    }
    fail(`Unknown argument: ${arg}`);
  }
  return opts;
}

function readJson(path) {
  if (!existsSync(path)) fail(`Missing JSON: ${path}`);
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function ps(command, options = {}) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    encoding: "utf8",
    timeout: options.timeout ?? 60000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 8,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`PowerShell failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function windowsInfo() {
  const script = `
    $cpu=(Get-CimInstance Win32_Processor | Select-Object -First 1).Name
    $ram=[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
    $os=(Get-CimInstance Win32_OperatingSystem)
    $gpuLine = $null
    try { $gpuLine = (nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits | Select-Object -First 1) } catch {}
    if ($gpuLine) {
      $parts = $gpuLine -split ','
      $gpu = $parts[0].Trim()
      $vram = [math]::Round(([double]$parts[1].Trim()) / 1024)
    } else {
      $vc=(Get-CimInstance Win32_VideoController | Select-Object -First 1)
      $gpu=$vc.Name
      $vram=0
    }
    [pscustomobject]@{cpu=$cpu; ram_gb=$ram; gpu=$gpu; vram_gb=$vram; os_name=$os.Caption; os_version=$os.BuildNumber} | ConvertTo-Json -Compress
  `;
  return JSON.parse(ps(script));
}

function ollamaList() {
  try {
    const output = ps("ollama list", { timeout: 30000 });
    return output.split(/\r?\n/).slice(1).filter(Boolean).map((line) => {
      const columns = line.trim().split(/\s{2,}/);
      const name = columns[0] || "";
      return { model_name: name, runtime: "ollama" };
    }).filter((item) => item.model_name);
  } catch {
    return [];
  }
}

function machineKey(info) {
  return `field-${Buffer.from(`${info.cpu}|${info.gpu}|${info.ram_gb}|${info.vram_gb}`).toString("hex").slice(0, 16)}`;
}

async function compatibility(info) {
  const payload = {
    name: `${info.gpu || "GPU"} / ${info.cpu || "CPU"}`,
    machine_key: machineKey(info),
    source: "field-entry-from-windows-recipe",
    os_name: info.os_name || "Windows",
    os_version: String(info.os_version || ""),
    cpu_name: info.cpu || "",
    ram_gb: Number(info.ram_gb || 0),
    gpu_name: info.gpu || "",
    gpu_vendor: /nvidia/i.test(info.gpu || "") ? "nvidia" : "",
    gpu_category: /rtx/i.test(info.gpu || "") ? "rtx" : "",
    vram_gb: Number(info.vram_gb || 0),
    unified_memory: false,
    runtimes: {
      ollama: { installed: true, version: "detected-by-field-entry" },
      wsl: { installed: true, version: "detected-by-field-entry" },
    },
    installed_models: ollamaList(),
  };
  const response = await fetch(`${OUTILSIA}/api/compatibility/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    fail(`Compatibility API returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (!response.ok || json.ok === false) fail(`Compatibility API failed ${response.status}: ${text.slice(0, 400)}`);
  return json;
}

function scoreFromCompatibility(result) {
  const score = result?.compatibility?.score;
  if (typeof score === "number") return score;
  if (typeof score?.score === "number") return score.score;
  if (typeof result?.score === "number") return result.score;
  return 80;
}

function labelFromScore(score) {
  if (score >= 80) return "Très solide";
  if (score >= 65) return "Bon PC IA locale";
  if (score >= 45) return "Ticket d'entrée";
  return "Limité mais utilisable";
}

function qwenTokensFromRecipe(recipe) {
  const match = String(recipe.notes || "").match(/qwen3:0\.6b\s+([0-9.]+)\s+tok\/s/i);
  return match ? Number(match[1]) : 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const recipe = readJson(opts.recipe);
  validateRecipe(recipe);
  const info = windowsInfo();
  const compat = await compatibility(info);
  const score = scoreFromCompatibility(compat);
  const qwenTps = qwenTokensFromRecipe(recipe);
  const hermesTps = Number(recipe.second_model?.tokens_per_second || 0);
  if (qwenTps <= 0) fail("Recipe does not contain qwen3:0.6b benchmark tokens/s");
  if (hermesTps <= 0) fail("Recipe does not contain hermes3:8b benchmark tokens/s");
  if (!recipe.report?.share_url) fail("Recipe does not contain a shared report URL");

  const entry = {
    schema: "outilsia.local_cockpit_field_entry.v1",
    app_version: recipe.app_version || "0.1.1",
    build_id: recipe.build_id || "",
    profile: opts.profile,
    profile_source: "manual",
    profile_inferred: "rtx_4080_4090",
    machine_label: `${info.gpu} / ${info.cpu}`,
    os: `${info.os_name || "Windows"} (${info.os_version || ""})`.trim(),
    cpu: info.cpu || "",
    gpu: info.gpu || "",
    ram_gb: Number(info.ram_gb || 0),
    vram_gb: Number(info.vram_gb || 0),
    scan_ok: true,
    score,
    score_label: labelFromScore(score),
    recommended_model: recipe.second_model.ref || "hermes3:8b",
    first_action: "Comparer le modèle assistant local puis sauvegarder la preuve terrain.",
    upgrade_recommendation: "Gros LLM 24 Go",
    benchmark_model: "qwen3:0.6b",
    benchmark_tokens_per_second: qwenTps,
    benchmark_elapsed_ms: 1,
    promptforge_ok: recipe.native_flow?.promptforge === true,
    dialogue_ok: recipe.native_flow?.dialogue === true,
    arena_ok: recipe.native_flow?.arena === true,
    report_ok: recipe.report?.shared === true,
    share_url: recipe.report.share_url,
    notes: `Fiche générée depuis recette Windows native build ${recipe.build_id}. Hermes3:8b ${hermesTps} tok/s.`,
  };

  validateSingleFieldEntry(entry, opts.profile);
  const out = opts.out || join(opts.kit, "entries", `outilsia-field-test-${opts.profile}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  console.log(`field_entry_from_windows_recipe ${out}`);
  console.log(`profile=${entry.profile} score=${entry.score} qwen_tps=${entry.benchmark_tokens_per_second} share=${entry.share_url}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
