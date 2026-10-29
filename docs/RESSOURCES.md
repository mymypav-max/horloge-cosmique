# Ressources graphiques et données : provenance et licences

Ce document recense chaque ressource tierce embarquée dans l'application,
son origine, sa licence et les transformations appliquées. Les fichiers
générés se trouvent dans `public/textures/` et `src/data/stars.json`.

Toutes les ressources sont **embarquées localement** : l'application ne
télécharge rien pendant son fonctionnement.

## Résumé

| Fichier | Contenu | Origine | Licence |
|---|---|---|---|
| `public/textures/earth-day-4096.jpg`, `earth-day-2048.jpg` | Surface de la Terre (couleurs naturelles) | NASA Blue Marble | Domaine public (NASA) |
| `public/textures/earth-data-2048.jpg` — canal rouge | Nuages | NASA Blue Marble (composite de nuages) | Domaine public (NASA) |
| `public/textures/earth-data-2048.jpg` — canal vert | Masque océans / terres | NASA (masque terre-mer Blue Marble) | Domaine public (NASA) |
| `public/textures/earth-data-2048.jpg` — canal bleu | Lumières nocturnes | NASA Black Marble 2012 (Suomi NPP / VIIRS) | Domaine public (NASA) |
| `public/textures/mercury.jpg`, `venus.jpg`, `mars.jpg`, `jupiter.jpg`, `saturn.jpg`, `uranus.jpg`, `neptune.jpg`, `sun.jpg`, `saturn-ring.png` | Textures des planètes, du Soleil et des anneaux | Solar System Scope (d'après des données NASA) | **CC BY 4.0** — attribution obligatoire |
| `src/data/stars.json` | 5 044 étoiles de magnitude ≤ 6 (position, magnitude, indice B−V) | Catalogue XHIP (Anderson & Francis 2012), via d3-celestial | Données : catalogue scientifique ; mise en forme d3-celestial © 2015 Olaf Frohn, **BSD-3-Clause** (texte : [`licences/d3-celestial-BSD-3-Clause.txt`](licences/d3-celestial-BSD-3-Clause.txt)) |
| Police Jost (paquet npm `@fontsource/jost`) | Typographie de l'interface | © 2020 The Jost Project Authors* | SIL Open Font License 1.1 |

## Attribution exigée (CC BY 4.0)

> Textures des planètes, du Soleil et des anneaux de Saturne : © Solar System
> Scope — https://www.solarsystemscope.com/textures/ — distribuées sous licence
> Creative Commons Attribution 4.0 International
> (https://creativecommons.org/licenses/by/4.0/).
> **Modifications** : redimensionnement en 1024 × 512 pixels et recompression
> JPEG ; profil radial moyenné et réduit à 1024 × 4 pixels pour les anneaux.

Cette attribution est également affichée dans l'application (panneau
« Réglages », rubrique « Crédits »).

## Détail des sources et des traitements

Les images sources sont récupérées par `scripts/fetch-texture-sources.sh`,
puis transformées par `scripts/prepare_textures.py` (Python 3, Pillow,
NumPy). Le second script vérifie l'empreinte SHA-256 de chaque source avant
traitement : le résultat est reproductible.

### Terre

1. **Surface** — `earth_color_4096x2048.jpg`, issu du paquet npm
   `earth-visualization@1.1.0` (licence MIT pour le code ; l'auteur indique
   que les images incluses sont des images NASA du domaine public). Il s'agit
   de la mosaïque *Blue Marble* de la NASA (Visible Earth, Goddard Space
   Flight Center), en couleurs naturelles, sans nuages.
   *Traitement* : recompression JPEG en 4096 × 2048 (qualité « haute ») et
   réduction en 2048 × 1024 (qualité « standard » et « économie »).
2. **Nuages** — `earth_clouds_4096x2048.jpg` (même paquet), composite de
   nuages *Blue Marble* de la NASA.
   *Traitement* : réduction en 2048 × 1024, courbe de niveaux
   `((v − 0,04) / 0,82)^1,15` pour éliminer le faible relief résiduel.
   Il s'agit d'un **instantané figé** : les nuages ne représentent pas la
   météo réelle du moment.
3. **Masque océans** — `earth_landocean_4050x2025.png` (même paquet).
   *Traitement* : réduction en 2048 × 1024.
4. **Lumières nocturnes** — `dnb_land_ocean_ice_2012.png` (2048 × 1024),
   issu du paquet npm `@nasaworldwind/worldwind@0.11.1` (NASA WorldWind,
   NASA Open Source Agreement / Apache 2.0). Image *Black Marble 2012* de la
   NASA (Earth Observatory, NOAA NGDC, capteur VIIRS de Suomi NPP), domaine
   public.
   *Traitement* : extraction des éclairages par `(R − 0,35·B − 4) / 170`,
   ce qui supprime le fond bleu des océans, des terres et des glaces.

Les cartes 2, 3 et 4 sont regroupées dans les canaux R, G, B d'une
seule image (`earth-data-2048.jpg`, JPEG sans sous-échantillonnage de la
chrominance) afin d'économiser la mémoire graphique du Fire TV.

### Planètes, Soleil, anneaux

Fichiers `mercury.jpg`, `venus_atmosphere.jpg`, `mars.jpg`, `jupiter.jpg`,
`saturn.jpg`, `uranus.jpg`, `neptune.jpg`, `sun.jpg`,
`saturn_ring_alpha.png` (2048 × 1024 sauf les anneaux) de **Solar System
Scope**, récupérés depuis le miroir du projet PyVista
(`github.com/pyvista/vtk-data`, dossier `Data/solar_textures`, commit
`5a3de12d34c24aa5dd5e5db1cbc2defebc0d4da3`), dont le README confirme la
provenance et la licence CC BY 4.0. Le site d'origine n'était pas joignable
depuis l'environnement de développement.

Pour Vénus, la texture d'**atmosphère** est utilisée : c'est l'aspect visible
de la planète (la surface est cachée par les nuages).

### Étoiles

`stars.6.json` du paquet npm `d3-celestial@0.7.35` : étoiles jusqu'à la
magnitude 6 du catalogue XHIP (*An Extended Hipparcos Compilation*,
Anderson E., Francis C., 2012, VizieR V/137D). Converti par
`scripts/build-stars.mjs` en tableau compact
`[ascension droite J2000 (°), déclinaison J2000 (°), magnitude, B−V]`.
Le script vérifie la position de quatre étoiles connues (Sirius, Polaris,
Bételgeuse, Véga).

Les étoiles sont affichées à leur position réelle, dans le même repère
(écliptique J2000) que les planètes.

## Régénérer les ressources

```bash
scripts/fetch-texture-sources.sh .texture-sources
pip install pillow numpy
python3 scripts/prepare_textures.py .texture-sources public/textures
node scripts/build-stars.mjs .texture-sources/stars.6.json
```

Le dossier `.texture-sources/` est ignoré par Git.

\* Police Jost : https://github.com/indestructible-type/Jost (OFL 1.1),
distribuée par le projet Fontsource. Les fichiers de police sont intégrés au
paquet de l'application lors de la compilation (aucun accès réseau).
