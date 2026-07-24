(() => {
  "use strict";

  const invoke = window.__TAURI__?.core?.invoke;
  const CATALOG_SCHEMA = "outilsia.agent_adapter_policy_catalog.v1";
  const EXPECTED_IDS = ["claude-code", "codex-cli", "hermes-agent", "kimi-code"];
  const details = document.getElementById("agentAdapterPolicyDetails");
  const summaryState = document.getElementById("agentAdapterPolicySummary");
  const stateNode = document.getElementById("agentAdapterPolicyState");
  const box = document.getElementById("agentAdapterPolicyBox");
  const loadButton = document.getElementById("loadAgentAdapterPolicyBtn");
  const copyJsonButton = document.getElementById("copyAgentAdapterPolicyJsonBtn");
  const copySummaryButton = document.getElementById("copyAgentAdapterPolicySummaryBtn");

  if (!details || !summaryState || !stateNode || !box || !loadButton) return;

  let catalog = null;
  let busy = false;
  let errorMessage = "";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function falseBoundary(policy, key) {
    return policy?.boundaries?.[key] === false;
  }

  function validateCatalog(value) {
    const policies = Array.isArray(value?.policies) ? value.policies : [];
    const ids = policies.map((policy) => String(policy?.adapter_id || "")).sort();
    const codex = policies.find((policy) => policy?.adapter_id === "codex-cli");
    const restricted = policies.filter((policy) => policy?.adapter_id !== "codex-cli");
    const boundaryKeys = [
      "original_repository_read_authorized",
      "original_repository_write_authorized",
      "board_write_authorized",
      "hidden_suite_access_authorized",
      "credential_access_authorized",
      "merge_authorized",
      "publish_authorized",
      "delivery_authorized",
      "winner_declaration_authorized",
      "raw_worker_output_persisted",
      "personal_paths_returned"
    ];
    if (
      value?.schema !== CATALOG_SCHEMA
      || value?.catalog_kind !== "static_local_policy"
      || !/^[a-f0-9]{64}$/i.test(String(value?.integrity?.digest || ""))
      || JSON.stringify(ids) !== JSON.stringify(EXPECTED_IDS)
      || value?.guarantees?.execution_started !== false
      || value?.guarantees?.machine_probe_started !== false
      || value?.guarantees?.credentials_read !== false
      || value?.guarantees?.network_called !== false
      || value?.guarantees?.repository_scanned !== false
      || value?.guarantees?.policy_is_execution_authorization !== false
      || value?.guarantees?.human_approval_required_before_every_run !== true
      || codex?.current_state !== "bounded_public_pilot"
      || codex?.execution?.enabled !== true
      || codex?.execution?.benchmark_id !== "signal-maze-v1"
      || codex?.execution?.stack_key !== "codex-solo"
      || codex?.budget?.max_attempts !== 1
      || codex?.budget?.max_output_bytes !== 524288
      || JSON.stringify(codex?.budget?.duration_options_seconds) !== JSON.stringify([180, 300, 600])
      || restricted.length !== 3
      || restricted.some((policy) => policy?.current_state !== "detect_only" || policy?.execution?.enabled !== false)
      || policies.some((policy) => boundaryKeys.some((key) => !falseBoundary(policy, key)))
    ) return null;
    return value;
  }

  function policyStateLabel(policy) {
    return policy?.current_state === "bounded_public_pilot"
      ? "Pilote public borné"
      : "Détection seulement";
  }

  function policyStateDetail(policy) {
    if (policy?.current_state === "bounded_public_pilot") {
      const durations = (policy.budget?.duration_options_seconds || [])
        .map((seconds) => `${Math.round(Number(seconds) / 60)} min`)
        .join(" / ");
      const outputKib = Math.round(Number(policy.budget?.max_output_bytes || 0) / 1024);
      return `Signal Maze uniquement · ${policy.budget?.max_attempts || 0} essai · ${durations} · ${outputKib} Kio · coût ou quota inconnu`;
    }
    return "Aucune mission autorisée · contrat d'exécution, budget et frontière workspace encore absents";
  }

  function catalogSummary(value = catalog) {
    if (!value) return "";
    const enabled = value.policies.filter((policy) => policy.execution?.enabled === true);
    const detectOnly = value.policies.filter((policy) => policy.current_state === "detect_only");
    return [
      "# Agent Adapter Policy · OutilsIA",
      "",
      `- Contrat : ${value.schema}`,
      `- Adaptateurs décrits : ${value.policies.length}`,
      `- Pilotes bornés : ${enabled.length}`,
      `- Détection seulement : ${detectOnly.length}`,
      "- Exécution déclenchée par ce registre : non",
      "- Compte, jeton, quota ou coût inspecté : non",
      "- Dépôt, board, suite cachée, merge ou publication autorisé : non",
      "- Consentement humain requis avant chaque run : oui",
      "",
      "## Adaptateurs",
      ...value.policies.map((policy) => `- ${policy.label} : ${policyStateLabel(policy)} · ${policyStateDetail(policy)}`),
      "",
      `SHA-256 : ${value.integrity?.digest || "indisponible"}`
    ].join("\n");
  }

  function render() {
    loadButton.disabled = busy;
    copyJsonButton.disabled = !catalog;
    copySummaryButton.disabled = !catalog;

    if (busy) {
      stateNode.textContent = "lecture locale";
      summaryState.textContent = "vérification…";
      summaryState.dataset.statusTone = "action";
      box.className = "agent-adapter-policy-box empty";
      box.textContent = "Lecture du registre local signé. Aucun agent, compte, réseau ou projet n'est sollicité.";
      return;
    }
    if (errorMessage) {
      stateNode.textContent = "registre refusé";
      summaryState.textContent = "à corriger";
      summaryState.dataset.statusTone = "error";
      box.className = "agent-adapter-policy-box empty";
      box.innerHTML = `<strong>Règles non vérifiées</strong><span>${escapeHtml(errorMessage)}</span>`;
      return;
    }
    if (!catalog) {
      stateNode.textContent = invoke ? "prêt à vérifier" : "app native requise";
      summaryState.textContent = "règles à lire";
      summaryState.dataset.statusTone = "neutral";
      box.className = "agent-adapter-policy-box empty";
      box.textContent = invoke
        ? "Ouvre ce volet pour vérifier ce qu'OutilsIA peut réellement lancer, avec quelles limites."
        : "Le registre signé est disponible dans l'application Windows/Linux.";
      return;
    }

    const rows = catalog.policies.map((policy) => {
      const ready = policy.current_state === "bounded_public_pilot";
      return `
        <div class="agent-adapter-policy-row ${ready ? "bounded" : "detect-only"}">
          <div>
            <strong>${escapeHtml(policy.label)}</strong>
            <span>${escapeHtml(policy.provider)} · CLI officielle</span>
          </div>
          <div>
            <strong>${escapeHtml(policyStateLabel(policy))}</strong>
            <span>${escapeHtml(policyStateDetail(policy))}</span>
          </div>
          <small>${ready ? "consentement par run" : "aucune exécution"}</small>
        </div>
      `;
    }).join("");
    const digest = String(catalog.integrity?.digest || "");
    stateNode.textContent = "registre vérifié";
    summaryState.textContent = "1 pilote · 3 détections";
    summaryState.dataset.statusTone = "ready";
    box.className = "agent-adapter-policy-box";
    box.innerHTML = `
      <div class="agent-adapter-policy-head">
        <strong>Détecté ne veut pas dire autorisé</strong>
        <span>Le registre n'exécute rien. Il borne séparément chaque adaptateur avant tout futur run.</span>
      </div>
      <div class="agent-adapter-policy-list">${rows}</div>
      <div class="agent-adapter-policy-proof">
        Aucun accès au dépôt d'origine, board, suite cachée, credential, merge, publication ou livraison · SHA-256 ${escapeHtml(digest ? `${digest.slice(0, 14)}…${digest.slice(-8)}` : "indisponible")}
      </div>
    `;
  }

  async function loadCatalog() {
    if (!invoke || busy || catalog) {
      render();
      return catalog;
    }
    busy = true;
    errorMessage = "";
    render();
    try {
      const result = await invoke("get_agent_adapter_policy_catalog");
      catalog = validateCatalog(result);
      if (!catalog) throw new Error("réponse native non conforme");
      return catalog;
    } catch (error) {
      catalog = null;
      errorMessage = String(error || "registre indisponible");
      return null;
    } finally {
      busy = false;
      render();
    }
  }

  async function copyText(text, successLabel) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      stateNode.textContent = successLabel;
    } catch (error) {
      stateNode.textContent = "copie impossible";
    }
  }

  details.addEventListener("toggle", () => {
    if (details.open && !catalog && !errorMessage) loadCatalog();
  });
  loadButton.addEventListener("click", loadCatalog);
  copyJsonButton.addEventListener("click", () => copyText(
    catalog ? `${JSON.stringify(catalog, null, 2)}\n` : "",
    "JSON copié"
  ));
  copySummaryButton.addEventListener("click", () => copyText(
    catalogSummary() ? `${catalogSummary()}\n` : "",
    "résumé copié"
  ));

  window.__OUTILSIA_AGENT_ADAPTER_POLICY_TEST__ = {
    applyFixture() {
      catalog = validateCatalog({
        schema: CATALOG_SCHEMA,
        contract_version: "2026-07-24",
        generated_at_ms: Date.now(),
        catalog_kind: "static_local_policy",
        policies: [
          {
            adapter_id: "codex-cli",
            provider: "openai",
            label: "Codex CLI",
            kind: "official_cli",
            current_state: "bounded_public_pilot",
            execution: {
              enabled: true,
              allowed_scopes: ["codex_cli_signal_maze_pilot_v1"],
              benchmark_id: "signal-maze-v1",
              stack_key: "codex-solo"
            },
            budget: { max_attempts: 1, duration_options_seconds: [180, 300, 600], max_output_bytes: 524288 },
            boundaries: Object.fromEntries([
              "original_repository_read_authorized",
              "original_repository_write_authorized",
              "board_write_authorized",
              "hidden_suite_access_authorized",
              "credential_access_authorized",
              "merge_authorized",
              "publish_authorized",
              "delivery_authorized",
              "winner_declaration_authorized",
              "raw_worker_output_persisted",
              "personal_paths_returned"
            ].map((key) => [key, false]))
          },
          {
            adapter_id: "claude-code",
            provider: "anthropic",
            label: "Claude Code",
            kind: "official_cli",
            current_state: "detect_only",
            execution: { enabled: false },
            budget: { max_attempts: 0, duration_options_seconds: [], max_output_bytes: 0 },
            boundaries: {}
          },
          {
            adapter_id: "hermes-agent",
            provider: "nous-research",
            label: "Hermes Agent",
            kind: "official_cli",
            current_state: "detect_only",
            execution: { enabled: false },
            budget: { max_attempts: 0, duration_options_seconds: [], max_output_bytes: 0 },
            boundaries: {}
          },
          {
            adapter_id: "kimi-code",
            provider: "moonshot-ai",
            label: "Kimi Code",
            kind: "official_cli",
            current_state: "detect_only",
            execution: { enabled: false },
            budget: { max_attempts: 0, duration_options_seconds: [], max_output_bytes: 0 },
            boundaries: {}
          }
        ].map((policy) => ({
          ...policy,
          boundaries: Object.fromEntries([
            "original_repository_read_authorized",
            "original_repository_write_authorized",
            "board_write_authorized",
            "hidden_suite_access_authorized",
            "credential_access_authorized",
            "merge_authorized",
            "publish_authorized",
            "delivery_authorized",
            "winner_declaration_authorized",
            "raw_worker_output_persisted",
            "personal_paths_returned"
          ].map((key) => [key, false]))
        })),
        guarantees: {
          execution_started: false,
          machine_probe_started: false,
          credentials_read: false,
          network_called: false,
          repository_scanned: false,
          policy_is_execution_authorization: false,
          human_approval_required_before_every_run: true
        },
        integrity: { digest: "a".repeat(64) }
      });
      errorMessage = "";
      details.open = true;
      render();
      return this.snapshot();
    },
    snapshot() {
      return {
        valid: Boolean(catalog),
        summary: summaryState.textContent,
        state: stateNode.textContent,
        panel: box.textContent,
        policies: catalog?.policies || [],
        markdown: catalogSummary()
      };
    }
  };

  render();
})();
