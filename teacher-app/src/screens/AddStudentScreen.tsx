import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { AddStudentForm } from "../components/AddStudentForm";
import { KeyboardDismissView } from "../components/KeyboardDismissView";
import type { RootStackParamList } from "../navigation/types";
import { spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

type Props = NativeStackScreenProps<RootStackParamList, "AddStudent">;

export function AddStudentScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const classSection = route.params?.classSection;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["bottom"]}
    >
      <KeyboardDismissView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <AddStudentForm
              classSection={classSection}
              onSuccess={() => navigation.goBack()}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </KeyboardDismissView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
