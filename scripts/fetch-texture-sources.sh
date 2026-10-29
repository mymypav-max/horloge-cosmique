#!/usr/bin/env bash
# Télécharge les images sources des textures dans un dossier de travail.
#
# Usage : scripts/fetch-texture-sources.sh [dossier]   (défaut : .texture-sources)
#
# Ce script n'est utile que pour RÉGÉNÉRER les textures de public/textures/
# (elles sont déjà incluses dans le dépôt). Prérequis : npm, git, tar.
# Provenance et licences détaillées : docs/RESSOURCES.md.
set -euo pipefail

DEST="${1:-.texture-sources}"
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ NASA Blue Marble / Black Marble (paquet npm @nasaworldwind/worldwind@0.11.1)"
(cd "$WORK" && npm pack --silent @nasaworldwind/worldwind@0.11.1 >/dev/null)
tar -xzf "$WORK"/nasaworldwind-worldwind-0.11.1.tgz -C "$WORK" \
  package/build/dist/images/dnb_land_ocean_ice_2012.png
cp "$WORK"/package/build/dist/images/dnb_land_ocean_ice_2012.png "$DEST"/
rm -rf "$WORK"/package

echo "→ NASA Blue Marble : surface, nuages, masque terre/mer (paquet npm earth-visualization@1.1.0)"
(cd "$WORK" && npm pack --silent earth-visualization@1.1.0 >/dev/null)
tar -xzf "$WORK"/earth-visualization-1.1.0.tgz -C "$WORK" \
  package/dist/textures/earth_color_4096x2048.jpg \
  package/dist/textures/earth_clouds_4096x2048.jpg \
  package/dist/textures/earth_landocean_4050x2025.png
cp "$WORK"/package/dist/textures/*.{jpg,png} "$DEST"/
rm -rf "$WORK"/package

echo "→ Solar System Scope, CC BY 4.0 (miroir : dépôt pyvista/vtk-data)"
VTK_COMMIT=5a3de12d34c24aa5dd5e5db1cbc2defebc0d4da3
git clone --quiet --filter=blob:none --no-checkout https://github.com/pyvista/vtk-data "$WORK/vtk-data"
for f in mercury.jpg venus_atmosphere.jpg mars.jpg jupiter.jpg saturn.jpg saturn_ring_alpha.png \
         uranus.jpg neptune.jpg sun.jpg README.md; do
  git -C "$WORK/vtk-data" show "$VTK_COMMIT:Data/solar_textures/$f" > "$DEST/sss_$f"
done

echo "→ Catalogue d'étoiles XHIP, magnitude ≤ 6 (paquet npm d3-celestial@0.7.35, licence BSD-3)"
(cd "$WORK" && npm pack --silent d3-celestial@0.7.35 >/dev/null)
tar -xzf "$WORK"/d3-celestial-0.7.35.tgz -C "$WORK" package/data/stars.6.json package/LICENSE
cp "$WORK"/package/data/stars.6.json "$DEST"/
cp "$WORK"/package/LICENSE "$DEST"/d3-celestial-LICENSE.txt

echo "Sources copiées dans $DEST"
ls -la "$DEST"
