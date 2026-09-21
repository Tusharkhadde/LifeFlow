param(
  [string]$OutputDirectory = "backups"
)

$ErrorActionPreference = "Stop"
if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is required"
}

New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$path = Join-Path $OutputDirectory "lifeflow_$timestamp.dump"
pg_dump $env:DATABASE_URL --format=custom --no-owner --no-acl --file=$path
Write-Host "Backup created: $path"
