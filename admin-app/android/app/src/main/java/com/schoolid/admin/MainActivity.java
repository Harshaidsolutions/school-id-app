package com.schoolid.admin;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaScannerConnection;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * My School ID Admin — standalone Android app.
 * Shows the full admin website (https://myschoolidcard.in) full screen with no browser bar,
 * with photo/Excel/ZIP uploads (gallery, files, camera), downloads to the phone,
 * printing, sharing, WhatsApp/phone/email links and the Android back button.
 */
public class MainActivity extends Activity {

    private static final String HOME_URL = "https://myschoolidcard.in/";
    private static final String APP_HOST = "myschoolidcard.in";
    private static final int BRAND = 0xFF4F46E5;
    private static final int SURFACE = 0xFFF6F5FF;
    private static final int REQ_FILE = 41;
    private static final int REQ_STORAGE = 42;
    private static final String SAVE_FOLDER = "My School ID";

    private WebView web;
    private ProgressBar progress;
    private LinearLayout errorView;
    private TextView errorText;
    private View statusSpacer;
    private View navSpacer;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private String bridgeScript = "";
    private BundledSite site;
    private volatile boolean onAppSite = true;
    private boolean mainFrameError = false;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Map<String, PendingFile> pending = new ConcurrentHashMap<>();

    private static final class PendingFile {
        String name; String mime; OutputStream out; Uri uri; File file;
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        bridgeScript = readAsset("msidc-bridge.js");
        site = new BundledSite(getAssets());
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return site.serve(request.getUrl(), request.getMethod(), false, APP_HOST);
                }
            });
        }
        setupWindow();
        setContentView(buildLayout());

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " MySchoolIDAdminApp/" + appVersion());

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "MSIDCAndroid");
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, bridgeScript,
                    Collections.singleton("https://" + APP_HOST));
            WebViewCompat.addDocumentStartJavaScript(web, bridgeScript,
                    Collections.singleton("https://www." + APP_HOST));
        }
        web.setWebViewClient(new AppWebClient());
        web.setWebChromeClient(new AppChromeClient());
        web.setDownloadListener(this::onDownload);
        if (Build.VERSION.SDK_INT >= 33) {
            // Android 13+ (and required on Android 16): hardware/gesture back goes to the previous page.
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        if (savedInstanceState == null || web.getUrl() == null) {
            Uri link = getIntent() != null ? getIntent().getData() : null;
            web.loadUrl(link != null && isAppHost(link) ? link.toString() : HOME_URL);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Uri link = intent.getData();
        if (link != null && isAppHost(link)) web.loadUrl(link.toString());
    }

    /* ───────────────────────── Window / layout ───────────────────────── */

    private void setupWindow() {
        Window w = getWindow();
        w.setStatusBarColor(BRAND);
        w.setNavigationBarColor(Color.WHITE);
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) c.setSystemBarsAppearance(WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        } else if (Build.VERSION.SDK_INT >= 26) {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
    }

    private View buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(SURFACE);

        statusSpacer = new View(this);
        statusSpacer.setBackgroundColor(BRAND);
        root.addView(statusSpacer, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0));

        FrameLayout content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        web = new WebView(this);
        web.setBackgroundColor(SURFACE);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        content.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setIndeterminate(false);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(0xFFFF8A00));
        progress.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.TRANSPARENT));
        FrameLayout.LayoutParams plp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(4), Gravity.TOP);
        plp.topMargin = -dp(6);
        content.addView(progress, plp);

        errorView = buildErrorView();
        errorView.setVisibility(View.GONE);
        content.addView(errorView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        navSpacer = new View(this);
        navSpacer.setBackgroundColor(Color.WHITE);
        root.addView(navSpacer, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0));

        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                setHeight(statusSpacer, bars.top);
                setHeight(navSpacer, Math.max(bars.bottom, ime.bottom));
                v.setPadding(bars.left, 0, bars.right, 0);
                return WindowInsets.CONSUMED;
            });
        }
        return root;
    }

    private LinearLayout buildErrorView() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(SURFACE);
        box.setPadding(dp(32), dp(32), dp(32), dp(32));
        box.setClickable(true);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.admin_icon);
        box.addView(logo, new LinearLayout.LayoutParams(dp(84), dp(84)));

        TextView title = new TextView(this);
        title.setText("No internet connection");
        title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(0xFF1E1B4B);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(20), 0, dp(8));
        box.addView(title);

        errorText = new TextView(this);
        errorText.setText("Please check your mobile data or Wi-Fi and try again.");
        errorText.setTextSize(15);
        errorText.setTextColor(0xFF5B5B7A);
        errorText.setGravity(Gravity.CENTER);
        box.addView(errorText);

        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setAllCaps(false);
        retry.setTextSize(16);
        retry.setTextColor(Color.WHITE);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(BRAND);
        bg.setCornerRadius(dp(14));
        retry.setBackground(bg);
        retry.setPadding(dp(28), dp(12), dp(28), dp(12));
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rlp.topMargin = dp(24);
        retry.setOnClickListener(v -> {
            mainFrameError = false;
            errorView.setVisibility(View.GONE);
            if (web.getUrl() == null || web.getUrl().startsWith("about:")) web.loadUrl(HOME_URL); else web.reload();
        });
        box.addView(retry, rlp);
        return box;
    }

    private void setHeight(View v, int h) {
        ViewGroup.LayoutParams lp = v.getLayoutParams();
        if (lp.height != h) { lp.height = h; v.setLayoutParams(lp); }
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    /* ───────────────────────── Navigation ───────────────────────── */

    private static boolean isAppHost(Uri uri) {
        String host = uri.getHost();
        if (host == null) return false;
        host = host.toLowerCase(Locale.ROOT);
        return host.equals(APP_HOST) || host.endsWith("." + APP_HOST);
    }

    private final class AppWebClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            // All admin screens come from inside the APK; only live data uses the internet.
            return site.serve(request.getUrl(), request.getMethod(), request.isForMainFrame(), APP_HOST);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleUrl(request.getUrl());
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            onAppSite = url != null && isAppHost(Uri.parse(url));
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT) && onAppSite) {
                view.evaluateJavascript(bridgeScript, null);
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (onAppSite) view.evaluateJavascript(bridgeScript, null); // no-op when already injected
            if (!mainFrameError) errorView.setVisibility(View.GONE);
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showError(error.getDescription() == null ? null : error.getDescription().toString());
        }
    }

    private boolean handleUrl(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (scheme.equals("http") || scheme.equals("https")) {
            if (isAppHost(uri)) return false; // stay inside the app
            openExternal(new Intent(Intent.ACTION_VIEW, uri));
            return true;
        }
        if (scheme.equals("blob") || scheme.equals("data") || scheme.equals("about") || scheme.equals("javascript")) return false;
        if (scheme.equals("intent")) {
            try {
                Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
                try { startActivity(intent); }
                catch (ActivityNotFoundException e) {
                    String fallback = intent.getStringExtra("browser_fallback_url");
                    if (fallback != null) openExternal(new Intent(Intent.ACTION_VIEW, Uri.parse(fallback)));
                    else if (intent.getPackage() != null)
                        openExternal(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + intent.getPackage())));
                }
            } catch (Exception e) { toast("This link cannot be opened."); }
            return true;
        }
        // tel:, mailto:, whatsapp:, sms:, upi:, geo: …
        openExternal(new Intent(Intent.ACTION_VIEW, uri));
        return true;
    }

    private void openExternal(Intent intent) {
        try { startActivity(intent); }
        catch (ActivityNotFoundException e) { toast("No app found to open this link."); }
    }

    private void showError(String detail) {
        mainFrameError = true;
        boolean online = isOnline();
        errorText.setText(online
                ? "The page could not be loaded. Please try again." + (detail != null ? "\n(" + detail + ")" : "")
                : "Please check your mobile data or Wi-Fi and try again.");
        ((TextView) errorView.getChildAt(1)).setText(online ? "Something went wrong" : "No internet connection");
        errorView.setVisibility(View.VISIBLE);
    }

    @SuppressWarnings("deprecation")
    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkInfo ni = cm.getActiveNetworkInfo();
        return ni != null && ni.isConnected();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() { handleBack(); }

    private void handleBack() {
        if (errorView.getVisibility() == View.VISIBLE && web.canGoBack()) {
            errorView.setVisibility(View.GONE);
            mainFrameError = false;
            web.goBack();
        } else if (web.canGoBack()) {
            web.goBack();
        } else {
            moveTaskToBack(true);
        }
    }

    /* ───────────────────────── Uploads (files, gallery, camera) ───────────────────────── */

    private final class AppChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progress.setProgress(newProgress);
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) progress.getLayoutParams();
            lp.topMargin = newProgress >= 100 ? -dp(6) : 0;
            progress.setLayoutParams(lp);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            String[] accept = cleanAccept(params.getAcceptTypes());
            boolean wantsImages = accept.length == 0;
            for (String a : accept) if (a.startsWith("image/")) wantsImages = true;

            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            if (accept.length == 1) pick.setType(accept[0]);
            else {
                pick.setType("*/*");
                if (accept.length > 1) pick.putExtra(Intent.EXTRA_MIME_TYPES, accept);
            }
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

            Intent chooser = Intent.createChooser(pick, "Choose file");
            cameraUri = null;
            if (wantsImages) {
                Intent camera = cameraIntent();
                if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
            }
            try {
                startActivityForResult(chooser, REQ_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                toast("No file picker found on this phone.");
                return false;
            }
            return true;
        }
    }

    /** Converts accept values like ".xlsx,.csv,image/*" into MIME types the Android picker understands. */
    private static String[] cleanAccept(String[] raw) {
        List<String> out = new ArrayList<>();
        if (raw != null) for (String group : raw) {
            if (group == null) continue;
            for (String part : group.split(",")) {
                String a = part.trim().toLowerCase(Locale.ROOT);
                if (a.isEmpty()) continue;
                if (a.startsWith(".")) {
                    String ext = a.substring(1);
                    String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                    if (ext.equals("xlsx")) mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                    else if (ext.equals("xls")) mime = "application/vnd.ms-excel";
                    else if (ext.equals("csv")) { addOnce(out, "text/csv"); addOnce(out, "text/comma-separated-values"); mime = "application/csv"; }
                    else if (ext.equals("zip")) { addOnce(out, "application/x-zip-compressed"); mime = "application/zip"; }
                    if (mime != null) addOnce(out, mime);
                } else if (a.contains("/")) addOnce(out, a);
            }
        }
        if (out.contains("*/*")) return new String[0];
        // Some phones label Excel/CSV/ZIP files as octet-stream — keep them selectable.
        for (String m : out) {
            if (!m.startsWith("image/") && !m.startsWith("video/")) { addOnce(out, "application/octet-stream"); break; }
        }
        return out.toArray(new String[0]);
    }

    private static void addOnce(List<String> list, String v) { if (!list.contains(v)) list.add(v); }

    private Intent cameraIntent() {
        try {
            File dir = new File(getCacheDir(), "camera");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File photo = new File(dir, "photo_" + System.currentTimeMillis() + ".jpg");
            cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".files", photo);
            Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            camera.setClipData(ClipData.newRawUri("photo", cameraUri));
            return camera;
        } catch (Exception e) {
            cameraUri = null;
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            List<Uri> uris = new ArrayList<>();
            if (data != null && data.getClipData() != null && !"photo".contentEquals(String.valueOf(data.getClipData().getDescription().getLabel()))) {
                ClipData clip = data.getClipData();
                for (int i = 0; i < clip.getItemCount(); i++) if (clip.getItemAt(i).getUri() != null) uris.add(clip.getItemAt(i).getUri());
            }
            if (uris.isEmpty() && data != null && data.getData() != null) uris.add(data.getData());
            if (uris.isEmpty() && cameraUri != null && cameraFileHasData()) uris.add(cameraUri);
            if (!uris.isEmpty()) result = uris.toArray(new Uri[0]);
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    private boolean cameraFileHasData() {
        try (InputStream in = getContentResolver().openInputStream(cameraUri)) {
            return in != null && in.read() != -1;
        } catch (Exception e) { return false; }
    }

    /* ───────────────────────── Downloads ───────────────────────── */

    private void onDownload(String url, String userAgent, String contentDisposition, String mimeType, long length) {
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            web.evaluateJavascript("window.__msidcSaveUrl && window.__msidcSaveUrl(" + jsString(url) + "," + jsString(name) + ")", null);
            return;
        }
        if (!hasLegacyStoragePermission()) return;
        try {
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) req.addRequestHeader("Cookie", cookie);
            req.addRequestHeader("User-Agent", userAgent);
            req.setMimeType(mimeType);
            req.setTitle(name);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, SAVE_FOLDER + "/" + name);
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            dm.enqueue(req);
            toast("Downloading " + name + "…");
        } catch (Exception e) {
            openExternal(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        }
    }

    private boolean hasLegacyStoragePermission() {
        if (Build.VERSION.SDK_INT >= 29 || Build.VERSION.SDK_INT < 23) return true;
        if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) return true;
        requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
        toast("Allow storage access, then tap download again.");
        return false;
    }

    private static String jsString(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20 || c == 0x2028 || c == 0x2029) b.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    private static String safeName(String name, String mime) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (n.isEmpty() || n.equals("download")) n = "MySchoolID_" + System.currentTimeMillis();
        if (n.length() > 120) n = n.substring(n.length() - 120);
        if (!n.contains(".") && mime != null) {
            String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
            if ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".equals(mime)) ext = "xlsx";
            if (ext != null) n = n + "." + ext;
        }
        return n;
    }

    private static String mimeFor(String name, String given) {
        if (given != null && !given.isEmpty() && !given.equals("application/octet-stream")) return given;
        int dot = name.lastIndexOf('.');
        String ext = dot >= 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        if (ext.equals("xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return m != null ? m : "application/octet-stream";
    }

    private PendingFile openOutput(String rawName, String rawMime) throws Exception {
        PendingFile p = new PendingFile();
        p.mime = rawMime == null || rawMime.isEmpty() ? null : rawMime;
        p.name = safeName(rawName, p.mime);
        p.mime = mimeFor(p.name, p.mime);
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, p.name);
            v.put(MediaStore.Downloads.MIME_TYPE, p.mime);
            v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + SAVE_FOLDER);
            v.put(MediaStore.Downloads.IS_PENDING, 1);
            ContentResolver cr = getContentResolver();
            p.uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (p.uri == null) throw new IllegalStateException("Could not create the file");
            p.out = cr.openOutputStream(p.uri);
        } else {
            @SuppressWarnings("deprecation")
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), SAVE_FOLDER);
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Could not create the Downloads folder");
            File f = new File(dir, p.name);
            int dot = p.name.lastIndexOf('.');
            String base = dot > 0 ? p.name.substring(0, dot) : p.name, ext = dot > 0 ? p.name.substring(dot) : "";
            for (int i = 1; f.exists(); i++) f = new File(dir, base + " (" + i + ")" + ext);
            p.file = f;
            p.name = f.getName();
            p.out = new FileOutputStream(f);
        }
        if (p.out == null) throw new IllegalStateException("Could not write the file");
        return p;
    }

    private void finishOutput(PendingFile p) throws Exception {
        p.out.flush();
        p.out.close();
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.IS_PENDING, 0);
            getContentResolver().update(p.uri, v, null, null);
        } else {
            MediaScannerConnection.scanFile(this, new String[]{p.file.getAbsolutePath()}, new String[]{p.mime}, null);
            p.uri = FileProvider.getUriForFile(this, getPackageName() + ".files", p.file);
        }
    }

    private void abortOutput(PendingFile p) {
        try { p.out.close(); } catch (Exception ignored) {}
        try {
            if (p.uri != null && Build.VERSION.SDK_INT >= 29) getContentResolver().delete(p.uri, null, null);
            if (p.file != null) //noinspection ResultOfMethodCallIgnored
                p.file.delete();
        } catch (Exception ignored) {}
    }

    private void showSaved(PendingFile p) {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
                .setTitle("Downloaded")
                .setMessage(p.name + "\n\nSaved in Downloads › " + SAVE_FOLDER)
                .setPositiveButton("Open", (d, w) -> {
                    Intent view = new Intent(Intent.ACTION_VIEW);
                    view.setDataAndType(p.uri, p.mime);
                    view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    openExternal(Intent.createChooser(view, "Open with"));
                })
                .setNeutralButton("Share", (d, w) -> {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(p.mime);
                    send.putExtra(Intent.EXTRA_STREAM, p.uri);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    openExternal(Intent.createChooser(send, "Share"));
                })
                .setNegativeButton("OK", null)
                .show();
    }

    /** Called from the website (see assets/msidc-bridge.js). Runs on a background thread. */
    private final class Bridge {
        @JavascriptInterface
        public String begin(String name, String mime, long size) {
            if (!onAppSite) return "";
            if (Build.VERSION.SDK_INT < 29 && Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                ui.post(MainActivity.this::hasLegacyStoragePermission);
                return "";
            }
            try {
                PendingFile p = openOutput(name, mime);
                String id = UUID.randomUUID().toString();
                pending.put(id, p);
                ui.post(() -> toast("Saving " + p.name + "…"));
                return id;
            } catch (Exception e) {
                ui.post(() -> toast("Could not save the file: " + e.getMessage()));
                return "";
            }
        }

        @JavascriptInterface
        public void chunk(String id, String base64) {
            PendingFile p = pending.get(id);
            if (p == null) return;
            try { p.out.write(Base64.decode(base64, Base64.DEFAULT)); }
            catch (Exception e) { pending.remove(id); abortOutput(p); ui.post(() -> toast("Could not save the file.")); }
        }

        @JavascriptInterface
        public void end(String id) {
            PendingFile p = pending.remove(id);
            if (p == null) return;
            try { finishOutput(p); ui.post(() -> showSaved(p)); }
            catch (Exception e) { abortOutput(p); ui.post(() -> toast("Could not save the file.")); }
        }

        @JavascriptInterface
        public void fail(String id, String message) {
            PendingFile p = id == null ? null : pending.remove(id);
            if (p != null) abortOutput(p);
            ui.post(() -> toast(message == null || message.isEmpty() ? "Download failed." : message));
        }

        @JavascriptInterface
        public void print(String title) {
            if (!onAppSite) return;
            ui.post(() -> {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (pm == null) return;
                String job = (title == null || title.isEmpty()) ? "My School ID Card" : title;
                pm.print(job, web.createPrintDocumentAdapter(job), new PrintAttributes.Builder().build());
            });
        }

        @JavascriptInterface
        public void share(String title, String text, String url) {
            StringBuilder body = new StringBuilder();
            if (text != null && !text.isEmpty()) body.append(text);
            if (url != null && !url.isEmpty()) { if (body.length() > 0) body.append('\n'); body.append(url); }
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.putExtra(Intent.EXTRA_TEXT, body.toString());
            ui.post(() -> openExternal(Intent.createChooser(send, "Share")));
        }
    }

    /* ───────────────────────── Lifecycle / helpers ───────────────────────── */

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_STORAGE && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED)
            toast("Storage allowed — tap download again.");
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onPause() {
        web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        for (PendingFile p : pending.values()) abortOutput(p);
        pending.clear();
        if (web != null) { web.stopLoading(); web.destroy(); }
        super.onDestroy();
    }

    private void toast(String msg) { Toast.makeText(this, msg, Toast.LENGTH_SHORT).show(); }

    private String appVersion() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
        catch (Exception e) { return "1"; }
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            byte[] buf = new byte[8192];
            StringBuilder sb = new StringBuilder();
            int n;
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            while ((n = in.read(buf)) != -1) bos.write(buf, 0, n);
            sb.append(new String(bos.toByteArray(), StandardCharsets.UTF_8));
            return sb.toString();
        } catch (Exception e) { return ""; }
    }
}
