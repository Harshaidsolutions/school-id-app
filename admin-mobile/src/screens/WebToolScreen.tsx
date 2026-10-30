import { useRef, useState } from "react";
import { ActivityIndicator, BackHandler, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback } from "react";
import { SERVER_ORIGIN } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { C, S } from "../theme";
import { Header } from "../ui/Screen";
import { Banner, Muted } from "../ui/kit";
import { saveToPhone } from "../lib/files";
import type { ScreenProps } from "../navigation/types";

/**
 * Heavy design tools (ID card generator, cropping tool) run here, inside the app,
 * signed in with the same admin login. Files they create are saved to the phone.
 */
export function WebToolScreen({ route, navigation }: ScreenProps<"WebTool">) {
  const { path, title } = route.params;
  const { token, user } = useAuth();
  const ref = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canGoBack = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (canGoBack.current) {
          ref.current?.goBack();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [])
  );

  const auth = JSON.stringify({ token, user });
  const before = `
    try {
      window.__MSIDC_EMBED__ = true;
      localStorage.setItem("harsha_admin_auth", ${JSON.stringify(auth)});
      (function () {
        var post = function (m) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
        var blobs = {};
        var oc = URL.createObjectURL;
        URL.createObjectURL = function (o) { var u = oc.apply(URL, arguments); try { if (o instanceof Blob) blobs[u] = o; } catch (e) {} return u; };
        var orv = URL.revokeObjectURL;
        URL.revokeObjectURL = function (u) { setTimeout(function () { delete blobs[u]; try { orv.call(URL, u); } catch (e) {} }, 120000); };
        function save(blob, name) {
          var r = new FileReader();
          r.onload = function () { var s = String(r.result || ""); post({ type: "file", name: name || "download", mime: blob.type || "", data: s.substring(s.indexOf(",") + 1) }); };
          r.onerror = function () { post({ type: "error", message: "Could not read the file." }); };
          r.readAsDataURL(blob);
        }
        function fromUrl(h, name) {
          if (blobs[h]) return save(blobs[h], name);
          fetch(h).then(function (x) { return x.blob(); }).then(function (b) { save(b, name); }).catch(function () { post({ type: "error", message: "Download failed." }); });
        }
        function isFile(a) { var h = (a && a.href) || ""; return h.indexOf("blob:") === 0 || h.indexOf("data:") === 0; }
        var oclick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () { if (isFile(this)) return fromUrl(this.href, this.getAttribute("download")); return oclick.apply(this, arguments); };
        var odisp = EventTarget.prototype.dispatchEvent;
        HTMLAnchorElement.prototype.dispatchEvent = function (ev) { if (ev && ev.type === "click" && isFile(this)) { fromUrl(this.href, this.getAttribute("download")); return false; } return odisp.call(this, ev); };
        document.addEventListener("click", function (ev) { var a = ev.target && ev.target.closest ? ev.target.closest("a") : null; if (a && isFile(a)) { ev.preventDefault(); ev.stopImmediatePropagation(); fromUrl(a.href, a.getAttribute("download")); } }, true);
        window.print = function () { post({ type: "error", message: "To print, download the PDF and open it with a printer app." }); };
        if (navigator.serviceWorker) { navigator.serviceWorker.register = function () { return Promise.reject(new Error("off")); }; }
      })();
    } catch (e) {}
    true;
  `;

  async function onMessage(e: WebViewMessageEvent) {
    if (e.nativeEvent.data === "close") return navigation.goBack();
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type: string; name?: string; mime?: string; data?: string; message?: string };
      if (msg.type === "error") return setError(msg.message ?? "Something went wrong.");
      if (msg.type === "file" && msg.data) {
        const name = (msg.name || `download_${Date.now()}`).replace(/[\\/:*?"<>|]+/g, "_");
        const folder = `${FileSystem.cacheDirectory}tool_${Date.now()}/`;
        await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
        const uri = `${folder}${name}`;
        await FileSystem.writeAsStringAsync(uri, msg.data, { encoding: FileSystem.EncodingType.Base64 });
        await saveToPhone(uri, name, msg.mime || "application/octet-stream");
      }
    } catch {
      /* not a JSON message */
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <Header title={title} subtitle="Design tool" />
      {error ? (
        <View style={{ padding: S.md }}>
          <Banner text={error} onClose={() => setError(null)} />
        </View>
      ) : null}
      <WebView
        ref={ref}
        source={{ uri: `${SERVER_ORIGIN}${path}` }}
        injectedJavaScriptBeforeContentLoaded={before}
        onMessage={(e: WebViewMessageEvent) => void onMessage(e)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(s: { canGoBack: boolean }) => {
          canGoBack.current = s.canGoBack;
        }}
        onError={() => setError("Could not open the tool. Check your internet connection.")}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        originWhitelist={["https://*"]}
        style={{ flex: 1 }}
      />
      {loading ? (
        <View style={[StyleSheet.absoluteFill, { top: 120, alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
          <ActivityIndicator size="large" color={C.primary} />
          <Muted style={{ marginTop: 8 }}>Opening {title.toLowerCase()}…</Muted>
        </View>
      ) : null}
    </View>
  );
}
