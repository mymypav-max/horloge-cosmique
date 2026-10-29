plugins {
    id("com.android.application")
}

android {
    namespace = "fr.horlogecosmique.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "fr.horlogecosmique.app"
        // Android 5.1 : Fire OS 5 et versions ultérieures (Fire OS 6, 7, 8).
        minSdk = 22
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    // Signature : si une clé personnelle est fournie par variables d'environnement
    // (voir docs/FIRE-TV.md), la version « release » est signée avec elle ;
    // sinon elle est signée avec la clé de débogage locale, ce qui suffit pour
    // une installation personnelle.
    val keystorePath = System.getenv("HC_KEYSTORE_FILE")
    signingConfigs {
        if (keystorePath != null) {
            create("personal") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("HC_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("HC_KEY_ALIAS")
                keyPassword = System.getenv("HC_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("personal") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    // L'application web compilée (dossier dist/ à la racine du dépôt) est
    // copiée dans les ressources de l'APK, sous assets/www/.
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/webAssets"))
}

val webDist = rootProject.layout.projectDirectory.dir("../dist")

val syncWebAssets by tasks.registering(Sync::class) {
    description = "Copie l'application web compilée (dist/) dans les assets de l'APK."
    from(webDist)
    into(layout.buildDirectory.dir("generated/webAssets/www"))
    doFirst {
        if (!webDist.file("index.html").asFile.exists()) {
            throw GradleException(
                "Application web introuvable : exécutez d'abord « npm run build » à la racine du dépôt."
            )
        }
    }
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}
