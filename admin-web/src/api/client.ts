import axios from "axios";

/**
 * Same-origin API when admin-web is served by the backend (production / Railway).
 * During local `vite` dev only, vite.config.ts proxies /api → the backend PORT.
 */
const API_BASE_URL = "/api";

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

api.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 401 && authToken &&
      error.config?.headers?.Authorization === `Bearer ${authToken}`) {
    setAuthToken(null);
    window.dispatchEvent(new Event("admin-session-expired"));
  }
  return Promise.reject(error);
});

export default api;
