#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const catalogPath = join(repoRoot, "server-work", "static", "data", "local-ai-upgrades.json");
const amazonTag = process.env.OUTILSIA_AMAZON_TAG || "boiral21-21";
const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function checkRule(rule, id) {
  if (!rule || typeof rule !== "object") {
    fail(`${id}: applies_when must be an object`);
    return;
  }
  const numericKeys = ["vram_lt", "vram_gte", "ram_lt", "ram_gte", "storage_free_lt"];
  for (const key of numericKeys) {
    if (key in rule && !Number.isFinite(number(rule[key]))) fail(`${id}: invalid applies_when.${key}`);
  }
  for (const key of ["gpu_not_contains", "gpu_contains"]) {
    if (key in rule && !Array.isArray(rule[key])) fail(`${id}: applies_when.${key} must be an array`);
  }
}

function checkEffects(effects, id) {
  if (!effects || typeof effects !== "object") {
    fail(`${id}: effects must be an object`);
    return;
  }
  const allowed = new Set(["vram_gb", "ram_gb", "storage_free_gb"]);
  for (const [key, value] of Object.entries(effects)) {
    if (!allowed.has(key)) fail(`${id}: unknown effect ${key}`);
    if (!Number.isFinite(number(value)) || number(value) <= 0) fail(`${id}: invalid effect ${key}`);
  }
}

function checkDigitalTwinContract(item, id) {
  const cost = item.cost_eur;
  if (!cost || typeof cost !== "object") {
    fail(`${id}: cost_eur missing`);
  } else {
    const min = number(cost.min);
    const max = number(cost.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) fail(`${id}: invalid cost_eur range`);
    if (!String(cost.basis || "").trim()) fail(`${id}: cost_eur.basis missing`);
  }
  const priceSource = item.price_source;
  if (!priceSource || typeof priceSource !== "object") {
    fail(`${id}: price_source missing`);
  } else {
    if (!String(priceSource.label || "").trim()) fail(`${id}: price_source.label missing`);
    if (!isDate(priceSource.observed_at)) fail(`${id}: price_source.observed_at must be YYYY-MM-DD`);
    if (!String(priceSource.market || "").trim()) fail(`${id}: price_source.market missing`);
    if (!String(priceSource.method || "").toLowerCase().includes("non temps réel")) {
      fail(`${id}: price_source.method must disclose non-live pricing`);
    }
  }
  const requirements = item.requirements;
  if (!requirements || typeof requirements !== "object") {
    fail(`${id}: requirements missing`);
    return;
  }
  if (item.component === "gpu") {
    if (String(item.name || "").includes(" / ")) fail(`${id}: GPU entry must describe one exact product family`);
    if (!(number(requirements.system_power_w) > 0)) fail(`${id}: requirements.system_power_w missing`);
    if (!(number(requirements.gpu_power_w) > 0)) fail(`${id}: requirements.gpu_power_w missing`);
    const source = item.spec_source;
    if (!source || !String(source.url || "").startsWith("https://www.nvidia.com/")) fail(`${id}: official NVIDIA spec_source missing`);
    if (!String(source.scope || "").trim()) fail(`${id}: spec_source.scope missing`);
  }
  if (item.component === "ram") {
    for (const key of ["memory_type_must_match", "motherboard_limit_must_allow", "slots_must_be_checked"]) {
      if (requirements[key] !== true) fail(`${id}: requirements.${key} must be true`);
    }
  }
  if (item.component === "storage") {
    if (requirements.storage_interface_must_be_checked !== true) fail(`${id}: storage interface check missing`);
    if (requirements.m2_slot_not_detected_by_os !== true) fail(`${id}: OS limitation for M.2 slot missing`);
  }
}

if (!existsSync(catalogPath)) {
  console.error(`upgrade_catalog_missing ${catalogPath}`);
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
if (!catalog.version) fail("catalog.version missing");
if (!isDate(catalog.updated_at)) fail("catalog.updated_at must be YYYY-MM-DD");
if (catalog.currency !== "EUR") warn("catalog.currency should be EUR");
if (!String(catalog.affiliate_disclosure || "").includes("affili")) warn("affiliate disclosure should mention affiliation");
if (!Array.isArray(catalog.upgrades) || !catalog.upgrades.length) fail("catalog.upgrades must be non-empty");

const seen = new Set();
const components = new Set();
for (const [index, item] of (catalog.upgrades || []).entries()) {
  const id = String(item.id || "").trim();
  const label = id || `upgrade[${index}]`;
  if (!id) fail(`${label}: id missing`);
  if (seen.has(id)) fail(`${id}: duplicate id`);
  seen.add(id);
  const component = String(item.component || "").trim();
  components.add(component);
  if (!["gpu", "ram", "storage", "cpu", "mac", "other"].includes(component)) fail(`${label}: unsupported component ${component}`);
  if (!String(item.name || "").trim()) fail(`${label}: name missing`);
  if (/4060[^\n]*4070|4070[^\n]*4060/i.test(String(item.name || ""))) fail(`${label}: distinct GPU families must not share one requirements profile`);
  if (!String(item.label || "").trim()) fail(`${label}: label missing`);
  if (!String(item.reason || "").trim()) fail(`${label}: reason missing`);
  if (!Number.isFinite(number(item.priority))) fail(`${label}: priority missing`);
  if (!String(item.price_range_eur || "").trim()) warn(`${label}: price_range_eur missing`);
  if (!String(item.avoid || "").trim()) warn(`${label}: avoid missing`);
  const guideUrl = String(item.guide_url || "");
  if (!guideUrl.startsWith("/")) fail(`${label}: guide_url must be an internal path`);
  const affiliateUrl = String(item.affiliate_url || "");
  if (!affiliateUrl.startsWith("https://www.amazon.fr/")) fail(`${label}: affiliate_url must be an Amazon FR URL`);
  if (!affiliateUrl.includes(`tag=${amazonTag}`)) fail(`${label}: affiliate_url missing Amazon tag`);
  checkRule(item.applies_when, label);
  checkEffects(item.effects, label);
  checkDigitalTwinContract(item, label);
}

for (const required of ["gpu", "ram", "storage"]) {
  if (!components.has(required)) fail(`missing ${required} upgrade`);
}

const rtx4070TiSuper = (catalog.upgrades || []).find((item) => item.id === "gpu-rtx4070tis-16gb");
if (!rtx4070TiSuper) {
  fail("gpu-rtx4070tis-16gb missing");
} else {
  if (number(rtx4070TiSuper.requirements?.system_power_w) !== 700) fail("gpu-rtx4070tis-16gb: expected 700 W system requirement");
  if (number(rtx4070TiSuper.requirements?.gpu_power_w) !== 285) fail("gpu-rtx4070tis-16gb: expected 285 W GPU power");
}

for (const error of errors) console.error(`error: ${error}`);
for (const warning of warnings) console.warn(`warn: ${warning}`);
console.log(`upgrade_catalog_ok upgrades=${catalog.upgrades?.length || 0} components=${[...components].sort().join(",")} warnings=${warnings.length}`);

if (errors.length) process.exit(1);
