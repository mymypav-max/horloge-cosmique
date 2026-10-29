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

Date des mesures : 29 octobre 2026.

## Lancer les tests

```bash
npm test             # tests unitaires (Vitest)
npm run typecheck    # TypeScript
npm run build        # compilation de production
npm run test:e2e     # bout en bout (après « npx playwright install chromium »)
```

## 1. Tests unitaires — 143 / 143 réussis

`npm test` : 12 fichiers, 143 tests, durée ≈ 1,2 s.

| Fichier | Tests | Contenu |
|---|---|---|
| `time.test.ts` | 7 | jours juliens (dont exemple 7.a de Meeus), secondes intercalaires, TT − UTC, ΔT avant 1972, J2000.0 |
| `kepler.test.ts` | 8 | équation de Kepler (e de 0 à 0,9), périhélie/aphélie, périodes orbitales (±0,5 %), retour à la même longitude après une période, vitesses angulaires décroissantes de Mercure à Neptune |
| `ephemeris.test.ts` | 27 | positions des 8 planètes comparées à astronomy-engine (1800–2050 et 1000–3000), oppositions de Mars, Jupiter, Saturne, Uranus, Neptune (2024–2025), conjonction de Vénus (mars 2025), périhélie/aphélie 2025, équinoxe de mars 2024 avec précession, continuité au changement de table, domaine de validité |
| `earth.test.ts` | 15 | matrices orthonormées, obliquité, précession (2004,3″/siècle), temps sidéral à J2000 et exemple 12.a de Meeus, comparaison au temps sidéral apparent, jour sidéral, inclinaison de l'axe, point subsolaire aux solstices/équinoxes 2024–2030, solstice de juin 2024, 15°/h, 300 instants comparés à astronomy-engine (< 0,05°), terminateur à 90° exactement, jour/nuit à Paris, changement d'heure |
| `bodyRotation.test.ts` | 15 | inclinaison des axes de 7 planètes (dont Vénus et Uranus rétrogrades), périodes de rotation, Jupiter en 9 h 55 min |
| `representation.test.ts` | 10 | transformation radiale (points de contrôle, monotonie), **conservation exacte des directions héliocentriques**, absence de chevauchement 1800–2200, Jupiter imposante, repère de scène, planètes sur leurs orbites, **direction solaire du globe = point subsolaire**, axe terrestre incliné, planètes déplacées quand la date change |
| `sceneGraph.test.ts` | 6 | scène Three.js sans GPU : présence des objets, lumière du shader terrestre conforme au point subsolaire (10⁻⁴ °), rotation du globe de 90,2° en 6 h, déplacement des planètes avec la date, anneaux de Saturne inclinés, estompage en vue rapprochée |
| `navigation.test.ts` | 20 | sélection des planètes, ouverture/fermeture de la vue rapprochée, flèches confiées à la caméra, zoom, barre d'actions, régions, réglages, touches multimédias, double appui sur Retour pour quitter, correspondance des touches (clavier, télécommande, codes Android) |
| `cameraMath.test.ts` | 10 | repère orbital orthonormé, conversions direction ↔ angles, distance de caméra, indépendance vis-à-vis de la rotation du globe, limites d'élévation, courbe de transition, interpolation des poses, lissage indépendant de la cadence |
| `timeController.test.ts` | 8 | temps réel, pause, accélération, changement de vitesse sans saut, paliers, retour à l'heure actuelle, démarrage à une date, arrêt à la limite du modèle |
| `format.test.ts` | 8 | heure 24 h, date longue (« 1er »), années av. J.-C., nombres à la française, vitesses, décalages, coordonnées, périodes |
| `app.test.ts` | 9 | paramètres d'adresse, réglages, détection de qualité (Fire TV, WebGL 1), taille de texture maximale, rendu 1920 × 1080 sur WebView 960 × 540 px CSS, résolution dynamique, saisons (à l'heure près autour de l'équinoxe) |

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
- Temps sidéral moyen vs apparent : écart maximal **1,16 s** de temps
  (équation des équinoxes, volontairement négligée).

## 3. Vérification de bout en bout — 22 / 22 réussis

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

## 5. Compilation

| Étape | Résultat |
|---|---|
| `npm run typecheck` | ✅ aucune erreur |
| `npm run build` | ✅ `dist/` : 3,7 Mo dont JavaScript 684 Ko (196 Ko compressé), textures 2,8 Mo |
| Syntaxe du JavaScript produit | ✅ analysable en ES2018 (Chromium ≥ 64) ; pas d'ES2019+ |
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

## 7. Intégration continue GitHub Actions

Première exécution du workflow « Construction » (run n° 1, 29 octobre 2026,
commit `d565d14`) : **réussie**.

| Job | Résultat |
|---|---|
| Tests et application web | ✅ `npm ci`, vérification des types, 143 tests unitaires, compilation, vérification de bout en bout **22/22** (Chromium sur le serveur GitHub, environ 18 i/s en rendu logiciel) |
| APK Android (Fire TV) | ✅ `./gradlew assembleRelease` avec JDK 17 : `BUILD SUCCESSFUL in 1m 11s`, 44 tâches, contrôle `lintVitalRelease` sans erreur ; APK signé avec une clé de débogage propre à l'exécution (aucune clé personnelle configurée) |

Artefacts produits : `horloge-cosmique-apk` (APK, 3,3 Mo compressé),
`application-web`, `resultats-e2e` (captures). Seul avertissement : les actions
GitHub en version 4 utilisent Node.js 20, déprécié (exécutées sous Node.js 24
par GitHub) ; sans effet sur le résultat.

L'APK produit par GitHub n'a pas pu être inspecté depuis l'environnement de
développement (stockage des artefacts inaccessible) et n'a été installé sur
aucun appareil.

## 6. Performances

Aucune mesure n'est représentative d'un Fire TV : le rendu logiciel
(SwiftShader) donne environ 10 images/s en 1920 × 1080 sur le processeur du
conteneur. **Aucune fréquence d'images n'est garantie.** Mesures à faire sur
l'appareil (voir ci-dessous).

## Ce qui reste à vérifier sur le Fire TV réel

À faire lors de la première installation (modèle exact : *Paramètres › Ma
Fire TV › À propos*) :

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
