param(
  [string]$BuildRoot = "",
  [string]$ReleaseJson = "",
  [switch]$LaunchSmoke
)

$ErrorActionPreference = "Stop"

function Resolve-Default($Path, $Fallback) {
  if ($Path -and $Path.Trim().Length -gt 0) {
    return $Path
  }
  return $Fallback
}

function Require-File($Path) {
  if (-not (Test-Path $Path -PathType Leaf)) {
    throw "Missing file: $Path"
  }
  return (Resolve-Path $Path).Path
}

function Hash-Lower($Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
      $bytes = $sha.ComputeHash($stream)
      return (($bytes | ForEach-Object { $_.ToString("x2") }) -join "")
    } finally {
      $sha.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Assert-Equal($Label, $Expected, $Actual) {
  if ($Expected -ne $Actual) {
    throw "$Label mismatch. expected=$Expected actual=$Actual"
  }
}

$appRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$defaultBuildRoot = Join-Path $appRoot "src-tauri\target\release"
$defaultReleaseJson = Resolve-Path (Join-Path $appRoot "..\server-work\static\downloads\local-cockpit\release.json")
$tauriConfig = Get-Content (Join-Path $appRoot "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = $tauriConfig.version
if (-not $version) {
  throw "Version missing in src-tauri\tauri.conf.json"
}

$BuildRoot = Resolve-Default $BuildRoot $defaultBuildRoot
$ReleaseJson = Resolve-Default $ReleaseJson $defaultReleaseJson

$directExe = Require-File (Join-Path $BuildRoot "outilsia-local-cockpit.exe")
$setupFileName = "OutilsIA Local Cockpit_${version}_x64-setup.exe"
$msiFileName = "OutilsIA Local Cockpit_${version}_x64_en-US.msi"
$setupExe = Require-File (Join-Path $BuildRoot "bundle\nsis\$setupFileName")
$msiPath = Join-Path $BuildRoot "bundle\msi\$msiFileName"
$msi = if (Test-Path $msiPath -PathType Leaf) { (Resolve-Path $msiPath).Path } else { "" }
$releasePath = Require-File $ReleaseJson

$release = Get-Content -Raw $releasePath | ConvertFrom-Json
if ($release.ok -ne $true) { throw "release.ok must be true" }
if ($release.product -ne "OutilsIA Local Cockpit") { throw "Unexpected release.product: $($release.product)" }
if ($release.channel -ne "beta") { throw "release.channel must be beta" }
if (-not $release.primary_download.name.EndsWith(".exe")) { throw "primary_download must be the Windows setup .exe" }
if (-not $release.freshness) { throw "release.freshness is missing" }
if ($release.freshness.stale -ne $false) { throw "release.freshness.stale must be false" }
if ($release.freshness.allow_stale -eq $true) { throw "release.freshness.allow_stale must not be true" }
if (-not $release.freshness.newest_source_mtime_ms -or -not $release.freshness.oldest_artifact_mtime_ms) {
  throw "release.freshness must include source and artifact mtimes"
}
if ([int64]$release.freshness.oldest_artifact_mtime_ms -lt [int64]$release.freshness.newest_source_mtime_ms) {
  throw "release artifact timestamp is older than source timestamp"
}

$setupHash = Hash-Lower $setupExe
$msiHash = if ($msi) { Hash-Lower $msi } else { "" }
$directHash = Hash-Lower $directExe

$setupItem = $release.files | Where-Object { $_.original_name -eq $setupFileName } | Select-Object -First 1
$msiItem = $release.files | Where-Object { $_.original_name -eq $msiFileName } | Select-Object -First 1
if (-not $setupItem) { throw "Setup .exe is missing from release.files" }

Assert-Equal "setup size" ([int64]$setupItem.size_bytes) (Get-Item $setupExe).Length
Assert-Equal "setup sha256" $setupItem.sha256 $setupHash
if ($msiItem -or $msi) {
  if (-not $msiItem) { throw "Local MSI exists but is missing from release.files" }
  if (-not $msi) { throw "MSI is present in release.files but missing locally" }
  Assert-Equal "msi size" ([int64]$msiItem.size_bytes) (Get-Item $msi).Length
  Assert-Equal "msi sha256" $msiItem.sha256 $msiHash
}
Assert-Equal "primary download" $setupItem.name $release.primary_download.name
Assert-Equal "primary sha256" $setupItem.sha256 $release.primary_download.sha256

if ($LaunchSmoke) {
  Get-Process -Name "outilsia-local-cockpit" -ErrorAction SilentlyContinue | Stop-Process -Force
  $proc = Start-Process -FilePath $directExe -PassThru
  Start-Sleep -Seconds 3
  $running = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
  if (-not $running) {
    throw "Launch smoke failed: process exited immediately"
  }
  $title = $running.MainWindowTitle
  Stop-Process -Id $proc.Id -Force
  if ($title -and $title -ne "OutilsIA Local Cockpit") {
    throw "Unexpected window title: $title"
  }
  Write-Host "launch_smoke_ok pid=$($proc.Id) title=$title"
}

Write-Host "windows_artifacts_ok"
Write-Host "direct_exe $((Get-Item $directExe).Length) $directHash"
Write-Host "setup_exe $((Get-Item $setupExe).Length) $setupHash"
if ($msi) {
  Write-Host "msi $((Get-Item $msi).Length) $msiHash"
} else {
  Write-Host "msi optional_absent"
}
Write-Host "release_primary $($release.primary_download.name) $($release.primary_download.sha256)"
Write-Host "release_freshness_ok source=$($release.freshness.newest_source) artifact=$($release.freshness.oldest_artifact)"
