#!/usr/bin/env bash
# Télécharge les cartes sources des lunes dans un dossier de travail.
#
# Usage : scripts/moons/fetch-moon-texture-sources.sh [dossier]   (défaut : .moon-texture-sources)
#
# Utile uniquement pour RÉGÉNÉRER public/textures/moons/ (déjà inclus dans le
# dépôt). Prérequis : npm, git, curl, tar. Provenance : docs/RESSOURCES.md.
set -euo pipefail

DEST="${1:-.moon-texture-sources}"
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ Cartes NASA/JPL-Caltech/SSI/LPI et USGS (paquet npm astraeus-data@0.3.0)"
(cd "$WORK" && npm pack --silent astraeus-data@0.3.0 >/dev/null)
tar -xzf "$WORK"/astraeus-data-0.3.0.tgz -C "$WORK" package/src/textures package/src/pictures.js package/NOTICE
for f in io-2k europa-2k ganymede-2k callisto-2k mimas-4k enceladus-4k tethys-4k dione-4k rhea-4k titan-4k iapetus-4k triton-4k; do
  cp "$WORK/package/src/textures/$f.jpg" "$DEST/"
done
cp "$WORK/package/src/pictures.js" "$DEST/astraeus-pictures.js"
cp "$WORK/package/NOTICE" "$DEST/astraeus-NOTICE.txt"

echo "→ NASA 3D Resources (github.com/nasa/NASA-3D-Resources, commit 11ebb4e)"
BASE="https://raw.githubusercontent.com/nasa/NASA-3D-Resources/11ebb4e"
for pair in "Mars - Phobos:phobos" "Mars - Deimos:deimos" "Uranus - Ariel:ariel" "Uranus - Miranda:miranda" \
            "Uranus - Oberon:oberon" "Uranus - Titania:titania" "Uranus - Umbriel:umbriel"; do
  name="${pair%%:*}"
  id="${pair##*:}"
  path=$(python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))" "Images and Textures/$name/$name.jpg")
  curl -fsS -o "$DEST/nasa3d_$id.jpg" "$BASE/$path"
done
curl -fsS -o "$DEST/nasa3d-README.md" "$BASE/README.md"

echo "→ Lune : Solar System Scope, CC BY 4.0 (miroir : dépôt pyvista/vtk-data)"
VTK_COMMIT=5a3de12d34c24aa5dd5e5db1cbc2defebc0d4da3
git clone --quiet --filter=blob:none --no-checkout https://github.com/pyvista/vtk-data "$WORK/vtk-data"
git -C "$WORK/vtk-data" show "$VTK_COMMIT:Data/solar_textures/moon.jpg" > "$DEST/sss_moon.jpg"

echo "Sources copiées dans $DEST"
