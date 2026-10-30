import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL, getAuthToken } from "../api/client";

/** A file ready for FormData (React Native style). */
export type PickedFile = { uri: string; name: string; type: string; size?: number };

export function asFormFile(file: PickedFile) {
  return { uri: file.uri, name: file.name, type: file.type } as unknown as Blob;
}

function extOf(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function mimeFromName(name: string, fallback = "application/octet-stream") {
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel",
    csv: "text/csv", zip: "application/zip", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  };
  return map[extOf(name)] ?? fallback;
}

/** Camera photo (JPEG). */
export async function takePhoto(options?: { square?: boolean }): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Camera permission needed", "Allow camera access in Settings to take photos.");
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.9,
    allowsEditing: options?.square ?? false,
    aspect: options?.square ? [1, 1] : undefined,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.fileName ?? `photo_${Date.now()}.jpg`, type: a.mimeType ?? "image/jpeg", size: a.fileSize };
}

/** Gallery image(s). */
export async function pickImages(multiple = false, limit = 250): Promise<PickedFile[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.92,
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? limit : 1,
  });
  if (res.canceled) return [];
  return res.assets.map((a, i) => ({
    uri: a.uri,
    name: a.fileName ?? `image_${Date.now()}_${i}.jpg`,
    type: a.mimeType ?? mimeFromName(a.fileName ?? "", "image/jpeg"),
    size: a.fileSize,
  }));
}

/** Any document (Excel, ZIP, PDF, video…). */
export async function pickDocuments(types: string[], multiple = false): Promise<PickedFile[]> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, multiple, copyToCacheDirectory: true });
  if (res.canceled) return [];
  return res.assets.map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType ?? mimeFromName(a.name), size: a.size }));
}

export const DOC_TYPES = {
  excel: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream",
  ],
  zip: ["application/zip", "application/x-zip-compressed", "application/octet-stream", "image/jpeg", "image/png"],
  imageOrPdf: ["image/jpeg", "image/png", "application/pdf"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
};

export function sizeOk(file: PickedFile, mb: number) {
  return !file.size || file.size <= mb * 1024 * 1024;
}

const DIR_KEY = "msidc_download_dir";

function cleanName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || `download_${Date.now()}`;
}

/**
 * Downloads a private file from the server (Excel, ZIP, photo…) and saves it to the
 * phone. Android: into the folder the user picked once (default Downloads). Then the
 * user can open or share it.
 */
export async function downloadFile(apiPath: string, fallbackName: string, params?: Record<string, string | undefined>) {
  const query = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const url = `${API_BASE_URL}${apiPath}${query ? (apiPath.includes("?") ? "&" : "?") + query : ""}`;
  const temp = `${FileSystem.cacheDirectory}${Date.now()}_${cleanName(fallbackName)}`;
  const token = getAuthToken();
  const res = await FileSystem.downloadAsync(url, temp, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (res.status < 200 || res.status >= 300) {
    let message = "Download failed.";
    try {
      const text = await FileSystem.readAsStringAsync(res.uri);
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      /* not JSON */
    }
    await FileSystem.deleteAsync(res.uri, { idempotent: true });
    throw new Error(message);
  }
  const disposition = res.headers["Content-Disposition"] ?? res.headers["content-disposition"] ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = cleanName(match?.[1] ? decodeURIComponent(match[1]) : fallbackName);
  const mime = res.headers["Content-Type"] ?? res.headers["content-type"] ?? mimeFromName(name);
  const folder = `${FileSystem.cacheDirectory}dl_${Date.now()}/`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  const finalUri = `${folder}${name}`;
  await FileSystem.moveAsync({ from: res.uri, to: finalUri });
  return saveToPhone(finalUri, name, String(mime).split(";")[0]);
}

/** Saves a local file into the phone's storage (Android) and offers Open/Share. */
function ask(title: string, message: string, buttons: { text: string; value: string }[]): Promise<string> {
  return new Promise((resolve) =>
    Alert.alert(title, message, buttons.map((b) => ({ text: b.text, onPress: () => resolve(b.value) })), {
      cancelable: true,
      onDismiss: () => resolve("cancel"),
    })
  );
}

/**
 * Saves a downloaded file. Android: into a folder the admin picks once (Android does not
 * allow apps to use the Downloads root directly, so we suggest a "My School ID" folder
 * inside it) — or share/open it straight away (WhatsApp, Drive, Files…).
 */
export async function saveToPhone(localUri: string, name: string, mime: string): Promise<string> {
  if (Platform.OS !== "android") {
    await shareFile(localUri, mime);
    return "shared";
  }
  const SAF = FileSystem.StorageAccessFramework;
  const write = async (folder: string) => {
    const target = await SAF.createFileAsync(folder, name.replace(/\.[^.]+$/, ""), mime);
    const data = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
    await FileSystem.writeAsStringAsync(target, data, { encoding: FileSystem.EncodingType.Base64 });
  };
  let dir = await SecureStore.getItemAsync(DIR_KEY).catch(() => null);
  if (dir) {
    try {
      await write(dir);
      const next = await ask("Downloaded ✓", `${name}\nSaved in your “My School ID” folder.`, [
        { text: "Share / Open", value: "share" },
        { text: "OK", value: "ok" },
      ]);
      if (next === "share") await shareFile(localUri, mime);
      return "saved";
    } catch {
      dir = null;
      await SecureStore.deleteItemAsync(DIR_KEY).catch(() => undefined);
    }
  }
  const choice = await ask("File ready", `${name}\n\nSave it on this phone, or share / open it?`, [
    { text: "Share / Open", value: "share" },
    { text: "Save to phone", value: "save" },
  ]);
  if (choice === "share") {
    await shareFile(localUri, mime);
    return "shared";
  }
  if (choice !== "save") return "cancel";
  await ask(
    "Choose a folder",
    "Next, Android asks for a folder.\n\n1. Open “Download”.\n2. Tap ⋮ (or the folder icon) → New folder → name it “My School ID”.\n3. Open it and tap “Use this folder” → Allow.\n\nYou only do this once.",
    [{ text: "Continue", value: "ok" }]
  );
  const perm = await SAF.requestDirectoryPermissionsAsync(SAF.getUriForDirectoryInRoot("Download"));
  if (!perm.granted) {
    await shareFile(localUri, mime);
    return "shared";
  }
  try {
    await write(perm.directoryUri);
    await SecureStore.setItemAsync(DIR_KEY, perm.directoryUri).catch(() => undefined);
    Alert.alert("Downloaded ✓", `${name}\nSaved. Next downloads go to the same folder automatically.`);
    return "saved";
  } catch {
    Alert.alert("Could not save there", "Please choose a folder inside Download (not Download itself). Opening share instead.");
    await shareFile(localUri, mime);
    return "shared";
  }
}

export async function shareFile(localUri: string, mime?: string) {
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(localUri, { mimeType: mime, dialogTitle: "Share file" });
}

/** Lets the user change the download folder next time. */
export async function resetDownloadFolder() {
  await SecureStore.deleteItemAsync(DIR_KEY).catch(() => undefined);
}
