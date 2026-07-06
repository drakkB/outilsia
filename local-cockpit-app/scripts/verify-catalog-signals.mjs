#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const signalsPath = join(repoRoot, "server-work", "static", "data", "local-ai-content-signals.json");
const errors = [];

function fail(message) {
  errors.push(message);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

if (!existsSync(signalsPath)) {
  console.error(`catalog_signals_missing ${signalsPath}`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(signalsPath, "utf8"));
if (data.ok !== true) fail("ok must be true");
if (!String(data.version || "").startsWith("content-signals-")) fail("version must start with content-signals-");
if (!isDate(data.updated_at)) fail("updated_at must be YYYY-MM-DD");
if (!Number.isInteger(data.pages_scanned) || data.pages_scanned < 10) fail("pages_scanned must be >= 10");
if (!data.signals || typeof data.signals !== "object") fail("signals object missing");

const models = data.signals?.models || [];
const hardware = data.signals?.hardware || [];
const runtimes = data.signals?.runtimes || [];

if (!Array.isArray(models) || models.length < 4) fail("at least 4 model signals expected");
if (!Array.isArray(hardware) || hardware.length < 4) fail("at least 4 hardware signals expected");
if (!Array.isArray(runtimes) || runtimes.length < 2) fail("at least 2 runtime signals expected");

for (const required of ["qwen", "hermes", "llama"]) {
  if (!models.some((item) => item.key === required)) fail(`missing model signal ${required}`);
}
for (const required of ["ollama"]) {
  if (!runtimes.some((item) => item.key === required)) fail(`missing runtime signal ${required}`);
}

for (const groupName of ["models", "hardware", "runtimes"]) {
  for (const [index, item] of (data.signals?.[groupName] || []).entries()) {
    if (!item.key || !item.label) fail(`${groupName}[${index}] missing key/label`);
    if (!Number.isInteger(item.count) || item.count <= 0) fail(`${groupName}[${index}] invalid count`);
    if (!Array.isArray(item.pages) || !item.pages.length) fail(`${groupName}[${index}] pages missing`);
    for (const page of item.pages || []) {
      if (!String(page.path || "").startsWith("/")) fail(`${groupName}[${index}] page path must start with /`);
      if (!page.title) fail(`${groupName}[${index}] page title missing`);
    }
  }
}

if (!Array.isArray(data.top_pages) || !data.top_pages.length) fail("top_pages missing");

for (const error of errors) console.error(`error: ${error}`);
console.log(
  `catalog_signals_ok pages=${data.pages_scanned} models=${models.length} hardware=${hardware.length} runtimes=${runtimes.length} top_pages=${data.top_pages?.length || 0}`
);
if (errors.length) process.exit(1);
