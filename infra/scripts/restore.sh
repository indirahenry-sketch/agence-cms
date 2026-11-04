#!/usr/bin/env sh
# Restaure une sauvegarde dans une base PostgreSQL (VIDE de préférence).
# Usage :  DATABASE_URI=postgres://... ./infra/scripts/restore.sh backups/cms-2026-11-04_0300.dump
set -eu

: "${DATABASE_URI:?DATABASE_URI manquant}"
FILE="${1:?Indique le fichier .dump à restaurer}"
DIR="$(cd "$(dirname "$FILE")" && pwd)"

echo "⚠ Restauration de $FILE dans $DATABASE_URI"
printf "Confirmer ? (oui/non) " && read -r answer && [ "$answer" = "oui" ] || exit 1

docker run --rm --network host -v "$DIR":/in postgres:16-alpine \
  pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URI" "/in/$(basename "$FILE")"

echo "Restauration terminée."
