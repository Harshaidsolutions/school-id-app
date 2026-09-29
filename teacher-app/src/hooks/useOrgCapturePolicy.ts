import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as ScreenCapture from "expo-screen-capture";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";

const CAPTURE_KEY = "org-secure";

/**
 * Android's supported block is WindowManager.LayoutParams.FLAG_SECURE
 * (expo-screen-capture). It blocks screenshots and screen recording
 * together, including the recents thumbnail. There is no public Android
 * API that blocks only one of them. FLAG_SECURE is set when either
 * organization flag is false, and cleared only when both are true.
 * A flag that is ON is therefore also blocked while the other is OFF.
 */
function isOff(value: unknown): boolean {
  return value === false || value === "false" || value === "f" || value === 0 || value === "0";
}

export function useOrgCapturePolicy() {
  const { isAuthenticated, bootstrapping, user } = useAuth();
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;

    async function apply(block: boolean) {
      if (id !== requestId.current) return;
      if (!block) {
        await ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY);
        return;
      }
      // The JS tag survives activity recreation, but FLAG_SECURE does not.
      // Clearing the tag forces the native call onto the current window.
      await ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY);
      if (id !== requestId.current) return;
      await ScreenCapture.preventScreenCaptureAsync(CAPTURE_KEY);
    }

    async function load() {
      if (bootstrapping || id !== requestId.current) return;
      if (!isAuthenticated) {
        await apply(false);
        return;
      }
      try {
        const { data } = await api.get<{
          school?: {
            allow_screenshot?: boolean | null;
            allow_screen_recording?: boolean | null;
          };
        }>("/teacher/organization");
        if (id !== requestId.current) return;
        const org = data.school;
        await apply(isOff(org?.allow_screenshot) || isOff(org?.allow_screen_recording));
      } catch {
        /* Retry on the next resume. Do not clear a block that already applied. */
      }
    }

    void load();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });

    return () => {
      requestId.current += 1;
      subscription.remove();
    };
  }, [isAuthenticated, bootstrapping, user?.id]);
}
