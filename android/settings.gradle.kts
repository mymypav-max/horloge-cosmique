// Projet Android « Horloge Cosmique » : enveloppe WebView de l'application web.
// Voir docs/FIRE-TV.md pour la compilation et l'installation.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "HorlogeCosmique"
include(":app")
