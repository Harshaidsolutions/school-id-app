import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import api, { getErrorMessage } from "../api/client";
import { Pressable } from "./Pressable";
import { fonts } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";

export type SelectionState = {
  locked: boolean;
  finalBy: string | null;
  finalByName: string | null;
  mine: boolean;
  canChange: boolean;
};

/**
 * Who may choose the Template / Model: the admin can turn the choice off, and one person
 * (for example the principal) can mark the choice as final so other teachers cannot change it.
 */
export function useSelectionLock() {
  const [state, setState] = useState<SelectionState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<{ selection: SelectionState }>("/teacher/selection");
      setState(data.selection);
    } catch {
      setState(null); // older server: no restriction
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const setFinal = useCallback(async (final: boolean) => {
    setBusy(true);
    try {
      const { data } = await api.post<{ selection: SelectionState }>("/teacher/selection/final", { final });
      setState(data.selection);
      return null;
    } catch (e) {
      return getErrorMessage(e, "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  /** Message to show when this user may not change the choice, else null. */
  const blockedMessage = !state || state.canChange
    ? null
    : state.locked
      ? "Template and Model selection is turned off by your admin right now."
      : `The final choice was made by ${state.finalByName || "another user"}. Only they or your admin can change it.`;

  return { state, busy, refresh, setFinal, blockedMessage };
}

export function SelectionLockBanner({
  lock,
  onMessage,
}: {
  lock: ReturnType<typeof useSelectionLock>;
  onMessage: (text: string) => void;
}) {
  const { colors } = useTheme();
  const s = lock.state;
  if (!s) return null;

  let icon: keyof typeof Ionicons.glyphMap = "lock-open-outline";
  let tone = "#1EA0E1";
  let text = "You can choose. When the choice is final, mark it so other teachers cannot change it.";
  if (s.locked) {
    icon = "lock-closed";
    tone = "#E8243C";
    text = "Selection is turned off by your admin. You can still look at the designs.";
  } else if (s.finalBy && !s.mine) {
    icon = "lock-closed";
    tone = "#F26A1B";
    text = `Final choice made by ${s.finalByName || "another user"}. Only they or your admin can change it.`;
  } else if (s.mine) {
    icon = "checkmark-circle";
    tone = "#16A34A";
    text = "You marked this choice as final. Other teachers cannot change it.";
  }

  const showButton = !s.locked && (!s.finalBy || s.mine);
  return (
    <View style={[st.box, { borderColor: tone, backgroundColor: colors.surface }]}>
      <Ionicons name={icon} size={20} color={tone} />
      <Text style={[st.text, { color: colors.text }]}>{text}</Text>
      {showButton ? (
        <Pressable
          disabled={lock.busy}
          onPress={async () => {
            const err = await lock.setFinal(!s.mine);
            onMessage(err ?? (s.mine ? "Choice unlocked." : "Choice marked as final."));
          }}
          style={[st.btn, { backgroundColor: tone }]}
          accessibilityRole="button"
        >
          {lock.busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={st.btnText}>{s.mine ? "Unlock" : "Mark final"}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5 },
  text: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  btn: { minWidth: 92, minHeight: 36, borderRadius: 18, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#FFFFFF", fontFamily: fonts.headingSemiBold, fontSize: 13 },
});
