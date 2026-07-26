#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultCandidate = join(appRoot, ".artifacts", "release-candidate");
const defaultKitRoot = join(appRoot, ".artifacts", "release-candidate-kit");

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const opts = { candidate: defaultCandidate, output: "", replace: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/make-release-candidate-kit.mjs [--candidate-dir <dir>] [--output-dir <dir>] [--replace]");
      process.exit(0);
    }
    if (arg === "--candidate-dir") {
      opts.candidate = resolve(argv[++index] || "");
      continue;
    }
    if (arg === "--output-dir") {
      opts.output = resolve(argv[++index] || "");
      continue;
    }
    if (arg === "--replace") {
      opts.replace = true;
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }
  return opts;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: appRoot, encoding: "utf8", ...options });
  if (result.status !== 0) fail(result.stderr || result.stdout || `Command failed: ${command}`);
}

function psString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function html(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function write(path, value, encoding = "utf8") {
  writeFileSync(path, value.endsWith("\n") ? value : `${value}\n`, encoding);
}

function prepareOutput(path, replace) {
  if (existsSync(path)) {
    const entries = readdirSync(path);
    if (entries.length && !replace) fail(`Kit output is not empty: ${path}. Pass --replace.`);
    if (replace) rmSync(path, { recursive: true, force: true });
  }
  mkdirSync(join(path, "results"), { recursive: true });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  run("node", [
    join(appRoot, "scripts", "verify-release-candidate.mjs"),
    "--input",
    opts.candidate,
    "--require-platform",
    "windows-x64",
    "--require-freshness",
  ]);
  const candidate = JSON.parse(readFileSync(join(opts.candidate, "release-candidate.json"), "utf8"));
  const candidateManifestSha = createHash("sha256")
    .update(readFileSync(join(opts.candidate, "release-candidate.json")))
    .digest("hex");
  const output = opts.output || join(defaultKitRoot, `OutilsIA-Local-Cockpit-${candidate.label}-Test`);
  prepareOutput(output, opts.replace);

  const windowsFiles = candidate.files.filter((file) => file.platform === "windows-x64");
  if (!windowsFiles.length) fail("Candidate has no Windows artifact");
  for (const file of windowsFiles) copyFileSync(join(opts.candidate, file.name), join(output, file.name));
  copyFileSync(join(opts.candidate, "release-candidate.json"), join(output, "release-candidate.json"));
  copyFileSync(join(opts.candidate, "SHA256SUMS.txt"), join(output, "SHA256SUMS.txt"));
  copyFileSync(join(opts.candidate, "AUTHENTICODE.json"), join(output, "AUTHENTICODE.json"));

  const portable = windowsFiles.find((file) => file.kind === "portable") || null;
  const setup = windowsFiles.find((file) => file.kind === "setup") || windowsFiles[0];
  const signingStatus = candidate.code_signing?.status || "unverified";
  const signingByName = new Map((candidate.code_signing?.files || []).map((file) => [file.name, file]));
  const signingLabel = signingStatus === "valid"
    ? "Signature Authenticode valide"
    : signingStatus === "not_signed"
      ? "Bêta non signée · SHA256 vérifiés"
      : signingStatus === "mixed_or_invalid"
        ? "Signature absente ou invalide · ne pas promouvoir"
        : "Statut de signature non vérifié · contrôle requis";
  const createdAt = String(candidate.created_at || "");
  const expectedFileRows = windowsFiles
    .map((file) => `  @{ Name = ${psString(file.name)}; Sha256 = ${psString(file.sha256)}; Authenticode = ${psString(signingByName.get(file.name)?.status || "unverified")} }`)
    .join(",\n");

  write(join(output, "Verifier-et-lancer.ps1"), String.raw`param(
  [switch]$Installer
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$expectedVersion = ${psString(candidate.version)}
$expectedBuild = ${psString(candidate.build_id)}
$files = @(
${expectedFileRows}
)
foreach ($item in $files) {
  $path = Join-Path $root $item.Name
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) { throw "Artefact RC manquant: $($item.Name)" }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
  if ($actual -ne $item.Sha256) { throw "SHA256 invalide pour $($item.Name): $actual" }
  Write-Host "SHA OK $($item.Name)" -ForegroundColor Green
  $signature = Get-AuthenticodeSignature -LiteralPath $path
  $actualAuthenticode = switch ([string]$signature.Status) {
    "Valid" { "valid" }
    "NotSigned" { "not_signed" }
    default { "invalid" }
  }
  if ($item.Authenticode -ne "unverified" -and $actualAuthenticode -ne $item.Authenticode) {
    throw "Statut Authenticode inattendu pour $($item.Name): $actualAuthenticode, attendu $($item.Authenticode)"
  }
  $tone = if ($actualAuthenticode -eq "valid") { "Green" } elseif ($actualAuthenticode -eq "not_signed") { "Yellow" } else { "Red" }
  Write-Host "Authenticode $actualAuthenticode $($item.Name)" -ForegroundColor $tone
}
$manifest = Get-Content -LiteralPath (Join-Path $root "release-candidate.json") -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.channel -ne "release-candidate") { throw "Canal RC invalide" }
if ($manifest.version -ne $expectedVersion -or $manifest.build_id -ne $expectedBuild) {
  throw "Identite RC invalide: $($manifest.version)/$($manifest.build_id)"
}
if ($manifest.deployment.public_allowed -ne $false) { throw "Le manifeste RC autorise un deploiement public interdit" }
$target = if ($Installer) { ${psString(setup.name)} } else { ${psString(portable?.name || setup.name)} }
Write-Host "RC verifie $($manifest.label) build $expectedBuild" -ForegroundColor Cyan
Start-Process -FilePath (Join-Path $root $target)
`);

  write(join(output, "01-LANCER-LE-RC.cmd"), `@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Verifier-et-lancer.ps1"
if errorlevel 1 (
  echo.
  echo Verification RC echouee.
  pause
  exit /b 1
)
echo.
echo RC lance. Ouvrez START-HERE.html et suivez les 5 etapes.
pause
`, "ascii");

  write(join(output, "INSTALLER-LE-RC.cmd"), `@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Verifier-et-lancer.ps1" -Installer
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
`, "ascii");

  write(join(output, "Valider-test-express.ps1"), String.raw`param(
  [string]$RecipePath = ""
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$expectedVersion = ${psString(candidate.version)}
$expectedBuild = ${psString(candidate.build_id)}
$candidateCreatedAt = [DateTimeOffset]::Parse(${psString(createdAt)})

function Fail([string]$Message) {
  Write-Host "RC_SMOKE_INVALID $Message" -ForegroundColor Red
  exit 1
}
function Require-True($Value, [string]$Label) {
  if ($Value -ne $true) { Fail "$Label doit etre true" }
}
function Require-Text($Value, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace([string]$Value)) { Fail "$Label est vide" }
}
function Get-Sha256Text([string]$Value) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $hash = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($hash.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $hash.Dispose()
  }
}

if ([string]::IsNullOrWhiteSpace($RecipePath)) {
  $local = Join-Path $root "RECETTE-RESULTAT.json"
  if (Test-Path -LiteralPath $local -PathType Leaf) {
    $RecipePath = $local
  } else {
    $downloads = Join-Path ([Environment]::GetFolderPath("UserProfile")) "Downloads"
    $latest = Get-ChildItem -LiteralPath $downloads -Filter "RECETTE-RESULTAT*.json" -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($latest) { $RecipePath = $latest.FullName }
  }
}
if ([string]::IsNullOrWhiteSpace($RecipePath) -or !(Test-Path -LiteralPath $RecipePath -PathType Leaf)) {
  Fail "RECETTE-RESULTAT.json introuvable. Dans l'app, cliquer Telecharger recette apres le rapport partage."
}

try {
  $recipe = Get-Content -LiteralPath $RecipePath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
  Fail "JSON recette illisible: $($_.Exception.Message)"
}
$recipeSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $RecipePath).Hash.ToLowerInvariant()
$recipeExportPath = Join-Path $root "RECETTE-SOURCE.json"
Copy-Item -LiteralPath $RecipePath -Destination $recipeExportPath -Force
$candidateManifestPath = Join-Path $root "release-candidate.json"
$candidateManifestSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $candidateManifestPath).Hash.ToLowerInvariant()
if ($candidateManifestSha -ne ${psString(candidateManifestSha)}) {
  Fail "release-candidate.json ne correspond plus au kit signe"
}
if ([string]$recipe.app_version -ne $expectedVersion) {
  Fail "app_version=$($recipe.app_version), attendu $expectedVersion"
}
if ([string]$recipe.build_id -ne $expectedBuild) {
  Fail "build_id=$($recipe.build_id), attendu $expectedBuild"
}
if ([string]$recipe.release_channel -ne "rc") {
  Fail "release_channel=$($recipe.release_channel), attendu rc"
}
$testedAt = [DateTimeOffset]::MinValue
if (![DateTimeOffset]::TryParse([string]$recipe.tested_at, [ref]$testedAt)) { Fail "tested_at invalide" }
if ($testedAt -lt $candidateCreatedAt.AddDays(-1)) { Fail "recette anterieure au candidat RC" }
if ($testedAt -gt [DateTimeOffset]::UtcNow.AddMinutes(10)) { Fail "tested_at est dans le futur" }

Require-True $recipe.native_flow.scan "native_flow.scan"
Require-True $recipe.native_flow.ollama_install_or_ready "native_flow.ollama_install_or_ready"
Require-True $recipe.native_flow.qwen_install_or_ready "native_flow.qwen_install_or_ready"
Require-True $recipe.native_flow.qwen_benchmark "native_flow.qwen_benchmark"
Require-True $recipe.native_flow.readiness_report "native_flow.readiness_report"
Require-True $recipe.report.has_score "report.has_score"
Require-True $recipe.report.has_speed "report.has_speed"
Require-True $recipe.report.has_next_actions "report.has_next_actions"
Require-True $recipe.report.shared "report.shared"
Require-Text $recipe.report.share_url "report.share_url"
Require-Text $recipe.machine_evidence.cpu "machine_evidence.cpu"
Require-Text $recipe.machine_evidence.gpu "machine_evidence.gpu"

$ram = 0.0
if (![double]::TryParse([string]$recipe.machine_evidence.ram_gb, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$ram) -or $ram -le 0) {
  Fail "machine_evidence.ram_gb invalide"
}
Require-Text $recipe.benchmark_evidence.model "benchmark_evidence.model"
$tps = 0.0
if (![double]::TryParse([string]$recipe.benchmark_evidence.tokens_per_second, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$tps) -or $tps -le 0) {
  Fail "benchmark_evidence.tokens_per_second invalide"
}
$elapsed = 0.0
if (![double]::TryParse([string]$recipe.benchmark_evidence.elapsed_ms, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$elapsed) -or $elapsed -lt 200) {
  Fail "benchmark_evidence.elapsed_ms invalide ou trop court"
}

$share = [string]$recipe.report.share_url
$uri = $null
if (![Uri]::TryCreate($share, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne "https" -or $uri.Host -ne "outilsia.fr" -or !$uri.AbsolutePath.StartsWith("/r/")) {
  Fail "share_url doit etre un rapport https://outilsia.fr/r/..."
}
try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $share -TimeoutSec 30 -Headers @{"Cache-Control"="no-cache"}
} catch {
  Fail "rapport partage inaccessible: $($_.Exception.Message)"
}
if ([int]$response.StatusCode -ne 200) { Fail "rapport partage HTTP $($response.StatusCode)" }
$gpu = [string]$recipe.machine_evidence.gpu
if (![string]::IsNullOrWhiteSpace($gpu) -and $gpu -notmatch "non scann" -and $response.Content -notmatch [regex]::Escape($gpu)) {
  Fail "le rapport partage ne contient pas le GPU mesure: $gpu"
}
$reportBodySha = Get-Sha256Text ([string]$response.Content)
$machineAnchor = [string]$env:COMPUTERNAME
try {
  $machineGuid = [string](Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name MachineGuid -ErrorAction Stop).MachineGuid
  if (![string]::IsNullOrWhiteSpace($machineGuid)) { $machineAnchor = $machineGuid }
} catch {}
$machineAnchorSha = Get-Sha256Text ($machineAnchor + "|" + $candidateManifestSha)
$machineIdentity = @(
  [string]$recipe.machine_evidence.cpu,
  [string]$recipe.machine_evidence.gpu,
  [string]$recipe.machine_evidence.ram_gb,
  [string]$recipe.machine_evidence.vram_gb,
  [string]$recipe.machine_evidence.os,
  $machineAnchorSha
) -join "|"
$machineFingerprint = Get-Sha256Text $machineIdentity

$result = [ordered]@{
  schema = "outilsia.local_cockpit_rc_smoke.v1"
  ok = $true
  validated_at = [DateTimeOffset]::UtcNow.ToString("o")
  candidate = [ordered]@{
    version = $expectedVersion
    label = ${psString(candidate.label)}
    build_id = $expectedBuild
    channel = "rc"
    source_commit = ${psString(candidate.source?.commit || "")}
    manifest_sha256 = $candidateManifestSha
    artifact_set_sha256 = ${psString(candidate.build_provenance?.artifact_set_sha256 || "")}
    public_deploy_allowed = $false
  }
  machine = [ordered]@{
    cpu = [string]$recipe.machine_evidence.cpu
    ram_gb = [double]$ram
    gpu = [string]$recipe.machine_evidence.gpu
    vram_gb = [double]$recipe.machine_evidence.vram_gb
    os = [string]$recipe.machine_evidence.os
    anchor_sha256 = $machineAnchorSha
    fingerprint_sha256 = $machineFingerprint
  }
  benchmark = $recipe.benchmark_evidence
  shared_report = [ordered]@{
    url = $share
    http_status = [int]$response.StatusCode
    gpu_identity_matched = $true
    body_sha256 = $reportBodySha
  }
  source_recipe = [ordered]@{
    name = "RECETTE-SOURCE.json"
    sha256 = $recipeSha
  }
  validator = [ordered]@{
    schema = "outilsia.local_cockpit_rc_smoke_validator.v1"
    network_rechecked = $true
  }
  full_terrain_gate_complete = $false
  note = "Smoke RC valide. PromptForge, Dialogue, Arena et les cinq profils restent dans la recette terrain complete."
}
$stamp = [DateTimeOffset]::UtcNow.ToString("yyyyMMddHHmmss")
$safeComputer = ($env:COMPUTERNAME -replace "[^A-Za-z0-9_-]", "_")
$resultPath = Join-Path (Join-Path $root "results") "RC-SMOKE-$safeComputer-$stamp.json"
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $resultPath -Encoding UTF8
Set-Content -LiteralPath (Join-Path $root "LAST-RC-SMOKE.txt") -Value $resultPath -Encoding UTF8
Write-Host "RC_SMOKE_VALID" -ForegroundColor Green
Write-Host "Machine: $($recipe.machine_evidence.gpu) / $($recipe.machine_evidence.cpu)" -ForegroundColor Green
Write-Host "Benchmark: $($recipe.benchmark_evidence.model) - $tps tok/s - $elapsed ms" -ForegroundColor Green
Write-Host "Rapport: $share" -ForegroundColor Green
Write-Host "Resultat: $resultPath" -ForegroundColor Cyan
`);

  write(join(output, "02-VALIDER-LE-TEST.cmd"), `@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Valider-test-express.ps1"
if errorlevel 1 (
  echo.
  echo Retournez dans l'app et completez seulement l'etape signalee.
  pause
  exit /b 1
)
echo.
echo Test express RC valide.
pause
`, "ascii");

  write(join(output, "03-EXPORTER-LE-RESULTAT.cmd"), `@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='%~dp0'; $last=Join-Path $root 'LAST-RC-SMOKE.txt'; if(!(Test-Path $last)){Write-Host 'Lancez 02-VALIDER-LE-TEST.cmd avant export.' -ForegroundColor Red; exit 1}; $result=(Get-Content $last -Raw).Trim(); if(!(Test-Path $result)){Write-Host 'Resultat RC introuvable.' -ForegroundColor Red; exit 1}; $recipe=Join-Path $root 'RECETTE-SOURCE.json'; if(!(Test-Path $recipe)){Write-Host 'Recette source introuvable.' -ForegroundColor Red; exit 1}; $downloads=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'; $stamp=[DateTimeOffset]::UtcNow.ToString('yyyyMMddHHmmss'); $zip=Join-Path $downloads ('OutilsIA-RC-Smoke-${candidate.build_id}-' + $env:COMPUTERNAME + '-' + $stamp + '.zip'); Compress-Archive -LiteralPath @($result,$recipe,(Join-Path $root 'release-candidate.json'),(Join-Path $root 'SHA256SUMS.txt'),(Join-Path $root 'RC-KIT-MANIFEST.json')) -DestinationPath $zip -Force; Write-Host ('RC_SMOKE_EXPORTED ' + $zip) -ForegroundColor Green"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
echo.
pause
`, "ascii");

  const steps = [
    ["1", "Vérifier et lancer", "Double-cliquez 01-LANCER-LE-RC.cmd. Les SHA256 sont contrôlés avant l'ouverture."],
    ["2", "Analyser ce PC", "Dans l'app, cliquez Analyser ce PC. Vérifiez CPU, RAM, GPU, VRAM et runtime."],
    ["3", "Préparer le modèle léger", "Suivez l'action principale jusqu'à ce qu'Ollama et qwen3:0.6b soient prêts."],
    ["4", "Mesurer et partager", "Lancez le benchmark, générez le rapport, partagez-le puis cliquez Télécharger recette."],
    ["5", "Valider la preuve", "Double-cliquez 02-VALIDER-LE-TEST.cmd, puis 03-EXPORTER-LE-RESULTAT.cmd."],
  ];
  write(join(output, "START-HERE.html"), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>OutilsIA Local Cockpit ${html(candidate.label)} - Test express</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f3f5f7;color:#17202a;font-family:Arial,sans-serif}
    header{background:#111820;color:#fff;border-bottom:5px solid #e53935;padding:26px 20px}
    header div,main{max-width:920px;margin:auto}h1{font-size:32px;margin:6px 0 8px;letter-spacing:0}
    .meta{color:#c9d3dc;font-family:Consolas,monospace}.status{display:inline-block;background:#fff;color:#a31515;border-radius:4px;padding:5px 9px;font-weight:700}
    main{padding:24px 18px 50px}.intro{font-size:18px;line-height:1.55;margin:0 0 20px}
    .steps{display:grid;gap:12px}.step{background:#fff;border:1px solid #d8dee5;border-left:5px solid #156f55;border-radius:6px;padding:16px;display:grid;grid-template-columns:48px 1fr;gap:14px}
    .num{width:42px;height:42px;border-radius:50%;background:#17202a;color:#fff;display:grid;place-items:center;font-size:20px;font-weight:700}
    h2{font-size:19px;margin:0 0 6px;letter-spacing:0}.step p{margin:0;line-height:1.45;color:#46515c}
    .rule{margin-top:20px;background:#fff7e6;border:1px solid #e6bd68;border-radius:6px;padding:16px;line-height:1.5}
    code{font-family:Consolas,monospace;background:#edf1f4;padding:2px 5px;border-radius:3px}
    @media(max-width:600px){h1{font-size:25px}.step{grid-template-columns:40px 1fr;padding:13px}.num{width:36px;height:36px}}
  </style>
</head>
<body>
  <header><div>
    <span class="status">CANDIDAT PRIVÉ · NON PUBLIÉ</span>
    <h1>OutilsIA Local Cockpit ${html(candidate.label)}</h1>
    <div class="meta">build ${html(candidate.build_id)} · canal rc · ${windowsFiles.length} artefact(s) Windows</div>
    <div class="meta">${html(signingLabel)}</div>
  </div></header>
  <main>
    <p class="intro">Ce parcours vérifie le cœur du produit sur une vraie machine en cinq étapes. Il produit une preuve réseau et chiffrée sans imposer toute la recette longue.</p>
    <div class="steps">
      ${steps.map(([number, title, text]) => `<section class="step"><span class="num">${number}</span><div><h2>${html(title)}</h2><p>${html(text)}</p></div></section>`).join("\n")}
    </div>
    <div class="rule"><strong>Frontière de preuve.</strong> Un résultat <code>RC_SMOKE_VALID</code> valide ce candidat sur une machine. Il ne remplace pas les cinq fiches terrain complètes, qui gardent PromptForge, Dialogue, Arena, deuxième modèle et contrôles anti-fraude.</div>
  </main>
</body>
</html>`);

  write(join(output, "README.md"), `# OutilsIA Local Cockpit ${candidate.label}

- Build : \`${candidate.build_id}\`
- Canal embarqué : \`rc\`
- Publication publique : interdite par le manifeste
- Release publique actuelle : inchangée
- Authenticode Windows : \`${signingStatus}\`

Ouvrir \`START-HERE.html\`, puis suivre \`01\` → \`02\` → \`03\`.

Le test express exige :

1. scan matériel ;
2. Ollama prêt ;
3. qwen3:0.6b prêt ;
4. benchmark réel avec tok/s et durée ;
5. rapport OutilsIA partagé et joignable.

PromptForge, Dialogue, Arena et le deuxième modèle restent optionnels pour ce smoke RC, mais obligatoires dans la validation terrain finale.
`);
  write(join(output, "CAMPAGNE-5-MACHINES.md"), `# Campagne terrain OutilsIA Local Cockpit ${candidate.label}

Toutes les machines doivent utiliser ce même candidat :

- version : \`${candidate.version}\`
- build : \`${candidate.build_id}\`
- commit : \`${candidate.source?.commit || ""}\`
- canal : \`rc\`

| Ordre | Machine réelle | Profil terrain complet | But |
|---:|---|---|---|
| 1 | Tour Core i7 + GTX 1080 Ti 11 Go | \`core_i7_gtx_1080_ti\` | Vérifier Pascal, pilote, runtime, offload et modèle léger. |
| 2 | Deuxième Core i7 / vieux portable | \`old_laptop\` | Vérifier le parcours débutant et la recommandation prudente. |
| 3 | Machine sans GPU dédié utilisé | \`cpu_only\` | Prouver une exécution CPU via Ollama, pas seulement une VRAM à zéro. |
| 4 | RTX 3060 12 Go | \`rtx_3060_12gb\` | Valider le palier grand public 12 Go. |
| 5 | RTX 4080 ou RTX 4090 | \`rtx_4080_4090\` | Valider le haut de gamme et les modèles plus ambitieux. |

## Règles

1. Produire un rapport partagé différent sur chaque machine.
2. Ne jamais recopier ou éditer une fiche pour simuler un autre PC.
3. Garder la recette source, le résultat smoke, le manifeste RC et les SHA dans chaque ZIP exporté.
4. Les deux premiers PC suffisent au seuil de promotion bêta RC, après décision humaine explicite.
5. Seules les cinq fiches longues valident la campagne terrain complète.
6. Un statut Authenticode \`${signingStatus}\` doit rester présenté tel quel ; \`not_signed\` ou \`unverified\` ne signifie jamais « signé ».
`);
  write(join(output, "EXPECTED-APP-VERSION.txt"), candidate.version);
  write(join(output, "EXPECTED-BUILD-ID.txt"), candidate.build_id);
  write(join(output, "EXPECTED-CHANNEL.txt"), "rc");
  write(join(output, "RC-KIT-MANIFEST.json"), JSON.stringify({
    schema: "outilsia.local_cockpit_rc_kit.v1",
    created_at: new Date().toISOString(),
    candidate: {
      version: candidate.version,
      label: candidate.label,
      build_id: candidate.build_id,
      source_commit: candidate.source?.commit || "",
      manifest_sha256: candidateManifestSha,
      artifact_set_sha256: candidate.build_provenance?.artifact_set_sha256 || "",
    },
    public_deploy_allowed: false,
    code_signing: candidate.code_signing,
    windows_files: windowsFiles.map((file) => ({ name: file.name, sha256: file.sha256, kind: file.kind })),
    smoke_validator: "02-VALIDER-LE-TEST.cmd",
    smoke_export_directory: "Downloads",
    smoke_import_command: "npm run import:rc-smoke -- --candidate-dir <candidat-fusionne> --input <zip>",
    campaign_order: [
      "core_i7_gtx_1080_ti",
      "old_laptop",
      "cpu_only",
      "rtx_3060_12gb",
      "rtx_4080_4090",
    ],
    first_promotion_checkpoint_after_unique_machines: 2,
    full_terrain_gate_unchanged: true,
  }, null, 2));
  console.log(`release_candidate_kit=${output}`);
  console.log(`start=${join(output, "START-HERE.html")}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
