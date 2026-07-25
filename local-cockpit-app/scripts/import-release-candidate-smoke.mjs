#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  sha256,
  validateRcSmokeResult,
  verifyRcSmokeReport,
} from "./rc-smoke-evidence.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultCandidate = join(appRoot, ".artifacts", "release-candidate-merged");
const defaultRegistry = join(appRoot, ".artifacts", "rc-smoke-registry");
const MINIMUM_UNIQUE_MACHINES = 2;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const opts = {
    input: "",
    candidateDir: defaultCandidate,
    registryDir: defaultRegistry,
    reportBody: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/import-release-candidate-smoke.mjs --input <zip|dir|RC-SMOKE.json>
    [--candidate-dir <merged-rc>] [--registry-dir <dir>]

Each import revalidates the candidate identity, benchmark plausibility and shared
report. Exact duplicate runs are ignored. Reused report URLs are rejected.`);
      process.exit(0);
    }
    if (arg === "--input") {
      opts.input = resolve(argv[++index] || "");
      continue;
    }
    if (arg === "--candidate-dir") {
      opts.candidateDir = resolve(argv[++index] || "");
      continue;
    }
    if (arg === "--registry-dir") {
      opts.registryDir = resolve(argv[++index] || "");
      continue;
    }
    if (arg === "--report-body") {
      opts.reportBody = resolve(argv[++index] || "");
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }
  if (!opts.input) fail("Missing --input <zip|dir|RC-SMOKE.json>");
  return opts;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function walk(root) {
  if (!existsSync(root)) return [];
  if (statSync(root).isFile()) return [root];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: appRoot, encoding: "utf8" });
  if (result.status !== 0) fail(result.stderr || result.stdout || `Command failed: ${command}`);
}

function extractZip(path) {
  const root = mkdtempSync(join(tmpdir(), "outilsia-rc-smoke-"));
  if (process.platform === "win32") {
    run("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
      path,
      root,
    ]);
  } else {
    const script = [
      "import pathlib,sys,zipfile",
      "source=pathlib.Path(sys.argv[1])",
      "target=pathlib.Path(sys.argv[2]).resolve()",
      "z=zipfile.ZipFile(source)",
      "members=z.infolist()",
      "assert members, 'empty zip'",
      "for item in members:",
      " p=(target/item.filename).resolve()",
      " if target not in p.parents and p != target: raise SystemExit('unsafe zip path')",
      "z.extractall(target)",
    ].join("\n");
    run("python3", ["-c", script, path, root]);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function openInput(path) {
  if (!existsSync(path)) fail(`RC smoke input not found: ${path}`);
  const stat = statSync(path);
  if (stat.isDirectory()) return { root: path, exactResult: "", cleanup: () => {} };
  if (!stat.isFile()) fail(`RC smoke input is not a file: ${path}`);
  if (extname(path).toLowerCase() === ".zip") return { ...extractZip(path), exactResult: "" };
  if (extname(path).toLowerCase() === ".json") {
    return { root: dirname(path), exactResult: path, cleanup: () => {} };
  }
  fail(`Unsupported RC smoke input: ${path}`);
}

function findEvidenceFiles(opened) {
  const files = walk(opened.root);
  const smokeFiles = opened.exactResult
    ? [opened.exactResult]
    : files.filter((path) => basename(path).toUpperCase().startsWith("RC-SMOKE-") && extname(path).toLowerCase() === ".json");
  if (smokeFiles.length !== 1) fail(`Expected exactly one RC-SMOKE JSON, found ${smokeFiles.length}`);
  const manifests = files.filter((path) => basename(path) === "release-candidate.json");
  if (manifests.length !== 1) fail(`Expected exactly one embedded release-candidate.json, found ${manifests.length}`);
  return { smokePath: smokeFiles[0], manifestPath: manifests[0], files };
}

function verifyCandidateDirectory(path) {
  run("node", [
    join(appRoot, "scripts", "verify-release-candidate.mjs"),
    "--input",
    path,
    "--require-platform",
    "windows-x64",
    "--require-platform",
    "linux",
    "--require-freshness",
    "--require-clean-source",
  ]);
  return readJson(join(path, "release-candidate.json"));
}

function assertCandidateSubset(embedded, merged) {
  for (const key of ["version", "rc_number", "label", "build_id"]) {
    if (String(embedded[key] || "") !== String(merged[key] || "")) fail(`Embedded RC ${key} does not match merged candidate`);
  }
  if (String(embedded.source?.commit || "") !== String(merged.source?.commit || "")) {
    fail("Embedded RC source commit does not match merged candidate");
  }
  const mergedFiles = new Map(merged.files.map((file) => [file.name, file]));
  for (const file of embedded.files || []) {
    const canonical = mergedFiles.get(file.name);
    if (!canonical
      || canonical.sha256 !== file.sha256
      || Number(canonical.size_bytes) !== Number(file.size_bytes)
      || canonical.platform !== file.platform
      || canonical.kind !== file.kind) {
      fail(`Embedded RC artifact is not an exact subset of merged candidate: ${file.name}`);
    }
  }
}

function candidateIdentity(candidate, manifestSha256) {
  return {
    version: candidate.version,
    label: candidate.label,
    build_id: candidate.build_id,
    source_commit: candidate.source?.commit || "",
    manifest_sha256: manifestSha256,
    artifact_set_sha256: candidate.build_provenance?.artifact_set_sha256 || "",
  };
}

function sameCandidate(left, right) {
  return ["version", "label", "build_id", "source_commit", "manifest_sha256", "artifact_set_sha256"]
    .every((key) => String(left?.[key] || "") === String(right?.[key] || ""));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function latestRunsByMachine(runs) {
  const latest = new Map();
  for (const run of runs) {
    const machineKey = run.machine_anchor_sha256 || run.machine_fingerprint_sha256;
    const previous = latest.get(machineKey);
    if (!previous || Date.parse(run.validated_at) > Date.parse(previous.validated_at)) {
      latest.set(machineKey, run);
    }
  }
  return [...latest.values()].sort((left, right) => left.machine.gpu.localeCompare(right.machine.gpu));
}

export function registryStatus(registry, registrySha256 = "") {
  const machines = latestRunsByMachine(registry.runs);
  const verified = machines.filter((run) => run.report_verification?.network_verified === true);
  const ready = machines.length >= registry.minimum_unique_machines
    && verified.length === machines.length;
  return {
    schema: "outilsia.local_cockpit_rc_smoke_status.v1",
    generated_at: new Date().toISOString(),
    candidate: registry.candidate,
    registry_sha256: registrySha256,
    status: ready ? "RC_SMOKE_GATE_READY" : "RC_SMOKE_WAITING",
    unique_machines: machines.length,
    network_verified_machines: verified.length,
    minimum_unique_machines: registry.minimum_unique_machines,
    promotion_threshold_reached: ready,
    promotion_authorized: false,
    full_terrain_gate_complete: false,
    machines,
    limits: [
      "Le smoke RC valide le coeur sur des machines uniques ; il ne remplace pas les cinq fiches terrain completes.",
      "La promotion publique exige encore une decision humaine explicite.",
    ],
  };
}

function markdown(status) {
  const lines = [
    `# Decision RC ${status.candidate.label}`,
    "",
    `- Build : \`${status.candidate.build_id}\``,
    `- Source : \`${status.candidate.source_commit}\``,
    `- Statut : **${status.status}**`,
    `- Machines uniques : **${status.unique_machines}/${status.minimum_unique_machines} minimum**`,
    `- Rapports reseau coherents : **${status.network_verified_machines}/${status.unique_machines}**`,
    "- Promotion autorisee : **non** (decision humaine encore requise)",
    "- Terrain complet : **non**",
    "",
    "| Machine | Memoire | Benchmark | Rapport | Decision |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const run of status.machines) {
    lines.push(`| ${run.machine.gpu} / ${run.machine.cpu} | ${run.machine.ram_gb} Go RAM · ${run.machine.vram_gb} Go VRAM | ${run.benchmark.model} · ${run.benchmark.tokens_per_second} tok/s · ${run.benchmark.elapsed_ms} ms | ${run.report_verification.network_verified ? "coherent" : run.report_verification.status} | ${run.report_verification.network_verified ? "coeur RC valide" : "a verifier"} |`);
  }
  lines.push("", "## Limites", "", ...status.limits.map((item) => `- ${item}`), "");
  return lines.join("\n");
}

function html(status) {
  const rows = status.machines.map((run) => `<tr>
    <td><strong>${escapeHtml(run.machine.gpu)}</strong><small>${escapeHtml(run.machine.cpu)}</small></td>
    <td>${escapeHtml(run.machine.ram_gb)} Go RAM<small>${escapeHtml(run.machine.vram_gb)} Go VRAM</small></td>
    <td><strong>${escapeHtml(run.benchmark.model)}</strong><small>${escapeHtml(run.benchmark.tokens_per_second)} tok/s · ${escapeHtml(run.benchmark.elapsed_ms)} ms</small></td>
    <td><a href="${escapeHtml(run.shared_report.url)}">rapport</a><small>${escapeHtml(run.report_verification.status)}</small></td>
    <td><span class="${run.report_verification.network_verified ? "ok" : "wait"}">${run.report_verification.network_verified ? "Coeur RC valide" : "A verifier"}</span></td>
  </tr>`).join("\n");
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Decision RC OutilsIA ${escapeHtml(status.candidate.label)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f2f4f6;color:#17202a;font:15px Arial,sans-serif}header{background:#121820;color:#fff;border-bottom:5px solid #df3b35;padding:25px}header div,main{max-width:1120px;margin:auto}h1{margin:4px 0;font-size:30px;letter-spacing:0}.meta{color:#bec9d3;font-family:Consolas,monospace}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.card{background:#fff;border:1px solid #d7dde3;border-radius:6px;padding:16px}.card strong{display:block;font-size:25px}.card span{color:#5d6974}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d7dde3}th,td{text-align:left;padding:12px;border-bottom:1px solid #e4e8eb;vertical-align:top}th{background:#e9edf0}small{display:block;color:#64717c;margin-top:4px}.ok,.wait{display:inline-block;padding:4px 7px;border-radius:3px;font-weight:700}.ok{background:#dff4e8;color:#12603d}.wait{background:#fff0cc;color:#7a4f00}.limit{margin-top:18px;background:#fff7e2;border:1px solid #e1bd67;border-radius:6px;padding:15px;line-height:1.5}@media(max-width:760px){.grid{grid-template-columns:1fr 1fr}table{display:block;overflow-x:auto}}
</style></head><body><header><div><div class="meta">CANDIDAT PRIVE · BUILD ${escapeHtml(status.candidate.build_id)}</div><h1>Decision ${escapeHtml(status.candidate.label)}</h1><div class="meta">${escapeHtml(status.candidate.source_commit)}</div></div></header>
<main><div class="grid">
<div class="card"><strong>${escapeHtml(status.status)}</strong><span>statut smoke</span></div>
<div class="card"><strong>${status.unique_machines}/${status.minimum_unique_machines}</strong><span>machines uniques</span></div>
<div class="card"><strong>${status.network_verified_machines}/${status.unique_machines}</strong><span>rapports verifies</span></div>
<div class="card"><strong>NON</strong><span>promotion automatique</span></div>
</div><table><thead><tr><th>Machine</th><th>Memoire</th><th>Benchmark</th><th>Preuve</th><th>Decision</th></tr></thead><tbody>${rows || "<tr><td colspan=\"5\">Aucun resultat importe.</td></tr>"}</tbody></table>
<div class="limit"><strong>Frontiere de preuve.</strong> ${escapeHtml(status.limits.join(" "))}</div></main></body></html>`;
}

export async function importRcSmoke(options) {
  const mergedCandidate = verifyCandidateDirectory(options.candidateDir);
  const mergedManifestPath = join(options.candidateDir, "release-candidate.json");
  const mergedIdentity = candidateIdentity(mergedCandidate, sha256(readFileSync(mergedManifestPath)));
  const opened = openInput(options.input);
  try {
    const evidenceFiles = findEvidenceFiles(opened);
    const embeddedManifestBytes = readFileSync(evidenceFiles.manifestPath);
    const embeddedCandidate = JSON.parse(embeddedManifestBytes.toString("utf8").replace(/^\uFEFF/, ""));
    assertCandidateSubset(embeddedCandidate, mergedCandidate);
    const resultBytes = readFileSync(evidenceFiles.smokePath);
    const rawResult = JSON.parse(resultBytes.toString("utf8").replace(/^\uFEFF/, ""));
    const result = validateRcSmokeResult(rawResult, embeddedCandidate, {
      candidateManifestSha256: sha256(embeddedManifestBytes),
    });
    const recipeFiles = evidenceFiles.files.filter((path) => basename(path) === result.source_recipe.name);
    if (recipeFiles.length !== 1) {
      fail(`Expected exactly one source recipe ${result.source_recipe.name}, found ${recipeFiles.length}`);
    }
    if (sha256(readFileSync(recipeFiles[0])) !== result.source_recipe.sha256) {
      fail("Source recipe SHA256 does not match the machine result");
    }
    const reportBody = options.reportBody ? readFileSync(options.reportBody, "utf8") : undefined;
    const reportVerification = await verifyRcSmokeReport(result, {
      body: reportBody,
      fetchImpl: options.fetchImpl,
    });
    if (!reportVerification.coherent) {
      fail(`Shared report is not coherent: ${(reportVerification.mismatches || []).join(" | ")}`);
    }

    mkdirSync(join(options.registryDir, "entries"), { recursive: true });
    const registryPath = join(options.registryDir, "RC-SMOKE-REGISTRY.json");
    const registry = existsSync(registryPath)
      ? readJson(registryPath)
      : {
        schema: "outilsia.local_cockpit_rc_smoke_registry.v1",
        created_at: new Date().toISOString(),
        candidate: mergedIdentity,
        minimum_unique_machines: MINIMUM_UNIQUE_MACHINES,
        runs: [],
      };
    if (registry.schema !== "outilsia.local_cockpit_rc_smoke_registry.v1") fail("Unexpected RC smoke registry schema");
    if (!sameCandidate(registry.candidate, mergedIdentity)) fail("RC smoke registry belongs to another candidate");

    const resultSha256 = sha256(resultBytes);
    const exactDuplicate = registry.runs.find((run) => run.result_sha256 === resultSha256);
    if (!exactDuplicate) {
      const reusedUrl = registry.runs.find((run) => run.shared_report.url === result.shared_report.url);
      if (reusedUrl) fail("Shared report URL is already attached to another RC smoke run");
      const reusedBody = registry.runs.find((run) => (
        run.machine_fingerprint_sha256 !== result.machine.fingerprint_sha256
        && run.shared_report.body_sha256 === result.shared_report.body_sha256
      ));
      if (reusedBody) fail("Shared report body is reused across different RC smoke machines");
      const entryName = `RC-SMOKE-${result.machine.fingerprint_sha256.slice(0, 16)}-${resultSha256.slice(0, 16)}.json`;
      copyFileSync(evidenceFiles.smokePath, join(options.registryDir, "entries", entryName));
      registry.runs.push({
        result_sha256: resultSha256,
        imported_at: new Date().toISOString(),
        source_file: basename(options.input),
        entry_file: entryName,
        validated_at: result.validated_at,
        machine_anchor_sha256: result.machine.anchor_sha256,
        machine_fingerprint_sha256: result.machine.fingerprint_sha256,
        machine: result.machine,
        benchmark: result.benchmark,
        shared_report: result.shared_report,
        report_verification: reportVerification,
        embedded_candidate_manifest_sha256: sha256(embeddedManifestBytes),
      });
    }
    registry.updated_at = new Date().toISOString();
    registry.runs.sort((left, right) => Date.parse(left.validated_at) - Date.parse(right.validated_at));
    const registryText = `${JSON.stringify(registry, null, 2)}\n`;
    writeFileSync(registryPath, registryText);
    const status = registryStatus(registry, sha256(registryText));
    writeFileSync(join(options.registryDir, "RC-SMOKE-STATUS.json"), `${JSON.stringify(status, null, 2)}\n`);
    writeFileSync(join(options.registryDir, "RC-SMOKE-DECISION.md"), `${markdown(status)}\n`);
    writeFileSync(join(options.registryDir, "RC-SMOKE-DECISION.html"), `${html(status)}\n`);
    return { registry, status, duplicate: Boolean(exactDuplicate), registryPath };
  } finally {
    opened.cleanup();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const result = await importRcSmoke(opts);
    console.log(`rc_smoke_${result.duplicate ? "duplicate" : "imported"} ${result.registryPath}`);
    console.log(
      `status=${result.status.status} machines=${result.status.unique_machines}/${result.status.minimum_unique_machines} ` +
      `network=${result.status.network_verified_machines}/${result.status.unique_machines}`
    );
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
}
