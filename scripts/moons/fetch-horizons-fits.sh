#!/bin/sh
# Télécharge (une fois, pour la préparation des données) les ajustements de
# Tchebychev des éphémérides JPL Horizons des lunes, distribués par les paquets
# npm astraeus-data-<planète>@0.3.0 (licence MIT ; données NASA/JPL), puis
# vérifie leur empreinte SHA-256 (valeurs relevées le 29 octobre 2026).
# Usage : sh scripts/moons/fetch-horizons-fits.sh <dossier>
set -eu
dest=${1:?"usage : fetch-horizons-fits.sh <dossier>"}
mkdir -p "$dest"
for p in mars jupiter saturn uranus neptune; do
  mkdir -p "$dest/$p"
  (cd "$dest/$p" && npm pack --silent "astraeus-data-$p@0.3.0" >/dev/null && tar xzf "astraeus-data-$p-0.3.0.tgz")
done
cd "$dest"
sha256sum -c <<'SUMS'
3f6034fe6e13aacd30f835a6e3c1201fb127952c20019133e455514d82e8966a  mars/astraeus-data-mars-0.3.0.tgz
74839025bbfb93ba5f814838b484b54a48cd7f2ce33b64dcfe9a7f366b7881ce  jupiter/astraeus-data-jupiter-0.3.0.tgz
6a003e4aa8e2578903fd2b1e76482477b1e5aa678632607d97fba6b43f2f98d0  saturn/astraeus-data-saturn-0.3.0.tgz
d1dcd0bba754b0f5784a40c5b5e61a4e0201843fd6c41712352b0b6da5320280  uranus/astraeus-data-uranus-0.3.0.tgz
0d84b8ca5a114779f226fd272f479cc08dc619036fce58edacaa4cf90cf6102e  neptune/astraeus-data-neptune-0.3.0.tgz
SUMS
