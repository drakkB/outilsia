param(
  [string]$DesktopFolder = "OutilsIA-Local-Cockpit-Beta-Windows",
  [switch]$SkipInstall,
  [string]$SigningCertificateThumbprint = $env:OUTILSIA_WINDOWS_CERTIFICATE_THUMBPRINT,
  [string]$SigningTimestampUrl = $env:OUTILSIA_WINDOWS_TIMESTAMP_URL,
  [switch]$RequireSignedArtifacts
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host ""
  Write-Host "== $Message" -ForegroundColor Cyan
}

function Require-Command($Name, $Hint) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Missing command '$Name'. $Hint"
  }
  return $cmd.Source
}

function Require-Npm {
  $cmd = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  return Require-Command "npm" "Install Node.js/npm or add npm.cmd to PATH."
}

function Invoke-Checked($FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
  }
}

$appRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $appRoot
$tauriConfig = Get-Content (Join-Path $appRoot "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = $tauriConfig.version
if (-not $version) {
  throw "Version missing in src-tauri\tauri.conf.json"
}
$signingEnabled = -not [string]::IsNullOrWhiteSpace($SigningCertificateThumbprint)
if ($RequireSignedArtifacts -and -not $signingEnabled) {
  throw "Signed artifacts are required, but no certificate thumbprint was provided."
}
if ($signingEnabled -ne (-not [string]::IsNullOrWhiteSpace($SigningTimestampUrl))) {
  throw "SigningCertificateThumbprint and SigningTimestampUrl must be provided together."
}

Write-Step "Checking Windows build tools"
$node = Require-Command "node" "Install Node.js or add a portable Node directory to PATH."
$npm = Require-Npm
$cargo = Require-Command "cargo" "Install Rust from rustup.rs or add %USERPROFILE%\.cargo\bin to PATH."

Write-Host "node  $(& $node --version)"
Write-Host "npm   $(& $npm --version)"
Write-Host "cargo $(& $cargo --version)"

Write-Step "Installing npm dependencies"
if (-not $SkipInstall) {
  Invoke-Checked $npm @("install")
}

Write-Step "Stopping running beta app if needed"
Get-Process -Name "outilsia-local-cockpit" -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Step "Building Tauri Windows beta"
$releaseRoot = Join-Path $appRoot "src-tauri\target\release"
Remove-Item (Join-Path $releaseRoot "bundle\nsis\OutilsIA Local Cockpit_*_x64-setup.exe") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $releaseRoot "bundle\nsis\OutilsIA Local Cockpit_*_x86-setup.exe") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $releaseRoot "bundle\nsis\OutilsIA Local Cockpit_*_arm64-setup.exe") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $releaseRoot "bundle\msi\OutilsIA Local Cockpit_*_x64_en-US.msi") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $releaseRoot "bundle\msi\OutilsIA Local Cockpit_*_x86_en-US.msi") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $releaseRoot "bundle\msi\OutilsIA Local Cockpit_*_arm64_en-US.msi") -Force -ErrorAction SilentlyContinue
$tauriArgs = @("exec", "tauri", "build", "--", "--bundles", "nsis,msi")
$signingConfigPath = ""
if ($signingEnabled) {
  Write-Step "Checking Authenticode signer"
  $readiness = & (Join-Path $PSScriptRoot "test-windows-signing-readiness.ps1") `
    -CertificateThumbprint $SigningCertificateThumbprint `
    -TimestampUrl $SigningTimestampUrl
  Write-Host $readiness

  $normalizedThumbprint = ($SigningCertificateThumbprint -replace "[^0-9A-Fa-f]", "").ToUpperInvariant()
  $signingConfigPath = Join-Path ([System.IO.Path]::GetTempPath()) "outilsia-tauri-signing-$PID-$([guid]::NewGuid().ToString('N')).json"
  $signingConfig = [ordered]@{
    bundle = [ordered]@{
      windows = [ordered]@{
        certificateThumbprint = $normalizedThumbprint
        digestAlgorithm = "sha256"
        timestampUrl = $SigningTimestampUrl
      }
    }
  } | ConvertTo-Json -Depth 6
  [System.IO.File]::WriteAllText(
    $signingConfigPath,
    $signingConfig,
    (New-Object System.Text.UTF8Encoding($false))
  )
  $tauriArgs += @("--config", $signingConfigPath)
}

try {
  Invoke-Checked $npm $tauriArgs
} finally {
  if ($signingConfigPath -and (Test-Path -LiteralPath $signingConfigPath)) {
    Remove-Item -LiteralPath $signingConfigPath -Force
  }
}

$directExe = Join-Path $releaseRoot "outilsia-local-cockpit.exe"
$setupExe = Join-Path $releaseRoot "bundle\nsis\OutilsIA Local Cockpit_${version}_x64-setup.exe"
$msi = Join-Path $releaseRoot "bundle\msi\OutilsIA Local Cockpit_${version}_x64_en-US.msi"

foreach ($path in @($directExe, $setupExe, $msi)) {
  if (-not (Test-Path $path)) {
    throw "Expected build artifact not found: $path"
  }
}

Write-Step "Copying artifacts to Desktop"
$desktop = [Environment]::GetFolderPath("Desktop")
$outDir = Join-Path $desktop $DesktopFolder
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Remove-Item (Join-Path $outDir "outilsia-local-cockpit.exe") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $outDir "OutilsIA Local Cockpit_*_x64-setup.exe") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $outDir "OutilsIA Local Cockpit_*_x64_en-US.msi") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $outDir "WINDOWS-SIGNING-RECEIPT.json") -Force -ErrorAction SilentlyContinue
Copy-Item $directExe $outDir -Force
Copy-Item $setupExe $outDir -Force
Copy-Item $msi $outDir -Force

if ($signingEnabled) {
  Write-Step "Verifying signed Windows artifacts"
  $signedArtifacts = @(
    Get-ChildItem -LiteralPath $outDir -File |
      Where-Object { $_.Extension.ToLowerInvariant() -in @(".exe", ".msi") } |
      Select-Object -ExpandProperty FullName
  )
  $receipt = & (Join-Path $PSScriptRoot "verify-windows-signed-artifacts.ps1") `
    -ArtifactPath $signedArtifacts `
    -ExpectedCertificateThumbprint $SigningCertificateThumbprint
  [System.IO.File]::WriteAllText(
    (Join-Path $outDir "WINDOWS-SIGNING-RECEIPT.json"),
    "$receipt`n",
    (New-Object System.Text.UTF8Encoding($false))
  )
  Write-Host "windows_authenticode_verified files=$($signedArtifacts.Count)" -ForegroundColor Green
}

Write-Step "Artifacts"
Get-ChildItem $outDir -File | ForEach-Object {
  $hash = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower()
  [pscustomobject]@{
    Name = $_.Name
    Bytes = $_.Length
    SHA256 = $hash
  }
} | Format-Table -AutoSize

Write-Host ""
Write-Host "windows_beta_build_ok $outDir" -ForegroundColor Green
