import * as SecureStore from "expo-secure-store";

/** Saved login accounts (username + password) kept in the device secure store so the
 * user can pick a saved login and have both fields auto-filled. */
export type SavedCredential = { username: string; password: string };

const STORE_KEY = "saved_login_credentials_v1";

export async function loadSavedCredentials(): Promise<SavedCredential[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is SavedCredential =>
        c && typeof c.username === "string" && typeof c.password === "string" && c.username.trim() !== ""
    );
  } catch {
    return [];
  }
}

export async function saveCredential(username: string, password: string): Promise<void> {
  const u = username.trim();
  if (!u || !password) return;
  try {
    const list = await loadSavedCredentials();
    const next = [{ username: u, password }, ...list.filter((c) => c.username.toLowerCase() !== u.toLowerCase())].slice(0, 8);
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export async function removeCredential(username: string): Promise<void> {
  try {
    const list = await loadSavedCredentials();
    const next = list.filter((c) => c.username.toLowerCase() !== username.trim().toLowerCase());
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
