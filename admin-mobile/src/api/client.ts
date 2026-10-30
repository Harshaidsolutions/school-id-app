import axios from "axios";
import Constants from "expo-constants";

/** Same backend as the admin website (https://myschoolidcard.in/api). */
const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };
export const SERVER_ORIGIN = (process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || "https://myschoolidcard.in")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");
export const API_BASE_URL = `${SERVER_ORIGIN}/api`;

let authToken: string | null = null;
let onExpired: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken() {
  return authToken;
}
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onExpired = handler;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
  headers: { "Content-Type": "application/json", "X-Client": "admin-mobile" },
});

api.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    // Let React Native set the multipart boundary.
    delete config.headers["Content-Type"];
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error?.response?.status === 401 &&
      authToken &&
      error.config?.headers?.Authorization === `Bearer ${authToken}` &&
      !String(error.config?.url ?? "").startsWith("/auth/")
    ) {
      onExpired?.();
    }
    return Promise.reject(error);
  }
);

/** Friendly error text from any failed request. */
export function errMsg(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return "No internet connection. Please check your network and try again.";
    const data = error.response.data as { message?: string } | undefined;
    if (data && typeof data === "object" && data.message) return data.message;
    return fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Turns a stored path (/uploads/…) into a full URL. */
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u) return null;
  if (/^(https?:|data:|file:|content:)/i.test(u)) return u;
  return `${SERVER_ORIGIN}${u.startsWith("/") ? "" : "/"}${u}`;
}

/** Image source with the admin login attached (photos are private). */
export function authedSource(url: string | null | undefined) {
  const uri = mediaUrl(url);
  if (!uri) return null;
  const isOwn = uri.startsWith(SERVER_ORIGIN);
  return { uri, headers: isOwn && authToken ? { Authorization: `Bearer ${authToken}` } : undefined };
}

/** Image source for an API path such as /admin/students/:id/photo?thumb=1 */
export function apiImage(path: string) {
  return { uri: `${API_BASE_URL}${path}`, headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined };
}

export default api;
