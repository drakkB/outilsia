[CmdletBinding()]
param(
  [ValidateSet("Start", "Stop", "Status", "Worker")]
  [string]$Action = "Status",
  [int]$Left = 0,
  [int]$Top = 0,
  [int]$Width = 0,
  [int]$Height = 0,
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$runtimeDir = Join-Path $env:TEMP "outilsia-chatgpt-video"
$statePath = Join-Path $runtimeDir "state.json"
$donePath = Join-Path $runtimeDir "done.json"
$stopPath = Join-Path $runtimeDir "stop.signal"
$logPath = Join-Path $runtimeDir "ffmpeg.log"
$defaultOutput = Join-Path $env:USERPROFILE "Downloads\OutilsIA-ChatGPT-Submission\demo-outilsia-chatgpt-local-cockpit.mp4"

function Find-FFmpegTool {
  param([Parameter(Mandatory = $true)][string]$Name)

  $command = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
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

if ($Action -eq "Worker") {
  if ($Width -lt 320 -or $Height -lt 240 -or -not $OutputPath) {
    throw "Worker received an invalid capture rectangle or output path."
  }

  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  $ffmpeg = Find-FFmpegTool -Name "ffmpeg"
  $targetWidth = [Math]::Min(1920, $Width)
  if (($targetWidth % 2) -ne 0) {
    $targetWidth--
  }
  $targetHeight = [int][Math]::Floor(($Height * $targetWidth / $Width) / 2) * 2

  $arguments = @(
    "-hide_banner",
    "-loglevel", "warning",
    "-y",
    "-f", "gdigrab",
    "-framerate", "24",
    "-draw_mouse", "1",
    "-offset_x", $Left,
    "-offset_y", $Top,
    "-video_size", "${Width}x${Height}",
    "-i", "desktop",
    "-t", "900",
    "-vf", "scale=${targetWidth}:${targetHeight}",
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    $OutputPath
  )

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $ffmpeg
  $startInfo.Arguments = $arguments -join " "
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardError = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  if (-not $process.Start()) {
    throw "FFmpeg did not start."
  }
  $stderrTask = $process.StandardError.ReadToEndAsync()

  @{
    ffmpeg_pid = $process.Id
    worker_pid = $PID
    output_path = $OutputPath
    started_at = (Get-Date).ToString("o")
    source_width = $Width
    source_height = $Height
    output_width = $targetWidth
    output_height = $targetHeight
  } | ConvertTo-Json | Set-Content $statePath -Encoding UTF8

  $gracefulStop = $false
  while (-not $process.HasExited) {
    if (Test-Path $stopPath) {
      $process.StandardInput.WriteLine("q")
      $process.StandardInput.Flush()
      $gracefulStop = $true
      if (-not $process.WaitForExit(30000)) {
        $process.Kill()
      }
      break
    }
    Start-Sleep -Milliseconds 250
  }

  $process.WaitForExit()
  $stderrTask.Result | Set-Content $logPath -Encoding UTF8
  @{
    exit_code = $process.ExitCode
    graceful_stop = $gracefulStop
    output_path = $OutputPath
    finished_at = (Get-Date).ToString("o")
  } | ConvertTo-Json | Set-Content $donePath -Encoding UTF8
  exit $process.ExitCode
}

if ($Action -eq "Start") {
  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  $existing = Read-State
  if ($existing -and (Get-RunningProcess -ProcessId ([int]$existing.ffmpeg_pid))) {
    throw "A recording is already running with FFmpeg PID $($existing.ffmpeg_pid)."
  }

  Remove-Item $statePath, $donePath, $stopPath, $logPath -Force -ErrorAction SilentlyContinue
  $OutputPath = $defaultOutput
  New-Item -ItemType Directory -Path (Split-Path $OutputPath -Parent) -Force | Out-Null
  Remove-Item $OutputPath -Force -ErrorAction SilentlyContinue

  $brave = Get-Process brave -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match "ChatGPT" } |
    Select-Object -First 1
  if (-not $brave) {
    throw "No visible Brave window with ChatGPT in its title was found."
  }

  Add-Type @"
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct OutilsiaCaptureRect {
  public int Left;
  public int Top;
  public int Right;
  public int Bottom;
}

public static class OutilsiaCaptureWindow {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out OutilsiaCaptureRect rect);

  [DllImport("dwmapi.dll")]
  public static extern int DwmGetWindowAttribute(
    IntPtr hWnd,
    int attribute,
    out OutilsiaCaptureRect rect,
    int size
  );
}
"@

  (New-Object -ComObject Shell.Application).MinimizeAll()
  Start-Sleep -Milliseconds 500
  [OutilsiaCaptureWindow]::ShowWindowAsync($brave.MainWindowHandle, 3) | Out-Null
  [OutilsiaCaptureWindow]::SetForegroundWindow($brave.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 1000

  $rect = New-Object OutilsiaCaptureRect
  $rectSize = [Runtime.InteropServices.Marshal]::SizeOf([type][OutilsiaCaptureRect])
  $dwmResult = [OutilsiaCaptureWindow]::DwmGetWindowAttribute(
    $brave.MainWindowHandle,
    9,
    [ref]$rect,
    $rectSize
  )
  if ($dwmResult -ne 0) {
    [OutilsiaCaptureWindow]::GetWindowRect($brave.MainWindowHandle, [ref]$rect) | Out-Null
  }

  $captureWidth = $rect.Right - $rect.Left
  $captureHeight = $rect.Bottom - $rect.Top
  if ($captureWidth -lt 320 -or $captureHeight -lt 240) {
    throw "Brave capture rectangle is invalid: ${captureWidth}x${captureHeight}."
  }

  $workerArguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $PSCommandPath,
    "-Action", "Worker",
    "-Left", $rect.Left,
    "-Top", $rect.Top,
    "-Width", $captureWidth,
    "-Height", $captureHeight,
    "-OutputPath", $OutputPath
  )
  $worker = Start-Process -FilePath "$PSHOME\powershell.exe" `
    -ArgumentList $workerArguments `
    -WindowStyle Hidden `
    -PassThru

  $deadline = (Get-Date).AddSeconds(15)
  do {
    Start-Sleep -Milliseconds 250
    $state = Read-State
  } while (-not $state -and (Get-Date) -lt $deadline -and -not $worker.HasExited)

  if (-not $state) {
    $details = if (Test-Path $logPath) { Get-Content $logPath -Raw } else { "No FFmpeg log." }
    throw "Recorder did not start. $details"
  }

  Write-Output "OUTILSIA_RECORDING_STARTED"
  Write-Output "FFmpeg PID: $($state.ffmpeg_pid)"
  Write-Output "Source: $($state.source_width)x$($state.source_height)"
  Write-Output "Output: $($state.output_width)x$($state.output_height)"
  Write-Output "File: $($state.output_path)"
  exit 0
}

if ($Action -eq "Stop") {
  $state = Read-State
  if (-not $state) {
    throw "No OutilsIA recording state was found."
  }

  New-Item -ItemType File -Path $stopPath -Force | Out-Null
  $deadline = (Get-Date).AddSeconds(45)
  while (-not (Test-Path $donePath) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 250
  }
  if (-not (Test-Path $donePath)) {
    throw "FFmpeg did not finalize the recording within 45 seconds."
  }

  $done = Get-Content $donePath -Raw | ConvertFrom-Json
  if ([int]$done.exit_code -ne 0) {
    $details = if (Test-Path $logPath) { Get-Content $logPath -Raw } else { "No FFmpeg log." }
    throw "FFmpeg exited with code $($done.exit_code). $details"
  }
  if (-not (Test-Path $done.output_path)) {
    throw "FFmpeg reported success but the MP4 is missing."
  }

  $file = Get-Item $done.output_path
  $ffprobe = Find-FFmpegTool -Name "ffprobe"
  $probeText = (& $ffprobe -v error -show_entries format=duration,size -of json $file.FullName) -join "`n"
  $probe = $probeText | ConvertFrom-Json
  $duration = [Math]::Round([double]$probe.format.duration, 1)

  Remove-Item $statePath, $stopPath -Force -ErrorAction SilentlyContinue
  Write-Output "OUTILSIA_RECORDING_STOPPED"
  Write-Output "File: $($file.FullName)"
  Write-Output "Bytes: $($file.Length)"
  Write-Output "DurationSeconds: $duration"
  Write-Output "GracefulStop: $($done.graceful_stop)"
  exit 0
}

$state = Read-State
if ($state -and (Get-RunningProcess -ProcessId ([int]$state.ffmpeg_pid))) {
  Write-Output "OUTILSIA_RECORDING_RUNNING"
  Write-Output "FFmpeg PID: $($state.ffmpeg_pid)"
  Write-Output "File: $($state.output_path)"
  exit 0
}
if (Test-Path $donePath) {
  $done = Get-Content $donePath -Raw | ConvertFrom-Json
  Write-Output "OUTILSIA_RECORDING_FINISHED"
  Write-Output "ExitCode: $($done.exit_code)"
  Write-Output "File: $($done.output_path)"
  exit 0
}
Write-Output "OUTILSIA_RECORDING_IDLE"
