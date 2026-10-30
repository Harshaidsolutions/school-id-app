package com.schoolid.admin;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceResponse;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Serves every admin screen (HTML, JavaScript, CSS, fonts, images) from inside the APK
 * (assets/web = the built admin-web app), while keeping the website address
 * https://myschoolidcard.in so logins and /api calls work exactly as on the website.
 * Only live data (/api, uploaded photos, etc.) comes from the internet.
 */
final class BundledSite {
    private final AssetManager assets;
    private final boolean available;

    BundledSite(AssetManager assets) {
        this.assets = assets;
        boolean ok;
        try (InputStream in = assets.open("web/index.html")) { ok = in != null; }
        catch (Exception e) { ok = false; }
        this.available = ok;
    }

    boolean isAvailable() { return available; }

    /** Returns the bundled file for this request, or null to load it from the internet. */
    WebResourceResponse serve(Uri uri, String method, boolean mainFrame, String appHost) {
        if (!available || uri == null) return null;
        if (method != null && !"GET".equalsIgnoreCase(method)) return null;
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (!"https".equalsIgnoreCase(scheme) || host == null) return null;
        host = host.toLowerCase(Locale.ROOT);
        if (!host.equals(appHost) && !host.equals("www." + appHost)) return null;

        String path = uri.getPath();
        if (path == null || path.isEmpty()) path = "/";
        if (path.contains("..") || path.startsWith("/api") || path.startsWith("/.well-known")) return null;
        if (path.equals("/sw.js")) return null; // service worker is not used inside the app

        String last = path.substring(path.lastIndexOf('/') + 1);
        boolean hasExt = last.contains(".");
        if (hasExt) {
            WebResourceResponse r = file(path.substring(1));
            return r; // null → not in the APK (e.g. uploaded photo) → internet
        }
        if (mainFrame) return file("index.html"); // React screens: /students, /templates, …
        return null;
    }

    private WebResourceResponse file(String relative) {
        try {
            InputStream in = assets.open("web/" + relative);
            String mime = mimeOf(relative);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", relative.equals("index.html") ? "no-cache" : "max-age=31536000");
            headers.put("Access-Control-Allow-Origin", "*");
            boolean text = mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") || mime.contains("xml");
            return new WebResourceResponse(mime, text ? "UTF-8" : null, 200, "OK", headers, in);
        } catch (Exception e) {
            return null;
        }
    }

    private static String mimeOf(String name) {
        int dot = name.lastIndexOf('.');
        String ext = dot >= 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        switch (ext) {
            case "html": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": return "application/json";
            case "webmanifest": return "application/manifest+json";
            case "svg": return "image/svg+xml";
            case "woff2": return "font/woff2";
            case "woff": return "font/woff";
            case "ttf": return "font/ttf";
            case "otf": return "font/otf";
            case "wasm": return "application/wasm";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "webp": return "image/webp";
            case "gif": return "image/gif";
            case "ico": return "image/x-icon";
            default:
                String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                return m != null ? m : "application/octet-stream";
        }
    }
}
