#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
output_dir="${1:-backups}"
mkdir -p "$output_dir"
path="$output_dir/lifeflow_$(date +%Y%m%d_%H%M%S).dump"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="$path"
echo "Backup created: $path"
