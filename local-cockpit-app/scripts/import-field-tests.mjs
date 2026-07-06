#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(appRoot, ".artifacts", "field-tests.json");
const reportPath = join(appRoot, ".artifacts", "field-tests.md");

export const REQUIRED_PROFILES = [
  "old_laptop",
  "core_i7_gtx_1080_ti",
  "rtx_3060_12gb",
  "rtx_4080_4090",
  "cpu_only",
];

export const FIELD_PROFILE_RULES = {
  old_laptop: {
    label: "Vieux laptop / portable modeste",
    validate(machine) {
      const gpu = String(machine.gpu || "").toLowerCase();
      const cpu = String(machine.cpu || "").toLowerCase();
      const os = String(machine.os || "").toLowerCase();
      const vram = Number(machine.vram_gb || 0);
      const ram = Number(machine.ram_gb || 0);
      if (vram > 8) fail("old_laptop.vram_gb must stay <= 8 for this terrain profile");
      if (ram > 24 && vram > 6 && !gpu.includes("laptop") && !cpu.includes("mobile") && !os.includes("laptop")) {
        fail("old_laptop must look like a laptop/modest machine: low VRAM/RAM or laptop/mobile marker required");
      }
    },
  },
  core_i7_gtx_1080_ti: {
    label: "Core i7 + GTX 1080 Ti 11 Go",
    validate(machine) {
      const gpu = String(machine.gpu || "").toLowerCase();
      const cpu = String(machine.cpu || "").toLowerCase();
      const vram = Number(machine.vram_gb || 0);
      if (!gpu.includes("1080")) fail("core_i7_gtx_1080_ti.gpu must mention GTX 1080 Ti");
      if (!gpu.includes("ti")) fail("core_i7_gtx_1080_ti.gpu must mention Ti");
      if (vram < 10 || vram > 12) fail("core_i7_gtx_1080_ti.vram_gb must be around 11 Go");
      if (!cpu.includes("i7") && !cpu.includes("core")) fail("core_i7_gtx_1080_ti.cpu should mention Core/i7 class");
    },
  },
  rtx_3060_12gb: {
    label: "RTX 3060 12 Go",
    validate(machine) {
      const gpu = String(machine.gpu || "").toLowerCase();
      const vram = Number(machine.vram_gb || 0);
      if (!gpu.includes("3060")) fail("rtx_3060_12gb.gpu must mention RTX 3060");
      if (vram < 10 || vram > 13) fail("rtx_3060_12gb.vram_gb must be around 12 Go");
    },
  },
  rtx_4080_4090: {
    label: "RTX 4080 / RTX 4090",
    validate(machine) {
      const gpu = String(machine.gpu || "").toLowerCase();
      const vram = Number(machine.vram_gb || 0);
      if (!gpu.includes("4080") && !gpu.includes("4090")) fail("rtx_4080_4090.gpu must mention RTX 4080 or RTX 4090");
      if (vram < 16) fail("rtx_4080_4090.vram_gb must be at least 16 Go");
    },
  },
  cpu_only: {
    label: "Machine CPU-only",
    validate(machine) {
      const gpu = String(machine.gpu || "").toLowerCase();
      const vram = Number(machine.vram_gb || 0);
      if (vram !== 0) fail("cpu_only.vram_gb must be 0");
      if (!gpu.includes("cpu") && !gpu.includes("aucun") && !gpu.includes("no gpu") && !gpu.includes("none")) {
        fail("cpu_only.gpu must clearly indicate no dedicated GPU");
      }
    },
  },
};

function usage() {
  console.log(`Usage:
  node scripts/import-field-tests.mjs --input <FIELD-TESTS.json>

Validates real field-test evidence for:
  ${REQUIRED_PROFILES.join(", ")}

Writes:
  ${outputPath}
  ${reportPath}`);
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const opts = { input: "", verifyShareUrls: true };
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
    if (arg === "--skip-share-url-fetch") {
      opts.verifyShareUrls = false;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!opts.input) fail("Missing --input <FIELD-TESTS.json>");
  return opts;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function assertBooleanTrue(value, label) {
  if (value !== true) fail(`${label} must be true`);
}

function assertPositiveNumber(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) fail(`${label} must be a positive number`);
}

function assertString(value, label) {
  if (!String(value || "").trim()) fail(`${label} is required`);
}

function assertShareUrl(value, label) {
  const text = String(value || "").trim();
  if (!text) fail(`${label} is required`);
  let url;
  try {
    url = new URL(text);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (!["http:", "https:"].includes(url.protocol)) fail(`${label} must use http or https`);
  if (!url.hostname) fail(`${label} must include a hostname`);
  if (url.hostname !== "outilsia.fr" || !url.pathname.startsWith("/r/")) {
    fail(`${label} must be an OutilsIA shared report URL (https://outilsia.fr/r/...)`);
  }
}

// Vérifie que le rapport /r/ existe ET que son titre est cohérent avec le
// profil de la fiche (une fiche old_laptop ne peut pas pointer vers le rapport
// d'une RTX 4080). Reste synchrone (spawnSync) pour ne pas casser l'assemblage.
function assertShareUrlReachable(machine, profile, label, options = {}) {
  if (options.verifyShareUrls === false) return;
  const text = String(machine?.share_url || machine || "").trim();
  const script = `
import sys, re, urllib.request
url, profile, tps = sys.argv[1], sys.argv[2], float(sys.argv[3] or 0)
RULE = {
  "rtx_4080_4090": {"require": ["4080","4090"]},
  "rtx_3060_12gb": {"require": ["3060"]},
  "core_i7_gtx_1080_ti": {"require": ["1080"]},
  "old_laptop": {"forbid": ["4090","4080","4070","3090","3080","3070","3060","2080"]},
  "cpu_only": {"forbid": ["4090","4080","4070","4060","3090","3080","3070","3060","3050","2080","2070","2060","1080","1070","1060"]},
}
def headline(t):
  parts = []
  for pat in [r'<title[^>]*>([^<]+)</title>', r'name=["\\']description["\\'][^>]*content=["\\']([^"\\']+)["\\']', r'content=["\\']([^"\\']+)["\\'][^>]*name=["\\']description["\\']', r'property=["\\']og:(?:title|description)["\\'][^>]*content=["\\']([^"\\']+)["\\']', r'<h1[^>]*>(.*?)</h1>']:
    m = re.search(pat, t, re.I | re.S)
    if m: parts.append(re.sub(r'<[^>]+>', ' ', m.group(1)))
  for m in re.finditer(r'"(?:headline|name|description|alternativeHeadline)"\\s*:\\s*"([^"]+)"', t, re.I):
    parts.append(m.group(1))
  return ' '.join(parts).lower()
req = urllib.request.Request(url, headers={"User-Agent": "OutilsIA-FieldValidator/1.0"})
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        status = int(getattr(r, "status", r.getcode()))
        body = r.read(200000).decode("utf-8","replace")
    if status < 200 or status >= 400: raise SystemExit(f"status {status}")
    if not body: raise SystemExit("empty response")
except SystemExit: raise
except Exception as exc: raise SystemExit(f"unreachable: {exc}")
h = headline(body); rule = RULE.get(profile, {})
if rule.get("require") and not any(tok in h for tok in rule["require"]):
    raise SystemExit(f"incoherent: titre du rapport sans {'/'.join(rule['require'])}")
if rule.get("forbid"):
    seen = [tok for tok in rule["forbid"] if tok in h]
    if seen: raise SystemExit(f"incoherent: titre du rapport {profile} incompatible ({','.join(seen)})")
rep_tps = [float(x.replace(',','.')) for x in re.findall(r'([0-9]+(?:[.,][0-9]+)?)\\s*tok/s', body.lower())]
rep_tps = [x for x in rep_tps if x > 0]
if rep_tps and tps > 0 and not any(abs(x-tps) <= max(1.0, tps*0.1) for x in rep_tps):
    raise SystemExit(f"incoherent: tok/s fiche {tps} absent du rapport")
`;
  const tps = String(Number(machine?.benchmark_tokens_per_second || 0));
  const result = spawnSync("python3", ["-c", script, text, String(profile || ""), tps], {
    encoding: "utf8",
    timeout: 20000,
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || result.error?.message || "unreachable").trim();
    fail(`${label} rapport /r/ invalide (${detail})`);
  }
}

function assertTestedAt(value, label) {
  const text = String(value || "").trim();
  if (!text) fail(`${label} is required`);
  const time = Date.parse(text);
  if (!Number.isFinite(time)) fail(`${label} must be an ISO date`);
  const now = Date.now();
  if (time > now + 10 * 60 * 1000) fail(`${label} must not be in the future`);
  if (time < Date.UTC(2026, 6, 1)) fail(`${label} must be from the current beta terrain campaign`);
}

const PROFILE_TOKENS_PER_SECOND_CAPS = {
  old_laptop: 45,
  core_i7_gtx_1080_ti: 95,
  rtx_3060_12gb: 150,
  rtx_4080_4090: 650,
  cpu_only: 35,
};

function assertBenchmarkPlausible(machine, profile) {
  const cap = PROFILE_TOKENS_PER_SECOND_CAPS[profile];
  const value = Number(machine.benchmark_tokens_per_second || 0);
  const elapsedMs = Number(machine.benchmark_elapsed_ms || 0);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 200) {
    fail(`${profile}.benchmark_elapsed_ms is implausible (${elapsedMs} ms < 200 ms)`);
  }
  if (Number.isFinite(cap) && value > cap) {
    fail(`${profile}.benchmark_tokens_per_second is implausible (${value} tok/s > ${cap} tok/s cap)`);
  }
}

export function assertFieldProfileHardware(machine, profile = machine?.profile) {
  const rule = FIELD_PROFILE_RULES[profile];
  if (!rule) fail(`No hardware rule for profile: ${profile}`);
  rule.validate(machine);
}

export function validateFieldTests(payload, options = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("Field tests payload must be a JSON object");
  if (payload.schema !== "outilsia.local_cockpit_field_tests.v1") fail("schema must be outilsia.local_cockpit_field_tests.v1");
  assertString(payload.build_id, "payload.build_id");
  if (!Array.isArray(payload.machines)) fail("machines must be an array");

  const byProfile = new Map();
  for (const machine of payload.machines) {
    if (!machine || typeof machine !== "object" || Array.isArray(machine)) fail("Each machine entry must be an object");
    assertString(machine.profile, "machine.profile");
    if (byProfile.has(machine.profile)) fail(`Duplicate profile: ${machine.profile}`);
    byProfile.set(machine.profile, machine);
  }

  const missingProfiles = REQUIRED_PROFILES.filter((profile) => !byProfile.has(profile));
  if (missingProfiles.length) fail(`Missing required profiles: ${missingProfiles.join(", ")}`);

  const shareUrls = new Set();
  const tpsByRoundedValue = new Map();
  for (const profile of REQUIRED_PROFILES) {
    const machine = byProfile.get(profile);
    assertString(machine.machine_label, `${profile}.machine_label`);
    assertTestedAt(machine.tested_at, `${profile}.tested_at`);
    assertString(machine.os, `${profile}.os`);
    assertString(machine.cpu, `${profile}.cpu`);
    assertString(machine.gpu, `${profile}.gpu`);
    assertPositiveNumber(machine.ram_gb, `${profile}.ram_gb`);
    if (profile !== "cpu_only") {
      assertPositiveNumber(machine.vram_gb, `${profile}.vram_gb`);
    }
    assertBooleanTrue(machine.scan_ok, `${profile}.scan_ok`);
    assertString(machine.score_label, `${profile}.score_label`);
    assertPositiveNumber(machine.score, `${profile}.score`);
    assertString(machine.recommended_model, `${profile}.recommended_model`);
    assertString(machine.first_action, `${profile}.first_action`);
    assertString(machine.upgrade_recommendation, `${profile}.upgrade_recommendation`);
    assertString(machine.benchmark_model, `${profile}.benchmark_model`);
    assertPositiveNumber(machine.benchmark_tokens_per_second, `${profile}.benchmark_tokens_per_second`);
    assertPositiveNumber(machine.benchmark_elapsed_ms, `${profile}.benchmark_elapsed_ms`);
    assertBooleanTrue(machine.promptforge_ok, `${profile}.promptforge_ok`);
    assertBooleanTrue(machine.dialogue_ok, `${profile}.dialogue_ok`);
    assertBooleanTrue(machine.arena_ok, `${profile}.arena_ok`);
    assertBooleanTrue(machine.report_ok, `${profile}.report_ok`);
    assertShareUrl(machine.share_url, `${profile}.share_url`);
    assertShareUrlReachable(machine, profile, `${profile}.share_url`, options);
    const shareUrl = String(machine.share_url || "").trim().toLowerCase();
    if (shareUrls.has(shareUrl)) fail(`Duplicate share_url across field machines: ${machine.share_url}`);
    shareUrls.add(shareUrl);
    assertFieldProfileHardware(machine, profile);
    assertBenchmarkPlausible(machine, profile);
    const tpsKey = Number(machine.benchmark_tokens_per_second || 0).toFixed(1);
    if (tpsByRoundedValue.has(tpsKey)) {
      fail(`Duplicate benchmark_tokens_per_second across field machines: ${tpsKey} tok/s for ${tpsByRoundedValue.get(tpsKey)} and ${profile}`);
    }
    tpsByRoundedValue.set(tpsKey, profile);
  }

  return {
    ok: true,
    profile_count: REQUIRED_PROFILES.length,
    tested_profiles: REQUIRED_PROFILES,
  };
}

export function fieldTestsMarkdown(payload, validation) {
  const lines = [
    "# Recette terrain multi-machines OutilsIA Local Cockpit",
    "",
    `- Schema: \`${payload.schema}\``,
    `- Statut: ${validation.ok ? "OK terrain complet" : "KO"}`,
    `- Date: ${payload.tested_at || "non renseignée"}`,
    `- Testeur: ${payload.tester || "non renseigné"}`,
    `- Build: ${payload.build_id || "non renseigné"}`,
    `- Machines requises: ${validation.profile_count}`,
    "",
    "| Profil | Machine | Score | Modèle conseillé | Benchmark | Rapport | Upgrade |",
    "| --- | --- | ---: | --- | --- | --- | --- |",
  ];
  for (const profile of REQUIRED_PROFILES) {
    const machine = payload.machines.find((item) => item.profile === profile);
    lines.push([
      profile,
      machine.machine_label,
      `${machine.score}/100`,
      machine.recommended_model,
      `${machine.benchmark_model} · ${machine.benchmark_tokens_per_second} tok/s`,
      machine.share_url || "-",
      machine.upgrade_recommendation,
    ].map((cell) => String(cell || "").replaceAll("|", "\\|")).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("", "## Notes");
  lines.push(payload.notes || "Aucune note générale.");
  lines.push("");
  return lines.join("\n");
}

export function importFieldTests(input, options = {}) {
  const inputPath = resolve(input || "");
  if (!existsSync(inputPath)) fail(`Input field tests not found: ${inputPath}`);
  const payload = readJson(inputPath);
  const validation = validateFieldTests(payload, options);
  mkdirSync(dirname(outputPath), { recursive: true });
  copyFileSync(inputPath, outputPath);
  writeFileSync(reportPath, fieldTestsMarkdown(payload, validation), "utf8");
  return { payload, validation, outputPath, reportPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const result = importFieldTests(opts.input, { verifyShareUrls: opts.verifyShareUrls });
    console.log(`field_tests_imported ${result.outputPath}`);
    console.log(`field_tests_report ${result.reportPath}`);
    console.log(`profiles=${result.validation.profile_count} build_id=${result.payload.build_id || ""}`);
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
}
