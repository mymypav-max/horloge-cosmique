# Architecture et choix techniques

## Vue d'ensemble

Horloge Cosmique est une **application web** (TypeScript, Vite, Three.js)
embarquée dans une **application Android minimale** (une WebView plein écran)
pour être installée sur un Fire TV Stick. La même application web fonctionne
dans un navigateur de bureau, ce qui simplifie le développement et les tests.

Le code est découpé en couches qui ne dépendent que des couches inférieures :

```
            Télécommande / clavier                    Horloge système
                     │                                       │
                     ▼                                       ▼
   input/ (touches → actions, machine d'états)     time/ (réel ou simulé)
                     │                                       │
                     ▼                                       ▼
   app/App.ts ── orchestration ──────────────────► astro/ (modèle astronomique)
     │   │                                         positions héliocentriques (UA),
     │   │                                         orientation des corps,
     │   │                                         direction du Soleil
     │   │                                                   │
     │   │                                                   ▼
     │   │                                     representation/ (mise en page)
     │   │                                     distances compressées, directions
     │   │                                     exactes, tailles visuelles,
     │   │                                     repère astro → repère Three.js
     │   │                                                   │
     │   ▼                                                   ▼
     │  camera/ (vue générale, transitions,       scene/ (Three.js : objets,
     │          orbite inertielle, régions)               shaders, textures)
     ▼
   ui/ (horloge, barre, panneaux, libellés)       perf/ (qualité, cadence)
```

Trois niveaux sont strictement séparés, comme l'exige le cahier des charges :

1. **Modèle astronomique** (`src/astro`, `src/data/orbitalElements.ts`,
   `src/data/planets.ts`) : calcule des positions en unités astronomiques et
   des orientations dans le repère écliptique J2000. Il n'importe jamais
   Three.js ni le DOM, et il est testé seul.
2. **Modèle de représentation** (`src/representation`) : transforme ces
   données en coordonnées de scène. Il ne modifie jamais les données
   astronomiques : il les lit.
3. **Moteur graphique** (`src/scene`) : applique la mise en page à des objets
   Three.js. Il ne calcule rien d'astronomique.

## Modules

| Dossier | Contenu | Points clés |
|---|---|---|
| `src/astro/time.ts` | jours juliens, TT, UT1 | secondes intercalaires, ΔT avant 1972 |
| `src/astro/kepler.ts`, `ephemeris.ts` | équation de Kepler, éléments de Standish | tables 1 et 2a/2b, repère écliptique J2000 |
| `src/astro/frames.ts`, `earth.ts` | repères, précession, temps sidéral | point subsolaire, hauteur du Soleil |
| `src/astro/bodyRotation.ts` | orientation IAU des autres corps | pôles, méridiens, vitesses de rotation |
| `src/astro/state.ts` | état complet à un instant | point d'entrée unique du modèle |
| `src/representation/visualScale.ts` | distances et tailles affichées | interpolation monotone documentée |
| `src/representation/sceneFrame.ts` | repère astro → repère Three.js | `(x, y, z) → (x, z, −y)` |
| `src/representation/layout.ts` | mise en page des corps et orbites | sans Three.js, testable |
| `src/scene/*` | objets 3D, shaders GLSL, textures | WebGL 1 et 2 |
| `src/camera/cameraMath.ts`, `CameraRig.ts` | calculs et pilotage de caméra | orbite inertielle autour de l'axe de la planète |
| `src/input/navigation.ts` | machine d'états de la télécommande | fonction pure, entièrement testée |
| `src/time/TimeController.ts` | temps réel, pause, accélération | limite du domaine de validité |
| `src/ui/*` | interface DOM | focus géré explicitement, français |
| `src/perf/*` | qualité, cadence, résolution dynamique | réglages pour Fire TV |
| `src/platform/android.ts` | pont Web ↔ Android | touches Retour/Menu/multimédias, cycle de vie |
| `android/` | application Android (Java) | WebView, origine locale, Leanback |

## Choix structurants

### Application web dans une WebView Android (plutôt qu'un site web seul)

Deux voies ont été étudiées :

1. **Application web autonome** ouverte dans le navigateur du Fire TV (Silk ou
   Firefox) : pas de compilation Android, mais navigation à la télécommande
   peu fiable (le navigateur intercepte des touches et affiche son interface),
   pas de démarrage depuis l'écran d'accueil, mise en veille de l'écran,
   dépendance à un serveur ou à une adresse réseau.
2. **Application Android avec WebView locale** : icône dans « Vos applications »,
   contrôle complet des touches (Retour, Menu, multimédias), écran maintenu
   allumé, fonctionnement hors ligne, gestion de la mise en arrière-plan.

La seconde voie a été retenue. L'application web reste utilisable telle
quelle dans un navigateur de bureau.

### Three.js r162

Three.js r163 a supprimé la prise en charge de WebGL 1. Or certaines WebView
Android désactivent WebGL 2 sur des GPU d'entrée de gamme (liste de blocage
de Chromium), et les plus anciens Fire TV (GPU Mali-450) ne gèrent que
OpenGL ES 2.0. La version **0.162.0** est donc épinglée : c'est la dernière à
fonctionner en WebGL 1 comme en WebGL 2. Les shaders sont écrits en GLSL ES 1.0
(Three.js les adapte automatiquement à WebGL 2).

### Origine HTTPS locale dans la WebView

Vite produit des modules JavaScript (`<script type="module">`), qui ne se
chargent pas depuis `file://` (origine nulle). L'activité Android sert donc les
fichiers de `assets/www/` sous l'adresse fictive
`https://appassets.androidplatform.net/` (même principe que
`androidx.webkit.WebViewAssetLoader`, réimplémenté en 80 lignes pour éviter une
dépendance AndroidX). Tout autre hôte est refusé : aucune requête réseau.

### Android en Java, sans AndroidX

L'application Android se limite à une activité et à un client WebView : du
Java standard (API 22 et plus) suffit. Pas de Kotlin, pas d'AndroidX : moins
de dépendances à télécharger et à maintenir, compilation plus simple.

### Couleurs gérées dans les shaders

Les textures sont lues « brutes » (sRGB), converties en linéaire dans les
shaders (γ = 2,2), éclairées puis reconverties. Ce choix explicite donne un
rendu identique en WebGL 1 et 2, quelle que soit la prise en charge matérielle
des textures sRGB.

### Navigation : machine d'états pure

`src/input/navigation.ts` décrit toute la navigation sous forme d'une fonction
`(état, action) → (nouvel état, effets)`. Le focus est géré explicitement (pas
d'éléments focusables du navigateur), ce qui donne un comportement identique
au clavier et à la télécommande et rend la logique testable sans affichage.

Couches de focus : `scene` (flèches sur la scène), `bar` (barre d'actions),
`regions` (liste des régions), `settings` (réglages). Les touches multimédias
agissent dans toutes les couches.

### Caméra indépendante du globe

En vue rapprochée, la caméra est placée en coordonnées sphériques (azimut,
élévation, distance) dans un repère **inertiel** dont l'axe est l'axe de
rotation de la planète, et dont la référence d'azimut est fixe dans l'espace
(direction de l'équinoxe). La caméra ne tourne donc pas avec la planète, et ses
mouvements n'interviennent dans aucun calcul d'éclairage. Un test de bout en
bout vérifie que pivoter la caméra ne change pas l'orientation du globe.

### Vue rapprochée : autres corps estompés

Vus de près, les autres corps auraient des tailles et des distances apparentes
trompeuses (leurs tailles visuelles ne sont pas à l'échelle). Ils sont donc
estompés pendant la transition, puis masqués ; seules la planète observée et
les étoiles restent. La direction de la lumière reste celle du vrai Soleil.

## Performances (Fire TV)

| Mesure | Détail |
|---|---|
| Pas de post-traitement | halo du Soleil par simple sprite additif, atmosphère par coque en faces arrière |
| Pas d'ombres dynamiques | seule l'ombre de Saturne sur ses anneaux, calculée analytiquement dans le shader |
| Textures limitées | 2048 px pour la Terre (4096 en qualité haute), 1024 px pour les autres corps ; nuages, océans et lumières regroupés dans une seule texture |
| Résolution de rendu | plafonnée à 720, 1080 ou 2160 lignes physiques selon la qualité ; réduction dynamique jusqu'à 60 % si la cadence chute (qualité automatique) |
| Cadence | 30 i/s en mode horloge, 60 i/s pendant les animations ; 20/30 i/s en qualité économie |
| Calculs astronomiques | une fois par seconde en temps réel, à chaque image seulement en simulation rapide ; orbites recalculées tous les 30 jours simulés |
| Arrière-plan | boucle de rendu arrêtée (événement Android et `visibilitychange`) |
| Allocations | vecteurs temporaires réutilisés dans la boucle de rendu |

Niveaux de qualité (`src/perf/quality.ts`) :

| Niveau | Terre | Sphères | Antialiasing | Étoiles | Rendu max. | Choisi automatiquement si… |
|---|---|---|---|---|---|---|
| Économie | 2048 px | 32 segments | non | 1 500 | 720 lignes | pas de WebGL 2, ou texture max. < 4096, ou ≤ 1 Go |
| Standard | 2048 px | 48 (Terre 96) | oui | 5 000 | 1080 lignes | Fire TV / Android, ou ≤ 2 Go |
| Haute | 4096 px | 64 (Terre 128) | oui | 5 044 | 2160 lignes | autres appareils |

Aucune fréquence d'images n'est garantie : elle n'a pas pu être mesurée sur
un vrai Fire TV (voir docs/TESTS.md).

## Détails pratiques

- **Écran** : interface proportionnelle à la hauteur de l'écran (`rem` = hauteur
  / 54), marges de sécurité d'environ 5 % pour les téléviseurs.
- **Marquage OLED** : l'interface se décale de quelques pixels toutes les
  5 minutes.
- **Réglages** : enregistrés dans `localStorage` (qualité, nuages, mouvement lent
  de la caméra, noms des planètes, affichage de la cadence pour le diagnostic).
  Changer la qualité recharge l'application.
- **Mode horloge** : après 12 s sans action, libellés, aides et titre
  s'effacent ; les menus ouverts se referment après 30 s.
- **Sortie** : sur Fire TV, deux appuis sur Retour en vue générale quittent
  l'application (évite les sorties accidentelles).
