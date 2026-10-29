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
| `public/textures/moons/moon.jpg` (V2) | Lune | Solar System Scope (d'après des données NASA), même miroir que les planètes | **CC BY 4.0** — attribution obligatoire |
| `public/textures/moons/{io,europa,ganymede,callisto}.jpg` (V2) | Satellites galiléens | USGS Astrogeology Science Center ; NASA/JPL, missions Galileo et Voyager | Domaine public |
| `public/textures/moons/{mimas,titan}.jpg` (V2) | Mimas, Titan | NASA/JPL-Caltech/Space Science Institute (Cassini) | Politique d'images NASA/JPL : **crédit obligatoire** |
| `public/textures/moons/{enceladus,tethys,dione,rhea,iapetus}.jpg` (V2) | Lunes glacées de Saturne | NASA/JPL-Caltech/Space Science Institute/Lunar and Planetary Institute | Politique d'images NASA/JPL : **crédit obligatoire** |
| `public/textures/moons/triton.jpg` (V2) | Triton | NASA/JPL-Caltech/Lunar & Planetary Institute (Voyager 2) | Politique d'images NASA/JPL : **crédit obligatoire** |
| `public/textures/moons/{phobos,deimos,miranda,ariel,umbriel,titania,oberon}.jpg` (V2) | Lunes de Mars et d'Uranus | NASA 3D Resources (« free and without copyright ») | Ressources NASA, consignes d'usage des médias NASA |
| `src/data/moonOrbits.json` (V2) | Éléments orbitaux ajustés de 21 lunes | Calculés par le projet à partir de vecteurs d'état JPL Horizons (NASA/JPL-Caltech SSD) distribués par les paquets npm `astraeus-data-*` | Données NASA/JPL (travail du gouvernement américain, crédit) ; paquets MIT ([`licences/astraeus-data-MIT.txt`](licences/astraeus-data-MIT.txt)) |
| `src/data/iss.json` (V2) | Éléments SGP4 de l'ISS | Calculés par le projet à partir de l'éphéméride NASA JSC FOD/TOPO (`ISS.OEM_J2K_EPH.txt`) | Données NASA (travail du gouvernement américain) |
| Paquet npm `satellite.js` 7.1.0 (V2, embarqué) | Propagateur SGP4 | Shashwat Kandadai et contributeurs (d'après D. Vallado) | **MIT** ([`licences/satellite.js-MIT.txt`](licences/satellite.js-MIT.txt)) |
| `tests/fixtures/sgp4-verification.json` (V2, tests seulement) | Cas de vérification SGP4 | Vallado et al. 2006 (AIAA 2006-6753), fichiers du paquet Python `sgp4` 2.25 | Paquet MIT ([`licences/python-sgp4-MIT.txt`](licences/python-sgp4-MIT.txt)) |

## Attribution exigée (CC BY 4.0)

> Textures des planètes, du Soleil et des anneaux de Saturne : © Solar System
> Scope — https://www.solarsystemscope.com/textures/ — distribuées sous licence
> Creative Commons Attribution 4.0 International
> (https://creativecommons.org/licenses/by/4.0/).
> **Modifications** : redimensionnement en 1024 × 512 pixels et recompression
> JPEG ; profil radial moyenné et réduit à 1024 × 4 pixels pour les anneaux.

Cette attribution est également affichée dans l'application (panneau
« Réglages », rubrique « Crédits »), de même que les crédits NASA/JPL-Caltech
/Space Science Institute/Lunar and Planetary Institute, USGS Astrogeology,
NASA 3D Resources, JPL Horizons, NASA JSC et satellite.js (version 2).

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

### Lunes : cartes (version 2)

Sources récupérées par `scripts/moons/fetch-moon-texture-sources.sh`,
transformées par `scripts/moons/prepare_moon_textures.py` (empreintes
SHA-256 des 20 sources vérifiées) :

- paquet npm `astraeus-data@0.3.0` (code MIT ; chaque image garde ses droits,
  consignés par le paquet avec sa source) : cartes USGS des satellites
  galiléens (mosaïques Galileo/Voyager, 2048 × 1024) et cartes Cassini de
  Mimas (PIA17214), Encelade (PIA18435), Téthys (PIA18439), Dioné (PIA18434),
  Rhéa (PIA18438), Japet (PIA18436), Titan (PIA19658), et carte Voyager 2 de
  Triton (PIA18668) ;
- dépôt `github.com/nasa/NASA-3D-Resources` (commit `11ebb4e`) : Phobos,
  Déimos, Miranda, Ariel, Umbriel, Titania, Obéron ;
- Lune : `moon.jpg` de Solar System Scope (CC BY 4.0), même miroir PyVista que
  les planètes.

Traitements :

1. toutes les cartes sont ramenées à la convention des planètes (longitude 0°
   au centre, longitudes est vers la droite). La convention de chaque source a
   été **vérifiée sur des repères connus** : cratère Herschel (Mimas), cratère
   Odysseus (Téthys), bassin Valhalla (Callisto), région sombre Galileo
   (Ganymède), hémisphère arrière sombre d'Europe, falaises de l'hémisphère
   arrière de Dioné et Rhéa, Cassini Regio (Japet), volcan Pele (Io), cratère
   Stickney (Phobos) et cratère Wunda (Umbriel), ces deux derniers
   approximativement ; Titan d'après l'étiquetage de
   la carte (360° O au bord gauche). Les cartes centrées sur 180° sont décalées
   d'une demi-largeur. L'orientation de la carte de Triton n'a pas pu être
   vérifiée sur un repère ;
2. **zones jamais photographiées** (nord des lunes d'Uranus : 56 à 62 % de la
   carte ; nord de Triton : 38 % ; lacunes de Callisto et d'Europe) : remplies
   par la teinte moyenne de la surface connue, sans relief inventé ;
3. Titan : la carte d'albédo de surface (proche infrarouge) est teintée en
   orange et atténuée à 14 % de contraste, car en lumière visible une brume
   épaisse masque la surface ;
4. redimensionnement en 1024 × 512 (2048 × 1024 pour la Lune), JPEG qualité 88.

Protée et Néréide n'ont pas de carte globale publiée : elles sont affichées
d'une couleur uniforme.

### Lunes : orbites (version 2)

Voir docs/MODELE-ASTRONOMIQUE.md, section 8. Sources : paquets npm
`astraeus-data-{mars,jupiter,saturn,uranus,neptune}@0.3.0` (ajustements de
Tchebychev de l'API JPL Horizons 1.2, éphémérides mar099, jup365, sat441,
ura184, nep098, récupérées par leur auteur du 17 au 20 octobre 2026),
empreintes SHA-256 dans `scripts/moons/fetch-horizons-fits.sh`. Rayons moyens
et années de découverte : JPL SSD (*Planetary Satellite Physical Parameters*,
*Discovery Circumstances*) ; pôles des plans de Laplace de Ganymède, Callisto,
Titan et Japet : JPL SSD (*Planetary Satellite Mean Elements*), relevés dans
le paquet `astraeus` 0.3.0 (consultés par son auteur le 17 octobre 2026).

### ISS (version 2)

Voir docs/MODELE-ASTRONOMIQUE.md, section 9 (source, date de création, date
de récupération, empreinte, méthode, validité). Mise à jour :
`npm run data:iss` sur un ordinateur connecté, puis recompilation.

## Régénérer les ressources

```bash
scripts/fetch-texture-sources.sh .texture-sources
pip install pillow numpy
python3 scripts/prepare_textures.py .texture-sources public/textures
node scripts/build-stars.mjs .texture-sources/stars.6.json
```

Le dossier `.texture-sources/` est ignoré par Git.

Version 2 :

```bash
scripts/moons/fetch-moon-texture-sources.sh .moon-texture-sources
python3 scripts/moons/prepare_moon_textures.py .moon-texture-sources public/textures/moons
npm run data:moons     # éléments orbitaux des lunes (≈ 150 Mo téléchargés, quelques minutes)
npm run data:iss       # éléments de l'ISS (éphéméride NASA du jour)
```

\* Police Jost : https://github.com/indestructible-type/Jost (OFL 1.1),
distribuée par le projet Fontsource. Les fichiers de police sont intégrés au
paquet de l'application lors de la compilation (aucun accès réseau).
