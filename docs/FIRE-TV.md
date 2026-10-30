# Fire TV : compatibilité, compilation et installation

L'application Android (`android/`) est une enveloppe minimale : une WebView
plein écran qui affiche l'application web compilée (`dist/`), embarquée dans
l'APK. Elle ne nécessite ni compte Amazon ni publication sur l'Amazon Appstore.

> **État de vérification** : l'APK est compilé par l'intégration continue
> GitHub (Gradle, plugin Android 8.7.3). La **version 1** a été installée et
> utilisée par l'utilisateur sur un Fire TV Stick 3e génération (Fire OS
> 7.7.1.7), en qualité maximale, sans problème de fluidité signalé. La
> **version 2** (lunes, ISS, taille apparente du Soleil) **n'a pas encore été
> testée sur l'appareil** : voir la liste dans docs/TESTS.md.

## Compatibilité

Le modèle exact de votre Fire TV Stick reste à confirmer. Pour le connaître :
*Paramètres › Ma Fire TV › À propos*.

| Famille (d'après les informations publiques, à vérifier) | Système | Compatibilité attendue |
|---|---|---|
| Fire TV Stick 1re génération (2014) | Fire OS 5 (Android 5.1) | **incertaine** : GPU ancien (WebGL 1 seulement), WebView peut-être trop ancienne |
| Fire TV Stick 2e génération / Basic Edition (2016–2017) | Fire OS 5 ou 6 | possible en qualité « Économie », fluidité incertaine |
| Fire TV Stick 4K (2018), Lite et 3e génération (2020) | Fire OS 6 ou 7 (Android 7.1 / 9) | cible principale (qualité « Standard ») |
| Fire TV Stick 4K Max (2021), 4K / 4K Max 2e génération (2023), HD (2024) | Fire OS 7 ou 8 (Android 9 / 11) | cible principale |
| **Modèles sous Vega OS** (ex. Fire TV Stick 4K Select, 2025) | Vega OS (Linux) | **non compatible** : n'exécute pas d'applications Android (APK) |

Conditions techniques requises par l'application :

- Android 5.1 (API 22) ou plus récent ;
- WebView système basée sur **Chromium 64 ou plus récent** (le code produit est
  de l'ES2018 avec modules JavaScript) ;
- **WebGL** 1 ou 2 (la qualité « Économie » est choisie automatiquement si
  WebGL 2 manque).

Si WebGL est indisponible, l'application affiche « Affichage 3D
indisponible » au lieu d'un écran noir.

## 1. Compiler l'application web

À la racine du dépôt :

```bash
npm install
npm run build
```

Le dossier `dist/` est produit. Le projet Android le copie automatiquement
dans l'APK à chaque compilation (tâche Gradle `syncWebAssets`) ; si `dist/`
n'existe pas, la compilation Android s'arrête avec un message explicite.

## 2. Compiler l'APK

### Avec Android Studio (recommandé)

Prérequis : **Android Studio** récent (https://developer.android.com/studio). Il
fournit le JDK, le SDK Android et Gradle.

1. *File › Open…* et sélectionner le dossier **`android/`** du dépôt (pas la
   racine).
2. Laisser Android Studio synchroniser le projet (« Gradle sync »). S'il
   demande d'installer le SDK Android 35 ou d'accepter des licences, accepter.
   S'il propose de mettre à jour le plugin Android Gradle (version 8.7.3), ce
   n'est pas obligatoire.
3. *Build › Build App Bundle(s) / APK(s) › Build APK(s)*.
4. Fichier produit : `android/app/build/outputs/apk/debug/app-debug.apk`.

### En ligne de commande

Prérequis : JDK 17 ou plus récent, SDK Android (le plus simple : installé par
Android Studio). Indiquer l'emplacement du SDK, soit dans la variable
d'environnement `ANDROID_HOME`, soit dans un fichier `android/local.properties` :

```properties
# Windows (barres obliques doublées) :
sdk.dir=C\:\\Users\\VOTRE_NOM\\AppData\\Local\\Android\\Sdk
# macOS : sdk.dir=/Users/VOTRE_NOM/Library/Android/sdk
# Linux : sdk.dir=/home/VOTRE_NOM/Android/Sdk
```

Puis :

```bash
cd android
./gradlew assembleDebug        # Windows : gradlew.bat assembleDebug
```

Le wrapper télécharge Gradle 8.11.1 (somme SHA-256 vérifiée) au premier
lancement.

Versions retenues : plugin Android Gradle 8.7.3, Gradle 8.11.1, compileSdk 35,
targetSdk 34, minSdk 22, Java 8 (niveau de langage), sans dépendance AndroidX.

### Signature

- `assembleDebug` signe l'APK avec la **clé de débogage** de votre PC (créée
  automatiquement par Android Studio). Suffisant pour un usage personnel.
- Les mises à jour doivent être signées avec la **même clé**. Un APK compilé
  sur un autre PC (ou par l'intégration continue sans clé personnelle) ne peut
  pas remplacer l'application installée : la désinstaller d'abord
  (`adb uninstall fr.horlogecosmique.app`). Les réglages seront perdus.
- Clé personnelle (facultatif) :
  ```bash
  keytool -genkeypair -v -keystore horloge.jks -alias horloge -keyalg RSA -keysize 2048 -validity 10000
  ```
  puis définir les variables d'environnement `HC_KEYSTORE_FILE` (chemin du
  fichier), `HC_KEYSTORE_PASSWORD`, `HC_KEY_ALIAS`, `HC_KEY_PASSWORD` et lancer
  `./gradlew assembleRelease`. **Ne jamais ajouter ce fichier ni ces mots de
  passe au dépôt** (le `.gitignore` exclut déjà `*.jks` et `*.keystore`).

### Par l'intégration continue GitHub (sans PC)

Le workflow `.github/workflows/construction.yml` compile l'APK sur les serveurs
de GitHub à chaque envoi sur `main` (fichier téléchargeable dans l'onglet
*Actions*, artefact `horloge-cosmique-apk`). Lorsqu'une **release** est publiée
(*Releases › Draft a new release* sur github.com, faisable depuis un
téléphone), l'APK y est joint automatiquement. Il est alors téléchargeable à
une adresse fixe, pratique pour l'application Downloader :

```
https://github.com/mymypav-max/horloge-cosmique/releases/latest/download/horloge-cosmique.apk
```

Sans clé personnelle enregistrée dans les secrets du dépôt
(`HC_KEYSTORE_BASE64`, `HC_KEYSTORE_PASSWORD`, `HC_KEY_ALIAS`,
`HC_KEY_PASSWORD`), chaque compilation utilise une clé de débogage différente :
il faut alors désinstaller l'ancienne version avant d'installer la nouvelle.

> Première exécution le 29 octobre 2026 : tests, vérification de bout en bout
> et compilation de l'APK réussis. Le joint aux releases n'a pas encore servi
> (aucune release publiée).

## 3. Préparer le Fire TV

1. *Paramètres › Ma Fire TV › À propos* : si le menu « Options pour les
   développeurs » n'existe pas, appuyer **7 fois sur OK** sur le nom de
   l'appareil (« Fire TV Stick ») jusqu'au message indiquant que vous êtes
   développeur.
2. *Paramètres › Ma Fire TV › Options pour les développeurs* :
   - **Débogage ADB** : activé (pour l'installation depuis un PC) ;
   - **Applications de sources inconnues** (Fire OS 6) ou **Installer des
     applications inconnues** (Fire OS 7 et 8, autorisation à donner à
     l'application utilisée pour télécharger, par exemple Downloader).
3. Adresse IP du Fire TV : *Paramètres › Ma Fire TV › À propos › Réseau*.

(Les libellés exacts peuvent varier selon la version de Fire OS.)

## 4. Installer l'APK

### Depuis un PC, avec ADB (même réseau Wi-Fi)

ADB fait partie du SDK Android (`platform-tools`) ou se télécharge seul
(*SDK Platform-Tools*).

```bash
adb connect 192.168.1.42:5555      # adresse IP du Fire TV
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

À la première connexion, accepter sur le téléviseur la demande « Autoriser le
débogage ». L'application apparaît ensuite dans *Vos applications et chaînes*
(icône « Horloge Cosmique »). Pour la placer sur l'écran d'accueil : bouton
Menu ☰ sur l'icône, puis « Déplacer ».

### Sans PC, avec l'application Downloader

1. Installer **Downloader** (AFTVnews) depuis l'Amazon Appstore.
2. Autoriser Downloader à installer des applications inconnues (étape 3).
3. Saisir l'adresse de l'APK (par exemple celle de la release GitHub
   ci-dessus), télécharger, puis « Installer ».

## Utilisation à la télécommande

| Touche | Vue générale | Vue rapprochée |
|---|---|---|
| ◀ ▶ | planète précédente / suivante | faire pivoter la caméra |
| ▲ ▼ | ▼ : barre de commandes | faire pivoter la caméra (haut / bas) |
| OK | ouvrir la vue rapprochée | barre de commandes (régions, zoom, temps…) |
| Retour | deux appuis : quitter | revenir à la vue générale ; ferme les menus |
| ☰ Menu | barre de commandes | barre de commandes |
| ⏯ | pause / reprise du temps | pause / reprise du temps |
| ⏪ ⏩ | ralentir / accélérer le temps | dézoomer / zoomer |

Le temps peut aussi être réglé depuis la barre de commandes, dans les deux vues.

Version 2, dans la barre de la vue rapprochée : **Satellites** (lunes de la
planète, et l'ISS pour la Terre ; ▲ ▼ puis OK), **Soleil** (montre le Soleil à
sa taille apparente réelle). Dans la vue d'un satellite, **Retour** ramène à
la planète (ou le bouton portant son nom), puis à la vue générale.

## Comportement sur le téléviseur

- **Écran toujours allumé** tant que l'application est au premier plan (c'est
  une horloge) : l'économiseur d'écran du Fire TV ne se déclenche pas.
  Quitter l'application pour retrouver le comportement normal.
- **Arrière-plan** : en appuyant sur Accueil, l'application suspend son rendu
  et la WebView ; elle reprend à l'heure exacte au retour.
- **Hors ligne** : aucune connexion n'est nécessaire ; l'application refuse
  toute requête vers un autre hôte que son origine locale. La permission
  INTERNET est déclarée par prudence pour le mode de chargement de la WebView.
- **Fuseau horaire** : l'heure affichée est celle du Fire TV ; en cas d'écart,
  vérifier le fuseau horaire dans les paramètres (rubrique *Préférences* ou
  *Date et heure* selon la version).

## Données de l'ISS : à mettre à jour

L'application ne télécharge rien. Les données de l'ISS embarquées sont la
**prévision NASA du 28 octobre 2026**, valable du 28 octobre 12 h 00 UTC au
**12 novembre 2026, 12 h 00 UTC** (fiche : « Prévision NASA du 28 octobre
2026 »). Pendant les 7 jours suivants, la position est une simple
**extrapolation** (fiche : « Extrapolation », sans précision garantie) ; à
partir du **19 novembre 2026, 12 h 00 UTC**, l'ISS est masquée (liste et
scène) et la liste « Satellites » de la Terre indique que les données doivent
être actualisées. L'horloge de la Fire TV fait foi : une date fausse sur
l'appareil fausse aussi l'état affiché.

Pour actualiser : sur un ordinateur connecté, `npm run data:iss` (télécharge
la dernière prévision NASA et refait l'ajustement SGP4), `npm test`,
`npm run build`, puis recompiler et réinstaller l'APK (ou laisser
l'intégration continue GitHub le produire après un envoi sur `main`).

## Dépannage

| Symptôme | Piste |
|---|---|
| « Application non installée » | une version signée avec une autre clé est déjà installée : `adb uninstall fr.horlogecosmique.app` |
| Écran noir, puis « Affichage 3D indisponible » | WebGL absent sur cet appareil : pas de solution logicielle |
| Animation saccadée | *Réglages › Qualité graphique › Économie* ; désactiver les nuages et le mouvement lent de la caméra |
| Les touches ⏪ ⏩ ne font rien | certaines télécommandes n'ont pas ces touches : utiliser la barre de commandes (OK ou ▼) |
| Heure décalée | vérifier le fuseau horaire du Fire TV |
| Comprendre une erreur | avec un APK de débogage et ADB connecté, ouvrir `chrome://inspect` dans Chrome sur le PC : la console de la WebView du Fire TV y est accessible |
