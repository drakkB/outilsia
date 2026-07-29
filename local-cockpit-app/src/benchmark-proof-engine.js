(function installBenchmarkProofEngine(global) {
  const BENCHMARK_PROTOCOL_SCHEMA = "outilsia.benchmark_protocol.v2";
  const BOTTLENECK_SCHEMA = "outilsia.bottleneck_explainer.v1";
  const PROOF_CARD_SCHEMA = "outilsia.proof_card.v1";
  const STANDARD_QUESTION = "Pourquoi la VRAM est importante pour un LLM local ?";
  const STANDARD_PROMPT = `${STANDARD_QUESTION}\nRéponse finale uniquement, une phrase courte en français.`;
  const DEFAULT_SETTINGS = Object.freeze({
    num_ctx: 2048,
    num_predict: 96,
    seed: 42,
    temperature: 0,
    stream: false,
    think: false,
    keep_alive: "2m"
  });
  const FORBIDDEN_PROOF_KEYS = Object.freeze([
    "machine_key",
    "hostname",
    "host_name",
    "account",
    "email",
    "token",
    "authorization",
    "cookie",
    "path",
    "file_path",
    "ip",
    "user_agent",
    "prompt",
    "output",
    "output_preview",
    "output_text"
  ]);

  function cleanText(value, max = 240) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function boundedInteger(value, fallback, minimum, maximum) {
    const number = Number(value);
    const normalized = Number.isFinite(number) ? Math.trunc(number) : fallback;
    return Math.max(minimum, Math.min(maximum, normalized));
  }

  function nullableNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce((result, key) => {
        result[key] = canonicalValue(value[key]);
        return result;
      }, {});
    }
    return value;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalValue(value));
  }

  function normalizePrompt(value) {
    return String(value || "").replace(/\r\n/g, "\n").trim();
  }

  function standardPromptKind(prompt) {
    const normalized = normalizePrompt(prompt);
    if (normalized === STANDARD_PROMPT) return "outilsia_vram_standard_v1";
    if (normalized === STANDARD_QUESTION) return "outilsia_vram_question_only_v1";
    return "custom";
  }

  function protocolSettings({ benchmark = {}, tuning = {}, force_cpu = false } = {}) {
    const source = benchmark.tuning || tuning || {};
    const numCtx = boundedInteger(source.num_ctx, DEFAULT_SETTINGS.num_ctx, 512, 32_768);
    const settings = {
      ...DEFAULT_SETTINGS,
      num_ctx: numCtx,
      num_predict: boundedInteger(
        benchmark.num_predict,
        DEFAULT_SETTINGS.num_predict,
        1,
        4096
      )
    };
    if (source.num_batch !== null && source.num_batch !== undefined) {
      settings.num_batch = Math.min(
        numCtx,
        boundedInteger(source.num_batch, 32, 32, 1024)
      );
    }
    if (source.num_thread !== null && source.num_thread !== undefined) {
      settings.num_thread = boundedInteger(source.num_thread, 1, 1, 64);
    }
    if (force_cpu || String(benchmark.execution_mode || "") === "cpu") settings.num_gpu = 0;
    return settings;
  }

  function buildBenchmarkProtocol(input = {}) {
    const benchmark = input.benchmark || {};
    const release = input.release || {};
    const prompt = benchmark.prompt || input.prompt || "";
    const promptKind = standardPromptKind(prompt);
    const promptSha256 = cleanText(input.prompt_sha256 || benchmark.prompt_sha256 || "", 64).toLowerCase();
    const exactMeasurement = Boolean(
      benchmark.success
      && String(benchmark.measurement_source || "") === "ollama_api"
      && finiteNumber(benchmark.estimated_tokens_per_second) > 0
    );
    const allocationMeasured = String(benchmark.runtime_evidence_source || "") === "ollama_api_ps"
      && ["gpu", "hybrid", "cpu"].includes(String(benchmark.runtime_processor || "").toLowerCase());
    const runtime = cleanText(input.runtime || benchmark.runtime || "", 32);
    const ollamaVersion = cleanText(input.ollama_version || "", 80);
    const settings = protocolSettings({
      benchmark,
      tuning: input.tuning,
      force_cpu: input.force_cpu
    });
    const bindingComplete = Boolean(
      cleanText(benchmark.model || input.model, 200)
      && /^[0-9a-f]{64}$/.test(promptSha256)
      && runtime
      && ollamaVersion
    );
    const standardComparable = exactMeasurement
      && allocationMeasured
      && promptKind === "outilsia_vram_standard_v1"
      && bindingComplete;
    return {
      schema: BENCHMARK_PROTOCOL_SCHEMA,
      protocol_version: "2.0.0",
      captured_at: input.captured_at || new Date(
        finiteNumber(benchmark.created_at_ms, Date.now())
      ).toISOString(),
      binding: {
        model: cleanText(benchmark.model || input.model, 200),
        prompt_kind: promptKind,
        prompt_sha256: promptSha256,
        runtime,
        ollama_version: ollamaVersion,
        execution_mode: cleanText(benchmark.execution_mode || input.execution_mode || "auto", 24),
        settings
      },
      producer: {
        app_version: cleanText(release.app_version || input.app_version, 40),
        build_id: cleanText(release.build_id || input.build_id, 80),
        source_commit: cleanText(release.source_commit || input.source_commit, 80)
      },
      measurement: {
        exact: exactMeasurement,
        source: cleanText(benchmark.measurement_source || "unavailable", 48),
        success: Boolean(benchmark.success),
        tokens_per_second: finiteNumber(benchmark.estimated_tokens_per_second),
        prompt_tokens_per_second: finiteNumber(benchmark.prompt_tokens_per_second),
        elapsed_ms: finiteNumber(benchmark.elapsed_ms),
        total_duration_ms: finiteNumber(benchmark.total_duration_ms || benchmark.elapsed_ms),
        load_duration_ms: finiteNumber(benchmark.load_duration_ms),
        eval_duration_ms: finiteNumber(benchmark.eval_duration_ms),
        allocation_measured: allocationMeasured,
        runtime_processor: cleanText(benchmark.runtime_processor || "unknown", 24),
        gpu_offload_percent: allocationMeasured
          ? Math.max(0, Math.min(100, finiteNumber(benchmark.runtime_gpu_offload_percent)))
          : null,
        runtime_evidence_source: cleanText(benchmark.runtime_evidence_source, 48)
      },
      eligibility: {
        local_measured_proof: exactMeasurement,
        standard_comparison: standardComparable,
        public_aggregate: standardComparable,
        blockers: [
          !exactMeasurement ? "mesure Ollama API exacte requise" : "",
          promptKind !== "outilsia_vram_standard_v1" ? "prompt standard complet requis" : "",
          !allocationMeasured ? "allocation CPU/GPU Ollama /api/ps requise" : "",
          !bindingComplete ? "liaison modèle/prompt/runtime/version Ollama incomplète" : ""
        ].filter(Boolean)
      },
      semantics: {
        digest_role: "coherence_only",
        identity_verified: false,
        physical_field_proof: false,
        estimated_values_are_proof: false
      }
    };
  }

  function compareBenchmarkProtocols(reference, current) {
    const blockers = [];
    if (reference?.schema !== BENCHMARK_PROTOCOL_SCHEMA || current?.schema !== BENCHMARK_PROTOCOL_SCHEMA) {
      blockers.push("protocole v2 absent");
    }
    const fields = [
      ["model", "modèle différent"],
      ["prompt_sha256", "prompt différent"],
      ["runtime", "runtime différent"],
      ["ollama_version", "version Ollama différente"],
      ["execution_mode", "mode CPU/GPU différent"]
    ];
    for (const [key, label] of fields) {
      if (String(reference?.binding?.[key] || "") !== String(current?.binding?.[key] || "")) blockers.push(label);
    }
    if (canonicalJson(reference?.binding?.settings || {}) !== canonicalJson(current?.binding?.settings || {})) {
      blockers.push("réglages d'exécution différents");
    }
    if (!reference?.measurement?.exact || !current?.measurement?.exact) {
      blockers.push("mesure exacte absente");
    }
    return {
      schema: "outilsia.benchmark_protocol_comparison.v1",
      comparable: blockers.length === 0,
      blockers: [...new Set(blockers)],
      reference_schema: reference?.schema || "legacy",
      current_schema: current?.schema || "legacy"
    };
  }

  function purchaseDecision(key, headline, summary) {
    return { key, headline, summary };
  }

  function explainBottleneck(input = {}) {
    const benchmark = input.benchmark || null;
    const scan = input.scan || {};
    const doctor = input.doctor || {};
    const preflight = input.preflight || null;
    const facts = [];
    const hypotheses = [];
    const unknowns = [];
    const nextTests = [];
    let primary = {
      key: "unknown",
      label: "Goulot non mesuré",
      confidence: "none",
      statement: "Aucune cause matérielle ne peut encore être affirmée."
    };
    let purchase = purchaseDecision(
      "measure_first",
      "Ne rien acheter avant la mesure",
      "Un benchmark exact et son placement CPU/GPU sont nécessaires."
    );

    if (preflight?.verdict === "blocked" && Array.isArray(preflight.blockers) && preflight.blockers.length) {
      primary = {
        key: "storage_capacity",
        label: "Stockage insuffisant mesuré",
        confidence: "high",
        statement: cleanText(preflight.blockers[0], 260)
      };
      facts.push(`Préflight bloqué : ${cleanText(preflight.blockers[0], 260)}`);
      nextTests.push("Libérer ou ajouter du stockage, puis relancer exactement le même préflight.");
      purchase = purchaseDecision(
        "conditional_storage",
        "Stockage utile seulement si ce modèle est nécessaire",
        "Le manque d'espace est mesuré ; aucun autre composant n'est condamné par ce signal."
      );
    } else if (!benchmark) {
      unknowns.push("Débit du modèle non mesuré.");
      unknowns.push("Placement CPU/GPU non mesuré.");
      nextTests.push("Lancer le benchmark standard sur un modèle déjà installé.");
    } else if (!benchmark.success || String(benchmark.measurement_source || "") !== "ollama_api") {
      const error = cleanText(benchmark.error, 300);
      facts.push(benchmark.success
        ? `La méthode ${cleanText(benchmark.measurement_source || "inconnue", 80)} n'est pas une mesure Ollama API exacte.`
        : `Le benchmark a échoué${error ? ` : ${error}` : "."}`);
      if (/cuda|driver|gpu|runtime|ollama|vulkan|rocm/i.test(error)) {
        primary = {
          key: "runtime_backend",
          label: "Chaîne runtime/pilote à vérifier",
          confidence: "medium",
          statement: "L'échec pointe vers la chaîne d'exécution, pas vers un manque de puissance prouvé."
        };
        hypotheses.push("Le backend GPU, le pilote ou Ollama peut empêcher l'exécution attendue.");
        nextTests.push("Vérifier Runtime & Driver Intelligence, puis retester le même modèle en mode automatique.");
      } else {
        nextTests.push("Relancer le même benchmark jusqu'à obtenir les métriques exactes Ollama API.");
      }
      unknowns.push("Aucun goulot matériel n'est prouvé par un test échoué ou estimé.");
    } else {
      const tps = finiteNumber(benchmark.estimated_tokens_per_second);
      const allocationMeasured = String(benchmark.runtime_evidence_source || "") === "ollama_api_ps";
      const processor = cleanText(benchmark.runtime_processor || "unknown", 24).toLowerCase();
      const offload = allocationMeasured
        ? Math.max(0, Math.min(100, finiteNumber(benchmark.runtime_gpu_offload_percent)))
        : null;
      facts.push(`Débit Ollama API mesuré : ${tps} tok/s.`);
      if (finiteNumber(benchmark.prompt_tokens_per_second) > 0) {
        facts.push(`Préremplissage mesuré : ${finiteNumber(benchmark.prompt_tokens_per_second)} tok/s.`);
      }
      if (finiteNumber(benchmark.load_duration_ms) > 0) {
        facts.push(`Chargement mesuré : ${finiteNumber(benchmark.load_duration_ms)} ms.`);
      }
      if (!allocationMeasured || !["gpu", "hybrid", "cpu"].includes(processor)) {
        primary = {
          key: "allocation_unknown",
          label: "Placement CPU/GPU inconnu",
          confidence: "low",
          statement: "La vitesse est réelle, mais elle ne permet pas d'attribuer le goulot sans /api/ps."
        };
        unknowns.push("Part du modèle réellement placée en VRAM.");
        nextTests.push("Relancer le benchmark avec Ollama /api/ps disponible.");
      } else {
        facts.push(`Placement Ollama mesuré : ${processor} · ${offload} % GPU.`);
        if (processor === "cpu" || offload === 0) {
          if (finiteNumber(scan.vram_gb) > 0) {
            primary = {
              key: "runtime_backend",
              label: "GPU détecté mais non utilisé",
              confidence: "high",
              statement: "Le modèle a tourné en CPU/RAM alors qu'un GPU dédié est détecté."
            };
            hypotheses.push("Le backend, le pilote ou le runtime sélectionné peut empêcher l'accélération GPU.");
            nextTests.push("Vérifier le runtime exact et le pilote, puis comparer avec un retest CPU explicite.");
          } else {
            primary = {
              key: "cpu_execution",
              label: "Exécution CPU mesurée",
              confidence: "high",
              statement: "Le modèle n'utilise pas de VRAM dédiée sur cette mesure."
            };
            unknowns.push("Le gain d'un autre modèle plus léger n'a pas encore été comparé.");
            nextTests.push("Comparer un modèle plus léger avant d'envisager du matériel.");
          }
        } else if (processor === "hybrid" && offload < 70) {
          primary = {
            key: "vram_capacity",
            label: "Capacité VRAM probablement limitante",
            confidence: "medium",
            statement: `Seulement ${offload} % du modèle est placé sur le GPU ; l'offload RAM est important.`
          };
          hypotheses.push("La capacité VRAM est une cause probable de la dépendance à la RAM pour ce modèle précis.");
          nextTests.push("Comparer le même protocole avec un modèle plus petit entièrement placé en VRAM.");
          purchase = purchaseDecision(
            "conditional_vram",
            "Plus de VRAM seulement pour conserver ce modèle",
            "Teste d'abord un modèle plus petit ; l'achat n'est justifié que si ce palier de modèle est nécessaire."
          );
        } else if (processor === "hybrid" && offload < 95) {
          primary = {
            key: "vram_headroom",
            label: "Marge VRAM réduite",
            confidence: "medium",
            statement: `${offload} % du modèle est placé sur le GPU ; une petite part dépend encore de la RAM.`
          };
          hypotheses.push("La VRAM peut limiter la marge de contexte ou la régularité, sans prouver un achat utile.");
          nextTests.push("Comparer au même protocole un modèle entièrement placé en VRAM.");
        } else {
          primary = {
            key: "no_observed_hardware_bottleneck",
            label: "Aucun goulot matériel prouvé",
            confidence: "high",
            statement: "Le modèle testé est entièrement ou presque entièrement placé sur le GPU."
          };
          purchase = purchaseDecision(
            "no_buy",
            "Aucun achat prioritaire",
            "Cette mesure ne montre pas de manque de VRAM pour le modèle testé."
          );
          nextTests.push("Comparer un second modèle avec exactement le même protocole avant de changer le matériel.");
        }
      }
    }

    const gpuProbe = scan.raw_scan?.gpu_probe || {};
    const thermalThrottling = gpuProbe.thermal_throttling === true
      || gpuProbe.throttling === true
      || String(gpuProbe.throttle_reason || "").toLowerCase().includes("thermal");
    if (thermalThrottling) {
      facts.push("Le système expose explicitement un signal de throttling thermique.");
      if (primary.key === "no_observed_hardware_bottleneck" || primary.key === "unknown") {
        primary = {
          key: "thermal_throttling",
          label: "Throttling thermique signalé",
          confidence: "high",
          statement: "Le signal système indique une limitation thermique explicite."
        };
        purchase = purchaseDecision(
          "cooling_before_compute",
          "Corriger le refroidissement avant tout upgrade de calcul",
          "Le signal thermique doit être résolu et remesuré avant achat."
        );
      }
    } else if (finiteNumber(doctor?.gpu?.temperature_c || gpuProbe.temperature_c) > 0) {
      unknowns.push("Une température instantanée seule ne prouve pas un throttling.");
    }
    if (scan.raw_scan?.memory_probe?.module_count > 1) {
      unknowns.push("Plusieurs modules RAM ne prouvent pas le dual channel ni un goulot de bande passante.");
    }

    return {
      schema: BOTTLENECK_SCHEMA,
      generated_at: input.generated_at || new Date().toISOString(),
      primary,
      facts: [...new Set(facts)],
      hypotheses: [...new Set(hypotheses)],
      unknowns: [...new Set(unknowns)],
      next_tests: [...new Set(nextTests)].slice(0, 4),
      purchase,
      semantics: {
        facts_are_measured_or_observed: true,
        hypotheses_are_not_proof: true,
        unknown_is_not_failure: true,
        temperature_alone_is_not_throttling_proof: true,
        module_count_is_not_channel_proof: true
      }
    };
  }

  function broadOsLabel(scan = {}) {
    const text = cleanText(scan.os_name || scan.os || "", 80);
    if (/windows/i.test(text)) return "Windows";
    if (/linux|ubuntu|debian|fedora/i.test(text)) return "Linux";
    if (/mac|darwin/i.test(text)) return "macOS";
    return text || "OS non précisé";
  }

  function exactShareUrl(value) {
    const url = cleanText(value, 500);
    return /^https:\/\/outilsia\.fr\/r\/[A-Za-z0-9_-]+$/.test(url) ? url : "";
  }

  function buildProofCard(input = {}) {
    const protocol = input.protocol || {};
    const benchmark = input.benchmark || {};
    const scan = input.scan || {};
    const bottleneck = input.bottleneck || explainBottleneck({ scan, benchmark });
    if (!protocol?.eligibility?.local_measured_proof) return null;
    if (cleanText(protocol.binding?.model, 160) !== cleanText(benchmark.model, 160)) return null;
    if (
      Math.abs(
        finiteNumber(protocol.measurement?.tokens_per_second)
        - finiteNumber(benchmark.estimated_tokens_per_second)
      ) > 0.01
    ) return null;
    const standard = Boolean(protocol.eligibility.standard_comparison);
    return {
      schema: PROOF_CARD_SCHEMA,
      card_version: "1.0.0",
      generated_at: input.generated_at || protocol.captured_at || new Date().toISOString(),
      badge: {
        key: standard ? "standard_measured" : "local_measured",
        label: standard ? "Protocole standard mesuré" : "Mesure locale OutilsIA",
        verified: false,
        verification_label: "Mesuré localement · identité non attestée"
      },
      headline: `${cleanText(benchmark.model, 160)} · ${finiteNumber(benchmark.estimated_tokens_per_second)} tok/s`,
      machine: {
        cpu: cleanText(scan.cpu_name, 160),
        ram_gb: nullableNumber(scan.ram_gb),
        gpu: cleanText(scan.gpu_name || scan.gpu, 160),
        vram_gb: nullableNumber(scan.vram_gb),
        unified_memory: Boolean(scan.unified_memory),
        os: broadOsLabel(scan)
      },
      model: {
        ref: cleanText(benchmark.model, 160),
        runtime: cleanText(protocol.binding?.runtime || benchmark.runtime, 32),
        ollama_version: cleanText(protocol.binding?.ollama_version, 80)
      },
      measurement: {
        measured_at: cleanText(protocol.captured_at || input.measured_at, 48),
        tokens_per_second: finiteNumber(benchmark.estimated_tokens_per_second),
        prompt_tokens_per_second: finiteNumber(benchmark.prompt_tokens_per_second),
        elapsed_ms: finiteNumber(benchmark.elapsed_ms),
        load_duration_ms: finiteNumber(benchmark.load_duration_ms),
        runtime_processor: cleanText(benchmark.runtime_processor || "unknown", 24),
        gpu_offload_percent: protocol.measurement?.allocation_measured
          ? nullableNumber(benchmark.runtime_gpu_offload_percent)
          : null,
        source: "ollama_api",
        measured: true
      },
      protocol: {
        schema: protocol.schema,
        version: protocol.protocol_version,
        prompt_kind: protocol.binding?.prompt_kind || "custom",
        prompt_sha256: protocol.binding?.prompt_sha256 || "",
        settings: protocol.binding?.settings || {},
        public_aggregate_eligible: Boolean(protocol.eligibility?.public_aggregate)
      },
      diagnosis: {
        primary_key: bottleneck.primary?.key || "unknown",
        label: bottleneck.primary?.label || "Goulot non mesuré",
        confidence: bottleneck.primary?.confidence || "none",
        statement: bottleneck.primary?.statement || "",
        purchase: bottleneck.purchase || purchaseDecision(
          "measure_first",
          "Mesurer avant achat",
          "Aucun achat n'est déduit automatiquement."
        )
      },
      producer: {
        name: "OutilsIA Local Cockpit",
        app_version: cleanText(protocol.producer?.app_version, 40),
        build_id: cleanText(protocol.producer?.build_id, 80),
        source_commit: cleanText(protocol.producer?.source_commit, 80)
      },
      links: {
        shared_report: exactShareUrl(input.share_url),
        product: "https://outilsia.fr/telecharger-scanner-ia-local"
      },
      privacy: {
        raw_prompt_included: false,
        raw_output_included: false,
        machine_identifier_included: false,
        account_identifier_included: false,
        personal_path_included: false,
        ip_address_included: false
      },
      assurance: {
        physical_field_proof: false,
        identity_verified: false,
        local_measurement_exact: true,
        digest_semantics: "coherence_only",
        verification_semantics: "coherence_not_provenance",
        revocable_public_link: Boolean(exactShareUrl(input.share_url))
      },
      limitations: [
        "Cette carte décrit une mesure locale ponctuelle, pas une garantie de performance permanente.",
        "Le checksum éventuel prouve la cohérence du JSON, jamais l'identité du PC ou de son propriétaire.",
        standard
          ? "La comparaison publique reste soumise aux contrôles serveur et au seuil de cohorte."
          : "Un prompt personnalisé n'est pas éligible aux comparaisons publiques standard."
      ]
    };
  }

  function proofCardPrivacyAudit(card) {
    const violations = [];
    function walk(value, path = []) {
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, [...path, String(index)]));
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        const normalized = key.toLowerCase();
        if (FORBIDDEN_PROOF_KEYS.some((forbidden) => normalized === forbidden || normalized.endsWith(`_${forbidden}`))) {
          violations.push([...path, key].join("."));
        }
        walk(nested, [...path, key]);
      }
    }
    walk(card);
    const serialized = canonicalJson(card || {});
    for (const marker of Array.isArray(arguments[1]) ? arguments[1] : []) {
      if (marker && serialized.includes(String(marker))) violations.push(`content:${marker}`);
    }
    return {
      ok: violations.length === 0,
      violations: [...new Set(violations)]
    };
  }

  global.__OUTILSIA_BENCHMARK_PROOF_ENGINE__ = Object.freeze({
    BENCHMARK_PROTOCOL_SCHEMA,
    BOTTLENECK_SCHEMA,
    PROOF_CARD_SCHEMA,
    STANDARD_QUESTION,
    STANDARD_PROMPT,
    DEFAULT_SETTINGS,
    buildBenchmarkProtocol,
    compareBenchmarkProtocols,
    explainBottleneck,
    buildProofCard,
    proofCardPrivacyAudit,
    canonicalJson
  });
})(globalThis);
