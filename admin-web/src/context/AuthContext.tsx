import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import api from "../api/client";
import { setAuthToken } from "../api/client";
import type { AuthUser } from "../types";
const AUTH_STORAGE_KEY = "harsha_admin_auth";
interface StoredAuth {
  token: string;
  user: AuthUser;
}
interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  authReady: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);
function readStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    if (!parsed?.token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}
function writeStoredAuth(token: string | null, user: AuthUser | null): void {
  if (!token || !user) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user }));
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    const expire = () => {
      setAuthToken(null);
      setToken(null);
      setUser(null);
      writeStoredAuth(null, null);
    };
    window.addEventListener("admin-session-expired", expire);
    return () => window.removeEventListener("admin-session-expired", expire);
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const stored = readStoredAuth();
      if (!stored) {
        setAuthReady(true);
        return;
      }
      setAuthToken(stored.token);
      setToken(stored.token);
      setUser(stored.user);
      try {
        const { data } = await api.get<{ user: AuthUser }>("/admin/profile");
        if (cancelled) return;
        const refreshed = { ...stored.user, ...data.user };
        setUser(refreshed);
        writeStoredAuth(stored.token, refreshed);
      } catch {
        /* keep stored user if profile fetch fails */
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);
  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      authReady,
      login: (nextToken, nextUser) => {
        setAuthToken(nextToken);
        setToken(nextToken);
        setUser(nextUser);
        writeStoredAuth(nextToken, nextUser);
      },
      logout: () => {
        setAuthToken(null);
        setToken(null);
        setUser(null);
        writeStoredAuth(null, null);
      },
    }),
    [token, user, authReady]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
