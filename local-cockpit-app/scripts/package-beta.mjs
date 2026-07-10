import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const tauriConfigPath = join(appRoot, "src-tauri", "tauri.conf.json");
const packageJsonPath = join(appRoot, "package.json");
const bundleRoot = join(appRoot, "src-tauri", "target", "release", "bundle");
const webDownloadRoot = join(repoRoot, "server-work", "static", "downloads", "local-cockpit");
const releaseJsonPath = join(webDownloadRoot, "release.json");
const sourceRoots = [
  join(appRoot, "src"),
  join(appRoot, "src-tauri", "src"),
  join(appRoot, "src-tauri", "icons"),
  join(appRoot, "src-tauri", "tauri.conf.json"),
  join(appRoot, "src-tauri", "Cargo.toml"),
  join(appRoot, "src-tauri", "Cargo.lock"),
  packageJsonPath
];
const sourceExts = new Set([".js", ".html", ".css", ".json", ".rs", ".toml", ".lock", ".png", ".ico", ".icns"]);

const config = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const version = config.version || pkg.version || "0.1.0";
const publishedAt = new Date().toISOString();
const buildId = (process.env.OUTILSIA_BUILD_ID || publishedAt)
  .replace(/[-:.TZ]/g, "")
  .slice(0, 14);

const wantedExts = new Set([".exe", ".msi", ".appimage", ".deb", ".rpm", ".dmg"]);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) return walk(path);
    if (!wantedExts.has(extname(name).toLowerCase())) return [];
    return [path];
  });
}

function newestSource(paths) {
  let newest = { path: "", mtimeMs: 0 };
  function visit(path) {
    if (!existsSync(path)) return;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) {
        if (name === "target" || name === "node_modules" || name === ".git") continue;
        visit(join(path, name));
      }
      return;
    }
    if (!sourceExts.has(extname(path).toLowerCase())) return;
    if (stat.mtimeMs > newest.mtimeMs) newest = { path, mtimeMs: stat.mtimeMs };
  }
  for (const path of paths) visit(path);
  return newest;
}

function assertFreshArtifacts(artifactPaths) {
  const allowStale = process.env.OUTILSIA_ALLOW_STALE_ARTIFACTS === "1";
  const newest = newestSource(sourceRoots);
  const oldestArtifact = artifactPaths
    .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
    .sort((a, b) => a.mtimeMs - b.mtimeMs)[0];
  const staleByMs = newest.mtimeMs - oldestArtifact.mtimeMs;
  const result = {
    newest_source: newest.path ? relative(repoRoot, newest.path) : "",
    newest_source_mtime_ms: Math.round(newest.mtimeMs),
    oldest_artifact: oldestArtifact?.path ? relative(repoRoot, oldestArtifact.path) : "",
    oldest_artifact_mtime_ms: Math.round(oldestArtifact?.mtimeMs || 0),
    allow_stale: allowStale,
    stale: staleByMs > 1000
  };
  if (result.stale && !allowStale) {
    console.error("Refusing to package stale Tauri artifacts.");
    console.error(`Newest source: ${result.newest_source}`);
    console.error(`Oldest artifact: ${result.oldest_artifact}`);
    console.error("Run `npm run build:beta` on the target build machine, then rerun `npm run package:beta`.");
    console.error("Override only for emergency republishing: OUTILSIA_ALLOW_STALE_ARTIFACTS=1 npm run package:beta");
    process.exit(1);
  }
  return result;
}

function sha256(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function platformFor(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".exe") || lower.endsWith(".msi")) return "windows-x64";
  if (lower.endsWith(".dmg")) return "macos";
  if (lower.endsWith(".appimage") || lower.endsWith(".deb") || lower.endsWith(".rpm")) return "linux";
  return "unknown";
}

function stableNameFor(path) {
  const platform = platformFor(path);
  const ext = extname(path).toLowerCase();
  return `OutilsIA-Local-Cockpit-${version}-beta-${buildId}-${platform}${ext}`;
}

function supportedArtifact(path) {
  const original = basename(path).toLowerCase();
  if (platformFor(path) === "windows-x64" && /_x86[-_]/i.test(original)) return false;
  if (platformFor(path) === "windows-x64" && /_arm64[-_]/i.test(original)) return false;
  return true;
}

const artifacts = walk(bundleRoot).filter(supportedArtifact);

if (!artifacts.length) {
  console.error(`No bundle artifact found under ${relative(repoRoot, bundleRoot)}.`);
  console.error("Run `npm run build:beta` from local-cockpit-app on the target build machine first.");
  process.exit(1);
}

const freshness = assertFreshArtifacts(artifacts);

mkdirSync(webDownloadRoot, { recursive: true });

const files = artifacts.map((sourcePath) => {
  const fileName = stableNameFor(sourcePath);
  const destPath = join(webDownloadRoot, fileName);
  copyFileSync(sourcePath, destPath);
  const stat = statSync(destPath);
  return {
    name: fileName,
    original_name: basename(sourcePath),
    platform: platformFor(sourcePath),
    size_bytes: stat.size,
    sha256: sha256(destPath),
    url: `/static/downloads/local-cockpit/${fileName}`,
  };
});

const artifactPlatforms = [...new Set(files.map((file) => file.platform))].sort();
const buildProvenance = {
  schema: "outilsia.local_cockpit_build_provenance.v1",
  packaged_at: publishedAt,
  build_id: buildId,
  version,
  ci: process.env.GITHUB_ACTIONS === "true",
  runner_os: process.env.RUNNER_OS || process.platform,
  node_platform: process.platform,
  node_arch: process.arch,
  artifact_platforms: artifactPlatforms,
  github: {
    workflow: process.env.GITHUB_WORKFLOW || "",
    run_id: process.env.GITHUB_RUN_ID || "",
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || "",
    ref: process.env.GITHUB_REF || "",
    sha: process.env.GITHUB_SHA || "",
    repository: process.env.GITHUB_REPOSITORY || "",
  },
};

const duplicateNames = files
  .map((file) => file.name)
  .filter((name, index, names) => names.indexOf(name) !== index);
if (duplicateNames.length) {
  console.error(`Duplicate release file names after normalization: ${[...new Set(duplicateNames)].join(", ")}`);
  process.exit(1);
}

const windowsPrimary = files.find((file) => file.platform === "windows-x64" && extname(file.name).toLowerCase() === ".exe")
  || files.find((file) => file.platform === "windows-x64")
  || files[0];
const downloadsByPlatform = files.reduce((acc, file) => {
  if (!acc[file.platform]) acc[file.platform] = [];
  acc[file.platform].push(file);
  return acc;
}, {});
const release = {
  ok: true,
  product: "OutilsIA Local Cockpit",
  channel: "beta",
  version,
  label: `${version}-beta`,
  build_id: buildId,
  published_at: publishedAt,
  build_provenance: buildProvenance,
  release_notes: [
    "Hardware Doctor 2.0 : signaux RAM/GPU/driver/PCIe/ReBAR/thermiques clairement sourcés, mesures instantanées étiquetées et inconnues conservées comme inconnues.",
    "Model Autopilot v1 : trois profils bornés sur un modèle déjà installé, métriques API Ollama obligatoires, application explicite et restauration du profil précédent ou des réglages par défaut.",
    "Preuve d'offload Ollama : après benchmark, /api/ps distingue CPU, hybride et GPU depuis size_vram / size au lieu de déduire l'accélération depuis le pilote.",
    "AI Capability Passport v1 : export JSON optionnel lié à la machine et au build avec capacités, modèles, preuves, recommandation, limites et SHA-256 d'intégrité — pas une signature d'identité.",
    "Recommendation Engine v2 : choisir Chat, Code, Mémoire, Français, Portable ou Polyvalent, comparer deux candidats avec sept preuves et obtenir une décision « Garder ce modèle » avec vitesse, latence, ressources et limites exportées.",
    "Proof Engine Ollama exact : chargement, préremplissage et génération tokens/s utilisent les métriques natives de l'API, avec repli CLI signalé comme estimation.",
    "Arena objective v1 : chaque modèle reçoit le même micro-test et conserve six preuves vérifiables — JSON, instruction, mémoire, calcul, français et action.",
    "Retest CPU après erreur CUDA : OutilsIA force num_gpu=0 via l'API Ollama pour distinguer un modèle fonctionnel d'un pilote GPU bloqué.",
    "Potentiel matériel et état du runtime sont séparés : un score GPU élevé ne masque plus un échec CUDA/Ollama réel.",
    "DriverDoctor : détection des pilotes NVIDIA/AMD/Intel, conseils CUDA/ROCm/Vulkan, RAM dual-channel, fréquence mémoire et mémoire unifiée.",
    "Mode Essentiel resserré : une action principale, le matériel directement sous le scan et la preuve benchmark conservée à l'écran.",
    "Bibliothèque Mes prompts : sauvegarder les prompts optimisés, les réutiliser dans Benchmark ou Dialogue, copier/exporter la bibliothèque.",
    "Parcours guidé étendu : scan, diagnostic, Ollama, modèle test, benchmark, PromptForge, dialogue local, Arena et rapport final MemoryForge.",
    "PromptForge local intégré : optimiser un prompt de benchmark/dialogue, l'envoyer vers Ollama et le sauvegarder dans MemoryForge.",
    "Arena locale : scores par usage calculés depuis les preuves objectives et les performances mesurées sur la machine, sans bonus lié au nom du modèle.",
    "Teasing tenu : les cartes modèles affichent maintenant force, usage, limite et prochaine action sans cacher l'information derrière un bouton.",
    "Suivi direct renforcé : installer Ollama, télécharger un modèle ou lancer un benchmark met immédiatement le bandeau haut à jour.",
    "Benchmark moins désorientant : l'app garde le suivi visible en haut au lieu de forcer l'utilisateur à chercher la console en bas.",
    "UX 30 secondes : action principale unique selon l'état réel de la machine, d'Ollama et du modèle test.",
    "Premier test et console rapprochés : l'utilisateur voit le déroulement des téléchargements, installations et benchmarks sans scroller.",
    "Verdict après scan enrichi : encouragement petit PC/ancien GPU, blocage principal, modèle suivant et action immédiate.",
    "Version 0.1.1 : console visible pendant les téléchargements, installations et benchmarks.",
    "Gestionnaire de modèles plus clair : installés, recommandés, compatibles, limites proches et à éviter.",
    "Fiches modèles enrichies, dialogue local, profils de test, Arena locale et rapport partageable plus vendeur.",
    "Catalogue vivant : l'app récupère les signaux modèles/matériel publiés par les contenus OutilsIA.",
    "MemoryForge/Obsidian enrichi avec fiches machine, modèles, benchmarks, décisions et état catalogues.",
  ],
  freshness,
  primary_download: windowsPrimary,
  downloads_by_platform: downloadsByPlatform,
  files,
};

writeFileSync(releaseJsonPath, `${JSON.stringify(release, null, 2)}\n`);

console.log(`release_json=${relative(repoRoot, releaseJsonPath)}`);
for (const file of files) {
  console.log(`${file.platform} ${file.name} ${file.sha256} ${file.size_bytes}`);
}
