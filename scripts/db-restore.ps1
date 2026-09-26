param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath
)

$ErrorActionPreference = "Stop"
if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is required"
}
if (-not (Test-Path $BackupPath)) {
  throw "Backup not found: $BackupPath"
}

pg_restore --clean --if-exists --no-owner --no-acl --dbname=$env:DATABASE_URL $BackupPath
Write-Host "Restore completed from: $BackupPath"
