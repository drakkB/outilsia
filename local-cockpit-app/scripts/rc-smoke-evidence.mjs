import { createHash } from "node:crypto";
import { SHARE_URL_RE, coherenceOfReport, reportHeadline } from "./verify-share-report.mjs";

const SHA256_RE = /^[a-f0-9]{64}$/i;
const GIT_SHA_RE = /^[a-f0-9]{40}$/i;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  throw new Error(message);
}

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) fail(`${label} is required`);
  return text;
}

function positiveNumber(value, label, minimum = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= minimum) fail(`${label} must be greater than ${minimum}`);
  return number;
}

function normalizeHardware(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hardwareNeedles(machine) {
  const gpu = normalizeHardware(machine.gpu);
  const cpu = normalizeHardware(machine.cpu);
  const unknownGpu = /^(?:unknown|inconnu|non determine|non detecte|cpu only|aucun)$/.test(gpu);
  const source = unknownGpu ? cpu : gpu;
  const modelTokens = source.match(/\b(?:[a-z]*\d+[a-z0-9]*|\d+[a-z]+)\b/g) || [];
  if (modelTokens.length) return [...new Set(modelTokens)].slice(0, 3);
  const generic = new Set([
    "nvidia", "geforce", "amd", "radeon", "intel", "graphics", "display",
    "adapter", "processor", "cpu", "gpu", "series", "super", "mobile",
  ]);
  return source.split(/\s+/).filter((token) => token.length >= 4 && !generic.has(token)).slice(0, 2);
}

export function machineFingerprintFromResult(result) {
  const declared = String(result?.machine?.fingerprint_sha256 || "").trim().toLowerCase();
  if (SHA256_RE.test(declared)) return declared;
  const machine = result?.machine || {};
  return sha256([
    normalizeHardware(machine.cpu),
    Number(machine.ram_gb || 0).toFixed(2),
    normalizeHardware(machine.gpu),
    Number(machine.vram_gb || 0).toFixed(2),
    normalizeHardware(machine.os),
  ].join("|"));
}

export function validateRcSmokeResult(result, embeddedCandidate, options = {}) {
  if (!result || typeof result !== "object" || Array.isArray(result)) fail("RC smoke result must be an object");
  if (result.schema !== "outilsia.local_cockpit_rc_smoke.v1") fail("Unexpected RC smoke schema");
  if (result.ok !== true) fail("RC smoke result must set ok=true");
  const candidate = result.candidate || {};
  const expectedManifestSha = String(options.candidateManifestSha256 || "").toLowerCase();
  for (const key of ["version", "label", "build_id"]) {
    if (String(candidate[key] || "") !== String(embeddedCandidate?.[key] || "")) {
      fail(`RC smoke candidate ${key} mismatch`);
    }
  }
  if (candidate.channel !== "rc") fail("RC smoke candidate channel must be rc");
  if (candidate.public_deploy_allowed !== false) fail("RC smoke must not authorize public deployment");
  if (!GIT_SHA_RE.test(String(candidate.source_commit || ""))) fail("RC smoke source_commit is invalid");
  if (String(candidate.source_commit) !== String(embeddedCandidate?.source?.commit || "")) {
    fail("RC smoke source_commit mismatch");
  }
  if (!SHA256_RE.test(String(candidate.manifest_sha256 || ""))) fail("RC smoke manifest_sha256 is invalid");
  if (expectedManifestSha && String(candidate.manifest_sha256).toLowerCase() !== expectedManifestSha) {
    fail("RC smoke manifest_sha256 mismatch");
  }
  if (!SHA256_RE.test(String(candidate.artifact_set_sha256 || ""))) fail("RC smoke artifact_set_sha256 is invalid");
  if (String(candidate.artifact_set_sha256) !== String(embeddedCandidate?.build_provenance?.artifact_set_sha256 || "")) {
    fail("RC smoke artifact_set_sha256 mismatch");
  }
  const validatedAt = Date.parse(requiredText(result.validated_at, "validated_at"));
  if (!Number.isFinite(validatedAt)) fail("validated_at must be an ISO date");
  const now = Number(options.now || Date.now());
  if (validatedAt > now + 10 * 60 * 1000) fail("validated_at must not be in the future");
  const candidateCreatedAt = Date.parse(String(embeddedCandidate?.created_at || ""));
  if (Number.isFinite(candidateCreatedAt) && validatedAt < candidateCreatedAt - 24 * 60 * 60 * 1000) {
    fail("RC smoke predates its candidate");
  }

  const machine = result.machine || {};
  const normalizedMachine = {
    cpu: requiredText(machine.cpu, "machine.cpu"),
    ram_gb: positiveNumber(machine.ram_gb, "machine.ram_gb"),
    gpu: requiredText(machine.gpu, "machine.gpu"),
    vram_gb: Number(machine.vram_gb || 0),
    os: requiredText(machine.os, "machine.os"),
    anchor_sha256: String(machine.anchor_sha256 || "").trim().toLowerCase(),
    fingerprint_sha256: machineFingerprintFromResult(result),
  };
  if (!Number.isFinite(normalizedMachine.vram_gb) || normalizedMachine.vram_gb < 0) {
    fail("machine.vram_gb must be zero or greater");
  }
  if (!SHA256_RE.test(normalizedMachine.anchor_sha256)) {
    fail("machine.anchor_sha256 is invalid");
  }

  const benchmark = result.benchmark || {};
  const normalizedBenchmark = {
    ...benchmark,
    model: requiredText(benchmark.model, "benchmark.model"),
    tokens_per_second: positiveNumber(benchmark.tokens_per_second, "benchmark.tokens_per_second"),
    elapsed_ms: positiveNumber(benchmark.elapsed_ms, "benchmark.elapsed_ms", 199),
  };
  const sharedReport = result.shared_report || {};
  const reportUrl = requiredText(sharedReport.url, "shared_report.url");
  if (!SHARE_URL_RE.test(reportUrl)) fail("shared_report.url must be an exact https://outilsia.fr/r/... URL");
  if (Number(sharedReport.http_status) !== 200) fail("shared_report.http_status must be 200");
  if (sharedReport.gpu_identity_matched !== true) fail("shared_report.gpu_identity_matched must be true");
  if (!SHA256_RE.test(String(sharedReport.body_sha256 || ""))) fail("shared_report.body_sha256 is invalid");
  if (!SHA256_RE.test(String(result.source_recipe?.sha256 || ""))) fail("source_recipe.sha256 is invalid");
  requiredText(result.source_recipe?.name, "source_recipe.name");
  if (result.validator?.network_rechecked !== true) fail("RC smoke validator must recheck the shared report");
  if (result.full_terrain_gate_complete !== false) fail("RC smoke must not claim the full terrain gate");

  return {
    ...result,
    candidate: { ...candidate },
    machine: normalizedMachine,
    benchmark: normalizedBenchmark,
    shared_report: { ...sharedReport, url: reportUrl },
  };
}

export function verifyRcSmokeReportBody(result, body) {
  const headline = reportHeadline(body);
  const needles = hardwareNeedles(result.machine);
  const missingHardware = needles.filter((needle) => !headline.includes(needle));
  const bodySha256 = sha256(String(body || ""));
  const coherence = coherenceOfReport({
    profile: "",
    benchmark_tokens_per_second: result.benchmark.tokens_per_second,
    benchmark_model: result.benchmark.model,
    app_version: result.candidate.version,
  }, body);
  const mismatches = [
    ...(missingHardware.length ? [`hardware identity absent from report headline: ${missingHardware.join(", ")}`] : []),
    ...(bodySha256 !== String(result.shared_report?.body_sha256 || "").toLowerCase()
      ? ["shared report body hash changed since machine validation"]
      : []),
    ...coherence.mismatches,
  ];
  return {
    coherent: mismatches.length === 0,
    hardware_needles: needles,
    hardware_identity_matched: missingHardware.length === 0,
    checks: coherence.checks,
    mismatches,
    body_sha256: bodySha256,
  };
}

export async function verifyRcSmokeReport(result, options = {}) {
  if (typeof options.body === "string") {
    return {
      status: "offline_fixture",
      reachable: false,
      network_verified: false,
      http_status: 0,
      ...verifyRcSmokeReportBody(result, options.body),
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 15000));
  try {
    const response = await (options.fetchImpl || fetch)(result.shared_report.url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "OutilsIA-RCSmokeVerify/1.0",
        "Cache-Control": "no-cache",
      },
    });
    if (response.status < 200 || response.status >= 400) {
      return {
        status: "unreachable",
        reachable: false,
        network_verified: false,
        coherent: false,
        http_status: response.status,
        mismatches: [`HTTP ${response.status}`],
      };
    }
    const body = await response.text();
    const proof = verifyRcSmokeReportBody(result, body);
    return {
      status: proof.coherent ? "coherent" : "incoherent",
      reachable: true,
      network_verified: proof.coherent,
      http_status: response.status,
      ...proof,
    };
  } catch (error) {
    return {
      status: "unreachable",
      reachable: false,
      network_verified: false,
      coherent: false,
      http_status: 0,
      mismatches: [String(error?.name || error)],
    };
  } finally {
    clearTimeout(timer);
  }
}
