# Tests : résultats réels et vérifications restantes

Ce document consigne **ce qui a réellement été exécuté**, avec les résultats
obtenus, et ce qui **n'a pas pu l'être**.

## Environnement de développement utilisé

- Conteneur Linux distant (sans écran, sans GPU, sans Fire TV).
- Node.js 22.22.0, npm 10.9.4.
- Chromium (Playwright 1.63) sans interface, WebGL fourni par **SwiftShader**
  (rendu logiciel sur le processeur).
- Java 21, Gradle 8.14.3 ; **pas** d'accès aux serveurs de Google
  (dl.google.com, maven.google.com) : plugin Android Gradle et SDK Android
  officiels indisponibles.
- Outils Android des paquets Ubuntu 24.04 : aapt, dx (dalvik-exchange),
  zipalign, apksigner ; `android.jar` de l'API 35.

Date des mesures : 29 octobre 2026 (version 1, puis version 2 : lunes, ISS et
taille apparente du Soleil, mesurée le même jour) ; consolidation de la
version 2 (Déimos, validité de l'ISS, fiches des lunes, orientations des
cartes) : 30 octobre 2026.

## Lancer les tests

```bash
npm test             # tests unitaires (Vitest)
npm run typecheck    # TypeScript
npm run build        # compilation de production
npm run test:e2e     # bout en bout (après « npx playwright install chromium »)
```

## 1. Tests unitaires — 215 / 215 réussis

`npm test` : 17 fichiers, 215 tests (143 en version 1, 202 avant la
consolidation de la version 2), durée ≈ 1,9 s.

| Fichier | Tests | Contenu |
|---|---|---|
| `time.test.ts` | 7 | jours juliens (dont exemple 7.a de Meeus), secondes intercalaires, TT − UTC, ΔT avant 1972, J2000.0 |
| `kepler.test.ts` | 8 | équation de Kepler (e de 0 à 0,9), périhélie/aphélie, périodes orbitales (±0,5 %), retour à la même longitude après une période, vitesses angulaires décroissantes de Mercure à Neptune |
| `ephemeris.test.ts` | 27 | positions des 8 planètes comparées à astronomy-engine (1800–2050 et 1000–3000), oppositions de Mars, Jupiter, Saturne, Uranus, Neptune (2024–2025), conjonction de Vénus (mars 2025), périhélie/aphélie 2025, équinoxe de mars 2024 avec précession, continuité au changement de table, domaine de validité |
| `earth.test.ts` | 15 | matrices orthonormées, obliquité, précession (2004,3″/siècle), temps sidéral à J2000 et exemple 12.a de Meeus, comparaison au temps sidéral apparent, jour sidéral, inclinaison de l'axe, point subsolaire aux solstices/équinoxes 2024–2030, solstice de juin 2024, 15°/h, 300 instants comparés à astronomy-engine (< 0,05°), terminateur à 90° exactement, jour/nuit à Paris, changement d'heure |
| `bodyRotation.test.ts` | 15 | inclinaison des axes de 7 planètes (dont Vénus et Uranus rétrogrades), périodes de rotation, Jupiter en 9 h 55 min |
| `representation.test.ts` | 10 | transformation radiale (points de contrôle, monotonie), **conservation exacte des directions héliocentriques**, absence de chevauchement 1800–2200, Jupiter imposante, repère de scène, planètes sur leurs orbites, **direction solaire du globe = point subsolaire**, axe terrestre incliné, planètes déplacées quand la date change |
| `sceneGraph.test.ts` | 6 | scène Three.js sans GPU : présence des objets, lumière du shader terrestre conforme au point subsolaire (10⁻⁴ °), rotation du globe de 90,2° en 6 h, déplacement des planètes avec la date, anneaux de Saturne inclinés, estompage des autres planètes en vue rapprochée (V2 : le Soleil reste visible, à sa taille apparente réelle — attente du test modifiée en conséquence, comme le demande la fonctionnalité B) |
| `navigation.test.ts` | 20 | sélection des planètes, ouverture/fermeture de la vue rapprochée, flèches confiées à la caméra, zoom, barre d'actions, régions, réglages, touches multimédias, double appui sur Retour pour quitter, correspondance des touches (clavier, télécommande, codes Android) |
| `cameraMath.test.ts` | 10 | repère orbital orthonormé, conversions direction ↔ angles, distance de caméra, indépendance vis-à-vis de la rotation du globe, limites d'élévation, courbe de transition, interpolation des poses, lissage indépendant de la cadence |
| `timeController.test.ts` | 8 | temps réel, pause, accélération, changement de vitesse sans saut, paliers, retour à l'heure actuelle, démarrage à une date, arrêt à la limite du modèle |
| `format.test.ts` | 8 | heure 24 h, date longue (« 1er »), années av. J.-C., nombres à la française, vitesses, décalages, coordonnées, périodes |
| `app.test.ts` | 9 | paramètres d'adresse, réglages, détection de qualité (Fire TV, WebGL 1), taille de texture maximale, rendu 1920 × 1080 sur WebView 960 × 540 px CSS, résolution dynamique, saisons (à l'heure près autour de l'équinoxe) |
| `moons.test.ts` (V2) | 19 | catalogue (22 lunes, aucune pour Mercure et Vénus), positions comparées aux vecteurs JPL Horizons (16 instants par lune, écart ≤ écart annoncé), périodes de l'en-tête Horizons (±0,5 %), 3e loi de Kepler (±1 %), **satellites galiléens contre la théorie E5 de Lieske** (< 0,3°), **Lune contre astronomy-engine** (< 0,4° et 0,4 % sur 1900–2100), distance Terre-Lune, Triton seule lune rétrograde, lunes d'Uranus directes, inclinaison de la Lune (≈ 5,1°), déterminisme, continuité (aucun saut, y compris aux bornes 2010 et 2030), sens du mouvement, orbite passant par la lune, extrapolation de −2999 à 2999 sans erreur numérique |
| `iss.test.ts` (V2) | 16 | **cas de vérification officiels de SGP4 (Vallado 2006)** à 1 cm près, provenance des données, altitude/vitesse/période/inclinaison réalistes, écart à l'éphéméride NASA < 3 km ; **règle de validité** (consolidation) : nominale jusqu'au dernier instant de la prévision compris, extrapolation dès la première minute après, jusqu'au dernier instant du 7e jour, ISS masquée à l'instant suivant (données expirées), aucune position au-delà (y compris 12 décembre 2026, ancien seuil de 30 jours, et 2030), plafond de 14 jours respecté, même règle avant la prévision, aucune ISS avant le 20 novembre 1998 ; déterminisme (pause), cohérence avec la vitesse (accélération), orbite passant par la station |
| `sun.test.ts` (V2) | 7 | formule θ = 2·arcsin(D/2r), 0,524° à 0,542° vu de la Terre, **Mercure > Vénus > Terre > … > Neptune**, déterminisme, taille affichée = taille apparente réelle vue de la caméra, vue générale inchangée, transition sans saut, halo minimal |
| `shadow.test.ts` (V2) | 4 | géométrie ombre/pénombre, éclipse totale de Lune du 14 mars 2025, Io dans l'ombre de Jupiter ≈ 5 % du temps, ISS dans l'ombre de la Terre (≤ 42 % de l'orbite) |
| `satellites.test.ts` (V2) | 26 | représentation des satellites (échelle près de la planète puis compression, **direction exacte à 10⁻¹² rad : séparation données astronomiques / affichage**, lunes hors de la planète et des anneaux, ordre des tailles, ISS à l'échelle de la Terre, face synchrone tournée vers la planète), navigation (Mercure et Vénus sans satellites, liste, ouverture, Retour vers la planète puis vue générale, bouton « planète », vue « Soleil », ISS selon les données), caméra (transition qui contourne la planète, caméra repoussée hors de la planète, Soleil à 22° à gauche), fiches (lunes, ISS, ligne « Soleil vu d'ici »), mise en forme ; consolidation : **orientation des cartes sur le maillage réel** (longitude 0 vers la planète, nord IAU en haut, longitude 90° E dans le sens direct, y compris pour les rotations rétrogrades), **mentions de représentation** des 22 lunes (seules les réserves pertinentes), fiche de l'ISS « Prévision NASA du 28 octobre 2026 » avec écart mesuré par rapport à la prévision, « Extrapolation » sans précision garantie, explications quand l'ISS est masquée ; **rotation de la caméra aux flèches** : acceptée seulement en vue stable d'une planète ou d'un satellite (ni en vue générale ni pendant les transitions), rotation autour du satellite à distance constante, arrêt au relâchement |

Correspondance avec le cahier des charges :

| Exigence de test | Couverture |
|---|---|
| Conversions de date et d'heure | `time`, `format` |
| Positions et périodes orbitales | `ephemeris`, `kepler` |
| Transformations entre référentiels | `earth`, `representation`, `sceneGraph` |
| Orientation de la Terre, direction de la lumière | `earth`, `representation`, `sceneGraph`, bout en bout |
| Cohérence du terminateur | `earth` (géométrie), bout en bout (pixels rendus) |
| Navigation, transitions | `navigation`, `cameraMath`, bout en bout |
| Temps réel / simulé | `timeController`, bout en bout (bandeau « Simulation ») |
| Effet réel d'un changement de date sur la scène | `representation`, `sceneGraph`, bout en bout |
| (V2) Données des lunes, positions, mouvement, inclinaisons, sens | `moons`, `satellites` |
| (V2) ISS : SGP4, repères, validité, cohérence temporelle | `iss`, `shadow`, bout en bout |
| (V2) Taille apparente du Soleil | `sun`, bout en bout |
| (V2) Séparation position astronomique / position affichée | `satellites`, `representation` |
| (V2) Non-régression | les 143 tests de la version 1 (un seul changé : Soleil visible en vue rapprochée) et les 22 contrôles de bout en bout de la version 1 |
| (Consolidation) Validité de l'ISS : dernier instant nominal, première minute après expiration, dernier jour d'extrapolation, disparition, avant le lancement, après la dernière période ; pause, accélération, changement de date | `iss`, `satellites`, bout en bout |
| (Consolidation) Transparence des représentations des lunes, orientation des cartes | `satellites`, bout en bout (captures), vérification sur la nomenclature UAI (docs/RESSOURCES.md) |

## 2. Précision mesurée du modèle

Écart angulaire entre la direction héliocentrique calculée et celle
d'astronomy-engine (même instant TT), sur 2 000 instants :

| Planète | 1800–2050 max / moy. | 1000–3000 max / moy. |
|---|---|---|
| Mercure | 25″ / 6″ | 114″ / 24″ |
| Vénus | 27″ / 10″ | 57″ / 22″ |
| Terre (barycentre) | 25″ / 8″ | 49″ / 16″ |
| Mars | 98″ / 24″ | 175″ / 51″ |
| Jupiter | 519″ / 169″ | 780″ / 201″ |
| Saturne | 731″ / 300″ | 1 560″ / 501″ |
| Uranus | 122″ / 43″ | 1 252″ / 441″ |
| Neptune | 72″ / 25″ | 521″ / 140″ |

- Point subsolaire (1990–2043, 2 000 instants) : écart maximal **0,0099°**.
- (V2) Lunes : écart au modèle JPL Horizons sur 2010–2030 de 0,0003° (Triton)
  à 0,51° (Néréide), détail par lune dans docs/MODELE-ASTRONOMIQUE.md,
  section 8 ; satellites galiléens contre la théorie E5 : 0,04° à 0,13°.
- (V2) Lune : 0,36° et 0,31 % sur la distance au plus (1900–2100, 4 000
  instants, contre astronomy-engine).
- (V2) ISS : écart à l'éphéméride NASA 0,80 km (moyenne quadratique), 2,13 km
  au plus pour les éléments SGP4 ; moins de 3 km dans l'application.
- Temps sidéral moyen vs apparent : écart maximal **1,16 s** de temps
  (équation des équinoxes, volontairement négligée).

## 3. Vérification de bout en bout — 62 / 62 réussis

Consolidation de la version 2 (30 octobre 2026) : 22 contrôles de la version 1
et 39 de la version 2, tous réussis. Les 2 anciens contrôles de validité de
l'ISS (1990, « plus de 30 jours ») ont été remplacés par 13 contrôles de la
nouvelle règle ; l'attente de la fiche de l'ISS suit le nouveau libellé
(« Prévision NASA du 28 octobre 2026 » au lieu de « prévision NASA à jour »).
Correction de la navigation (30 octobre 2026) : un 62e contrôle vérifie que
les flèches font pivoter la caméra en vue d'un satellite (Io : 104,8° après
1,6 s d'appui). Exécuté sans la correction, ce contrôle échoue (rotation
0,0°, 61/62) ; avec la correction, 62/62. Les contrôles existants des
flèches dans les autres contextes restent réussis : sélection de la planète
en vue générale, rotation autour du globe en vue d'une planète, navigation
dans les listes.
Extrait de la sortie (`npm run test:e2e`, Chromium, WebGL SwiftShader) :

```
✔ Mercure : aucune entrée « Satellites » — zoomIn,zoomOut,recenter,sun,pause,slower,faster,now,overview
✔ Vénus : aucune entrée « Satellites » — zoomIn,zoomOut,recenter,sun,pause,slower,faster,now,overview
✔ Jupiter : 4 lunes placées autour de la planète — io,europa,ganymede,callisto
✔ liste des lunes de Jupiter — Io,Europe,Ganymède,Callisto
✔ OK : vue d’Io — satellite Io
✔ fiche d’Io en français (diamètre, distance, période, inclinaison) — Diamètre3 643 km | Distance à Jupiter423 500 km | Période orbitale1 j 18 h 28 min | Inclinaison / équateur0,04° | Sens du mouvementdirect | Excentricité0,0041 | Découverte1610 (Galilée)
✔ Jupiter visible derrière Io, caméra hors de la planète — Jupiter couvre 23.6 % de l’image
✔ Io cadrée au centre de l’image — Io couvre 8.9 % de l’image
✔ flèches en vue d’un satellite : la caméra pivote autour d’Io, qui reste sélectionnée — rotation 104.8°, satellite
✔ Retour : retour à Jupiter — detail
✔ Retour : vue générale, sans lune affichée
✔ aucune erreur (lunes)
✔ Saturne : 7 lunes, vue de Titan par l’adresse — mimas,enceladus,tethys,dione,rhea,titan,iapetus
✔ vue de la Lune : Terre visible derrière — Terre 7.7 % de l’image
✔ aucune erreur (Titan, Lune)
✔ ISS affichée dans la vue de la Terre
✔ ISS proposée pour la Terre seulement — moon,iss
✔ sélection de l’ISS — iss satellite
✔ fiche de l’ISS : altitude, vitesse, période, inclinaison, époque, validité — Naturestation habitée (satellite artificiel) | Altitude calculée424 km | Vitesse7,66 km/s | Période orbitale93,0 min | Inclinaison51,6° | Éléments (époque)28 octobre 2026, 12 h 00 UTC | ValiditéPrévision NASA du 28 octobre 2026
✔ Terre visible derrière l’ISS — 30.4 % de l’image
✔ ISS : immobile en pause, en mouvement quand le temps avance — pause 0, en marche 3.01e-2
✔ fiche (instant nominal) : « Prévision NASA du 28 octobre 2026 » — Naturestation habitée (satellite artificiel) | Altitude calculée424 km | Vitesse7,66 km/s | Période orbitale93,0 min | Inclinaison51,6° | Éléments (époque)28 octobre 2026, 12 h 00 UTC | ValiditéPrévision NASA du 28 octobre 2026
✔ dernier instant nominal (12 nov. 12:00 UTC) : ISS affichée, prévision NASA — Naturestation habitée (satellite artificiel) | Altitude calculée414 km | Vitesse7,67 km/s | Période orbitale93,0 min | Inclinaison51,6° | Éléments (époque)28 octobre 2026, 12 h 00 UTC | ValiditéPrévision NASA du 28 octobre 2026
✔ première minute après expiration : statut « Extrapolation », ISS toujours affichée — Naturestation habitée (satellite artificiel) | Altitude calculée414 km | Vitesse7,67 km/s | Période orbitale93,0 min | Inclinaison51,6° | Éléments (époque)28 octobre 2026, 12 h 00 UTC | ValiditéExtrapolation | Prévision expirée depuismoins d’une heure
✔ liste des satellites : ISS marquée « Extrapolation » — Lune,ISS · station spatialeExtrapolation
✔ dernier jour d’extrapolation (19 nov. 11:59 UTC) : ISS affichée — satellite
✔ en pause juste avant la limite : ISS toujours affichée
✔ accélération au-delà du 7e jour : ISS masquée, vue de l’ISS fermée, message — toPlanet, 2026-11-19T13:29:14.520Z, message « ISS masquée : données orbitales expirées, à actualiser »
✔ … puis retour à la vue de la Terre — detail
✔ première minute après la limite (19 nov. 12:01) : ISS absente de la liste, indication « données à actualiser » — liste Lune — « ISS masquée : la prévision NASA du 28 octobre 2026 a expiré le 12 novembre 2026, 12 h 00 UTC, il y a plus de 7 jours. Les données orbitales doivent être actualisées (mise à jour de l’application). »
✔ retour dans la période nominale : ISS de nouveau proposée — Lune,ISS · station spatiale
✔ avant le lancement (1990) : pas d’ISS, explication affichée — « ISS : pas encore en orbite à cette date (premier module lancé le 20 novembre 1998). »
✔ après la dernière période autorisée (12 déc. 2026, ancien seuil de 30 jours) : pas d’ISS, explication affichée — « ISS masquée : la prévision NASA du 28 octobre 2026 a expiré le 12 novembre 2026, 12 h 00 UTC, il y a plus de 7 jours. Les données orbitales doivent être actualisées (mise à jour de l’application). »
✔ 2030 : pas d’ISS, explication affichée — « ISS masquée : la prévision NASA du 28 octobre 2026 a expiré le 12 novembre 2026, 12 h 00 UTC, il y a plus de 7 jours. Les données orbitales doivent être actualisées (mise à jour de l’application). »
✔ aucune erreur (ISS)
✔ vue générale : taille du Soleil inchangée — 1.35
✔ vue de la Terre : Soleil de 0,53° à 0,55° — 0.5365°
✔ vue « Soleil » : Soleil visible à gauche de la Terre — x = 304 px, luminosité 187
✔ vue de Neptune : Soleil d’environ 0,018° — 0.01784°
✔ aucune erreur (Soleil)
62/62 contrôles réussis.
```

Version 1 (22 / 22, toujours réussis en version 2) :

`npm run test:e2e` (Chromium, WebGL SwiftShader, fenêtre 1920 × 1080) :

```
✔ démarrage sans erreur JavaScript
✔ la scène est réellement dessinée — 127 points lumineux échantillonnés
✔ 8 planètes positionnées
✔ temps réel par défaut
✔ flèche droite : Mars sélectionnée
✔ OK : vue rapprochée de la Terre — detail/detail
✔ pivoter la caméra ne fait pas tourner le globe
✔ OK en vue rapprochée : barre d’actions
✔ région sélectionnée et centrée
✔ Retour : vue générale — overview/overview
✔ aucune erreur pendant la navigation
✔ jour/nuit rendus conformes au calcul (solstice) — AUC 1.000, luminosité jour 60 / nuit 5 (132 / 130 points)
✔ les lumières urbaines n’éclairent pas le côté jour — écart maximal côté jour 0.00 niveau(x), gain moyen côté nuit 4.26
✔ 6 h plus tard, le point subsolaire a reculé de 90° vers l’ouest — -89.99°
✔ le terminateur rendu a suivi le changement d’heure — AUC 1.000 (132 / 130 points)
✔ mode simulation signalé à l’écran — Simulation · Pause
✔ aucune erreur (terminateur)
✔ chargement depuis l’origine locale de l’APK, sans aucun accès externe
✔ Retour ×2 en vue générale : sortie demandée à Android
✔ touche Menu relayée : barre d’actions ouverte
✔ mise en arrière-plan : rendu suspendu puis repris
ℹ cadence en rendu logiciel (indicatif) : ≈ 10 i/s, qualité high
22/22 contrôles réussis.
```

Méthode du contrôle du terminateur : la caméra est centrée sur un point du
terminateur au solstice de juin 2024 (20 h 51 UTC), nuages et lumières
désactivés. Pour chaque point d'une grille de 5° tourné vers la caméra, le
script lit la luminosité du pixel rendu et la compare au jour/nuit calculé :
l'AUC est la probabilité qu'un point de jour (Soleil à plus de 15° au-dessus de
l'horizon) soit plus lumineux qu'un point de nuit (Soleil à plus de 15°
au-dessous). Le temps est ensuite avancé de 6 h sans bouger la caméra, et le
contrôle est refait.

Les captures produites sont enregistrées dans `test-results/` (non versionné).

« Couvre x % de l'image » : fraction d'une grille de 64 × 36 rayons issus de
la caméra qui rencontrent la sphère de la planète (calcul géométrique, pas
une lecture de pixels).

## 4. Vérifications visuelles

Captures examinées pendant le développement (1920 × 1080 et Fire TV simulé
960 × 540 px CSS, rapport de pixels 2) : vue générale, mode horloge épuré,
barre d'actions, liste des régions, Terre (jour, nuit, Europe à midi et au
crépuscule, Amérique du Sud de nuit), Jupiter, Saturne, icône et bannière
Android. Elles ont conduit à plusieurs corrections : estompage des autres corps
en vue rapprochée, halo atmosphérique, reflet solaire, intensité des lumières,
libellés qui se chevauchaient, taille des planètes. Quatre captures figurent
dans `docs/captures/`.

Simulation Fire TV (agent utilisateur « AFTKA », 960 × 540 px CSS, rapport 2) :
qualité « Standard » détectée automatiquement, image calculée en 1920 × 1080,
aucune erreur.

Version 2 (Chromium + SwiftShader, 1920 × 1080, 29 octobre 2026 à 18 h UTC
sauf mention) : vue générale (inchangée), Terre (orbites de la Lune et de
l'ISS, libellés), Lune devant la Terre, Phobos devant Mars, Jupiter et ses
quatre lunes, Io devant Jupiter, Titan (brume orangée) devant Saturne et ses
anneaux, Triton devant Neptune, liste « Lunes de Saturne », barre de Mercure
sans « Satellites », vue « Soleil » depuis la Terre et Jupiter, ISS (au soleil
à 18 h, dans l'ombre à 15 h 20), éclipse de Lune du 14 mars 2025 (Lune
assombrie). Corrections apportées après examen : cadrage de l'ISS (la
première version regardait trop vers le sol, texture terrestre trop agrandie),
ISS et lunes désormais assombries dans l'ombre de leur planète, vue « Soleil »
(Soleil trop près du bord du globe).

Consolidation (30 octobre 2026, 1280 × 720) :

- **Déimos** : 4 instants espacés d'un quart d'orbite (face éclairée, demi-phase
  de chaque côté, face nocturne), plus 4 vues « Soleil » (à contre-jour) ; la
  zone non cartographiée apparaît en gris moyen uni, sans relief, au lieu de la
  plage gris clair ; plus de raccord de tuiles visible ; fiche « Représentation
  approximative · Carte partiellement reconstituée · Forme représentée par une
  sphère ». Vues complémentaires de la carte plaquée sur un globe (hors de
  l'application) : face tournée vers Mars, hémisphères avant et arrière, face
  opposée, pôles ;
- **lunes d'Uranus et Triton** : en 2026, l'hémisphère éclairé des lunes
  d'Uranus est l'hémisphère nord, jamais photographié : il apparaît comme une
  plage uniforme, ce que signalent désormais les fiches ; Triton éclairé
  (1er novembre) : sud cartographié, nord uniforme ;
- Protée, Néréide, Titan, Europe, Phobos : mentions conformes ;
- **ISS** : fiche « Prévision NASA du 28 octobre 2026 » (29 octobre),
  « Extrapolation » et « Prévision expirée depuis 45 h » (14 novembre), message
  « ISS masquée : données orbitales expirées, à actualiser » puis liste
  « Satellites de la Terre » réduite à la Lune avec l'explication (20 novembre) ;
- 24 vues, toutes les cartes chargées (HTTP 200), aucune erreur JavaScript.

Anomalie relevée pendant ces vérifications, **corrigée ensuite** (avec
l'accord de l'utilisateur) : en vue d'un satellite, les flèches ne faisaient
pas pivoter la caméra, alors que l'aide affiche « Pivoter ». Cause : dans
`src/app/App.ts`, la commande des flèches n'était transmise à la caméra qu'en
mode « detail » (vue d'une planète), alors que la caméra sait pivoter en mode
« satellite ». Correction : la condition est remplacée par
`CameraRig.acceptsRotationInput` (vue stable d'une planète **ou** d'un
satellite) ; les transitions, la vue générale et les menus ne sont pas
modifiés. Tests : 2 tests unitaires (`satellites.test.ts`) et 1 contrôle de
bout en bout.

## 5. Compilation

| Étape | Résultat |
|---|---|
| `npm run typecheck` | ✅ aucune erreur |
| `npm run build` | ✅ V2 : `dist/` 6,6 Mo dont JavaScript 767 Ko (228 Ko compressé ; V1 : 684 Ko), textures 5,6 Mo (V1 : 2,8 Mo ; + 2,8 Mo de cartes des lunes) |
| Syntaxe du JavaScript produit | ✅ analysable en ES2018 (Chromium ≥ 64) ; pas d'ES2019+ (V2 : `Array.prototype.flat`, `Object.fromEntries` et `Array.prototype.at` évités dans le code exécuté ; le module WebAssembly de satellite.js n'est pas inclus) |
| Wrapper Gradle (`android/gradlew`) | ✅ télécharge Gradle 8.11.1, somme SHA-256 vérifiée, projet analysé |
| `./gradlew assembleDebug` dans l'environnement de développement | ❌ **non exécutable** : le plugin Android Gradle 8.7.3 n'est publié que sur maven.google.com, inaccessible (refus du proxy réseau) |
| `./gradlew assembleRelease` sur GitHub Actions | ✅ réussi (voir section 7) |
| APK de vérification (chaîne alternative) | ✅ voir ci-dessous |

### APK de vérification

Pour vérifier le code Android malgré l'absence du plugin Gradle, un APK a été
produit **hors du dépôt** avec les outils Ubuntu : `aapt` (ressources liées
avec l'`android.jar` de l'API 23, aapt 1 ne lisant pas celui de l'API 35 ;
l'option `density` de `configChanges`, apparue à l'API 24, a été retirée pour
cette compilation seulement), `javac` (Java 8) contre l'`android.jar` de
l'**API 35**, `dx`, `zipalign`, `apksigner` (clé de débogage temporaire).

Résultats :

```
apksigner verify : Verifies — v1 : true, v2 : true, v3 : true
package: name='fr.horlogecosmique.app' versionCode='1' versionName='1.0.0'
sdkVersion:'22'  targetSdkVersion:'34'
launchable-activity: fr.horlogecosmique.app.MainActivity
leanback-launchable-activity: fr.horlogecosmique.app.MainActivity
uses-feature-not-required: android.hardware.touchscreen, android.software.leanback
taille : 3,4 Mo (assets/www/ = application web complète, classes.dex = 10,8 Ko)
```

Cet APK prouve que le code Java compile contre l'API 35 et que le manifeste
est valide, mais il **n'a été installé sur aucun appareil**, ni émulateur
(images système Android indisponibles ici). L'APK officiel est produit par
Gradle (section 7).

## 6. Performances

Aucune mesure n'est représentative d'un Fire TV : le rendu logiciel
(SwiftShader) donne environ 10 images/s en 1920 × 1080 sur le processeur du
conteneur. **Aucune fréquence d'images n'est garantie.** Mesures à faire sur
l'appareil (voir ci-dessous).

## 7. Intégration continue GitHub Actions

Première exécution du workflow « Construction » (run n° 1, 29 octobre 2026,
commit `d565d14`) : **réussie**.

| Job | Résultat |
|---|---|
| Tests et application web | ✅ `npm ci`, vérification des types, 143 tests unitaires, compilation, vérification de bout en bout **22/22** (Chromium sur le serveur GitHub, environ 18 i/s en rendu logiciel) |
| APK Android (Fire TV) | ✅ `./gradlew assembleRelease` avec JDK 17 : `BUILD SUCCESSFUL in 1m 11s`, 44 tâches, contrôle `lintVitalRelease` sans erreur ; APK signé avec une clé de débogage propre à l'exécution (aucune clé personnelle configurée) |

**Version 2** : exécution n° 4 (29 octobre 2026, commit `7501acf`) :
**réussie**.

| Job | Résultat |
|---|---|
| Tests et application web | ✅ vérification des types, **202 tests unitaires**, compilation, vérification de bout en bout **50/50** (Chromium sur le serveur GitHub, 13,3 i/s en rendu logiciel) |
| APK Android (Fire TV) | ✅ `./gradlew assembleRelease` : `BUILD SUCCESSFUL in 1m 9s`, 44 tâches ; artefact `horloge-cosmique-apk` de 6 180 812 octets (compressé ; 3,3 Mo en version 1, la différence venant des cartes des lunes) |

L'APK de la version 2 n'a pas été installé sur un appareil depuis
l'environnement de développement.

Version 1 — artefacts produits : `horloge-cosmique-apk` (APK, 3,3 Mo compressé),
`application-web`, `resultats-e2e` (captures). Seul avertissement : les actions
GitHub en version 4 utilisent Node.js 20, déprécié (exécutées sous Node.js 24
par GitHub) ; sans effet sur le résultat.

L'APK produit par GitHub n'a pas pu être inspecté depuis l'environnement de
développement (stockage des artefacts inaccessible) et n'a été installé sur
aucun appareil.

## Ce qui reste à vérifier sur le Fire TV réel

**Version 1** : installée et utilisée par l'utilisateur sur un Fire TV Stick
3e génération (Fire OS 7.7.1.7), en qualité maximale, sans problème de
fluidité signalé (retour de l'utilisateur, non mesuré ici).

**Version 2** : **non testée sur le Fire TV**. À vérifier après installation
du nouvel APK :

- [ ] liste « Satellites » (◀ ▶ dans la barre, ▲ ▼ dans la liste, OK) pour
  chaque planète ; aucune entrée pour Mercure et Vénus ;
- [ ] vue d'une lune (Lune, Io, Titan…) : planète visible derrière, Retour
  vers la planète puis vers la vue générale, transitions fluides ;
- [ ] apparition des cartes des lunes à la première ouverture d'une planète
  (chargement à la demande) et absence d'à-coup ; mémoire stable en passant
  d'un système à l'autre ;
- [ ] ISS : présente dans la vue de la Terre, sélection, maquette lisible,
  Terre visible derrière, fiche « Prévision NASA du 28 octobre 2026 »
  jusqu'au 12 novembre 2026, 12 h 00 UTC, puis « Extrapolation » jusqu'au
  19 novembre, 12 h 00 UTC, puis ISS masquée et explication dans la liste
  « Satellites » (sans mise à jour des données ; à vérifier aussi en
  accélérant le temps ou en changeant de date) ; heure du Fire TV correcte ;
- [ ] fiches des lunes : ligne « Représentation » lisible à distance (Déimos,
  lunes d'Uranus, Protée, Titan…) ; Déimos sans plage gris clair ni raccord ;
- [ ] en vue d'une lune ou de l'ISS, maintien des flèches : la caméra pivote
  autour du satellite (correction du 30 octobre 2026, section 4) ;
- [ ] Soleil à sa taille apparente en vue rapprochée et action « Soleil » ;
- [ ] cadence (*Réglages › Afficher la cadence*) en vue de Saturne (7 lunes)
  et de l'ISS, en temps réel et en accélération ×86 400.

Liste générale (version 1) — à refaire si besoin avec la version 2 (modèle
exact : *Paramètres › Ma Fire TV › À propos*) :

1. [x] Compilation de l'APK par GitHub Actions (réussie). [ ] Compilation sur
   votre PC avec Android Studio ou `./gradlew assembleDebug`.
2. [ ] Installation (ADB ou Downloader) ; icône et bannière visibles dans
   *Vos applications et chaînes*.
3. [ ] Démarrage : chargement des textures, pas d'écran noir ni de message
   « Affichage 3D indisponible ».
4. [ ] Télécommande : ◀ ▶ (planètes), OK, ▼, Retour, ☰ Menu, ⏯, ⏪ ⏩ ;
   maintien des flèches pour pivoter ; double Retour pour quitter.
5. [ ] Fluidité : *Réglages › Afficher la cadence (diagnostic) › Oui* affiche
   en haut à gauche les images par seconde (et la cible : 30 en mode horloge,
   60 pendant les animations), l'échelle de rendu et le niveau de qualité.
   Relever ces valeurs en vue générale, en vue Terre et en simulation
   ×86 400 (⏩ plusieurs fois). Si besoin, *Qualité graphique › Économie*.
6. [ ] Netteté : image en 1920 × 1080 (vérifier que la WebView ne réduit pas la
   résolution).
7. [ ] Heure et fuseau horaire corrects ; date en français.
8. [ ] Accueil puis retour dans l'application : reprise à l'heure exacte.
9. [ ] Fonctionnement après plusieurs heures (échauffement, mémoire, écran
   maintenu allumé, absence de fuite).
10. [ ] Mode avion / Wi-Fi coupé : l'application fonctionne hors ligne.
11. [ ] Cohérence visuelle du terminateur avec la réalité (par exemple Europe
    éclairée à midi, plongée dans la nuit à minuit).
12. [ ] Si une ancienne WebView refuse le code : noter la version de
    *Android System WebView* / *Amazon WebView* (paramètres des applications).
