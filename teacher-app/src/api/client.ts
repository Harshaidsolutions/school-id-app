import axios, { type AxiosError } from "axios";
import Constants from "expo-constants";
import { getToken } from "../auth/tokenStorage";
import type { ApiErrorBody } from "../types";

/**
 * Same backend that serves the admin web app (nginx + Express on EC2).
 * Admin uses same-origin `/api`. This app uses origin + `/api`.
 *
 * Resolution order:
 *   1. EXPO_PUBLIC_API_URL (Metro / EAS)
 *   2. app.json extra.apiUrl (baked into native APKs)
 *   3. Production EC2 origin (never fall back to localhost on a phone)
 */
const PRODUCTION_ORIGIN = "https://myschoolidcard.in";

function extraApiUrl(): string {
  const extra = Constants.expoConfig?.extra as { apiUrl?: unknown } | undefined;
  const raw = extra?.apiUrl;
  return typeof raw === "string" ? raw.trim().replace(/\/$/, "") : "";
}

const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, "");

export const SERVER_ORIGIN = fromEnv || extraApiUrl() || PRODUCTION_ORIGIN;

export const API_BASE_URL = `${SERVER_ORIGIN}/api`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Let axios/RN set multipart boundary — manual Content-Type breaks field parsing.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const ax = error as AxiosError<ApiErrorBody>;
    if (!ax.response) {
      return "Network error. Check that the backend is running and reachable.";
    }
    return ax.response.data?.message ?? fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

let onSessionExpired: (() => Promise<void>) | null = null;
export function setSessionExpiredHandler(handler: (() => Promise<void>) | null) {
  onSessionExpired = handler;
}
let expiring: Promise<void> | null = null;
api.interceptors.response.use((response) => response, async (error) => {
  if (error.response?.status === 401 && onSessionExpired) {
    const currentToken = await getToken();
    if (currentToken && error.config?.headers?.Authorization === `Bearer ${currentToken}`) {
      if (!expiring) expiring = onSessionExpired().finally(() => { expiring = null; });
      await expiring;
    }
  }
  return Promise.reject(error);
});

export default api;
