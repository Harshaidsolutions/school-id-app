import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthUser } from "../types";
import {
  clearAuthStorage,
  getToken,
  getUserJson,
  saveToken,
  saveUserJson,
} from "./tokenStorage";
import { INSTRUCTIONS_READ_KEY } from "../screens/InstructionsScreen";
import { ONBOARDING_COMPLETE_KEY } from "../screens/OnboardingScreen";
import { unregisterStoredPushToken } from "../utils/pushTokenRegistration";
import { recordLogoutForPushSync } from "../utils/pendingNotificationSync";

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  bootstrapping: boolean;
  /** False until the user confirms instructions after this login. */
  instructionsDone: boolean;
  login: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  completeInstructions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [instructionsDone, setInstructionsDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const [storedToken, storedUser, instructionsFlag] = await Promise.all([
          getToken(),
          getUserJson(),
          AsyncStorage.getItem(INSTRUCTIONS_READ_KEY),
        ]);
        if (cancelled) return;
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser) as AuthUser);
          setInstructionsDone(instructionsFlag === "1");
        }
      } catch {
        await clearAuthStorage();
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (nextToken: string, nextUser: AuthUser) => {
    await AsyncStorage.removeItem(INSTRUCTIONS_READ_KEY);
    await saveToken(nextToken);
    await saveUserJson(JSON.stringify(nextUser));
    setInstructionsDone(false);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    const loggingOutUserId = user?.id;
    await unregisterStoredPushToken();
    if (loggingOutUserId) {
      await recordLogoutForPushSync(loggingOutUserId);
    }
    await AsyncStorage.multiRemove([
      INSTRUCTIONS_READ_KEY,
      ONBOARDING_COMPLETE_KEY,
    ]);
    await clearAuthStorage();
    setInstructionsDone(false);
    setToken(null);
    setUser(null);
  }, [user]);

  const completeInstructions = useCallback(async () => {
    await AsyncStorage.setItem(INSTRUCTIONS_READ_KEY, "1");
    setInstructionsDone(true);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      bootstrapping,
      instructionsDone,
      login,
      logout,
      completeInstructions,
    }),
    [
      token,
      user,
      bootstrapping,
      instructionsDone,
      login,
      logout,
      completeInstructions,
    ]
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
