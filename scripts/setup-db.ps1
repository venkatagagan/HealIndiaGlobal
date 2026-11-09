# Heal India Global - dedicated local PostgreSQL 17 cluster (idempotent).
# Uses the shared binaries in C:\NewProjects\pgsql (nothing is installed); keeps its own data directory so the
# shared cluster used by other projects (C:\NewProjects\pgdata, port 5432) is never touched.
#   data   : C:\NewProjects\pgdata-healindia      port : 127.0.0.1:5433
#   app    : role/db from backend\.env DATABASE_URL (generated credentials, CREATEDB for test databases)
#   admin  : superuser "postgres", password in backend\.env LOCAL_PG_SUPERUSER_PASSWORD (dev only)
# Usage:  powershell -ExecutionPolicy Bypass -File C:\NewProjects\ForHosp\scripts\setup-db.ps1
$ErrorActionPreference = 'Stop'
$bin     = 'C:\NewProjects\pgsql\bin'
$data    = 'C:\NewProjects\pgdata-healindia'
$log     = 'C:\NewProjects\pgdata-healindia.log'
$port    = 5433
$root    = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root 'backend\.env'
$utf8    = New-Object Text.UTF8Encoding $false

$envText = [IO.File]::ReadAllText($envFile)
if ($envText -notmatch 'DATABASE_URL=postgresql\+asyncpg://([A-Za-z0-9_]+):([A-Za-z0-9]+)@127\.0\.0\.1:\d+/([A-Za-z0-9_]+)') {
  throw 'DATABASE_URL missing or invalid in backend\.env'
}
$appUser = $Matches[1]; $appPw = $Matches[2]; $appDb = $Matches[3]

# 1. initialise the cluster once
if (-not (Test-Path (Join-Path $data 'PG_VERSION'))) {
  $su = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 28 | ForEach-Object { [char]$_ })
  $pwFile = Join-Path $env:TEMP ("hig-pg-" + [guid]::NewGuid().ToString('N') + '.txt')
  [IO.File]::WriteAllText($pwFile, $su, $utf8)
  try {
    & "$bin\initdb.exe" -D $data -U postgres "--pwfile=$pwFile" -E UTF8 --locale=C -A scram-sha-256 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
  } finally { Remove-Item $pwFile -Force -ErrorAction SilentlyContinue }
  Add-Content -Path (Join-Path $data 'postgresql.conf') -Value "`nport = $port`nlisten_addresses = '127.0.0.1'`nmax_connections = 200`n" -Encoding ascii
  $envText = $envText.TrimEnd() + "`n# Dedicated local PostgreSQL cluster superuser (dev only; used by scripts/setup-db.ps1)`nLOCAL_PG_SUPERUSER_PASSWORD=$su`n"
  [IO.File]::WriteAllText($envFile, $envText, $utf8)
  Write-Output "cluster initialised at $data"
}

# 2. start it detached (never pipe/wait on pg_ctl start: the postmaster would inherit the handles)
& "$bin\pg_ctl.exe" status -D $data *> $null
if ($LASTEXITCODE -ne 0) {
  Start-Process -FilePath "$bin\pg_ctl.exe" -ArgumentList @('start', '-D', $data, '-l', $log) -WindowStyle Hidden
}
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  & "$bin\pg_isready.exe" -h 127.0.0.1 -p $port *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw "PostgreSQL did not become ready on port $port (see $log)" }

# 3. app role + database + extensions
if ($envText -notmatch 'LOCAL_PG_SUPERUSER_PASSWORD=([A-Za-z0-9]+)') { throw 'LOCAL_PG_SUPERUSER_PASSWORD missing in backend\.env' }
$env:PGPASSWORD = $Matches[1]
# PS 5.1 turns any native stderr line into an error under 'Stop'; silence NOTICEs ("already exists, skipping") on re-runs
$env:PGOPTIONS = '-c client_min_messages=warning'
function Q([string]$db, [string]$sql) {
  $r = & "$bin\psql.exe" -h 127.0.0.1 -p $port -U postgres -d $db -w -v ON_ERROR_STOP=1 -tAc $sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw "psql failed ($db): $r" }
  return $r
}
try {
  if ((Q 'postgres' "SELECT 1 FROM pg_roles WHERE rolname='$appUser'") -ne '1') {
    Q 'postgres' "CREATE ROLE $appUser LOGIN PASSWORD '$appPw' CREATEDB" | Out-Null
  } else {
    Q 'postgres' "ALTER ROLE $appUser WITH LOGIN PASSWORD '$appPw' CREATEDB" | Out-Null
  }
  if ((Q 'postgres' "SELECT 1 FROM pg_database WHERE datname='$appDb'") -ne '1') {
    Q 'postgres' "CREATE DATABASE $appDb OWNER $appUser ENCODING 'UTF8' TEMPLATE template0" | Out-Null
  }
  Q $appDb 'CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS btree_gin; CREATE EXTENSION IF NOT EXISTS pgcrypto;' | Out-Null
} finally { Remove-Item Env:PGPASSWORD, Env:PGOPTIONS -ErrorAction SilentlyContinue }

# 4. point DATABASE_URL at this cluster
$envText = [IO.File]::ReadAllText($envFile)
$envText = $envText -replace '(DATABASE_URL=postgresql\+asyncpg://[^@\s]+@127\.0\.0\.1:)\d+/', ('${1}' + $port + '/')
$envText = $envText -replace '# Dedicated NEW role \+ database for this project on the shared PostgreSQL 17 server \(port 5432\)', '# Dedicated PostgreSQL 17 cluster for this project: data C:\NewProjects\pgdata-healindia, 127.0.0.1:5433'
[IO.File]::WriteAllText($envFile, $envText, $utf8)

# 5. verify the app role logs in with its own password
$env:PGPASSWORD = $appPw
$who = & "$bin\psql.exe" -h 127.0.0.1 -p $port -U $appUser -d $appDb -w -tAc "select current_user || ' @ ' || current_database() || ' | createdb=' || (select rolcreatedb::text from pg_roles where rolname = current_user) || ' | ext=' || (select string_agg(extname, ',' order by extname) from pg_extension)" 2>&1
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "app login failed: $who" }
Write-Output "OK: $who (127.0.0.1:$port)"
