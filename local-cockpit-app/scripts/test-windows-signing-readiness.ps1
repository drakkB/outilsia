param(
  [Parameter(Mandatory = $true)]
  [string]$CertificateThumbprint,
  [Parameter(Mandatory = $true)]
  [string]$TimestampUrl
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "windows-signing-common.ps1")

$normalized = Normalize-OutilsIAThumbprint $CertificateThumbprint
$resolvedTimestampUrl = Resolve-OutilsIATimestampUrl $TimestampUrl
$certificate = Get-OutilsIACodeSigningCertificate $normalized
$signTool = Resolve-OutilsIASignTool

$report = [ordered]@{
  schema = "outilsia.windows_signing_readiness.v1"
  ready = $true
  certificate = [ordered]@{
    subject = [string]$certificate.Subject
    thumbprint = $normalized
    not_before = $certificate.NotBefore.ToUniversalTime().ToString("o")
    not_after = $certificate.NotAfter.ToUniversalTime().ToString("o")
    has_private_key = [bool]$certificate.HasPrivateKey
    code_signing_eku = $true
    store = "CurrentUser/My"
  }
  signing = [ordered]@{
    file_digest = "sha256"
    timestamp_digest = "sha256"
    timestamp_url = $resolvedTimestampUrl
    signtool_available = $true
    signtool_name = [System.IO.Path]::GetFileName($signTool)
  }
}

$report | ConvertTo-Json -Depth 6 -Compress
