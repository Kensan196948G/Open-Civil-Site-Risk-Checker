<#
.SYNOPSIS
  Ensures Docker Desktop is running on this Windows host.

.DESCRIPTION
  OCSRC production is served via Docker (infra/docker-compose.yml, restart: always).
  restart: always only revives containers once the Docker Desktop engine itself is
  running — it does not start Docker Desktop after a host reboot/logoff. This script
  closes that gap by launching Docker Desktop if it is not already running; the
  restart policy then brings ocsrc-web/ocsrc-backend/ocsrc-db back up automatically.

  Registered as a logon-triggered Scheduled Task (see README "Docker（代替）" section).
#>

$dockerDesktopExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
$logPath = "$env:ProgramData\OCSRC\Start-DockerDesktop.log"

function Write-Log($message) {
    New-Item -ItemType Directory -Force -Path (Split-Path $logPath) | Out-Null
    "$(Get-Date -Format o) $message" | Out-File -FilePath $logPath -Append -Encoding utf8
}

$running = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $running) {
    if (Test-Path $dockerDesktopExe) {
        try {
            Start-Process $dockerDesktopExe -ErrorAction Stop
            Write-Log "Docker Desktop starting."
        } catch {
            Write-Log "Failed to start Docker Desktop: $_"
        }
    } else {
        Write-Log "Docker Desktop executable not found at $dockerDesktopExe"
    }
}
