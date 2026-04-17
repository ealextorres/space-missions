Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-Command {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dashboardDir = Join-Path $repoRoot "dashboard"
$apiEntry = Join-Path $repoRoot "api\main.py"

if (-not (Test-Path $dashboardDir)) {
    throw "Dashboard folder not found at '$dashboardDir'."
}

if (-not (Test-Path $apiEntry)) {
    throw "FastAPI entrypoint not found at '$apiEntry'."
}

Assert-Command -Name "py"
Assert-Command -Name "npm"

$shellExe = if (Get-Command "pwsh" -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell" }

$backendCommand = "Set-Location '$repoRoot'; py -m uvicorn api.main:app --reload --host 127.0.0.1 --port 8000"
$frontendCommand = "Set-Location '$dashboardDir'; npm run dev"

Write-Host "Starting FastAPI backend in a new window..."
Start-Process -FilePath $shellExe -ArgumentList @("-NoExit", "-Command", $backendCommand) | Out-Null

Write-Host "Starting dashboard in a new window..."
Start-Process -FilePath $shellExe -ArgumentList @("-NoExit", "-Command", $frontendCommand) | Out-Null

Write-Host "Launched both services."
Write-Host "Backend:  http://127.0.0.1:8000"
Write-Host "Dashboard: http://127.0.0.1:5173"
