#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_PROFILES } from "./import-field-tests.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const releasePath = join(repoRoot, "server-work", "static", "downloads", "local-cockpit", "release.json");
const modelCatalogPath = join(repoRoot, "server-work", "static", "data", "local-ai-models.json");
function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage:
  node scripts/make-field-test-kit.mjs [--kit-dir <path>] [--zip-dir <path>] [--wsl-distro <name>]

Defaults keep the field kit on the Windows Desktop. Use --kit-dir for scratch/test
generation without writing Desktop artifacts.`);
  process.exit(0);
}

const desktopRoot = existsSync("/mnt/c/Users/chris/Desktop") ? "/mnt/c/Users/chris/Desktop" : join(process.env.HOME || ".", "Desktop");
const defaultKitDir = join(desktopRoot, "OutilsIA-Local-Cockpit-Field-Test-Kit");
const kitDir = resolve(argValue("--kit-dir") || process.env.OUTILSIA_FIELD_KIT_DIR || defaultKitDir);
const zipRoot = resolve(argValue("--zip-dir") || process.env.OUTILSIA_FIELD_ZIP_DIR || desktopRoot);
const wslDistro = argValue("--wsl-distro") || process.env.OUTILSIA_WSL_DISTRO || "";
const wslRepoRoot = process.env.OUTILSIA_WSL_REPO_ROOT || "/home/chris/projects/outilsia";
const entriesDir = join(kitDir, "entries");
const fieldTestsJsonPath = join(kitDir, "FIELD-TESTS.json");
const fieldStatusJsonPath = join(kitDir, "FIELD-TESTS-STATUS.json");
const PROFILE_GUIDES = {
  old_laptop: {
    title: "Vieux laptop / portable modeste",
    target: "Portable ancien, iGPU ou petit GPU, RAM limitée.",
    goal: "Vérifier que l'app reste encourageante et recommande un modèle léger sans démoraliser.",
    expected: "Score bas à moyen, modèle léger, upgrade utile clair, benchmark court si Ollama fonctionne.",
    expected_score: "20-55/100 selon RAM, CPU et éventuel iGPU.",
    expected_models: ["qwen3:0.6b", "phi4-mini", "llama3.2:3b", "gemma3:4b"],
    benchmark_target: "Un petit modèle doit donner une mesure tokens/s, même si elle est modeste.",
    upgrade_signal: "GPU dédié ou RAM selon le blocage réel, sans message démoralisant.",
    must_confirm: ["message encourageant", "modèle léger", "benchmark court", "upgrade réaliste"],
    pitfalls: ["ne pas recommander un gros 14B comme première action", "ne pas masquer le mode CPU"],
  },
  core_i7_gtx_1080_ti: {
    title: "Core i7 + GTX 1080 Ti 11 Go",
    target: "Vieux PC encore solide avec GTX 1080 Ti 11 Go VRAM.",
    goal: "Prouver que la 1080 Ti reste un bon ticket d'entrée IA locale.",
    expected: "Modeles 7B/8B/14B quantifiés, benchmark réel, upgrade 24 Go VRAM si besoin gros LLM.",
    expected_score: "55-75/100 selon RAM et état Ollama.",
    expected_models: ["qwen3:8b", "llama3.1:8b", "mistral:7b", "qwen3:14b"],
    benchmark_target: "Comparer un modèle léger puis un 7B/8B utilisable.",
    upgrade_signal: "24 Go VRAM seulement si l'utilisateur vise 32B+ ou gros contexte.",
    must_confirm: ["11 Go VRAM reconnue", "7B/8B proposés", "message 1080 Ti encore utile", "upgrade non agressif"],
    pitfalls: ["ne pas la classer comme machine dépassée", "ne pas pousser RTX 4090 comme seule solution"],
  },
  rtx_3060_12gb: {
    title: "RTX 3060 12 Go",
    target: "Machine grand public RTX 3060 12 Go.",
    goal: "Valider la recommandation phare budget IA locale.",
    expected: "Très bon profil 7B-14B, rapport partageable et upgrade non agressif.",
    expected_score: "65-80/100 selon CPU/RAM.",
    expected_models: ["qwen3:8b", "qwen3:14b", "mistral-nemo:12b", "hermes3:8b"],
    benchmark_target: "Un 8B ou 14B quantifié doit être testable ou clairement proposé.",
    upgrade_signal: "24 Go VRAM pour gros LLM, pas pour débuter.",
    must_confirm: ["12 Go VRAM reconnue", "7B-14B confortables", "rapport partageable", "shopping list raisonnable"],
    pitfalls: ["ne pas proposer uniquement qwen3:0.6b", "ne pas sur-vendre les 70B"],
  },
  rtx_4080_4090: {
    title: "RTX 4080 / RTX 4090",
    target: "Grosse machine récente NVIDIA.",
    goal: "Vérifier que l'app ne se limite pas au petit modèle et propose un second modèle utile.",
    expected: "Score élevé, modèles avancés compatibles, Arena avec assistant/code/mémoire, rapport propre.",
    expected_score: "80-95/100 selon VRAM 16/24 Go.",
    expected_models: ["hermes3:8b", "qwen3:14b", "mistral-nemo:12b", "deepseek-r1:14b"],
    benchmark_target: "Le modèle léger ne doit pas être la seule preuve; un second modèle doit être comparé.",
    upgrade_signal: "24 Go VRAM utile pour RTX 4080 si gros LLM; moins prioritaire pour RTX 4090.",
    must_confirm: ["GPU haut de gamme reconnu", "second modèle utile", "Arena par rôles", "rapport PDF/partage propre"],
    pitfalls: ["ne pas rester bloqué sur le modèle test 0.6B", "ne pas confondre benchmark léger et recommandation finale"],
  },
  cpu_only: {
    title: "Machine CPU-only",
    target: "PC sans GPU dédié exploitable.",
    goal: "Prouver que l'app donne un chemin réaliste sans vendre du rêve.",
    expected: "Petit modèle CPU, message honnête, upgrade GPU/RAM pertinent, pas de promesse gros LLM.",
    expected_score: "10-45/100 selon RAM et CPU.",
    expected_models: ["qwen3:0.6b", "phi4-mini", "llama3.2:3b"],
    benchmark_target: "Un petit modèle CPU doit être possible ou l'app doit expliquer le blocage.",
    upgrade_signal: "GPU dédié en priorité si usage LLM sérieux; RAM seulement si le CPU reste exploitable.",
    must_confirm: ["CPU-only assumé", "pas de gros modèle conseillé", "message honnête", "upgrade priorisé"],
    pitfalls: ["ne pas afficher de VRAM fantôme", "ne pas proposer Flux/SDXL comme action chat"],
  },
};

const FIELD_ENRICHMENT_POWERSHELL = String.raw`
function Test-EnrichedEvidence($entry) {
  $result = @{
    error = ""
    doctor = "non exporte"
    doctor_available = $false
    runtime = if ($entry.runtime_readiness_label) { [string]$entry.runtime_readiness_label } else { "a mesurer" }
    runtime_proven = $false
    passport = "non genere"
    passport_available = $false
  }
  $doctorProperty = $entry.PSObject.Properties["hardware_doctor"]
  if ($doctorProperty -and $doctorProperty.Value) {
    $doctor = $doctorProperty.Value
    if ([string]$doctor.schema -ne "outilsia.hardware_doctor.v2") {
      $result.error = "hardware_doctor.schema invalide"
      return $result
    }
    $doctorScore = 0.0
    if (![double]::TryParse([string]$doctor.score, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$doctorScore) -or $doctorScore -lt 0 -or $doctorScore -gt 100) {
      $result.error = "hardware_doctor.score invalide"
      return $result
    }
    $result.doctor = "$doctorScore/100"
    $result.doctor_available = $true
  }

  $passportOk = $entry.capability_passport_ok -eq $true
  $passportSchema = [string]$entry.capability_passport_schema
  $passportDigest = ([string]$entry.capability_passport_digest).Trim().ToLowerInvariant()
  if ($passportOk) {
    if ($passportSchema -ne "outilsia.ai_capability_passport.v1") {
      $result.error = "capability_passport_schema invalide"
      return $result
    }
    if ($passportDigest -notmatch "^[a-f0-9]{64}$") {
      $result.error = "capability_passport_digest invalide"
      return $result
    }
    $result.passport = "SHA-256 $($passportDigest.Substring(0, 12))..."
    $result.passport_available = $true
  } elseif (![string]::IsNullOrWhiteSpace($passportSchema) -or ![string]::IsNullOrWhiteSpace($passportDigest)) {
    $result.error = "metadonnees Passport presentes sans capability_passport_ok"
    return $result
  }

  $executionMode = if ($entry.benchmark_execution_mode) { ([string]$entry.benchmark_execution_mode).ToLowerInvariant() } else { "auto" }
  if (@("auto", "cpu") -notcontains $executionMode) {
    $result.error = "benchmark_execution_mode invalide"
    return $result
  }
  $processor = if ($entry.benchmark_runtime_processor) { ([string]$entry.benchmark_runtime_processor).ToLowerInvariant() } else { "unknown" }
  if (@("unknown", "cpu", "gpu", "hybrid") -notcontains $processor) {
    $result.error = "benchmark_runtime_processor invalide"
    return $result
  }
  $source = [string]$entry.benchmark_runtime_evidence_source
  $offload = 0.0
  if ($entry.PSObject.Properties["benchmark_gpu_offload_percent"]) {
    if (![double]::TryParse([string]$entry.benchmark_gpu_offload_percent, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$offload) -or $offload -lt 0 -or $offload -gt 100) {
      $result.error = "benchmark_gpu_offload_percent invalide"
      return $result
    }
  }
  if ($processor -ne "unknown") {
    if ($source -ne "ollama_api_ps") {
      $result.error = "preuve runtime sans source ollama_api_ps"
      return $result
    }
    if ($processor -eq "cpu" -and $offload -ne 0) { $result.error = "offload CPU doit etre 0"; return $result }
    if ($processor -eq "gpu" -and $offload -lt 95) { $result.error = "offload GPU doit etre au moins 95"; return $result }
    if ($processor -eq "hybrid" -and ($offload -le 0 -or $offload -ge 95)) { $result.error = "offload hybride doit etre entre 0 et 95"; return $result }
    $result.runtime = "$processor - $offload%"
    $result.runtime_proven = $true
  }
  return $result
}
`;

const STRICT_PROFILE_RECIPES = {
  old_laptop: {
    title: "Recette stricte vieux laptop",
    file: "OLD-LAPTOP-RECETTE-STRICTE.html",
    command: "OUVRIR-OLD-LAPTOP-STRICT.cmd",
    models: ["qwen3:0.6b", "llama3.2:3b", "phi4-mini", "gemma3:4b"],
    firstProof: "Une preuve légère avec qwen3:0.6b suffit. Le but est de ne pas démoraliser une petite machine.",
    hardRules: [
      "Ne pas télécharger un 14B/32B pour obtenir la première preuve.",
      "Ne pas afficher de VRAM fantôme.",
      "Ne pas présenter image/audio/vidéo comme dialogue LLM texte.",
    ],
  },
  core_i7_gtx_1080_ti: {
    title: "Recette stricte GTX 1080 Ti",
    file: "GTX-1080-TI-RECETTE-STRICTE.html",
    command: "OUVRIR-GTX-1080-TI-STRICT.cmd",
    models: ["qwen3:0.6b", "mistral:7b", "llama3.1:8b", "qwen3:8b"],
    firstProof: "Commencer léger, puis prouver qu'un 7B/8B reste crédible sur 11 Go VRAM.",
    hardRules: [
      "Ne pas la classer comme machine morte.",
      "Ne pas pousser RTX 4090 comme seule solution.",
      "Ne pas recommander un 32B comme première preuve.",
    ],
  },
  rtx_3060_12gb: {
    title: "Recette stricte RTX 3060 12 Go",
    file: "RTX-3060-12GB-RECETTE-STRICTE.html",
    command: "OUVRIR-RTX-3060-12GB-STRICT.cmd",
    models: ["qwen3:0.6b", "hermes3:8b", "qwen3:8b", "qwen3:14b"],
    firstProof: "Valider le modèle léger, puis montrer un vrai 8B/14B utile pour la machine budget IA locale.",
    hardRules: [
      "Ne pas proposer uniquement qwen3:0.6b.",
      "Ne pas sur-vendre les 70B.",
      "Ne pas rendre l'upgrade 24 Go obligatoire pour débuter.",
    ],
  },
  rtx_4080_4090: {
    title: "Recette stricte RTX 4080 / RTX 4090",
    file: "RTX-4080-4090-RECETTE-STRICTE.html",
    command: "OUVRIR-RTX-4080-4090-STRICT.cmd",
    models: ["qwen3:0.6b", "hermes3:8b", "qwen3:14b", "mistral-nemo:12b"],
    firstProof: "Ne pas rester sur le 0.6B : comparer un second modèle utile et exporter le profil Strategy Arena.",
    hardRules: [
      "Ne pas rester bloqué sur le modèle test 0.6B.",
      "Ne pas confondre benchmark léger et recommandation finale.",
      "Ne pas proposer un upgrade agressif si la machine est déjà très solide.",
    ],
  },
  cpu_only: {
    title: "Recette stricte CPU-only",
    file: "CPU-ONLY-RECETTE-STRICTE.html",
    command: "OUVRIR-CPU-ONLY-STRICT.cmd",
    models: ["qwen3:0.6b", "llama3.2:3b", "phi4-mini"],
    firstProof: "Assumer le CPU-only : petit modèle, mesure honnête et upgrade GPU priorisé si usage sérieux.",
    hardRules: [
      "Ne pas afficher de VRAM fantôme.",
      "Ne pas proposer Flux/SDXL comme action chat.",
      "Ne pas promettre un gros LLM confortable sans GPU dédié.",
    ],
  },
};

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function flattenCatalogModels(catalog) {
  return (catalog.categories || []).flatMap((category) =>
    (category.models || []).map((model) => ({
      ...model,
      category: category.name || "",
      kind: String(model.kind || "text").toLowerCase(),
      runtime_status: String(model.runtime_status || "").trim(),
    }))
  );
}

function writeCatalogLivingGuide(kitDir) {
  const catalog = existsSync(modelCatalogPath) ? readJson(modelCatalogPath) : { categories: [] };
  const models = flattenCatalogModels(catalog);
  const pilotable = models
    .filter((model) => model.kind === "text" && model.actionable_text === true && model.pilotable_text !== false)
    .sort((a, b) => Number(a.vram_q4 || 999) - Number(b.vram_q4 || 999));
  const watchlist = models
    .filter((model) => model.kind === "text" && model.actionable_text === true && model.pilotable_text === false)
    .sort((a, b) => Number(a.vram_q4 || 999) - Number(b.vram_q4 || 999));
  const compatibilityOnly = models
    .filter((model) => model.kind !== "text" || model.actionable_text !== true)
    .sort((a, b) => String(a.kind).localeCompare(String(b.kind)) || Number(a.vram_q4 || 999) - Number(b.vram_q4 || 999));

  const renderRows = (items) => items.map((model) => `
      <tr>
        <td><strong>${htmlEscape(`${model.name || ""} ${model.params || ""}`.trim())}</strong><br><small>${htmlEscape(model.category)}</small></td>
        <td>${htmlEscape(model.kind)}</td>
        <td>${htmlEscape(model.vram_q4 ?? "n/a")} Go</td>
        <td>${model.ollama ? `<code>${htmlEscape(model.ollama)}</code>` : "<em>aucune commande chat</em>"}</td>
        <td>${htmlEscape(model.use_case || "")}</td>
      </tr>`).join("");

  writeFileSync(join(kitDir, "CATALOGUE-VIVANT.html"), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Catalogue vivant OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#66758a;--line:#dbe4ef;--soft:#f5f8fc;--blue:#185abc;--green:#19735b;--amber:#9a5a00;--red:#a33b2f;--shadow:0 16px 44px rgba(28,43,68,.10)}
    *{box-sizing:border-box} body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:var(--ink);background:#edf2f8;line-height:1.48}
    main{width:min(1120px,calc(100% - 28px));margin:28px auto} header,section{background:white;border:1px solid var(--line);border-radius:14px;padding:24px;margin-top:16px;box-shadow:var(--shadow)}
    header{background:#12335e;color:white;margin-top:0} h1{margin:0 0 8px;font-size:32px;letter-spacing:0} h2{margin:0 0 12px;font-size:22px}
    .cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.card{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:16px}.card strong{display:block;font-size:28px}
    table{width:100%;border-collapse:collapse;background:white;border:1px solid var(--line);border-radius:12px;overflow:hidden} th,td{border-bottom:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top} th{background:#f5f8fc} small{color:var(--muted)}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}.ok{color:var(--green);font-weight:900}.warn{color:var(--amber);font-weight:900}.bad{color:var(--red);font-weight:900}
    @media(max-width:840px){.cards{grid-template-columns:1fr} header,section{padding:20px} table{font-size:13px}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Catalogue vivant OutilsIA</h1>
    <p>Version catalogue <code>${htmlEscape(catalog.version || "n/a")}</code> · ${htmlEscape(catalog.updated_at || "date inconnue")}. Ce guide sert aux tests terrain : il ne remplace pas le scan réel.</p>
  </header>
  <section>
    <h2>Règle de décision</h2>
    <p><span class="ok">Pilotable maintenant</span> : modèle texte avec commande Ollama confirmée, donc installation, benchmark et dialogue possibles dans OutilsIA.</p>
    <p><span class="warn">À surveiller</span> : modèle important pour la roadmap, affiché pour compatibilité. Le runtime peut être à confirmer, ou déjà confirmé mais gardé hors pilotage automatique si le modèle est trop frontier pour un test terrain prudent.</p>
    <p><span class="bad">Compatibilité seulement</span> : image, audio, vidéo ou modèle non pilotable en chat. Visible pour le matériel, sans bouton Bench chat ni Dialogue.</p>
  </section>
  <section>
    <div class="cards">
      <div class="card"><strong>${models.length}</strong><span>modèles suivis</span></div>
      <div class="card"><strong>${pilotable.length}</strong><span>pilotables texte</span></div>
      <div class="card"><strong>${watchlist.length}</strong><span>à surveiller</span></div>
      <div class="card"><strong>${compatibilityOnly.length}</strong><span>compatibilité seulement</span></div>
    </div>
  </section>
  <section>
    <h2>Pilotables maintenant</h2>
    <table><thead><tr><th>Modèle</th><th>Type</th><th>VRAM Q4</th><th>Commande</th><th>Usage</th></tr></thead><tbody>${renderRows(pilotable)}</tbody></table>
  </section>
  <section>
    <h2>À surveiller</h2>
    <table><thead><tr><th>Modèle</th><th>Type</th><th>VRAM Q4</th><th>Commande</th><th>Usage</th></tr></thead><tbody>${renderRows(watchlist)}</tbody></table>
  </section>
  <section>
    <h2>Compatibilité seulement</h2>
    <table><thead><tr><th>Modèle</th><th>Type</th><th>VRAM</th><th>Commande</th><th>Usage</th></tr></thead><tbody>${renderRows(compatibilityOnly)}</tbody></table>
  </section>
</main>
</body>
</html>
`, "utf8");

  writeFileSync(join(kitDir, "OUVRIR-CATALOGUE-VIVANT.cmd"), [
    "@echo off",
    "start \"\" \"%~dp0CATALOGUE-VIVANT.html\"",
    ""
  ].join("\r\n"), "utf8");
}

function writeStrategyArenaBridgeGuide(kitDir) {
  writeFileSync(join(kitDir, "PONT-STRATEGY-ARENA.html"), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pont Strategy Arena OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#66758a;--line:#dbe4ef;--soft:#f5f8fc;--blue:#185abc;--green:#19735b;--red:#b42318;--shadow:0 16px 44px rgba(28,43,68,.10)}
    *{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:var(--ink);background:#edf2f8;line-height:1.48}
    main{width:min(1040px,calc(100% - 28px));margin:28px auto}header,section{background:white;border:1px solid var(--line);border-radius:14px;padding:24px;margin-top:16px;box-shadow:var(--shadow)}
    header{background:#12335e;color:white;margin-top:0}h1{margin:0 0 8px;font-size:32px;letter-spacing:0}h2{margin:0 0 12px;font-size:22px}
    .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:16px}.card strong{display:block;font-size:18px;margin-bottom:6px}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}.ok{color:var(--green);font-weight:900}.bad{color:var(--red);font-weight:900}li{margin:7px 0}
    @media(max-width:820px){.grid{grid-template-columns:1fr}header,section{padding:20px}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Pont Strategy Arena</h1>
    <p>OutilsIA prépare les modèles locaux. Strategy Arena exploite ce profil pour les workflows quant, puis valide par compilation, backtest, robustesse et export.</p>
  </header>
  <section>
    <h2>Fichier à fournir à Strategy Arena</h2>
    <div class="grid">
      <div class="card"><strong>Nom attendu</strong><code>outilsia-strategy-arena-profile.json</code></div>
      <div class="card"><strong>Label d'import</strong><code>Modèles locaux disponibles via OutilsIA</code></div>
      <div class="card"><strong>Mode côté Strategy Arena</strong><code>Local Quant Mode</code></div>
    </div>
  </section>
  <section>
    <h2>Ordre devant le PC</h2>
    <ol>
      <li>Dans OutilsIA, cliquer <strong>Analyser ce PC</strong>.</li>
      <li>Obtenir au moins un benchmark local pour que Strategy Arena sache quel modèle est fiable.</li>
      <li>Ouvrir <strong>Pont Strategy Arena</strong> dans l'app.</li>
      <li>Cliquer <strong>Télécharger profil</strong>.</li>
      <li>Importer <code>outilsia-strategy-arena-profile.json</code> dans Strategy Arena.</li>
    </ol>
  </section>
  <section>
    <h2>Frontière produit obligatoire</h2>
    <ul>
      <li><span class="ok">OutilsIA</span> diagnostique, installe, teste et organise les modèles IA locaux.</li>
      <li><span class="ok">Strategy Arena</span> génère, backteste, optimise et valide les stratégies.</li>
      <li><span class="bad">OutilsIA ne génère pas de stratégie financière.</span></li>
      <li><span class="bad">OutilsIA ne lance pas de backtest financier.</span></li>
      <li><span class="bad">Strategy Arena ne devient pas un gestionnaire Ollama généraliste.</span></li>
    </ul>
  </section>
  <section>
    <h2>Ce que contient le profil</h2>
    <ul>
      <li>Machine : CPU, RAM, GPU, VRAM, OS, runtime Ollama/WSL si détecté.</li>
      <li>Modèles installés localement.</li>
      <li>Modèles candidats OutilsIA actionnables.</li>
      <li>Rôles recommandés : rapide, assistant, code, mémoire, français, qualité, compromis.</li>
      <li>Preuve benchmark : modèle, tokens/s, durée, si disponible.</li>
      <li>Règles de séparation : pas de backtest dans OutilsIA, pas de gestion modèles dans Strategy Arena.</li>
    </ul>
  </section>
</main>
</body>
</html>
`, "utf8");

  writeFileSync(join(kitDir, "OUVRIR-PONT-STRATEGY-ARENA.cmd"), [
    "@echo off",
    "start \"\" \"%~dp0PONT-STRATEGY-ARENA.html\"",
    ""
  ].join("\r\n"), "utf8");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function toWindowsPath(path) {
  if (path.startsWith("/mnt/") && path.length > 6) {
    const drive = path.slice(5, 6).toUpperCase();
    return `${drive}:\\${path.slice(7).replaceAll("/", "\\")}`;
  }
  if (path.startsWith("/")) {
    try {
      return execFileSync("wslpath", ["-w", path], { encoding: "utf8" }).trim();
    } catch {
      // Keep the legacy fallback for non-WSL hosts.
    }
  }
  return path.replaceAll("/", "\\");
}

function psSingleQuoted(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function absoluteDownloadUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `https://outilsia.fr${url}`;
  return `https://outilsia.fr/${url}`;
}

function shSingleQuoted(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function wslCommand(workingDir, command) {
  const distroArg = wslDistro ? `-d ${wslDistro} ` : "";
  return `wsl.exe ${distroArg}--cd ${workingDir} -- bash -lc ${JSON.stringify(command)}`;
}

function appCommand(command) {
  return wslCommand(`${wslRepoRoot}/local-cockpit-app`, command);
}

function repoCommand(command) {
  return wslCommand(wslRepoRoot, command);
}

function writeProofManifest(kitDir, proof) {
  writeFileSync(join(kitDir, "FIELD-PROOF-MANIFEST.json"), `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  writeFileSync(join(kitDir, "FIELD-PROOF-MANIFEST.md"), [
    "# Manifeste preuve terrain OutilsIA",
    "",
    `- Build: \`${proof.build_id}\``,
    `- Version: \`${proof.version}\``,
    `- Installeur: \`${proof.installer.name || "missing"}\``,
    `- SHA256 installeur: \`${proof.installer.sha256 || "missing"}\``,
    `- Zip terrain: \`${proof.zip.name}\``,
    `- SHA256 zip: \`${proof.zip.sha256 || "pending"}\``,
    `- Statut terrain: \`${proof.field_status.status}\``,
    `- Profils prets: ${proof.field_status.ready}/${proof.field_status.required}`,
    `- Prochain profil a tester: \`${proof.field_status.next_profile_to_test || "aucun"}\``,
    "",
    "## Profils manquants",
    ...(proof.field_status.missing_profiles.length ? proof.field_status.missing_profiles.map((profile) => `- \`${profile}\``) : ["- aucun"]),
    "",
    "## Commandes de validation finale",
    ...proof.validation_commands.map((command) => `- \`${command}\``),
    "",
  ].join("\n"), "utf8");
}

function templateMachine(profile) {
  const labels = Object.fromEntries(Object.entries(PROFILE_GUIDES).map(([key, guide]) => [key, guide.title]));
  return {
    profile,
    machine_label: labels[profile] || profile,
    os: "",
    cpu: "",
    gpu: profile === "cpu_only" ? "CPU only / aucun GPU dédié" : "",
    ram_gb: 0,
    vram_gb: profile === "cpu_only" ? 0 : 0,
    scan_ok: false,
    score: 0,
    score_label: "",
    recommended_model: "",
    first_action: "",
    upgrade_recommendation: "",
    benchmark_model: "",
    benchmark_tokens_per_second: 0,
    benchmark_elapsed_ms: 0,
    promptforge_ok: false,
    dialogue_ok: false,
    arena_ok: false,
    report_ok: false,
    share_url: "",
    notes: ""
  };
}

function hasFieldEvidence(machine) {
  if (!machine || typeof machine !== "object") return false;
  return (
    machine.scan_ok === true ||
    machine.promptforge_ok === true ||
    machine.dialogue_ok === true ||
    machine.arena_ok === true ||
    machine.report_ok === true ||
    Number(machine.benchmark_tokens_per_second || 0) > 0 ||
    Number(machine.benchmark_elapsed_ms || 0) > 0 ||
    Boolean(String(machine.share_url || "").trim())
  );
}

function shouldRefreshFieldTestsJson(path) {
  if (!existsSync(path)) return true;
  try {
    const payload = readJson(path);
    const machines = Array.isArray(payload?.machines) ? payload.machines : [];
    if (payload?.schema !== "outilsia.local_cockpit_field_tests.v1" || !machines.length) return false;
    return machines.every((machine) => !hasFieldEvidence(machine));
  } catch {
    return false;
  }
}

function writeProfileExpectations(kitDir, release) {
  const expectations = {
    schema: "outilsia.local_cockpit_field_profile_expectations.v1",
    generated_at: new Date().toISOString(),
    build_id: release.build_id || "",
    profiles: Object.fromEntries(REQUIRED_PROFILES.map((profile) => {
      const guide = PROFILE_GUIDES[profile] || {};
      return [profile, {
        title: guide.title || profile,
        target: guide.target || "",
        expected_score: guide.expected_score || "",
        expected_models: guide.expected_models || [],
        benchmark_target: guide.benchmark_target || "",
        upgrade_signal: guide.upgrade_signal || "",
        must_confirm: guide.must_confirm || [],
        pitfalls: guide.pitfalls || [],
        expected_entry: `outilsia-field-test-${profile}.json`
      }];
    }))
  };
  writeFileSync(join(kitDir, "FIELD-PROFILE-EXPECTATIONS.json"), `${JSON.stringify(expectations, null, 2)}\n`, "utf8");

  const mdLines = [
    "# Attentes mesurables par profil terrain",
    "",
    `- Build: \`${release.build_id || "beta"}\``,
    "- Rôle: guider les tests physiques, sans remplacer les preuves terrain.",
    "",
  ];
  for (const profile of REQUIRED_PROFILES) {
    const guide = PROFILE_GUIDES[profile] || {};
    mdLines.push(
      `## ${guide.title || profile}`,
      "",
      `- Profil: \`${profile}\``,
      `- Machine cible: ${guide.target || ""}`,
      `- Score attendu: ${guide.expected_score || ""}`,
      `- Modèles attendus: ${(guide.expected_models || []).map((model) => `\`${model}\``).join(", ") || "à déterminer"}`,
      `- Benchmark attendu: ${guide.benchmark_target || ""}`,
      `- Signal upgrade: ${guide.upgrade_signal || ""}`,
      `- Fiche attendue: \`outilsia-field-test-${profile}.json\``,
      "",
      "À confirmer:",
      ...(guide.must_confirm || []).map((item) => `- ${item}`),
      "",
      "Pièges à éviter:",
      ...(guide.pitfalls || []).map((item) => `- ${item}`),
      "",
    );
  }
  writeFileSync(join(kitDir, "FIELD-PROFILE-EXPECTATIONS.md"), mdLines.join("\n"), "utf8");

  const cards = REQUIRED_PROFILES.map((profile) => {
    const guide = PROFILE_GUIDES[profile] || {};
    const confirm = (guide.must_confirm || []).map((item) => `<li>${item}</li>`).join("");
    const pitfalls = (guide.pitfalls || []).map((item) => `<li>${item}</li>`).join("");
    const models = (guide.expected_models || []).map((model) => `<code>${model}</code>`).join(" ");
    return `<article class="profile">
      <h2>${guide.title || profile}</h2>
      <p><code>${profile}</code> · fiche <code>outilsia-field-test-${profile}.json</code></p>
      <dl>
        <dt>Machine cible</dt><dd>${guide.target || ""}</dd>
        <dt>Score attendu</dt><dd>${guide.expected_score || ""}</dd>
        <dt>Modèles à surveiller</dt><dd>${models || "à déterminer"}</dd>
        <dt>Benchmark</dt><dd>${guide.benchmark_target || ""}</dd>
        <dt>Upgrade</dt><dd>${guide.upgrade_signal || ""}</dd>
      </dl>
      <div class="cols">
        <div><strong>À confirmer</strong><ul>${confirm}</ul></div>
        <div><strong>Pièges à éviter</strong><ul>${pitfalls}</ul></div>
      </div>
    </article>`;
  }).join("\n");
  writeFileSync(join(kitDir, "FIELD-PROFILE-EXPECTATIONS.html"), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Attentes profils terrain OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#617085;--line:#dbe4ef;--soft:#f5f8fc;--blue:#185abc;--warn:#8a4b00}
    *{box-sizing:border-box}
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#edf2f8;color:var(--ink);line-height:1.48}
    main{width:min(1120px,calc(100% - 28px));margin:28px auto}
    header{background:#12335e;color:white;border-radius:14px;padding:30px 34px;box-shadow:0 16px 44px rgba(28,43,68,.12)}
    h1{margin:0 0 8px;font-size:32px;letter-spacing:0}
    h2{margin:0 0 8px;font-size:22px}
    .profile{background:white;border:1px solid var(--line);border-radius:14px;padding:22px;margin-top:14px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    dl{display:grid;grid-template-columns:170px 1fr;gap:8px 12px;margin:14px 0}
    dt{font-weight:900;color:var(--muted)}
    dd{margin:0}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}
    .cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .cols>div{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:14px}
    li{margin:6px 0}
    @media (max-width:820px){.cols{grid-template-columns:1fr}dl{grid-template-columns:1fr}header,.profile{padding:22px}}
    @media print{body{background:white}main{width:100%;margin:0}.profile,header{box-shadow:none}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Attentes mesurables par profil terrain</h1>
    <p>Cette page dit ce qu'il faut vérifier sur chaque machine physique. Elle ne remplace pas les fiches JSON exportées depuis l'app.</p>
  </header>
  ${cards}
</main>
</body>
</html>
`, "utf8");
}

function writeOperatorChecklist(kitDir, release) {
  const buildId = release.build_id || "beta";
  const checklist = {
    schema: "outilsia.local_cockpit_field_operator_checklist.v1",
    generated_at: new Date().toISOString(),
    build_id: buildId,
    blocking_rule: "Une machine terrain ne compte pas si scan, benchmark, PromptForge, dialogue, Arena, rapport et fiche JSON valide ne sont pas prouvés.",
    proof_items: [
      "matériel reconnu : OS, CPU, GPU/VRAM ou CPU-only, RAM",
      "score et verdict OutilsIA visibles",
      "modèle conseillé ou modèle léger clairement proposé",
      "benchmark réel avec tokens/s supérieur à 0",
      "PromptForge testé ou statut explicite",
      "dialogue local testé ou statut explicite",
      "Arena locale visible ou statut explicite",
      "rapport généré/partagé et fiche JSON validée"
    ],
    commands: [
      "OUVRIR-CENTRE-TERRAIN.cmd",
      "PROCHAIN-PC.cmd",
      "TESTER-<PROFIL>.cmd",
      "VALIDER-DERNIERE-FICHE.cmd",
      "EXPORTER-FICHES.cmd",
      "IMPORTER-PACK-FICHES.cmd",
      "VALIDER-GOAL.cmd"
    ],
    profiles: Object.fromEntries(REQUIRED_PROFILES.map((profile) => {
      const guide = PROFILE_GUIDES[profile] || {};
      return [profile, {
        title: guide.title || profile,
        expected_entry: `outilsia-field-test-${profile}.json`,
        launcher: profileCommandName(profile),
        brief: profileBriefHtmlName(profile),
        target: guide.target || "",
        must_confirm: guide.must_confirm || [],
        pitfalls: guide.pitfalls || [],
        expected_models: guide.expected_models || [],
        benchmark_target: guide.benchmark_target || "",
        upgrade_signal: guide.upgrade_signal || ""
      }];
    }))
  };
  writeFileSync(join(kitDir, "FIELD-OPERATOR-CHECKLIST.json"), `${JSON.stringify(checklist, null, 2)}\n`, "utf8");

  const profileLines = REQUIRED_PROFILES.flatMap((profile) => {
    const item = checklist.profiles[profile];
    return [
      `## ${item.title}`,
      "",
      `- Profil: \`${profile}\``,
      `- Lanceur: \`${item.launcher}\``,
      `- Brief: \`${item.brief}\``,
      `- Fiche attendue: \`${item.expected_entry}\``,
      `- Machine cible: ${item.target}`,
      `- Benchmark attendu: ${item.benchmark_target}`,
      `- Upgrade attendu: ${item.upgrade_signal}`,
      `- Modèles à surveiller: ${item.expected_models.map((model) => `\`${model}\``).join(", ") || "à déterminer"}`,
      "",
      "À confirmer:",
      ...item.must_confirm.map((value) => `- ${value}`),
      "",
      "Pièges à éviter:",
      ...item.pitfalls.map((value) => `- ${value}`),
      "",
    ];
  });
  writeFileSync(join(kitDir, "FIELD-OPERATOR-CHECKLIST.md"), [
    "# Checklist opérateur terrain OutilsIA",
    "",
    `- Build: \`${buildId}\``,
    `- Règle bloquante: ${checklist.blocking_rule}`,
    "",
    "## Ordre devant chaque PC",
    "",
    "1. Ouvrir `PROCHAIN-PC.cmd` ou le lanceur profil.",
    "2. Installer/ouvrir l'app avec `INSTALLER-APP.cmd` si besoin.",
    "3. Cliquer `Analyser ce PC`.",
    "4. Produire les 8 preuves ci-dessous.",
    "5. Exporter la fiche depuis `Détails > Test terrain`.",
    "6. Lancer `VALIDER-DERNIERE-FICHE.cmd` avant de quitter la machine.",
    "7. Lancer `EXPORTER-FICHES.cmd` si la fiche part vers la machine principale.",
    "",
    "## 8 preuves bloquantes",
    "",
    ...checklist.proof_items.map((item) => `- ${item}`),
    "",
    "## Preuves enrichies facultatives",
    "",
    "- Hardware Doctor 2.0 : score et diagnostic matériel détaillé.",
    "- Allocation Ollama : CPU, GPU ou hybride, pourcentage d'offload et source `/api/ps` si disponible.",
    "- AI Capability Passport : schéma v1 et digest SHA-256. Son absence ne bloque pas la fiche.",
    "",
    "## Commandes utiles",
    "",
    ...checklist.commands.map((command) => `- \`${command}\``),
    "",
    ...profileLines,
  ].join("\n"), "utf8");

  const profilesHtml = REQUIRED_PROFILES.map((profile) => {
    const item = checklist.profiles[profile];
    return `<article>
      <h2>${item.title}</h2>
      <p><code>${profile}</code> · <code>${item.expected_entry}</code></p>
      <dl>
        <dt>Lanceur</dt><dd><code>${item.launcher}</code></dd>
        <dt>Brief</dt><dd><code>${item.brief}</code></dd>
        <dt>Machine cible</dt><dd>${item.target}</dd>
        <dt>Benchmark</dt><dd>${item.benchmark_target}</dd>
        <dt>Upgrade</dt><dd>${item.upgrade_signal}</dd>
        <dt>Modèles</dt><dd>${item.expected_models.map((model) => `<code>${model}</code>`).join(" ") || "à déterminer"}</dd>
      </dl>
      <div class="cols">
        <div><strong>À confirmer</strong><ul>${item.must_confirm.map((value) => `<li>${value}</li>`).join("")}</ul></div>
        <div><strong>Pièges à éviter</strong><ul>${item.pitfalls.map((value) => `<li>${value}</li>`).join("")}</ul></div>
      </div>
    </article>`;
  }).join("\n");
  writeFileSync(join(kitDir, "FIELD-OPERATOR-CHECKLIST.html"), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Checklist opérateur terrain OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#607086;--line:#dbe4ef;--soft:#f5f8fc;--blue:#185abc;--red:#9f2d2d}
    *{box-sizing:border-box}
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:var(--ink);background:#edf2f8;line-height:1.46}
    main{width:min(1120px,calc(100% - 28px));margin:28px auto}
    header{background:#12335e;color:white;border-radius:14px;padding:30px 34px;box-shadow:0 16px 46px rgba(28,43,68,.12)}
    h1{margin:0 0 8px;font-size:32px;letter-spacing:0}
    h2{margin:0 0 8px;font-size:22px}
    section,article{background:white;border:1px solid var(--line);border-radius:14px;padding:22px;margin-top:14px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    .proofs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;counter-reset:proof}
    .proofs li{list-style:none;background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:12px;counter-increment:proof}
    .proofs li:before{content:counter(proof);display:inline-grid;place-items:center;width:24px;height:24px;border-radius:999px;background:#e7f0ff;color:var(--blue);font-weight:900;margin-right:7px}
    dl{display:grid;grid-template-columns:130px 1fr;gap:8px 12px;margin:12px 0}
    dt{font-weight:900;color:var(--muted)}
    dd{margin:0}
    .cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .cols>div{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:12px}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}
    li{margin:6px 0}
    .bad{color:var(--red);font-weight:900}
    @media(max-width:860px){.proofs,.cols{grid-template-columns:1fr}dl{grid-template-columns:1fr}header,section,article{padding:20px}}
    @media print{body{background:white}main{width:100%;margin:0}header,section,article{box-shadow:none;break-inside:avoid}.proofs{grid-template-columns:repeat(2,minmax(0,1fr))}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Checklist opérateur terrain OutilsIA</h1>
    <p>Feuille courte pour obtenir les 5 preuves physiques sans confusion. Build <code>${buildId}</code>.</p>
  </header>
  <section>
    <h2>Règle bloquante</h2>
    <p class="bad">${checklist.blocking_rule}</p>
  </section>
  <section>
    <h2>8 preuves à obtenir sur chaque PC</h2>
    <ol class="proofs">${checklist.proof_items.map((item) => `<li>${item}</li>`).join("")}</ol>
  </section>
  <section>
    <h2>Preuves enrichies facultatives</h2>
    <p>Doctor 2.0 et l'allocation Ollama sont capturés automatiquement quand le runtime les fournit. Générer le Passport ajoute son digest SHA-256. Ces éléments enrichissent le diagnostic mais ne remplacent ni ne bloquent les 8 preuves physiques.</p>
  </section>
  <section>
    <h2>Ordre court</h2>
    <ol>
      <li>Ouvrir <code>PROCHAIN-PC.cmd</code> ou le lanceur profil.</li>
      <li>Cliquer <strong>Analyser ce PC</strong> dans OutilsIA.</li>
      <li>Benchmark, PromptForge, dialogue, Arena, rapport.</li>
      <li>Exporter la fiche depuis <strong>Détails &gt; Test terrain</strong>.</li>
      <li>Lancer <code>VALIDER-DERNIERE-FICHE.cmd</code> avant de quitter le PC.</li>
      <li>Lancer <code>EXPORTER-FICHES.cmd</code> pour transférer la preuve.</li>
    </ol>
  </section>
  ${profilesHtml}
</main>
</body>
</html>
`, "utf8");

  writeFileSync(join(kitDir, "OUVRIR-CHECKLIST-OPERATEUR.cmd"), [
    "@echo off",
    "start \"\" \"%~dp0FIELD-OPERATOR-CHECKLIST.html\"",
    ""
  ].join("\r\n"), "utf8");
}

function writeProfileCards(kitDir, release) {
  const cards = REQUIRED_PROFILES.map((profile, index) => {
    const guide = PROFILE_GUIDES[profile] || { title: profile, target: "", goal: "", expected: "" };
    return `<article class="card">
      <div class="index">${index + 1}</div>
      <div>
        <p class="eyebrow">Profil terrain</p>
        <h2>${guide.title}</h2>
        <p><code>${profile}</code></p>
      </div>
      <dl>
        <dt>Machine à trouver</dt><dd>${guide.target}</dd>
        <dt>But du test</dt><dd>${guide.goal}</dd>
        <dt>Résultat attendu</dt><dd>${guide.expected}</dd>
        <dt>Score attendu</dt><dd>${guide.expected_score || ""}</dd>
        <dt>Modèles à surveiller</dt><dd>${(guide.expected_models || []).map((model) => `<code>${model}</code>`).join(" ")}</dd>
        <dt>Fiche attendue</dt><dd><code>outilsia-field-test-${profile}.json</code></dd>
      </dl>
      <ol>
        <li>Installer ou ouvrir OutilsIA Local Cockpit build <code>${release.build_id || "beta"}</code>.</li>
        <li>Cliquer <strong>Analyser ce PC</strong>.</li>
        <li>Obtenir matériel, score, modele conseille, benchmark, PromptForge, dialogue, Arena et rapport.</li>
        <li>Aller dans <strong>Details</strong> &gt; <strong>Test terrain</strong>.</li>
        <li>Sélectionner <strong>${profile}</strong>, puis <strong>Telecharger fiche</strong>.</li>
      </ol>
    </article>`;
  }).join("\n");
  writeFileSync(join(kitDir, "FIELD-PROFILE-CARDS.html"), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cartes profils terrain OutilsIA</title>
  <style>
    :root { --ink:#172033; --muted:#617085; --line:#dbe4ef; --soft:#f5f8fc; --blue:#185abc; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, Arial, sans-serif; color:var(--ink); background:#edf2f8; line-height:1.45; }
    main { width:min(1120px, calc(100% - 28px)); margin:28px auto; }
    header { background:#12335e; color:white; border-radius:14px; padding:30px 34px; box-shadow:0 16px 46px rgba(28,43,68,.12); }
    h1 { margin:0; font-size:31px; letter-spacing:0; }
    h2 { margin:0; font-size:22px; }
    .grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:14px; margin-top:16px; }
    .card { position:relative; background:white; border:1px solid var(--line); border-radius:12px; padding:22px; box-shadow:0 12px 34px rgba(28,43,68,.08); break-inside:avoid; }
    .index { position:absolute; right:18px; top:16px; width:34px; height:34px; border-radius:50%; display:grid; place-items:center; background:#eaf2ff; color:var(--blue); font-weight:900; }
    .eyebrow { margin:0 0 4px; text-transform:uppercase; font-size:12px; letter-spacing:.04em; font-weight:800; color:var(--muted); }
    dl { display:grid; grid-template-columns:150px 1fr; gap:8px 12px; margin:16px 0; }
    dt { color:var(--muted); font-weight:800; }
    dd { margin:0; }
    ol { margin:10px 0 0; padding-left:22px; }
    li { margin:6px 0; }
    code { font-family:Consolas, monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; }
    @media (max-width:850px) { .grid{grid-template-columns:1fr;} header,.card{padding:22px;} }
    @media print { body{background:white;} main{width:100%; margin:0;} header,.card{box-shadow:none;} .grid{grid-template-columns:1fr;} }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Cartes profils terrain OutilsIA</h1>
    <p>Une carte par machine physique à tester. Ne remplace pas les tests : elle évite juste de se tromper de profil et de preuves.</p>
  </header>
  <section class="grid">
${cards}
  </section>
</main>
</body>
</html>
`, "utf8");
}

function profileCommandName(profile) {
  return `TESTER-${profile.toUpperCase().replaceAll("_", "-")}.cmd`;
}

function profileDispatchHtmlName(profile) {
  return `FIELD-DISPATCH-${profile}.html`;
}

function profileBriefMdName(profile) {
  return `BRIEF-${profile}.md`;
}

function profileBriefHtmlName(profile) {
  return `BRIEF-${profile}.html`;
}

function writeFieldDispatch(kitDir, release) {
  const buildId = release.build_id || "beta";
  const cards = REQUIRED_PROFILES.map((profile, index) => {
    const guide = PROFILE_GUIDES[profile] || { title: profile, target: "", goal: "", expected: "" };
    const cmdName = profileCommandName(profile);
    return `<article class="card">
      <div class="index">${index + 1}</div>
      <h2>${guide.title}</h2>
      <p><code>${profile}</code></p>
      <p>${guide.target}</p>
      <dl>
        <dt>Commande</dt><dd><code>${cmdName}</code></dd>
        <dt>Brief court</dt><dd><code>${profileBriefHtmlName(profile)}</code></dd>
        <dt>Fiche attendue</dt><dd><code>outilsia-field-test-${profile}.json</code></dd>
        <dt>But</dt><dd>${guide.goal}</dd>
      </dl>
    </article>`;
  }).join("\n");

  writeFileSync(join(kitDir, "FIELD-DISPATCH.html"), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dispatch terrain OutilsIA</title>
  <style>
    :root { --ink:#172033; --muted:#617085; --line:#dbe4ef; --soft:#f5f8fc; --blue:#185abc; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, Arial, sans-serif; color:var(--ink); background:#edf2f8; line-height:1.45; }
    main { width:min(1120px, calc(100% - 28px)); margin:28px auto; }
    header { background:#12335e; color:white; border-radius:14px; padding:30px 34px; box-shadow:0 16px 46px rgba(28,43,68,.12); }
    h1 { margin:0; font-size:31px; letter-spacing:0; }
    h2 { margin:0 0 6px; font-size:21px; }
    .grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:14px; margin-top:16px; }
    .card { position:relative; background:white; border:1px solid var(--line); border-radius:12px; padding:22px; box-shadow:0 12px 34px rgba(28,43,68,.08); }
    .index { position:absolute; right:18px; top:16px; width:34px; height:34px; border-radius:50%; display:grid; place-items:center; background:#eaf2ff; color:var(--blue); font-weight:900; }
    dl { display:grid; grid-template-columns:145px 1fr; gap:8px 12px; margin:16px 0 0; }
    dt { color:var(--muted); font-weight:800; }
    dd { margin:0; }
    code { font-family:Consolas, monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; }
    @media (max-width:850px) { .grid{grid-template-columns:1fr;} header,.card{padding:22px;} }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Dispatch terrain OutilsIA</h1>
    <p>Utilise ces raccourcis si tu testes les machines hors ordre. Chaque commande écrit le profil attendu dans <code>EXPECTED-FIELD-PROFILE.txt</code> et ouvre la fiche dédiée.</p>
  </header>
  <section class="grid">
${cards}
  </section>
</main>
</body>
</html>
`, "utf8");

  writeFileSync(join(kitDir, "OUVRIR-DISPATCH.cmd"), [
    "@echo off",
    "start \"\" \"%~dp0FIELD-DISPATCH.html\"",
    ""
  ].join("\r\n"), "utf8");

  for (const profile of REQUIRED_PROFILES) {
    const guide = PROFILE_GUIDES[profile] || { title: profile, target: "", goal: "", expected: "" };
    const briefMdName = profileBriefMdName(profile);
    const briefHtmlName = profileBriefHtmlName(profile);
    writeFileSync(join(kitDir, profileDispatchHtmlName(profile)), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Test terrain ${profile}</title>
  <style>
    :root { --ink:#172033; --muted:#617085; --line:#dbe4ef; --soft:#f5f8fc; --blue:#185abc; --green:#19735b; --amber:#9a5a00; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, Arial, sans-serif; color:var(--ink); background:#edf2f8; line-height:1.48; }
    main { width:min(880px, calc(100% - 28px)); margin:28px auto; background:white; border:1px solid var(--line); border-radius:14px; overflow:hidden; box-shadow:0 16px 46px rgba(28,43,68,.12); }
    header { background:#12335e; color:white; padding:30px 34px; }
    section { padding:24px 34px; border-top:1px solid var(--line); }
    h1 { margin:0; font-size:30px; letter-spacing:0; }
    h2 { margin:0 0 10px; font-size:22px; }
    code { font-family:Consolas, monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; color:#172033; }
    li { margin:8px 0; }
    .ok { color:var(--green); font-weight:900; }
    .warn { color:var(--amber); font-weight:900; }
  </style>
</head>
<body>
<main>
  <header>
    <h1>${guide.title}</h1>
    <p>Profil terrain verrouillé : <code>${profile}</code></p>
  </header>
  <section>
    <h2>Machine à tester</h2>
    <p>${guide.target}</p>
    <p><strong>But :</strong> ${guide.goal}</p>
    <p><strong>Résultat attendu :</strong> ${guide.expected}</p>
  </section>
  <section>
    <h2>Procédure stricte</h2>
    <ol>
      <li>Installer ou ouvrir OutilsIA Local Cockpit build <code>${buildId}</code>.</li>
      <li>Cliquer <strong>Analyser ce PC</strong>.</li>
      <li>Vérifier le haut de l'app : matériel reconnu, score, modele conseille, preuve/benchmark et upgrade utile.</li>
      <li>Lancer un benchmark réel si aucune preuve locale n'est affichée.</li>
      <li>Tester PromptForge, dialogue local, Arena et rapport.</li>
      <li>Aller dans <strong>Details</strong> &gt; <strong>Test terrain</strong>.</li>
      <li>Optionnel : générer l'<strong>AI Capability Passport</strong> pour joindre son digest à la fiche.</li>
      <li>Sélectionner manuellement <strong>${profile}</strong>.</li>
      <li>Cliquer <strong>Telecharger fiche</strong>.</li>
      <li>Lancer <code>VALIDER-DERNIERE-FICHE.cmd</code> avant de quitter la machine.</li>
      <li>Si la fiche est valide, lancer <code>EXPORTER-FICHES.cmd</code> pour produire le pack transférable.</li>
    </ol>
  </section>
  <section>
    <h2>Fichier attendu</h2>
    <p><code>outilsia-field-test-${profile}.json</code></p>
    <p>Brief court : <code>${briefHtmlName}</code></p>
    <p class="warn">Ne pas utiliser une fiche d'un autre profil pour valider cette machine.</p>
  </section>
</main>
</body>
</html>
`, "utf8");

    const briefLines = [
      `# Brief terrain - ${guide.title}`,
      "",
      `- Profil verrouillé : \`${profile}\``,
      `- Build attendu : \`${buildId}\``,
      `- Fiche attendue : \`outilsia-field-test-${profile}.json\``,
      "",
      "## Pourquoi cette machine compte",
      "",
      guide.goal,
      "",
      "## Machine cible",
      "",
      guide.target,
      "",
      "## Résultat attendu",
      "",
      guide.expected,
      "",
      "## Preuves minimales avant de quitter le PC",
      "",
      "- Matériel reconnu : OS, CPU, GPU/VRAM ou CPU-only, RAM.",
      "- Résultat immédiat clair : score, modèle conseillé, première action et upgrade utile.",
      "- Benchmark réel avec tokens/s supérieur à 0.",
      "- PromptForge testé ou statut explicite.",
      "- Dialogue local testé ou statut explicite.",
      "- Arena locale visible ou statut explicite.",
      "- Rapport généré ou lien de partage.",
      "- Profil terrain manuel correct dans la fiche exportée.",
      "- Preuve enrichie facultative : Doctor 2.0, allocation CPU/GPU Ollama et digest du Passport.",
      "- L'absence de Passport ne bloque jamais une fiche terrain ; un Passport annoncé doit toutefois être valide.",
      "",
      "## À ne pas faire",
      "",
      "- Ne pas valider une fiche sans benchmark réel.",
      "- Ne pas réutiliser une fiche d'un autre profil.",
      "- Ne pas quitter la machine si `VALIDER-DERNIERE-FICHE.cmd` échoue.",
      "- Ne pas annoncer le goal terminé tant que `FIELD-TESTS-STATUS.json` n'indique pas 5/5.",
      "",
      "## Ordre court",
      "",
      `1. Lancer \`${profileCommandName(profile)}\`.`,
      "2. Installer ou ouvrir OutilsIA Local Cockpit.",
      "3. Cliquer `Analyser ce PC`.",
      "4. Obtenir scan, benchmark, PromptForge, dialogue, Arena et rapport.",
      `5. Exporter \`outilsia-field-test-${profile}.json\`.`,
      "6. Lancer `VALIDER-DERNIERE-FICHE.cmd`.",
      "7. Lancer `EXPORTER-FICHES.cmd` si la fiche part vers la machine principale.",
      "",
    ];
    writeFileSync(join(kitDir, briefMdName), briefLines.join("\n"), "utf8");
    writeFileSync(join(kitDir, briefHtmlName), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Brief terrain ${profile}</title>
  <style>
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#eef3f8;color:#172033;line-height:1.48}
    main{width:min(900px,calc(100% - 28px));margin:28px auto}
    header,section{background:white;border:1px solid #dbe4ef;border-radius:14px;padding:24px;margin-bottom:14px;box-shadow:0 10px 28px rgba(28,43,68,.08)}
    header{background:#12335e;color:white}
    h1{margin:0 0 8px;font-size:30px}
    h2{margin:0 0 10px;font-size:21px}
    li{margin:8px 0}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px;color:#172033}
    .warn{color:#9a5a00;font-weight:900}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Brief terrain - ${guide.title}</h1>
    <p>Profil verrouillé : <code>${profile}</code> · build <code>${buildId}</code></p>
  </header>
  <section>
    <h2>Machine cible</h2>
    <p>${guide.target}</p>
    <p><strong>But :</strong> ${guide.goal}</p>
    <p><strong>Résultat attendu :</strong> ${guide.expected}</p>
  </section>
  <section>
    <h2>Preuves minimales</h2>
    <ul>
      <li>Matériel reconnu : OS, CPU, GPU/VRAM ou CPU-only, RAM.</li>
      <li>Score, modèle conseillé, première action et upgrade utile.</li>
      <li>Benchmark réel avec tokens/s supérieur à 0.</li>
      <li>PromptForge, dialogue local, Arena locale et rapport avec statut explicite.</li>
      <li>Fiche exportée : <code>outilsia-field-test-${profile}.json</code>.</li>
      <li>Facultatif : Doctor 2.0, allocation Ollama et digest du Passport enrichissent la preuve sans la rendre obligatoire.</li>
    </ul>
  </section>
  <section>
    <h2>Ordre court</h2>
    <ol>
      <li>Lancer <code>${profileCommandName(profile)}</code>.</li>
      <li>Ouvrir OutilsIA Local Cockpit et cliquer <strong>Analyser ce PC</strong>.</li>
      <li>Compléter benchmark, PromptForge, dialogue, Arena et rapport.</li>
      <li>Facultatif : générer l'AI Capability Passport avant l'export.</li>
      <li>Exporter la fiche terrain avec le profil manuel <code>${profile}</code>.</li>
      <li>Lancer <code>VALIDER-DERNIERE-FICHE.cmd</code>.</li>
    </ol>
    <p class="warn">Ne quitte pas cette machine si la validation échoue.</p>
  </section>
</main>
</body>
</html>
`, "utf8");

    writeFileSync(join(kitDir, profileCommandName(profile)), [
      "@echo off",
      `echo ${profile}> "%~dp0EXPECTED-FIELD-PROFILE.txt"`,
      `start "" "%~dp0${profileDispatchHtmlName(profile)}"`,
      `start "" "%~dp0${briefHtmlName}"`,
      ""
    ].join("\r\n"), "utf8");
  }
}

function writeStartHere(kitDir, release) {
  const buildId = release.build_id || "beta";
  const primary = release.primary_download || {};
  writeFileSync(join(kitDir, "START-HERE.html"), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Demarrer le test terrain OutilsIA</title>
  <style>
    :root {
      --ink:#172033; --muted:#66758a; --line:#dbe4ef; --soft:#f5f8fc;
      --blue:#185abc; --green:#19735b; --amber:#9a5a00; --shadow:0 16px 44px rgba(28,43,68,.10);
    }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, Arial, sans-serif; color:var(--ink); background:#edf2f8; line-height:1.48; }
    main { width:min(1040px, calc(100% - 28px)); margin:28px auto; }
    header { background:#12335e; color:white; border-radius:14px; padding:30px 34px; box-shadow:var(--shadow); }
    h1 { margin:0; font-size:32px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:22px; }
    p { margin:8px 0; }
    section { background:white; border:1px solid var(--line); border-radius:14px; padding:24px; margin-top:16px; box-shadow:var(--shadow); }
    .grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; }
    .step { background:var(--soft); border:1px solid var(--line); border-radius:12px; padding:18px; }
    .step strong { display:block; font-size:18px; margin-bottom:6px; }
    .num { display:inline-grid; place-items:center; width:30px; height:30px; border-radius:999px; background:#e7f0ff; color:var(--blue); font-weight:900; margin-bottom:10px; }
    .actions { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; margin-top:12px; }
    .action { border:1px solid var(--line); border-radius:12px; padding:14px; background:white; }
    .action b { display:block; margin-bottom:4px; }
    code { font-family:Consolas, monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; }
    .ok { color:var(--green); font-weight:900; }
    .warn { color:var(--amber); font-weight:900; }
    ol { margin:0; padding-left:22px; }
    li { margin:7px 0; }
    footer { color:var(--muted); font-size:13px; margin-top:14px; }
    @media (max-width:880px) { .grid,.actions{grid-template-columns:1fr;} header,section{padding:22px;} h1{font-size:28px;} }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Demarrer le test terrain OutilsIA</h1>
    <p>Objectif : obtenir 5 preuves physiques propres. Cette page est le point d'entree du kit, pas une preuve en elle-meme.</p>
  </header>

  <section>
    <h2>Ordre simple</h2>
    <div class="grid">
      <div class="step">
        <span class="num">1</span>
        <strong>Choisir le bon PC</strong>
        <p>Ouvre <code>PROCHAIN-PC.cmd</code>. Il indique le profil physique attendu maintenant et les preuves à obtenir.</p>
      </div>
      <div class="step">
        <span class="num">2</span>
        <strong>Tester dans l'app</strong>
        <p>Lance OutilsIA, clique <strong>Analyser ce PC</strong>, puis obtiens scan, benchmark, PromptForge, dialogue, Arena et rapport.</p>
      </div>
      <div class="step">
        <span class="num">3</span>
        <strong>Valider avant de partir</strong>
        <p>Après <strong>Telecharger fiche</strong>, lance <code>VALIDER-DERNIERE-FICHE.cmd</code>. Ne quitte pas le PC si la fiche est incomplète.</p>
      </div>
    </div>
  </section>

  <section>
    <h2>Raccourcis du kit</h2>
    <div class="actions">
      <div class="action"><b>1. Actions restantes</b><code>OUVRIR-ACTIONS-RESTANTES.cmd</code><p>Vue courte : prochain PC, validation fiches, retour machine principale et Linux ensuite.</p></div>
      <div class="action"><b>2. Centre terrain</b><code>OUVRIR-CENTRE-TERRAIN.cmd</code><p>Régénère et ouvre l'écran unique : progression, prochain PC, raccourcis et profils.</p></div>
      <div class="action"><b>3. Test express</b><code>OUVRIR-TEST-EXPRESS.cmd</code><p>Ouvre <code>TEST-EXPRESS-PROCHAIN-PC.html</code> : profil attendu, 8 gestes, fichier JSON bloquant.</p></div>
      <div class="action"><b>4. Prochain PC</b><code>PROCHAIN-PC.cmd</code><p>Vue courte : profil attendu, preuves à obtenir, nom de fiche attendu.</p></div>
      <div class="action"><b>4b. Recettes strictes profils</b><code>OUVRIR-RECETTES-STRICTES.cmd</code><p>Mode strict pour chaque machine terrain : vieux laptop, GTX 1080 Ti, RTX 3060 12 Go, RTX 4080/4090 et CPU-only.</p></div>
      <div class="action"><b>4c. Recette vieux laptop</b><code>OUVRIR-OLD-LAPTOP-STRICT.cmd</code><p>Raccourci direct pour le profil le plus sensible : preuve légère, message encourageant, aucun gros téléchargement.</p></div>
      <div class="action"><b>4. Progression</b><code>OUVRIR-PROGRESSION-TERRAIN.cmd</code><p>Affiche le pourcentage terrain, les profils prêts et le prochain profil à tester.</p></div>
      <div class="action"><b>5. Installer l'app</b><code>INSTALLER-APP.cmd</code><p>Installe le build Windows inclus dans ce kit.</p></div>
      <div class="action"><b>6. Dispatch profils</b><code>OUVRIR-DISPATCH.cmd</code><p>Ouvre les 5 raccourcis de test profil par profil si les machines sont collectées hors ordre.</p></div>
      <div class="action"><b>7. Cartes profils</b><code>OUVRIR-CARTES-PROFILS.cmd</code><p>Affiche les 5 profils physiques à imprimer ou garder sous les yeux.</p></div>
      <div class="action"><b>8. Checklist opérateur</b><code>OUVRIR-CHECKLIST-OPERATEUR.cmd</code><p>Affiche les 8 preuves bloquantes, les commandes utiles et les pièges à éviter par profil.</p></div>
      <div class="action"><b>9. Catalogue vivant</b><code>OUVRIR-CATALOGUE-VIVANT.cmd</code><p>Montre les modèles pilotables, les watchlists et les médias en compatibilité seulement.</p></div>
      <div class="action"><b>10. Pont Strategy Arena</b><code>OUVRIR-PONT-STRATEGY-ARENA.cmd</code><p>Explique le profil JSON à donner à Strategy Arena et la frontière produit.</p></div>
      <div class="action"><b>11. Rapport PDF terrain</b><code>OUVRIR-RAPPORT-PDF-TERRAIN.cmd</code><p>Explique quand générer le PDF modèle/upgrade et quelles sections doivent apparaître.</p></div>
      <div class="action"><b>12. Attentes profils</b><code>FIELD-PROFILE-EXPECTATIONS.html</code><p>Score attendu, modèles à surveiller, preuve minimale et pièges à éviter par machine.</p></div>
      <div class="action"><b>13. Valider la fiche</b><code>VALIDER-DERNIERE-FICHE.cmd</code><p>Copie la dernière fiche téléchargée et vérifie les champs bloquants.</p></div>
      <div class="action"><b>14. Valider toutes les fiches</b><code>VALIDER-FICHES.cmd</code><p>Contrôle toutes les fiches présentes avant assemblage.</p></div>
      <div class="action"><b>15. Exporter les fiches</b><code>EXPORTER-FICHES.cmd</code><p>Crée un zip transférable avec les fiches terrain et le rapport de validation.</p></div>
      <div class="action"><b>16. Importer un pack</b><code>IMPORTER-PACK-FICHES.cmd</code><p>Récupère un zip transféré depuis un autre PC et injecte ses fiches dans <code>entries/</code>.</p></div>
      <div class="action"><b>17. Préparer USB</b><code>PREPARER-KIT-USB.cmd</code><p>Copie le kit, le zip terrain et le manifeste SHA vers une clé USB ou un dossier de transfert.</p></div>
      <div class="action"><b>18. Verifier le kit</b><code>VERIFIER-KIT.cmd</code><p>Controle le SHA de l'installeur et les fichiers indispensables avant de partir sur un autre PC.</p></div>
      <div class="action"><b>19. Statut global</b><code>STATUT.cmd</code><p>Montre les profils prets, manquants et incomplets.</p></div>
      <div class="action"><b>20. Audit terrain</b><code>AUDIT-TERRAIN.cmd</code><p>Produit un verdict clair : pret, pas pret, prochain PC, fiches manquantes et prochaine action.</p></div>
      <div class="action"><b>21. Validation finale</b><code>VALIDER-GOAL.cmd</code><p>Collecte, assemble, importe et relance l'audit global quand les 5 fiches sont présentes.</p></div>
    </div>
  </section>

  <section>
    <h2>Checklist pour chaque machine</h2>
    <ol>
      <li>Matériel visible : OS, CPU, GPU, RAM, VRAM.</li>
      <li>Résultat 30 secondes : score, modele conseille, preuve ou bouton benchmark, upgrade utile.</li>
      <li>Benchmark reel : modèle, tokens/s, durée.</li>
      <li>PromptForge utilisé ou justifié.</li>
      <li>Dialogue local testé.</li>
      <li>Arena locale visible.</li>
      <li>Rapport genere ou partage.</li>
      <li>Fiche terrain exportée avec le bon profil manuel.</li>
    </ol>
  </section>

  <section>
    <h2>Build inclus</h2>
    <p><span class="ok">Build Windows :</span> <code>${buildId}</code></p>
    <p><span class="ok">Installateur :</span> <code>${primary.name || "non renseigne"}</code></p>
    <p><span class="ok">SHA256 :</span> <code>${primary.sha256 || "non renseigne"}</code></p>
    <p><span class="warn">Important :</span> le goal reste incomplet tant que les 5 vraies machines ne sont pas importées dans <code>FIELD-TESTS.json</code>.</p>
  </section>

  <footer>Si une fiche échoue, compléter le flux dans l'app puis retélécharger la fiche avant de passer au PC suivant.</footer>
</main>
</body>
</html>
`, "utf8");
}

function writeFieldPdfGuide(kitDir) {
  writeFileSync(join(kitDir, "RAPPORT-PDF-TERRAIN.html"), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rapport PDF terrain OutilsIA</title>
  <style>
    :root { --ink:#172033; --muted:#66758a; --line:#dbe4ef; --soft:#f5f8fc; --blue:#12335e; --green:#19735b; --amber:#9a5a00; --shadow:0 16px 44px rgba(28,43,68,.10); }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, Arial, sans-serif; color:var(--ink); background:#edf2f8; line-height:1.48; }
    main { width:min(980px, calc(100% - 28px)); margin:28px auto; }
    header { background:var(--blue); color:white; border-radius:14px; padding:30px 34px; box-shadow:var(--shadow); }
    h1 { margin:0; font-size:32px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:22px; }
    section { background:white; border:1px solid var(--line); border-radius:14px; padding:24px; margin-top:16px; box-shadow:var(--shadow); }
    .grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
    .card { background:var(--soft); border:1px solid var(--line); border-radius:12px; padding:16px; }
    .card strong { display:block; margin-bottom:6px; font-size:18px; }
    code { font-family:Consolas, monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; }
    li { margin:7px 0; }
    .ok { color:var(--green); font-weight:900; }
    .warn { color:var(--amber); font-weight:900; }
    @media (max-width:860px) { .grid{grid-template-columns:1fr;} header,section{padding:22px;} h1{font-size:28px;} }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Rapport PDF terrain OutilsIA</h1>
    <p>Le PDF modèle/upgrade est la preuve lisible à partager après le scan, le benchmark et la recommandation matériel.</p>
  </header>
  <section>
    <h2>Quand le générer</h2>
    <div class="grid">
      <div class="card"><strong>1. Après analyse</strong><p>Le matériel doit être identifié : CPU, GPU, VRAM, RAM, OS et Ollama.</p></div>
      <div class="card"><strong>2. Après preuve locale</strong><p>Un benchmark réel doit exister avec modèle, tokens/s et durée.</p></div>
      <div class="card"><strong>3. Avant départ du PC</strong><p>Le PDF doit résumer modèle conseillé, upgrade utile et décision d'achat.</p></div>
    </div>
  </section>
  <section>
    <h2>Procédure dans l'app</h2>
    <ol>
      <li>Cliquer <strong>Analyser ce PC</strong>.</li>
      <li>Lancer le benchmark court recommandé.</li>
      <li>Comparer au moins un modèle installé si possible.</li>
      <li>Ouvrir le rapport machine prête.</li>
      <li>Cliquer <strong>PDF modèle/upgrade</strong>.</li>
      <li>Dans la fenêtre d'impression, choisir <strong>Enregistrer au format PDF</strong>.</li>
      <li>Nommer le fichier avec le profil terrain, par exemple <code>outilsia-rapport-old_laptop.pdf</code>.</li>
    </ol>
  </section>
  <section>
    <h2>Sections obligatoires</h2>
    <ul>
      <li><span class="ok">Décision immédiate</span> : ce PC peut faire quoi maintenant.</li>
      <li><span class="ok">Modèle à privilégier</span> : modèle léger ou modèle assistant conseillé.</li>
      <li><span class="ok">Preuve locale</span> : benchmark, PromptForge, Arena locale ou statut explicite.</li>
      <li><span class="ok">Upgrade utile</span> : achat seulement si un blocage réel est prouvé.</li>
      <li><span class="ok">Shopping / guides</span> : liens ou checklist achat sans survente.</li>
      <li><span class="ok">Build et SHA</span> : preuve que le test vient du bon binaire.</li>
    </ul>
  </section>
  <section>
    <h2>À ne pas faire</h2>
    <ul>
      <li><span class="warn">Ne pas</span> générer le PDF avant le benchmark.</li>
      <li><span class="warn">Ne pas</span> recommander un achat sans mesure locale.</li>
      <li><span class="warn">Ne pas</span> utiliser le PDF comme fiche terrain JSON : il complète la preuve, il ne remplace pas <code>outilsia-field-test-&lt;profil&gt;.json</code>.</li>
    </ul>
  </section>
</main>
</body>
</html>
`, "utf8");

  writeFileSync(join(kitDir, "OUVRIR-RAPPORT-PDF-TERRAIN.cmd"), [
    "@echo off",
    "start \"\" \"%~dp0RAPPORT-PDF-TERRAIN.html\"",
    ""
  ].join("\r\n"), "utf8");
}

function writeFiveMinuteRecipe(kitDir, release) {
  const buildId = release.build_id || "beta";
  const primary = release.primary_download || {};
  writeFileSync(join(kitDir, "RECETTE-5-MINUTES.html"), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Recette 5 minutes OutilsIA</title>
  <style>
    :root { --ink:#172033; --muted:#66758a; --line:#dbe4ef; --soft:#f5f8fc; --blue:#185abc; --green:#19735b; --amber:#9a5a00; --red:#9f2d2d; --shadow:0 16px 44px rgba(28,43,68,.10); }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, Arial, sans-serif; color:var(--ink); background:#edf2f8; line-height:1.46; }
    main { width:min(980px, calc(100% - 28px)); margin:28px auto; }
    header { background:#12335e; color:white; border-radius:14px; padding:30px 34px; box-shadow:var(--shadow); }
    h1 { margin:0; font-size:32px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:22px; }
    section { background:white; border:1px solid var(--line); border-radius:14px; padding:24px; margin-top:16px; box-shadow:var(--shadow); }
    .steps { display:grid; gap:10px; }
    .step { display:grid; grid-template-columns:44px 1fr; gap:14px; align-items:start; background:var(--soft); border:1px solid var(--line); border-radius:12px; padding:16px; }
    .num { width:34px; height:34px; border-radius:999px; display:grid; place-items:center; background:#e7f0ff; color:var(--blue); font-weight:900; }
    .step strong { display:block; font-size:18px; margin-bottom:4px; }
    .grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; }
    .box { background:var(--soft); border:1px solid var(--line); border-radius:12px; padding:16px; }
    code { font-family:Consolas, monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; }
    .ok { color:var(--green); font-weight:900; }
    .warn { color:var(--amber); font-weight:900; }
    .bad { color:var(--red); font-weight:900; }
    ul { margin:8px 0 0; padding-left:22px; }
    li { margin:6px 0; }
    @media (max-width:820px) { .grid{grid-template-columns:1fr;} header,section{padding:22px;} h1{font-size:28px;} }
    @media print { body{background:white;} main{width:100%; margin:0;} header,section{box-shadow:none;} }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Recette 5 minutes OutilsIA</h1>
    <p>Une fiche courte pour ne pas rater la preuve sur un PC physique. Elle complete le centre terrain, elle ne remplace pas les 5 vrais tests.</p>
  </header>

  <section>
    <h2>Ordre exact devant le PC</h2>
    <div class="steps">
      <div class="step"><span class="num">1</span><div><strong>Ouvrir le bon profil</strong><p>Lance <code>PROCHAIN-PC.cmd</code> ou le raccourci <code>TESTER-*.cmd</code>. Note le fichier attendu : <code>outilsia-field-test-&lt;profil&gt;.json</code>.</p></div></div>
      <div class="step"><span class="num">2</span><div><strong>Installer ou lancer l'app</strong><p>Utilise <code>INSTALLER-APP.cmd</code> si besoin. Build inclus : <code>${buildId}</code>.</p></div></div>
      <div class="step"><span class="num">3</span><div><strong>Analyser ce PC</strong><p>Dans OutilsIA, clique <strong>Analyser ce PC</strong>. Le haut de l'app doit afficher matériel, score, modèle conseillé, preuve/benchmark et upgrade utile.</p></div></div>
      <div class="step"><span class="num">4</span><div><strong>Obtenir une preuve locale</strong><p>Lance un benchmark réel si aucune preuve n'est visible. Puis teste PromptForge, une question locale, Arena locale et le rapport.</p></div></div>
      <div class="step"><span class="num">5</span><div><strong>Exporter la fiche terrain</strong><p>Dans <strong>Détails &gt; Test terrain</strong>, force le bon profil physique puis clique <strong>Télécharger fiche</strong>.</p></div></div>
      <div class="step"><span class="num">6</span><div><strong>Valider avant de quitter</strong><p>Lance <code>VALIDER-DERNIERE-FICHE.cmd</code>. Si ça échoue, retourne dans l'app et complète la preuve avant de passer au PC suivant.</p></div></div>
    </div>
  </section>

  <section>
    <h2>Preuve minimale attendue</h2>
    <div class="grid">
      <div class="box"><strong class="ok">Scan</strong><ul><li>OS</li><li>CPU</li><li>GPU/VRAM ou CPU-only</li><li>RAM</li></ul></div>
      <div class="box"><strong class="ok">Décision</strong><ul><li>Score</li><li>Modèle conseillé</li><li>Première action</li><li>Upgrade utile</li></ul></div>
      <div class="box"><strong class="ok">Usage local</strong><ul><li>Benchmark avec tokens/s</li><li>PromptForge</li><li>Dialogue local</li><li>Arena locale</li></ul></div>
      <div class="box"><strong class="ok">Sortie</strong><ul><li>Rapport généré ou partagé</li><li>Fiche JSON téléchargée</li><li>Validation PowerShell OK</li><li>Profil manuel correct</li></ul></div>
    </div>
  </section>

  <section>
    <h2>À ne pas faire</h2>
    <ul>
      <li><span class="bad">Ne pas</span> valider une fiche sans benchmark réel.</li>
      <li><span class="bad">Ne pas</span> utiliser le profil RTX 4080/4090 pour une autre machine.</li>
      <li><span class="bad">Ne pas</span> quitter le PC si <code>VALIDER-DERNIERE-FICHE.cmd</code> signale PromptForge, dialogue, Arena ou rapport manquant.</li>
      <li><span class="bad">Ne pas</span> annoncer le goal terminé tant que <code>FIELD-TESTS-STATUS.json</code> n'indique pas 5/5.</li>
    </ul>
  </section>

  <section>
    <h2>Build et retour</h2>
    <p><span class="ok">Installateur :</span> <code>${primary.name || "non renseigne"}</code></p>
    <p><span class="ok">SHA256 :</span> <code>${primary.sha256 || "non renseigne"}</code></p>
    <p><span class="warn">Après validation :</span> lance <code>EXPORTER-FICHES.cmd</code> ou copie le fichier <code>outilsia-field-test-*.json</code> vers le dossier <code>entries/</code> du kit principal.</p>
  </section>
</main>
</body>
</html>
`, "utf8");

  writeFileSync(join(kitDir, "OUVRIR-RECETTE-5-MINUTES.cmd"), [
    "@echo off",
    "start \"\" \"%~dp0RECETTE-5-MINUTES.html\"",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "OUVRIR-ACTIONS-RESTANTES.cmd"), [
    "@echo off",
    "start \"\" \"%~dp0FIELD-NEXT-ACTIONS.html\"",
    ""
  ].join("\r\n"), "utf8");
}

function writeStrictProfileRecipes(kitDir, release) {
  const buildId = release.build_id || "beta";
  const indexCards = Object.entries(STRICT_PROFILE_RECIPES).map(([profile, recipe]) => {
    const guide = PROFILE_GUIDES[profile] || {};
    return `
      <div class="card">
        <strong>${htmlEscape(recipe.title)}</strong>
        <p><code>${htmlEscape(profile)}</code> · ${htmlEscape(guide.target || "")}</p>
        <p>${htmlEscape(recipe.firstProof)}</p>
        <p><b>Commande :</b> <code>${htmlEscape(recipe.command)}</code></p>
      </div>`;
  }).join("");

  writeFileSync(join(kitDir, "RECETTES-STRICTES-PROFILS.html"), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Recettes strictes profils OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#65758b;--line:#dbe4ef;--soft:#f5f8fc;--blue:#12335e;--green:#19735b;--red:#b42318;--shadow:0 16px 44px rgba(28,43,68,.10)}
    *{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:var(--ink);background:#edf2f8;line-height:1.48}
    main{width:min(1040px,calc(100% - 28px));margin:28px auto}header,section{background:white;border:1px solid var(--line);border-radius:14px;padding:24px;margin-bottom:14px;box-shadow:var(--shadow)}
    header{background:var(--blue);color:white}h1{margin:0 0 8px;font-size:32px;letter-spacing:0}h2{margin:0 0 12px;font-size:22px}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:16px}.card strong{display:block;font-size:18px;margin-bottom:6px}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px;color:#172033}.ok{color:var(--green);font-weight:900}.bad{color:var(--red);font-weight:900}
    li{margin:7px 0}@media(max-width:820px){.grid{grid-template-columns:1fr}header,section{padding:20px}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Recettes strictes profils</h1>
    <p>Build <code>${htmlEscape(buildId)}</code>. Chaque recette force une preuve terrain claire : matériel, score, modèle conseillé, benchmark, upgrade utile et fiche validée.</p>
  </header>
  <section>
    <h2>Choisir la recette selon le PC physique</h2>
    <div class="grid">${indexCards}</div>
  </section>
  <section>
    <h2>Règle commune</h2>
    <ul>
      <li><span class="ok">UX 30s</span> : matériel visible, score visible, modèle conseillé, bouton/preuve benchmark, upgrade utile.</li>
      <li><span class="ok">Validation</span> : lancer <code>VALIDER-DERNIERE-FICHE.cmd</code> avant de quitter la machine.</li>
      <li><span class="bad">Interdit</span> : annoncer le goal terminé tant que les 5 profils ne sont pas prêts dans <code>FIELD-TESTS.json</code>.</li>
    </ul>
  </section>
</main>
</body>
</html>
`, "utf8");

  writeFileSync(join(kitDir, "OUVRIR-RECETTES-STRICTES.cmd"), [
    "@echo off",
    "start \"\" \"%~dp0RECETTES-STRICTES-PROFILS.html\"",
    ""
  ].join("\r\n"), "utf8");

  for (const [profile, recipe] of Object.entries(STRICT_PROFILE_RECIPES)) {
    const guide = PROFILE_GUIDES[profile] || {};
    const models = recipe.models.map((model) => `<code>${htmlEscape(model)}</code>`).join(", ");
    const mustConfirm = (guide.must_confirm || []).map((item) => `<li>${htmlEscape(item)}</li>`).join("");
    const pitfalls = [...(guide.pitfalls || []), ...recipe.hardRules].map((item) => `<li>${htmlEscape(item)}</li>`).join("");
    const expectedFile = `outilsia-field-test-${profile}.json`;

    writeFileSync(join(kitDir, recipe.file), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(recipe.title)} OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#65758b;--line:#dbe4ef;--soft:#f5f8fc;--blue:#12335e;--green:#19735b;--amber:#9a5a00;--red:#b42318;--shadow:0 16px 44px rgba(28,43,68,.10)}
    *{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:var(--ink);background:#edf2f8;line-height:1.48}
    main{width:min(980px,calc(100% - 28px));margin:28px auto}
    header,section{background:white;border:1px solid var(--line);border-radius:14px;padding:24px;margin-bottom:14px;box-shadow:var(--shadow)}
    header{background:var(--blue);color:white}
    h1{margin:0 0 8px;font-size:31px;letter-spacing:0}h2{margin:0 0 12px;font-size:22px}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .card{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:16px}
    .card strong{display:block;font-size:18px;margin-bottom:6px}.ok{color:var(--green);font-weight:900}.warn{color:var(--amber);font-weight:900}.bad{color:var(--red);font-weight:900}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px;color:#172033}
    li{margin:7px 0}.check li{list-style:"[ ] ";padding-left:4px}.no li{list-style:"! ";padding-left:4px}
    @media(max-width:780px){.grid{grid-template-columns:1fr}header,section{padding:20px}}
    @media print{body{background:white}main{width:100%;margin:0}header,section{box-shadow:none;break-inside:avoid}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>${htmlEscape(recipe.title)}</h1>
    <p>Profil attendu : <code>${htmlEscape(profile)}</code> · build <code>${htmlEscape(buildId)}</code>. Objectif : ${htmlEscape(guide.goal || "obtenir une preuve terrain propre")}.</p>
  </header>
  <section>
    <h2>Ce que l'utilisateur doit voir en 30 secondes</h2>
    <div class="grid">
      <div class="card"><strong>1. Matériel reconnu</strong><span>${htmlEscape(guide.target || "CPU, RAM, GPU/VRAM ou CPU-only visibles.")}</span></div>
      <div class="card"><strong>2. Score honnête</strong><span>${htmlEscape(guide.expected_score || "Score affiché avec une explication utile.")}</span></div>
      <div class="card"><strong>3. Modèle conseillé</strong><span>${models}</span></div>
      <div class="card"><strong>4. Benchmark court</strong><span>${htmlEscape(guide.benchmark_target || "Une preuve tokens/s doit être produite ou le blocage doit être expliqué.")}</span></div>
      <div class="card"><strong>5. Upgrade utile</strong><span>${htmlEscape(guide.upgrade_signal || "Upgrade proposé selon le vrai blocage.")}</span></div>
      <div class="card"><strong>6. Rapport terrain</strong><span>Fiche <code>${htmlEscape(expectedFile)}</code> validée avant de quitter la machine.</span></div>
    </div>
  </section>
  <section>
    <h2>Ordre strict devant la machine</h2>
    <ol>
      <li>Lancer <code>${htmlEscape(profileCommandName(profile))}</code> pour verrouiller le profil attendu.</li>
      <li>Ouvrir OutilsIA Local Cockpit, puis cliquer <strong>Analyser ce PC</strong>.</li>
      <li>Vérifier que le haut de l'app montre matériel, score, modèle conseillé et upgrade utile.</li>
      <li>Si Ollama manque, préparer Ollama Windows ou WSL, puis refaire le scan.</li>
      <li>Appliquer la première preuve : ${htmlEscape(recipe.firstProof)}</li>
      <li>Lancer un benchmark court. Une vitesse faible est acceptable si elle est mesurée et expliquée.</li>
      <li>Utiliser PromptForge, poser une question locale, puis vérifier l'Arena locale.</li>
      <li>Créer ou partager le rapport, puis exporter la fiche terrain.</li>
      <li>Lancer <code>VALIDER-DERNIERE-FICHE.cmd</code>. Si ça échoue, compléter le flux avant de partir.</li>
      <li>Lancer <code>EXPORTER-FICHES.cmd</code> pour ramener la preuve.</li>
    </ol>
  </section>
  <section>
    <h2>À confirmer</h2>
    <ul class="check">
      ${mustConfirm}
      <li>UX 30s complète : matériel visible, score visible, modèle conseillé, benchmark/proof, upgrade utile.</li>
    </ul>
  </section>
  <section>
    <h2>Interdits du profil</h2>
    <ul class="no">
      ${pitfalls}
      <li>Ne pas valider sans benchmark réel ou sans bouton/preuve benchmark visible.</li>
      <li>Ne pas accepter une fiche où le profil est inféré différemment sans verrou manuel <code>${htmlEscape(profile)}</code>.</li>
    </ul>
  </section>
  <section>
    <h2>Validation attendue</h2>
    <ul class="check">
      <li><code>FIELD-ENTRIES-VALIDATION.html</code> doit afficher <strong>${htmlEscape(profile)}</strong> en <span class="ok">ready</span>.</li>
      <li>La colonne <code>UX 30s</code> doit être <span class="ok">explicite</span> ou <span class="ok">deduite</span>.</li>
      <li>Le benchmark doit être supérieur à 0 tok/s.</li>
      <li>Le rapport partagé doit être une URL <code>https://outilsia.fr/r/...</code>.</li>
      <li>La fiche attendue est <code>${htmlEscape(expectedFile)}</code>.</li>
    </ul>
  </section>
</main>
</body>
</html>
`, "utf8");

    writeFileSync(join(kitDir, recipe.command), [
      "@echo off",
      `echo ${profile}> "%~dp0EXPECTED-FIELD-PROFILE.txt"`,
      `start "" "%~dp0${recipe.file}"`,
      `start "" "%~dp0BRIEF-${profile}.html"`,
      ""
    ].join("\r\n"), "utf8");
  }
}

function main() {
  const release = existsSync(releasePath) ? readJson(releasePath) : {};
  mkdirSync(kitDir, { recursive: true });
  mkdirSync(entriesDir, { recursive: true });
  const installerDir = join(kitDir, "installer");
  mkdirSync(installerDir, { recursive: true });

  const template = {
    schema: "outilsia.local_cockpit_field_tests.v1",
    tested_at: new Date().toISOString(),
    tester: "",
    app_version: release.version || "0.1.1",
    build_id: release.build_id || "",
    public_release: release.primary_download || {},
    machines: REQUIRED_PROFILES.map(templateMachine),
    notes: "Remplir chaque machine après un vrai lancement OutilsIA Local Cockpit : analyse, benchmark, PromptForge, dialogue, Arena, rapport."
  };

  const templatePath = join(kitDir, "FIELD-TESTS.template.json");
  const fieldTestsPath = fieldTestsJsonPath;
  const primaryDownload = release.primary_download || {};
  const installerSource = primaryDownload.name
    ? join(repoRoot, "server-work", "static", "downloads", "local-cockpit", primaryDownload.name)
    : "";
  for (const name of readdirSync(installerDir)) {
    if (/^OutilsIA-Local-Cockpit-/i.test(name) && name !== primaryDownload.name) {
      rmSync(join(installerDir, name), { force: true, recursive: true });
    }
  }
  const installerTarget = primaryDownload.name ? join(installerDir, primaryDownload.name) : "";
  let installerCopied = Boolean(installerSource && existsSync(installerSource));
  if (installerCopied) {
    copyFileSync(installerSource, installerTarget);
  } else if (primaryDownload.name && primaryDownload.url) {
    try {
      execFileSync("curl", ["-fsSL", absoluteDownloadUrl(primaryDownload.url), "-o", installerTarget], { stdio: "pipe" });
      installerCopied = existsSync(installerTarget);
    } catch (error) {
      installerCopied = false;
    }
  }
  if (installerCopied && primaryDownload.sha256 && sha256(installerTarget) !== primaryDownload.sha256) {
    rmSync(installerTarget, { force: true });
    throw new Error(`Installer SHA mismatch for ${primaryDownload.name}`);
  }

  writeFileSync(templatePath, `${JSON.stringify(template, null, 2)}\n`, "utf8");
  if (shouldRefreshFieldTestsJson(fieldTestsPath)) {
    writeFileSync(fieldTestsPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");
  }
  writeFileSync(join(kitDir, "FIELD-TESTS-README.md"), [
    "# FIELD-TESTS.json",
    "",
    "`FIELD-TESTS.json` est le fichier final a importer seulement quand les 5 machines physiques sont prouvees.",
    "",
    "Le generateur du kit applique cette regle :",
    "",
    "- si `FIELD-TESTS.json` est absent ou contient uniquement le gabarit vide, il est regenere avec le build courant ;",
    "- si `FIELD-TESTS.json` contient au moins une preuve reelle (scan, benchmark, PromptForge, dialogue, Arena ou rapport), il est preserve ;",
    "- les fiches unitaires doivent aller dans `entries/` sous la forme `outilsia-field-test-<profil>.json`.",
    "",
    "Commande finale :",
    "",
    "```bash",
    `npm run assemble:field-tests -- --dir ${entriesDir} --out ${fieldTestsJsonPath}`,
    `npm run import:field-tests -- --input ${fieldTestsJsonPath}`,
    "```",
    "",
    "L'assembleur refuse les fiches sans `build_id` et les collectes avec `build_id` mélangés. Les 5 machines doivent venir du même build public.",
    "",
  ].join("\n"), "utf8");
  writeFileSync(join(kitDir, "FIELD-KIT-MANIFEST.txt"), [
    `field_test_kit=${kitDir}`,
    `zip_dir=${zipRoot}`,
    `wsl_distro=${wslDistro}`,
    `wsl_repo_root=${wslRepoRoot}`,
    `build_id=${release.build_id || ""}`,
    `version=${release.version || ""}`,
    `installer=${installerCopied ? installerTarget : "missing"}`,
    `installer_name=${primaryDownload.name || ""}`,
    `installer_bytes=${installerCopied ? statSync(installerTarget).size : 0}`,
    `installer_sha256=${primaryDownload.sha256 || ""}`,
    `release_url=${primaryDownload.url || ""}`,
    `generated_at_utc=${new Date().toISOString()}`,
    ""
  ].join("\n"), "utf8");
  writeStartHere(kitDir, release);
  writeCatalogLivingGuide(kitDir);
  writeStrategyArenaBridgeGuide(kitDir);
  writeFieldPdfGuide(kitDir);
  writeFiveMinuteRecipe(kitDir, release);
  writeStrictProfileRecipes(kitDir, release);
  writeProfileExpectations(kitDir, release);
  writeOperatorChecklist(kitDir, release);
  writeProfileCards(kitDir, release);
  writeFieldDispatch(kitDir, release);
  writeFileSync(join(kitDir, "README-Field-Test.md"), [
    "# OutilsIA Local Cockpit - Field Test Kit",
    "",
    "Objectif : prouver la recette terrain sur 5 machines réelles.",
    "",
    "Ce dossier est autonome pour les tests Windows : il contient l'installeur public courant dans `installer/`, la mission terrain, les scripts de collecte et les validateurs.",
    "",
    "## Machines requises",
    "",
    "- `old_laptop` : vieux laptop ou portable modeste.",
    "- `core_i7_gtx_1080_ti` : vieux Core i7 + GTX 1080 Ti 11 Go.",
    "- `rtx_3060_12gb` : RTX 3060 12 Go.",
    "- `rtx_4080_4090` : RTX 4080 ou RTX 4090.",
    "- `cpu_only` : machine sans GPU dédié.",
    "",
    "## À remplir pour chaque machine",
    "",
    "- Matériel détecté : OS, CPU, GPU, RAM, VRAM.",
    "- Résultat 30 secondes : matériel reconnu, score visible, modèle conseillé, bouton/preuve benchmark, upgrade utile.",
    "- Benchmark : modèle, tokens/s, durée.",
    "- Flux complet : PromptForge, dialogue local, Arena, rapport.",
    "- Upgrade utile ou raison de ne pas upgrader.",
    "- Facultatif : Doctor 2.0, preuve CPU/GPU/hybride Ollama et digest AI Capability Passport.",
    "- Le Passport n'est pas une preuve d'identité et son absence ne bloque pas le terrain.",
    "",
    "## Flux recommande avec l'app",
    "",
    "1. Copier ce dossier sur la machine à tester, ou le garder sur une clé USB.",
    "2. Double-cliquer `OUVRIR-RECETTE-5-MINUTES.cmd` si tu veux la fiche courte à garder sous les yeux devant le PC.",
    "3. Double-cliquer `OUVRIR-CENTRE-TERRAIN.cmd` pour régénérer et ouvrir le centre de contrôle terrain.",
    "4. Double-cliquer `OUVRIR-START-HERE.cmd` si tu veux la page d'entrée détaillée du kit.",
    "5. Double-cliquer `INSTALLER-APP.cmd` si l'app n'est pas déjà installée.",
    "6. Double-cliquer `PROCHAIN-PC.cmd` pour voir uniquement le prochain profil attendu et les preuves à obtenir.",
    "7. Double-cliquer `OUVRIR-PROGRESSION-TERRAIN.cmd` pour voir le pourcentage terrain et le prochain profil à tester.",
    "8. Double-cliquer `OUVRIR-CHECKLIST-OPERATEUR.cmd` pour garder sous les yeux les 8 preuves bloquantes par PC.",
    "9. Double-cliquer `OUVRIR-DISPATCH.cmd` si tu testes une machine hors ordre et veux ouvrir directement sa fiche profil.",
    "10. Ouvrir le brief court du profil, par exemple `BRIEF-old_laptop.html`, pour garder les preuves minimales visibles.",
    "11. Double-cliquer `OUVRIR-CARTES-PROFILS.cmd` si tu veux les 5 cartes imprimables par machine.",
    "12. Ouvrir `FIELD-PROFILE-EXPECTATIONS.html` pour voir score attendu, modèles à surveiller et pièges à éviter par profil.",
    "13. Double-cliquer `OUVRIR-MISSION.cmd` si tu veux le tableau complet des 5 profils.",
    "14. Sur chaque machine, ouvrir OutilsIA Local Cockpit.",
    "15. Passer en `Details`.",
    "16. Optionnel : générer l'`AI Capability Passport` pour joindre son digest à la fiche.",
    "17. Ouvrir `Test terrain`.",
    "18. Choisir le `Profil terrain` attendu par `CENTRE-TERRAIN.html`, `PROCHAIN-PC.html`, `FIELD-PROGRESS.html`, `FIELD-DISPATCH.html`, `FIELD-PROFILE-CARDS.html`, `FIELD-PROFILE-EXPECTATIONS.html`, `FIELD-OPERATOR-CHECKLIST.html` ou `BRIEF-*.html`. Laisser `Auto selon le scan` seulement si l'inférence correspond au profil demandé.",
    "19. Cliquer `Telecharger fiche`.",
    "20. Double-cliquer `VALIDER-DERNIERE-FICHE.cmd` pour vérifier immédiatement que la fiche contient scan, benchmark, PromptForge, dialogue, Arena et rapport.",
    "21. Revenir sur la machine principale et double-cliquer `COLLECTER.cmd` pour récupérer automatiquement les fiches `outilsia-field-test-*.json` depuis Téléchargements vers `entries/`.",
    "22. Double-cliquer `VALIDER-FICHES.cmd` pour valider toutes les fiches présentes et voir immédiatement les profils manquants/incomplets.",
    "23. Double-cliquer `EXPORTER-FICHES.cmd` si cette machine terrain doit renvoyer ses fiches par USB, réseau ou messagerie. Le zip peut ensuite être décompressé dans `entries/` sur la machine principale.",
    "24. Sur la machine principale, placer le zip transféré dans ce dossier ou dans Téléchargements, puis double-cliquer `IMPORTER-PACK-FICHES.cmd`.",
    "25. Double-cliquer `PREPARER-KIT-USB.cmd` pour copier le kit complet vers une clé USB ou un dossier de transfert avant d'aller sur les autres PC.",
    "26. Double-cliquer `OUVRIR-CENTRE-TERRAIN.cmd`, `OUVRIR-PROGRESSION-TERRAIN.cmd` ou `PROCHAIN-PC.cmd` pour voir le profil suivant.",
    "27. Double-cliquer `STATUT.cmd` pour voir les profils prets, manquants ou incomplets.",
    "28. Double-cliquer `VERIFIER-KIT.cmd` avant de partir sur un PC distant : le script confirme le SHA de l'installeur et les fichiers indispensables.",
    "29. Double-cliquer `AUDIT-TERRAIN.cmd` pour obtenir un verdict unique : pret / pas pret, prochain PC, manques et fichiers à ouvrir.",
    "29. Quand les 5 profils sont présents, double-cliquer `ASSEMBLER.cmd`.",
    "30. Double-cliquer `IMPORTER.cmd` pour valider et importer le `FIELD-TESTS.json` final.",
    "31. Double-cliquer `VALIDER-GOAL.cmd` pour enchainer collecte, statut, assemblage, import et audit global.",
    "",
    "Raccourci : après avoir exporté les fiches depuis l'app, double-cliquer `VALIDER-FICHES.cmd`, puis `EXPORTER-FICHES.cmd` si tu changes de machine. Sur la machine principale, double-cliquer `IMPORTER-PACK-FICHES.cmd`, puis `COLLECTER-ET-ASSEMBLER.cmd` / `VALIDER-GOAL.cmd`.",
    "",
    "`OUVRIR-CENTRE-TERRAIN.cmd` et `STATUT.cmd` génèrent `CENTRE-TERRAIN.html`, `FIELD-PROGRESS.html`, `FIELD-TESTS-STATUS.md`, `MISSION-TERRAIN.html`, `PROCHAIN-PC.html` et indiquent le prochain profil à tester.",
    "",
    "`VERIFIER-KIT.cmd` génère `FIELD-KIT-SELF-CHECK.md` et `FIELD-KIT-SELF-CHECK.html` : il vérifie l'installeur inclus, son SHA256 et les fichiers indispensables du kit.",
    "",
    "`AUDIT-TERRAIN.cmd` génère `AUDIT-TERRAIN.md` et `AUDIT-TERRAIN.html` : c'est le verdict court à lire avant de penser que la campagne terrain est terminée.",
    "",
    "Ouvre `CENTRE-TERRAIN.html` pendant les tests : c'est le tableau de bord court avec progression, prochain PC, raccourcis et profils.",
    "",
    "Ouvre `PROCHAIN-PC.html` pendant les tests : c'est la fiche courte qui dit quel PC tester maintenant, quelles preuves obtenir et quel fichier exporter.",
    "",
    "Ouvre `FIELD-PROGRESS.html` ou `OUVRIR-PROGRESSION-TERRAIN.cmd` pour voir le pourcentage terrain, les profils prêts et le prochain profil à tester.",
    "",
    "Ouvre `START-HERE.html` si tu veux une page simple avec les raccourcis du kit et la checklist par machine.",
    "",
    "Ouvre `RECETTE-5-MINUTES.html` ou `OUVRIR-RECETTE-5-MINUTES.cmd` si tu veux la version courte devant un PC physique : ordre exact, preuve minimale et erreurs à éviter.",
    "",
    "Ouvre `FIELD-OPERATOR-CHECKLIST.html` ou `OUVRIR-CHECKLIST-OPERATEUR.cmd` si tu veux une seule feuille avec les 8 preuves bloquantes et les pièges par profil.",
    "",
    "Ouvre `FIELD-DISPATCH.html` ou `OUVRIR-DISPATCH.cmd` si tu veux lancer une fiche profil précise, par exemple `TESTER-RTX-3060-12GB.cmd`.",
    "",
    "Ouvre `BRIEF-<profil>.html` pour garder sous les yeux les preuves minimales du profil en cours : objectif, résultat attendu, erreurs à éviter et fichier JSON attendu.",
    "",
    "Ouvre `MISSION-TERRAIN.html` pour le tableau complet des 5 profils.",
    "",
    "Ouvre `FIELD-PROFILE-CARDS.html` pour imprimer ou afficher les 5 cartes physiques à tester.",
    "",
    "Ouvre `FIELD-PROFILE-EXPECTATIONS.html` pour vérifier le score attendu, les modèles à surveiller, le benchmark attendu, l'upgrade attendu et les pièges à éviter pour chaque profil.",
    "",
    "`VALIDER-FICHES.cmd` génère `FIELD-ENTRIES-VALIDATION.md` : c'est le contrôle intermédiaire avant assemblage final.",
    "",
    "`EXPORTER-FICHES.cmd` génère un zip `outilsia-field-entries-transfer-*.zip` contenant `entries/`, les rapports de validation et un manifeste. Il fonctionne sans WSL/npm et ne prétend pas que les 5 profils sont terminés.",
    "",
    "`IMPORTER-PACK-FICHES.cmd` cherche le dernier zip `outilsia-field-entries-transfer-*.zip` dans ce dossier puis dans Téléchargements, copie les fiches dans `entries/`, écrit `FIELD-ENTRIES-IMPORT.md`, puis relance `VALIDER-FICHES-WINDOWS.ps1`.",
    "",
    "`PREPARER-KIT-USB.cmd` copie le dossier terrain complet, le zip `OutilsIA-Local-Cockpit-Field-Test-Kit-*.zip` et le manifeste SHA256 vers un support amovible ou un dossier choisi. Il fonctionne sans WSL/npm.",
    "",
    "Important : le générateur de kit préserve `entries/` et ne remplace pas un `FIELD-TESTS.json` déjà assemblé. Le fichier vierge de référence est `FIELD-TESTS.template.json`.",
    "",
    "Le script d'assemblage refuse les profils manquants et l'importeur refuse les fiches incomplètes.",
    "",
    "## Validation manuelle",
    "",
    "Depuis le workspace OutilsIA :",
    "",
    "```bash",
    "cd local-cockpit-app",
    `npm run assemble:field-tests -- --dir ${entriesDir} --out ${fieldTestsJsonPath}`,
    `npm run import:field-tests -- --input ${fieldTestsJsonPath}`,
    "```",
    "",
    "Important : l'assemblage refuse les fiches sans `build_id` ou avec des `build_id` mélangés. Les 5 preuves terrain doivent venir du même build public.",
    "",
    "Ancien mode si tu remplis directement le fichier :",
    "",
    "```bash",
    "cd local-cockpit-app",
    `npm run import:field-tests -- --input ${fieldTestsJsonPath}`,
    "```",
    "",
    "Le validateur refuse les tests incomplets. Tant que les 5 machines ne sont pas remplies avec benchmark et rapport, l'audit global reste incomplet.",
    "",
    `Build public courant : \`${release.build_id || "non renseigné"}\``,
    `Fichier Windows : \`${primaryDownload.name || "non renseigné"}\``,
    `SHA256 : \`${primaryDownload.sha256 || "non renseigné"}\``,
    ""
  ].join("\n"), "utf8");

  writeFileSync(join(kitDir, "MISSION-TERRAIN.html"), [
    "<!doctype html>",
    "<html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>Mission terrain OutilsIA</title>",
    "<style>body{font-family:Segoe UI,Arial,sans-serif;margin:32px;background:#eef2f7;color:#162033}main{max-width:900px;margin:auto;background:white;border:1px solid #dce4ef;border-radius:14px;padding:28px;box-shadow:0 16px 50px rgba(28,43,68,.10)}code{background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}li{margin:8px 0}</style>",
    "</head><body><main>",
    "<h1>Mission terrain OutilsIA</h1>",
    "<p>Double-clique <strong>STATUT.cmd</strong> pour generer la mission a jour avec les profils prets, manquants et le prochain PC a tester.</p>",
    "<ol>",
    "<li>Exporter une fiche depuis OutilsIA : Details &gt; Test terrain &gt; choisir le Profil terrain attendu &gt; Telecharger fiche.</li>",
    "<li>Lancer <code>COLLECTER.cmd</code>.</li>",
    "<li>Lancer <code>STATUT.cmd</code> pour mettre cette page a jour.</li>",
    "</ol>",
    "</main></body></html>",
    ""
  ].join("\n"), "utf8");

  writeFileSync(join(kitDir, "PROCHAIN-PC.html"), [
    "<!doctype html>",
    "<html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>Prochain PC terrain OutilsIA</title>",
    "<style>body{font-family:Segoe UI,Arial,sans-serif;margin:32px;background:#eef2f7;color:#162033}main{max-width:820px;margin:auto;background:white;border:1px solid #dce4ef;border-radius:14px;padding:28px;box-shadow:0 16px 50px rgba(28,43,68,.10)}code{background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}</style>",
    "</head><body><main>",
    "<h1>Prochain PC terrain OutilsIA</h1>",
    "<p>Double-clique <strong>PROCHAIN-PC.cmd</strong> ou <strong>STATUT.cmd</strong> pour generer la fiche a jour.</p>",
    "</main></body></html>",
    ""
  ].join("\n"), "utf8");

  writeFileSync(join(kitDir, "TEST-EXPRESS-PROCHAIN-PC.html"), [
    "<!doctype html>",
    "<html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>Test express prochain PC OutilsIA</title>",
    "<style>body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#eef2f7;color:#162033;line-height:1.45}main{max-width:880px;margin:28px auto;background:white;border:1px solid #dce4ef;border-radius:14px;overflow:hidden;box-shadow:0 16px 50px rgba(28,43,68,.10)}header{background:#12335e;color:white;padding:30px 34px}section{padding:24px 34px;border-top:1px solid #dce4ef}.warn{background:#fff8e7}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.card{background:#f5f8fc;border:1px solid #dbe4ef;border-radius:12px;padding:14px}code{background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px;font-family:Consolas,monospace}li{margin:7px 0}@media(max-width:780px){main{margin:14px}.grid{grid-template-columns:1fr}header,section{padding:22px}}</style>",
    "</head><body><main>",
    "<header><h1>Test express prochain PC</h1><p>Double-clique <strong>OUVRIR-TEST-EXPRESS.cmd</strong> ou <strong>STATUT.cmd</strong> pour generer cette page avec le profil a jour.</p></header>",
    "<section class=\"warn\"><h2>Regle bloquante</h2><p>Sans fichier <code>outilsia-field-test-&lt;profil&gt;.json</code> valide, le test ne compte pas. Le PDF et les captures aident, mais ne remplacent pas la fiche JSON.</p></section>",
    "<section><h2>8 gestes terrain</h2><ol><li>Installer ou ouvrir OutilsIA Local Cockpit.</li><li>Cliquer <strong>Analyser ce PC</strong>.</li><li>Verifier CPU, GPU/VRAM ou CPU-only, RAM et OS.</li><li>Lancer le benchmark leger propose.</li><li>Tester PromptForge ou le justifier.</li><li>Poser une question locale au modele conseille.</li><li>Verifier Arena locale et rapport.</li><li>Telecharger la fiche terrain puis lancer <code>VALIDER-DERNIERE-FICHE.cmd</code>.</li></ol></section>",
    "</main></body></html>",
    ""
  ].join("\n"), "utf8");

  writeFileSync(join(kitDir, "CENTRE-TERRAIN.html"), [
    "<!doctype html>",
    "<html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>Centre terrain OutilsIA</title>",
    "<style>body{font-family:Segoe UI,Arial,sans-serif;margin:32px;background:#eef2f7;color:#162033}main{max-width:860px;margin:auto;background:white;border:1px solid #dce4ef;border-radius:14px;padding:28px;box-shadow:0 16px 50px rgba(28,43,68,.10)}code{background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}</style>",
    "</head><body><main>",
    "<h1>Centre terrain OutilsIA</h1>",
    "<p>Double-clique <strong>OUVRIR-CENTRE-TERRAIN.cmd</strong> ou <strong>STATUT.cmd</strong> pour generer le centre de controle a jour.</p>",
    "</main></body></html>",
    ""
  ].join("\n"), "utf8");

  writeFileSync(join(kitDir, "OUVRIR-MISSION.cmd"), [
    "@echo off",
    "start \"\" \"%~dp0MISSION-TERRAIN.html\"",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "OUVRIR-START-HERE.cmd"), [
    "@echo off",
    "start \"\" \"%~dp0START-HERE.html\"",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "OUVRIR-RECETTE-5-MINUTES.cmd"), [
    "@echo off",
    "start \"\" \"%~dp0RECETTE-5-MINUTES.html\"",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "OUVRIR-TEST-EXPRESS.cmd"), [
    "@echo off",
    "setlocal",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0STATUT-WINDOWS.ps1\"",
    "if errorlevel 2 goto open_anyway",
    "start \"\" \"%~dp0TEST-EXPRESS-PROCHAIN-PC.html\"",
    "pause",
    "exit /b 0",
    ":open_anyway",
    "echo Statut incomplet: ouverture de la checklist express statique.",
    "start \"\" \"%~dp0TEST-EXPRESS-PROCHAIN-PC.html\"",
    "pause",
    "exit /b 1",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "OUVRIR-CENTRE-TERRAIN.cmd"), [
    "@echo off",
    "setlocal",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0STATUT-WINDOWS.ps1\"",
    "if errorlevel 2 goto fail",
    "echo.",
    "echo Centre terrain: %~dp0CENTRE-TERRAIN.html",
    "start \"\" \"%~dp0CENTRE-TERRAIN.html\"",
    "pause",
    "exit /b 0",
    ":fail",
    "echo Impossible de generer le centre terrain Windows.",
    "pause",
    "exit /b 1",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "OUVRIR-CARTES-PROFILS.cmd"), [
    "@echo off",
    "start \"\" \"%~dp0FIELD-PROFILE-CARDS.html\"",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "OUVRIR-PROGRESSION-TERRAIN.cmd"), [
    "@echo off",
    "setlocal",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0STATUT-WINDOWS.ps1\"",
    "if errorlevel 2 goto fail",
    "echo.",
    "echo Progression terrain: %~dp0FIELD-PROGRESS.html",
    "start \"\" \"%~dp0FIELD-PROGRESS.html\"",
    "pause",
    "exit /b 0",
    ":fail",
    "echo Impossible de generer la progression terrain Windows.",
    "pause",
    "exit /b 1",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "PREPARER-PROCHAIN-PC.cmd"), [
    "@echo off",
    "setlocal",
    "set \"KIT_DIR=%~dp0\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%KIT_DIR%PREPARER-PROCHAIN-PC-WINDOWS.ps1\"",
    "echo.",
    "echo Rapport pack prochain PC: %KIT_DIR%NEXT-PC-PACK.md",
    "echo Version JSON: %KIT_DIR%NEXT-PC-PACK.json",
    "start \"\" \"%KIT_DIR%NEXT-PC-PACK.md\"",
    "pause",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "PROCHAIN-PC.cmd"), [
    "@echo off",
    "setlocal",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0STATUT-WINDOWS.ps1\"",
    "if errorlevel 2 goto fail",
    "echo.",
    "echo Fiche prochain PC: %~dp0PROCHAIN-PC.html",
    "start \"\" \"%~dp0CENTRE-TERRAIN.html\"",
    "start \"\" \"%~dp0PROCHAIN-PC.html\"",
    "pause",
    "exit /b 0",
    ":fail",
    "echo Impossible de generer la fiche prochain PC Windows.",
    "pause",
    "exit /b 1",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "PREPARER-PROCHAIN-PC-WINDOWS.ps1"), String.raw`param(
  [string]$Profile = ""
)

$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Host "next_pc_pack_invalid $message" -ForegroundColor Red
  exit 1
}

function Copy-Required($Name, $Destination) {
  $source = Join-Path $PSScriptRoot $Name
  if (!(Test-Path -LiteralPath $source)) { Fail "fichier introuvable: $Name" }
  Copy-Item -LiteralPath $source -Destination (Join-Path $Destination $Name) -Force
}

function Sha256($Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$statusScript = Join-Path $PSScriptRoot "STATUT-WINDOWS.ps1"
if (!(Test-Path -LiteralPath $statusScript)) { Fail "STATUT-WINDOWS.ps1 introuvable" }
try {
  powershell -NoProfile -ExecutionPolicy Bypass -File $statusScript | Out-Host
} catch {
  # Statut incomplet attendu tant que les 5 machines ne sont pas collectees.
}

$progressPath = Join-Path $PSScriptRoot "FIELD-PROGRESS.json"
if (!(Test-Path -LiteralPath $progressPath)) { Fail "FIELD-PROGRESS.json introuvable" }
$progress = Get-Content -LiteralPath $progressPath -Raw -Encoding UTF8 | ConvertFrom-Json
$manifestPath = Join-Path $PSScriptRoot "FIELD-KIT-MANIFEST.txt"
if (!(Test-Path -LiteralPath $manifestPath)) { Fail "FIELD-KIT-MANIFEST.txt introuvable" }
$manifest = @{}
Get-Content -LiteralPath $manifestPath -Encoding UTF8 | ForEach-Object {
  if ($_ -match "^([^=]+)=(.*)$") { $manifest[$matches[1]] = $matches[2] }
}
$expectedBuildId = [string]$manifest["build_id"]
$expectedAppVersion = [string]$manifest["version"]
$expectedInstallerName = [string]$manifest["installer_name"]
$expectedInstallerSha = ([string]$manifest["installer_sha256"]).ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($expectedBuildId)) { Fail "build_id absent du manifeste terrain" }
if ([string]::IsNullOrWhiteSpace($expectedAppVersion)) { Fail "version absente du manifeste terrain" }
if ([string]::IsNullOrWhiteSpace($expectedInstallerName)) { Fail "installer_name absent du manifeste terrain" }
if ([string]::IsNullOrWhiteSpace($expectedInstallerSha)) { Fail "installer_sha256 absent du manifeste terrain" }
$profile = if ([string]::IsNullOrWhiteSpace($Profile)) { [string]$progress.next_profile } else { [string]$Profile }
if ([string]::IsNullOrWhiteSpace($profile)) { Fail "aucun profil: la campagne semble deja complete" }
$knownProfiles = @($progress.profiles | ForEach-Object { [string]$_.profile })
if ($knownProfiles -notcontains $profile) { Fail "profil inconnu: $profile" }

$commandProfile = $profile.ToUpperInvariant().Replace("_", "-")
$dispatchHtml = "FIELD-DISPATCH-$profile.html"
$profileCommand = "TESTER-$commandProfile.cmd"
$parent = Split-Path -Parent $PSScriptRoot
$targetName = "OutilsIA-Next-PC-$profile"
$target = Join-Path $parent $targetName
$zip = Join-Path $parent "$targetName.zip"
$zipShaFile = "$zip.sha256.txt"
if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
if (Test-Path -LiteralPath $zipShaFile) { Remove-Item -LiteralPath $zipShaFile -Force }
New-Item -ItemType Directory -Force -Path $target | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $target "installer") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $target "entries") | Out-Null

$files = @(
  "START-HERE.html",
  "RECETTE-5-MINUTES.html",
  "RAPPORT-PDF-TERRAIN.html",
  "CATALOGUE-VIVANT.html",
  "PONT-STRATEGY-ARENA.html",
  "TEST-EXPRESS-PROCHAIN-PC.html",
  "OUVRIR-TEST-EXPRESS.cmd",
  "STATUT-WINDOWS.ps1",
  "PROCHAIN-PC.html",
  "PROCHAIN-PC.cmd",
  "FIELD-PROGRESS.html",
  "FIELD-PROGRESS.json",
  "FIELD-PROGRESS.md",
  $dispatchHtml,
  "BRIEF-$profile.md",
  "BRIEF-$profile.html",
  $profileCommand,
  "INSTALLER-APP.cmd",
  "OUVRIR-CATALOGUE-VIVANT.cmd",
  "OUVRIR-PONT-STRATEGY-ARENA.cmd",
  "OUVRIR-RAPPORT-PDF-TERRAIN.cmd",
  "VALIDER-DERNIERE-FICHE.cmd",
  "VALIDER-FICHE-WINDOWS.ps1",
  "VALIDER-FICHES.cmd",
  "VALIDER-FICHES-WINDOWS.ps1",
  "EXPORTER-FICHES.cmd",
  "EXPORTER-FICHES-WINDOWS.ps1",
  "COLLECTER.cmd"
)
foreach ($file in $files) { Copy-Required $file $target }

$startHerePackHtml = @"
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Demarrer le test terrain OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#66758a;--line:#dbe4ef;--soft:#f5f8fc;--blue:#12335e;--green:#19735b;--amber:#9a5a00;--shadow:0 16px 44px rgba(28,43,68,.10)}
    *{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:var(--ink);background:#edf2f8;line-height:1.48}
    main{width:min(980px,calc(100% - 28px));margin:28px auto}
    header{background:var(--blue);color:white;border-radius:14px;padding:30px 34px;box-shadow:var(--shadow)}
    h1{margin:0 0 8px;font-size:32px;letter-spacing:0}h2{margin:0 0 12px;font-size:22px}
    section{background:white;border:1px solid var(--line);border-radius:14px;padding:24px;margin-top:16px;box-shadow:var(--shadow)}
    .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.step,.action{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:16px}
    .step strong,.action b{display:block;font-size:18px;margin-bottom:6px}.num{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:999px;background:#e7f0ff;color:#185abc;font-weight:900;margin-bottom:10px}
    .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}
    .ok{color:var(--green);font-weight:900}.warn{color:var(--amber);font-weight:900}li{margin:7px 0}
    @media(max-width:820px){.grid,.actions{grid-template-columns:1fr}header,section{padding:22px}h1{font-size:28px}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Demarrer le test terrain OutilsIA</h1>
    <p>Pack autonome pour le profil <strong>$profile</strong>. Objectif : produire une fiche JSON valide, pas refaire toute la roadmap.</p>
  </header>

  <section>
    <h2>Ordre simple</h2>
    <div class="grid">
      <div class="step"><span class="num">1</span><strong>Ouvrir le test express</strong><p>Double-clique <code>DEMARRER-TEST-TERRAIN.cmd</code> ou <code>OUVRIR-TEST-EXPRESS.cmd</code>.</p></div>
      <div class="step"><span class="num">2</span><strong>Tester dans OutilsIA</strong><p>Clique <strong>Analyser ce PC</strong>, puis obtiens scan, benchmark, PromptForge, dialogue, Arena et rapport.</p></div>
      <div class="step"><span class="num">3</span><strong>Valider avant de partir</strong><p>Après <strong>Télécharger fiche</strong>, lance <code>VALIDER-DERNIERE-FICHE.cmd</code>, puis <code>EXPORTER-FICHES.cmd</code>.</p></div>
    </div>
  </section>

  <section>
    <h2>Raccourcis présents dans ce pack</h2>
    <div class="actions">
      <div class="action"><b>Départ recommandé</b><code>DEMARRER-TEST-TERRAIN.cmd</code><p>Vérifie le pack et ouvre uniquement les pages utiles pour ce PC.</p></div>
      <div class="action"><b>Test express</b><code>OUVRIR-TEST-EXPRESS.cmd</code><p>8 gestes terrain et règle bloquante du fichier JSON.</p></div>
      <div class="action"><b>Profil attendu</b><code>$profileCommand</code><p>Brief du profil physique à tester maintenant.</p></div>
      <div class="action"><b>Preuves</b><code>PREUVES-ATTENDUES.html</code><p>Liste courte de ce que la fiche doit contenir.</p></div>
      <div class="action"><b>Installer app</b><code>INSTALLER-APP.cmd</code><p>Installe le build Windows inclus si besoin.</p></div>
      <div class="action"><b>Valider fiche</b><code>VALIDER-DERNIERE-FICHE.cmd</code><p>Contrôle la dernière fiche téléchargée avant de quitter le PC.</p></div>
    </div>
  </section>

  <section>
    <h2>Fichier attendu</h2>
    <p><span class="ok">Profil :</span> <code>$profile</code></p>
    <p><span class="ok">Fiche :</span> <code>outilsia-field-test-$profile.json</code></p>
    <p><span class="warn">Important :</span> le PDF ou une capture ne remplace pas la fiche JSON terrain.</p>
  </section>
</main>
</body>
</html>
"@
$startHerePackHtml | Set-Content -LiteralPath (Join-Path $target "START-HERE.html") -Encoding UTF8

$installerDir = Join-Path $PSScriptRoot "installer"
if (!(Test-Path -LiteralPath $installerDir)) { Fail "dossier installer introuvable" }
$installerPath = Join-Path $installerDir $expectedInstallerName
if (!(Test-Path -LiteralPath $installerPath -PathType Leaf)) { Fail "installeur attendu introuvable: $expectedInstallerName" }
$actualInstallerSha = Sha256 $installerPath
if ($actualInstallerSha -ne $expectedInstallerSha) { Fail "SHA256 installeur source invalide: $expectedInstallerName" }
Copy-Item -LiteralPath $installerPath -Destination (Join-Path (Join-Path $target "installer") $expectedInstallerName) -Force

Set-Content -LiteralPath (Join-Path $target "EXPECTED-FIELD-PROFILE.txt") -Value $profile -Encoding UTF8
Set-Content -LiteralPath (Join-Path $target "EXPECTED-BUILD-ID.txt") -Value $expectedBuildId -Encoding UTF8
Set-Content -LiteralPath (Join-Path $target "EXPECTED-APP-VERSION.txt") -Value $expectedAppVersion -Encoding UTF8
Set-Content -LiteralPath (Join-Path $target "EXPECTED-INSTALLER-NAME.txt") -Value $expectedInstallerName -Encoding UTF8
Set-Content -LiteralPath (Join-Path $target "EXPECTED-INSTALLER-SHA256.txt") -Value $expectedInstallerSha -Encoding UTF8
$readme = @(
  "# OutilsIA - pack prochain PC",
  "",
  "Profil attendu: $profile",
  "Build attendu: $expectedBuildId",
  "Version app attendue: $expectedAppVersion",
  "SHA256 installeur attendu: $expectedInstallerSha",
  "Progression actuelle: $($progress.percent)%",
  "Profils prets: $($progress.ready)/$($progress.required)",
  "",
  "## Sur le PC a tester",
  "",
  "1. Lancer DEMARRER-TEST-TERRAIN.cmd.",
  "2. Installer l'app avec INSTALLER-APP.cmd si OutilsIA Local Cockpit n'est pas installe.",
  "3. Dans l'app, cliquer Analyser ce PC.",
  "4. Obtenir scan, benchmark, PromptForge, dialogue, Arena et rapport.",
  "5. Exporter la fiche terrain avec le profil manuel: $profile.",
  "6. Lancer VALIDER-DERNIERE-FICHE.cmd avant de quitter le PC.",
  "7. Lancer EXPORTER-FICHES.cmd pour ramener le zip vers la machine principale.",
  "",
  "DEMARRER-TEST-TERRAIN.cmd ouvre aussi TEST-EXPRESS-PROCHAIN-PC.html, START-HERE.html, PREUVES-ATTENDUES.html, BRIEF-$profile.html et $profileCommand.",
  "",
  "## Fichier attendu",
  "",
  "outilsia-field-test-$profile.json"
)
$readme | Set-Content -LiteralPath (Join-Path $target "README-NEXT-PC.md") -Encoding UTF8

$proofChecklist = @(
  "# Preuves attendues OutilsIA",
  "",
  "Profil terrain: $profile",
  "",
  "Avant de quitter cette machine, verifier que la fiche exportee contient :",
  "",
  "- scan materiel detecte ;",
  "- score machine ;",
  "- modele conseille ;",
  "- benchmark avec tokens/s superieur a 0 ;",
  "- PromptForge utilise ou statut explicite ;",
  "- dialogue local ou statut explicite ;",
  "- Arena locale ou statut explicite ;",
  "- rapport partageable avec URL ;",
  "- upgrade utile ;",
  "- profil terrain manuel: $profile.",
  "- build public: $expectedBuildId.",
  "",
  "Ordre recommande :",
  "",
  "1. Lancer DEMARRER-TEST-TERRAIN.cmd.",
  "2. Installer l'app si necessaire.",
  "3. Faire le test dans OutilsIA Local Cockpit.",
  "4. Exporter la fiche terrain.",
  "5. Lancer VALIDER-DERNIERE-FICHE.cmd.",
  "6. Lancer EXPORTER-FICHES.cmd."
)
$proofChecklist | Set-Content -LiteralPath (Join-Path $target "PREUVES-ATTENDUES.md") -Encoding UTF8
$proofHtml = @"
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Preuves attendues OutilsIA</title>
  <style>
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#eef3f8;color:#172033}
    main{width:min(900px,calc(100% - 28px));margin:28px auto}
    header,section{background:white;border:1px solid #dbe4ef;border-radius:14px;padding:24px;margin-bottom:14px;box-shadow:0 10px 28px rgba(28,43,68,.08)}
    header{background:#12335e;color:white}
    h1{margin:0 0 8px;font-size:30px}
    li{margin:8px 0}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Preuves attendues OutilsIA</h1>
    <p>Profil terrain : <code>$profile</code></p>
  </header>
  <section>
    <h2>Fiche terrain complete</h2>
    <ul>
      <li>Scan materiel detecte.</li>
      <li>Score machine et modele conseille visibles.</li>
      <li>Benchmark avec tokens/s superieur a 0.</li>
      <li>PromptForge, dialogue local, Arena locale et rapport avec statut explicite.</li>
      <li>Upgrade utile et profil manuel <code>$profile</code>.</li>
    </ul>
  </section>
  <section>
    <h2>Ordre a suivre</h2>
    <ol>
      <li>Lancer <code>DEMARRER-TEST-TERRAIN.cmd</code>.</li>
      <li>Installer l'app si necessaire.</li>
      <li>Exporter la fiche, puis lancer <code>VALIDER-DERNIERE-FICHE.cmd</code>.</li>
      <li>Lancer <code>EXPORTER-FICHES.cmd</code>.</li>
    </ol>
  </section>
</main>
</body>
</html>
"@
$proofHtml | Set-Content -LiteralPath (Join-Path $target "PREUVES-ATTENDUES.html") -Encoding UTF8

$expressPackHtml = @"
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Test express prochain PC OutilsIA</title>
  <style>
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#edf2f8;color:#172033;line-height:1.45}
    main{width:min(920px,calc(100% - 28px));margin:28px auto}
    header{background:#12335e;color:white;border-radius:14px;padding:30px 34px;box-shadow:0 16px 46px rgba(28,43,68,.12)}
    section{background:white;border:1px solid #dbe4ef;border-radius:14px;padding:24px;margin-top:16px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    .hero{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}
    .card{background:#f5f8fc;border:1px solid #dbe4ef;border-radius:12px;padding:16px}
    .card strong{display:block;font-size:22px;margin-bottom:4px}
    .rule{border-color:#f3c969;background:#fff8e7}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}
    li{margin:8px 0}.danger{color:#b42318;font-weight:900}
    @media(max-width:780px){.hero{grid-template-columns:1fr}header,section{padding:22px}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Test express prochain PC</h1>
    <p>Pack autonome pour produire une fiche terrain valide avant de quitter la machine.</p>
  </header>
  <section class="hero">
    <div class="card">
      <span>A tester maintenant</span>
      <strong>$profile</strong>
      <p><code>$profile</code></p>
    </div>
    <div class="card rule">
      <span class="danger">Regle bloquante</span>
      <p>Sans fichier <code>outilsia-field-test-$profile.json</code> valide, le PC ne compte pas. Le PDF et les captures ne remplacent pas la fiche JSON.</p>
    </div>
  </section>
  <section>
    <h2>8 gestes terrain</h2>
    <ol>
      <li>Installer ou ouvrir OutilsIA Local Cockpit.</li>
      <li>Cliquer <strong>Analyser ce PC</strong>.</li>
      <li>Verifier CPU, GPU/VRAM ou CPU-only, RAM et OS.</li>
      <li>Lancer le benchmark leger propose.</li>
      <li>Tester PromptForge ou le justifier.</li>
      <li>Poser une question locale au modele conseille.</li>
      <li>Verifier Arena locale et rapport.</li>
      <li>Telecharger <code>outilsia-field-test-$profile.json</code>, puis lancer <code>VALIDER-DERNIERE-FICHE.cmd</code>.</li>
    </ol>
  </section>
</main>
</body>
</html>
"@
$expressPackHtml | Set-Content -LiteralPath (Join-Path $target "TEST-EXPRESS-PROCHAIN-PC.html") -Encoding UTF8

$packVerifierCmd = @(
  "@echo off",
  "setlocal",
  "set ""PACK_DIR=%~dp0""",
  "powershell -NoProfile -ExecutionPolicy Bypass -File ""%PACK_DIR%VERIFIER-PACK-WINDOWS.ps1""",
  "echo.",
  "echo Rapport pack: %PACK_DIR%PACK-SELF-CHECK.md",
  "pause"
)
$packVerifierCmd | Set-Content -LiteralPath (Join-Path $target "VERIFIER-PACK.cmd") -Encoding ASCII

$startFieldCmd = @(
  "@echo off",
  "setlocal",
  "set ""PACK_DIR=%~dp0""",
  "echo Verification du pack terrain OutilsIA...",
  "powershell -NoProfile -ExecutionPolicy Bypass -File ""%PACK_DIR%VERIFIER-PACK-WINDOWS.ps1""",
  "if errorlevel 1 goto fail",
  "echo.",
  "echo Pack valide. Ouverture des pages utiles.",
  "start """" ""%PACK_DIR%START-HERE.html""",
  "start """" ""%PACK_DIR%TEST-EXPRESS-PROCHAIN-PC.html""",
  "start """" ""%PACK_DIR%PREUVES-ATTENDUES.html""",
  "start """" ""%PACK_DIR%BRIEF-$profile.html""",
  "start """" ""%PACK_DIR%$profileCommand""",
  "echo.",
  "echo Etapes: installer l'app si besoin, cliquer Analyser ce PC, exporter la fiche $profile, puis lancer VALIDER-DERNIERE-FICHE.cmd.",
  "pause",
  "exit /b 0",
  ":fail",
  "echo Pack invalide ou incomplet. Ouvre PACK-SELF-CHECK.md pour voir le blocage.",
  "start """" ""%PACK_DIR%PACK-SELF-CHECK.md""",
  "pause",
  "exit /b 1"
)
$startFieldCmd | Set-Content -LiteralPath (Join-Path $target "DEMARRER-TEST-TERRAIN.cmd") -Encoding ASCII

$packVerifierPs = @'
param()

$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Host "next_pc_inner_pack_invalid $message" -ForegroundColor Red
  exit 1
}

function Sha256($Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$expectedProfilePath = Join-Path $PSScriptRoot "EXPECTED-FIELD-PROFILE.txt"
if (!(Test-Path -LiteralPath $expectedProfilePath)) { Fail "EXPECTED-FIELD-PROFILE.txt introuvable" }
$expectedProfile = (Get-Content -LiteralPath $expectedProfilePath -Raw -Encoding UTF8).Trim()
$expectedBuildPath = Join-Path $PSScriptRoot "EXPECTED-BUILD-ID.txt"
$expectedVersionPath = Join-Path $PSScriptRoot "EXPECTED-APP-VERSION.txt"
$expectedInstallerNamePath = Join-Path $PSScriptRoot "EXPECTED-INSTALLER-NAME.txt"
$expectedInstallerShaPath = Join-Path $PSScriptRoot "EXPECTED-INSTALLER-SHA256.txt"
if (!(Test-Path -LiteralPath $expectedBuildPath)) { Fail "EXPECTED-BUILD-ID.txt introuvable" }
if (!(Test-Path -LiteralPath $expectedVersionPath)) { Fail "EXPECTED-APP-VERSION.txt introuvable" }
if (!(Test-Path -LiteralPath $expectedInstallerNamePath)) { Fail "EXPECTED-INSTALLER-NAME.txt introuvable" }
if (!(Test-Path -LiteralPath $expectedInstallerShaPath)) { Fail "EXPECTED-INSTALLER-SHA256.txt introuvable" }
$expectedBuildId = (Get-Content -LiteralPath $expectedBuildPath -Raw -Encoding UTF8).Trim()
$expectedAppVersion = (Get-Content -LiteralPath $expectedVersionPath -Raw -Encoding UTF8).Trim()
$expectedInstallerName = (Get-Content -LiteralPath $expectedInstallerNamePath -Raw -Encoding UTF8).Trim()
$expectedInstallerSha = (Get-Content -LiteralPath $expectedInstallerShaPath -Raw -Encoding UTF8).Trim().ToLowerInvariant()
$profileCommand = "TESTER-" + $expectedProfile.ToUpperInvariant().Replace("_", "-") + ".cmd"
$required = @(
  "START-HERE.html",
  "RECETTE-5-MINUTES.html",
  "TEST-EXPRESS-PROCHAIN-PC.html",
  "OUVRIR-TEST-EXPRESS.cmd",
  "README-NEXT-PC.md",
  "PREUVES-ATTENDUES.md",
  "PREUVES-ATTENDUES.html",
  "DEMARRER-TEST-TERRAIN.cmd",
  "INSTALLER-APP.cmd",
  "STATUT-WINDOWS.ps1",
  "PROCHAIN-PC.cmd",
  $profileCommand,
  "VALIDER-DERNIERE-FICHE.cmd",
  "EXPORTER-FICHES.cmd",
  "VALIDER-FICHE-WINDOWS.ps1",
  "EXPORTER-FICHES-WINDOWS.ps1"
)
$missing = @()
foreach ($file in $required) {
  if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot $file))) { $missing += $file }
}
$installerDir = Join-Path $PSScriptRoot "installer"
$installerFiles = @(Get-ChildItem -LiteralPath $installerDir -File -ErrorAction SilentlyContinue)
if ($installerFiles.Count -eq 0) { $missing += "installer/*" }
if ($installerFiles.Count -gt 1) { $missing += "installer_count_mismatch" }
$expectedInstallerPath = Join-Path $installerDir $expectedInstallerName
$installer = if (Test-Path -LiteralPath $expectedInstallerPath -PathType Leaf) { Get-Item -LiteralPath $expectedInstallerPath } else { $null }
if (!$installer) { $missing += "installer_name_mismatch" }
$actualInstallerSha = if ($installer) { Sha256 $installer.FullName } else { "" }
if ($installer -and $expectedBuildId -and !$installer.Name.Contains($expectedBuildId)) {
  $missing += "installer_build_id_mismatch"
}
if ($installer -and $expectedInstallerSha -and $actualInstallerSha -ne $expectedInstallerSha) {
  $missing += "installer_sha256_mismatch"
}

$ok = $missing.Count -eq 0
$result = [ordered]@{
  schema = "outilsia.local_cockpit_next_pc_inner_pack_check.v1"
  created_at = (Get-Date).ToUniversalTime().ToString("o")
  profile = $expectedProfile
  ok = $ok
  missing = $missing
  expected_build_id = $expectedBuildId
  expected_app_version = $expectedAppVersion
  expected_installer_sha256 = $expectedInstallerSha
  expected_installer_name = $expectedInstallerName
  installer = if ($installer) { $installer.Name } else { "" }
  installer_sha256 = $actualInstallerSha
  profile_command = $profileCommand
}
$resultJson = $result | ConvertTo-Json -Depth 5
Set-Content -LiteralPath (Join-Path $PSScriptRoot "PACK-SELF-CHECK.json") -Value $resultJson -Encoding UTF8

$lines = @(
  "# Verification du pack OutilsIA",
  "",
  "- Profil attendu: $expectedProfile",
  "- Statut: $(if ($ok) { 'ok' } else { 'erreur' })",
  "- Build attendu: $expectedBuildId",
  "- Version app attendue: $expectedAppVersion",
  "- Commande profil: $profileCommand",
  "- Installeur: $($result.installer)",
  "- SHA installeur: $($result.installer_sha256)",
  "- SHA attendu: $expectedInstallerSha",
  "- Fichiers manquants: $(if ($missing.Count -eq 0) { 'aucun' } else { $missing -join ', ' })"
)
$lines | Set-Content -LiteralPath (Join-Path $PSScriptRoot "PACK-SELF-CHECK.md") -Encoding UTF8

if (-not $ok) { Fail "profile=$expectedProfile missing=$($missing -join ',')" }
Write-Host "next_pc_inner_pack_verified profile=$expectedProfile build_id=$expectedBuildId installer_sha=$($result.installer_sha256)" -ForegroundColor Green
exit 0
'@
$packVerifierPs | Set-Content -LiteralPath (Join-Path $target "VERIFIER-PACK-WINDOWS.ps1") -Encoding UTF8

$innerCheck = powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $target "VERIFIER-PACK-WINDOWS.ps1")
if ($LASTEXITCODE -ne 0) { Fail "verification interne du pack echouee pour $profile" }

Compress-Archive -LiteralPath $target -DestinationPath $zip -Force
$zipSha = Sha256 $zip
"$zipSha  $(Split-Path $zip -Leaf)" | Set-Content -LiteralPath $zipShaFile -Encoding UTF8

$manifest = [ordered]@{
  schema = "outilsia.local_cockpit_next_pc_pack.v1"
  created_at = (Get-Date).ToUniversalTime().ToString("o")
  profile = $profile
  build_id = $expectedBuildId
  app_version = $expectedAppVersion
  installer_sha256 = $expectedInstallerSha
  source_kit = $PSScriptRoot
  target_dir = $target
  zip = $zip
  zip_sha256 = $zipSha
  zip_sha256_file = $zipShaFile
  pack_self_check = Join-Path $target "PACK-SELF-CHECK.json"
  files = $files
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $PSScriptRoot "NEXT-PC-PACK.json") -Encoding UTF8

$lines = @(
  "# Pack prochain PC OutilsIA",
  "",
  "- Profil: $profile",
  "- Build: $expectedBuildId",
  "- Version app: $expectedAppVersion",
  "- SHA installeur: $expectedInstallerSha",
  "- Dossier: $target",
  "- Zip: $zip",
  "- SHA256 zip: $zipSha",
  "- Fichier SHA256: $zipShaFile",
  "- Progression: $($progress.percent)%",
  "- Profils prets: $($progress.ready)/$($progress.required)",
  "",
  "## A faire",
  "",
  "1. Copier le dossier ou le zip sur la machine $profile.",
  "2. Double-cliquer DEMARRER-TEST-TERRAIN.cmd dans le pack.",
  "3. Exporter puis valider la fiche avant de quitter le PC."
)
$lines | Set-Content -LiteralPath (Join-Path $PSScriptRoot "NEXT-PC-PACK.md") -Encoding UTF8

Write-Host "next_pc_pack_ok profile=$profile zip=$zip sha=$zipSha sidecar=$zipShaFile" -ForegroundColor Green
exit 0
`, "utf8");

  writeFileSync(join(kitDir, "PREPARER-PACKS-MANQUANTS.cmd"), [
    "@echo off",
    "setlocal",
    "set \"KIT_DIR=%~dp0\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%KIT_DIR%PREPARER-PACKS-MANQUANTS-WINDOWS.ps1\"",
    "echo.",
    "echo Rapport packs manquants: %KIT_DIR%MISSING-PC-PACKS.md",
    "echo Index HTML: %KIT_DIR%MISSING-PC-PACKS.html",
    "echo Version JSON: %KIT_DIR%MISSING-PC-PACKS.json",
    "start \"\" \"%KIT_DIR%MISSING-PC-PACKS.html\"",
    "pause",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "PREPARER-PACKS-MANQUANTS-WINDOWS.ps1"), String.raw`param()

$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Host "missing_pc_packs_invalid $message" -ForegroundColor Red
  exit 1
}

function Sha256($Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Html($value) {
  return [System.Net.WebUtility]::HtmlEncode([string]$value)
}

function ProfileTitle($profile) {
  switch ([string]$profile) {
    "old_laptop" { return "Vieux laptop / portable modeste" }
    "core_i7_gtx_1080_ti" { return "Core i7 + GTX 1080 Ti 11 Go" }
    "rtx_3060_12gb" { return "RTX 3060 12 Go" }
    "cpu_only" { return "Machine CPU-only" }
    default { return [string]$profile }
  }
}

function ProfileTarget($profile) {
  switch ([string]$profile) {
    "old_laptop" { return "Portable ancien, iGPU ou petit GPU, RAM limitee." }
    "core_i7_gtx_1080_ti" { return "Vieux PC encore solide avec GTX 1080 Ti 11 Go VRAM." }
    "rtx_3060_12gb" { return "Machine grand public RTX 3060 12 Go." }
    "cpu_only" { return "PC sans GPU dedie exploitable." }
    default { return "Machine physique correspondant au profil." }
  }
}

function ProfileProof($profile) {
  switch ([string]$profile) {
    "old_laptop" { return "Score realiste, modele leger, message encourageant, upgrade clair." }
    "core_i7_gtx_1080_ti" { return "1080 Ti reconnue, modele 7B/14B teste, upgrade 24 Go VRAM explique." }
    "rtx_3060_12gb" { return "Profil budget valide, benchmark reel, recommandation non agressive." }
    "cpu_only" { return "Chemin CPU honnete, petit modele seulement, upgrade GPU/RAM utile." }
    default { return "Scan, benchmark, PromptForge, dialogue, Arena et rapport partageable." }
  }
}

$statusScript = Join-Path $PSScriptRoot "STATUT-WINDOWS.ps1"
try {
  powershell -NoProfile -ExecutionPolicy Bypass -File $statusScript | Out-Host
} catch {
  # Statut incomplet attendu tant que les 5 machines ne sont pas collectees.
}

$progressPath = Join-Path $PSScriptRoot "FIELD-PROGRESS.json"
if (!(Test-Path -LiteralPath $progressPath)) { Fail "FIELD-PROGRESS.json introuvable" }
$progress = Get-Content -LiteralPath $progressPath -Raw -Encoding UTF8 | ConvertFrom-Json
$missingProfiles = @($progress.missing_profiles)
if ($missingProfiles.Count -eq 0) {
  Write-Host "missing_pc_packs_ok count=0 campaign_ready=true" -ForegroundColor Green
  exit 0
}

$packScript = Join-Path $PSScriptRoot "PREPARER-PROCHAIN-PC-WINDOWS.ps1"
if (!(Test-Path -LiteralPath $packScript)) { Fail "PREPARER-PROCHAIN-PC-WINDOWS.ps1 introuvable" }

$packs = @()
foreach ($profile in $missingProfiles) {
  powershell -NoProfile -ExecutionPolicy Bypass -File $packScript -Profile $profile | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail "creation pack echouee pour $profile" }
  $zip = Join-Path (Split-Path -Parent $PSScriptRoot) "OutilsIA-Next-PC-$profile.zip"
  $zipShaFile = "$zip.sha256.txt"
  $dir = Join-Path (Split-Path -Parent $PSScriptRoot) "OutilsIA-Next-PC-$profile"
  if (!(Test-Path -LiteralPath $zip)) { Fail "zip introuvable pour $profile" }
  if (!(Test-Path -LiteralPath $zipShaFile)) {
    "$(Sha256 $zip)  $(Split-Path $zip -Leaf)" | Set-Content -LiteralPath $zipShaFile -Encoding UTF8
  }
  $zipSha = Sha256 $zip
  $buildIdPath = Join-Path $dir "EXPECTED-BUILD-ID.txt"
  $appVersionPath = Join-Path $dir "EXPECTED-APP-VERSION.txt"
  $installerShaPath = Join-Path $dir "EXPECTED-INSTALLER-SHA256.txt"
  if (!(Test-Path -LiteralPath $buildIdPath)) { Fail "EXPECTED-BUILD-ID.txt introuvable pour $profile" }
  if (!(Test-Path -LiteralPath $appVersionPath)) { Fail "EXPECTED-APP-VERSION.txt introuvable pour $profile" }
  if (!(Test-Path -LiteralPath $installerShaPath)) { Fail "EXPECTED-INSTALLER-SHA256.txt introuvable pour $profile" }
  $packs += [ordered]@{
    profile = $profile
    build_id = (Get-Content -LiteralPath $buildIdPath -Raw -Encoding UTF8).Trim()
    app_version = (Get-Content -LiteralPath $appVersionPath -Raw -Encoding UTF8).Trim()
    installer_sha256 = (Get-Content -LiteralPath $installerShaPath -Raw -Encoding UTF8).Trim().ToLowerInvariant()
    dir = $dir
    zip = $zip
    zip_sha256 = $zipSha
    zip_sha256_file = $zipShaFile
    pack_self_check = Join-Path $dir "PACK-SELF-CHECK.json"
  }
}

if (-not [string]::IsNullOrWhiteSpace([string]$progress.next_profile)) {
  powershell -NoProfile -ExecutionPolicy Bypass -File $packScript -Profile ([string]$progress.next_profile) | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail "restauration pack prochain PC echouee pour $($progress.next_profile)" }
  foreach ($pack in $packs) {
    if ([string]$pack["profile"] -eq [string]$progress.next_profile) {
      $zip = [string]$pack["zip"]
      $zipShaFile = "$zip.sha256.txt"
      $pack["zip_sha256"] = Sha256 $zip
      $pack["zip_sha256_file"] = $zipShaFile
    }
  }
}

$manifest = [ordered]@{
  schema = "outilsia.local_cockpit_missing_pc_packs.v1"
  created_at = (Get-Date).ToUniversalTime().ToString("o")
  count = $packs.Count
  profiles = $missingProfiles
  packs = $packs
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $PSScriptRoot "MISSING-PC-PACKS.json") -Encoding UTF8

$missions = @()
foreach ($pack in $packs) {
  $missions += [ordered]@{
    profile = [string]$pack.profile
    title = ProfileTitle $pack.profile
    target_machine = ProfileTarget $pack.profile
    expected_proof = ProfileProof $pack.profile
    zip = [string]$pack.zip
    zip_sha256 = [string]$pack.zip_sha256
    brief = "BRIEF-$($pack.profile).html"
    tester_command = "TESTER-$(([string]$pack.profile).ToUpperInvariant().Replace('_','-')).cmd"
    expected_entry = "outilsia-field-test-$($pack.profile).json"
  }
}

$missionManifest = [ordered]@{
  schema = "outilsia.local_cockpit_missing_pc_mission.v1"
  created_at = (Get-Date).ToUniversalTime().ToString("o")
  count = $missions.Count
  progress_percent = $progress.percent
  ready = $progress.ready
  required = $progress.required
  next_profile = $progress.next_profile
  missions = $missions
}
$missionManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $PSScriptRoot "MISSING-PC-MISSION.json") -Encoding UTF8

$lines = @(
  "# Packs PC manquants OutilsIA",
  "",
  "- Nombre de packs: $($packs.Count)",
  "- Progression actuelle: $($progress.percent)%",
  "- Profils prets: $($progress.ready)/$($progress.required)",
  "",
  "| Profil | Zip | SHA256 | Fichier SHA |",
  "| --- | --- | --- | --- |"
)
foreach ($pack in $packs) {
  $lines += "| $($pack.profile) | $($pack.zip) | $($pack.zip_sha256) | $($pack.zip_sha256_file) |"
}
$lines += ""
$lines += "## Utilisation"
$lines += ""
$lines += "Copier le zip correspondant sur la machine physique a tester, lancer START-HERE.html, exporter la fiche, puis ramener le zip de fiches avec EXPORTER-FICHES.cmd."
$lines | Set-Content -LiteralPath (Join-Path $PSScriptRoot "MISSING-PC-PACKS.md") -Encoding UTF8

$missionLines = @(
  "# Mission 4 PC restants OutilsIA",
  "",
  "- Progression actuelle: $($progress.percent)%",
  "- Profils prets: $($progress.ready)/$($progress.required)",
  "- Prochain profil: $($progress.next_profile)",
  "",
  "| Profil | Machine a trouver | Preuve attendue | Zip | Commande |",
  "| --- | --- | --- | --- | --- |"
)
foreach ($mission in $missions) {
  $missionLines += "| $($mission.profile) | $($mission.target_machine) | $($mission.expected_proof) | $($mission.zip) | $($mission.tester_command) |"
}
$missionLines += ""
$missionLines += "## Preuve minimale par PC"
$missionLines += ""
$missionLines += "Chaque PC doit produire scan_ok, benchmark_tokens_per_second > 0, promptforge_ok, dialogue_ok, arena_ok, report_ok, recommended_model et upgrade_recommendation."
$missionLines += ""
$missionLines += "## Retour"
$missionLines += ""
$missionLines += "Ramener le zip cree par EXPORTER-FICHES.cmd, puis lancer IMPORTER-PACK-FICHES.cmd sur la machine principale."
$missionLines | Set-Content -LiteralPath (Join-Path $PSScriptRoot "MISSING-PC-MISSION.md") -Encoding UTF8

$rows = ($packs | ForEach-Object {
  "<tr><td><strong>$(Html $_.profile)</strong></td><td><code>$(Html $_.zip)</code></td><td><code>$(Html $_.zip_sha256)</code></td><td><code>$(Html $_.zip_sha256_file)</code></td><td>Copier ce zip et son fichier SHA sur la machine, ouvrir <code>START-HERE.html</code>, exporter la fiche puis lancer <code>EXPORTER-FICHES.cmd</code>.</td></tr>"
}) -join ([Environment]::NewLine)
$missionCards = ($missions | ForEach-Object {
  "<article class='mission'><h3>$(Html $_.title)</h3><p><code>$(Html $_.profile)</code></p><dl><dt>Machine</dt><dd>$(Html $_.target_machine)</dd><dt>Preuve</dt><dd>$(Html $_.expected_proof)</dd><dt>Zip</dt><dd><code>$(Html $_.zip)</code></dd><dt>Brief</dt><dd><code>$(Html $_.brief)</code></dd><dt>Commande</dt><dd><code>$(Html $_.tester_command)</code></dd><dt>Fiche</dt><dd><code>$(Html $_.expected_entry)</code></dd></dl></article>"
}) -join ([Environment]::NewLine)
$html = @"
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Packs PC manquants OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#607086;--line:#dbe4ef;--soft:#f5f8fc;--blue:#185abc}
    *{box-sizing:border-box}
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:var(--ink);background:#edf2f8;line-height:1.45}
    main{width:min(1120px,calc(100% - 28px));margin:28px auto}
    header{background:#12335e;color:white;border-radius:14px;padding:30px 34px;box-shadow:0 16px 46px rgba(28,43,68,.12)}
    h1{margin:0;font-size:32px;letter-spacing:0}
    section{background:white;border:1px solid var(--line);border-radius:14px;padding:24px;margin-top:16px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .card{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:16px}
    .card strong{display:block;font-size:24px}
    table{width:100%;border-collapse:collapse;border:1px solid var(--line)}
    th,td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--line)}
    th{background:var(--soft);font-size:12px;color:var(--muted);text-transform:uppercase}
    .missions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .mission{border:1px solid var(--line);border-radius:12px;padding:16px;background:#fff}
    .mission h3{margin:0 0 4px}
    dl{display:grid;grid-template-columns:96px 1fr;gap:7px 10px}
    dt{font-weight:800;color:var(--muted)}
    dd{margin:0}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px;word-break:break-all}
    li{margin:7px 0}
    @media(max-width:850px){.grid,.missions{grid-template-columns:1fr}header,section{padding:22px}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Packs PC manquants OutilsIA</h1>
    <p>Un zip par machine physique restante. Chaque pack contient le profil verrouille, l'installeur et les scripts de validation/export.</p>
  </header>
  <section>
    <div class="grid">
      <div class="card"><strong>$($packs.Count)</strong><span>packs prets</span></div>
      <div class="card"><strong>$($progress.percent)%</strong><span>progression terrain</span></div>
      <div class="card"><strong>$($progress.ready)/$($progress.required)</strong><span>profils valides</span></div>
    </div>
  </section>
  <section>
    <h2>Mission des PC restants</h2>
    <p>Objectif : obtenir une preuve physique par profil, pas seulement preparer des zips.</p>
    <div class="missions">
$missionCards
    </div>
  </section>
  <section>
    <h2>Zips a emporter</h2>
    <table><thead><tr><th>Profil</th><th>Zip</th><th>SHA256</th><th>Fichier SHA</th><th>Utilisation</th></tr></thead><tbody>
$rows
    </tbody></table>
  </section>
  <section>
    <h2>Retour machine principale</h2>
    <ol>
      <li>Sur le PC teste, lancer <code>EXPORTER-FICHES.cmd</code>.</li>
      <li>Ramener le zip <code>outilsia-field-entries-transfer-*.zip</code>.</li>
      <li>Sur la machine principale, lancer <code>IMPORTER-PACK-FICHES.cmd</code>, puis <code>STATUT.cmd</code>.</li>
    </ol>
  </section>
</main>
</body>
</html>
"@
$html | Set-Content -LiteralPath (Join-Path $PSScriptRoot "MISSING-PC-PACKS.html") -Encoding UTF8
$html | Set-Content -LiteralPath (Join-Path $PSScriptRoot "MISSING-PC-MISSION.html") -Encoding UTF8

$nextMission = if ($missions.Count -gt 0) { $missions | Where-Object { $_.profile -eq $progress.next_profile } | Select-Object -First 1 } else { $null }
if (!$nextMission -and $missions.Count -gt 0) { $nextMission = $missions[0] }
$nextTitle = if ($nextMission) { $nextMission.title } else { "Aucun PC restant" }
$nextProfileLabel = if ($nextMission) { $nextMission.profile } else { "none" }
$nextZip = if ($nextMission) { $nextMission.zip } else { "-" }
$nextCommand = if ($nextMission) { $nextMission.tester_command } else { "-" }
$linuxStatus = if ($progress.ready -ge 2) { "pret a preparer apres validation Windows" } else { "en attente de 2 preuves Windows terrain" }
$nextActionCards = @(
  "<article><span>1</span><h3>Tester le prochain PC</h3><p><strong>$(Html $nextTitle)</strong> <code>$(Html $nextProfileLabel)</code></p><p>Ouvrir <code>$(Html $nextCommand)</code> ou copier le zip <code>$(Html $nextZip)</code>.</p></article>",
  "<article><span>2</span><h3>Valider la fiche</h3><p>Lancer <code>VALIDER-DERNIERE-FICHE.cmd</code>, puis <code>VALIDER-FICHES.cmd</code>.</p><p>Lire <code>FIELD-ENTRIES-VALIDATION.html</code> avant assemblage.</p></article>",
  "<article><span>3</span><h3>Importer et assembler</h3><p>Ramener <code>outilsia-field-entries-transfer-*.zip</code>, lancer <code>IMPORTER-PACK-FICHES.cmd</code>, puis <code>STATUT.cmd</code>.</p></article>",
  "<article><span>4</span><h3>Linux ensuite</h3><p>Statut: <strong>$(Html $linuxStatus)</strong>.</p><p>Ne pas publier Linux tant que la campagne Windows terrain n'a pas assez de preuves.</p></article>"
) -join ([Environment]::NewLine)
$nextActionsHtml = @"
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Actions restantes terrain OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#607086;--line:#dbe4ef;--soft:#f5f8fc;--blue:#12335e;--accent:#185abc}
    *{box-sizing:border-box}
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:var(--ink);background:#edf2f8;line-height:1.45}
    main{width:min(1140px,calc(100% - 28px));margin:28px auto}
    header{background:var(--blue);color:white;border-radius:14px;padding:30px 34px;box-shadow:0 16px 46px rgba(28,43,68,.12)}
    h1{margin:0;font-size:34px;letter-spacing:0}
    section{background:white;border:1px solid var(--line);border-radius:14px;padding:24px;margin-top:16px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .metric{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:16px}
    .metric strong{display:block;font-size:28px}
    .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    article{position:relative;border:1px solid var(--line);border-radius:12px;padding:18px 18px 18px 64px;background:#fff}
    article span{position:absolute;left:18px;top:18px;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:white;font-weight:900}
    h2,h3{margin:0 0 8px}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px;word-break:break-all}
    a{color:#185abc}
    @media(max-width:850px){.metrics,.actions{grid-template-columns:1fr}header,section{padding:22px}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Actions restantes terrain OutilsIA</h1>
    <p>Vue courte pour finir le goal sans se disperser : preuves physiques d'abord, Linux ensuite.</p>
  </header>
  <section>
    <div class="metrics">
      <div class="metric"><strong>$($progress.ready)/$($progress.required)</strong><span>profils valides</span></div>
      <div class="metric"><strong>$($progress.percent)%</strong><span>terrain Windows</span></div>
      <div class="metric"><strong>$($packs.Count)</strong><span>packs restants</span></div>
      <div class="metric"><strong>$(Html $nextProfileLabel)</strong><span>prochain PC</span></div>
    </div>
  </section>
  <section>
    <h2>Ordre strict</h2>
    <div class="actions">$nextActionCards</div>
  </section>
  <section>
    <h2>Rapports à ouvrir</h2>
    <p><a href="FIELD-ENTRIES-VALIDATION.html">Validation fiches terrain</a> - <a href="RAPPORT-PDF-TERRAIN.html">Rapport PDF terrain</a> - <a href="MISSING-PC-MISSION.html">Mission PC manquants</a> - <a href="CENTRE-TERRAIN.html">Centre terrain</a> - <a href="PROCHAIN-PC.html">Prochain PC</a></p>
  </section>
</main>
</body>
</html>
"@
$nextActionsHtml | Set-Content -LiteralPath (Join-Path $PSScriptRoot "FIELD-NEXT-ACTIONS.html") -Encoding UTF8

Write-Host "missing_pc_packs_ok count=$($packs.Count) profiles=$($missingProfiles -join ',')" -ForegroundColor Green
exit 0
`, "utf8");

  writeFileSync(join(kitDir, "VERIFIER-PACKS-MANQUANTS.cmd"), [
    "@echo off",
    "setlocal",
    "set \"KIT_DIR=%~dp0\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%KIT_DIR%VERIFIER-PACKS-MANQUANTS-WINDOWS.ps1\"",
    "echo.",
    "echo Rapport verification packs: %KIT_DIR%MISSING-PC-PACKS-VERIFY.md",
    "echo Version JSON: %KIT_DIR%MISSING-PC-PACKS-VERIFY.json",
    "start \"\" \"%KIT_DIR%MISSING-PC-PACKS-VERIFY.html\"",
    "pause",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "VERIFIER-PACKS-MANQUANTS-WINDOWS.ps1"), String.raw`param()

$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Host "missing_pc_packs_sha_invalid $message" -ForegroundColor Red
  exit 1
}

function Sha256($Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Html($value) {
  return [System.Net.WebUtility]::HtmlEncode([string]$value)
}

$manifestPath = Join-Path $PSScriptRoot "MISSING-PC-PACKS.json"
if (!(Test-Path -LiteralPath $manifestPath)) { Fail "MISSING-PC-PACKS.json introuvable: lance PREPARER-PACKS-MANQUANTS.cmd" }
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$packs = @($manifest.packs)
$rows = @()
$errors = @()

foreach ($pack in $packs) {
  $profile = [string]$pack.profile
  $zip = [string]$pack.zip
  $sidecar = [string]$pack.zip_sha256_file
  $expected = ([string]$pack.zip_sha256).ToLowerInvariant()
  $zipExists = Test-Path -LiteralPath $zip
  $sidecarExists = Test-Path -LiteralPath $sidecar
  $actual = if ($zipExists) { Sha256 $zip } else { "" }
  $sidecarText = if ($sidecarExists) { Get-Content -LiteralPath $sidecar -Raw -Encoding UTF8 } else { "" }
  $ok = $zipExists -and $sidecarExists -and ($actual -eq $expected) -and $sidecarText.Contains($expected)
  if (-not $ok) { $errors += $profile }
  $rows += [ordered]@{
    profile = $profile
    zip = $zip
    zip_exists = $zipExists
    zip_sha256 = $actual
    expected_sha256 = $expected
    sha_sidecar = $sidecar
    sha_sidecar_exists = $sidecarExists
    ok = $ok
  }
}

$result = [ordered]@{
  schema = "outilsia.local_cockpit_missing_pc_packs_verify.v1"
  created_at = (Get-Date).ToUniversalTime().ToString("o")
  count = $rows.Count
  ok_count = @($rows | Where-Object { $_.ok }).Count
  errors = $errors
  rows = $rows
}
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $PSScriptRoot "MISSING-PC-PACKS-VERIFY.json") -Encoding UTF8

$lines = @(
  "# Verification SHA des packs PC manquants",
  "",
  "- Packs verifies: $($result.ok_count)/$($result.count)",
  "- Erreurs: $(if ($errors.Count -eq 0) { 'aucune' } else { $errors -join ', ' })",
  "",
  "| Profil | Statut | SHA256 | Sidecar |",
  "| --- | --- | --- | --- |"
)
foreach ($row in $rows) {
  $status = if ($row.ok) { "ok" } else { "erreur" }
  $lines += "| $($row.profile) | $status | $($row.zip_sha256) | $($row.sha_sidecar) |"
}
$lines | Set-Content -LiteralPath (Join-Path $PSScriptRoot "MISSING-PC-PACKS-VERIFY.md") -Encoding UTF8

$tableRows = ($rows | ForEach-Object {
  $status = if ($_.ok) { "ok" } else { "erreur" }
  "<tr><td><strong>$(Html $_.profile)</strong></td><td>$(Html $status)</td><td><code>$(Html $_.zip_sha256)</code></td><td><code>$(Html $_.sha_sidecar)</code></td></tr>"
}) -join ([Environment]::NewLine)
$html = @"
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Verification SHA packs OutilsIA</title>
  <style>
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#eef3f8;color:#172033}
    main{width:min(1050px,calc(100% - 28px));margin:28px auto}
    header,section{background:white;border:1px solid #dbe4ef;border-radius:14px;padding:24px;margin-bottom:14px;box-shadow:0 10px 28px rgba(28,43,68,.08)}
    header{background:#12335e;color:white}
    h1{margin:0 0 8px;font-size:30px}
    table{width:100%;border-collapse:collapse}
    th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #dbe4ef;vertical-align:top}
    th{background:#f5f8fc;color:#607086;text-transform:uppercase;font-size:12px}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px;word-break:break-all}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Verification SHA des packs OutilsIA</h1>
    <p>Packs verifies: $($result.ok_count)/$($result.count). Cette page confirme que les zips a emporter correspondent a leurs fichiers <code>.sha256.txt</code>.</p>
  </header>
  <section>
    <table><thead><tr><th>Profil</th><th>Statut</th><th>SHA256 calcule</th><th>Sidecar</th></tr></thead><tbody>
$tableRows
    </tbody></table>
  </section>
</main>
</body>
</html>
"@
$html | Set-Content -LiteralPath (Join-Path $PSScriptRoot "MISSING-PC-PACKS-VERIFY.html") -Encoding UTF8

if ($errors.Count -gt 0) { Fail "profiles=$($errors -join ',')" }
Write-Host "missing_pc_packs_sha_verified count=$($result.ok_count)/$($result.count)" -ForegroundColor Green
exit 0
`, "utf8");

  writeFileSync(join(kitDir, "INSTALLER-APP.cmd"), [
    "@echo off",
    "setlocal",
    "set \"INSTALLER=%~dp0installer\\" + (primaryDownload.name || "") + "\"",
    "if not exist \"%INSTALLER%\" goto missing",
    "echo Installation OutilsIA Local Cockpit",
    "echo Fichier: %INSTALLER%",
    "echo SHA256 attendu: " + (primaryDownload.sha256 || ""),
    "start \"\" \"%INSTALLER%\"",
    "exit /b 0",
    ":missing",
    "echo Installeur introuvable dans le dossier installer.",
    "echo Re-genere le kit avec npm run kit:field ou telecharge la beta depuis outilsia.fr.",
    "pause",
    "exit /b 1",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "ASSEMBLER.cmd"), [
    "@echo off",
    appCommand(`npm run assemble:field-tests -- --dir ${shSingleQuoted(entriesDir)} --out ${shSingleQuoted(fieldTestsJsonPath)}`),
    "pause",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "STATUT.cmd"), [
    "@echo off",
    "setlocal",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0STATUT-WINDOWS.ps1\"",
    "if errorlevel 2 goto fail",
    "echo.",
    "echo Rapport statut: %~dp0FIELD-TESTS-STATUS.md",
    "echo Mission HTML: %~dp0MISSION-TERRAIN.html",
    "echo Prochain PC: %~dp0PROCHAIN-PC.html",
    "echo Centre terrain: %~dp0CENTRE-TERRAIN.html",
    "echo Progression terrain: %~dp0FIELD-PROGRESS.html",
    "start \"\" \"%~dp0CENTRE-TERRAIN.html\"",
    "start \"\" \"%~dp0FIELD-PROGRESS.html\"",
    "start \"\" \"%~dp0MISSION-TERRAIN.html\"",
    "start \"\" \"%~dp0PROCHAIN-PC.html\"",
    "pause",
    "exit /b 0",
    ":fail",
    "echo Impossible de generer le statut terrain Windows.",
    "pause",
    "exit /b 1",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "AUDIT-TERRAIN.cmd"), [
    "@echo off",
    "setlocal",
    "set \"KIT_DIR=%~dp0\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%KIT_DIR%AUDIT-TERRAIN-WINDOWS.ps1\"",
    "echo.",
    "echo Verdict terrain: %KIT_DIR%AUDIT-TERRAIN.md",
    "echo Version HTML: %KIT_DIR%AUDIT-TERRAIN.html",
    "start \"\" \"%KIT_DIR%AUDIT-TERRAIN.html\"",
    "pause",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "AUDIT-TERRAIN-WINDOWS.ps1"), String.raw`param(
  [switch]$Strict
)

$ErrorActionPreference = "Stop"

function Html($value) {
  return [System.Net.WebUtility]::HtmlEncode([string]$value)
}

function Clean($value) {
  $text = [string]$value
  $middleDot = [string][char]0x00B7
  $mojibakeDot = ([string][char]0x00C2) + ([string][char]0x00B7)
  return $text.Replace($mojibakeDot, "-").Replace($middleDot, "-")
}

$entriesDir = Join-Path $PSScriptRoot "entries"
$validationJson = Join-Path $PSScriptRoot "FIELD-ENTRIES-VALIDATION.json"
$statusJson = Join-Path $PSScriptRoot "FIELD-TESTS-STATUS.json"
$auditMd = Join-Path $PSScriptRoot "AUDIT-TERRAIN.md"
$auditHtml = Join-Path $PSScriptRoot "AUDIT-TERRAIN.html"
New-Item -ItemType Directory -Force -Path $entriesDir | Out-Null

try {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "VALIDER-FICHES-WINDOWS.ps1") -EntriesDir $entriesDir -OutJson $validationJson | Out-Host
} catch {
  # Campagne incomplete: attendu tant que les 5 PC ne sont pas passés.
}

try {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "STATUT-WINDOWS.ps1") -EntriesDir $entriesDir -OutJson $statusJson | Out-Host
} catch {
  # STATUT-WINDOWS sort 1 tant que la campagne est incomplete; on lit quand meme son JSON.
}

if (!(Test-Path -LiteralPath $statusJson)) {
  throw "FIELD-TESTS-STATUS.json introuvable apres audit terrain."
}

$status = Get-Content -LiteralPath $statusJson -Raw -Encoding UTF8 | ConvertFrom-Json
$ready = @($status.profiles_ready)
$required = @($status.profiles_required)
$missing = @($status.profiles_missing)
$incomplete = @($status.profiles_incomplete)
$next = [string]$status.next_profile_to_test
$isReady = [string]$status.status -eq "FIELD_TESTS_READY"
$verdict = if ($isReady) { "GOAL TERRAIN VALIDABLE" } else { "GOAL PAS ENCORE VALIDABLE" }
$nextLabel = if ($next) { $next } else { "aucun" }

$lines = @(
  "# Audit terrain OutilsIA",
  "",
  "- Verdict: $verdict",
  "- Statut: $($status.status)",
  "- Profils prets: $($ready.Count)/$($required.Count)",
  "- Prochain PC: $nextLabel",
  "- Fichiers lus: $($status.files_read)",
  "",
  "## Action maintenant"
)
if ($isReady) {
  $lines += "- Lancer ASSEMBLER.cmd, puis IMPORTER.cmd, puis VALIDER-GOAL.cmd."
} else {
  $lines += "- Tester le prochain profil: $nextLabel."
  $lines += "- Ouvrir PROCHAIN-PC.cmd pour voir les preuves attendues."
  $lines += "- Obtenir scan, benchmark, PromptForge, dialogue, Arena et rapport dans OutilsIA."
  $lines += "- Exporter la fiche depuis Details > Test terrain avec le bon profil manuel."
  $lines += "- Lancer VALIDER-DERNIERE-FICHE.cmd avant de quitter le PC."
}
$lines += @(
  "",
  "## Profils",
  "",
  "| Profil | Statut | Modele | Benchmark | Manques |",
  "| --- | --- | --- | --- | --- |"
)
foreach ($row in @($status.profiles)) {
  $model = if ($row.recommended_model) { Clean $row.recommended_model } else { "-" }
  $bench = if ($row.benchmark) { Clean $row.benchmark } else { "-" }
  $miss = if (@($row.missing_fields).Count) { Clean (@($row.missing_fields) -join ", ") } else { "-" }
  $lines += "| $($row.profile) | $($row.status) | $model | $bench | $miss |"
}
$lines += @(
  "",
  "## Fichiers utiles",
  "",
  "- CENTRE-TERRAIN.html",
  "- PROCHAIN-PC.html",
  "- FIELD-PROFILE-EXPECTATIONS.html",
  "- FIELD-ENTRIES-VALIDATION.md",
  "- FIELD-TESTS-STATUS.md",
  ""
)
$lines | Set-Content -LiteralPath $auditMd -Encoding UTF8

$rows = (@($status.profiles) | ForEach-Object {
  $miss = if (@($_.missing_fields).Count) { Clean (@($_.missing_fields) -join ", ") } else { "-" }
  "<tr class=""$($_.status)""><td><code>$(Html $_.profile)</code></td><td><strong>$(Html $_.status)</strong></td><td>$(Html (Clean $_.recommended_model))</td><td>$(Html (Clean $_.benchmark))</td><td>$(Html $miss)</td></tr>"
}) -join ([Environment]::NewLine)
$html = @"
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Audit terrain OutilsIA</title>
  <style>
    :root { --ink:#172033; --muted:#607086; --line:#dbe4ef; --panel:#fff; --soft:#f5f8fc; --green:#167447; --orange:#a15c00; --red:#b42318; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI,Arial,sans-serif; color:var(--ink); background:#edf2f8; line-height:1.45; }
    main { width:min(1060px, calc(100% - 28px)); margin:28px auto; }
    header { color:white; background:#12335e; border-radius:14px; padding:30px 34px; box-shadow:0 16px 46px rgba(28,43,68,.12); }
    h1 { margin:0; font-size:32px; letter-spacing:0; }
    section { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:24px; margin-top:16px; box-shadow:0 12px 34px rgba(28,43,68,.08); }
    .grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
    .card { background:var(--soft); border:1px solid var(--line); border-radius:12px; padding:16px; }
    .card strong { display:block; font-size:22px; }
    .ok { color:var(--green); } .warn { color:var(--orange); } .bad { color:var(--red); }
    table { width:100%; border-collapse:collapse; border:1px solid var(--line); }
    th,td { text-align:left; vertical-align:top; padding:10px 12px; border-bottom:1px solid var(--line); }
    th { background:var(--soft); font-size:12px; color:var(--muted); text-transform:uppercase; }
    tr.ready strong { color:var(--green); } tr.incomplete strong { color:var(--orange); } tr.missing strong { color:var(--red); }
    code { font-family:Consolas,monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; }
    li { margin:7px 0; }
    @media (max-width:850px) { .grid{grid-template-columns:1fr;} header,section{padding:22px;} }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Audit terrain OutilsIA</h1>
    <p>Verdict court avant validation finale. Cette page ne remplace pas les fiches physiques.</p>
  </header>
  <section>
    <div class="grid">
      <div class="card"><strong class="$(if ($isReady) { 'ok' } else { 'warn' })">$(Html $verdict)</strong><span>verdict</span></div>
      <div class="card"><strong>$($ready.Count)/$($required.Count)</strong><span>profils prets</span></div>
      <div class="card"><strong>$(Html $nextLabel)</strong><span>prochain PC</span></div>
    </div>
  </section>
  <section>
    <h2>Action maintenant</h2>
    <ul>
      $(if ($isReady) { "<li>Lancer <code>ASSEMBLER.cmd</code>, puis <code>IMPORTER.cmd</code>, puis <code>VALIDER-GOAL.cmd</code>.</li>" } else { "<li>Tester <code>$(Html $nextLabel)</code>.</li><li>Ouvrir <code>PROCHAIN-PC.cmd</code>.</li><li>Exporter une fiche complete depuis OutilsIA, puis lancer <code>VALIDER-DERNIERE-FICHE.cmd</code>.</li>" })
    </ul>
  </section>
  <section>
    <h2>Profils</h2>
    <table><thead><tr><th>Profil</th><th>Statut</th><th>Modele</th><th>Benchmark</th><th>Manques</th></tr></thead><tbody>
$rows
    </tbody></table>
  </section>
</main>
</body>
</html>
"@
$html | Set-Content -LiteralPath $auditHtml -Encoding UTF8

Write-Host "field_audit_windows status=$($status.status) ready=$($ready.Count)/$($required.Count) next=$(if ($next) { $next } else { 'none' })"
if ($Strict -and !$isReady) { exit 1 }
exit 0
`, "utf8");

  writeFileSync(join(kitDir, "VERIFIER-KIT.cmd"), [
    "@echo off",
    "setlocal",
    "set \"KIT_DIR=%~dp0\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%KIT_DIR%VERIFIER-KIT-WINDOWS.ps1\"",
    "echo.",
    "echo Rapport kit: %KIT_DIR%FIELD-KIT-SELF-CHECK.md",
    "echo Version HTML: %KIT_DIR%FIELD-KIT-SELF-CHECK.html",
    "start \"\" \"%KIT_DIR%FIELD-KIT-SELF-CHECK.html\"",
    "pause",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "VERIFIER-KIT-WINDOWS.ps1"), String.raw`param()

$ErrorActionPreference = "Stop"

function Html($value) {
  return [System.Net.WebUtility]::HtmlEncode([string]$value)
}

function Read-Manifest($path) {
  $data = @{}
  if (!(Test-Path -LiteralPath $path)) { return $data }
  foreach ($line in Get-Content -LiteralPath $path -Encoding UTF8) {
    if ($line -notmatch "=") { continue }
    $parts = $line.Split("=", 2)
    $data[$parts[0].Trim()] = $parts[1].Trim()
  }
  return $data
}

$manifestPath = Join-Path $PSScriptRoot "FIELD-KIT-MANIFEST.txt"
$manifest = Read-Manifest $manifestPath
$buildId = [string]$manifest["build_id"]
$installerName = [string]$manifest["installer_name"]
$expectedSha = ([string]$manifest["installer_sha256"]).ToLowerInvariant()
$installerPath = Join-Path (Join-Path $PSScriptRoot "installer") $installerName
$requiredFiles = @(
  "START-HERE.html",
  "RECETTE-5-MINUTES.html",
  "CENTRE-TERRAIN.html",
  "PROCHAIN-PC.html",
  "FIELD-PROGRESS.html",
  "FIELD-PROGRESS.json",
  "FIELD-PROGRESS.md",
  "FIELD-PROFILE-CARDS.html",
  "FIELD-PROFILE-EXPECTATIONS.json",
  "FIELD-PROFILE-EXPECTATIONS.md",
  "FIELD-PROFILE-EXPECTATIONS.html",
  "FIELD-OPERATOR-CHECKLIST.json",
  "FIELD-OPERATOR-CHECKLIST.md",
  "FIELD-OPERATOR-CHECKLIST.html",
  "FIELD-NEXT-ACTIONS.html",
  "RAPPORT-PDF-TERRAIN.html",
  "CATALOGUE-VIVANT.html",
  "PONT-STRATEGY-ARENA.html",
  "FIELD-DISPATCH.html",
  "FIELD-KIT-MANIFEST.txt",
  "FIELD-PROOF-MANIFEST.json",
  "INSTALLER-APP.cmd",
  "OUVRIR-ACTIONS-RESTANTES.cmd",
  "OUVRIR-CATALOGUE-VIVANT.cmd",
  "OUVRIR-PONT-STRATEGY-ARENA.cmd",
  "OUVRIR-RAPPORT-PDF-TERRAIN.cmd",
  "OUVRIR-CHECKLIST-OPERATEUR.cmd",
  "PROCHAIN-PC.cmd",
  "OUVRIR-PROGRESSION-TERRAIN.cmd",
  "PREPARER-PROCHAIN-PC.cmd",
  "PREPARER-PROCHAIN-PC-WINDOWS.ps1",
  "PREPARER-PACKS-MANQUANTS.cmd",
  "PREPARER-PACKS-MANQUANTS-WINDOWS.ps1",
  "VERIFIER-PACKS-MANQUANTS.cmd",
  "VERIFIER-PACKS-MANQUANTS-WINDOWS.ps1",
  "MISSING-PC-PACKS.html",
  "MISSING-PC-MISSION.html",
  "MISSING-PC-MISSION.md",
  "MISSING-PC-MISSION.json",
  "VERIFIER-KIT.cmd",
  "AUDIT-TERRAIN.cmd",
  "AUDIT-TERRAIN-WINDOWS.ps1",
  "STATUT.cmd",
  "STATUT-WINDOWS.ps1",
  "VALIDER-DERNIERE-FICHE.cmd",
  "VALIDER-FICHE-WINDOWS.ps1",
  "EXPORTER-FICHES.cmd",
  "IMPORTER-PACK-FICHES.cmd",
  "PREPARER-KIT-USB.cmd"
)
$missing = @()
if ([string]::IsNullOrWhiteSpace($buildId)) { $missing += "build_id absent du manifeste" }
if ([string]::IsNullOrWhiteSpace($installerName)) { $missing += "installer_name absent du manifeste" }
if ([string]::IsNullOrWhiteSpace($expectedSha)) { $missing += "installer_sha256 absent du manifeste" }
foreach ($file in $requiredFiles) {
  if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot $file))) { $missing += $file }
}
$actualSha = ""
$installerBytes = 0
$installerFiles = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot "installer") -File -ErrorAction SilentlyContinue)
if ($installerFiles.Count -ne 1) { $missing += "le dossier installer doit contenir exactement un fichier" }
if (Test-Path -LiteralPath $installerPath) {
  $actualSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $installerPath).Hash.ToLowerInvariant()
  $installerBytes = (Get-Item -LiteralPath $installerPath).Length
  if ($actualSha -ne $expectedSha) { $missing += "sha installeur invalide" }
  if ($installerBytes -lt 1000000) { $missing += "installeur trop petit" }
} else {
  $missing += "installeur introuvable: $installerName"
}

$status = if ($missing.Count -eq 0) { "FIELD_KIT_READY" } else { "FIELD_KIT_INVALID" }
$jsonPath = Join-Path $PSScriptRoot "FIELD-KIT-SELF-CHECK.json"
$mdPath = Join-Path $PSScriptRoot "FIELD-KIT-SELF-CHECK.md"
$htmlPath = Join-Path $PSScriptRoot "FIELD-KIT-SELF-CHECK.html"
$report = [pscustomobject]@{
  schema = "outilsia.local_cockpit_field_kit_self_check.v1"
  checked_at = (Get-Date).ToUniversalTime().ToString("o")
  status = $status
  build_id = $buildId
  installer_name = $installerName
  installer_bytes = $installerBytes
  expected_sha256 = $expectedSha
  actual_sha256 = $actualSha
  missing = $missing
}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

$lines = @(
  "# Verification kit terrain OutilsIA",
  "",
  "- Statut: $status",
  "- Build: $buildId",
  "- Installeur: $installerName",
  "- Taille installeur: $installerBytes",
  "- SHA attendu: $expectedSha",
  "- SHA actuel: $actualSha",
  "",
  "## Verdict",
  $(if ($missing.Count -eq 0) { "- Kit pret a tester sur un PC physique." } else { "- Kit incomplet: ne pas partir tester avant correction." }),
  "",
  "## Manques",
  $(if ($missing.Count -eq 0) { "- aucun" } else { ($missing | ForEach-Object { "- $_" }) -join [Environment]::NewLine }),
  ""
)
$lines | Set-Content -LiteralPath $mdPath -Encoding UTF8

$rows = if ($missing.Count -eq 0) { "<li>aucun</li>" } else { ($missing | ForEach-Object { "<li>$(Html $_)</li>" }) -join "" }
$html = @"
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Verification kit terrain OutilsIA</title>
  <style>
    :root { --ink:#172033; --muted:#607086; --line:#dbe4ef; --panel:#fff; --soft:#f5f8fc; --green:#167447; --red:#b42318; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI,Arial,sans-serif; color:var(--ink); background:#edf2f8; line-height:1.45; }
    main { width:min(880px, calc(100% - 28px)); margin:28px auto; }
    header { color:white; background:#12335e; border-radius:14px; padding:30px 34px; box-shadow:0 16px 46px rgba(28,43,68,.12); }
    section { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:24px; margin-top:16px; box-shadow:0 12px 34px rgba(28,43,68,.08); }
    .status { font-size:24px; font-weight:900; color:$(if ($missing.Count -eq 0) { 'var(--green)' } else { 'var(--red)' }); }
    code { font-family:Consolas,monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; }
    li { margin:7px 0; }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Verification kit terrain OutilsIA</h1>
    <p>Controle natif Windows avant de tester une machine physique.</p>
  </header>
  <section>
    <div class="status">$(Html $status)</div>
    <p>Build <code>$(Html $buildId)</code></p>
    <p>Installeur <code>$(Html $installerName)</code></p>
    <p>SHA attendu <code>$(Html $expectedSha)</code></p>
    <p>SHA actuel <code>$(Html $actualSha)</code></p>
  </section>
  <section>
    <h2>Manques</h2>
    <ul>$rows</ul>
  </section>
</main>
</body>
</html>
"@
$html | Set-Content -LiteralPath $htmlPath -Encoding UTF8

Write-Host "field_kit_self_check_windows status=$status missing=$($missing.Count) build=$buildId"
if ($missing.Count -gt 0) { exit 1 }
exit 0
`, "utf8");

  writeFileSync(join(kitDir, "COLLECTER.cmd"), [
    "@echo off",
    "setlocal",
    "set \"KIT_DIR=%~dp0\"",
    "set \"ENTRY_DIR=%KIT_DIR%entries\"",
    "if not exist \"%ENTRY_DIR%\" mkdir \"%ENTRY_DIR%\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$kit='%~dp0'; $entry=Join-Path $kit 'entries'; $download=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'; New-Item -ItemType Directory -Force -Path $entry | Out-Null; $files=Get-ChildItem -Path $download -Filter 'outilsia-field-test-*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending; if(-not $files){ Write-Host 'Aucune fiche outilsia-field-test-*.json trouvee dans Telechargements'; exit 2 }; foreach($file in $files){ Copy-Item $file.FullName (Join-Path $entry $file.Name) -Force; Write-Host ('fiche_collectee ' + $file.Name) }; Write-Host ('total=' + $files.Count)\"",
    "if errorlevel 1 goto fail",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%KIT_DIR%VALIDER-FICHES-WINDOWS.ps1\" -EntriesDir \"%ENTRY_DIR%\" -OutJson \"%KIT_DIR%FIELD-ENTRIES-VALIDATION.json\"",
    "if errorlevel 2 goto fail",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%KIT_DIR%STATUT-WINDOWS.ps1\"",
    "echo.",
    "echo Rapport validation fiches: %KIT_DIR%FIELD-ENTRIES-VALIDATION.html",
    "echo Collecte terminee. Centre terrain: %KIT_DIR%CENTRE-TERRAIN.html",
    "start \"\" \"%KIT_DIR%FIELD-ENTRIES-VALIDATION.html\"",
    "start \"\" \"%KIT_DIR%CENTRE-TERRAIN.html\"",
    "pause",
    "exit /b 0",
    ":fail",
    "echo.",
    "echo Collecte impossible ou fiches invalides. Verifie Downloads, puis relance COLLECTER.cmd.",
    "pause",
    "exit /b 1",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "VALIDER-DERNIERE-FICHE.cmd"), [
    "@echo off",
    "setlocal",
    "set \"KIT_DIR=%~dp0\"",
    "set \"ENTRY_DIR=%KIT_DIR%entries\"",
    "if not exist \"%ENTRY_DIR%\" mkdir \"%ENTRY_DIR%\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$kit='%~dp0'; $entry=Join-Path $kit 'entries'; $download=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'; New-Item -ItemType Directory -Force -Path $entry | Out-Null; $file=Get-ChildItem -Path $download -Filter 'outilsia-field-test-*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(-not $file){ Write-Host 'Aucune fiche outilsia-field-test-*.json trouvee dans Telechargements'; exit 2 }; Copy-Item $file.FullName (Join-Path $entry $file.Name) -Force; Set-Content -Path (Join-Path $kit 'LAST-FIELD-ENTRY.txt') -Value $file.Name -Encoding ASCII; Write-Host ('fiche_a_valider ' + $file.Name)\"",
    "if errorlevel 1 goto fail",
    "set /p LAST_ENTRY=<\"%KIT_DIR%LAST-FIELD-ENTRY.txt\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%KIT_DIR%VALIDER-FICHE-WINDOWS.ps1\" -InputPath \"%ENTRY_DIR%\\%LAST_ENTRY%\"",
    "if errorlevel 1 goto fail",
    "echo.",
    "echo Fiche valide. Tu peux passer au profil suivant ou lancer STATUT.cmd.",
    "pause",
    "exit /b 0",
    ":fail",
    "echo.",
    "echo Fiche invalide ou introuvable. Complete le flux dans l'app: benchmark, PromptForge, dialogue, Arena et rapport, puis retelecharge la fiche.",
    "pause",
    "exit /b 1",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "VALIDER-FICHE-WINDOWS.ps1"), String.raw`param(
  [string]$InputPath = ""
)

$ErrorActionPreference = "Stop"
$requiredProfiles = @("old_laptop", "core_i7_gtx_1080_ti", "rtx_3060_12gb", "rtx_4080_4090", "cpu_only")
$requiredFields = @(
  "app_version",
  "build_id",
  "machine_label",
  "tested_at",
  "os",
  "cpu",
  "gpu",
  "ram_gb",
  "scan_ok",
  "score",
  "score_label",
  "recommended_model",
  "first_action",
  "upgrade_recommendation",
  "benchmark_model",
  "benchmark_tokens_per_second",
  "benchmark_elapsed_ms",
  "promptforge_ok",
  "dialogue_ok",
  "arena_ok",
  "report_ok",
  "share_url"
)

function Fail($message) {
  Write-Host "field_entry_invalid $message" -ForegroundColor Red
  exit 1
}

function Read-FieldJson($path) {
  if (!(Test-Path -LiteralPath $path)) { Fail "fichier introuvable: $path" }
  try {
    return Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    Fail "json illisible: $($_.Exception.Message)"
  }
}

function Test-ValueOk($entry, $field) {
  $value = $entry.$field
  if ($field.EndsWith("_ok")) { return $value -eq $true }
  if (@("ram_gb", "score", "benchmark_tokens_per_second", "benchmark_elapsed_ms") -contains $field) {
    $number = 0.0
    $style = [System.Globalization.NumberStyles]::Float
    $culture = [System.Globalization.CultureInfo]::InvariantCulture
    return [double]::TryParse([string]$value, $style, $culture, [ref]$number) -and $number -gt 0
  }
  return ![string]::IsNullOrWhiteSpace([string]$value)
}

function Test-ShareUrl($value) {
  $text = [string]$value
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }
  $uri = $null
  if (![System.Uri]::TryCreate($text, [System.UriKind]::Absolute, [ref]$uri)) { return $false }
  if (!($uri.Scheme -eq "http" -or $uri.Scheme -eq "https")) { return $false }
  return $uri.Host -eq "outilsia.fr" -and $uri.AbsolutePath.StartsWith("/r/")
}

function Test-TestedAt($value) {
  $text = [string]$value
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }
  $parsed = [datetime]::MinValue
  if (![datetime]::TryParse($text, [ref]$parsed)) { return $false }
  if ($parsed.ToUniversalTime() -lt ([datetime]"2026-07-01T00:00:00Z")) { return $false }
  if ($parsed.ToUniversalTime() -gt (Get-Date).ToUniversalTime().AddMinutes(10)) { return $false }
  return $true
}

function Test-BenchmarkPlausible($entry) {
  $caps = @{
    old_laptop = 45
    core_i7_gtx_1080_ti = 95
    rtx_3060_12gb = 150
    rtx_4080_4090 = 650
    cpu_only = 35
  }
  $profile = [string]$entry.profile
  if (!$caps.ContainsKey($profile)) { return "" }
  $value = 0.0
  [double]::TryParse([string]$entry.benchmark_tokens_per_second, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$value) | Out-Null
  $elapsedMs = 0.0
  [double]::TryParse([string]$entry.benchmark_elapsed_ms, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$elapsedMs) | Out-Null
  if ($elapsedMs -lt 200) { return "benchmark_elapsed_ms invraisemblable: $elapsedMs ms < 200 ms" }
  if ($value -gt [double]$caps[$profile]) { return "benchmark_tokens_per_second invraisemblable: $value tok/s > $($caps[$profile]) tok/s" }
  return ""
}

${FIELD_ENRICHMENT_POWERSHELL}
${FIELD_ENRICHMENT_POWERSHELL}
function Test-First30sProof($entry) {
  $required = @("hardware_visible", "score_visible", "recommended_model_visible", "benchmark_cta_or_proof_visible", "upgrade_visible")
  $proofProperty = $entry.PSObject.Properties["first_30s"]
  if ($proofProperty -and $proofProperty.Value) {
    $proof = $proofProperty.Value
    $missing = @()
    foreach ($key in $required) {
      if ($proof.$key -ne $true) { $missing += $key }
    }
    if ($missing.Count -gt 0) {
      return @{ complete = $false; source = "explicit"; summary = ""; error = "first_30s incomplet: $($missing -join ', ')" }
    }
    if ([string]::IsNullOrWhiteSpace([string]$proof.summary)) {
      return @{ complete = $false; source = "explicit"; summary = ""; error = "first_30s.summary absent" }
    }
    return @{ complete = $true; source = "explicit"; summary = [string]$proof.summary; error = "" }
  }
  $hardwareVisible = $entry.scan_ok -eq $true -and ![string]::IsNullOrWhiteSpace([string]$entry.cpu) -and ![string]::IsNullOrWhiteSpace([string]$entry.gpu) -and [double]$entry.ram_gb -gt 0
  $scoreVisible = [double]$entry.score -gt 0 -and ![string]::IsNullOrWhiteSpace([string]$entry.score_label)
  $recommendedVisible = ![string]::IsNullOrWhiteSpace([string]$entry.recommended_model)
  $benchmarkVisible = (![string]::IsNullOrWhiteSpace([string]$entry.benchmark_model) -and [double]$entry.benchmark_tokens_per_second -gt 0) -or ([string]$entry.first_action -match "bench|test|tester|lancer")
  $upgradeVisible = ![string]::IsNullOrWhiteSpace([string]$entry.upgrade_recommendation)
  $derived = @{
    hardware_visible = $hardwareVisible
    score_visible = $scoreVisible
    recommended_model_visible = $recommendedVisible
    benchmark_cta_or_proof_visible = $benchmarkVisible
    upgrade_visible = $upgradeVisible
  }
  $missingDerived = @()
  foreach ($key in $required) {
    if ($derived[$key] -ne $true) { $missingDerived += $key }
  }
  if ($missingDerived.Count -gt 0) {
    return @{ complete = $false; source = "derived_legacy"; summary = ""; error = "first_30s deduit incomplet: $($missingDerived -join ', ')" }
  }
  $summary = "$($entry.gpu) - $($entry.vram_gb) Go VRAM - $($entry.ram_gb) Go RAM | score $($entry.score)/100 | modele $($entry.recommended_model) | benchmark $($entry.benchmark_model) | upgrade $($entry.upgrade_recommendation)"
  return @{ complete = $true; source = "derived_legacy"; summary = $summary; error = "" }
}

function Test-ProfileHardware($entry) {
  $profile = [string]$entry.profile
  $gpu = ([string]$entry.gpu).ToLowerInvariant()
  $cpu = ([string]$entry.cpu).ToLowerInvariant()
  $os = ([string]$entry.os).ToLowerInvariant()
  $vram = 0.0
  $ram = 0.0
  [double]::TryParse([string]$entry.vram_gb, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$vram) | Out-Null
  [double]::TryParse([string]$entry.ram_gb, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$ram) | Out-Null
  switch ($profile) {
    "old_laptop" {
      if ($vram -gt 8) { return "old_laptop.vram_gb doit rester <= 8" }
      if ($ram -gt 24 -and $vram -gt 6 -and !$gpu.Contains("laptop") -and !$cpu.Contains("mobile") -and !$os.Contains("laptop")) {
        return "old_laptop doit ressembler a un portable ou une machine modeste"
      }
      return ""
    }
    "core_i7_gtx_1080_ti" {
      if (!$gpu.Contains("1080")) { return "core_i7_gtx_1080_ti.gpu doit mentionner GTX 1080 Ti" }
      if (!$gpu.Contains("ti")) { return "core_i7_gtx_1080_ti.gpu doit mentionner Ti" }
      if ($vram -lt 10 -or $vram -gt 12) { return "core_i7_gtx_1080_ti.vram_gb doit etre autour de 11 Go" }
      if (!$cpu.Contains("i7") -and !$cpu.Contains("core")) { return "core_i7_gtx_1080_ti.cpu doit mentionner Core/i7" }
      return ""
    }
    "rtx_3060_12gb" {
      if (!$gpu.Contains("3060")) { return "rtx_3060_12gb.gpu doit mentionner RTX 3060" }
      if ($vram -lt 10 -or $vram -gt 13) { return "rtx_3060_12gb.vram_gb doit etre autour de 12 Go" }
      return ""
    }
    "rtx_4080_4090" {
      if (!$gpu.Contains("4080") -and !$gpu.Contains("4090")) { return "rtx_4080_4090.gpu doit mentionner RTX 4080 ou RTX 4090" }
      if ($vram -lt 16) { return "rtx_4080_4090.vram_gb doit etre au moins 16 Go" }
      return ""
    }
    "cpu_only" {
      if ($vram -ne 0) { return "cpu_only.vram_gb doit etre 0" }
      if (!$gpu.Contains("cpu") -and !$gpu.Contains("aucun") -and !$gpu.Contains("no gpu") -and !$gpu.Contains("none")) {
        return "cpu_only.gpu doit indiquer clairement l'absence de GPU dedie"
      }
      return ""
    }
  }
  return "profil inconnu: $profile"
}

function Add-LegacyMetadata($entry, $payload) {
  if (!$entry) { return $entry }
  if (!$entry.PSObject.Properties["build_id"]) {
    $entry | Add-Member -NotePropertyName "build_id" -NotePropertyValue "" -Force
  }
  if (!$entry.PSObject.Properties["app_version"]) {
    $entry | Add-Member -NotePropertyName "app_version" -NotePropertyValue "" -Force
  }
  if ([string]::IsNullOrWhiteSpace([string]$entry.build_id) -and $payload -and $payload.PSObject.Properties["build_id"]) {
    $entry.build_id = [string]$payload.build_id
  }
  if ([string]::IsNullOrWhiteSpace([string]$entry.app_version) -and $payload -and $payload.PSObject.Properties["app_version"]) {
    $entry.app_version = [string]$payload.app_version
  }
  if (![string]::IsNullOrWhiteSpace([string]$entry.build_id) -and ![string]::IsNullOrWhiteSpace([string]$entry.app_version)) {
    return $entry
  }
  $manifestPath = Join-Path $PSScriptRoot "FIELD-KIT-MANIFEST.txt"
  if (!(Test-Path -LiteralPath $manifestPath)) { return $entry }
  $manifest = @{}
  foreach ($line in Get-Content -LiteralPath $manifestPath -Encoding UTF8) {
    if ($line -match "^([^=]+)=(.*)$") { $manifest[$matches[1].Trim()] = $matches[2].Trim() }
  }
  $expectedBuild = [string]$manifest["build_id"]
  $expectedVersion = [string]$manifest["version"]
  $notes = [string]$entry.notes
  if (![string]::IsNullOrWhiteSpace($expectedBuild) -and $notes -match [regex]::Escape($expectedBuild)) {
    if ([string]::IsNullOrWhiteSpace([string]$entry.build_id)) { $entry.build_id = $expectedBuild }
    if ([string]::IsNullOrWhiteSpace([string]$entry.app_version)) { $entry.app_version = $expectedVersion }
  }
  return $entry
}

function Get-Entry($payload) {
  if ($payload.profile) { return Add-LegacyMetadata $payload $payload }
  if ($payload.schema -eq "outilsia.local_cockpit_field_tests.v1" -and $payload.machines -and $payload.machines.Count -eq 1) {
    $entry = $payload.machines[0]
    if (!$entry.PSObject.Properties["build_id"]) {
      $entry | Add-Member -NotePropertyName "build_id" -NotePropertyValue ([string]$payload.build_id) -Force
    }
    if (!$entry.PSObject.Properties["app_version"]) {
      $entry | Add-Member -NotePropertyName "app_version" -NotePropertyValue ([string]$payload.app_version) -Force
    }
    return Add-LegacyMetadata $entry $payload
  }
  Fail "le fichier doit contenir une fiche machine ou un payload FIELD-TESTS avec une seule machine"
}

if ([string]::IsNullOrWhiteSpace($InputPath)) {
  $download = Join-Path ([Environment]::GetFolderPath("UserProfile")) "Downloads"
  $latest = Get-ChildItem -Path $download -Filter "outilsia-field-test-*.json" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (!$latest) { Fail "aucune fiche outilsia-field-test-*.json trouvee dans Telechargements" }
  $InputPath = $latest.FullName
}

$entry = Get-Entry (Read-FieldJson $InputPath)
if ($requiredProfiles -notcontains $entry.profile) { Fail "profil inattendu: $($entry.profile)" }
$expectedProfilePath = Join-Path $PSScriptRoot "EXPECTED-FIELD-PROFILE.txt"
if (Test-Path -LiteralPath $expectedProfilePath) {
  $expectedProfile = (Get-Content -LiteralPath $expectedProfilePath -Raw -Encoding UTF8).Trim()
  if (![string]::IsNullOrWhiteSpace($expectedProfile)) {
    if ($requiredProfiles -notcontains $expectedProfile) {
      Fail "profil attendu invalide dans EXPECTED-FIELD-PROFILE.txt: $expectedProfile"
    }
    if ([string]$entry.profile -ne $expectedProfile) {
      Fail "profil=$($entry.profile) ne correspond pas au profil attendu: $expectedProfile"
    }
  }
}

$fields = @($requiredFields)
if ($entry.profile -ne "cpu_only") { $fields += "vram_gb" }
$missing = @()
foreach ($field in $fields) {
  if (!(Test-ValueOk $entry $field)) { $missing += $field }
}

if ($missing.Count -gt 0) {
  Fail "profil=$($entry.profile) champs incomplets: $($missing -join ', ')"
}
if (!(Test-ShareUrl $entry.share_url)) {
  Fail "profil=$($entry.profile) share_url invalide ou absent"
}
if (!(Test-TestedAt $entry.tested_at)) {
  Fail "profil=$($entry.profile) tested_at invalide ou absent"
}
$first30s = Test-First30sProof $entry
if ($first30s.complete -ne $true) {
  Fail "profil=$($entry.profile) $($first30s.error)"
}
$profileHardwareError = Test-ProfileHardware $entry
if (![string]::IsNullOrWhiteSpace($profileHardwareError)) {
  Fail "profil=$($entry.profile) coherence materielle invalide: $profileHardwareError"
}
$benchmarkPlausibilityError = Test-BenchmarkPlausible $entry
if (![string]::IsNullOrWhiteSpace($benchmarkPlausibilityError)) {
  Fail "profil=$($entry.profile) $benchmarkPlausibilityError"
}
$enriched = Test-EnrichedEvidence $entry
if (![string]::IsNullOrWhiteSpace([string]$enriched.error)) {
  Fail "profil=$($entry.profile) preuve enrichie invalide: $($enriched.error)"
}

$report = $entry.share_url
Write-Host "field_entry_ok profile=$($entry.profile) model=$($entry.recommended_model) benchmark=$($entry.benchmark_model) tps=$($entry.benchmark_tokens_per_second) first_30s=$($first30s.source) doctor=$($enriched.doctor) runtime=$($enriched.runtime) passport=$($enriched.passport) build_id=$($entry.build_id) app_version=$($entry.app_version) report=$report" -ForegroundColor Green
exit 0
`, "utf8");

  writeFileSync(join(kitDir, "VALIDER-FICHES.cmd"), [
    "@echo off",
    "setlocal",
    "set \"KIT_DIR=%~dp0\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%KIT_DIR%VALIDER-FICHES-WINDOWS.ps1\" -EntriesDir \"%KIT_DIR%entries\" -OutJson \"%KIT_DIR%FIELD-ENTRIES-VALIDATION.json\"",
    "echo.",
    "echo Rapport texte validation fiches: %KIT_DIR%FIELD-ENTRIES-VALIDATION.md",
    "echo Rapport validation fiches: %KIT_DIR%FIELD-ENTRIES-VALIDATION.html",
    "start \"\" \"%KIT_DIR%FIELD-ENTRIES-VALIDATION.html\"",
    "pause",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "VALIDER-FICHES-WINDOWS.ps1"), String.raw`param(
  [string]$EntriesDir = "",
  [string]$OutJson = ""
)

$ErrorActionPreference = "Stop"
$requiredProfiles = @("old_laptop", "core_i7_gtx_1080_ti", "rtx_3060_12gb", "rtx_4080_4090", "cpu_only")
$requiredFields = @(
  "app_version",
  "build_id",
  "machine_label",
  "tested_at",
  "os",
  "cpu",
  "gpu",
  "ram_gb",
  "scan_ok",
  "score",
  "score_label",
  "recommended_model",
  "first_action",
  "upgrade_recommendation",
  "benchmark_model",
  "benchmark_tokens_per_second",
  "benchmark_elapsed_ms",
  "promptforge_ok",
  "dialogue_ok",
  "arena_ok",
  "report_ok",
  "share_url"
)

function Test-ValueOk($entry, $field) {
  $value = $entry.$field
  if ($field.EndsWith("_ok")) { return $value -eq $true }
  if (@("ram_gb", "score", "benchmark_tokens_per_second", "benchmark_elapsed_ms") -contains $field) {
    $number = 0.0
    $style = [System.Globalization.NumberStyles]::Float
    $culture = [System.Globalization.CultureInfo]::InvariantCulture
    return [double]::TryParse([string]$value, $style, $culture, [ref]$number) -and $number -gt 0
  }
  return ![string]::IsNullOrWhiteSpace([string]$value)
}

function Test-ShareUrl($value) {
  $text = [string]$value
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }
  $uri = $null
  if (![System.Uri]::TryCreate($text, [System.UriKind]::Absolute, [ref]$uri)) { return $false }
  if (!($uri.Scheme -eq "http" -or $uri.Scheme -eq "https")) { return $false }
  return $uri.Host -eq "outilsia.fr" -and $uri.AbsolutePath.StartsWith("/r/")
}

function Test-TestedAt($value) {
  $text = [string]$value
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }
  $parsed = [datetime]::MinValue
  if (![datetime]::TryParse($text, [ref]$parsed)) { return $false }
  if ($parsed.ToUniversalTime() -lt ([datetime]"2026-07-01T00:00:00Z")) { return $false }
  if ($parsed.ToUniversalTime() -gt (Get-Date).ToUniversalTime().AddMinutes(10)) { return $false }
  return $true
}

function Test-BenchmarkPlausible($entry) {
  $caps = @{
    old_laptop = 45
    core_i7_gtx_1080_ti = 95
    rtx_3060_12gb = 150
    rtx_4080_4090 = 650
    cpu_only = 35
  }
  $profile = [string]$entry.profile
  if (!$caps.ContainsKey($profile)) { return "" }
  $value = 0.0
  [double]::TryParse([string]$entry.benchmark_tokens_per_second, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$value) | Out-Null
  $elapsedMs = 0.0
  [double]::TryParse([string]$entry.benchmark_elapsed_ms, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$elapsedMs) | Out-Null
  if ($elapsedMs -lt 200) { return "benchmark_elapsed_ms invraisemblable: $elapsedMs ms < 200 ms" }
  if ($value -gt [double]$caps[$profile]) { return "benchmark_tokens_per_second invraisemblable: $value tok/s > $($caps[$profile]) tok/s" }
  return ""
}

function Test-First30sProof($entry) {
  $required = @("hardware_visible", "score_visible", "recommended_model_visible", "benchmark_cta_or_proof_visible", "upgrade_visible")
  $proofProperty = $entry.PSObject.Properties["first_30s"]
  if ($proofProperty -and $proofProperty.Value) {
    $proof = $proofProperty.Value
    $missing = @()
    foreach ($key in $required) {
      if ($proof.$key -ne $true) { $missing += $key }
    }
    if ($missing.Count -gt 0) {
      return @{ complete = $false; source = "explicit"; summary = ""; error = "first_30s incomplet: $($missing -join ', ')" }
    }
    if ([string]::IsNullOrWhiteSpace([string]$proof.summary)) {
      return @{ complete = $false; source = "explicit"; summary = ""; error = "first_30s.summary absent" }
    }
    return @{ complete = $true; source = "explicit"; summary = [string]$proof.summary; error = "" }
  }
  $hardwareVisible = $entry.scan_ok -eq $true -and ![string]::IsNullOrWhiteSpace([string]$entry.cpu) -and ![string]::IsNullOrWhiteSpace([string]$entry.gpu) -and [double]$entry.ram_gb -gt 0
  $scoreVisible = [double]$entry.score -gt 0 -and ![string]::IsNullOrWhiteSpace([string]$entry.score_label)
  $recommendedVisible = ![string]::IsNullOrWhiteSpace([string]$entry.recommended_model)
  $benchmarkVisible = (![string]::IsNullOrWhiteSpace([string]$entry.benchmark_model) -and [double]$entry.benchmark_tokens_per_second -gt 0) -or ([string]$entry.first_action -match "bench|test|tester|lancer")
  $upgradeVisible = ![string]::IsNullOrWhiteSpace([string]$entry.upgrade_recommendation)
  $derived = @{
    hardware_visible = $hardwareVisible
    score_visible = $scoreVisible
    recommended_model_visible = $recommendedVisible
    benchmark_cta_or_proof_visible = $benchmarkVisible
    upgrade_visible = $upgradeVisible
  }
  $missingDerived = @()
  foreach ($key in $required) {
    if ($derived[$key] -ne $true) { $missingDerived += $key }
  }
  if ($missingDerived.Count -gt 0) {
    return @{ complete = $false; source = "derived_legacy"; summary = ""; error = "first_30s deduit incomplet: $($missingDerived -join ', ')" }
  }
  $summary = "$($entry.gpu) - $($entry.vram_gb) Go VRAM - $($entry.ram_gb) Go RAM | score $($entry.score)/100 | modele $($entry.recommended_model) | benchmark $($entry.benchmark_model) | upgrade $($entry.upgrade_recommendation)"
  return @{ complete = $true; source = "derived_legacy"; summary = $summary; error = "" }
}

function Test-ProfileHardware($entry) {
  $profile = [string]$entry.profile
  $gpu = ([string]$entry.gpu).ToLowerInvariant()
  $cpu = ([string]$entry.cpu).ToLowerInvariant()
  $os = ([string]$entry.os).ToLowerInvariant()
  $vram = 0.0
  $ram = 0.0
  [double]::TryParse([string]$entry.vram_gb, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$vram) | Out-Null
  [double]::TryParse([string]$entry.ram_gb, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$ram) | Out-Null
  switch ($profile) {
    "old_laptop" {
      if ($vram -gt 8) { return "old_laptop.vram_gb doit rester <= 8" }
      if ($ram -gt 24 -and $vram -gt 6 -and !$gpu.Contains("laptop") -and !$cpu.Contains("mobile") -and !$os.Contains("laptop")) {
        return "old_laptop doit ressembler a un portable ou une machine modeste"
      }
      return ""
    }
    "core_i7_gtx_1080_ti" {
      if (!$gpu.Contains("1080")) { return "core_i7_gtx_1080_ti.gpu doit mentionner GTX 1080 Ti" }
      if (!$gpu.Contains("ti")) { return "core_i7_gtx_1080_ti.gpu doit mentionner Ti" }
      if ($vram -lt 10 -or $vram -gt 12) { return "core_i7_gtx_1080_ti.vram_gb doit etre autour de 11 Go" }
      if (!$cpu.Contains("i7") -and !$cpu.Contains("core")) { return "core_i7_gtx_1080_ti.cpu doit mentionner Core/i7" }
      return ""
    }
    "rtx_3060_12gb" {
      if (!$gpu.Contains("3060")) { return "rtx_3060_12gb.gpu doit mentionner RTX 3060" }
      if ($vram -lt 10 -or $vram -gt 13) { return "rtx_3060_12gb.vram_gb doit etre autour de 12 Go" }
      return ""
    }
    "rtx_4080_4090" {
      if (!$gpu.Contains("4080") -and !$gpu.Contains("4090")) { return "rtx_4080_4090.gpu doit mentionner RTX 4080 ou RTX 4090" }
      if ($vram -lt 16) { return "rtx_4080_4090.vram_gb doit etre au moins 16 Go" }
      return ""
    }
    "cpu_only" {
      if ($vram -ne 0) { return "cpu_only.vram_gb doit etre 0" }
      if (!$gpu.Contains("cpu") -and !$gpu.Contains("aucun") -and !$gpu.Contains("no gpu") -and !$gpu.Contains("none")) {
        return "cpu_only.gpu doit indiquer clairement l'absence de GPU dedie"
      }
      return ""
    }
  }
  return "profil inconnu: $profile"
}

function Add-LegacyMetadata($entry, $payload) {
  if (!$entry) { return $entry }
  if (!$entry.PSObject.Properties["build_id"]) {
    $entry | Add-Member -NotePropertyName "build_id" -NotePropertyValue "" -Force
  }
  if (!$entry.PSObject.Properties["app_version"]) {
    $entry | Add-Member -NotePropertyName "app_version" -NotePropertyValue "" -Force
  }
  if ([string]::IsNullOrWhiteSpace([string]$entry.build_id) -and $payload -and $payload.PSObject.Properties["build_id"]) {
    $entry.build_id = [string]$payload.build_id
  }
  if ([string]::IsNullOrWhiteSpace([string]$entry.app_version) -and $payload -and $payload.PSObject.Properties["app_version"]) {
    $entry.app_version = [string]$payload.app_version
  }
  if (![string]::IsNullOrWhiteSpace([string]$entry.build_id) -and ![string]::IsNullOrWhiteSpace([string]$entry.app_version)) {
    return $entry
  }
  $manifestPath = Join-Path $PSScriptRoot "FIELD-KIT-MANIFEST.txt"
  if (!(Test-Path -LiteralPath $manifestPath)) { return $entry }
  $manifest = @{}
  foreach ($line in Get-Content -LiteralPath $manifestPath -Encoding UTF8) {
    if ($line -match "^([^=]+)=(.*)$") { $manifest[$matches[1].Trim()] = $matches[2].Trim() }
  }
  $expectedBuild = [string]$manifest["build_id"]
  $expectedVersion = [string]$manifest["version"]
  $notes = [string]$entry.notes
  if (![string]::IsNullOrWhiteSpace($expectedBuild) -and $notes -match [regex]::Escape($expectedBuild)) {
    if ([string]::IsNullOrWhiteSpace([string]$entry.build_id)) { $entry.build_id = $expectedBuild }
    if ([string]::IsNullOrWhiteSpace([string]$entry.app_version)) { $entry.app_version = $expectedVersion }
  }
  return $entry
}

function Get-Entry($payload) {
  if ($payload.profile) { return Add-LegacyMetadata $payload $payload }
  if ($payload.schema -eq "outilsia.local_cockpit_field_tests.v1" -and $payload.machines -and $payload.machines.Count -eq 1) {
    $entry = $payload.machines[0]
    if (!$entry.PSObject.Properties["build_id"]) {
      $entry | Add-Member -NotePropertyName "build_id" -NotePropertyValue ([string]$payload.build_id) -Force
    }
    if (!$entry.PSObject.Properties["app_version"]) {
      $entry | Add-Member -NotePropertyName "app_version" -NotePropertyValue ([string]$payload.app_version) -Force
    }
    return Add-LegacyMetadata $entry $payload
  }
  return $null
}

function Validate-Entry($entry) {
  if (!$entry) { return @{ status = "unreadable"; error = "aucune fiche machine trouvee" } }
  if ($requiredProfiles -notcontains $entry.profile) {
    return @{ status = "unexpected"; error = "profil inattendu: $($entry.profile)" }
  }
  $fields = @($requiredFields)
  if ($entry.profile -ne "cpu_only") { $fields += "vram_gb" }
  $missing = @()
  foreach ($field in $fields) {
    if (!(Test-ValueOk $entry $field)) { $missing += $field }
  }
  if ($missing.Count -gt 0) {
    return @{ status = "incomplete"; error = "champs incomplets: $($missing -join ', ')" }
  }
  if (!(Test-ShareUrl $entry.share_url)) {
    return @{ status = "incomplete"; error = "share_url invalide ou absent" }
  }
  if (!(Test-TestedAt $entry.tested_at)) {
    return @{ status = "incomplete"; error = "tested_at invalide ou absent" }
  }
  $first30s = Test-First30sProof $entry
  if ($first30s.complete -ne $true) {
    return @{ status = "incomplete"; error = $first30s.error; first_30s_complete = $false; first_30s_source = $first30s.source; first_30s_summary = "" }
  }
  $profileHardwareError = Test-ProfileHardware $entry
  if (![string]::IsNullOrWhiteSpace($profileHardwareError)) {
    return @{ status = "incomplete"; error = "coherence materielle invalide: $profileHardwareError" }
  }
  $benchmarkPlausibilityError = Test-BenchmarkPlausible $entry
  if (![string]::IsNullOrWhiteSpace($benchmarkPlausibilityError)) {
    return @{ status = "incomplete"; error = $benchmarkPlausibilityError }
  }
  $enriched = Test-EnrichedEvidence $entry
  if (![string]::IsNullOrWhiteSpace([string]$enriched.error)) {
    return @{ status = "incomplete"; error = "preuve enrichie invalide: $($enriched.error)" }
  }
  return @{
    status = "ready"
    error = ""
    first_30s_complete = $true
    first_30s_source = $first30s.source
    first_30s_summary = $first30s.summary
    doctor = $enriched.doctor
    doctor_available = $enriched.doctor_available
    runtime = $enriched.runtime
    runtime_proven = $enriched.runtime_proven
    passport = $enriched.passport
    passport_available = $enriched.passport_available
  }
}

if ([string]::IsNullOrWhiteSpace($EntriesDir)) {
  $EntriesDir = Join-Path $PSScriptRoot "entries"
}
if ([string]::IsNullOrWhiteSpace($OutJson)) {
  $OutJson = Join-Path $PSScriptRoot "FIELD-ENTRIES-VALIDATION.json"
}
$OutMd = [System.IO.Path]::ChangeExtension($OutJson, ".md")
$OutHtml = [System.IO.Path]::ChangeExtension($OutJson, ".html")
# Default report name in the kit: FIELD-ENTRIES-VALIDATION.md
# Default HTML report name in the kit: FIELD-ENTRIES-VALIDATION.html
if (!(Test-Path -LiteralPath $EntriesDir)) {
  New-Item -ItemType Directory -Force -Path $EntriesDir | Out-Null
}

function Html($value) {
  return [System.Net.WebUtility]::HtmlEncode([string]$value)
}

$files = Get-ChildItem -LiteralPath $EntriesDir -Filter "*.json" -File -Recurse -ErrorAction SilentlyContinue |
  Sort-Object FullName
$byProfile = @{}
$unreadable = @()
$unexpected = @()
$duplicates = @()

foreach ($file in $files) {
  try {
    $payload = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    $entry = Get-Entry $payload
    if (!$entry) {
      $unreadable += [pscustomobject]@{ file = $file.FullName; error = "aucune fiche machine trouvee" }
      continue
    }
    if ($requiredProfiles -notcontains $entry.profile) {
      $unexpected += [pscustomobject]@{ file = $file.FullName; profile = [string]$entry.profile }
      continue
    }
    if ($byProfile.ContainsKey($entry.profile)) { $duplicates += [string]$entry.profile }
    $existing = $byProfile[$entry.profile]
    if (!$existing -or $file.LastWriteTimeUtc -ge $existing.mtime) {
      $byProfile[$entry.profile] = [pscustomobject]@{ entry = $entry; source_file = $file.FullName; mtime = $file.LastWriteTimeUtc }
    }
  } catch {
    $unreadable += [pscustomobject]@{ file = $file.FullName; error = $_.Exception.Message }
  }
}

$profiles = @()
foreach ($profile in $requiredProfiles) {
  if (!$byProfile.ContainsKey($profile)) {
    $profiles += [pscustomobject]@{
      profile = $profile
      status = "missing"
      source_file = ""
      recommended_model = ""
      benchmark_model = ""
      benchmark_tokens_per_second = 0
      first_30s_complete = $false
      first_30s_source = ""
      first_30s_summary = ""
      doctor = "-"
      doctor_available = $false
      runtime = "-"
      runtime_proven = $false
      passport = "-"
      passport_available = $false
      report = ""
      error = "fiche absente"
    }
    continue
  }
  $selected = $byProfile[$profile]
  $entry = $selected.entry
  $validation = Validate-Entry $entry
  $report = [string]$entry.share_url
  $profiles += [pscustomobject]@{
    profile = $profile
    status = $validation.status
    source_file = $selected.source_file
    recommended_model = [string]$entry.recommended_model
    benchmark_model = [string]$entry.benchmark_model
    benchmark_tokens_per_second = [double]($entry.benchmark_tokens_per_second | ForEach-Object { if ($_ -eq $null) { 0 } else { $_ } })
    first_30s_complete = [bool]$validation.first_30s_complete
    first_30s_source = [string]$validation.first_30s_source
    first_30s_summary = [string]$validation.first_30s_summary
    doctor = [string]$validation.doctor
    doctor_available = [bool]$validation.doctor_available
    runtime = [string]$validation.runtime
    runtime_proven = [bool]$validation.runtime_proven
    passport = [string]$validation.passport
    passport_available = [bool]$validation.passport_available
    build_id = [string]$entry.build_id
    app_version = [string]$entry.app_version
    report = $report
    error = [string]$validation.error
  }
}

$ready = @($profiles | Where-Object { $_.status -eq "ready" } | ForEach-Object { $_.profile })
$missing = @($profiles | Where-Object { $_.status -eq "missing" } | ForEach-Object { $_.profile })
$incomplete = @($profiles | Where-Object { $_.status -eq "incomplete" } | ForEach-Object { $_.profile })
$buildIds = @($profiles | Where-Object { $_.status -eq "ready" -and ![string]::IsNullOrWhiteSpace([string]$_.build_id) } | ForEach-Object { [string]$_.build_id } | Select-Object -Unique)
$appVersions = @($profiles | Where-Object { $_.status -eq "ready" -and ![string]::IsNullOrWhiteSpace([string]$_.app_version) } | ForEach-Object { [string]$_.app_version } | Select-Object -Unique)
$metadataMixed = $buildIds.Count -gt 1 -or $appVersions.Count -gt 1
$shareUrlGroups = @($profiles |
  Where-Object { $_.status -eq "ready" -and ![string]::IsNullOrWhiteSpace([string]$_.report) } |
  Group-Object { ([string]$_.report).Trim().ToLowerInvariant() } |
  Where-Object { $_.Count -gt 1 })
$duplicateShareUrls = @($shareUrlGroups | ForEach-Object { [string]$_.Name })
$tpsGroups = @($profiles |
  Where-Object { $_.status -eq "ready" -and [double]$_.benchmark_tokens_per_second -gt 0 } |
  Group-Object { ([math]::Round([double]$_.benchmark_tokens_per_second, 1)).ToString([System.Globalization.CultureInfo]::InvariantCulture) } |
  Where-Object { $_.Count -gt 1 })
$duplicateTps = @($tpsGroups | ForEach-Object { [string]$_.Name })
$doctorProfiles = @($profiles | Where-Object { $_.status -eq "ready" -and $_.doctor_available } | ForEach-Object { $_.profile })
$runtimeProofProfiles = @($profiles | Where-Object { $_.status -eq "ready" -and $_.runtime_proven } | ForEach-Object { $_.profile })
$passportProfiles = @($profiles | Where-Object { $_.status -eq "ready" -and $_.passport_available } | ForEach-Object { $_.profile })
$valid = $ready.Count -eq $requiredProfiles.Count -and $unreadable.Count -eq 0 -and $unexpected.Count -eq 0 -and !$metadataMixed -and $duplicateShareUrls.Count -eq 0 -and $duplicateTps.Count -eq 0
$next = ""
if ($missing.Count -gt 0) { $next = $missing[0] }
elseif ($incomplete.Count -gt 0) { $next = $incomplete[0] }
elseif ($metadataMixed -and $ready.Count -gt 0) { $next = $ready[0] }
elseif ($duplicateShareUrls.Count -gt 0 -and $ready.Count -gt 0) { $next = $ready[0] }
elseif ($duplicateTps.Count -gt 0 -and $ready.Count -gt 0) { $next = $ready[0] }

$reportObj = [pscustomobject]@{
  schema = "outilsia.local_cockpit_field_entries_validation.v1"
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  status = $(if ($valid) { "FIELD_ENTRIES_VALID" } else { "FIELD_ENTRIES_INCOMPLETE" })
  report_network_verified = $false
  note = "Validation locale Windows (schema + doublons + plausibilite). La preuve reseau des rapports /r/ (existence + coherence avec la fiche) est verifiee a l'assemblage networked (COLLECTER-ET-ASSEMBLER / VALIDER-GOAL). FIELD_ENTRIES_VALID ici ne ferme pas le goal terrain."
  entries_dir = $EntriesDir
  files_read = $files.Count
  profiles_required = $requiredProfiles
  profiles_ready = $ready
  profiles_missing = $missing
  profiles_incomplete = $incomplete
  build_ids = $buildIds
  app_versions = $appVersions
  metadata_mixed = $metadataMixed
  duplicate_share_urls = $duplicateShareUrls
  duplicate_benchmark_tokens_per_second = $duplicateTps
  enriched_evidence = [pscustomobject]@{
    blocking = $false
    hardware_doctor_v2_profiles = $doctorProfiles
    ollama_runtime_proof_profiles = $runtimeProofProfiles
    capability_passport_profiles = $passportProfiles
  }
  next_profile_to_fix = $next
  duplicates = @($duplicates | Select-Object -Unique)
  unreadable = $unreadable
  unexpected = $unexpected
  profiles = $profiles
}

$reportObj | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutJson -Encoding UTF8

$lines = @(
  "# Validation fiches terrain OutilsIA",
  "",
  "> Validation LOCALE Windows (schema + doublons + plausibilite). La preuve reseau",
  "> des rapports /r/ est verifiee a l'assemblage (COLLECTER-ET-ASSEMBLER / VALIDER-GOAL).",
  "> Un statut VALID ici ne ferme pas le goal terrain tant que les rapports ne sont pas verifies en reseau.",
  "",
  "- Statut: $($reportObj.status)",
  "- Preuve reseau des rapports: verifiee a l'assemblage (non ici)",
  "- Dossier: $EntriesDir",
  "- Fichiers lus: $($files.Count)",
  "- Profils valides: $($ready.Count)/$($requiredProfiles.Count)",
  "- Builds prets: $(if ($buildIds.Count -gt 0) { $buildIds -join ', ' } else { 'aucun' })",
  "- Versions app pretes: $(if ($appVersions.Count -gt 0) { $appVersions -join ', ' } else { 'aucune' })",
  "- Metadonnees melangees: $(if ($metadataMixed) { 'oui' } else { 'non' })",
  "- Rapports dupliques: $(if ($duplicateShareUrls.Count -gt 0) { $duplicateShareUrls -join ', ' } else { 'aucun' })",
  "- Tok/s dupliques: $(if ($duplicateTps.Count -gt 0) { $duplicateTps -join ', ' } else { 'aucun' })",
  "- Doctor 2.0 (facultatif): $($doctorProfiles.Count)/$($requiredProfiles.Count)",
  "- Preuve d'allocation Ollama (facultatif): $($runtimeProofProfiles.Count)/$($requiredProfiles.Count)",
  "- Passport genere (facultatif): $($passportProfiles.Count)/$($requiredProfiles.Count)",
  "- Prochain profil à corriger: $(if ($next) { $next } else { 'aucun' })",
  "",
  "| Profil | Statut | UX 30s | Build | App | Fichier | Modele | Benchmark | Doctor | Runtime | Passport | Rapport | Erreur |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
)
foreach ($row in $profiles) {
  $fileName = if ($row.source_file) { Split-Path $row.source_file -Leaf } else { "-" }
  $bench = if ($row.benchmark_tokens_per_second -gt 0) { "$($row.benchmark_model) - $($row.benchmark_tokens_per_second) tok/s" } else { "-" }
  $ux = if ($row.first_30s_complete) { $row.first_30s_source } else { "-" }
  $model = if ($row.recommended_model) { $row.recommended_model } else { "-" }
  $build = if ($row.build_id) { $row.build_id } else { "-" }
  $app = if ($row.app_version) { $row.app_version } else { "-" }
  $rep = if ($row.report) { $row.report } else { "-" }
  $err = if ($row.error) { $row.error } else { "-" }
  $lines += "| $($row.profile) | $($row.status) | $ux | $build | $app | $fileName | $model | $bench | $($row.doctor) | $($row.runtime) | $($row.passport) | $rep | $err |"
}
$lines += ""
$lines | Set-Content -LiteralPath $OutMd -Encoding UTF8

$htmlRows = @()
foreach ($row in $profiles) {
  $fileName = if ($row.source_file) { Split-Path $row.source_file -Leaf } else { "-" }
  $bench = if ($row.benchmark_tokens_per_second -gt 0) { "$($row.benchmark_model) - $($row.benchmark_tokens_per_second) tok/s" } else { "-" }
  $ux = if ($row.first_30s_complete) { "$(if ($row.first_30s_source -eq 'explicit') { 'explicite' } else { 'deduite' })<span>$(Html $row.first_30s_summary)</span>" } else { "-<span></span>" }
  $model = if ($row.recommended_model) { $row.recommended_model } else { "-" }
  $build = if ($row.build_id) { $row.build_id } else { "-" }
  $app = if ($row.app_version) { $row.app_version } else { "-" }
  $rep = if ($row.report) { "<a href='$(Html $row.report)'>$(Html $row.report)</a>" } else { "-" }
  $err = if ($row.error) { $row.error } else { "-" }
  $proof = if ($row.status -eq "ready") { "preuve complete" } elseif ($row.status -eq "missing") { "fiche absente" } else { "a corriger" }
  $htmlRows += "<tr class='$(Html $row.status)'><td><strong>$(Html $row.profile)</strong><span>$(Html $proof)</span></td><td>$(Html $row.status)</td><td>$ux</td><td>$(Html $build)</td><td>$(Html $app)</td><td>$(Html $fileName)</td><td>$(Html $model)</td><td>$(Html $bench)</td><td>$(Html $row.doctor)</td><td>$(Html $row.runtime)</td><td>$(Html $row.passport)</td><td>$rep</td><td>$(Html $err)</td></tr>"
}
$unreadableHtml = @()
if ($unreadable.Count -gt 0) {
  foreach ($item in $unreadable) { $unreadableHtml += "<li><code>$(Html $item.file)</code> $(Html $item.error)</li>" }
} else {
  $unreadableHtml += "<li>Aucun fichier illisible.</li>"
}
$nextLabel = if ($next) { $next } else { "aucun" }
$htmlRowsText = $htmlRows -join [Environment]::NewLine
$unreadableHtmlText = $unreadableHtml -join [Environment]::NewLine
$html = @"
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Validation fiches terrain OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#607086;--line:#dbe4ef;--green:#137044;--amber:#9d5a00;--red:#b42318;--blue:#12335e}
    *{box-sizing:border-box}
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#edf2f8;color:var(--ink);line-height:1.45}
    main{width:min(1180px,calc(100% - 28px));margin:28px auto}
    header,section{background:#fff;border:1px solid var(--line);border-radius:14px;padding:22px;margin-bottom:14px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    header{background:var(--blue);color:#fff}
    h1{margin:0 0 8px;font-size:30px}
    h2{margin:0 0 10px;font-size:20px}
    .cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0}
    .card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px}
    .card strong{display:block;font-size:28px}
    table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
    th,td{text-align:left;padding:12px;border-bottom:1px solid var(--line);vertical-align:top}
    th{background:#f5f8fc;color:#475569;font-size:13px;text-transform:uppercase}
    td span{display:block;color:var(--muted);font-size:12px;margin-top:2px}
    tr.ready td:first-child{border-left:5px solid var(--green)}
    tr.missing td:first-child{border-left:5px solid var(--amber)}
    tr.incomplete td:first-child{border-left:5px solid var(--red)}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}
    a{color:#185abc}
    li{margin:7px 0}
    @media(max-width:900px){.cards{grid-template-columns:1fr}table{display:block;overflow-x:auto}header,section{padding:18px}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Validation fiches terrain OutilsIA</h1>
    <p>Controle intermediaire avant assemblage final. Une fiche prete doit prouver scan, UX 30 secondes, modele conseille, benchmark, PromptForge, dialogue, Arena et rapport partage.</p>
  </header>
  <div class="cards">
    <div class="card"><strong>$(Html $reportObj.status)</strong><span>statut</span></div>
    <div class="card"><strong>$($ready.Count)/$($requiredProfiles.Count)</strong><span>profils prets</span></div>
    <div class="card"><strong>$(Html $nextLabel)</strong><span>prochain profil</span></div>
    <div class="card"><strong>$(if ($metadataMixed) { "oui" } else { "non" })</strong><span>metadonnees melangees</span></div>
  </div>
  <section>
    <h2>Fiches par profil</h2>
    <table>
      <thead><tr><th>Profil</th><th>Statut</th><th>UX 30s</th><th>Build</th><th>App</th><th>Fichier</th><th>Modele</th><th>Benchmark</th><th>Doctor</th><th>Runtime</th><th>Passport</th><th>Rapport</th><th>Erreur</th></tr></thead>
      <tbody>$htmlRowsText</tbody>
    </table>
  </section>
  <section>
    <h2>Preuves minimales attendues</h2>
    <ul>
      <li>Scan materiel detecte et coherent avec le profil terrain.</li>
      <li>UX 30 secondes : materiel visible, score visible, modele conseille, benchmark ou bouton de benchmark, upgrade utile.</li>
      <li>Benchmark local avec tokens/s superieur a 0.</li>
      <li>PromptForge, dialogue local, Arena locale et rapport avec statut OK.</li>
      <li>URL partagee OutilsIA au format <code>https://outilsia.fr/r/...</code>.</li>
      <li>Meme <code>build_id</code> et meme <code>app_version</code> sur les 5 profils.</li>
      <li>Enrichissement facultatif : Doctor 2.0, allocation Ollama et digest du Passport. Leur absence ne bloque pas une fiche.</li>
    </ul>
  </section>
  <section>
    <h2>Fichiers illisibles</h2>
    <ul>$unreadableHtmlText</ul>
  </section>
</main>
</body>
</html>
"@
$html | Set-Content -LiteralPath $OutHtml -Encoding UTF8

Write-Host "field_entries_validation $($reportObj.status) ready=$($ready.Count)/$($requiredProfiles.Count) next=$(if ($next) { $next } else { 'none' })"
if (!$valid) { exit 1 }
exit 0
`, "utf8");

  writeFileSync(join(kitDir, "STATUT-WINDOWS.ps1"), String.raw`param(
  [string]$EntriesDir = "",
  [string]$OutJson = ""
)

$ErrorActionPreference = "Stop"
$requiredProfiles = @("old_laptop", "core_i7_gtx_1080_ti", "rtx_3060_12gb", "rtx_4080_4090", "cpu_only")
$labels = @{
  old_laptop = "Vieux laptop / portable modeste"
  core_i7_gtx_1080_ti = "Core i7 + GTX 1080 Ti 11 Go"
  rtx_3060_12gb = "RTX 3060 12 Go"
  rtx_4080_4090 = "RTX 4080 / RTX 4090"
  cpu_only = "Machine CPU-only"
}

function Html($value) {
  return [System.Net.WebUtility]::HtmlEncode([string]$value)
}

if ([string]::IsNullOrWhiteSpace($EntriesDir)) {
  $EntriesDir = Join-Path $PSScriptRoot "entries"
}
if ([string]::IsNullOrWhiteSpace($OutJson)) {
  $OutJson = Join-Path $PSScriptRoot "FIELD-TESTS-STATUS.json"
}
New-Item -ItemType Directory -Force -Path $EntriesDir | Out-Null

$validationJson = Join-Path $PSScriptRoot "FIELD-ENTRIES-VALIDATION.json"
$validationMd = Join-Path $PSScriptRoot "FIELD-ENTRIES-VALIDATION.md"
try {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "VALIDER-FICHES-WINDOWS.ps1") -EntriesDir $EntriesDir -OutJson $validationJson | Out-Host
} catch {
  # Le validateur sort en erreur quand la campagne est incomplete; c'est attendu pendant la collecte.
}
if (!(Test-Path -LiteralPath $validationJson)) {
  throw "rapport de validation introuvable: $validationJson"
}

$validation = Get-Content -LiteralPath $validationJson -Raw -Encoding UTF8 | ConvertFrom-Json
$profiles = @()
foreach ($profile in $requiredProfiles) {
  $row = @($validation.profiles | Where-Object { $_.profile -eq $profile } | Select-Object -First 1)
  if (!$row) {
    $profiles += [pscustomobject]@{
      profile = $profile
      status = "missing"
      source_file = ""
      machine_label = ""
      score = 0
      recommended_model = ""
      benchmark = ""
      build_id = ""
      app_version = ""
      doctor = "-"
      doctor_available = $false
      runtime = "-"
      runtime_proven = $false
      passport = "-"
      passport_available = $false
      share_url = ""
      missing_fields = @("fiche absente")
    }
    continue
  }
  $missingFields = @()
  if ($row.status -eq "missing") { $missingFields += "fiche absente" }
  elseif ($row.status -eq "incomplete" -and $row.error) { $missingFields += $row.error }
  elseif ($row.status -ne "ready" -and $row.error) { $missingFields += $row.error }
  $bench = ""
  if ([double]$row.benchmark_tokens_per_second -gt 0) {
    $bench = "$($row.benchmark_model) - $($row.benchmark_tokens_per_second) tok/s"
  }
  $profiles += [pscustomobject]@{
    profile = $profile
    status = [string]$row.status
    source_file = [string]$row.source_file
    machine_label = ""
    score = 0
    recommended_model = [string]$row.recommended_model
    benchmark = $bench
    build_id = [string]$row.build_id
    app_version = [string]$row.app_version
    doctor = [string]$row.doctor
    doctor_available = [bool]$row.doctor_available
    runtime = [string]$row.runtime
    runtime_proven = [bool]$row.runtime_proven
    passport = [string]$row.passport
    passport_available = [bool]$row.passport_available
    share_url = $(if ($row.report -and $row.report -ne "local") { [string]$row.report } else { "" })
    missing_fields = $missingFields
  }
}

$ready = @($profiles | Where-Object { $_.status -eq "ready" } | ForEach-Object { $_.profile })
$missing = @($profiles | Where-Object { $_.status -eq "missing" } | ForEach-Object { $_.profile })
$incomplete = @($profiles | Where-Object { $_.status -eq "incomplete" } | ForEach-Object { $_.profile })
$buildIds = @($validation.build_ids)
$appVersions = @($validation.app_versions)
$metadataMixed = [bool]$validation.metadata_mixed
$doctorProfiles = @($profiles | Where-Object { $_.status -eq "ready" -and $_.doctor_available } | ForEach-Object { $_.profile })
$runtimeProofProfiles = @($profiles | Where-Object { $_.status -eq "ready" -and $_.runtime_proven } | ForEach-Object { $_.profile })
$passportProfiles = @($profiles | Where-Object { $_.status -eq "ready" -and $_.passport_available } | ForEach-Object { $_.profile })
$next = ""
if ($missing.Count -gt 0) { $next = $missing[0] }
elseif ($incomplete.Count -gt 0) { $next = $incomplete[0] }
elseif ($metadataMixed -and $ready.Count -gt 0) { $next = $ready[0] }

$status = [pscustomobject]@{
  schema = "outilsia.local_cockpit_field_status.v1"
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  status = $(if ($ready.Count -eq $requiredProfiles.Count -and !$metadataMixed) { "FIELD_TESTS_READY" } else { "FIELD_TESTS_INCOMPLETE" })
  entries_dir = $EntriesDir
  files_read = [int]$validation.files_read
  profiles_required = $requiredProfiles
  profiles_ready = $ready
  profiles_missing = $missing
  profiles_incomplete = $incomplete
  build_ids = $buildIds
  app_versions = $appVersions
  metadata_mixed = $metadataMixed
  enriched_evidence = [pscustomobject]@{
    blocking = $false
    hardware_doctor_v2_profiles = $doctorProfiles
    ollama_runtime_proof_profiles = $runtimeProofProfiles
    capability_passport_profiles = $passportProfiles
  }
  next_profile_to_test = $next
  duplicates = @($validation.duplicates)
  unreadable = @($validation.unreadable)
  profiles = $profiles
}
$status | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutJson -Encoding UTF8

$outMd = [System.IO.Path]::ChangeExtension($OutJson, ".md")
$md = @(
  "# Statut fiches terrain OutilsIA",
  "",
  "- Statut: $($status.status)",
  "- Dossier: $EntriesDir",
  "- Fichiers lus: $($status.files_read)",
  "- Profils prets: $($ready.Count)/$($requiredProfiles.Count)",
  "- Builds prets: $(if ($buildIds.Count -gt 0) { $buildIds -join ', ' } else { 'aucun' })",
  "- Versions app pretes: $(if ($appVersions.Count -gt 0) { $appVersions -join ', ' } else { 'aucune' })",
  "- Metadonnees melangees: $(if ($metadataMixed) { 'oui' } else { 'non' })",
  "- Doctor 2.0 (facultatif): $($doctorProfiles.Count)/$($requiredProfiles.Count)",
  "- Preuve d'allocation Ollama (facultatif): $($runtimeProofProfiles.Count)/$($requiredProfiles.Count)",
  "- Passport genere (facultatif): $($passportProfiles.Count)/$($requiredProfiles.Count)",
  "- Prochain profil a tester: $(if ($next) { $next } else { 'aucun' })",
  "",
  "| Profil | Statut | Build | App | Modele | Benchmark | Doctor | Runtime | Passport | Rapport | Manques |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
)
foreach ($row in $profiles) {
  $model = if ($row.recommended_model) { $row.recommended_model } else { "-" }
  $bench = if ($row.benchmark) { $row.benchmark } else { "-" }
  $build = if ($row.build_id) { $row.build_id } else { "-" }
  $app = if ($row.app_version) { $row.app_version } else { "-" }
  $report = if ($row.share_url) { $row.share_url } else { "-" }
  $miss = if ($row.missing_fields.Count) { ($row.missing_fields -join ", ") } else { "-" }
  $md += "| $($row.profile) | $($row.status) | $build | $app | $model | $bench | $($row.doctor) | $($row.runtime) | $($row.passport) | $report | $miss |"
}
$md += ""
$md | Set-Content -LiteralPath $outMd -Encoding UTF8

$progressPercent = if ($requiredProfiles.Count -gt 0) { [math]::Round(($ready.Count / $requiredProfiles.Count) * 100, 1) } else { 0 }
$progressStatus = if ($ready.Count -eq $requiredProfiles.Count) { "FIELD_READY" } else { "FIELD_IN_PROGRESS" }
$progressObj = [pscustomobject]@{
  schema = "outilsia.local_cockpit_field_progress.v1"
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  status = $progressStatus
  percent = $progressPercent
  ready = $ready.Count
  required = $requiredProfiles.Count
  next_profile = $next
  ready_profiles = $ready
  missing_profiles = $missing
  incomplete_profiles = $incomplete
  build_ids = $buildIds
  app_versions = $appVersions
  metadata_mixed = $metadataMixed
  profiles = $profiles
}
$progressObj | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $PSScriptRoot "FIELD-PROGRESS.json") -Encoding UTF8

$progressMd = @(
  "# Progression terrain OutilsIA",
  "",
  "- Statut: $progressStatus",
  "- Progression: $progressPercent%",
  "- Profils prets: $($ready.Count)/$($requiredProfiles.Count)",
  "- Prochain profil: $(if ($next) { $next } else { 'aucun' })",
  "",
  "## Profils",
  "",
  "| Profil | Statut | Build | App | Modele | Benchmark | Rapport |",
  "| --- | --- | --- | --- | --- | --- | --- |"
)
foreach ($row in $profiles) {
  $model = if ($row.recommended_model) { $row.recommended_model } else { "-" }
  $bench = if ($row.benchmark) { $row.benchmark } else { "-" }
  $build = if ($row.build_id) { $row.build_id } else { "-" }
  $app = if ($row.app_version) { $row.app_version } else { "-" }
  $report = if ($row.share_url) { $row.share_url } else { "-" }
  $progressMd += "| $($row.profile) | $($row.status) | $build | $app | $model | $bench | $report |"
}
$progressMd += ""
$progressMd += "## Prochaine action"
$progressMd += ""
if ($next) {
  $progressMd += "- Tester le profil '$next' sur une vraie machine physique."
  $progressMd += "- Exporter 'outilsia-field-test-$next.json', puis lancer 'VALIDER-DERNIERE-FICHE.cmd'."
} else {
  $progressMd += "- Assembler 'FIELD-TESTS.json', importer, puis lancer 'VALIDER-GOAL.cmd'."
}
$progressMd | Set-Content -LiteralPath (Join-Path $PSScriptRoot "FIELD-PROGRESS.md") -Encoding UTF8

$nextTitle = if ($next) { $labels[$next] } else { "Les 5 profils sont prets" }
$centerRows = ($profiles | ForEach-Object {
  $miss = if ($_.missing_fields.Count) { $_.missing_fields -join ", " } else { "-" }
  "<tr class=""$($_.status)""><td><code>$(Html $_.profile)</code><span>$(Html $labels[$_.profile])</span></td><td><strong>$(Html $_.status)</strong></td><td><code>$(Html $_.build_id)</code><span>$(Html $_.app_version)</span></td><td>$(Html $_.recommended_model)</td><td>$(Html $_.benchmark)</td><td>$(Html $_.doctor)</td><td>$(Html $_.runtime)</td><td>$(Html $_.passport)</td><td>$(Html $miss)</td></tr>"
}) -join ([Environment]::NewLine)

$centerHtml = @"
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Centre terrain OutilsIA</title>
  <style>
    :root { --ink:#172033; --muted:#607086; --line:#dbe4ef; --panel:#fff; --soft:#f5f8fc; --green:#167447; --orange:#a15c00; --red:#b42318; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI,Arial,sans-serif; color:var(--ink); background:#edf2f8; line-height:1.45; }
    main { width:min(1080px, calc(100% - 28px)); margin:28px auto; }
    header { background:#12335e; color:white; border-radius:14px; padding:30px 34px; box-shadow:0 16px 46px rgba(28,43,68,.12); }
    h1 { margin:0; font-size:32px; letter-spacing:0; }
    section { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:24px; margin-top:16px; box-shadow:0 12px 34px rgba(28,43,68,.08); }
    .grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:12px; }
    .card { background:var(--soft); border:1px solid var(--line); border-radius:12px; padding:16px; }
    .card strong { display:block; font-size:22px; margin-bottom:4px; }
    .warn { color:var(--orange); } .ok { color:var(--green); }
    table { width:100%; border-collapse:collapse; border:1px solid var(--line); }
    th,td { text-align:left; vertical-align:top; padding:10px 12px; border-bottom:1px solid var(--line); }
    th { background:var(--soft); font-size:12px; color:var(--muted); text-transform:uppercase; }
    td span { display:block; color:var(--muted); font-size:13px; margin-top:3px; }
    tr.ready strong { color:var(--green); } tr.incomplete strong { color:var(--orange); } tr.missing strong { color:var(--red); }
    code { font-family:Consolas,monospace; background:#edf2f8; border:1px solid #d7e0ea; border-radius:6px; padding:2px 5px; }
    li { margin:7px 0; }
    @media (max-width:850px) { .grid{grid-template-columns:1fr;} header,section{padding:22px;} }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Centre terrain OutilsIA</h1>
    <p>Statut genere en Windows natif par <code>STATUT-WINDOWS.ps1</code>, sans WSL ni npm.</p>
  </header>
  <section>
    <div class="grid">
      <div class="card"><strong>$($ready.Count)/$($requiredProfiles.Count)</strong><span>profils prets</span></div>
      <div class="card"><strong>$(Html $nextTitle)</strong><span>prochain PC physique</span></div>
      <div class="card"><strong>$($status.files_read)</strong><span>fichier(s) lu(s)</span></div>
    </div>
  </section>
  <section>
    <h2>Action maintenant</h2>
    <ol>
      <li>Tester le profil indique : <strong>$(Html $nextTitle)</strong>.</li>
      <li>Dans l'app, cliquer <strong>Analyser ce PC</strong>.</li>
      <li>Obtenir scan, benchmark, PromptForge, dialogue, Arena et rapport.</li>
      <li>Optionnel : generer l'AI Capability Passport avant l'export.</li>
      <li>Exporter la fiche dans <strong>Details &gt; Test terrain</strong> avec le bon profil manuel.</li>
      <li>Lancer <code>VALIDER-DERNIERE-FICHE.cmd</code>, puis <code>STATUT.cmd</code>.</li>
    </ol>
  </section>
  <section>
    <h2>Raccourcis utiles</h2>
    <ul>
      <li><code>OUVRIR-TEST-EXPRESS.cmd</code> : ouvrir la checklist courte du prochain PC terrain.</li>
      <li><code>VALIDER-DERNIERE-FICHE.cmd</code> : verifier la derniere fiche telechargee avant de quitter le PC.</li>
      <li><code>EXPORTER-FICHES.cmd</code> : creer un zip transferables des fiches presentes.</li>
      <li><code>IMPORTER-PACK-FICHES.cmd</code> : importer un pack de fiches sur la machine principale.</li>
      <li><code>VALIDER-GOAL.cmd</code> : a lancer seulement quand les 5 profils sont reellement collectes.</li>
    </ul>
  </section>
  <section>
    <h2>Profils</h2>
    <table><thead><tr><th>Profil</th><th>Statut</th><th>Build</th><th>Modele</th><th>Benchmark</th><th>Doctor</th><th>Runtime</th><th>Passport</th><th>Manques</th></tr></thead><tbody>
$centerRows
    </tbody></table>
  </section>
</main>
</body>
</html>
"@
$centerHtml | Set-Content -LiteralPath (Join-Path $PSScriptRoot "CENTRE-TERRAIN.html") -Encoding UTF8

$progressCards = ($profiles | ForEach-Object {
  $label = $labels[$_.profile]
  $statusClass = $_.status
  $detail = if ($_.status -eq "ready") { "Fiche prete" } elseif ($_.status -eq "incomplete") { "A corriger" } else { "A tester" }
  "<article class=""profile $statusClass""><strong>$(Html $_.profile)</strong><span>$(Html $label)</span><em>$(Html $detail)</em></article>"
}) -join ([Environment]::NewLine)
$progressHtml = @"
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Progression terrain OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#607086;--line:#dbe4ef;--soft:#f5f8fc;--green:#167447;--orange:#a15c00;--red:#b42318;--blue:#185abc}
    *{box-sizing:border-box}
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:var(--ink);background:#edf2f8;line-height:1.45}
    main{width:min(980px,calc(100% - 28px));margin:28px auto}
    header{background:#12335e;color:white;border-radius:14px;padding:30px 34px;box-shadow:0 16px 46px rgba(28,43,68,.12)}
    h1{margin:0;font-size:32px;letter-spacing:0}
    section{background:white;border:1px solid var(--line);border-radius:14px;padding:24px;margin-top:16px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    .meter{height:18px;background:#dce7f3;border-radius:999px;overflow:hidden;border:1px solid #cbd8e6}
    .bar{height:100%;width:$progressPercent%;background:linear-gradient(90deg,#185abc,#167447)}
    .score{font-size:42px;font-weight:900;margin:12px 0 4px}
    .grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
    .profile{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:14px;min-height:120px}
    .profile strong{display:block;font-size:14px}.profile span{display:block;color:var(--muted);font-size:13px;margin-top:5px}.profile em{display:inline-block;margin-top:10px;font-style:normal;font-weight:800}
    .profile.ready em{color:var(--green)}.profile.incomplete em{color:var(--orange)}.profile.missing em{color:var(--red)}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}
    li{margin:7px 0}
    @media(max-width:850px){.grid{grid-template-columns:1fr 1fr}header,section{padding:22px}.score{font-size:34px}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Progression terrain OutilsIA</h1>
    <p>Statut des 5 machines physiques requises pour valider le goal terrain.</p>
  </header>
  <section>
    <div class="score">$progressPercent%</div>
    <div class="meter"><div class="bar"></div></div>
    <p><strong>$($ready.Count)/$($requiredProfiles.Count)</strong> profils prets. Prochain profil : <code>$(Html $(if ($next) { $next } else { 'aucun' }))</code>.</p>
  </section>
  <section>
    <h2>Profils physiques</h2>
    <div class="grid">
$progressCards
    </div>
  </section>
  <section>
    <h2>Prochaine action</h2>
    <ol>
      $(if ($next) { "<li>Tester une vraie machine pour le profil <code>$(Html $next)</code>.</li><li>Exporter <code>outilsia-field-test-$(Html $next).json</code>.</li><li>Lancer <code>VALIDER-DERNIERE-FICHE.cmd</code> puis <code>STATUT.cmd</code>.</li>" } else { "<li>Lancer <code>ASSEMBLER.cmd</code>, <code>IMPORTER.cmd</code>, puis <code>VALIDER-GOAL.cmd</code>.</li>" })
    </ol>
  </section>
</main>
</body>
</html>
"@
$progressHtml | Set-Content -LiteralPath (Join-Path $PSScriptRoot "FIELD-PROGRESS.html") -Encoding UTF8

$nextMissing = @()
$nextRow = @($profiles | Where-Object { $_.profile -eq $next } | Select-Object -First 1)
if ($nextRow) { $nextMissing = @($nextRow.missing_fields) }
$nextHtml = @"
<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Prochain PC terrain OutilsIA</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#edf2f8;color:#172033;line-height:1.45}main{width:min(820px,calc(100% - 28px));margin:26px auto;background:white;border:1px solid #d9e2ee;border-radius:14px;overflow:hidden;box-shadow:0 16px 46px rgba(28,43,68,.12)}header{padding:28px 32px;background:#12335e;color:white}section{padding:24px 32px;border-top:1px solid #d9e2ee}.hero{background:#fff8e7}.next{font-size:28px;font-weight:850}code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}li{margin:7px 0}</style></head>
<body><main><header><h1>Prochain test terrain</h1><p>Fiche generee en Windows natif, sans WSL.</p></header>
<section class="hero"><div>A tester maintenant</div><div class="next">$(Html $nextTitle)</div><p><code>$(Html $(if ($next) { $next } else { 'FIELD_TESTS_READY' }))</code></p></section>
<section><h2>Preuves a obtenir sur ce PC</h2><ol><li>Materiel reconnu, score, modele conseille, upgrade utile.</li><li>Benchmark reel avec tokens/s.</li><li>PromptForge, dialogue local et Arena locale.</li><li>Rapport genere ou partage.</li></ol></section>
<section><h2>Fichier attendu</h2><p><code>$(Html $(if ($next) { "outilsia-field-test-$next.json" } else { "FIELD-TESTS.json" }))</code></p></section>
<section><h2>Manques actuels</h2><ul>$(if ($nextMissing.Count) { ($nextMissing | ForEach-Object { "<li><code>$(Html $_)</code></li>" }) -join "" } else { "<li>Aucun manque.</li>" })</ul></section>
</main></body></html>
"@
$nextHtml | Set-Content -LiteralPath (Join-Path $PSScriptRoot "PROCHAIN-PC.html") -Encoding UTF8

$expressSteps = if ($next) {
  @(
    "<li>Sur ce PC, ouvrir ou installer le build inclus dans le kit.</li>",
    "<li>Dans OutilsIA, cliquer <strong>Analyser ce PC</strong>.</li>",
    "<li>Verifier que le materiel est visible : CPU, GPU/VRAM ou CPU-only, RAM, OS et Ollama.</li>",
    "<li>Lancer le benchmark leger propose et obtenir des tokens/s superieurs a 0.</li>",
    "<li>Optimiser le prompt avec PromptForge ou noter pourquoi ce n'est pas pertinent.</li>",
    "<li>Poser une question locale au modele conseille par OutilsIA.</li>",
    "<li>Verifier Arena locale, rapport machine et upgrade utile.</li>",
    "<li>Telecharger <code>outilsia-field-test-$(Html $next).json</code>, puis lancer <code>VALIDER-DERNIERE-FICHE.cmd</code>.</li>"
  ) -join ([Environment]::NewLine)
} else {
  "<li>Les 5 profils sont prets : lancer <code>VALIDER-GOAL.cmd</code> sur la machine principale.</li>"
}
$expressHtml = @"
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Test express prochain PC OutilsIA</title>
  <style>
    :root{--ink:#172033;--muted:#607086;--line:#dbe4ef;--soft:#f5f8fc;--blue:#12335e;--green:#167447;--amber:#9a5a00;--red:#b42318}
    *{box-sizing:border-box}
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;color:var(--ink);background:#edf2f8;line-height:1.45}
    main{width:min(920px,calc(100% - 28px));margin:28px auto}
    header{background:var(--blue);color:white;border-radius:14px;padding:30px 34px;box-shadow:0 16px 46px rgba(28,43,68,.12)}
    h1{margin:0;font-size:32px;letter-spacing:0}
    section{background:white;border:1px solid var(--line);border-radius:14px;padding:24px;margin-top:16px;box-shadow:0 12px 34px rgba(28,43,68,.08)}
    .hero{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}
    .card{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:16px}
    .card strong{display:block;font-size:22px;margin-bottom:4px}
    .rule{border-color:#f3c969;background:#fff8e7}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}
    li{margin:8px 0}
    .ok{color:var(--green);font-weight:900}.warn{color:var(--amber);font-weight:900}.danger{color:var(--red);font-weight:900}
    @media(max-width:780px){.hero{grid-template-columns:1fr}header,section{padding:22px}h1{font-size:28px}}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Test express prochain PC</h1>
    <p>Page courte pour transformer le prochain profil terrain en fiche valide avant de quitter la machine.</p>
  </header>
  <section class="hero">
    <div class="card">
      <span>A tester maintenant</span>
      <strong>$(Html $nextTitle)</strong>
      <p><code>$(Html $(if ($next) { $next } else { 'FIELD_TESTS_READY' }))</code></p>
    </div>
    <div class="card rule">
      <span class="danger">Regle bloquante</span>
      <p>Sans fichier <code>$(Html $(if ($next) { "outilsia-field-test-$next.json" } else { "FIELD-TESTS.json" }))</code> valide, le PC ne compte pas. Le PDF et les captures ne remplacent pas la fiche JSON.</p>
    </div>
  </section>
  <section>
    <h2>8 gestes terrain</h2>
    <ol>
$expressSteps
    </ol>
  </section>
  <section>
    <h2>Validation avant de partir</h2>
    <ol>
      <li>Lancer <code>VALIDER-DERNIERE-FICHE.cmd</code>.</li>
      <li>Relancer <code>STATUT.cmd</code>.</li>
      <li>Verifier que <code>FIELD-TESTS-STATUS.json</code> marque le profil comme <strong>ready</strong>.</li>
    </ol>
  </section>
</main>
</body>
</html>
"@
$expressHtml | Set-Content -LiteralPath (Join-Path $PSScriptRoot "TEST-EXPRESS-PROCHAIN-PC.html") -Encoding UTF8

Write-Host "field_status_windows $($status.status) ready=$($ready.Count)/$($requiredProfiles.Count) next=$(if ($next) { $next } else { 'none' })"
if ($status.status -ne "FIELD_TESTS_READY") { exit 1 }
exit 0
`, "utf8");

  writeFileSync(join(kitDir, "EXPORTER-FICHES.cmd"), [
    "@echo off",
    "setlocal",
    "set \"KIT_DIR=%~dp0\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%KIT_DIR%EXPORTER-FICHES-WINDOWS.ps1\" -EntriesDir \"%KIT_DIR%entries\"",
    "echo.",
    "echo Si le zip est cree, transfere-le vers la machine principale puis decompresse son dossier entries dans le kit principal.",
    "pause",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "EXPORTER-FICHES-WINDOWS.ps1"), String.raw`param(
  [string]$EntriesDir = "",
  [string]$OutZip = ""
)

$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Host "field_entries_export_invalid $message" -ForegroundColor Red
  exit 1
}

if ([string]::IsNullOrWhiteSpace($EntriesDir)) {
  $EntriesDir = Join-Path $PSScriptRoot "entries"
}
if (!(Test-Path -LiteralPath $EntriesDir)) {
  New-Item -ItemType Directory -Force -Path $EntriesDir | Out-Null
}

$entryFiles = @(Get-ChildItem -LiteralPath $EntriesDir -Filter "*.json" -File -Recurse -ErrorAction SilentlyContinue)
if ($entryFiles.Count -eq 0) {
  Fail "aucune fiche JSON dans $EntriesDir"
}

$validationJson = Join-Path $PSScriptRoot "FIELD-ENTRIES-VALIDATION.json"
$validator = Join-Path $PSScriptRoot "VALIDER-FICHES-WINDOWS.ps1"
if (Test-Path -LiteralPath $validator) {
  powershell -NoProfile -ExecutionPolicy Bypass -File $validator -EntriesDir $EntriesDir -OutJson $validationJson
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Validation incomplete: export autorise pour transfert partiel." -ForegroundColor Yellow
  }
}

if ([string]::IsNullOrWhiteSpace($OutZip)) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutZip = Join-Path $PSScriptRoot "outilsia-field-entries-transfer-$stamp.zip"
}

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("outilsia-field-export-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $temp | Out-Null
try {
  $targetEntries = Join-Path $temp "entries"
  New-Item -ItemType Directory -Force -Path $targetEntries | Out-Null
  Copy-Item -Path (Join-Path $EntriesDir "*") -Destination $targetEntries -Recurse -Force

  foreach ($name in @(
    "FIELD-ENTRIES-VALIDATION.json",
    "FIELD-ENTRIES-VALIDATION.md",
    "FIELD-TESTS-STATUS.json",
    "FIELD-TESTS-STATUS.md",
    "LAST-FIELD-ENTRY.txt"
  )) {
    $source = Join-Path $PSScriptRoot $name
    if (Test-Path -LiteralPath $source) {
      Copy-Item -LiteralPath $source -Destination (Join-Path $temp $name) -Force
    }
  }

  $manifest = @(
    "schema=outilsia.local_cockpit_field_entries_transfer.v1",
    "created_at=$((Get-Date).ToUniversalTime().ToString('o'))",
    "computer=$env:COMPUTERNAME",
    "entries_dir=$EntriesDir",
    "entry_files=$($entryFiles.Count)",
    "validation_json=$validationJson"
  )
  $manifest | Set-Content -LiteralPath (Join-Path $temp "FIELD-ENTRIES-TRANSFER-MANIFEST.txt") -Encoding ASCII

  if (Test-Path -LiteralPath $OutZip) { Remove-Item -LiteralPath $OutZip -Force }
  Compress-Archive -Path (Join-Path $temp "*") -DestinationPath $OutZip -Force
  Write-Host "field_entries_transfer_zip $OutZip" -ForegroundColor Green
exit 0
} finally {
  if (Test-Path -LiteralPath $temp) {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
  }
}
`, "utf8");

  writeFileSync(join(kitDir, "PREPARER-KIT-USB.cmd"), [
    "@echo off",
    "setlocal",
    "set \"KIT_DIR=%~dp0\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%KIT_DIR%PREPARER-KIT-USB-WINDOWS.ps1\" %*",
    "echo.",
    "echo Si la copie est OK, utilise le dossier cree sur la cle USB ou le support choisi pour tester les autres PC.",
    "pause",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "PREPARER-KIT-USB-WINDOWS.ps1"), String.raw`param(
  [string]$Destination = ""
)

$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Host "field_usb_export_invalid $message" -ForegroundColor Red
  exit 1
}

function Sha256($path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
}

function WslPathToWindows($path) {
  if ($path -match '^/mnt/([a-zA-Z])/(.*)$') {
    $drive = $matches[1].ToUpperInvariant()
    $tail = $matches[2] -replace '/', '\'
    return ($drive + ':\' + $tail)
  }
  return $path
}

$kitDir = $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$manifestPath = Join-Path $kitDir "FIELD-KIT-MANIFEST.txt"
$proofPath = Join-Path $kitDir "FIELD-PROOF-MANIFEST.json"
if (!(Test-Path -LiteralPath $manifestPath)) { Fail "FIELD-KIT-MANIFEST.txt introuvable" }
if (!(Test-Path -LiteralPath $proofPath)) { Fail "FIELD-PROOF-MANIFEST.json introuvable" }

$proof = Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json
$buildId = [string]$proof.build_id
if ([string]::IsNullOrWhiteSpace($buildId)) { Fail "build_id absent du manifeste preuve" }

$zipName = "OutilsIA-Local-Cockpit-Field-Test-Kit-$buildId.zip"
$zipPath = WslPathToWindows ([string]$proof.zip.path)
if ([string]::IsNullOrWhiteSpace($zipPath)) {
  $zipPath = Join-Path $desktop $zipName
}
$zipShaPath = "$zipPath.sha256.txt"
if (!(Test-Path -LiteralPath $zipPath)) { Fail "zip terrain introuvable: $zipPath" }
if (!(Test-Path -LiteralPath $zipShaPath)) { Fail "manifeste sha introuvable: $zipShaPath" }

if ([string]::IsNullOrWhiteSpace($Destination)) {
  $removable = @(Get-Volume -ErrorAction SilentlyContinue | Where-Object { $_.DriveType -eq 'Removable' -and $_.DriveLetter } | Select-Object -First 1)
  if ($removable.Count -gt 0) {
    $Destination = "$($removable[0].DriveLetter):\OutilsIA-Terrain-$buildId"
  } else {
    $Destination = Join-Path $desktop "OutilsIA-Terrain-USB-$buildId"
  }
}

New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$targetKit = Join-Path $Destination "OutilsIA-Local-Cockpit-Field-Test-Kit"
if (Test-Path -LiteralPath $targetKit) {
  Remove-Item -LiteralPath $targetKit -Recurse -Force
}
Copy-Item -LiteralPath $kitDir -Destination $targetKit -Recurse -Force
Copy-Item -LiteralPath $zipPath -Destination (Join-Path $Destination $zipName) -Force
Copy-Item -LiteralPath $zipShaPath -Destination (Join-Path $Destination (Split-Path $zipShaPath -Leaf)) -Force

$readme = @(
  "# OutilsIA terrain USB",
  "",
  "Build: $buildId",
  "Kit: OutilsIA-Local-Cockpit-Field-Test-Kit",
  "Zip: $zipName",
  "Zip SHA256: $(Sha256 (Join-Path $Destination $zipName))",
  "",
  "Sur le PC a tester:",
  "1. Ouvrir OutilsIA-Local-Cockpit-Field-Test-Kit\\START-HERE.html",
  "2. Lancer INSTALLER-APP.cmd si l'app n'est pas installee",
  "3. Lancer PROCHAIN-PC.cmd ou le dispatch du profil attendu",
  "4. Exporter la fiche terrain depuis l'app",
  "5. Lancer VALIDER-DERNIERE-FICHE.cmd avant de quitter le PC",
  "6. Lancer EXPORTER-FICHES.cmd pour ramener la fiche vers la machine principale"
)
$readme | Set-Content -LiteralPath (Join-Path $Destination "LIRE-MOI-TERRAIN-USB.md") -Encoding UTF8

$manifest = [ordered]@{
  schema = "outilsia.local_cockpit_field_usb_export.v1"
  created_at = (Get-Date).ToUniversalTime().ToString("o")
  build_id = $buildId
  source_kit = $kitDir
  destination = $Destination
  target_kit = $targetKit
  zip = (Join-Path $Destination $zipName)
  zip_sha256 = Sha256 (Join-Path $Destination $zipName)
}
($manifest | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath (Join-Path $Destination "FIELD-USB-EXPORT.json") -Encoding UTF8

Write-Host "field_usb_export_ok destination=$Destination build=$buildId" -ForegroundColor Green
exit 0
`, "utf8");

  writeFileSync(join(kitDir, "IMPORTER-PACK-FICHES.cmd"), [
    "@echo off",
    "setlocal",
    "set \"KIT_DIR=%~dp0\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%KIT_DIR%IMPORTER-PACK-FICHES-WINDOWS.ps1\" -EntriesDir \"%KIT_DIR%entries\"",
    "echo.",
    "echo Rapport import: %KIT_DIR%FIELD-ENTRIES-IMPORT.md",
    "echo Statut post-import: %KIT_DIR%FIELD-ENTRIES-POST-IMPORT.md",
    "echo Rapport validation: %KIT_DIR%FIELD-ENTRIES-VALIDATION.md",
    "start \"\" \"%KIT_DIR%FIELD-ENTRIES-POST-IMPORT.html\"",
    "pause",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "IMPORTER-PACK-FICHES-WINDOWS.ps1"), String.raw`param(
  [string]$ZipPath = "",
  [string]$EntriesDir = ""
)

$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Host "field_entries_import_invalid $message" -ForegroundColor Red
  exit 1
}

if ([string]::IsNullOrWhiteSpace($EntriesDir)) {
  $EntriesDir = Join-Path $PSScriptRoot "entries"
}
New-Item -ItemType Directory -Force -Path $EntriesDir | Out-Null

if ([string]::IsNullOrWhiteSpace($ZipPath)) {
  $downloads = Join-Path ([Environment]::GetFolderPath("UserProfile")) "Downloads"
  $candidates = @()
  $candidates += Get-ChildItem -LiteralPath $PSScriptRoot -Filter "outilsia-field-entries-transfer-*.zip" -File -ErrorAction SilentlyContinue
  $candidates += Get-ChildItem -LiteralPath $downloads -Filter "outilsia-field-entries-transfer-*.zip" -File -ErrorAction SilentlyContinue
  $latest = $candidates | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if (!$latest) { Fail "aucun zip outilsia-field-entries-transfer-*.zip trouve dans le kit ou Telechargements" }
  $ZipPath = $latest.FullName
}
if (!(Test-Path -LiteralPath $ZipPath)) { Fail "zip introuvable: $ZipPath" }

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("outilsia-field-import-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $temp | Out-Null
try {
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $temp -Force
  $sourceEntries = Join-Path $temp "entries"
  if (!(Test-Path -LiteralPath $sourceEntries)) { Fail "le zip ne contient pas de dossier entries/" }

  $files = @(Get-ChildItem -LiteralPath $sourceEntries -Filter "*.json" -File -Recurse -ErrorAction SilentlyContinue)
  if ($files.Count -eq 0) { Fail "le pack ne contient aucune fiche JSON" }

  $copied = @()
  foreach ($file in $files) {
    $target = Join-Path $EntriesDir $file.Name
    Copy-Item -LiteralPath $file.FullName -Destination $target -Force
    $copied += $file.Name
    Write-Host ("fiche_importee " + $file.Name)
  }

  $importJson = Join-Path $PSScriptRoot "FIELD-ENTRIES-IMPORT.json"
  $importMd = Join-Path $PSScriptRoot "FIELD-ENTRIES-IMPORT.md"
  $report = [pscustomobject]@{
    schema = "outilsia.local_cockpit_field_entries_import.v1"
    imported_at = (Get-Date).ToUniversalTime().ToString("o")
    source_zip = $ZipPath
    entries_dir = $EntriesDir
    copied_files = $copied
  }
  $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $importJson -Encoding UTF8
  $lines = @(
    "# Import pack fiches terrain OutilsIA",
    "",
    "- Source: $ZipPath",
    "- Dossier entries: $EntriesDir",
    "- Fiches importees: $($copied.Count)",
    "",
    "| Fiche |",
    "| --- |"
  )
  foreach ($name in $copied) { $lines += "| $name |" }
  $lines | Set-Content -LiteralPath $importMd -Encoding UTF8

  $validator = Join-Path $PSScriptRoot "VALIDER-FICHES-WINDOWS.ps1"
  $validationJson = Join-Path $PSScriptRoot "FIELD-ENTRIES-VALIDATION.json"
  if (Test-Path -LiteralPath $validator) {
    powershell -NoProfile -ExecutionPolicy Bypass -File $validator -EntriesDir $EntriesDir -OutJson $validationJson
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Validation incomplete apres import: continuer avec les profils manquants." -ForegroundColor Yellow
    }
  }

  $validation = if (Test-Path -LiteralPath $validationJson) {
    Get-Content -LiteralPath $validationJson -Raw -Encoding UTF8 | ConvertFrom-Json
  } else {
    [pscustomobject]@{
      status = "FIELD_ENTRIES_VALIDATION_MISSING"
      profiles_required = @()
      profiles_ready = @()
      profiles_missing = @()
      next_profile_to_fix = ""
    }
  }
  $required = @($validation.profiles_required)
  $ready = @($validation.profiles_ready)
  $missing = @($validation.profiles_missing)
  $postStatus = if ($missing.Count -eq 0 -and $required.Count -gt 0) { "READY_TO_ASSEMBLE" } else { "FIELD_TESTS_INCOMPLETE" }
  $nextAction = if ($postStatus -eq "READY_TO_ASSEMBLE") {
    "Lancer COLLECTER-ET-ASSEMBLER.cmd puis VALIDER-GOAL.cmd."
  } elseif (-not [string]::IsNullOrWhiteSpace([string]$validation.next_profile_to_fix)) {
    "Tester le profil suivant: $($validation.next_profile_to_fix)."
  } else {
    "Continuer les tests terrain manquants."
  }
  $post = [ordered]@{
    schema = "outilsia.local_cockpit_field_post_import_status.v1"
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    status = $postStatus
    source_zip = $ZipPath
    copied_files = $copied
    ready = $ready.Count
    required = $required.Count
    profiles_ready = $ready
    profiles_missing = $missing
    next_action = $nextAction
  }
  $postJson = Join-Path $PSScriptRoot "FIELD-ENTRIES-POST-IMPORT.json"
  $postMd = Join-Path $PSScriptRoot "FIELD-ENTRIES-POST-IMPORT.md"
  $postHtml = Join-Path $PSScriptRoot "FIELD-ENTRIES-POST-IMPORT.html"
  $post | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $postJson -Encoding UTF8
  $postLines = @(
    "# Statut post-import terrain OutilsIA",
    "",
    "- Statut: $postStatus",
    "- Fiches importees: $($copied.Count)",
    "- Progression: $($ready.Count)/$($required.Count)",
    "- Profils prets: $(if ($ready.Count -eq 0) { 'aucun' } else { $ready -join ', ' })",
    "- Profils manquants: $(if ($missing.Count -eq 0) { 'aucun' } else { $missing -join ', ' })",
    "- Prochaine action: $nextAction"
  )
  $postLines | Set-Content -LiteralPath $postMd -Encoding UTF8
  $htmlRows = ""
  foreach ($profile in $required) {
    $state = if ($ready -contains $profile) { "pret" } elseif ($missing -contains $profile) { "manquant" } else { "a verifier" }
    $htmlRows += "<tr><td><strong>$profile</strong></td><td>$state</td></tr>" + [Environment]::NewLine
  }
  $postHtmlText = @"
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Statut post-import OutilsIA</title>
  <style>
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#eef3f8;color:#172033}
    main{width:min(980px,calc(100% - 28px));margin:28px auto}
    header,section{background:white;border:1px solid #dbe4ef;border-radius:14px;padding:24px;margin-bottom:14px;box-shadow:0 10px 28px rgba(28,43,68,.08)}
    header{background:#12335e;color:white}
    h1{margin:0 0 8px;font-size:30px}
    .score{font-size:38px;font-weight:700}
    table{width:100%;border-collapse:collapse}
    th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #dbe4ef}
    th{background:#f5f8fc;color:#607086;text-transform:uppercase;font-size:12px}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Statut post-import OutilsIA</h1>
    <p>$nextAction</p>
  </header>
  <section>
    <div class="score">$($ready.Count)/$($required.Count)</div>
    <p>Statut: <code>$postStatus</code></p>
  </section>
  <section>
    <table><thead><tr><th>Profil</th><th>Etat</th></tr></thead><tbody>
$htmlRows
    </tbody></table>
  </section>
</main>
</body>
</html>
"@
  $postHtmlText | Set-Content -LiteralPath $postHtml -Encoding UTF8

  Write-Host "field_entries_import_ok count=$($copied.Count) zip=$ZipPath" -ForegroundColor Green
  exit 0
} finally {
  if (Test-Path -LiteralPath $temp) {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
  }
}
`, "utf8");

  writeFileSync(join(kitDir, "COLLECTER-ET-ASSEMBLER.cmd"), [
    "@echo off",
    "setlocal",
    "set \"KIT_DIR=%~dp0\"",
    "set \"ENTRY_DIR=%KIT_DIR%entries\"",
    "if not exist \"%ENTRY_DIR%\" mkdir \"%ENTRY_DIR%\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$kit='%~dp0'; $entry=Join-Path $kit 'entries'; $download=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'; New-Item -ItemType Directory -Force -Path $entry | Out-Null; $files=Get-ChildItem -Path $download -Filter 'outilsia-field-test-*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending; if($files){ foreach($file in $files){ Copy-Item $file.FullName (Join-Path $entry $file.Name) -Force; Write-Host ('fiche_collectee ' + $file.Name) }; Write-Host ('total=' + $files.Count) } else { Write-Host 'Aucune nouvelle fiche trouvee dans Telechargements; tentative assemblage avec entries existant.' }\"",
    appCommand(`npm run assemble:field-tests -- --dir ${shSingleQuoted(entriesDir)} --out ${shSingleQuoted(fieldTestsJsonPath)}`),
    "pause",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "VALIDER-GOAL.cmd"), [
    "@echo off",
    "setlocal",
    "set \"KIT_DIR=%~dp0\"",
    "set \"ENTRY_DIR=%KIT_DIR%entries\"",
    "if not exist \"%ENTRY_DIR%\" mkdir \"%ENTRY_DIR%\"",
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$kit='%~dp0'; $entry=Join-Path $kit 'entries'; $download=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'; New-Item -ItemType Directory -Force -Path $entry | Out-Null; $files=Get-ChildItem -Path $download -Filter 'outilsia-field-test-*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending; if($files){ foreach($file in $files){ Copy-Item $file.FullName (Join-Path $entry $file.Name) -Force; Write-Host ('fiche_collectee ' + $file.Name) }; Write-Host ('total=' + $files.Count) } else { Write-Host 'Aucune nouvelle fiche trouvee dans Telechargements; validation avec entries existant.' }\"",
    repoCommand(`npm --prefix local-cockpit-app run status:field-tests -- --dir ${shSingleQuoted(entriesDir)} --out ${shSingleQuoted(fieldStatusJsonPath)} && npm --prefix local-cockpit-app run assemble:field-tests -- --dir ${shSingleQuoted(entriesDir)} --out ${shSingleQuoted(fieldTestsJsonPath)}`),
    "if errorlevel 1 goto fail",
    repoCommand(`npm --prefix local-cockpit-app run import:field-tests -- --input ${shSingleQuoted(fieldTestsJsonPath)}`),
    "if errorlevel 1 goto fail",
    repoCommand("python3 scripts/audit_beta_field_goal.py"),
    "if errorlevel 1 goto fail",
    "echo.",
    "echo Validation terrain terminee. Si l'audit indique encore GOAL_NOT_COMPLETE, lire le dernier rapport dans reports/.",
    "pause",
    "exit /b 0",
    ":fail",
    "echo.",
    "echo Validation terrain echouee. Verifie les profils manquants ou les champs incomplets dans les fiches.",
    "pause",
    "exit /b 1",
    ""
  ].join("\r\n"), "utf8");

  writeFileSync(join(kitDir, "IMPORTER.cmd"), [
    "@echo off",
    appCommand(`npm run import:field-tests -- --input ${shSingleQuoted(fieldTestsJsonPath)}`),
    "pause",
    ""
  ].join("\r\n"), "utf8");

  execFileSync(process.execPath, [
    join(appRoot, "scripts", "report-field-test-status.mjs"),
    "--dir",
    join(kitDir, "entries"),
    "--out",
    join(kitDir, "FIELD-TESTS-STATUS.json"),
  ], { stdio: "pipe" });
  const windowsStatus = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    toWindowsPath(join(kitDir, "STATUT-WINDOWS.ps1")),
  ], { encoding: "utf8" });
  if (![0, 1].includes(windowsStatus.status ?? 1)) {
    throw new Error(`STATUT-WINDOWS.ps1 failed: ${(windowsStatus.stdout || "")}${(windowsStatus.stderr || "")}`.trim());
  }
  const missingPacks = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    toWindowsPath(join(kitDir, "PREPARER-PACKS-MANQUANTS-WINDOWS.ps1")),
  ], { encoding: "utf8" });
  if (missingPacks.status !== 0) {
    throw new Error(`PREPARER-PACKS-MANQUANTS-WINDOWS.ps1 failed: ${(missingPacks.stdout || "")}${(missingPacks.stderr || "")}`.trim());
  }
  const verifyMissingPacks = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    toWindowsPath(join(kitDir, "VERIFIER-PACKS-MANQUANTS-WINDOWS.ps1")),
  ], { encoding: "utf8" });
  if (verifyMissingPacks.status !== 0) {
    throw new Error(`VERIFIER-PACKS-MANQUANTS-WINDOWS.ps1 failed: ${(verifyMissingPacks.stdout || "")}${(verifyMissingPacks.stderr || "")}`.trim());
  }
  const fieldStatus = readJson(join(kitDir, "FIELD-TESTS-STATUS.json"));
  const postReady = fieldStatus.profiles_ready || [];
  const postRequired = fieldStatus.profiles_required || [];
  const postMissing = fieldStatus.profiles_missing || [];
  const postStatus = postMissing.length === 0 && postRequired.length > 0 ? "READY_TO_ASSEMBLE" : "FIELD_TESTS_INCOMPLETE";
  const postNextAction = postStatus === "READY_TO_ASSEMBLE"
    ? "Lancer COLLECTER-ET-ASSEMBLER.cmd puis VALIDER-GOAL.cmd."
    : `Tester le profil suivant: ${fieldStatus.next_profile_to_test || postMissing[0] || "profil restant"}.`;
  const postImport = {
    schema: "outilsia.local_cockpit_field_post_import_status.v1",
    generated_at: new Date().toISOString(),
    status: postStatus,
    source_zip: "",
    copied_files: [],
    ready: postReady.length,
    required: postRequired.length,
    profiles_ready: postReady,
    profiles_missing: postMissing,
    next_action: postNextAction,
  };
  writeFileSync(join(kitDir, "FIELD-ENTRIES-POST-IMPORT.json"), JSON.stringify(postImport, null, 2), "utf8");
  writeFileSync(join(kitDir, "FIELD-ENTRIES-POST-IMPORT.md"), [
    "# Statut post-import terrain OutilsIA",
    "",
    `- Statut: ${postStatus}`,
    `- Progression: ${postReady.length}/${postRequired.length}`,
    `- Profils prets: ${postReady.length ? postReady.join(", ") : "aucun"}`,
    `- Profils manquants: ${postMissing.length ? postMissing.join(", ") : "aucun"}`,
    `- Prochaine action: ${postNextAction}`,
    "",
  ].join("\n"), "utf8");
  const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const postRows = postRequired.map((profile) => {
    const state = postReady.includes(profile) ? "pret" : postMissing.includes(profile) ? "manquant" : "a verifier";
    return `<tr><td><strong>${escapeHtml(profile)}</strong></td><td>${escapeHtml(state)}</td></tr>`;
  }).join("\n");
  writeFileSync(join(kitDir, "FIELD-ENTRIES-POST-IMPORT.html"), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Statut post-import OutilsIA</title>
  <style>
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#eef3f8;color:#172033}
    main{width:min(980px,calc(100% - 28px));margin:28px auto}
    header,section{background:white;border:1px solid #dbe4ef;border-radius:14px;padding:24px;margin-bottom:14px;box-shadow:0 10px 28px rgba(28,43,68,.08)}
    header{background:#12335e;color:white}
    h1{margin:0 0 8px;font-size:30px}
    .score{font-size:38px;font-weight:700}
    table{width:100%;border-collapse:collapse}
    th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #dbe4ef}
    th{background:#f5f8fc;color:#607086;text-transform:uppercase;font-size:12px}
    code{font-family:Consolas,monospace;background:#edf2f8;border:1px solid #d7e0ea;border-radius:6px;padding:2px 5px}
  </style>
</head>
<body>
<main>
  <header>
    <h1>Statut post-import OutilsIA</h1>
    <p>${escapeHtml(postNextAction)}</p>
  </header>
  <section>
    <div class="score">${postReady.length}/${postRequired.length}</div>
    <p>Statut: <code>${escapeHtml(postStatus)}</code></p>
  </section>
  <section>
    <table><thead><tr><th>Profil</th><th>Etat</th></tr></thead><tbody>
${postRows}
    </tbody></table>
  </section>
</main>
</body>
</html>
`, "utf8");

  const zipName = `OutilsIA-Local-Cockpit-Field-Test-Kit-${release.build_id || "beta"}.zip`;
  mkdirSync(zipRoot, { recursive: true });
  const zipPath = join(zipRoot, zipName);
  const zipManifestPath = join(zipRoot, `${zipName}.sha256.txt`);
  let zipInfo = {
    zip: zipPath,
    zip_name: zipName,
    zip_bytes: 0,
    zip_sha256: "",
    zip_error: "",
  };
  const baseProof = {
    schema: "outilsia.local_cockpit_field_proof_manifest.v1",
    generated_at: new Date().toISOString(),
    kit_dir: kitDir,
    build_id: release.build_id || "",
    version: release.version || "",
    installer: {
      name: primaryDownload.name || "",
      path: installerCopied ? installerTarget : "",
      size_bytes: installerCopied ? statSync(installerTarget).size : 0,
      sha256: primaryDownload.sha256 || "",
    },
    zip: {
      path: zipInfo.zip,
      name: zipInfo.zip_name,
      size_bytes: zipInfo.zip_bytes,
      sha256: zipInfo.zip_sha256,
      error: zipInfo.zip_error,
    },
    field_status: {
      status: fieldStatus.status,
      ready: fieldStatus.profiles_ready?.length || 0,
      required: fieldStatus.profiles_required?.length || 0,
      next_profile_to_test: fieldStatus.next_profile_to_test || "",
      missing_profiles: fieldStatus.profiles_missing || [],
      incomplete_profiles: fieldStatus.profiles_incomplete || [],
    },
    expected_final_artifacts: {
      entries_dir: join(kitDir, "entries"),
      field_entries_validation_json: join(kitDir, "FIELD-ENTRIES-VALIDATION.json"),
      field_entries_validation_md: join(kitDir, "FIELD-ENTRIES-VALIDATION.md"),
      field_entries_validation_html: join(kitDir, "FIELD-ENTRIES-VALIDATION.html"),
      field_entries_transfer_zip_pattern: join(kitDir, "outilsia-field-entries-transfer-*.zip"),
      field_entries_import_json: join(kitDir, "FIELD-ENTRIES-IMPORT.json"),
      field_entries_import_md: join(kitDir, "FIELD-ENTRIES-IMPORT.md"),
      field_tests_json: join(kitDir, "FIELD-TESTS.json"),
      field_tests_md: join(kitDir, "FIELD-TESTS.md"),
      latest_entry_marker: join(kitDir, "LAST-FIELD-ENTRY.txt"),
      status_json: join(kitDir, "FIELD-TESTS-STATUS.json"),
      status_md: join(kitDir, "FIELD-TESTS-STATUS.md"),
      command_center_html: join(kitDir, "CENTRE-TERRAIN.html"),
      mission_html: join(kitDir, "MISSION-TERRAIN.html"),
      next_profile_html: join(kitDir, "PROCHAIN-PC.html"),
      profile_cards_html: join(kitDir, "FIELD-PROFILE-CARDS.html"),
      dispatch_html: join(kitDir, "FIELD-DISPATCH.html"),
      start_here_html: join(kitDir, "START-HERE.html"),
    },
    validation_commands: [
      `npm run status:field-tests -- --dir ${entriesDir} --out ${fieldStatusJsonPath}`,
      `npm run assemble:field-tests -- --dir ${entriesDir} --out ${fieldTestsJsonPath}`,
      `npm run import:field-tests -- --input ${fieldTestsJsonPath}`,
      "python3 scripts/audit_beta_field_goal.py",
    ],
  };
  writeProofManifest(kitDir, baseProof);

  const kitSelfCheck = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    toWindowsPath(join(kitDir, "VERIFIER-KIT-WINDOWS.ps1")),
  ], { encoding: "utf8" });
  if (kitSelfCheck.status !== 0) {
    throw new Error(`VERIFIER-KIT-WINDOWS.ps1 failed: ${(kitSelfCheck.stdout || "")}${kitSelfCheck.stderr || ""}`.trim());
  }

  try {
    execFileSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      [
        "$ErrorActionPreference = 'Stop';",
        `$source = ${psSingleQuoted(`${toWindowsPath(kitDir)}\\*`)};`,
        `$dest = ${psSingleQuoted(toWindowsPath(zipPath))};`,
        "if (Test-Path $dest) { Remove-Item $dest -Force };",
        "Compress-Archive -Path $source -DestinationPath $dest -Force;",
      ].join(" "),
    ], { stdio: "pipe" });
    zipInfo = {
      zip: zipPath,
      zip_name: zipName,
      zip_bytes: statSync(zipPath).size,
      zip_sha256: sha256(zipPath),
      zip_error: "",
    };
    writeFileSync(zipManifestPath, [
      `zip=${zipInfo.zip}`,
      `zip_name=${zipInfo.zip_name}`,
      `zip_bytes=${zipInfo.zip_bytes}`,
      `zip_sha256=${zipInfo.zip_sha256}`,
      `kit=${kitDir}`,
      `build_id=${release.build_id || ""}`,
      `installer_sha256=${primaryDownload.sha256 || ""}`,
      `created_at_utc=${new Date().toISOString()}`,
      ""
    ].join("\n"), "utf8");
  } catch (error) {
    zipInfo.zip_error = error.message || String(error);
    writeFileSync(zipManifestPath, [
      `zip=${zipPath}`,
      "zip_error=true",
      `message=${zipInfo.zip_error}`,
      `build_id=${release.build_id || ""}`,
      ""
    ].join("\n"), "utf8");
  }

  writeProofManifest(kitDir, {
    ...baseProof,
    generated_at: new Date().toISOString(),
    zip: {
      path: zipInfo.zip,
      name: zipInfo.zip_name,
      size_bytes: zipInfo.zip_bytes,
      sha256: zipInfo.zip_sha256,
      error: zipInfo.zip_error,
    },
  });

  console.log(`field_test_kit_ok ${kitDir}`);
  console.log(`field_test_kit_zip ${zipPath}`);
  console.log(`profiles=${REQUIRED_PROFILES.length} build_id=${release.build_id || ""}`);
}

main();
