param(
  [string]$DesktopFolder = "OutilsIA-Local-Cockpit-Test-Kit",
  [string]$ArtifactFolder = "OutilsIA-Local-Cockpit-Beta-Windows"
)

$ErrorActionPreference = "Stop"

function Require-File($Path) {
  if (-not (Test-Path $Path -PathType Leaf)) {
    throw "Missing file: $Path"
  }
  return (Resolve-Path $Path).Path
}

function Hash-Lower($Path) {
  return (Get-FileHash -Algorithm SHA256 $Path).Hash.ToLower()
}

$desktop = [Environment]::GetFolderPath("Desktop")
$artifactDir = Join-Path $desktop $ArtifactFolder
$kitDir = Join-Path $desktop $DesktopFolder
$appRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$tauriConfig = Get-Content (Join-Path $appRoot "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = $tauriConfig.version
if (-not $version) {
  throw "Version missing in src-tauri\tauri.conf.json"
}

$directExe = Require-File (Join-Path $artifactDir "outilsia-local-cockpit.exe")
$setupFileName = "OutilsIA Local Cockpit_${version}_x64-setup.exe"
$msiFileName = "OutilsIA Local Cockpit_${version}_x64_en-US.msi"
$setupExe = Require-File (Join-Path $artifactDir $setupFileName)
$msiPath = Join-Path $artifactDir $msiFileName
$msi = if (Test-Path $msiPath -PathType Leaf) { (Resolve-Path $msiPath).Path } else { "" }

$running = Get-Process -Name "outilsia-local-cockpit" -ErrorAction SilentlyContinue
if ($running) {
  $running | Stop-Process -Force
  foreach ($proc in $running) {
    try { Wait-Process -Id $proc.Id -Timeout 10 -ErrorAction SilentlyContinue } catch {}
  }
  Start-Sleep -Milliseconds 500
}

New-Item -ItemType Directory -Force -Path $kitDir | Out-Null
Remove-Item (Join-Path $kitDir "outilsia-local-cockpit.exe") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $kitDir "OutilsIA Local Cockpit_*_x64-setup.exe") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $kitDir "OutilsIA Local Cockpit_*_x64_en-US.msi") -Force -ErrorAction SilentlyContinue
Copy-Item $directExe $kitDir -Force
Copy-Item $setupExe $kitDir -Force
if ($msi) {
  Copy-Item $msi $kitDir -Force
}

$kitDirectExe = Join-Path $kitDir "outilsia-local-cockpit.exe"
$kitSetupExe = Join-Path $kitDir $setupFileName
$kitMsi = Join-Path $kitDir $msiFileName

$directHash = Hash-Lower $kitDirectExe
$setupHash = Hash-Lower $kitSetupExe
$msiHash = if (Test-Path $kitMsi -PathType Leaf) { Hash-Lower $kitMsi } else { "" }
$releaseFeedUrl = "https://outilsia.fr/static/downloads/local-cockpit/release.json"
$releaseManifestPath = Join-Path (Resolve-Path (Join-Path $appRoot "..")) "server-work\static\downloads\local-cockpit\release.json"
$releaseBuildId = ""
$releaseFileName = ""
$releaseFileSha = ""
$releaseFreshnessOk = $false
if (Test-Path $releaseManifestPath -PathType Leaf) {
  $releaseManifest = Get-Content $releaseManifestPath -Raw | ConvertFrom-Json
  $releaseBuildId = [string]$releaseManifest.build_id
  $primaryDownload = $releaseManifest.primary_download
  if (-not $primaryDownload -and $releaseManifest.files -and $releaseManifest.files.Count -gt 0) {
    $primaryDownload = $releaseManifest.files[0]
  }
  if ($primaryDownload) {
    $releaseFileName = [string]$primaryDownload.name
    $releaseFileSha = [string]$primaryDownload.sha256
  }
  $releaseFreshnessOk = -not [bool]$releaseManifest.freshness.stale
}
$msiHashLine = if ($msiHash) { "- msi: $msiHash" } else { "- msi: non genere pour cette beta" }

$readme = @(
  "# OutilsIA Local Cockpit - Kit test beta Windows",
  "",
  "Ce dossier sert au test manuel de la beta Windows.",
  "",
  "## Lancer l'app",
  "",
  "Double-cliquez :",
  "",
  "- 01-verifier-et-lancer.cmd",
  "- Lancer OutilsIA Local Cockpit.lnk",
  "",
  "ou directement :",
  "",
  "- outilsia-local-cockpit.exe",
  "",
  "## Parcours a tester",
  "",
  "1. Cliquer Auto-test.",
  "2. Cliquer Scanner ce PC.",
  "3. Cliquer Preparer mon IA locale.",
  "4. Installer Ollama si l'app le demande, puis relancer le scan.",
  "5. Installer qwen3:0.6b si l'app le demande.",
  "6. Lancer le benchmark qwen3:0.6b.",
  "7. Verifier que PromptForge optimise le prompt.",
  "8. Verifier que Dialogue local renvoie une reponse.",
  "9. Installer ou benchmarker le deuxieme modele recommande.",
  "10. Lancer Arena si au moins deux modeles sont disponibles.",
  "11. Generer le Rapport machine prete.",
  "12. Copier le resume et le rapport complet.",
  "13. Sauver le rapport dans le compte, puis creer un rapport partageable.",
  "14. Generer MemoryForge / Obsidian.",
  "15. Envoyer un feedback beta si une detection est fausse.",
  "",
  "## Hashes locaux",
  "",
  "- exe direct: $directHash",
  "- setup exe: $setupHash",
  $msiHashLine,
  "",
  "## Verification",
  "",
  "Lancez :",
  "",
  "01-verifier-et-lancer.cmd",
  "",
  "ou :",
  "",
  "powershell -ExecutionPolicy Bypass -File .\Verifier-et-lancer.ps1",
  "",
  "Le script verifie les hashes locaux, compare le setup avec la release publique OutilsIA, puis lance l'app.",
  "",
  "## Apres le test",
  "",
  "1. Dans l'app, cliquer `Telecharger recette` si le rapport machine prete est complet.",
  "2. Double-cliquez 03-importer-recette.cmd : il prend automatiquement le dernier RECETTE-RESULTAT*.json dans Telechargements.",
  "3. Si la recette est incomplete, double-cliquez 04-verifier-recette.cmd pour voir exactement les champs manquants.",
  "4. Double-cliquez 02-ouvrir-recette.cmd, corrigez les champs ou regenerez la recette depuis l'app, puis relancez 03-importer-recette.cmd.",
  "5. Le script lance aussi `npm run verify:beta:goal` dans le projet et ouvre le rapport `windows-native-recipe.md` si tout passe.",
  "",
  "Feuille de recette :",
  "",
  "- RECETTE-MANUELLE.md",
  "- RECETTE-RESULTAT.json",
  "",
  "Page publique :",
  "",
  "https://outilsia.fr/telecharger-scanner-ia-local"
) -join [Environment]::NewLine

Set-Content -Path (Join-Path $kitDir "README-Test-Beta.md") -Value $readme -Encoding UTF8

$manualChecklist = @(
  "# Recette manuelle OutilsIA Local Cockpit beta Windows",
  "",
  "Date : ____________________",
  "Machine : ____________________",
  "",
  "## Prevol",
  "",
  "- [ ] Lancer `Verifier-et-lancer.ps1` sans erreur.",
  "- [ ] Verifier que le script affiche `public_release_match_ok`.",
  "- [ ] Verifier que la fenetre `OutilsIA Local Cockpit` s'ouvre.",
  "",
  "## Parcours app coeur produit",
  "",
  "- [ ] Cliquer `Auto-test` : tous les checks critiques passent.",
  "- [ ] Cliquer `Scanner ce PC` : CPU/RAM/GPU/VRAM/stockage s'affichent.",
  "- [ ] Cliquer `Preparer mon IA locale` : la console haute affiche les etapes sans devoir scroller.",
  "- [ ] Si Ollama manque, cliquer `Installer Ollama`, relancer l'app puis refaire le scan.",
  "- [ ] Installer `qwen3:0.6b` depuis l'app si le modele test manque.",
  "- [ ] Lancer le benchmark `qwen3:0.6b` : temps de reponse, tok/s et extrait lisible s'affichent.",
  "- [ ] Verifier que PromptForge propose un prompt optimise et qu'il peut etre envoye vers Benchmark et Dialogue.",
  "- [ ] Verifier que `Dialogue local` interroge le modele depuis l'app.",
  "- [ ] Verifier que l'Assistant local affiche `Deuxieme modele recommande`.",
  "- [ ] Installer ou benchmarker le deuxieme modele recommande selon l'etat affiche.",
  "- [ ] Lancer `Arena locale` si deux modeles sont disponibles : recommande, plus rapide, plus reactif et score s'affichent.",
  "- [ ] Verifier que `Rapport machine prete` contient score, preuve benchmark, PromptForge, Arena, upgrade utile et prochaines actions.",
  "- [ ] Cliquer `Copier resume` puis coller le resume dans un editeur.",
  "- [ ] Cliquer `Copier rapport` puis verifier le markdown complet.",
  "",
  "## Compte, partage et exports",
  "",
  "- [ ] Verifier que `Pack decision` resume score, modele prioritaire, upgrade prioritaire et contexte machine.",
  "- [ ] Cliquer `Copier pack` : le markdown est copie dans le presse-papiers.",
  "- [ ] Cliquer `Sauver pack local` : le pack arrive dans MemoryForge et l'historique local est mis a jour.",
  "- [ ] Verifier qu'un upgrade affiche si applicable prix indicatif, guide, prix du jour et piege a eviter.",
  "- [ ] Cliquer `Connecter le compte` : le navigateur ouvre le pairing.",
  "- [ ] Autoriser le code dans le navigateur.",
  "- [ ] Revenir dans l'app et cliquer `Verifier le pairing`.",
  "- [ ] Cliquer `Synchroniser le PC` : machine sauvegardee dans le compte.",
  "- [ ] Depuis `Rapport machine prete`, cliquer `Sauver compte`, puis `Partager`.",
  "- [ ] Ouvrir l'URL du rapport partageable.",
  "- [ ] Generer MemoryForge local : verifier upgrades/prix/guides si presents.",
  "- [ ] Exporter Obsidian : verifier 04-Achats-guides.md.",
  "- [ ] Envoyer un feedback beta test.",
  "",
  "## Resultat",
  "",
  "- [ ] OK beta diffusable",
  "- [ ] KO a corriger",
  "",
  "Notes :",
  ""
) -join [Environment]::NewLine

Set-Content -Path (Join-Path $kitDir "RECETTE-MANUELLE.md") -Value $manualChecklist -Encoding UTF8

$recipeResult = @"
{
  "ok": false,
  "tested_at": "",
  "tester": "",
  "machine": "",
  "app_version": "$version",
  "platform": "windows-x64",
  "build_id": "$releaseBuildId",
  "release_freshness_ok": $($releaseFreshnessOk.ToString().ToLower()),
  "native_flow": {
    "scan": false,
    "ollama_install_or_ready": false,
    "qwen_install_or_ready": false,
    "qwen_benchmark": false,
    "promptforge": false,
    "dialogue": false,
    "arena": false,
    "readiness_report": false
  },
  "second_model": {
    "ref": "",
    "installed": false,
    "benchmarked": false,
    "tokens_per_second": null
  },
  "report": {
    "has_score": false,
    "has_best_model": false,
    "has_speed": false,
    "has_prompt": false,
    "has_upgrade": false,
    "has_next_actions": false,
    "copied": false,
    "saved_account": false,
    "shared": false,
    "share_url": ""
  },
  "public_release": {
    "name": "$releaseFileName",
    "sha256": "$releaseFileSha",
    "url": "https://outilsia.fr/static/downloads/local-cockpit/release.json"
  },
  "notes": ""
}
"@

Set-Content -Path (Join-Path $kitDir "RECETTE-RESULTAT.json") -Value $recipeResult -Encoding UTF8

$verifyScript = @"
`$ErrorActionPreference = "Stop"
`$root = Split-Path -Parent `$MyInvocation.MyCommand.Path
`$releaseFeedUrl = "$releaseFeedUrl"
`$files = @(
  @{Name="outilsia-local-cockpit.exe"; Hash="$directHash"},
  @{Name="$setupFileName"; Hash="$setupHash"}
)
if ("$msiHash") { `$files += @{Name="$msiFileName"; Hash="$msiHash"} }
foreach (`$item in `$files) {
  `$path = Join-Path `$root `$item.Name
  if (!(Test-Path `$path)) { throw "Fichier manquant: `$(`$item.Name)" }
  `$actual = (Get-FileHash -Algorithm SHA256 `$path).Hash.ToLower()
  if (`$actual -ne `$item.Hash) { throw "SHA256 different pour `$(`$item.Name): `$actual" }
  Write-Host "OK `$(`$item.Name) `$actual" -ForegroundColor Green
}
`$release = Invoke-RestMethod -Uri `$releaseFeedUrl -Headers @{"Cache-Control"="no-cache"} -TimeoutSec 30
if (-not `$release.ok) { throw "Release publique invalide: `$releaseFeedUrl" }
if (-not `$release.freshness) { throw "Release publique sans preuve de fraicheur: `$releaseFeedUrl" }
if (`$release.freshness.stale -ne `$false) { throw "Release publique perimee: freshness.stale doit etre false" }
if (`$release.freshness.allow_stale -eq `$true) { throw "Release publique construite avec override stale interdit" }
if (-not `$release.freshness.newest_source_mtime_ms -or -not `$release.freshness.oldest_artifact_mtime_ms) { throw "Release publique sans timestamps de fraicheur" }
if ([int64]`$release.freshness.oldest_artifact_mtime_ms -lt [int64]`$release.freshness.newest_source_mtime_ms) { throw "Artefact public plus ancien que les sources" }
`$setupPublic = `$release.files | Where-Object { `$_.original_name -eq "$setupFileName" } | Select-Object -First 1
if (-not `$setupPublic) { throw "Setup Windows absent de release.json" }
if (`$setupPublic.sha256 -ne "$setupHash") { throw "Setup local different de la release publique: local $setupHash public `$(`$setupPublic.sha256)" }
Write-Host "public_release_match_ok `$(`$release.build_id) `$(`$setupPublic.name)" -ForegroundColor Green
Write-Host "public_release_freshness_ok source=`$(`$release.freshness.newest_source) artifact=`$(`$release.freshness.oldest_artifact)" -ForegroundColor Green
`$recipePath = Join-Path `$root "RECETTE-RESULTAT.json"
if (Test-Path `$recipePath) {
  `$recipe = Get-Content -Raw `$recipePath | ConvertFrom-Json
  `$recipe.app_version = "$version"
  `$recipe.build_id = `$release.build_id
  `$recipe.release_freshness_ok = `$true
  `$recipe.public_release.name = `$setupPublic.name
  `$recipe.public_release.sha256 = `$setupPublic.sha256
  `$recipe.public_release.url = "$releaseFeedUrl"
  `$recipe | ConvertTo-Json -Depth 8 | Set-Content -Path `$recipePath -Encoding UTF8
  Write-Host "recipe_prefilled `$recipePath" -ForegroundColor Green
}
`$exe = Join-Path `$root "outilsia-local-cockpit.exe"
Start-Process -FilePath `$exe
Write-Host "windows_test_kit_ok `$root" -ForegroundColor Green
"@

Set-Content -Path (Join-Path $kitDir "Verifier-et-lancer.ps1") -Value $verifyScript -Encoding UTF8

$launchCmd = @"
@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Verifier-et-lancer.ps1"
if errorlevel 1 (
  echo.
  echo Verification echouee. Lisez le message ci-dessus.
  pause
  exit /b 1
)
echo.
echo Verification OK. L'application est lancee.
pause
"@

Set-Content -Path (Join-Path $kitDir "01-verifier-et-lancer.cmd") -Value $launchCmd -Encoding ASCII

$openRecipeCmd = @"
@echo off
setlocal
cd /d "%~dp0"
if not exist "RECETTE-RESULTAT.json" (
  echo RECETTE-RESULTAT.json introuvable.
  pause
  exit /b 1
)
start notepad "%~dp0RECETTE-RESULTAT.json"
"@

Set-Content -Path (Join-Path $kitDir "02-ouvrir-recette.cmd") -Value $openRecipeCmd -Encoding ASCII

$importRecipeCmd = @"
@echo off
setlocal
set "KIT_DIR=%~dp0"
set "RECIPE_PATH=%KIT_DIR%RECETTE-RESULTAT.json"
powershell -NoProfile -ExecutionPolicy Bypass -Command "`$kit='%~dp0'; `$download=Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'; `$candidate=Get-ChildItem -Path `$download -Filter 'RECETTE-RESULTAT*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if (`$candidate) { Copy-Item `$candidate.FullName (Join-Path `$kit 'RECETTE-RESULTAT.json') -Force; Write-Host ('recette_depuis_telechargements ' + `$candidate.FullName) } else { Write-Host 'aucune_recette_telechargee_recette_kit_utilisee' }"
cd /d "$appRoot"
npm run import:windows:recipe -- --input "%RECIPE_PATH%"
if errorlevel 1 (
  echo.
  echo Import refuse. Completez RECETTE-RESULTAT.json puis relancez ce script.
  pause
  exit /b 1
)
npm run verify:beta:goal
if errorlevel 1 (
  echo.
  echo Audit encore incomplet. Lisez les lignes todo ci-dessus.
  pause
  exit /b 1
)
echo.
echo Goal beta valide par la recette Windows.
if exist "$appRoot\.artifacts\windows-native-recipe.md" (
  start notepad "$appRoot\.artifacts\windows-native-recipe.md"
)
pause
"@

Set-Content -Path (Join-Path $kitDir "03-importer-recette.cmd") -Value $importRecipeCmd -Encoding ASCII

$checkRecipeScript = @"
`$ErrorActionPreference = "Stop"
`$root = Split-Path -Parent `$MyInvocation.MyCommand.Path
`$recipePath = Join-Path `$root "RECETTE-RESULTAT.json"
if (!(Test-Path `$recipePath)) {
  throw "RECETTE-RESULTAT.json introuvable dans `$root"
}
`$recipe = Get-Content -Raw `$recipePath | ConvertFrom-Json
`$missing = New-Object System.Collections.Generic.List[string]
function Require-True([string]`$Path) {
  `$value = `$recipe
  foreach (`$part in `$Path.Split(".")) { `$value = `$value.`$part }
  if (`$value -ne `$true) { `$missing.Add(`$Path) }
}
function Require-Text([string]`$Path) {
  `$value = `$recipe
  foreach (`$part in `$Path.Split(".")) { `$value = `$value.`$part }
  if ([string]::IsNullOrWhiteSpace([string]`$value)) { `$missing.Add(`$Path) }
}
Require-True "ok"
Require-Text "build_id"
Require-True "release_freshness_ok"
foreach (`$field in @(
  "native_flow.scan",
  "native_flow.ollama_install_or_ready",
  "native_flow.qwen_install_or_ready",
  "native_flow.qwen_benchmark",
  "native_flow.promptforge",
  "native_flow.dialogue",
  "native_flow.arena",
  "native_flow.readiness_report",
  "report.has_score",
  "report.has_best_model",
  "report.has_speed",
  "report.has_prompt",
  "report.has_upgrade",
  "report.has_next_actions",
  "report.copied",
  "report.saved_account",
  "report.shared"
)) { Require-True `$field }
Require-Text "second_model.ref"
if (`$recipe.second_model.installed -ne `$true -and `$recipe.second_model.benchmarked -ne `$true) {
  `$missing.Add("second_model.installed ou second_model.benchmarked")
}
Require-Text "report.share_url"
Require-Text "public_release.name"
Require-Text "public_release.sha256"
if (`$missing.Count -gt 0) {
  Write-Host "recette_incomplete `$(`$missing.Count) champ(s) manquant(s)" -ForegroundColor Yellow
  foreach (`$item in `$missing) { Write-Host "- `$item" -ForegroundColor Yellow }
  Write-Host ""
  Write-Host "Action: dans l'app, terminer le parcours puis cliquer Telecharger recette. Ensuite relancer 03-importer-recette.cmd." -ForegroundColor Cyan
  exit 1
}
Write-Host "recette_complete `$recipePath" -ForegroundColor Green
Write-Host "build_id=`$(`$recipe.build_id) second_model=`$(`$recipe.second_model.ref) share=`$(`$recipe.report.share_url)" -ForegroundColor Green
"@

Set-Content -Path (Join-Path $kitDir "Verifier-recette.ps1") -Value $checkRecipeScript -Encoding UTF8

$checkRecipeCmd = @"
@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Verifier-recette.ps1"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
echo.
pause
"@

Set-Content -Path (Join-Path $kitDir "04-verifier-recette.cmd") -Value $checkRecipeCmd -Encoding ASCII

$shortcutPath = Join-Path $kitDir "Lancer OutilsIA Local Cockpit.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $kitDirectExe
$shortcut.WorkingDirectory = $kitDir
$shortcut.Description = "Lancer OutilsIA Local Cockpit beta"
$shortcut.Save()

Write-Host "windows_test_kit_created $kitDir" -ForegroundColor Green
Get-ChildItem $kitDir | Select-Object Name,Length | Format-Table -AutoSize
