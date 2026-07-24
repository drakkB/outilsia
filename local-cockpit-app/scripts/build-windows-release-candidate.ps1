param(
  [int]$RcNumber = 1,
  [string]$BuildId = "",
  [string]$ArtifactFolder = "OutilsIA-Local-Cockpit-RC-Windows",
  [string]$CandidateDir = "",
  [string]$KitDir = "",
  [switch]$SkipInstall,
  [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"

function Invoke-Checked([string]$FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
  }
}

$appRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$repoRoot = Resolve-Path (Join-Path $appRoot "..")
$desktop = [Environment]::GetFolderPath("Desktop")
$tauri = Get-Content (Join-Path $appRoot "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = [string]$tauri.version
if (!$version) { throw "Version missing in tauri.conf.json" }
if ($RcNumber -lt 1) { throw "RcNumber must be >= 1" }
if (!$BuildId) { $BuildId = [DateTimeOffset]::UtcNow.ToString("yyyyMMddHHmmss") }
if ($BuildId -notmatch "^[0-9A-Za-z._-]{6,32}$") { throw "Invalid BuildId: $BuildId" }
if (!$CandidateDir) { $CandidateDir = Join-Path $appRoot ".artifacts\release-candidate-windows" }
if (!$KitDir) { $KitDir = Join-Path $desktop "_OutilsIA\OutilsIA-Local-Cockpit-$version-rc.$RcNumber-Test" }

$trackedDirty = (& git -C $repoRoot status --porcelain --untracked-files=no)
if ($trackedDirty -and !$AllowDirty) {
  throw "Tracked source tree is dirty. Commit the RC source or pass -AllowDirty for a disposable local build."
}
$sourceCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
$env:OUTILSIA_BUILD_ID = $BuildId
$env:OUTILSIA_RELEASE_CHANNEL = "rc"
$env:GITHUB_SHA = $sourceCommit
$env:OUTILSIA_RC_NUMBER = [string]$RcNumber

Write-Host "Building OutilsIA Local Cockpit $version-rc.$RcNumber build $BuildId" -ForegroundColor Cyan
$buildArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $PSScriptRoot "build-windows-beta.ps1"),
  "-DesktopFolder", $ArtifactFolder
)
if ($SkipInstall) { $buildArgs += "-SkipInstall" }
Invoke-Checked "powershell.exe" $buildArgs

$artifactDir = Join-Path $desktop $ArtifactFolder
$direct = Join-Path $artifactDir "outilsia-local-cockpit.exe"
$setup = Join-Path $artifactDir "OutilsIA Local Cockpit_${version}_x64-setup.exe"
$msi = Join-Path $artifactDir "OutilsIA Local Cockpit_${version}_x64_en-US.msi"
foreach ($path in @($direct, $setup)) {
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing RC artifact: $path" }
}

$packageArgs = @(
  (Join-Path $PSScriptRoot "package-release-candidate.mjs"),
  "--artifact", $direct,
  "--artifact", $setup,
  "--output-dir", $CandidateDir,
  "--rc", [string]$RcNumber,
  "--build-id", $BuildId,
  "--replace"
)
if (Test-Path -LiteralPath $msi -PathType Leaf) {
  $packageArgs += @("--artifact", $msi)
}
Invoke-Checked "node.exe" $packageArgs

$verifyArgs = @(
  (Join-Path $PSScriptRoot "verify-release-candidate.mjs"),
  "--input", $CandidateDir,
  "--require-platform", "windows-x64",
  "--require-freshness"
)
if (!$AllowDirty) { $verifyArgs += "--require-clean-source" }
Invoke-Checked "node.exe" $verifyArgs

Invoke-Checked "node.exe" @(
  (Join-Path $PSScriptRoot "make-release-candidate-kit.mjs"),
  "--candidate-dir", $CandidateDir,
  "--output-dir", $KitDir,
  "--replace"
)

$zip = "$KitDir.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path (Join-Path $KitDir "*") -DestinationPath $zip -CompressionLevel Optimal
$zipHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$zip.sha256.txt" -Value "$zipHash  $([System.IO.Path]::GetFileName($zip))" -Encoding ASCII

Write-Host "WINDOWS_RC_READY" -ForegroundColor Green
Write-Host "Candidate: $CandidateDir"
Write-Host "Kit: $KitDir"
Write-Host "Zip: $zip"
Write-Host "SHA256: $zipHash"
