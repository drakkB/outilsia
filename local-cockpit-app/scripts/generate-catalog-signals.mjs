#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const pagesDir = join(repoRoot, "server-work", "static", "pages");
const outputPath = join(repoRoot, "server-work", "static", "data", "local-ai-content-signals.json");

const today = new Date().toISOString().slice(0, 10);

const dictionaries = {
  models: [
    { key: "qwen", label: "Qwen", aliases: ["qwen", "qwen3", "qwen 3", "qwen 3.6", "qwen3.6"] },
    { key: "hermes", label: "Hermes / Nous Hermes", aliases: ["hermes", "nous hermes", "nous-hermes", "hermes agent"] },
    { key: "llama", label: "Llama", aliases: ["llama", "llama 3", "llama 4"] },
    { key: "mistral", label: "Mistral", aliases: ["mistral", "mixtral", "mistral small"] },
    { key: "deepseek", label: "DeepSeek", aliases: ["deepseek", "deepseek r1"] },
    { key: "gemma", label: "Gemma", aliases: ["gemma", "gemma 3"] },
    { key: "phi", label: "Phi", aliases: ["phi-4", "phi 4", "phi4"] },
    { key: "glm", label: "GLM", aliases: ["glm", "glm 5", "glm-5"] },
    { key: "whisper", label: "Whisper", aliases: ["whisper", "transcription"] },
    { key: "flux", label: "Flux", aliases: ["flux schnell", "flux dev", "flux"] },
    { key: "sdxl", label: "Stable Diffusion / SDXL", aliases: ["stable diffusion", "sdxl", "sd 1.5"] },
  ],
  hardware: [
    { key: "rtx_3060", label: "RTX 3060 12 Go", aliases: ["rtx 3060", "3060 12 go", "3060 12gb"] },
    { key: "rtx_3090", label: "RTX 3090 24 Go", aliases: ["rtx 3090", "3090 24 go", "3090 24gb"] },
    { key: "rtx_4060_ti", label: "RTX 4060 Ti 16 Go", aliases: ["rtx 4060 ti", "4060 ti 16 go", "4060 ti 16gb"] },
    { key: "rtx_4070_ti_super", label: "RTX 4070 Ti Super", aliases: ["rtx 4070 ti super", "4070 ti super"] },
    { key: "rtx_4080_super", label: "RTX 4080 Super", aliases: ["rtx 4080 super", "4080 super"] },
    { key: "rtx_4090", label: "RTX 4090", aliases: ["rtx 4090", "4090"] },
    { key: "rtx_5090", label: "RTX 5090", aliases: ["rtx 5090", "5090"] },
    { key: "ram", label: "RAM / DDR5", aliases: ["ram", "ddr5", "32 go", "64 go", "128 go"] },
    { key: "ssd_nvme", label: "SSD NVMe", aliases: ["ssd", "nvme", "stockage"] },
    { key: "mac_m4", label: "Mac Mini / Apple Silicon M4", aliases: ["mac mini m4", "m4 pro", "apple silicon"] },
    { key: "raspberry_pi", label: "Raspberry Pi", aliases: ["raspberry pi", "raspberry"] },
    { key: "egpu", label: "eGPU", aliases: ["egpu", "carte graphique externe"] },
  ],
  runtimes: [
    { key: "ollama", label: "Ollama", aliases: ["ollama"] },
    { key: "cuda", label: "CUDA / NVIDIA", aliases: ["cuda", "nvidia-smi", "nvidia"] },
    { key: "llama_cpp", label: "llama.cpp", aliases: ["llama.cpp", "llama cpp", "llama-cli"] },
    { key: "obsidian", label: "Obsidian / MemoryForge", aliases: ["obsidian", "memoryforge", "memory.md"] },
    { key: "docker", label: "Docker", aliases: ["docker"] },
  ],
};

function routeForFile(filename) {
  const stem = filename.replace(/\.html$/i, "");
  if (stem === "index") return "/";
  if (stem.startsWith("blog-")) return `/blog/${stem.slice(5)}`;
  if (stem.startsWith("memoryforge-")) return `/memoryforge/${stem.slice("memoryforge-".length)}`;
  if (stem.startsWith("categorie-")) return `/categorie/${stem.slice("categorie-".length)}`;
  return `/${stem}`;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMeta(html, pattern) {
  const match = html.match(pattern);
  return decodeEntities(match?.[1] || "").replace(/\s+/g, " ").trim();
}

function textFromHtml(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function countAlias(text, alias) {
  const escaped = alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "g");
  return [...text.matchAll(regex)].length;
}

function buildSignals(kind, pages) {
  return dictionaries[kind]
    .map((entry) => {
      const matches = [];
      let count = 0;
      for (const page of pages) {
        const pageCount = entry.aliases.reduce((sum, alias) => sum + countAlias(page.text, alias), 0);
        if (pageCount > 0) {
          count += pageCount;
          matches.push({
            path: page.route,
            title: page.title,
            description: page.description,
            count: pageCount,
          });
        }
      }
      return {
        key: entry.key,
        label: entry.label,
        aliases: entry.aliases,
        count,
        pages: matches.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)).slice(0, 8),
      };
    })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

if (!existsSync(pagesDir)) {
  console.error(`pages_dir_missing ${pagesDir}`);
  process.exit(1);
}

const pages = readdirSync(pagesDir)
  .filter((file) => file.endsWith(".html"))
  .sort()
  .map((file) => {
    const html = readFileSync(join(pagesDir, file), "utf8");
    const route = routeForFile(file);
    const title = extractMeta(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || route;
    const description = extractMeta(html, /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    return {
      file,
      route,
      title: title.slice(0, 160),
      description: description.slice(0, 260),
      text: `${title} ${description} ${textFromHtml(html)}`,
    };
  });

const signals = {
  models: buildSignals("models", pages),
  hardware: buildSignals("hardware", pages),
  runtimes: buildSignals("runtimes", pages),
};

const topPages = pages
  .map((page) => {
    const modelSignals = signals.models.filter((signal) => signal.pages.some((item) => item.path === page.route)).map((signal) => signal.key);
    const hardwareSignals = signals.hardware.filter((signal) => signal.pages.some((item) => item.path === page.route)).map((signal) => signal.key);
    const runtimeSignals = signals.runtimes.filter((signal) => signal.pages.some((item) => item.path === page.route)).map((signal) => signal.key);
    return {
      path: page.route,
      title: page.title,
      description: page.description,
      signals: [...modelSignals, ...hardwareSignals, ...runtimeSignals].slice(0, 12),
      signal_count: modelSignals.length + hardwareSignals.length + runtimeSignals.length,
    };
  })
  .filter((page) => page.signal_count > 0)
  .sort((a, b) => b.signal_count - a.signal_count || a.path.localeCompare(b.path))
  .slice(0, 30);

const payload = {
  ok: true,
  version: `content-signals-${today}`,
  updated_at: today,
  source: "server-work/static/pages",
  pages_scanned: pages.length,
  pages_with_signals: topPages.length,
  signals,
  top_pages: topPages,
  app_usage: {
    purpose: "Aider OutilsIA Local Cockpit à repérer les modèles, runtimes et matériels poussés par les contenus du site.",
    update_flow: "article/page -> generate:catalog-signals -> API /api/local-ai/content-signals -> app desktop",
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(
  `catalog_signals_generated pages=${payload.pages_scanned} models=${signals.models.length} hardware=${signals.hardware.length} runtimes=${signals.runtimes.length} output=${outputPath}`
);
