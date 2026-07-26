Set-StrictMode -Version 3.0

function Normalize-OutilsIAThumbprint([string]$Thumbprint) {
  $normalized = ($Thumbprint -replace "[^0-9A-Fa-f]", "").ToUpperInvariant()
  if ($normalized -notmatch "^[0-9A-F]{40}$") {
    throw "Certificate thumbprint must contain exactly 40 hexadecimal characters."
  }
  return $normalized
}

function Resolve-OutilsIATimestampUrl([string]$TimestampUrl) {
  $uri = $null
  $isAbsoluteUri = [Uri]::TryCreate($TimestampUrl, [UriKind]::Absolute, [ref]$uri)
  if (-not $isAbsoluteUri -or $uri.Scheme -notin @("http", "https")) {
    throw "TimestampUrl must be an absolute HTTP or HTTPS URL."
  }
  return $uri.AbsoluteUri
}

function Resolve-OutilsIASignTool {
  $command = Get-Command "signtool.exe" -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $kitsRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
  if (-not (Test-Path -LiteralPath $kitsRoot -PathType Container)) {
    throw "SignTool was not found. Install the Windows SDK signing tools."
  }

  $candidates = @(
    Get-ChildItem -LiteralPath $kitsRoot -Filter "signtool.exe" -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
      Sort-Object @{
        Expression = {
          try { [version]$_.Directory.Parent.Name } catch { [version]"0.0" }
        }
        Descending = $true
      }
  )
  if (-not $candidates.Count) {
    throw "The Windows SDK is present, but no x64 SignTool executable was found."
  }
  return $candidates[0].FullName
}

function Get-OutilsIACodeSigningCertificate([string]$Thumbprint) {
  $normalized = Normalize-OutilsIAThumbprint $Thumbprint
  $certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$normalized" -ErrorAction SilentlyContinue
  if (-not $certificate) {
    throw "Code-signing certificate $normalized was not found in Cert:\CurrentUser\My."
  }
  if (-not $certificate.HasPrivateKey) {
    throw "Code-signing certificate $normalized has no accessible private key."
  }

  $codeSigningOid = "1.3.6.1.5.5.7.3.3"
  $ekuOids = @($certificate.EnhancedKeyUsageList | ForEach-Object { $_.ObjectId.Value })
  if ($ekuOids -notcontains $codeSigningOid) {
    throw "Certificate $normalized is not valid for code signing."
  }

  $now = Get-Date
  if ($now -lt $certificate.NotBefore -or $now -gt $certificate.NotAfter) {
    throw "Code-signing certificate $normalized is outside its validity period."
  }
  return $certificate
}
