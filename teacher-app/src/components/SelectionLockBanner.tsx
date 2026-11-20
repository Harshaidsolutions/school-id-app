import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import api, { getErrorMessage } from "../api/client";
import { fonts } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";

export type SelectionKind = "template" | "model";

export type SelectionState = {
  locked: boolean;
  templateLocked: boolean;
  modelLocked: boolean;
  finalBy: string | null;
  finalByName: string | null;
  mine: boolean;
  canChange: boolean;
  canChangeTemplate: boolean;
  canChangeModel: boolean;
};

/**
 * Who may choose the Template / Model: the admin can turn the choice off, and one person
 * (for example the principal) can mark the choice as final so other teachers cannot change it.
 */
export function useSelectionLock(kind: SelectionKind) {
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

  /** Message to show when the admin has turned THIS choice off, else null. */
  const blockedMessage = !state
    ? null
    : kind === "model"
      ? (state.modelLocked ? "Model selection is turned off by your admin right now." : null)
      : (state.templateLocked ? "Template selection is turned off by your admin right now." : null);

  return { state, busy, refresh, setFinal, blockedMessage, kind };
}

export function SelectionLockBanner({
  lock,
}: {
  lock: ReturnType<typeof useSelectionLock>;
}) {
  const { colors } = useTheme();
  // Selection is controlled only by the admin. Show a notice ONLY when the admin
  // has turned THIS choice off; otherwise no banner and no lock/unlock buttons.
  if (!lock.blockedMessage) return null;

  const tone = "#E8243C";
  const noun = lock.kind === "model" ? "Model" : "Template";
  return (
    <View style={[st.box, { borderColor: tone, backgroundColor: colors.surface }]}>
      <Ionicons name="lock-closed" size={20} color={tone} />
      <Text style={[st.text, { color: colors.text }]}>
        {noun} selection is turned off by your admin. You can still look at the designs.
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5 },
  text: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  btn: { minWidth: 92, minHeight: 36, borderRadius: 18, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#FFFFFF", fontFamily: fonts.headingSemiBold, fontSize: 13 },
});
