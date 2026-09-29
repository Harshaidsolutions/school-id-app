import { useEffect } from "react";
import * as ScreenCapture from "expo-screen-capture";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";

const CAPTURE_KEY = "org-secure";

/**
 * Android FLAG_SECURE blocks screenshots and screen recording together.
 * There is no supported API that blocks only one of them. If either
 * organization setting is off, both are blocked. If both are on, capture
 * is allowed. Defaults match the database: both allowed.
 */
export function useOrgCapturePolicy() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    let cancelled = false;

    async function apply(block: boolean) {
      if (block) await ScreenCapture.preventScreenCaptureAsync(CAPTURE_KEY);
      else await ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY);
    }

    if (!isAuthenticated) {
      void apply(false);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const { data } = await api.get<{
          school?: {
            allow_screenshot?: boolean | null;
            allow_screen_recording?: boolean | null;
          };
        }>("/teacher/organization");
        if (cancelled) return;
        const allowScreenshot = data.school?.allow_screenshot !== false;
        const allowRecording = data.school?.allow_screen_recording !== false;
        await apply(!allowScreenshot || !allowRecording);
      } catch {
        /* Keep the last applied policy if the organization request fails. */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);
}
