param(
  [Parameter(Mandatory = $true)]
  [string[]]$ArtifactPath,
  [Parameter(Mandatory = $true)]
  [string]$ExpectedCertificateThumbprint
)

$ErrorActionPreference = "Stop"
Import-Module Microsoft.PowerShell.Security -ErrorAction Stop
. (Join-Path $PSScriptRoot "windows-signing-common.ps1")

$expectedThumbprint = Normalize-OutilsIAThumbprint $ExpectedCertificateThumbprint
$signTool = Resolve-OutilsIASignTool
$files = @()

foreach ($inputPath in $ArtifactPath) {
  $resolved = Resolve-Path -LiteralPath $inputPath -ErrorAction Stop
  $item = Get-Item -LiteralPath $resolved -ErrorAction Stop
  if ($item.PSIsContainer) { throw "Signing target is not a file: $($item.Name)" }
  if ($item.Extension.ToLowerInvariant() -notin @(".exe", ".msi")) {
    throw "Unsupported Windows signing target: $($item.Name)"
  }

  $signature = Get-AuthenticodeSignature -LiteralPath $resolved
  if ([string]$signature.Status -ne "Valid") {
    throw "Authenticode verification failed for $($item.Name): $($signature.Status)"
  }
  $actualThumbprint = ([string]$signature.SignerCertificate.Thumbprint).ToUpperInvariant()
  if ($actualThumbprint -ne $expectedThumbprint) {
    throw "Unexpected Authenticode signer for $($item.Name)."
  }
  if (-not $signature.TimeStamperCertificate) {
    throw "RFC 3161 timestamp is missing for $($item.Name)."
  }

  $verifyOutput = & $signTool "verify" "/pa" "/all" "/tw" "/v" $resolved 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "SignTool verification failed for $($item.Name) with exit code $LASTEXITCODE."
  }

  $files += [ordered]@{
    name = $item.Name
    size_bytes = [long]$item.Length
    sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolved).Hash.ToLowerInvariant()
    authenticode_status = "valid"
    signer_subject = [string]$signature.SignerCertificate.Subject
    signer_thumbprint = $actualThumbprint
    timestamp_present = $true
    timestamp_subject = [string]$signature.TimeStamperCertificate.Subject
    timestamp_thumbprint = ([string]$signature.TimeStamperCertificate.Thumbprint).ToUpperInvariant()
    signtool_policy_verified = $true
  }
}

$report = [ordered]@{
  schema = "outilsia.windows_signing_receipt.v1"
  verified_at = [DateTimeOffset]::UtcNow.ToString("o")
  verifier = "Get-AuthenticodeSignature+SignTool"
  expected_signer_thumbprint = $expectedThumbprint
  file_digest = "sha256"
  timestamp_required = $true
  all_valid = ($files.Count -gt 0)
  files = $files
}

$report | ConvertTo-Json -Depth 8 -Compress
