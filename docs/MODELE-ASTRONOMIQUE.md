# Modèle astronomique : méthodes, conventions et limites

Ce document décrit ce que calcule l'application, avec quelle méthode, dans
quel repère et avec quelle précision. Les écarts annoncés ont été **mesurés**
(voir docs/TESTS.md) en comparant le modèle à la bibliothèque
[astronomy-engine](https://github.com/cosinekitty/astronomy) (Don Cross,
modèles VSOP87 et NOVAS), utilisée uniquement dans les tests.

## 1. Temps

| Grandeur | Définition dans l'application |
|---|---|
| Instant de référence | millisecondes Unix en **UTC** (`Date.now()`) |
| Heure affichée | heure **locale** de l'appareil (fuseau configuré sur le Fire TV) |
| Temps des éphémérides | **TT** (Temps Terrestre) ; TDB ≈ TT (écart < 2 ms, ignoré) |
| Temps de la rotation terrestre | **UT1**, approché par UTC (écart < 0,9 s) |

Conversion UTC → TT :

- depuis 1972 : TT = UTC + (TAI − UTC) + 32,184 s, avec la table officielle des
  secondes intercalaires (IERS). Depuis le 1er janvier 2017 : TT − UTC = 69,184 s.
  La valeur est figée pour le futur (les secondes intercalaires futures sont
  inconnues) ;
- avant 1972 : TT = UT + ΔT, avec ΔT = −20 + 32 u² secondes,
  u = (année − 1820)/100 (Morrison et Stephenson, 2004). Incertitude de quelques
  minutes au Moyen Âge, sans effet visible.

Les dates sont celles du calendrier grégorien proleptique (comportement de
`Date` en JavaScript), y compris avant 1582.

## 2. Positions des planètes

**Méthode** : éléments képlériens moyens et leurs dérivées séculaires, d'après
E. M. Standish (JPL), *Keplerian Elements for Approximate Positions of the
Major Planets* (https://ssd.jpl.nasa.gov/planets/approx_pos.html).

- Table 1 (1800–2050) : utilisée entre 1800 et 2050 ;
- Tables 2a et 2b (−3000 à +3000) : utilisées en dehors, avec les termes
  correctifs de Jupiter, Saturne, Uranus et Neptune.

Pour chaque planète et chaque instant T (siècles juliens TT depuis J2000.0) :

1. éléments a, e, I, L, ϖ, Ω à l'instant T (valeur + dérivée × T) ;
2. anomalie moyenne M = L − ϖ (+ b T² + c cos fT + s sin fT pour les tables 2) ;
3. résolution de l'équation de Kepler E − e sin E = M (méthode de Newton,
   précision 10⁻¹³ rad) ;
4. position dans le plan de l'orbite, puis rotations par l'argument du
   périhélie ω = ϖ − Ω, l'inclinaison I et la longitude du nœud Ω.

**Repère** : écliptique et équinoxe moyens de **J2000**, origine au centre du
Soleil (héliocentrique), unité : UA. Toutes les planètes sont calculées pour le
même instant, donc cohérentes entre elles. Sont pris en compte : périodes,
excentricités, inclinaisons, orientations des orbites (nœuds, périhélies) et
leurs lentes variations séculaires.

**Terre** : les éléments de Standish décrivent le **barycentre Terre-Lune**.
L'écart avec le centre de la Terre (≤ 4 700 km) représente moins de 7″ vu du
Soleil ; il est négligé.

**Précision mesurée** (écart angulaire maximal de la direction héliocentrique
par rapport à astronomy-engine, 2 000 instants répartis sur la période) :

| Planète | 1800–2050 (max / moyenne) | 1000–3000 (max / moyenne) |
|---|---|---|
| Mercure | 25″ / 6″ | 114″ / 24″ |
| Vénus | 27″ / 10″ | 57″ / 22″ |
| Terre (barycentre) | 25″ / 8″ | 49″ / 16″ |
| Mars | 98″ / 24″ | 175″ / 51″ |
| Jupiter | 519″ / 169″ | 780″ / 201″ |
| Saturne | 731″ / 300″ | 1 560″ / 501″ |
| Uranus | 122″ / 43″ | 1 252″ / 441″ |
| Neptune | 72″ / 25″ | 521″ / 140″ |

Soit au pire environ **12 minutes d'arc** (Saturne) entre 1800 et 2050 :
largement inférieur à ce que l'on peut distinguer à l'écran, mais ce ne sont
**pas des éphémérides de haute précision** (type DE440 ou VSOP87 complet). Elles
ne conviennent pas, par exemple, au calcul d'occultations ou de passages.

**Domaine de validité** : années −3000 à +3000. La simulation s'arrête aux
limites −2999 / 2999 (message « Limite du modèle atteinte »).

## 3. Repères et orientation de la Terre

Chaîne de passage du repère écliptique J2000 au repère terrestre :

```
r_terrestre = R3(TSMG) · P(T) · R1(−ε0) · r_écliptique
```

| Étape | Modèle |
|---|---|
| R1(−ε0) | écliptique → équateur J2000, ε0 = 23° 26′ 21,448″ (IAU 1976) |
| P(T) | précession IAU 1976 (Lieske et al. 1977) vers l'équateur moyen de la date |
| R3(TSMG) | temps sidéral moyen de Greenwich (IAU 1982, formule 12.4 de Meeus) en UT1 ≈ UTC |

Le repère terrestre a son axe x vers le méridien de Greenwich (0°, 0°), son
axe y vers 90° E et son axe z vers le pôle Nord. La rotation sidérale (23 h
56 min 4 s) en découle directement : elle n'est pas animée « à part ».

Négligés : nutation (au plus 1,1 s de temps sur l'angle horaire), mouvement du
pôle (quelques mètres), UT1 − UTC (< 0,9 s), aberration annuelle (20″).

**Mesures** : écart entre le temps sidéral moyen et le temps sidéral apparent
d'astronomy-engine ≤ 1,16 s de temps (c'est l'équation des équinoxes,
négligée) ; écart sur le point subsolaire ≤ **0,01°** (2 000 instants de 1990 à
2043).

## 4. Jour, nuit et terminateur

La direction du Soleil vue de la Terre est l'opposé de la position
héliocentrique de la Terre. Ramenée dans le repère terrestre, elle donne le
**point subsolaire** (Soleil au zénith). En chaque point de la surface, le
cosinus de l'angle zénithal du Soleil est `dot(normale, direction du Soleil)` :

- positif : jour ; négatif : nuit ; nul : **terminateur** (grand cercle à 90°
  du point subsolaire).

Le shader de la Terre (`src/scene/shaders.ts`) reçoit cette direction, calculée
par le modèle (jamais par la caméra), et applique :

- un éclairage diffuse en cos(angle zénithal) ;
- une transition adoucie sur ±6° autour du terminateur (crépuscule civil),
  sans réfraction atmosphérique (le Soleil réel reste visible environ 0,8°
  sous l'horizon géométrique) ;
- les lumières des villes uniquement au-delà du terminateur. Un contrôle de bout
  en bout vérifie que leur activation ne modifie aucun pixel côté jour ;
- les nuages : une image **figée** (composite NASA), sans rapport avec la météo
  du moment ;
- le reflet du Soleil sur les océans et un halo atmosphérique côté jour.

Vérifications : test unitaire (le point subsolaire transmis au shader est
identique, à 10⁻⁴ ° près, au point subsolaire calculé) et test de bout en bout
dans le navigateur (luminosité des pixels rendus conforme au jour/nuit calculé,
AUC = 1,000 au solstice de juin 2024 et 6 h plus tard).

## 5. Orientation des autres corps

Modèles du groupe de travail IAU WGCCRE (Archinal et al., 2011) : direction du
pôle nord (α0, δ0) et angle du méridien origine W = W0 + Ẇ·d. Les termes
périodiques (< 1°) sont négligés. Cela donne la bonne inclinaison de l'axe
(Uranus couchée à 97,8°, anneaux de Saturne dans le plan équatorial réel) et la
bonne vitesse de rotation (Jupiter : 9 h 55 min). Pour les géantes gazeuses, le
méridien origine ne correspond à aucun motif des textures : seule la rotation
est significative.

## 6. Représentation visuelle (ce qui n'est PAS à l'échelle)

Les distances réelles (de 0,39 à 30 UA) et les tailles réelles (Jupiter est
11 fois plus grande que la Terre, le Soleil 109 fois) sont incompatibles avec
un écran. La représentation (`src/representation/visualScale.ts`) applique une
transformation **déterministe et documentée** :

- **direction conservée exactement** : position affichée = f(|r|) · r / |r| ;
  longitude et latitude héliocentriques sont inchangées (testé à 10⁻⁹ près) ;
- **distance** f(r) : interpolation cubique monotone (Fritsch-Carlson) entre
  les points suivants, strictement croissante, donc l'ordre des distances et
  les excentricités restent visibles :

| Distance réelle (UA) | 0 | 0,387 | 0,723 | 1,000 | 1,524 | 5,203 | 9,537 | 19,19 | 30,07 |
|---|---|---|---|---|---|---|---|---|---|
| Distance affichée (unités de scène) | 0 | 3,3 | 4,75 | 6,0 | 7,5 | 10,4 | 13,9 | 17,1 | 19,9 |

- **tailles** fixes, choisies pour la lisibilité : Soleil 1,35 ; Mercure 0,26 ;
  Vénus 0,40 ; Terre 0,45 ; Mars 0,33 ; Jupiter 0,92 ; Saturne 0,72 (anneaux
  de 1,24 à 2,27 rayons de Saturne, proportions réelles) ; Uranus 0,55 ;
  Neptune 0,54.

Un test vérifie qu'entre 1800 et 2200 aucune planète (anneaux compris) ne
chevauche le Soleil ni l'orbite d'une voisine. Les orbites tracées sont les
ellipses réelles transformées par la même fonction : chaque planète est
exactement sur sa courbe. Les vitesses angulaires sont donc réelles (Mercure
fait le tour en 88 jours, Neptune en 165 ans).

L'éclairage de chaque planète utilise la vraie direction du Soleil (la
transformation radiale ne change pas les directions vues du Soleil).

Les étoiles (catalogue XHIP, magnitude ≤ 6) sont placées à leur position J2000
dans le même repère : la vue générale montre donc les planètes devant les
constellations où elles se trouvent réellement, vues du Soleil.

### Satellites (version 2)

Les lunes et l'ISS n'apparaissent qu'en vue rapprochée de leur planète ; la
vue générale est inchangée. Même principe (`src/representation/satellites.ts`) :

- **direction exacte** vue de la planète (testé à 10⁻¹² rad près) ;
- **distance** : Rv · g(r / Rp), avec Rv le rayon affiché de la planète, Rp
  son rayon réel, g(x) = x jusqu'à 3 rayons (échelle respectée : Phobos,
  ISS), puis g(x) = 3 + ln(x / 3) (compression logarithmique, strictement
  croissante). Exemples : Lune 60,3 Rp → 6,0 Rv ; Titan 21 Rp → 4,9 Rv ;
  Japet 61 Rp → 6,0 Rv ; Mimas 3,2 Rp → 3,06 Rv, au-delà des anneaux ;
- **taille des lunes** : Rv · 0,6 · √(R / Rp) (l'ordre des tailles est
  conservé, les petites lunes sont grossies pour rester visibles) ;
- **ISS** : altitude à l'échelle de la Terre ; maquette agrandie environ
  1 500 fois (envergure réelle 109 m).

### Soleil en vue rapprochée (version 2)

En vue générale, le Soleil garde son rayon fixe de 1,35. En vue rapprochée
(planète, lune, ISS), il est affiché à sa **taille apparente réelle** vue du
corps observé : voir la section 10.

## 7. Informations affichées

Le panneau de la vue rapprochée n'affiche que des valeurs issues du modèle ou
des données de référence : distance réelle au Soleil et à la Terre (UA et km),
taille apparente du Soleil vue de la planète (section 10), point subsolaire,
saison astronomique de l'hémisphère nord (longitude du Soleil rapportée à
l'équinoxe de la date), période orbitale, période de rotation, diamètre et
inclinaison de l'axe réels.

Fiches des lunes : diamètre (rayon moyen JPL ; dimensions triaxiales de
l'en-tête Horizons pour Phobos et Déimos), distance actuelle à la planète
(modèle), période sidérale (moyen mouvement ajusté), inclinaison de l'orbite
sur l'équateur de la planète (sur l'écliptique pour la Lune) à l'instant
affiché, sens du mouvement par rapport à la rotation de la planète,
excentricité, découverte, et rappel de la précision. Fiche de l'ISS : voir la
section 9.

## 8. Lunes (version 2)

### Données et modèle

| Planète | Lunes |
|---|---|
| Mercure, Vénus | aucune (aucune lune n'est affichée) |
| Terre | Lune |
| Mars | Phobos, Déimos |
| Jupiter | Io, Europe, Ganymède, Callisto |
| Saturne | Mimas, Encelade, Téthys, Dioné, Rhéa, Titan, Japet |
| Uranus | Miranda, Ariel, Umbriel, Titania, Obéron |
| Neptune | Protée, Triton, Néréide |

**Lune** (`src/astro/moon.ts`) : formules de faible précision de
l'*Astronomical Almanac* (longitude, latitude et parallaxe sous forme de six,
quatre et cinq termes périodiques), rapportées à l'écliptique de la date puis
ramenées dans l'écliptique J2000 (obliquité et précession IAU 1976). Précision
annoncée par l'Almanac : 0,3° en longitude, 0,2° en latitude (1900–2100).
Mesurée contre astronomy-engine : **0,36° au plus et 0,31 % sur la distance**
de 1900 à 2100 (0,38° de 1500 à 1900 et de 2100 à 2999 ; 2,1° entre −1000 et
0, où les termes séculaires omis et l'incertitude de ΔT dominent).

**Autres lunes** (`src/astro/moons.ts`, données `src/data/moonOrbits.json`) :
aucune source accessible ne fournissait de théories analytiques libres de
droits pour toutes ces lunes (les éléments moyens publiés par le JPL ne sont,
selon le JPL lui-même, pas destinés au calcul d'éphémérides). Le projet a donc
**ajusté ses propres éléments** sur les vecteurs d'état officiels **JPL
Horizons** (éphémérides mar099, jup365, sat441, ura184, nep098) :

1. source : paquets npm `astraeus-data-<planète>@0.3.0` (licence MIT), qui
   distribuent des ajustements de Tchebychev des sorties de l'API Horizons
   (repère ICRF, km, TDB, 2010–2030 ; écart à Horizons inférieur au mètre
   selon leur index) ; empreintes SHA-256 vérifiées par
   `scripts/moons/fetch-horizons-fits.sh` ;
2. `scripts/moons/fit-moon-elements.mjs` relit ces séries (décodeur réécrit)
   et ajuste par moindres carrés (Levenberg-Marquardt, 3 000 instants) une
   ellipse képlérienne dont le nœud et le péricentre tournent uniformément
   (λ = λ0 + n·t, ϖ = ϖ0 + ϖ′·t, Ω = Ω0 + Ω′·t), autour d'un plan de
   référence fixe : plan de Laplace tabulé par le JPL pour Ganymède,
   Callisto, Titan et Japet (précession lente), plan ajusté sur les données
   pour les autres ;
3. pour les lunes en résonance, une libration sinusoïdale de la longitude
   moyenne est ajoutée si elle divise au moins par deux l'écart : Mimas
   (47° sur 78 ans, conforme à la grande libération connue de la résonance
   Mimas–Téthys), Téthys, Encelade, Miranda, Ariel ;
4. l'écart au modèle JPL est mesuré sur 20 000 instants de 2010–2030 ; un test
   d'extrapolation réajuste le modèle sur 2010–2020 et le compare aux données
   de 2020–2030 (ordre de grandeur de la dégradation hors de la période).

Le script est déterministe : relancé sur des sources fraîchement
téléchargées, il redonne un fichier identique octet pour octet (vérifié).

### Précision mesurée

Écart angulaire vu de la planète (et en km) entre le modèle embarqué et JPL
Horizons :

| Lune | Éphéméride JPL | a (km) | Période (j) | e | Libration | Écart max. 2010–2030 | Extrapolation 10 ans (test) |
|---|---|---|---|---|---|---|---|
| Phobos | mar099 | 9 375 | 0,3189 | 0,0151 | — | 15 km (0,094°) | 46 km (0,28°) |
| Déimos | mar099 | 23 458 | 1,2624 | 0,0002 | — | 59 km (0,143°) | 138 km (0,34°) |
| Io | jup365_merged | 421 766 | 1,7691 | 0,0041 | — | 201 km (0,027°) | 235 km (0,03°) |
| Europe | jup365_merged | 671 061 | 3,5512 | 0,0093 | — | 1 449 km (0,124°) | 1 410 km (0,12°) |
| Ganymède | jup365_merged | 1 070 434 | 7,1546 | 0,0019 | — | 2 351 km (0,126°) | 2 982 km (0,16°) |
| Callisto | jup365_merged | 1 882 738 | 16,6890 | 0,0073 | — | 1 639 km (0,050°) | 2 544 km (0,08°) |
| Mimas | sat441l | 185 479 | 0,9424 | 0,0196 | 47,09° / 78,4 ans | 776 km (0,244°) | 2 300 km (0,72°) |
| Encelade | sat441l | 238 035 | 1,3702 | 0,0047 | 0,26° / 10,6 ans | 926 km (0,224°) | 4 014 km (0,96°) |
| Téthys | sat441l | 294 673 | 1,8878 | 0,0001 | 2,14° / 75,8 ans | 120 km (0,023°) | 261 km (0,05°) |
| Dioné | sat441l | 377 416 | 2,7369 | 0,0022 | — | 374 km (0,057°) | 608 km (0,09°) |
| Rhéa | sat441l | 527 068 | 4,5175 | 0,0009 | — | 331 km (0,036°) | 620 km (0,07°) |
| Titan | sat441l | 1 221 865 | 15,9454 | 0,0287 | — | 650 km (0,031°) | 1 974 km (0,10°) |
| Japet | sat441l | 3 561 223 | 79,3307 | 0,0285 | — | 6 208 km (0,103°) | 11 340 km (0,19°) |
| Miranda | ura184_merged | 129 844 | 1,4135 | 0,0014 | 1,47° / 12,6 ans | 545 km (0,240°) | 8 514 km (3,76°) |
| Ariel | ura184_merged | 190 929 | 2,5204 | 0,0006 | 0,10° / 12,6 ans | 262 km (0,079°) | 1 039 km (0,31°) |
| Umbriel | ura184_merged | 265 982 | 4,1442 | 0,0038 | — | 556 km (0,120°) | 839 km (0,18°) |
| Titania | ura184_merged | 436 281 | 8,7059 | 0,0017 | — | 1 107 km (0,145°) | 1 187 km (0,16°) |
| Obéron | ura184_merged | 583 446 | 13,4632 | 0,0014 | — | 1 504 km (0,148°) | 1 875 km (0,18°) |
| Protée | nep098_merged | 117 647 | 1,1223 | 0,0005 | — | 87 km (0,043°) | 379 km (0,18°) |
| Triton | nep098_merged | 354 759 | 5,8766 | 0,0001 | — | 2 km (0,000°) | 7 km (0,00°) |
| Néréide | nep098_merged | 5 513 662 | 360,0927 | 0,7455 | — | 17 890 km (0,514°) | 18 080 km (0,44°) |

Contrôle indépendant des satellites galiléens contre la théorie E5 de Lieske
(astronomy-engine, sans lien avec JPL Horizons) : écart maximal 0,04° (Io),
0,13° (Europe), 0,13° (Ganymède) et 0,06° (Callisto) sur 2010–2030 ; 0,10°,
0,15°, 0,54° et 0,15° sur 1900–2100.

**Limites** : hors de 2010–2030, les positions sont **extrapolées** et
l'erreur croît (quelques dixièmes de degré par décennie, beaucoup plus pour
Miranda et Mimas ; au-delà de quelques siècles, la position sur l'orbite n'est
plus significative). La fiche l'indique (« Position extrapolée… »). Les
accélérations séculaires (Phobos) et les perturbations à longue période non
représentées sont négligées.

### Sens du mouvement, inclinaison, rotation

- Le **sens** est jugé par rapport à la rotation de la planète : Triton est
  la seule lune rétrograde de la liste (inclinaison 157° sur l'équateur de
  Neptune). Les lunes d'Uranus sont directes : elles tournent dans le sens de
  rotation d'Uranus, même si leur inclinaison sur le pôle nord IAU d'Uranus
  (pôle du côté nord de l'écliptique, rotation rétrograde) vaut environ 180°.
- **Rotation synchrone simplifiée** : chaque lune montre à sa planète la face
  de longitude 0°, vue depuis la position « moyenne » (mouvement uniforme),
  d'où une libration optique en longitude ; l'inclinaison réelle de l'axe sur
  l'orbite (1,5° pour la Lune) et la libration physique sont négligées.
  Néréide ne tourne pas de façon synchrone, mais elle n'a pas de carte : son
  orientation est sans objet.

### Ombres et éclipses

`src/astro/shadow.ts` calcule l'ombre et la pénombre (deux cônes) de la
planète sur chacun de ses satellites, avec les distances réelles : éclipses de
Lune (l'éclipse totale du 14 mars 2025 est reproduite), éclipses des satellites
galiléens (Io passe environ 5 % de chaque révolution dans l'ombre de Jupiter),
passages de l'ISS dans l'ombre de la Terre (environ 37 % de l'orbite fin
octobre 2026). La teinte rouge de la Lune éclipsée est indicative (lumière
réfractée par l'atmosphère terrestre, non calculée).

## 9. Station spatiale internationale (version 2)

### Source des données

Aucun TLE officiel (CelesTrak, Space-Track) n'était accessible depuis
l'environnement de préparation (accès réseau refusé). La source retenue est
l'**éphéméride prévisionnelle officielle de la NASA** :

| Élément | Valeur |
|---|---|
| Fichier | `ISS.OEM_J2K_EPH.txt` (CCSDS OEM 2.0) |
| Adresse | https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt |
| Producteur | NASA/JSC/FOD/TOPO (Flight Operations Directorate, Johnson Space Center) |
| Création | 2026-10-28 15:03:19 UTC |
| Période couverte | 2026-10-28 12:00 → 2026-11-12 12:00 UTC (5 401 vecteurs d'état, toutes les 4 min) |
| Repère, temps | EME2000, UTC |
| Récupéré le | 2026-10-29 13:48:43 UTC |
| Empreinte SHA-256 | c46cf389be3d6510052cb6997714034f065cdc964bbc9de0c389d43b6be0ab2d |

### Méthode

`scripts/iss/fit-iss-elements.mjs` convertit chaque vecteur d'état EME2000
en TEME (précession-nutation IAU 2000B et équation des équinoxes,
astronomy-engine), puis ajuste par moindres carrés (Levenberg–Marquardt, un
vecteur toutes les 12 minutes, fenêtres de 1 jour, 3 jours puis 15 jours) les
sept paramètres SGP4 (moyen mouvement, e·cos ω, e·sin ω, inclinaison, nœud,
ω + M, B*) avec la propagation SGP4 de satellite.js 7.1.0 ; ṅ/2 et n̈/6, que
SGP4 n'utilise pas, valent 0.

**Ce que sont ces éléments, sans ambiguïté :**

- ce sont des éléments orbitaux **ajustés par le projet** à partir de
  l'éphéméride prévisionnelle de la NASA ci-dessus (`src/data/iss.json`,
  format OMM, époque 2026-10-28 12:00 UTC) ;
- ils sont exploités avec le **modèle SGP4** ;
- ils **ne constituent pas un TLE officiel** : un TLE est produit par l'US
  Space Force à partir d'observations de suivi de la station réelle et
  recalculé après chaque manœuvre, alors que ces éléments décrivent une
  prévision modélisée, figée au moment de la compilation. L'application ne
  les présente jamais comme un TLE ;
- leur précision est évaluée **uniquement par comparaison avec la prévision
  NASA source** ; l'écart à la position réelle de la station n'est pas
  connu (le fichier NASA n'indique aucune précision) ;
- leur **validité est limitée dans le temps** : la période de la prévision,
  puis 7 jours d'extrapolation au plus (voir ci-dessous) ;
- une **manœuvre orbitale non intégrée** à la prévision (rehaussement,
  évitement de débris décidé après sa publication) peut rendre la position
  incorrecte, de centaines de kilomètres ou davantage le long de l'orbite.
  Ordre de grandeur (calcul, pas mesure) : une poussée de 1 m/s relève
  l'orbite d'environ 1,8 km et décale ensuite la station d'environ 260 km
  par jour. La prévision du 28 octobre 2026 ne contient elle-même aucune
  manœuvre (demi-grand axe moyen en baisse régulière de 0,37 km en 15 jours,
  aucune hausse d'une révolution à l'autre).

- Écart à la prévision NASA sur toute la période : **0,80 km (moyenne
  quadratique), 2,13 km au plus** (2,18 km au plus pour la chaîne complète de
  l'application, nutation négligée comprise).
- Vieillissement (éléments ajustés sur les 3 premiers jours seulement,
  comparés aux jours suivants) : 1,2 km au jour 3, 5,7 km au jour 5,
  11 km au jour 7, 26 km au jour 10, 59 km au jour 15.
- SGP4 (satellite.js) reproduit les cas de vérification officiels de
  Vallado et al. (2006) à mieux que 1 cm (tests).

Dans l'application (`src/astro/iss.ts`), SGP4 est évalué au temps de
l'application (temps réel, pause, accélération, autre date), à chaque image
pour un mouvement fluide. TEME est assimilé à l'équateur moyen de la date et
ramené dans l'écliptique J2000 par la précession inverse ; la nutation
négligée représente moins de 0,6 km. Écart total mesuré à l'éphéméride NASA :
moins de 3 km.

### Politique de validité

Règle du projet (`src/astro/iss.ts`), avec les données embarquées :

| État | Période (UTC) | Affichage |
|---|---|---|
| Nominal | du 28 octobre 2026, 12 h 00, au **12 novembre 2026, 12 h 00** (période de la prévision, dernier instant compris) | fiche « Validité : Prévision NASA du 28 octobre 2026 » ; note : écart ≤ 3 km **avec cette prévision**, et non avec la position réelle de la station |
| Extrapolation | du 12 novembre, 12 h 00 (exclu), au **19 novembre 2026, 12 h 00** (7 jours) | liste et fiche « Extrapolation », ligne « Prévision expirée depuis … » ; note : aucune précision garantie, une manœuvre orbitale non intégrée peut décaler la station de centaines de kilomètres ou davantage |
| Masquée | à partir du 19 novembre 2026, 12 h 00 (exclu) | ISS retirée de la liste et de la scène ; la liste « Satellites » de la Terre indique que la prévision a expiré et que les données doivent être actualisées ; si l'ISS était affichée, retour à la Terre avec un message |
| Masquée | plus de 7 jours avant le début de la prévision | « aucune donnée orbitale embarquée pour cette date » |
| Masquée | avant le 20 novembre 1998, 06 h 40 (lancement de Zarya) | « pas encore en orbite à cette date » |

L'ancien seuil de 30 jours (position « indicative ») est supprimé. Le plafond
d'utilisation des données retenu par le projet est de 14 jours après la fin
de la prévision ; la règle appliquée (7 jours) reste en deçà, ce que vérifient
les tests. Ces durées sont des choix du projet, non des mesures : en
l'absence de manœuvre, l'extrapolation SGP4 resterait proche de la
trajectoire prévue (éléments ajustés sur 7,5 jours : moins de 2,5 km sur les
7,5 jours suivants ; sur 3 jours : 26 km au bout de 7 jours), mais une
manœuvre non prévue ne peut pas être exclue. Le temps affiché est celui de
l'application : en temps réel, l'horloge du Fire TV ; la règle s'applique
aussi en pause, en accélération et après un changement de date (la liste des
satellites est mise à jour aussitôt).

Pour actualiser : `npm run data:iss` sur un ordinateur connecté (télécharge
la dernière prévision NASA, refait l'ajustement SGP4 et met à jour les
métadonnées : date de création, période, récupération, empreinte), puis
`npm test`, `npm run build` et recompilation de l'APK. L'application continue
de fonctionner hors ligne avec les dernières données embarquées. Vérifié le
30 octobre 2026 : le script récupère et ajuste le fichier en ligne ; la NASA
n'ayant pas encore publié de prévision plus récente (même empreinte
SHA-256, même date de création), les données embarquées n'ont pas été
changées.

## 10. Taille apparente du Soleil (version 2)

Diamètre angulaire d'une sphère de diamètre D vue à la distance r :
**θ = 2·arcsin(D / 2r)**, avec D = 2 × 695 700 km (rayon nominal IAU) et r
la distance réelle Soleil–corps à l'instant affiché (`src/astro/sun.ts`).

| Depuis | θ (exemple du 29 octobre 2026) |
|---|---|
| Mercure (0,344 UA) | 1,55° (93′) — de 1,14° à 1,73° selon la position sur l'orbite |
| Terre (0,993 UA) | 0,54° (32′) — de 0,524° (aphélie) à 0,542° (périhélie) |
| Jupiter (5,31 UA) | 0,10° (6′) |
| Saturne (9,43 UA) | 3,4′ |
| Neptune (29,9 UA) | 1,1′ |

Affichage (`src/representation/sunScale.ts`) : le Soleil étant au centre de
la scène, un disque de rayon R vu de la caméra à la distance d sous-tend
2·arcsin(R/d) ; avec R = d · R☉ / r, l'angle affiché est **exactement** θ,
quelles que soient la distance affichée et la position de la caméra. Pendant
la transition vers une vue rapprochée, le rayon passe progressivement (en
échelle logarithmique) de 1,35 à cette valeur. Le halo garde un diamètre
minimal de 0,9° pour que le Soleil reste visible de loin comme une étoile très
brillante. La vue « Soleil » (barre d'actions) place la caméra du côté nuit,
avec le Soleil à 22° de l'axe de visée, à gauche du corps.
