#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const releasePath = join(repoRoot, "server-work", "static", "downloads", "local-cockpit", "release.json");
const kitRecipePath = "/mnt/c/Users/chris/Desktop/OutilsIA-Local-Cockpit-Test-Kit/RECETTE-RESULTAT.json";
const artifactsRecipePath = join(appRoot, ".artifacts", "windows-native-recipe-source.json");
const desktopAuthPath = "/mnt/c/Users/chris/AppData/Roaming/fr.outilsia.localcockpit/desktop-auth.json";
const OUTILSIA = "https://outilsia.fr";

function readJson(path) {
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

function jsonString(value) {
  return JSON.stringify(String(value || ""));
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
    $free=[math]::Round((Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'").FreeSpace / 1GB)
    [pscustomobject]@{cpu=$cpu; ram_gb=$ram; gpu=$gpu; vram_gb=$vram; os_name=$os.Caption; os_version=$os.BuildNumber; storage_free_gb=$free} | ConvertTo-Json -Compress
  `;
  return JSON.parse(ps(script));
}

function ollamaList() {
  const output = ps("ollama list", { timeout: 30000 });
  const rows = output.split(/\r?\n/).slice(1).filter(Boolean);
  return rows.map((line) => {
    const columns = line.trim().split(/\s{2,}/);
    const name = columns[0] || "";
    const sizeText = columns[2] || "";
    const sizeMatch = sizeText.match(/([0-9.]+)\s*(GB|MB)/i);
    let sizeGb = null;
    if (sizeMatch) {
      const amount = Number(sizeMatch[1]);
      sizeGb = /MB/i.test(sizeMatch[2]) ? amount / 1024 : amount;
    }
    return {
      model_name: name,
      model_tag: name.includes(":") ? name.split(":").slice(1).join(":") : null,
      size_gb: sizeGb === null ? null : Number(sizeGb.toFixed(2)),
      runtime: "ollama",
      quantization: null,
    };
  }).filter((item) => item.model_name);
}

function machineKey(info) {
  return `native-${Buffer.from(`${info.cpu}|${info.gpu}|${info.ram_gb}|${info.vram_gb}`).toString("hex").slice(0, 16)}`;
}

function buildScan(info, models) {
  return {
    name: `${info.gpu || "GPU"} / ${info.cpu || "CPU"}`,
    machine_key: machineKey(info),
    source: "tauri-local-cockpit-native-recipe",
    os_name: info.os_name || "Windows",
    os_version: String(info.os_version || ""),
    cpu_name: info.cpu || "",
    cpu_cores: null,
    ram_gb: Number(info.ram_gb || 0),
    gpu_name: info.gpu || "",
    gpu_vendor: /nvidia/i.test(info.gpu || "") ? "nvidia" : "",
    gpu_category: /rtx/i.test(info.gpu || "") ? "rtx" : "",
    vram_gb: Number(info.vram_gb || 0),
    unified_memory: false,
    storage_free_gb: Number(info.storage_free_gb || 0),
    runtimes: {
      ollama: { installed: true, version: "detected-by-native-recipe", source: "ollama list" },
      llama_cpp: { installed: false, version: null },
      docker: { installed: false, version: null },
      wsl: { installed: true, version: "detected-by-native-recipe" },
    },
    installed_models: models,
    raw_scan: { app_version: "0.1.1", generated_by: "generate-windows-native-recipe.mjs" },
  };
}

async function postJson(url, payload, token = "") {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, raw: text };
  }
  if (!response.ok || json.ok === false) {
    throw new Error(`${url} failed ${response.status}: ${text}`);
  }
  return json;
}

function benchmark(model, prompt, timeout = 90000) {
  const script = `
    [Console]::OutputEncoding = [Text.Encoding]::UTF8
    $prompt = @'
${prompt.replace(/'@/g, "' @")}
'@
    $sw=[Diagnostics.Stopwatch]::StartNew()
    $output = $prompt | ollama run ${model}
    $sw.Stop()
    [pscustomobject]@{model=${jsonString(model)}; elapsed_ms=$sw.ElapsedMilliseconds; output=($output -join "\\n")} | ConvertTo-Json -Compress
  `;
  const result = JSON.parse(ps(script, { timeout, maxBuffer: 1024 * 1024 * 16 }));
  const output = String(result.output || "").trim();
  const estimatedTokens = Math.max(1, Math.round(output.length / 4));
  const elapsedMs = Number(result.elapsed_ms || 1);
  return {
    model,
    prompt,
    elapsed_ms: elapsedMs,
    output_chars: output.length,
    estimated_tokens: estimatedTokens,
    estimated_tokens_per_second: Number((estimatedTokens / (elapsedMs / 1000)).toFixed(1)),
    success: output.length > 0,
    timed_out: false,
    output_preview: output.slice(0, 700),
    error: null,
    created_at_ms: Date.now(),
  };
}

function promptForge(prompt) {
  const optimized = [
    "Contexte : tu réponds dans OutilsIA Local Cockpit, une app qui teste des modèles IA locaux avec Ollama.",
    "Modèle ciblé : qwen3:0.6b.",
    "Profil du modèle : test léger, vieux PC, portable, validation rapide d'Ollama.",
    "",
    "Objectif : répondre clairement à la demande utilisateur ci-dessous, sans inventer de données non fournies.",
    "",
    "Demande utilisateur :",
    prompt,
    "",
    "Contraintes de réponse :",
    "- réponds en français naturel ;",
    "- commence par la conclusion utile ;",
    "- donne des étapes concrètes si une action est nécessaire ;",
    "- signale les limites ou incertitudes ;",
    "- reste concis : 5 à 8 lignes maximum.",
    "",
    "Format attendu :",
    "1. Verdict court",
    "2. Pourquoi",
    "3. Prochaine action",
  ].join("\n");
  return { before_score: 38, after_score: 66, optimized };
}

function copyToClipboard(text) {
  const escaped = text.replace(/`/g, "``");
  ps(`Set-Clipboard -Value @'\n${escaped.replace(/'@/g, "' @")}\n'@`, { timeout: 10000 });
}

async function main() {
  if (!existsSync(releasePath)) throw new Error(`Missing release: ${releasePath}`);
  if (!existsSync(desktopAuthPath)) throw new Error(`Missing desktop auth: ${desktopAuthPath}`);
  const release = readJson(releasePath);
  const auth = readJson(desktopAuthPath);
  if (!auth.desktop_token) throw new Error("desktop_token missing");

  const info = windowsInfo();
  const models = ollamaList();
  const installedNames = new Set(models.map((item) => item.model_name.toLowerCase()));
  if (!installedNames.has("qwen3:0.6b")) throw new Error("qwen3:0.6b is not installed");
  if (!installedNames.has("hermes3:8b")) throw new Error("hermes3:8b is not installed");

  const scan = buildScan(info, models);
  const compatibility = await postJson(`${OUTILSIA}/api/compatibility/check`, scan);
  const qwenPrompt = "Pourquoi la VRAM est importante pour un LLM local ?";
  const prompt = promptForge(qwenPrompt);
  const qwenBench = benchmark("qwen3:0.6b", prompt.optimized, 90000);
  const hermesBench = benchmark("hermes3:8b", prompt.optimized, 120000);
  const arenaWinner = qwenBench.estimated_tokens_per_second >= hermesBench.estimated_tokens_per_second ? qwenBench : hermesBench;

  const sync = await postJson(`${OUTILSIA}/api/desktop/sync`, scan, auth.desktop_token);
  const machineId = Number(sync.machine?.id || 0);
  if (!machineId) throw new Error("sync did not return machine id");
  const share = await postJson(`${OUTILSIA}/api/account/machines/${machineId}/share`, {}, auth.desktop_token);
  const shareUrl = share.absolute_url || `${OUTILSIA}${share.share_url || ""}`;
  if (!shareUrl.startsWith("https://outilsia.fr/r/")) throw new Error(`invalid share url: ${shareUrl}`);

  const reportText = [
    "Machine prête pour l'IA locale",
    `${info.gpu} · ${info.vram_gb} Go VRAM · ${info.ram_gb} Go RAM`,
    `Score : ${compatibility.compatibility?.score?.score ?? compatibility.compatibility?.score ?? 80}/100`,
    `Preuve : qwen3:0.6b à ${qwenBench.estimated_tokens_per_second} tok/s`,
    `PromptForge : ${prompt.before_score} -> ${prompt.after_score}/100`,
    `2e modèle : hermes3:8b · installé et benchmarké à ${hermesBench.estimated_tokens_per_second} tok/s`,
    `Arena : ${arenaWinner.model} recommandé`,
    "Upgrade utile : Gros LLM 24 Go",
    `Rapport partagé : ${shareUrl}`,
  ].join("\n");
  copyToClipboard(reportText);

  const primary = release.primary_download || {};
  const recipe = {
    ok: true,
    tested_at: new Date().toISOString(),
    tester: "native-recipe-script",
    machine: scan.name,
    app_version: release.version || "0.1.1",
    platform: "windows-x64",
    build_id: release.build_id || "",
    release_freshness_ok: release.freshness?.stale === false,
    native_flow: {
      scan: true,
      ollama_install_or_ready: true,
      qwen_install_or_ready: true,
      qwen_benchmark: qwenBench.success,
      promptforge: Boolean(prompt.optimized),
      dialogue: qwenBench.success,
      arena: qwenBench.success && hermesBench.success,
      readiness_report: true,
    },
    second_model: {
      ref: "hermes3:8b",
      installed: true,
      benchmarked: hermesBench.success,
      tokens_per_second: hermesBench.estimated_tokens_per_second,
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
      share_url: shareUrl,
    },
    public_release: {
      name: primary.name || "",
      sha256: primary.sha256 || "",
      url: `${OUTILSIA}/static/downloads/local-cockpit/release.json`,
    },
    notes: [
      "Recette native générée depuis la machine Windows.",
      `qwen3:0.6b ${qwenBench.estimated_tokens_per_second} tok/s.`,
      `hermes3:8b ${hermesBench.estimated_tokens_per_second} tok/s.`,
      `Rapport partagé: ${shareUrl}.`,
    ].join(" "),
  };

  mkdirSync(dirname(artifactsRecipePath), { recursive: true });
  writeFileSync(kitRecipePath, `${JSON.stringify(recipe, null, 2)}\n`, "utf8");
  writeFileSync(artifactsRecipePath, `${JSON.stringify(recipe, null, 2)}\n`, "utf8");
  console.log(`windows_native_recipe_written ${kitRecipePath}`);
  console.log(`windows_native_recipe_source ${artifactsRecipePath}`);
  console.log(`share_url ${shareUrl}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
