# Horloge Cosmique

Horloge astronomique interactive pour téléviseur (Amazon Fire TV Stick) : le
système solaire en 3D, avec les planètes **à leur position angulaire réelle**
autour du Soleil, et une Terre détaillée dont le **jour et la nuit sont calculés
pour l'heure qu'il est**.

![Vue générale](docs/captures/overview.jpg)

| Terre (vue rapprochée) | Europe au crépuscule (exploration régionale) |
|---|---|
| ![Terre](docs/captures/terre.jpg) | ![Europe](docs/captures/europe.jpg) |

| Lune devant la Terre (V2) | Io devant Jupiter (V2) | ISS au-dessus de la Terre (V2) |
|---|---|---|
| ![Lune](docs/captures/lune.jpg) | ![Io](docs/captures/io.jpg) | ![ISS](docs/captures/iss.jpg) |

> Les captures ci-dessus ont été réalisées en **mode simulation** (heure
> choisie), ce qu'indiquent le bandeau orangé « Simulation » et la ligne
> « Heure réelle » sous l'horloge. Captures V2 : 29 octobre 2026, 18 h 00 UTC
> (Lune, Io) et 19 h 05 UTC (ISS), rendu logiciel dans Chromium.

## Ce que fait l'application

- **Vue générale** : le Soleil et les huit planètes en 3D, en perspective
  légèrement inclinée, sur fond d'étoiles réelles (5 044 étoiles du catalogue
  Hipparcos/XHIP). Les **directions** des planètes vues du Soleil (longitude et
  latitude héliocentriques) sont exactes ; les **distances et les tailles** sont
  adaptées à l'écran (elles ne sont pas à l'échelle, et l'application ne le
  prétend pas). Les orbites tracées sont les vraies ellipses, transformées de la
  même manière que les planètes.
- **Horloge** : heure locale, jour de la semaine et date, en français. Si une
  simulation est active (accélération, pause, autre date), un bandeau
  « Simulation » l'indique et l'heure réelle reste affichée.
- **Terre** : textures NASA (Blue Marble, Black Marble), nuages, reflet du Soleil
  sur les océans, halo atmosphérique, lumières des villes uniquement côté nuit.
  L'éclairage et le terminateur découlent de la position réelle du Soleil et de
  la rotation de la Terre (temps sidéral, précession).
- **Exploration** : sélection d'une planète à la télécommande, vue rapprochée,
  rotation de la caméra autour du globe, zoom, recentrage, et choix d'une région
  (Europe, France, Afrique, Asie, Amériques, Océanie, pôles…). La caméra est
  indépendante de la rotation du globe : la faire tourner ne change jamais
  l'éclairage.
- **Temps** : temps réel par défaut ; pause, accélération de ×60 à ×2 629 800
  (un mois par seconde) et retour à l'heure actuelle.
- **Lunes** (version 2) : les 22 lunes principales (Lune ; Phobos, Déimos ;
  Io, Europe, Ganymède, Callisto ; Mimas, Encelade, Téthys, Dioné, Rhéa,
  Titan, Japet ; Miranda, Ariel, Umbriel, Titania, Obéron ; Protée, Triton,
  Néréide) tournent autour de leur planète en vue rapprochée, avec leurs
  orbites. Leurs positions suivent le temps de l'application ; elles viennent
  d'un modèle ajusté sur les éphémérides JPL Horizons (écart de 0,0003° à
  0,5° sur 2010–2030) et, pour la Lune, des formules de l'Astronomical
  Almanac. Liste « Satellites », vue d'une lune avec sa planète derrière,
  fiche en français, retour à la planète. Mercure et Vénus n'ont pas de lune.
  Chaque fiche indique aussi la qualité de la représentation visuelle
  (« Carte photographique », « Carte partiellement reconstituée »,
  « Certaines régions n'ont jamais été photographiées », « Aucune carte
  photographique disponible », « Forme représentée par une sphère »…) :
  aucune zone inconnue n'est présentée comme une surface photographiée.
- **ISS** (version 2) : la Station spatiale internationale, dans la vue de la
  Terre, avec son orbite et une maquette agrandie. Position calculée par le
  modèle SGP4 à partir d'éléments orbitaux ajustés par le projet sur une
  prévision de la NASA embarquée (jamais téléchargée par l'application) ; ce
  ne sont pas des TLE officiels et ce n'est jamais une position observée en
  temps réel. Pendant la période de la prévision (actuellement du 28 octobre
  au 12 novembre 2026), la fiche affiche « Prévision NASA du 28 octobre
  2026 » ; les 7 jours suivants, « Extrapolation », sans précision garantie
  (une manœuvre orbitale non intégrée peut décaler la station) ; ensuite
  l'ISS est masquée et l'application indique que ses données doivent être
  actualisées.
- **Taille apparente du Soleil** (version 2) : en vue rapprochée, le Soleil est
  affiché avec sa vraie taille vue de la planète (0,54° depuis la Terre,
  1,1′ depuis Neptune) ; action « Soleil » pour le montrer.
- **Ombres** (version 2) : les lunes et l'ISS s'assombrissent dans l'ombre de
  leur planète (éclipses de Lune, d'Io…).
- **Fonctionnement hors ligne** : toutes les ressources sont embarquées.

## État du projet

| Élément | État |
|---|---|
| Application web (TypeScript, Vite, Three.js) | ✅ fonctionnelle, testée dans Chromium |
| Modèle astronomique | ✅ 213 tests unitaires (143 en V1), comparé à des références indépendantes (astronomy-engine, JPL Horizons, cas de vérification SGP4 de Vallado) |
| Vérification de bout en bout (rendu, navigation, terminateur, lunes, ISS, Soleil) | ✅ 61/61 contrôles dans Chromium (WebGL logiciel) |
| Projet Android (WebView) pour Fire TV | ✅ code complet, compilé et signé |
| Compilation de l'APK avec Gradle | ✅ réussie par l'intégration continue GitHub (plugin Android 8.7.3, Gradle 8.11.1) ; APK téléchargeable dans l'onglet *Actions* |
| Essai sur un vrai Fire TV Stick | Version 1 : installée et utilisée par l'utilisateur sur un Fire TV Stick 3e génération (Fire OS 7.7.1.7), qualité maximale, fluide (retour de l'utilisateur). Version 2 : ❌ **pas encore testée sur l'appareil** — voir [la liste des vérifications restantes](docs/TESTS.md#ce-qui-reste-à-vérifier-sur-le-fire-tv-réel) |

Détail des résultats : [docs/TESTS.md](docs/TESTS.md).

## Démarrage rapide sur un PC (Windows, macOS ou Linux)

### 1. Installer les prérequis (une seule fois)

1. **Git** : https://git-scm.com/downloads
2. **Node.js 22 LTS** (ou 24 LTS) : https://nodejs.org — version 22.12 minimum.
   Vérification dans un terminal : `node --version` doit afficher `v22.12` ou plus.
3. **Visual Studio Code** : https://code.visualstudio.com

### 2. Récupérer le projet

Dans un terminal (sous Windows : « Terminal » ou « Invite de commandes ») :

```bash
git clone https://github.com/mymypav-max/horloge-cosmique.git
cd horloge-cosmique
code .
```

La dernière commande ouvre le dossier dans VS Code (sinon : *Fichier › Ouvrir
le dossier…*). VS Code peut proposer d'installer les extensions recommandées
(Vitest, EditorConfig) : acceptez.

### 3. Installer les dépendances et lancer

Dans le terminal intégré de VS Code (*Affichage › Terminal*) :

```bash
npm install
npm run dev
```

Ouvrez ensuite l'adresse affichée (en général http://localhost:5173) dans
Chrome, Edge ou Firefox. L'adresse « Network » affichée permet aussi d'ouvrir
l'application depuis un autre appareil du réseau local.

### Commandes utiles

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement avec rechargement automatique |
| `npm test` | tests unitaires (modèle astronomique, navigation, temps, scène…) |
| `npm run typecheck` | vérification des types TypeScript |
| `npm run build` | compilation de production dans `dist/` (nécessaire avant l'APK) |
| `npm run preview` | sert la version compilée (`dist/`) |
| `npm run test:e2e` | vérification de bout en bout dans Chromium (après `npm run build` et, une fois, `npx playwright install chromium`) |
| `npm run data:iss` | met à jour les données de l'ISS (ordinateur connecté ; puis recompiler l'APK) |

### Paramètres d'adresse (démonstration, tests)

| Paramètre | Effet |
|---|---|
| `?t=2024-06-20T20:51:00Z` | démarre une simulation à cet instant (en pause) |
| `&vitesse=3600` | démarre la simulation à ×3600 au lieu de la pause |
| `&vue=terre` | ouvre directement la vue rapprochée d'une planète |
| `&satellite=lune` | puis la vue d'un de ses satellites (`io`, `titan`, `iss`…) |
| `&qualite=economy`, `standard` ou `high` | force un niveau de qualité |
| `&debug=1` | affiche la cadence d'images et expose une API de test |

Exemple : http://localhost:5173/?t=2024-06-20T12:00:00Z&vue=terre (solstice d'été).

## Commandes au clavier et à la télécommande

| Action | Télécommande Fire TV | Clavier |
|---|---|---|
| Choisir une planète (vue générale) | ◀ ▶ | ← → |
| Ouvrir la vue rapprochée | OK | Entrée |
| Faire pivoter la caméra (vue rapprochée) | ◀ ▶ ▲ ▼ (maintenir) | flèches |
| Zoomer / dézoomer (vue rapprochée) | ⏩ / ⏪ | `+` / `-` ou Page préc. / suiv., molette |
| Barre de commandes | ▼ (vue générale) ou OK (vue rapprochée), ou ☰ Menu | ↓ / Entrée, `M` |
| Régions de la Terre | barre › « Régions » | idem |
| Lunes / ISS | barre › « Satellites », ▲ ▼ puis OK | idem |
| Revenir à la planète (vue d'un satellite) | Retour, ou barre › nom de la planète | Échap |
| Montrer le Soleil (vue rapprochée) | barre › « Soleil » | idem |
| Retour / fermer | Retour | Échap ou Retour arrière |
| Pause / reprise du temps | ⏯ | Espace |
| Ralentir / accélérer le temps (vue générale) | ⏪ / ⏩ | `-` / `+` |
| Revenir à l'heure actuelle | barre › « Maintenant » | idem |
| Quitter (Fire TV) | Retour deux fois en vue générale | — |

Sans action pendant 12 secondes, l'interface s'efface (mode horloge) : seules
l'heure et la date restent affichées.

## Installer sur un Fire TV Stick

Résumé (détails, compatibilité et dépannage : **[docs/FIRE-TV.md](docs/FIRE-TV.md)**) :

1. Compiler l'application web : `npm run build`.
2. Compiler l'APK : ouvrir le dossier `android/` dans Android Studio puis
   *Build › Build App Bundle(s) / APK(s) › Build APK(s)*, ou en ligne de
   commande `cd android` puis `./gradlew assembleDebug` (`gradlew.bat` sous
   Windows). Fichier produit : `android/app/build/outputs/apk/debug/app-debug.apk`.
3. Sur le Fire TV : activer les options pour développeurs, le débogage ADB et
   l'installation d'applications inconnues.
4. Installer avec `adb connect <adresse IP du Fire TV>` puis
   `adb install -r app-debug.apk`, ou télécharger l'APK avec l'application
   « Downloader ».

> **Attention** : les modèles fonctionnant sous **Vega OS** (par exemple le Fire
> TV Stick 4K Select de 2025) n'acceptent pas les applications Android. Voir
> [docs/FIRE-TV.md](docs/FIRE-TV.md#compatibilité).

## Structure du dépôt

```
horloge-cosmique/
├── index.html, src/            application web (TypeScript)
│   ├── astro/                  modèle astronomique (temps, éphémérides, repères, Terre)
│   ├── data/                   données : éléments orbitaux, planètes, lunes, ISS, régions, étoiles
│   ├── representation/         passage des données astronomiques aux grandeurs visuelles
│   ├── scene/                  moteur graphique Three.js (objets, shaders, textures)
│   ├── camera/                 caméra : vue générale, transitions, orbite, régions
│   ├── input/                  touches et machine d'états de navigation
│   ├── time/                   temps réel / simulé
│   ├── ui/                     interface (horloge, barre, panneaux, mise en forme FR)
│   ├── perf/                   qualité graphique, cadence, résolution dynamique
│   ├── platform/               pont avec l'application Android
│   └── app/                    orchestration, réglages, paramètres de démarrage
├── public/textures/            textures embarquées (provenance : docs/RESSOURCES.md)
├── tests/                      tests unitaires (Vitest)
├── scripts/                    préparation des ressources et des données (lunes, ISS), bout en bout
├── android/                    projet Android Studio (WebView) pour Fire TV
├── docs/                       documentation
└── .github/workflows/          intégration continue (tests, APK)
```

## Documentation

- [Architecture et choix techniques](docs/ARCHITECTURE.md)
- [Modèle astronomique, conventions et limites de précision](docs/MODELE-ASTRONOMIQUE.md)
- [Fire TV : compatibilité, compilation, installation, dépannage](docs/FIRE-TV.md)
- [Tests : résultats réels et vérifications restantes](docs/TESTS.md)
- [Ressources graphiques : provenance et licences](docs/RESSOURCES.md)

## Licences

- Textures des planètes, du Soleil et de la Lune : © Solar System Scope,
  **CC BY 4.0** (attribution affichée dans l'application). Textures de la
  Terre : NASA, domaine public. Cartes des lunes : NASA/JPL-Caltech/Space
  Science Institute/Lunar and Planetary Institute (crédit obligatoire), USGS
  Astrogeology (domaine public), NASA 3D Resources. Données : JPL Horizons,
  NASA JSC. Propagateur SGP4 : satellite.js (MIT). Catalogue d'étoiles : XHIP
  via d3-celestial (BSD-3-Clause). Police Jost : SIL OFL 1.1. Détails :
  [docs/RESSOURCES.md](docs/RESSOURCES.md).
- Aucune licence n'a encore été choisie pour le code de ce dépôt : par défaut,
  tous les droits sont réservés à son propriétaire. Ajoutez un fichier `LICENSE`
  si vous souhaitez autoriser sa réutilisation.
