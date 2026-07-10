function fail(message) {
  throw new Error(message);
}

export function validateFieldEnrichment(entry) {
  const profile = String(entry.profile || "field_entry");
  const doctor = entry.hardware_doctor;
  let doctorSummary = {
    available: false,
    schema: "",
    score: null,
    label: "non exporté",
  };
  if (doctor !== undefined && doctor !== null) {
    if (!doctor || typeof doctor !== "object" || Array.isArray(doctor)) {
      fail(`${profile}.hardware_doctor must be an object when present`);
    }
    const schema = String(doctor.schema || "").trim();
    const score = Number(doctor.score);
    if (schema !== "outilsia.hardware_doctor.v2") {
      fail(`${profile}.hardware_doctor.schema must be outilsia.hardware_doctor.v2 when present`);
    }
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      fail(`${profile}.hardware_doctor.score must be between 0 and 100`);
    }
    doctorSummary = {
      available: true,
      schema,
      score,
      label: `${score}/100`,
    };
  }

  const passportOk = entry.capability_passport_ok === true;
  const passportSchema = String(entry.capability_passport_schema || "").trim();
  const passportDigest = String(entry.capability_passport_digest || "").trim().toLowerCase();
  if (passportOk) {
    if (passportSchema !== "outilsia.ai_capability_passport.v1") {
      fail(`${profile}.capability_passport_schema must be outilsia.ai_capability_passport.v1 when capability_passport_ok=true`);
    }
    if (!/^[a-f0-9]{64}$/.test(passportDigest)) {
      fail(`${profile}.capability_passport_digest must be a SHA-256 digest when capability_passport_ok=true`);
    }
  } else if (passportSchema || passportDigest) {
    fail(`${profile}.capability_passport metadata requires capability_passport_ok=true`);
  }

  const readiness = String(entry.runtime_readiness || "untested").trim() || "untested";
  const readinessLabel = String(entry.runtime_readiness_label || "À mesurer").trim() || "À mesurer";
  const executionMode = String(entry.benchmark_execution_mode || "auto").trim().toLowerCase();
  if (!["auto", "cpu"].includes(executionMode)) {
    fail(`${profile}.benchmark_execution_mode must be auto or cpu when present`);
  }
  const processor = String(entry.benchmark_runtime_processor || "unknown").trim().toLowerCase();
  if (!["unknown", "cpu", "gpu", "hybrid"].includes(processor)) {
    fail(`${profile}.benchmark_runtime_processor must be unknown, cpu, gpu or hybrid when present`);
  }
  const offload = Number(entry.benchmark_gpu_offload_percent || 0);
  if (!Number.isFinite(offload) || offload < 0 || offload > 100) {
    fail(`${profile}.benchmark_gpu_offload_percent must be between 0 and 100 when present`);
  }
  const evidenceSource = String(entry.benchmark_runtime_evidence_source || "").trim();
  if (processor !== "unknown" && evidenceSource !== "ollama_api_ps") {
    fail(`${profile}.benchmark_runtime_processor requires benchmark_runtime_evidence_source=ollama_api_ps`);
  }
  if (processor === "cpu" && offload !== 0) {
    fail(`${profile}.benchmark_gpu_offload_percent must be 0 for a CPU runtime`);
  }
  if (processor === "gpu" && offload < 95) {
    fail(`${profile}.benchmark_gpu_offload_percent must be at least 95 for a GPU runtime`);
  }
  if (processor === "hybrid" && (offload <= 0 || offload >= 95)) {
    fail(`${profile}.benchmark_gpu_offload_percent must be between 0 and 95 for a hybrid runtime`);
  }

  return {
    hardware_doctor: doctorSummary,
    capability_passport: {
      available: passportOk,
      schema: passportOk ? passportSchema : "",
      digest: passportOk ? passportDigest : "",
      label: passportOk ? `SHA-256 ${passportDigest.slice(0, 12)}…` : "non généré",
    },
    runtime_evidence: {
      readiness,
      label: readinessLabel,
      execution_mode: executionMode,
      processor,
      gpu_offload_percent: offload,
      source: evidenceSource,
      proven: evidenceSource === "ollama_api_ps" && processor !== "unknown",
    },
  };
}
