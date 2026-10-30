import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import api, { setAuthToken, setSessionExpiredHandler } from "../api/client";
import type { AuthUser } from "../shared/types";

const KEY = "msidc_admin_auth";

type Ctx = {
  ready: boolean;
  token: string | null;
  user: AuthUser | null;
  isSuperAdmin: boolean;
  login: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => void;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const persist = useCallback(async (t: string | null, u: AuthUser | null) => {
    try {
      if (t && u) await SecureStore.setItemAsync(KEY, JSON.stringify({ token: t, user: u }));
      else await SecureStore.deleteItemAsync(KEY);
    } catch {
      /* storage unavailable: session stays in memory */
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    await persist(null, null);
  }, [persist]);

  const refreshProfile = useCallback(async () => {
    try {
      const { data } = await api.get<{ user: AuthUser }>("/admin/profile");
      setUser((prev) => {
        const next = prev ? { ...prev, ...data.user } : data.user;
        setToken((t) => {
          void persist(t, next);
          return t;
        });
        return next;
      });
    } catch {
      /* keep stored profile */
    }
  }, [persist]);

  useEffect(() => {
    setSessionExpiredHandler(() => void logout());
    let cancelled = false;
    void (async () => {
      try {
        const raw = await SecureStore.getItemAsync(KEY);
        const saved = raw ? (JSON.parse(raw) as { token?: string; user?: AuthUser }) : null;
        if (saved?.token && saved.user?.id && !cancelled) {
          setAuthToken(saved.token);
          setToken(saved.token);
          setUser(saved.user);
          void refreshProfile();
        }
      } catch {
        /* ignore broken storage */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      setSessionExpiredHandler(null);
    };
  }, [logout, refreshProfile]);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      token,
      user,
      isSuperAdmin: user?.isSuperAdmin === true,
      login: async (t, u) => {
        setAuthToken(t);
        setToken(t);
        setUser(u);
        await persist(t, u);
      },
      logout,
      updateUser: (patch) =>
        setUser((prev) => {
          if (!prev) return prev;
          const next = { ...prev, ...patch };
          void persist(token, next);
          return next;
        }),
      refreshProfile,
    }),
    [ready, token, user, persist, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
