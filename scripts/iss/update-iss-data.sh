#!/bin/sh
# Met à jour les données orbitales de l'ISS embarquées dans l'application
# (src/data/iss.json) à partir de l'éphéméride prévisionnelle publiée par la
# NASA, puis l'extrait de vérification des tests. À lancer sur un ordinateur
# connecté, avant de recompiler l'application et l'APK : l'application
# elle-même n'accède jamais au réseau.
# Usage : npm run data:iss
set -eu
URL="https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsS -o "$TMP/ISS.OEM_J2K_EPH.txt" "$URL"
RETRIEVED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ISS_RETRIEVED_UTC="$RETRIEVED" node scripts/iss/fit-iss-elements.mjs \
  "$TMP/ISS.OEM_J2K_EPH.txt" src/data/iss.json tests/fixtures/iss-oem-sample.json
echo "Données ISS mises à jour (fichier NASA récupéré le $RETRIEVED)."
echo "Étapes suivantes : npm test, npm run build, puis recompiler l'APK."
