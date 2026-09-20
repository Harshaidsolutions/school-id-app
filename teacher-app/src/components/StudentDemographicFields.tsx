import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  BLOOD_GROUP_OPTIONS,
  GENDER_OPTIONS,
  dobToIsoDate,
  formatDobDisplay,
  parseDob,
} from "../constants/studentOptions";
import { radius, spacing } from "../theme/colors";
import type { AppColors } from "../theme/palettes";
import { fonts, type as typeScale } from "../theme/typography";

type FieldProps = {
  label: string;
  colors: AppColors;
  inputStyle: object[];
};

export function StudentDobField({
  label,
  colors,
  inputStyle,
  value,
  onChange,
}: FieldProps & { value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const display = value ? formatDobDisplay(value) : "";

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Pressable
        style={[...inputStyle, styles.selectRow]}
        onPress={() => setOpen(true)}
      >
        <Text
          style={[
            styles.selectText,
            { color: display ? colors.text : colors.textSubtle },
          ]}
        >
          {display || "Select date of birth"}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <DateTimePicker
          value={parseDob(value)}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          maximumDate={new Date()}
          onChange={(event: DateTimePickerEvent, date?: Date) => {
            if (Platform.OS === "android") setOpen(false);
            if (event.type === "dismissed") {
              setOpen(false);
              return;
            }
            if (date) onChange(dobToIsoDate(date));
          }}
        />
      ) : null}
    </View>
  );
}

function OptionSelectField({
  label,
  colors,
  inputStyle,
  value,
  options,
  placeholder,
  onChange,
}: FieldProps & {
  value: string;
  options: readonly string[];
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Pressable
        style={[...inputStyle, styles.selectRow]}
        onPress={() => setOpen(true)}
      >
        <Text
          style={[
            styles.selectText,
            { color: value ? colors.text : colors.textSubtle },
          ]}
        >
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View
            style={[styles.sheet, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {label}
            </Text>
            <FlatList
              data={[...options]}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const selected = item === value;
                return (
                  <Pressable
                    style={[
                      styles.optionRow,
                      {
                        backgroundColor: selected
                          ? colors.greenSoft
                          : colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        {
                          color: selected ? colors.brandGreen : colors.text,
                          fontFamily: selected ? fonts.semiBold : fonts.regular,
                        },
                      ]}
                    >
                      {item}
                    </Text>
                    {selected ? (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={colors.brandGreen}
                      />
                    ) : null}
                  </Pressable>
                );
              }}
            />
            <Pressable
              style={[styles.cancelBtn, { backgroundColor: colors.graySoft }]}
              onPress={() => setOpen(false)}
            >
              <Text style={[styles.cancelText, { color: colors.text }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export function StudentGenderField(
  props: FieldProps & { value: string; onChange: (v: string) => void }
) {
  return (
    <OptionSelectField
      {...props}
      options={GENDER_OPTIONS}
      placeholder="Select gender"
    />
  );
}

export function StudentBloodGroupField(
  props: FieldProps & { value: string; onChange: (v: string) => void }
) {
  return (
    <OptionSelectField
      {...props}
      options={BLOOD_GROUP_OPTIONS}
      placeholder="Select blood group"
    />
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.sm + 2 },
  label: {
    marginBottom: spacing.xxs + 2,
    fontSize: typeScale.rowTitle,
    fontFamily: fonts.semiBold,
  },
  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typeScale.rowTitle,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,34,51,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.md,
    maxHeight: "60%",
  },
  sheetTitle: {
    fontFamily: fonts.bold,
    fontSize: typeScale.lg,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  optionText: { fontSize: typeScale.body },
  cancelBtn: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  cancelText: { fontFamily: fonts.semiBold, fontSize: typeScale.body },
});
