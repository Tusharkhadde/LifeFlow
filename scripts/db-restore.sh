#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
backup_path="${1:?Usage: scripts/db-restore.sh <backup.dump>}"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$DATABASE_URL" "$backup_path"
echo "Restore completed from: $backup_path"
