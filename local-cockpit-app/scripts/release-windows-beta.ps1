param(
  [switch]$SkipInstall,
  [switch]$LaunchSmoke,
  [string]$DesktopFolder = "OutilsIA-Local-Cockpit-Beta-Windows",
  [string]$TestKitFolder = "OutilsIA-Local-Cockpit-Test-Kit"
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host ""
  Write-Host "== $Message" -ForegroundColor Cyan
}

function Invoke-Checked($FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
  }
}

function Require-Npm {
  $cmd = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  $cmd = Get-Command "npm" -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Missing npm/npm.cmd. Install Node.js or add a portable Node directory to PATH."
  }
  return $cmd.Source
}

$appRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $appRoot
$npm = Require-Npm

if ([string]::IsNullOrWhiteSpace($env:OUTILSIA_BUILD_ID)) {
  $env:OUTILSIA_BUILD_ID = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
}
if ([string]::IsNullOrWhiteSpace($env:GITHUB_SHA)) {
  $git = Get-Command "git" -ErrorAction SilentlyContinue
  if ($git) {
    $env:GITHUB_SHA = (& $git.Source rev-parse HEAD).Trim()
  }
}
Write-Host "Embedded build id: $env:OUTILSIA_BUILD_ID"

Write-Step "Preflight statique"
if (-not $SkipInstall) {
  Invoke-Checked $npm @("install")
}
Invoke-Checked $npm @("run", "verify:ui")
Invoke-Checked $npm @("run", "preflight:beta")

Write-Step "Build Windows natif"
$buildArgs = @("-ExecutionPolicy", "Bypass", "-File", "scripts\build-windows-beta.ps1", "-DesktopFolder", $DesktopFolder)
if ($SkipInstall) { $buildArgs += "-SkipInstall" }
Invoke-Checked "powershell" $buildArgs

Write-Step "Packaging release publique locale"
Invoke-Checked $npm @("run", "package:beta")
Invoke-Checked $npm @("run", "verify:release:contract", "--", "--require-platform", "windows-x64", "--require-freshness")

Write-Step "Verification artefacts Windows"
$verifyArgs = @("-ExecutionPolicy", "Bypass", "-File", "scripts\verify-windows-artifacts.ps1")
if ($LaunchSmoke) { $verifyArgs += "-LaunchSmoke" }
Invoke-Checked "powershell" $verifyArgs

Write-Step "Verification deploy dry-run"
Invoke-Checked $npm @("run", "deploy:beta", "--", "--require-freshness")

Write-Step "Kit de recette bureau"
Invoke-Checked "powershell" @(
  "-ExecutionPolicy", "Bypass",
  "-File", "scripts\make-windows-test-kit.ps1",
  "-DesktopFolder", $TestKitFolder,
  "-ArtifactFolder", $DesktopFolder
)

Write-Host ""
Write-Host "windows_beta_release_ready $DesktopFolder $TestKitFolder" -ForegroundColor Green
Write-Host "Prochaine etape: tester le parcours natif scan -> Ollama -> qwen3:0.6b -> benchmark -> PromptForge -> dialogue -> Arena -> rapport." -ForegroundColor Green
Write-Host "Apres recette, remplir RECETTE-RESULTAT.json puis lancer:" -ForegroundColor Green
Write-Host "npm run import:windows:recipe -- --input `"$desktop\$TestKitFolder\RECETTE-RESULTAT.json`"" -ForegroundColor Green
Write-Host "npm run verify:beta:goal" -ForegroundColor Green
Write-Host "L'import cree local-cockpit-app\.artifacts\windows-native-recipe.json, preuve attendue par l'audit final." -ForegroundColor Green
Write-Host "Il cree aussi local-cockpit-app\.artifacts\windows-native-recipe.md, rapport lisible de la recette." -ForegroundColor Green
