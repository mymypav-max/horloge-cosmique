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
  Déimos, Miranda, Ariel, Umbriel, Titania, Obéron — cartes 1440 × 720 du
  JPL Solar System Simulator (fichiers de 2008, sans géoréférencement).
  Phobos et Déimos : cartes en relief ombré **dessinées** (pour Déimos :
  carte tirée d'images Viking et traitée à l'USGS) ; lunes d'Uranus :
  mosaïques Voyager 2 ;
- Lune : `moon.jpg` de Solar System Scope (CC BY 4.0), même miroir PyVista que
  les planètes.

Traitements :

1. toutes les cartes sont ramenées à la convention des planètes (longitude 0°
   au centre, longitudes est vers la droite, nord IAU en haut). Les cartes
   centrées sur 180° sont décalées d'une demi-largeur. L'orientation de
   **chaque** carte a été vérifiée sur des repères connus (tableau
   ci-dessous) ;
2. **zones sans données** remplies par la teinte moyenne de la surface
   connue, sans relief inventé, avec un fondu de quelques pixels. Part de la
   carte remplie (marge de fondu comprise) : Miranda 57,5 %, Ariel 62,2 %,
   Umbriel 59,6 %, Titania 63,1 %, Obéron 62,0 % (hémisphère nord, jamais
   photographié par Voyager 2), Triton 39,6 % (idem), Déimos 18,8 % (voir
   ci-dessous), Europe 5,0 % et Callisto 4,1 % (lacunes des mosaïques).
   Ces zones sont signalées dans les fiches de l'application ;
3. Titan : la carte d'albédo de surface (proche infrarouge) est teintée en
   orange et atténuée à 14 % de contraste, car en lumière visible une brume
   épaisse masque la surface ;
4. Déimos (version 2, consolidation) : voir ci-dessous ;
5. redimensionnement en 1024 × 512 (2048 × 1024 pour la Lune), JPEG qualité 88.

Protée et Néréide n'ont pas de carte globale publiée : elles sont affichées
d'une couleur uniforme (teinte choisie par le projet, pas une mesure).

#### Déimos : zone non cartographiée et raccords

- **Origine de la zone grise** : la carte source est une carte en relief
  ombré dessinée d'après les images Viking. Les régions qui n'ont pas pu être
  cartographiées à partir de ces images sont restées au fond de la carte : un
  gris clair uniforme
  (niveau ≈ 190, contre ≈ 120 pour la surface dessinée), sans aucune texture,
  qui portait encore un trait de graduation et le début du libellé « 180 ».
  Cette zone représente 16,2 % des pixels de la carte, soit environ 10,5 % de
  la surface : latitudes de 6° S au pôle Nord, surtout sur l'hémisphère
  opposé à Mars (18 % de cet hémisphère, contre 2,9 % de la face tournée vers
  Mars). Avant correction, elle était affichée comme une surface claire et
  lisse, et n'était signalée nulle part.
- **Meilleure source recherchée (30 octobre 2026)** : la recherche n'a trouvé
  que la même carte USGS d'après Viking, et une carte composite non
  officielle (sans licence claire). Des observations plus récentes existent
  (caméra HiRISE en 2009, sonde Hope des Émirats arabes unis en 2023), mais
  aucune carte globale publiée et accessible ne les intègre. Le catalogue de
  cartes de l'USGS accessible en ligne (dépôt Astropedia) ne contient pas de
  mosaïque de Déimos ; les sites de l'USGS et du JPL n'étaient pas accessibles
  depuis l'environnement de préparation (règles réseau). La carte actuelle est
  donc conservée.
- **Raccords de tuiles** : la mosaïque source présente quatre raccords (lignes
  160 et 560 sur toute la largeur, colonnes 280 et 680 entre ces deux lignes),
  avec des marches de luminosité atteignant 32 niveaux, mesurées aussi sur le
  fond uniforme : ce sont des défauts de mosaïque, non du relief. Chaque marche
  est mesurée le long du raccord, lissée (fenêtre de 61 pixels, 31 pour les
  raccords verticaux) puis compensée par une rampe douce de 24 pixels de part
  et d'autre. Marche moyenne après correction : 0,8 à 2 niveaux (contre 4 à
  13). Aucun détail n'est ajouté ni déplacé. Le liseré sombre du méridien 180°
  et de la dernière ligne est remplacé par la valeur des voisines.
- **Zone non cartographiée** : détectée comme les zones lisses (écart-type
  local < 3) et claires (> 170), refermée sur 4 pixels (graduation, chiffres),
  en ne gardant que les grandes étendues (≥ 0,5 % de la carte, ce qui écarte
  de petites pentes claires du relief), puis remplie par la teinte moyenne de
  la surface dessinée (niveau 130), sans relief ni motif répété. Elle apparaît
  comme une plage grise unie, et la fiche de Déimos indique « Carte
  partiellement reconstituée ».

#### Vérification des orientations

Repères : nomenclature planétaire de l'UAI, fichiers « center points » du
*Gazetteer of Planetary Nomenclature* de l'USGS (dépôt
`asc-planetarynames-data`, téléchargés le 30 octobre 2026). Longitudes est
de 0 à 360°, recoupées avec les fiches du Gazetteer (Samarkand Sulci, Encelade :
327,5° O = 32,5° E ; Voltaire, Déimos : 3,5° O = 356,5° E ; Gertrude,
Titania : 287,1° E). Les formations ont été superposées aux cartes dans la
convention du projet ; une erreur d'orientation (carte inversée, décalée de
180° ou retournée) placerait ces repères sur des terrains sans rapport.

| Lune | Carte (source) | Repères utilisés | Orientation | Correction |
|---|---|---|---|---|
| Triton | Voyager 2, PIA18668 (NASA/JPL-Caltech/LPI) | taches sombres Akupara Maculae (27,5° S, 63° E), Zin Maculae, Viviane Macula ; terrain « cantaloup » de Bubembe Regio (18° N, 335° E) | confirmée | aucune |
| Encelade | Cassini, PIA18435 | paires de cratères Ali Baba (56,8° N, 342,5° E) et Aladdin (62,7° N, 337,9° E), Dunyazad (41,5° N, 158° E) et Shahrazad (46,5° N, 158,4° E) ; Samad | confirmée | aucune |
| Déimos | NASA 3D Resources (USGS, d'après Viking) | cratères Voltaire (22° N, 356,5° E) et Swift (12,5° N, 1,8° E), y compris leur position relative ; graduation « 180 » au bord de la carte source | confirmée (deux repères seulement) | aucune |
| Miranda | NASA 3D Resources (Voyager 2) | Arden Corona (29,1° S, 73,7° E), Elsinore Corona (24,8° S, 257,1° E), Inverness Corona (66,9° S, 325,7° E, « chevron »), Verona Rupes (18,3° S, 347,8° E) | confirmée | aucune |
| Ariel | NASA 3D Resources (Voyager 2) | Kachina (33,7° S, 246° E), Kewpie, Korrigan, Pixie et Sylph Chasmata : tous dans la zone de sillons, alors qu'une carte inversée ou décalée les placerait dans la zone floue sans sillons | confirmée (repères linéaires) | aucune |
| Titania | NASA 3D Resources (Voyager 2) | Messina Chasmata (33,3° S, 335° E, canyon de 1 500 km), Rousillon Rupes (14,7° S, 26,5° E) | confirmée | aucune |
| Obéron | NASA 3D Resources (Voyager 2) | cratères à fond sombre Hamlet (46,1° S, 44,4° E) et Othello (66° S, 42,9° E) | confirmée | aucune |
| Umbriel | NASA 3D Resources (Voyager 2) | Wunda (7,9° S, 273,6° E), Vuver, Skynd | confirmée | aucune |
| Phobos | NASA 3D Resources (relief ombré) | Stickney (1° N, 311° E) et Limtoc (cratère à l'intérieur de Stickney), Drunlo, Opik, Shklovsky | confirmée, à ±10° près (corps irrégulier projeté sur une sphère) | aucune |

Les autres cartes avaient été vérifiées lors de la version 2 : cratère
Herschel (Mimas), cratère Odysseus (Téthys), bassin Valhalla (Callisto),
région sombre Galileo (Ganymède), hémisphère arrière sombre d'Europe,
falaises de l'hémisphère arrière de Dioné et Rhéa, Cassini Regio (Japet),
volcan Pele (Io), face visible de la Lune ; Titan d'après l'étiquetage de la
carte (360° O au bord gauche).

Dans l'application, un test (`tests/satellites.test.ts`) vérifie sur le
maillage réel que la longitude 0 de chaque carte est tournée vers la planète,
que le nord IAU est en haut et que la longitude 90° E se trouve dans le sens
direct autour du nord, y compris pour les lunes dont la rotation est
rétrograde par rapport à leur pôle nord IAU (lunes d'Uranus, Triton). Pour
ces dernières, la caméra suit le sens du mouvement orbital : le pôle sud IAU
apparaît donc en haut de l'image.

#### Mentions affichées dans les fiches

Chaque fiche de lune affiche, sous ses caractéristiques, une ligne
« Représentation » limitée aux réserves qui la concernent
(`src/data/moons.ts`) :

| Lunes | Mentions |
|---|---|
| Lune, Io, Ganymède, Mimas, Encelade, Téthys, Dioné, Rhéa, Japet | Carte photographique |
| Europe, Callisto | Carte partiellement reconstituée |
| Miranda, Ariel, Umbriel, Titania, Obéron, Triton | Carte partiellement reconstituée · Certaines régions n'ont jamais été photographiées |
| Titan | Texture issue d'observations infrarouges · Représentation approximative |
| Phobos | Représentation approximative · Forme représentée par une sphère |
| Déimos | Représentation approximative · Carte partiellement reconstituée · Forme représentée par une sphère |
| Protée, Néréide | Aucune carte photographique disponible · Forme représentée par une sphère |

Pour Déimos, « Certaines régions n'ont jamais été photographiées » n'est pas
affiché : des images plus récentes que Viking existent, même si elles ne sont
pas intégrées à une carte disponible.

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
