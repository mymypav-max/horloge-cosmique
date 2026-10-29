package fr.horlogecosmique.app;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Sert l'application web depuis les assets de l'APK sous une origine HTTPS
 * fictive (https://appassets.androidplatform.net/), comme le fait
 * androidx.webkit.WebViewAssetLoader, sans dépendance supplémentaire.
 *
 * Pourquoi : les modules JavaScript (type="module") produits par Vite ne
 * peuvent pas être chargés depuis file:// (origine nulle). Une origine HTTPS
 * locale règle ce problème sans affaiblir la sécurité de la WebView.
 *
 * Toute requête vers un autre hôte est refusée : l'application fonctionne
 * entièrement hors ligne et ne contacte aucun serveur.
 */
final class LocalAssetWebViewClient extends WebViewClient {

    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/index.html";
    private static final String ASSET_ROOT = "www";

    private final AssetManager assets;

    LocalAssetWebViewClient(AssetManager assets) {
        this.assets = assets;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (!"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost())) {
            return error(403, "Forbidden");
        }
        String path = uri.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) {
            path = "/index.html";
        }
        if (path.contains("..")) {
            return error(404, "Not Found");
        }
        try {
            InputStream stream = assets.open(ASSET_ROOT + path);
            String mime = mimeType(path);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mime, isText(mime) ? "UTF-8" : null, 200, "OK", headers, stream);
        } catch (IOException e) {
            return error(404, "Not Found");
        }
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        // Aucune navigation hors de l'application.
        return !HOST.equals(request.getUrl().getHost());
    }

    private static WebResourceResponse error(int status, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", status, reason,
                new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    private static boolean isText(String mime) {
        return mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("svg+xml");
    }

    static String mimeType(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }
}
