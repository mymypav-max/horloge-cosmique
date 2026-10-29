package fr.horlogecosmique.app;

import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * Activité unique : affiche l'application web embarquée (assets/www) dans une
 * WebView plein écran et relaie à la page les touches de la télécommande que
 * la WebView ne transmet pas d'elle-même (Retour, Menu, touches multimédias).
 *
 * Le pavé directionnel et le bouton central sont transmis nativement par la
 * WebView sous forme de touches fléchées et de la touche Entrée.
 */
public class MainActivity extends Activity {

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Horloge destinée à rester affichée : l'écran ne doit pas se mettre en veille.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setBackgroundDrawable(null);

        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (debuggable) {
            // Inspection possible depuis chrome://inspect (versions de débogage uniquement).
            WebView.setWebContentsDebuggingEnabled(true);
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(2, 4, 11));
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(false); // aucun contenu distant
        }

        webView.setWebViewClient(new LocalAssetWebViewClient(getAssets()));
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);

        setContentView(webView);
        hideSystemUi();
        webView.requestFocus();
        webView.loadUrl(LocalAssetWebViewClient.START_URL);
    }

    /** Touches relayées explicitement à la page web. */
    private static String bridgeName(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_BACK:
                return "back";
            case KeyEvent.KEYCODE_MENU:
                return "menu";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                return "playPause";
            case KeyEvent.KEYCODE_MEDIA_REWIND:
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                return "rewind";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                return "fastForward";
            default:
                return null;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String name = bridgeName(event.getKeyCode());
        if (name == null || webView == null) {
            return super.dispatchKeyEvent(event);
        }
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            boolean repeatable = "rewind".equals(name) || "fastForward".equals(name);
            if (event.getRepeatCount() == 0 || repeatable) {
                sendKey(name);
            }
        }
        // L'appui comme le relâchement sont consommés : la page décide seule.
        return true;
    }

    private void sendKey(final String name) {
        String script = "(function(){var h=window.HorlogeCosmique;return h?h.key('" + name + "'):'absent';})()";
        webView.evaluateJavascript(script, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                // Si la page n'a pas pu démarrer, Retour doit quand même permettre de quitter.
                if ("back".equals(name) && (value == null || value.contains("absent"))) {
                    finish();
                }
            }
        });
    }

    private void notifyLifecycle(String state) {
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.HorlogeCosmique&&window.HorlogeCosmique.lifecycle('" + state + "')", null);
        }
    }

    @Override
    protected void onPause() {
        // Mise en arrière-plan : la page arrête sa boucle de rendu, puis la WebView est suspendue.
        notifyLifecycle("pause");
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
            notifyLifecycle("resume");
        }
        hideSystemUi();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUi();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    /** Interface appelée depuis la page (window.AndroidBridge). */
    final class Bridge {
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }
    }
}
