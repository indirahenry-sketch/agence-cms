#!/usr/bin/env sh
# Sauvegarde complète de la base, compressée et datée.
# Usage :  DATABASE_URI=postgres://... ./infra/scripts/backup.sh [dossier]
# Exemple de planification (chaque nuit à 3 h, sur le serveur) :
#   0 3 * * * cd /opt/agence-cms && DATABASE_URI=... ./infra/scripts/backup.sh /opt/backups
set -eu

: "${DATABASE_URI:?DATABASE_URI manquant}"
DEST="${1:-./backups}"
mkdir -p "$DEST"
FILE="$DEST/cms-$(date +%Y-%m-%d_%H%M).dump"

# Format « custom » de PostgreSQL : compressé, restaurable table par table
docker run --rm --network host -v "$(cd "$DEST" && pwd)":/out postgres:16-alpine \
  pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URI" --file="/out/$(basename "$FILE")"

echo "Sauvegarde écrite : $FILE"

# Envoi hors du serveur si rclone est configuré (ex. remote « r2-backups » pointant vers un bucket R2 dédié)
if command -v rclone >/dev/null 2>&1 && [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$FILE" "$RCLONE_REMOTE"
  echo "Copie envoyée vers $RCLONE_REMOTE"
fi

# Conservation locale : 14 derniers fichiers
ls -1t "$DEST"/cms-*.dump 2>/dev/null | tail -n +15 | xargs -r rm --
