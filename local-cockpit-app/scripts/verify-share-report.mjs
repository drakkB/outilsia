#!/usr/bin/env node
// Vérification réseau + cohérence d'un rapport partagé OutilsIA (/r/<token>).
//
// Objectif : une fiche terrain ne doit pas pouvoir prétendre à une preuve réelle
// avec un share_url inventé ou pointant vers le rapport d'une autre machine.
//
// Ce module expose :
//   - reportGpuFamily(text)         : quelle famille GPU le rapport met en avant
//   - coherenceOfReport(entry, body): logique PURE (testable hors-ligne)
//   - verifyShareReport(entry, opts): fetch HTTP réel + coherenceOfReport
//
// La cohérence contrôlée n'est pas une preuve cryptographique : c'est une
// "validation bêta" qui rend une fraude propre nettement plus coûteuse.

import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SHARE_URL_RE = /^https:\/\/outilsia\.fr\/r\/[A-Za-z0-9_-]{16,}$/;

// Familles GPU reconnaissables dans un rapport, de la plus spécifique à la plus
// générique. Sert à détecter le GPU réellement mis en avant par le rapport.
const GPU_FAMILY_TOKENS = [
  "4090", "4080", "4070", "4060",
  "3090", "3080", "3070", "3060", "3050",
  "2080", "2070", "2060",
  "1080", "1070", "1060",
  "a6000", "a5000", "a4000",
];

// GPU attendu (ou interdit) par profil terrain.
const PROFILE_GPU_RULE = {
  rtx_4080_4090: { requireAnyOf: ["4080", "4090"] },
  rtx_3060_12gb: { requireAnyOf: ["3060"] },
  core_i7_gtx_1080_ti: { requireAnyOf: ["1080"] },
  // old_laptop / cpu_only : pas de GPU desktop haut de gamme dans le rapport.
  old_laptop: { forbidAnyOf: ["4090", "4080", "4070", "3090", "3080", "3070", "3060", "2080"] },
  cpu_only: { forbidAnyOf: GPU_FAMILY_TOKENS },
};

function normalize(text) {
  return String(text || "").toLowerCase();
}

// Blob d'identité du rapport = les champs qui décrivent LA machine (titre, meta
// description, og/twitter, JSON-LD, h1). Le nom du GPU peut se trouver dans l'un
// ou l'autre selon la version du template serveur : on les concatène pour être
// robuste. On exclut le corps (upgrades/catalogue) où d'autres GPU apparaissent.
export function reportHeadline(text) {
  const raw = String(text || "");
  const parts = [];
  const push = (m) => { if (m && m[1]) parts.push(m[1].replace(/<[^>]+>/g, " ")); };
  push(raw.match(/<title[^>]*>([^<]+)<\/title>/i));
  push(raw.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i));
  push(raw.match(/content=["']([^"']+)["'][^>]*name=["']description["']/i));
  push(raw.match(/property=["']og:(?:title|description)["'][^>]*content=["']([^"']+)["']/i));
  push(raw.match(/name=["']twitter:(?:title|description)["'][^>]*content=["']([^"']+)["']/i));
  for (const m of raw.matchAll(/"(?:headline|name|description|alternativeHeadline)"\s*:\s*"([^"]+)"/gi)) parts.push(m[1]);
  push(raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i));
  return parts.join(" ").toLowerCase();
}

// Familles GPU explicitement présentes dans le texte du rapport.
export function reportGpuFamilies(text) {
  const body = normalize(text);
  return GPU_FAMILY_TOKENS.filter((token) => body.includes(token));
}

function modelBaseNeedles(model) {
  const base = normalize(model).split(":")[0].trim();
  if (!base) return [];
  // qwen3, qwen2.5, hermes3, llama3.1, mistral, gemma, deepseek...
  const family = base.replace(/[^a-z0-9.]/g, "");
  const words = [family];
  const alpha = family.match(/^[a-z]+/);
  if (alpha && alpha[0].length >= 3 && alpha[0] !== family) words.push(alpha[0]);
  return [...new Set(words)];
}

function tpsNeedles(tps) {
  const value = Number(tps || 0);
  if (!Number.isFinite(value) || value <= 0) return [];
  const rounded = Math.round(value);
  const oneDecimal = value.toFixed(1);
  return [...new Set([
    String(rounded),
    oneDecimal,
    oneDecimal.replace(".", ","),
    String(Math.round(value * 10) / 10),
  ])];
}

// Logique pure : évalue la cohérence entre une fiche et le corps d'un rapport.
// Retourne { coherent, checks:[{name, required, ok, detail}], mismatches:[], unverifiable:[] }.
export function coherenceOfReport(entry, body) {
  const text = normalize(body);
  const checks = [];

  // 1. GPU (requis) — le titre du rapport doit refléter le bon type de machine.
  // On lit le headline (machine décrite), pas tout le corps (upgrades/catalogue).
  const rule = PROFILE_GPU_RULE[entry.profile] || {};
  const headline = reportHeadline(body) || text;
  let gpuOk = true;
  let gpuDetail = "";
  if (rule.requireAnyOf) {
    const hit = rule.requireAnyOf.find((token) => headline.includes(token));
    gpuOk = Boolean(hit);
    gpuDetail = gpuOk
      ? `titre du rapport mentionne ${hit}`
      : `titre du rapport ne mentionne aucun de ${rule.requireAnyOf.join("/")}`;
  } else if (rule.forbidAnyOf) {
    const seen = rule.forbidAnyOf.filter((token) => headline.includes(token));
    gpuOk = seen.length === 0;
    gpuDetail = gpuOk
      ? "titre du rapport sans GPU desktop haut de gamme"
      : `titre du rapport ${entry.profile} incompatible: ${seen.join(",")}`;
  }
  checks.push({ name: "gpu_profile", required: true, ok: gpuOk, detail: gpuDetail });

  // 2. tokens/s — vérifié seulement si le rapport expose des valeurs > 0.
  // Certains rapports réels n'affichent pas de tok/s exploitable (ex. 0 tok/s) :
  // dans ce cas on ne bloque pas (unverifiable), on ne valide pas non plus.
  const reportTps = [...text.matchAll(/([0-9]+(?:[.,][0-9]+)?)\s*tok\/s/g)]
    .map((m) => Number(m[1].replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  const ficheTps = Number(entry.benchmark_tokens_per_second || 0);
  if (reportTps.length && ficheTps > 0) {
    const tpsOk = reportTps.some((n) => Math.abs(n - ficheTps) <= Math.max(1, ficheTps * 0.1));
    checks.push({
      name: "tokens_per_second",
      required: true,
      ok: tpsOk,
      detail: tpsOk
        ? `tok/s fiche ${ficheTps} cohérent avec le rapport (${reportTps.join(",")})`
        : `tok/s fiche ${ficheTps} absent du rapport (rapport: ${reportTps.join(",")})`,
    });
  } else {
    checks.push({
      name: "tokens_per_second",
      required: false,
      ok: false,
      detail: reportTps.length ? "fiche sans tok/s" : "rapport n'expose pas de tok/s > 0",
    });
  }

  // 3. modèle benchmarké (souple) — un rapport liste tout le catalogue de
  // modèles compatibles, donc sa présence est faiblement informative : on la
  // consigne sans bloquer.
  const models = modelBaseNeedles(entry.benchmark_model);
  const modelOk = models.length > 0 && models.some((needle) => text.includes(needle));
  checks.push({
    name: "benchmark_model",
    required: false,
    ok: modelOk,
    detail: modelOk ? `modèle ${models[0]} présent dans le rapport` : `modèle ${models.join("/") || "(vide)"} absent du rapport`,
  });

  // 4. version app (souple) — présence documentée, non bloquante.
  const version = normalize(entry.app_version).replace(/-beta$/, "");
  const versionOk = version ? text.includes(version) : false;
  checks.push({ name: "app_version", required: false, ok: versionOk, detail: version ? `${version} ${versionOk ? "présent" : "absent"}` : "version absente de la fiche" });

  const mismatches = checks.filter((c) => c.required && !c.ok).map((c) => `${c.name}: ${c.detail}`);
  const unverifiable = checks.filter((c) => !c.required && !c.ok).map((c) => c.name);
  return { coherent: mismatches.length === 0, checks, mismatches, unverifiable };
}

// Fetch réel + cohérence. Ne jette jamais : encode l'échec dans le résultat.
// status: "coherent" | "incoherent" | "unreachable" | "invalid_format"
export async function verifyShareReport(entry, opts = {}) {
  const url = String(entry.share_url || "").trim();
  const timeoutMs = Number(opts.timeoutMs || 12000);
  if (!SHARE_URL_RE.test(url)) {
    return { url, status: "invalid_format", reachable: false, coherent: false, http_status: 0, mismatches: ["share_url format invalide"], checks: [] };
  }
  let body = "";
  let httpStatus = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "OutilsIA-FieldReportVerify/1.0" },
      redirect: "follow",
    });
    httpStatus = res.status;
    if (res.status < 200 || res.status >= 400) {
      return { url, status: "unreachable", reachable: false, coherent: false, http_status: httpStatus, mismatches: [`HTTP ${httpStatus}`], checks: [] };
    }
    body = await res.text();
  } catch (error) {
    return { url, status: "unreachable", reachable: false, coherent: false, http_status: httpStatus, reason: "network", mismatches: [String(error?.name || error)], checks: [] };
  } finally {
    clearTimeout(timer);
  }
  const coherence = coherenceOfReport(entry, body);
  return {
    url,
    status: coherence.coherent ? "coherent" : "incoherent",
    reachable: true,
    coherent: coherence.coherent,
    http_status: httpStatus,
    checks: coherence.checks,
    mismatches: coherence.mismatches,
    unverifiable: coherence.unverifiable,
  };
}

// CLI : node scripts/verify-share-report.mjs --input <field-entry.json>
//       node scripts/verify-share-report.mjs --input <entry.json> --body-file <report.html>  (hors-ligne, pour tests)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opts = { input: "", bodyFile: "" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--input") opts.input = resolve(argv[++i] || "");
    else if (argv[i] === "--body-file") opts.bodyFile = resolve(argv[++i] || "");
  }
  (async () => {
    try {
      if (!opts.input || !existsSync(opts.input)) throw new Error("Missing --input <field-entry.json>");
      const raw = JSON.parse(readFileSync(opts.input, "utf8").replace(/^﻿/, ""));
      const entry = raw?.machines?.length === 1 ? raw.machines[0] : raw;
      let result;
      if (opts.bodyFile) {
        const body = readFileSync(opts.bodyFile, "utf8");
        const coherence = coherenceOfReport(entry, body);
        result = { url: entry.share_url, status: coherence.coherent ? "coherent" : "incoherent", reachable: true, ...coherence };
      } else {
        result = await verifyShareReport(entry);
      }
      console.log(`share_report ${result.status} coherent=${result.coherent} http=${result.http_status || "-"} ${result.mismatches?.length ? "mismatches=" + result.mismatches.join(" | ") : ""}`);
      process.exit(result.status === "coherent" ? 0 : 1);
    } catch (error) {
      console.error(error.message || String(error));
      process.exit(2);
    }
  })();
}
