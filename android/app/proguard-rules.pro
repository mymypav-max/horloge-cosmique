# Pas de réduction de code (isMinifyEnabled = false). Si elle est activée un
# jour, conserver l'interface JavaScript appelée depuis la WebView :
-keepclassmembers class fr.horlogecosmique.app.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
