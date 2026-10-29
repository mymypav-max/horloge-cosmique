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

## 7. Informations affichées

Le panneau de la vue rapprochée n'affiche que des valeurs issues du modèle ou
des données de référence : distance réelle au Soleil et à la Terre (UA et km),
point subsolaire, saison astronomique de l'hémisphère nord (longitude du
Soleil rapportée à l'équinoxe de la date), période orbitale, période de
rotation, diamètre et inclinaison de l'axe réels.
