export const USAGES = [
  "polyvalent",
  "assistant",
  "code",
  "francais",
  "portable",
  "image",
  "gros_modeles",
];

const STATUS_SCORE = {
  rapide: 50,
  ok: 34,
  lent: 16,
  non: -100,
};

const USAGE_TERMS = {
  polyvalent: ["qwen", "gemma", "mistral", "llama", "hermes"],
  assistant: ["hermes", "mistral", "llama", "gemma", "qwen"],
  code: ["ornith", "coder", "code", "deepseek", "qwen"],
  francais: ["mistral", "qwen", "hermes", "gemma"],
  portable: ["mini", "0.6b", "1b", "3b", "4b", "7b", "8b", "phi"],
  image: ["flux", "sdxl", "stable diffusion", "image"],
  gros_modeles: ["32b", "70b", "72b", "27b", "24b", "glm", "qwen"],
};

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function modelIdentity(model) {
  return `${model?.name || ""} ${model?.params || ""} ${model?.category || ""} ${model?.ollama || ""}`.toLowerCase();
}

function isMediaModel(model) {
  return /(image|video|audio|flux|sdxl|stable diffusion|whisper)/i.test(modelIdentity(model));
}

function modelRank(model, usage) {
  const identity = modelIdentity(model);
  const status = String(model?.status || "").toLowerCase();
  let score = STATUS_SCORE[status] ?? 0;
  const terms = USAGE_TERMS[usage] || USAGE_TERMS.polyvalent;
  terms.forEach((term, index) => {
    if (identity.includes(term)) score += Math.max(15 - index * 2, 4);
  });
  if (model?.ollama) score += 8;
  const vram = finiteNumber(model?.vram_q4);
  if (usage === "portable") score -= vram * 1.5;
  else if (usage !== "image") score += Math.min(vram, 18) * 0.7;
  return score;
}

function modelReason(model, usage) {
  const status = String(model?.label || model?.status || "compatible");
  const command = model?.ollama ? `Commande Ollama disponible : ${model.ollama}.` : "Runtime à confirmer.";
  const reasons = {
    assistant: "Profil conversation, synthèse et décisions.",
    code: "Profil code, debug ou raisonnement technique.",
    francais: "Bon candidat pour des réponses naturelles en français.",
    portable: "Priorité à une empreinte mémoire limitée.",
    image: "Profil génération d'images adapté au matériel déclaré.",
    gros_modeles: "Candidat ambitieux à valider par un benchmark réel.",
    polyvalent: "Bon compromis pour commencer sans surdimensionner.",
  };
  return `${status}. ${reasons[usage] || reasons.polyvalent} ${command}`;
}

function compactModel(model, usage) {
  return {
    name: String(model?.name || "Modèle inconnu"),
    params: String(model?.params || ""),
    status: String(model?.status || ""),
    label: String(model?.label || model?.status || ""),
    vram_q4_gb: finiteNumber(model?.vram_q4),
    ollama: String(model?.ollama || ""),
    reason: modelReason(model, usage),
  };
}

function pickRecommendedModels(compatible, usage, limit = 4) {
  const models = Array.isArray(compatible) ? compatible : [];
  const filtered = models.filter((model) => {
    if (String(model?.status || "").toLowerCase() === "non") return false;
    return usage === "image" ? isMediaModel(model) : !isMediaModel(model);
  });
  const pool = filtered.length ? filtered : models;
  return [...pool]
    .sort((a, b) => modelRank(b, usage) - modelRank(a, usage))
    .slice(0, limit)
    .map((model) => compactModel(model, usage));
}

function pickBenchmark(machine, recommendedModels) {
  const benchmarks = [
    ...(Array.isArray(machine?.benchmarks) ? machine.benchmarks : []),
    ...(Array.isArray(machine?.benchmark_history) ? machine.benchmark_history : []),
  ].filter((item) => item && item.success !== false && finiteNumber(item.tokens_per_second) > 0);
  if (!benchmarks.length) return null;
  const refs = recommendedModels.map((model) => model.ollama || model.name).filter(Boolean);
  const preferred = benchmarks.find((item) => {
    const name = String(item.model_name || item.model || "").toLowerCase();
    return refs.some((ref) => name.includes(String(ref).toLowerCase()));
  });
  const best = preferred || [...benchmarks].sort(
    (a, b) => finiteNumber(b.tokens_per_second) - finiteNumber(a.tokens_per_second),
  )[0];
  return {
    model: String(best.model_name || best.model || "modèle local"),
    tokens_per_second: Math.round(finiteNumber(best.tokens_per_second) * 10) / 10,
    elapsed_ms: Math.max(0, Math.round(finiteNumber(best.elapsed_ms))),
    measured: true,
  };
}

function compactMachine(machine) {
  return {
    cpu: String(machine?.cpu_name || "CPU non renseigné"),
    cpu_cores: Math.max(0, Math.round(finiteNumber(machine?.cpu_cores))),
    ram_gb: Math.max(0, Math.round(finiteNumber(machine?.ram_gb) * 10) / 10),
    gpu: String(machine?.gpu_name || "GPU non renseigné"),
    gpu_vendor: String(machine?.gpu_vendor || machine?.gpu_category || ""),
    vram_gb: Math.max(0, Math.round(finiteNumber(machine?.vram_gb) * 10) / 10),
    unified_memory: Boolean(machine?.unified_memory),
    storage_free_gb: Math.max(0, Math.round(finiteNumber(machine?.storage_free_gb))),
    os: String(machine?.os_name || "OS non renseigné"),
  };
}

function compactUpgrade(upgrade) {
  if (!upgrade) return null;
  return {
    name: String(upgrade.name || upgrade.title || "Upgrade à étudier"),
    summary: String(upgrade.summary || upgrade.description || upgrade.why || ""),
    target_vram_gb: finiteNumber(upgrade.target_vram_gb || upgrade.vram_gb),
    target_ram_gb: finiteNumber(upgrade.target_ram_gb || upgrade.ram_gb),
    price: String(upgrade.price || upgrade.price_range || upgrade.price_hint || ""),
    guide_url: String(upgrade.guide_url || upgrade.url || ""),
  };
}

function compactBlocked(model) {
  return {
    name: String(model?.name || "Modèle"),
    params: String(model?.params || ""),
    required_vram_gb: finiteNumber(model?.vram_q4),
    reason: String(model?.reason || model?.limit || "Matériel insuffisant selon le catalogue OutilsIA."),
  };
}

function safeLink(label, url, kind = "guide") {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://outilsia.fr");
    if (parsed.protocol !== "https:" || !["outilsia.fr", "www.outilsia.fr"].includes(parsed.hostname)) return null;
    return { label, url: parsed.href, kind };
  } catch {
    return null;
  }
}

function buildLinks(reportUrl) {
  return [
    safeLink("Télécharger Local Cockpit", "https://outilsia.fr/telecharger-scanner-ia-local", "download"),
    safeLink("Scanner et comparer", "https://outilsia.fr/scanner-ia-local", "scanner"),
    reportUrl ? safeLink("Ouvrir le rapport complet", reportUrl, "report") : null,
  ].filter(Boolean);
}

function scorePayload(compatibility) {
  const score = compatibility?.score || {};
  return {
    value: Math.max(0, Math.min(100, Math.round(finiteNumber(score.score)))),
    label: String(score.label || ""),
    summary: String(score.summary || ""),
  };
}

export function buildCompatibilityDecision(payload, {
  usage = "polyvalent",
  sourceKind = "declared_profile",
  reportUrl = "",
} = {}) {
  const machine = payload?.machine || {};
  const compatibility = payload?.compatibility || machine?.compatibility || {};
  const score = scorePayload(compatibility);
  const recommendedModels = pickRecommendedModels(compatibility.compatible, usage);
  const benchmarkEvidence = pickBenchmark(machine, recommendedModels);
  const primaryUpgrade = compactUpgrade((compatibility.upgrades || [])[0]);
  const alreadyComfortable = score.value >= 75 && usage !== "gros_modeles" && recommendedModels.length > 0;
  const noPurchase = alreadyComfortable || !primaryUpgrade;
  const purchase = noPurchase
    ? {
        priority: "none",
        headline: "Aucun achat prioritaire",
        summary: alreadyComfortable
          ? "La machine déclarée couvre déjà un usage local utile. Testez d'abord un modèle recommandé."
          : "Le catalogue ne justifie pas d'achat précis avec les informations fournies.",
        upgrade: primaryUpgrade,
      }
    : {
        priority: "useful",
        headline: primaryUpgrade.name,
        summary: primaryUpgrade.summary || "Cet upgrade élargit les modèles accessibles selon le catalogue OutilsIA.",
        upgrade: primaryUpgrade,
      };
  const sourceLabel = sourceKind === "shared_report"
    ? "rapport OutilsIA partagé"
    : "profil matériel déclaré dans la conversation";
  const verdict = recommendedModels.length
    ? `${recommendedModels[0].name} est le premier modèle à tester pour l'usage ${usage}.`
    : "Aucun modèle textuel n'est recommandé sans mesure complémentaire.";

  return {
    schema_version: "outilsia.chatgpt.decision.v1",
    decision_type: "compatibility",
    title: "Compatibilité IA locale",
    verdict,
    usage,
    source: {
      kind: sourceKind,
      label: sourceLabel,
      is_real_scan: sourceKind === "shared_report",
    },
    machine: compactMachine(machine),
    score,
    recommended_models: recommendedModels,
    benchmark_evidence: benchmarkEvidence,
    purchase,
    blocked_next: (compatibility.blocked_next || []).slice(0, 3).map(compactBlocked),
    links: buildLinks(reportUrl),
    limits: [
      sourceKind === "shared_report"
        ? "Le rapport reflète les données partagées par Local Cockpit; il ne donne aucun accès à la machine."
        : "Ceci est une estimation déclarative, pas un scan du PC.",
      benchmarkEvidence
        ? "La vitesse affichée provient d'un benchmark sauvegardé."
        : "Aucune vitesse n'est inventée : lancez Local Cockpit pour mesurer les tokens/s.",
      "L'installation et le benchmark restent des actions locales explicites dans l'application desktop.",
    ],
  };
}

function modelKey(model) {
  return `${model?.name || ""}|${model?.params || ""}|${model?.ollama || ""}`.toLowerCase();
}

export function buildUpgradeDecision(beforePayload, afterPayload, {
  usage = "polyvalent",
  targetRamGb = 0,
  targetVramGb = 0,
} = {}) {
  const before = buildCompatibilityDecision(beforePayload, { usage });
  const after = buildCompatibilityDecision(afterPayload, { usage });
  const beforeModels = new Set((beforePayload?.compatibility?.compatible || []).map(modelKey));
  const unlockedModels = (afterPayload?.compatibility?.compatible || [])
    .filter((model) => !beforeModels.has(modelKey(model)))
    .slice(0, 8)
    .map((model) => compactModel(model, usage));
  const scoreGain = after.score.value - before.score.value;
  const useful = scoreGain >= 5 || unlockedModels.length > 0;

  return {
    ...after,
    decision_type: "upgrade_simulation",
    title: "Simulation d'upgrade IA locale",
    verdict: useful
      ? `Gain estimé : +${scoreGain} point(s), ${unlockedModels.length} nouveau(x) modèle(s) accessible(s).`
      : "Cet upgrade ne débloque pas de gain assez net dans le catalogue actuel.",
    source: {
      kind: "upgrade_simulation",
      label: "simulation déterministe OutilsIA, sans modification du PC",
      is_real_scan: false,
    },
    baseline_score: before.score,
    score_gain: scoreGain,
    simulated_target: {
      ram_gb: targetRamGb || after.machine.ram_gb,
      vram_gb: targetVramGb || after.machine.vram_gb,
    },
    unlocked_models: unlockedModels,
    purchase: useful
      ? {
          priority: "consider",
          headline: "Upgrade à considérer après benchmark",
          summary: "Le gain est théorique. Mesurez d'abord la machine actuelle avant tout achat.",
          upgrade: after.purchase.upgrade,
        }
      : {
          priority: "none",
          headline: "Achat non justifié",
          summary: "La simulation ne montre pas de gain matériel suffisant pour recommander cet achat.",
          upgrade: null,
        },
    limits: [
      "Simulation basée sur les règles VRAM/RAM du catalogue, pas sur un benchmark du matériel cible.",
      "Les performances réelles dépendent du runtime, de la quantification, du contexte et des pilotes.",
      "Aucun achat n'est effectué depuis ChatGPT.",
    ],
  };
}

export function decisionText(decision) {
  const model = decision.recommended_models?.[0];
  const proof = decision.benchmark_evidence
    ? ` Preuve : ${decision.benchmark_evidence.model} à ${decision.benchmark_evidence.tokens_per_second} tok/s.`
    : " Aucun tokens/s réel n'est disponible.";
  return `${decision.verdict} Score ${decision.score.value}/100. ${
    model?.ollama ? `Commande suggérée : ollama run ${model.ollama}.` : ""
  } ${decision.purchase.headline}.${proof} Utilisez render_machine_cockpit pour afficher la fiche visuelle.`;
}
