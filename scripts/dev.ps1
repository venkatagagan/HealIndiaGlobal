<#
.SYNOPSIS
    Start the Heal India Global development environment on Windows.

.DESCRIPTION
    Uses ONLY the shared toolchain under C:\NewProjects (via scripts\env.ps1) - never C:\laragon.
      1. Ensures this project's dedicated PostgreSQL 17 cluster (C:\NewProjects\pgdata-healindia, 127.0.0.1:5433,
         created by scripts\setup-db.ps1) is running. The shared cluster on 5432 belongs to other projects and is
         never touched.
      2. Runs `alembic upgrade head` against this project's own database (backend\.env DATABASE_URL).
      3. Opens the API (uvicorn --reload on :8000) in its own window.
      4. Opens the selected web apps (Vite dev servers) and the public website (Next.js, :3000) each in its own
         window. URLs follow PLAN section 3.1: website /, patient /app/, agent /agent/, hospital /hospital/,
         admin (staff door) /gahi/.
      5. Optionally opens a separate background-job worker window.

.PARAMETER Apps
    Apps to start: website, patient, agent, hospital, admin (default: all five). Use -Apps none for API only.

.PARAMETER Worker
    Also start `python -m app.worker` in its own window (otherwise the API's embedded worker runs jobs
    when RUN_WORKER_IN_API=true in backend\.env).

.PARAMETER SkipMigrate
    Do not run `alembic upgrade head`.

.PARAMETER NoApi
    Do not start the API (e.g. it is already running).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File C:\NewProjects\ForHosp\scripts\dev.ps1
    .\scripts\dev.ps1 -Apps website,patient,admin -Worker
#>
[CmdletBinding()]
param(
    [ValidateSet('website', 'patient', 'agent', 'hospital', 'admin', 'none')]
    [string[]]$Apps = @('website', 'patient', 'agent', 'hospital', 'admin'),
    [switch]$Worker,
    [switch]$SkipMigrate,
    [switch]$NoApi
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Web = Join-Path $Root 'web'
$Website = Join-Path $Root 'website'
$EnvScript = Join-Path $PSScriptRoot 'env.ps1'
$Python = Join-Path $Backend '.venv\Scripts\python.exe'
$PgBin = 'C:\NewProjects\pgsql\bin'
$PgData = 'C:\NewProjects\pgdata-healindia'
$PgPort = '5433'
$PgCtl = Join-Path $PgBin 'pg_ctl.exe'
$PgIsReady = Join-Path $PgBin 'pg_isready.exe'
$LogDir = Join-Path $Root 'logs'

# Dir = npm project, Workspace = npm workspace inside it ('' = the project itself), Path = base path (PLAN 3.1).
$AppMap = [ordered]@{
    website  = @{ Dir = $Website; Workspace = '';                     Port = 3000; Path = '/';          Title = 'Website' }
    patient  = @{ Dir = $Web;     Workspace = 'apps/patient-web';     Port = 5173; Path = '/app/';      Title = 'Patient web' }
    agent    = @{ Dir = $Web;     Workspace = 'apps/agent-portal';    Port = 5174; Path = '/agent/';    Title = 'Agent portal' }
    hospital = @{ Dir = $Web;     Workspace = 'apps/hospital-portal'; Port = 5175; Path = '/hospital/'; Title = 'Hospital portal' }
    admin    = @{ Dir = $Web;     Workspace = 'apps/admin-portal';    Port = 5176; Path = '/gahi/';     Title = 'Admin portal' }
}

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "    $Message" -ForegroundColor Green }
function Write-Warn2([string]$Message) { Write-Host "    $Message" -ForegroundColor Yellow }

# Runs a native executable and returns its exit code. Windows PowerShell 5.1 turns redirected native
# stderr into terminating errors under $ErrorActionPreference='Stop', so relax it for the call only.
function Invoke-Native([string]$Exe, [string[]]$Arguments, [switch]$Quiet) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Quiet) { & $Exe @Arguments *> $null } else { & $Exe @Arguments | Out-Host }
        return $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
}

# ---- 0. Toolchain -----------------------------------------------------------------------------------
Write-Step 'Activating shared toolchain (C:\NewProjects)'
if (-not (Test-Path $EnvScript)) { throw "Missing $EnvScript" }
. $EnvScript
foreach ($tool in @($PgCtl, $PgIsReady)) {
    if (-not (Test-Path $tool)) { throw "Shared PostgreSQL tool not found: $tool" }
}
if ($env:PATH -match '(?i)laragon') {
    # Never let a C:\laragon toolchain shadow the shared one inside this session.
    $env:PATH = (($env:PATH -split ';') | Where-Object { $_ -and ($_ -notmatch '(?i)\\laragon\\') }) -join ';'
}
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) { Write-Ok "node: $($node.Source)" }

# ---- 1. PostgreSQL -----------------------------------------------------------------------------------
Write-Step "Checking PostgreSQL cluster ($PgData)"
if (-not (Test-Path (Join-Path $PgData 'PG_VERSION'))) {
    throw "Dedicated cluster not initialised. Run once: powershell -ExecutionPolicy Bypass -File scripts\setup-db.ps1"
}
if ((Invoke-Native $PgCtl @('status', '-D', $PgData) -Quiet) -eq 0) {
    Write-Ok 'PostgreSQL is running'
} else {
    Write-Warn2 'PostgreSQL is stopped - starting it (detached)'
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $pgLog = Join-Path $LogDir 'postgres.log'
    # Do NOT use -Wait: the postmaster keeps the started process tree alive and the call would never return.
    Start-Process -FilePath $PgCtl `
        -ArgumentList @('start', '-D', "`"$PgData`"", '-l', "`"$pgLog`"", '-W') `
        -WindowStyle Hidden | Out-Null
    $deadline = (Get-Date).AddSeconds(60)
    $running = $false
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 750
        if ((Invoke-Native $PgCtl @('status', '-D', $PgData) -Quiet) -eq 0 -and
            (Invoke-Native $PgIsReady @('-h', '127.0.0.1', '-p', $PgPort, '-q') -Quiet) -eq 0) {
            $running = $true
            break
        }
    }
    if (-not $running) { throw "PostgreSQL did not become ready within 60s - see $pgLog" }
    Write-Ok 'PostgreSQL started'
}

# ---- 2. Backend prerequisites + migrations ------------------------------------------------------------
if (-not (Test-Path $Python)) {
    throw "backend\.venv not found. Create it with:`n  C:\NewProjects\python313\python.exe -m venv backend\.venv`n  backend\.venv\Scripts\python -m pip install -e `"backend[dev]`""
}
$BackendEnv = Join-Path $Backend '.env'
if (-not (Test-Path $BackendEnv)) {
    throw 'backend\.env not found (it holds DATABASE_URL for this project''s own database). See README "Quickstart".'
}
# Safety net: the dev stack must only ever use this project's cluster on 127.0.0.1:5433 - never the shared 5432
# cluster of other projects. Only host and port are inspected; credentials are never printed.
$dbLine = Get-Content -LiteralPath $BackendEnv | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -Last 1
if (-not $dbLine) { throw 'backend\.env has no DATABASE_URL. Run scripts\setup-db.ps1 once.' }
if ($dbLine -notmatch '@(?<host>127\.0\.0\.1|localhost):(?<port>\d+)/') {
    throw 'backend\.env DATABASE_URL must point at 127.0.0.1:5433 (this project''s own cluster).'
}
if ($Matches['port'] -ne $PgPort) {
    throw "backend\.env DATABASE_URL uses port $($Matches['port']); the dev stack only runs against 127.0.0.1:$PgPort."
}

if (-not $SkipMigrate) {
    Write-Step 'alembic upgrade head'
    Push-Location $Backend
    try {
        if ((Invoke-Native $Python @('-m', 'alembic', 'upgrade', 'head')) -ne 0) {
            throw 'alembic upgrade head failed. If the database/role does not exist yet run scripts\setup-db.ps1 once.'
        }
        Write-Ok 'database schema is up to date'
    } finally { Pop-Location }
}

# ---- 3. Launch helper ----------------------------------------------------------------------------------
$Shell = (Get-Process -Id $PID).Path   # same PowerShell edition as this session
function Start-DevWindow([string]$Title, [string]$WorkDir, [string]$Command) {
    $script = @"
`$Host.UI.RawUI.WindowTitle = '$Title'
. '$EnvScript'
Set-Location -LiteralPath '$WorkDir'
Write-Host '$Title' -ForegroundColor Cyan
$Command
"@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    Start-Process -FilePath $Shell -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded) | Out-Null
}

$urls = [System.Collections.Generic.List[string]]::new()

# ---- 4. API / worker -----------------------------------------------------------------------------------
if (-not $NoApi) {
    Write-Step 'Starting API window (uvicorn --reload :8000)'
    Start-DevWindow -Title 'HIG API :8000' -WorkDir $Backend `
        -Command "& '$Python' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
    $urls.Add('API          http://127.0.0.1:8000   (docs: http://127.0.0.1:8000/api/docs)')
}
if ($Worker) {
    Write-Step 'Starting worker window (python -m app.worker)'
    Start-DevWindow -Title 'HIG worker' -WorkDir $Backend -Command "& '$Python' -m app.worker"
}

# ---- 5. Website + web apps -----------------------------------------------------------------------------
$selected = @($Apps | Where-Object { $_ -ne 'none' } | Select-Object -Unique)
if ($selected.Count -gt 0) {
    $projects = @($selected | ForEach-Object { $AppMap[$_].Dir } | Select-Object -Unique)
    foreach ($dir in $projects) {
        if (-not (Test-Path (Join-Path $dir 'node_modules'))) {
            Write-Step "Installing dependencies in $(Split-Path -Leaf $dir) (npm ci, first run only)"
            Push-Location $dir
            try {
                $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
                if ((Invoke-Native $npm @('ci', '--no-audit', '--no-fund')) -ne 0) { throw "npm ci failed in $dir" }
            } finally { Pop-Location }
        }
    }
    foreach ($name in $selected) {
        $app = $AppMap[$name]
        $cmd = if ($app.Workspace) { "npm run dev -w $($app.Workspace)" } else { 'npm run dev' }
        Write-Step "Starting $($app.Title) window (:$($app.Port))"
        Start-DevWindow -Title "HIG $($app.Title) :$($app.Port)" -WorkDir $app.Dir -Command $cmd
        $urls.Add(('{0,-12} http://localhost:{1}{2}' -f $app.Title, $app.Port, $app.Path))
    }
    if ($selected -contains 'website') {
        $urls.Add('Login door   http://localhost:3000/login   (staff door: http://localhost:5176/gahi/)')
    }
}

# ---- 6. Summary ----------------------------------------------------------------------------------------
Write-Host ''
if ($urls.Count -eq 0) {
    Write-Host 'Checks complete - no servers were requested (-NoApi / -Apps none).' -ForegroundColor Green
} else {
    Write-Host 'Heal India Global - development servers starting in separate windows:' -ForegroundColor Green
    foreach ($u in $urls) { Write-Host "  $u" }
    Write-Host ''
    Write-Host "Close a window (or press Ctrl+C in it) to stop that server. PostgreSQL (127.0.0.1:$PgPort) keeps running."
    Write-Host 'Production-like single-domain routing (nginx): infra\docker-compose.yml.'
}
