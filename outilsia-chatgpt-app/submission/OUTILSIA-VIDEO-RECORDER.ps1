[CmdletBinding()]
param(
  [ValidateSet("Start", "Stop", "Status", "Worker")]
  [string]$Action = "Status",
  [long]$WindowHandle = 0,
  [int]$SourceProcessId = 0,
  [string]$OutputPath = "",
  [string]$WindowTitlePattern = "ChatGPT"
)

$ErrorActionPreference = "Stop"

$runtimeDir = Join-Path $env:TEMP "outilsia-chatgpt-video"
$statePath = Join-Path $runtimeDir "state.json"
$donePath = Join-Path $runtimeDir "done.json"
$stopPath = Join-Path $runtimeDir "stop.signal"
$readyPath = Join-Path $runtimeDir "ready.signal"
$stdoutPath = Join-Path $runtimeDir "window-recorder.stdout.log"
$stderrPath = Join-Path $runtimeDir "window-recorder.stderr.log"
$rawOutputPath = Join-Path $runtimeDir "window-capture-source.mp4"
$defaultOutput = Join-Path $env:USERPROFILE "Downloads\OutilsIA-ChatGPT-Submission\demo-outilsia-chatgpt-local-cockpit.mp4"
$recorderProject = Join-Path $PSScriptRoot "window-recorder"
$recorderExe = Join-Path $recorderProject "target\release\outilsia-window-recorder.exe"

function Find-CommandPath {
  param([Parameter(Mandatory = $true)][string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  return $null
}

function Find-FFmpegTool {
  param([Parameter(Mandatory = $true)][string]$Name)

  $command = Find-CommandPath -Name "$Name.exe"
  if ($command) {
    return $command
  }

  $packageRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  $candidate = Get-ChildItem $packageRoot -Directory -Filter "Gyan.FFmpeg_*" -ErrorAction SilentlyContinue |
    ForEach-Object {
      Get-ChildItem $_.FullName -Recurse -File -Filter "$Name.exe" -ErrorAction SilentlyContinue
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $candidate) {
    throw "$Name.exe not found. Install Gyan.FFmpeg with winget first."
  }
  return $candidate.FullName
}

function Read-State {
  if (-not (Test-Path $statePath)) {
    return $null
  }
  return Get-Content $statePath -Raw | ConvertFrom-Json
}

function Get-RunningProcess {
  param([int]$ProcessId)
  if ($ProcessId -le 0) {
    return $null
  }
  return Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
}

function Initialize-CaptureWindowApi {
  if ("OutilsiaCaptureWindow" -as [type]) {
    return
  }

  Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class OutilsiaCaptureWindow {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
}
"@
}

function Ensure-WindowRecorder {
  $sourceFiles = Get-ChildItem $recorderProject -Recurse -File |
    Where-Object { $_.FullName -notlike "*\target\*" }
  $latestSource = $sourceFiles |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  $binary = Get-Item $recorderExe -ErrorAction SilentlyContinue
  $needsBuild = -not $binary -or ($latestSource -and $latestSource.LastWriteTime -gt $binary.LastWriteTime)
  if (-not $needsBuild) {
    return $recorderExe
  }

  $cargo = Find-CommandPath -Name "cargo.exe"
  if (-not $cargo) {
    throw "cargo.exe is required once to build the Windows Graphics Capture helper."
  }

  Write-Output "OUTILSIA_RECORDER_BUILDING"
  & $cargo build --release --manifest-path (Join-Path $recorderProject "Cargo.toml")
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $recorderExe)) {
    throw "The Windows Graphics Capture helper build failed."
  }
  return $recorderExe
}

function Get-RecorderLogs {
  $parts = @()
  foreach ($path in @($stdoutPath, $stderrPath)) {
    if (Test-Path $path) {
      $parts += Get-Content $path -Raw
    }
  }
  $details = ($parts | Where-Object { $_ }) -join "`n"
  if (-not $details) {
    return "No recorder log."
  }
  return $details.Trim()
}

if ($Action -eq "Worker") {
  if ($WindowHandle -le 0 -or $SourceProcessId -le 0 -or -not $OutputPath) {
    throw "Worker received an invalid Brave window or output path."
  }
  $sourceProcess = Get-Process -Id $SourceProcessId -ErrorAction SilentlyContinue
  if (-not $sourceProcess) {
    throw "The Brave process selected for recording is no longer running."
  }
  $sourceProcess.Refresh()
  if ($sourceProcess.MainWindowHandle.ToInt64() -ne $WindowHandle) {
    throw "The Brave window handle changed before capture started."
  }
  if (-not (Test-Path $recorderExe)) {
    throw "The Windows Graphics Capture helper is missing."
  }

  $helperArguments = @(
    "--hwnd", $WindowHandle,
    "--output", ('"{0}"' -f $rawOutputPath),
    "--stop-file", ('"{0}"' -f $stopPath),
    "--ready-file", ('"{0}"' -f $readyPath),
    "--frame-rate", 24,
    "--bitrate", 8000000,
    "--max-seconds", 900
  )
  $recorder = Start-Process -FilePath $recorderExe `
    -ArgumentList $helperArguments `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru

  $deadline = (Get-Date).AddSeconds(20)
  while (-not (Test-Path $readyPath) -and -not $recorder.HasExited -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 200
  }
  if (-not (Test-Path $readyPath)) {
    if (-not $recorder.HasExited) {
      Stop-Process -Id $recorder.Id -Force -ErrorAction SilentlyContinue
    }
    throw "Windows Graphics Capture did not produce its first frame."
  }

  @{
    recorder_pid = $recorder.Id
    worker_pid = $PID
    output_path = $OutputPath
    raw_output_path = $rawOutputPath
    started_at = (Get-Date).ToString("o")
    source_mode = "windows_graphics_capture"
    source_window_handle = $WindowHandle
    source_process_id = $SourceProcessId
  } | ConvertTo-Json | Set-Content $statePath -Encoding UTF8

  $recorder.WaitForExit()
  @{
    exit_code = $recorder.ExitCode
    graceful_stop = (Test-Path $stopPath)
    raw_output_path = $rawOutputPath
    finished_at = (Get-Date).ToString("o")
  } | ConvertTo-Json | Set-Content $donePath -Encoding UTF8
  exit $recorder.ExitCode
}

if ($Action -eq "Start") {
  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  $existing = Read-State
  if ($existing -and (Get-RunningProcess -ProcessId ([int]$existing.recorder_pid))) {
    throw "A recording is already running with recorder PID $($existing.recorder_pid)."
  }

  Remove-Item `
    $statePath,
    $donePath,
    $stopPath,
    $readyPath,
    $stdoutPath,
    $stderrPath,
    $rawOutputPath `
    -Force `
    -ErrorAction SilentlyContinue
  if (-not $OutputPath) {
    $OutputPath = $defaultOutput
  }
  New-Item -ItemType Directory -Path (Split-Path $OutputPath -Parent) -Force | Out-Null
  Remove-Item $OutputPath -Force -ErrorAction SilentlyContinue

  $brave = Get-Process brave -ErrorAction SilentlyContinue |
    Where-Object {
      $_.MainWindowHandle -ne 0 `
        -and $_.MainWindowTitle -like "*$WindowTitlePattern*"
    } |
    Select-Object -First 1
  if (-not $brave) {
    throw "No visible Brave window matching '$WindowTitlePattern' was found."
  }

  Initialize-CaptureWindowApi
  [OutilsiaCaptureWindow]::ShowWindowAsync($brave.MainWindowHandle, 9) | Out-Null
  Start-Sleep -Milliseconds 400
  [OutilsiaCaptureWindow]::ShowWindowAsync($brave.MainWindowHandle, 3) | Out-Null
  [OutilsiaCaptureWindow]::SetForegroundWindow($brave.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 800
  if ([OutilsiaCaptureWindow]::IsIconic($brave.MainWindowHandle)) {
    throw "Brave remained minimized after the restore attempt."
  }

  $helper = Ensure-WindowRecorder
  if (-not $helper) {
    throw "The Windows Graphics Capture helper is unavailable."
  }
  $workerArguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $PSCommandPath,
    "-Action", "Worker",
    "-WindowHandle", $brave.MainWindowHandle.ToInt64(),
    "-SourceProcessId", $brave.Id,
    "-OutputPath", ('"{0}"' -f $OutputPath)
  )
  $worker = Start-Process -FilePath "$PSHOME\powershell.exe" `
    -ArgumentList $workerArguments `
    -WindowStyle Hidden `
    -PassThru

  $deadline = (Get-Date).AddSeconds(20)
  while (-not (Test-Path $statePath) -and -not $worker.HasExited -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 200
  }
  if (-not (Test-Path $statePath)) {
    if (-not $worker.HasExited) {
      Stop-Process -Id $worker.Id -Force -ErrorAction SilentlyContinue
    }
    throw "Windows Graphics Capture did not start. $(Get-RecorderLogs)"
  }
  $state = Read-State

  Write-Output "OUTILSIA_RECORDING_STARTED"
  Write-Output "Recorder PID: $($state.recorder_pid)"
  Write-Output "SourceMode: windows_graphics_capture"
  Write-Output "SourceWindow: $($brave.MainWindowTitle)"
  Write-Output "File: $OutputPath"
  exit 0
}

if ($Action -eq "Stop") {
  $state = Read-State
  if (-not $state) {
    throw "No OutilsIA recording state was found."
  }

  if (Get-RunningProcess -ProcessId ([int]$state.recorder_pid)) {
    New-Item -ItemType File -Path $stopPath -Force | Out-Null
  }

  $deadline = (Get-Date).AddSeconds(45)
  while (-not (Test-Path $donePath) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 200
  }
  if (-not (Test-Path $donePath)) {
    throw "The Windows Graphics Capture helper did not finalize within 45 seconds."
  }
  $done = Get-Content $donePath -Raw | ConvertFrom-Json
  if ([int]$done.exit_code -ne 0) {
    throw "The Windows Graphics Capture helper exited with code $($done.exit_code). $(Get-RecorderLogs)"
  }

  if (-not (Test-Path $done.raw_output_path)) {
    throw "The Windows Graphics Capture source MP4 is missing. $(Get-RecorderLogs)"
  }

  $ffmpeg = Find-FFmpegTool -Name "ffmpeg"
  $scaleFilter = "scale='min(1920,iw)':-2,setsar=1"
  & $ffmpeg `
    -hide_banner `
    -loglevel warning `
    -y `
    -i $done.raw_output_path `
    -map 0:v:0 `
    -vf $scaleFilter `
    -an `
    -c:v libx264 `
    -preset veryfast `
    -crf 20 `
    -pix_fmt yuv420p `
    -movflags +faststart `
    $state.output_path
  if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg could not normalize the window recording."
  }

  if (-not (Test-Path $state.output_path)) {
    throw "FFmpeg reported success but the final MP4 is missing."
  }
  $file = Get-Item $state.output_path
  $ffprobe = Find-FFmpegTool -Name "ffprobe"
  $probeText = (& $ffprobe -v error -show_entries format=duration,size -of json $file.FullName) -join "`n"
  $probe = $probeText | ConvertFrom-Json
  $duration = [Math]::Round([double]$probe.format.duration, 1)
  if ($duration -le 0 -or $file.Length -le 0) {
    throw "The final MP4 failed validation."
  }

  Remove-Item `
    $done.raw_output_path,
    $statePath,
    $donePath,
    $stopPath,
    $readyPath `
    -Force `
    -ErrorAction SilentlyContinue
  Write-Output "OUTILSIA_RECORDING_STOPPED"
  Write-Output "File: $($file.FullName)"
  Write-Output "Bytes: $($file.Length)"
  Write-Output "DurationSeconds: $duration"
  Write-Output "GracefulStop: $($done.graceful_stop)"
  exit 0
}

$state = Read-State
if ($state -and (Get-RunningProcess -ProcessId ([int]$state.recorder_pid))) {
  Write-Output "OUTILSIA_RECORDING_RUNNING"
  Write-Output "Recorder PID: $($state.recorder_pid)"
  Write-Output "SourceMode: $($state.source_mode)"
  Write-Output "File: $($state.output_path)"
  exit 0
}
if ($state -and (Test-Path $donePath)) {
  Write-Output "OUTILSIA_RECORDING_SOURCE_FINISHED"
  Write-Output "Run -Action Stop to validate and normalize the MP4."
  Write-Output "File: $($state.output_path)"
  exit 0
}
Write-Output "OUTILSIA_RECORDING_IDLE"
