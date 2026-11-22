import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AppColors } from "../theme/palettes";

type Props = {
  value: string;
  options: string[];
  onChange: (next: string) => void;
  colors: AppColors;
  placeholder?: string;
};

/** A real dropdown control (not side-by-side chips) with a clear "Select" option. */
export function InlineDropdown({ value, options, onChange, colors, placeholder = "Select" }: Props) {
  const [open, setOpen] = useState(false);
  const has = value != null && value !== "";
  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderWidth: 1.5,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: has ? colors.text : colors.textMuted, fontWeight: "600", flex: 1 }} numberOfLines={1}>
          {has ? value : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: 24 }}
          onPress={() => setOpen(false)}
        >
          <View
            style={{ backgroundColor: colors.surface, borderRadius: 16, maxHeight: "70%", overflow: "hidden" }}
            onStartShouldSetResponder={() => true}
          >
            <ScrollView>
              {/* Clear / no-selection option */}
              <Pressable
                onPress={() => {
                  onChange("");
                  setOpen(false);
                }}
                style={{ paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
              >
                <Text style={{ color: colors.textMuted, fontWeight: "600", fontStyle: "italic" }}>Select</Text>
              </Pressable>
              {options.map((opt) => {
                const active = value === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => {
                      onChange(opt);
                      setOpen(false);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 18,
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      backgroundColor: active ? colors.greenSoft : "transparent",
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: active ? "700" : "500" }}>{opt}</Text>
                    {active ? <Ionicons name="checkmark" size={18} color={colors.brandGreen} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
