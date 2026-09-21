import { useRef } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Platform, ScrollView, StyleSheet } from "react-native";
import { AddStudentForm } from "../components/AddStudentForm";
import { KeyboardDismissView } from "../components/KeyboardDismissView";
import type { RootStackParamList } from "../navigation/types";
import { spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { scrollToFocusedInput } from "../utils/scrollToFocusedInput";

type Props = NativeStackScreenProps<RootStackParamList, "AddStudent">;

export function AddStudentScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const classSection = route.params?.classSection;
  const scrollRef = useRef<ScrollView>(null);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["bottom"]}
    >
      <KeyboardDismissView style={styles.flex}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <AddStudentForm
            classSection={classSection}
            onSuccess={() => navigation.goBack()}
            onInputFocus={(target) =>
              scrollToFocusedInput(scrollRef, target)
            }
          />
        </ScrollView>
      </KeyboardDismissView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
