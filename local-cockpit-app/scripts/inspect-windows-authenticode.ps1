param(
  [Parameter(Mandatory = $true)]
  [string[]]$ArtifactPath
)

$ErrorActionPreference = "Stop"
Import-Module Microsoft.PowerShell.Security -ErrorAction Stop

function Signature-Status([string]$Status) {
  switch ($Status) {
    "Valid" { return "valid" }
    "NotSigned" { return "not_signed" }
    default { return "invalid" }
  }
}

$files = @()
foreach ($inputPath in $ArtifactPath) {
  $resolved = Resolve-Path -LiteralPath $inputPath -ErrorAction Stop
  $item = Get-Item -LiteralPath $resolved -ErrorAction Stop
  if ($item.PSIsContainer) { throw "Authenticode target is not a file: $inputPath" }
  $signature = Get-AuthenticodeSignature -LiteralPath $resolved
  $status = Signature-Status ([string]$signature.Status)
  $files += [ordered]@{
    name = $item.Name
    sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolved).Hash.ToLowerInvariant()
    status = $status
    native_status = [string]$signature.Status
    signer_subject = if ($signature.SignerCertificate) { [string]$signature.SignerCertificate.Subject } else { "" }
    signer_thumbprint = if ($signature.SignerCertificate) { [string]$signature.SignerCertificate.Thumbprint } else { "" }
    timestamp_present = [bool]$signature.TimeStamperCertificate
    timestamp_subject = if ($signature.TimeStamperCertificate) { [string]$signature.TimeStamperCertificate.Subject } else { "" }
    timestamp_thumbprint = if ($signature.TimeStamperCertificate) { [string]$signature.TimeStamperCertificate.Thumbprint } else { "" }
  }
}

$statuses = @($files | ForEach-Object { [string]$_.status } | Select-Object -Unique)
$overall = if ($files.Count -eq 0) {
  "not_applicable"
} elseif ($statuses.Count -eq 1 -and $statuses[0] -eq "valid") {
  "valid"
} elseif ($statuses.Count -eq 1 -and $statuses[0] -eq "not_signed") {
  "not_signed"
} else {
  "mixed_or_invalid"
}
$allValid = ($overall -eq "valid")
$allTimestamped = ($allValid -and @($files | Where-Object { -not $_.timestamp_present }).Count -eq 0)

$report = [ordered]@{
  schema = "outilsia.windows_authenticode.v1"
  inspected_at = [DateTimeOffset]::UtcNow.ToString("o")
  inspector = "Get-AuthenticodeSignature"
  verified_on_windows = $true
  status = $overall
  all_valid = $allValid
  all_timestamped = $allTimestamped
  identity_claim_allowed = $allValid
  stable_release_ready = ($allValid -and $allTimestamped)
  files = $files
}

$report | ConvertTo-Json -Depth 8 -Compress
