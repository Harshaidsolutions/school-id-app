import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientButton } from "../components/GradientButton";
import { useAuth } from "../auth/AuthContext";
import type { RootStackParamList } from "../navigation/types";
import { spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";

type Props = NativeStackScreenProps<RootStackParamList, "ReadInstructions">;

export function ReadInstructionsScreen({ navigation }: Props) {
  const styles = useReadInstructionsStyles();
  const { colors } = useTheme();
  const { completeInstructions } = useAuth();

  async function handleYes() {
    await completeInstructions();
  }

  function handleNo() {
    navigation.goBack();
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "bottom"]}
    >
      <View style={styles.container}>
        {/* Clipboard illustration */}
        <View style={styles.clipboardWrap}>
          <View
            style={[styles.clipboard, { backgroundColor: colors.splashYellow }]}
          >
            <View
              style={[styles.clipTop, { backgroundColor: colors.primaryOrange }]}
            />
            <View style={styles.clipLine} />
            <View style={styles.clipLineShort} />
            <View style={styles.clipLine} />
            <View style={styles.clipLineShort} />
          </View>
          <View style={styles.checkBadge}>
            <Ionicons
              name="checkmark-circle"
              size={40}
              color={colors.brandGreen}
            />
          </View>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Have you read</Text>
        <Text style={[styles.title, { color: colors.text }]}>
          all the instructions?
        </Text>
        <Text style={[styles.subtitle, { color: colors.primaryOrange }]}>
          Please confirm to continue
        </Text>

        <View style={styles.buttons}>
          <GradientButton
            label="Yes, I have read"
            variant="orange"
            onPress={() => void handleYes()}
          />
          <View style={{ height: spacing.sm + 2 }} />
          <GradientButton
            label="No, I want to read again"
            variant="orangeOutline"
            onPress={handleNo}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function useReadInstructionsStyles() {
  return useResponsiveStyles(({ scale }) => ({
    safe: { flex: 1 ,
      backgroundColor: "#FAF8FF"
    },
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.xl + scale(8),

      backgroundColor: "#FAF8FF"
    },
    clipboardWrap: {
      marginBottom: spacing.xl + scale(4),
      alignItems: "center",

      backgroundColor: "#E6FAF1",
      borderRadius: 30
    },
    clipboard: {
      width: scale(80),
      height: scale(100),
      borderRadius: 24,
      padding: spacing.sm + 2,
      paddingTop: spacing.xl,
      gap: spacing.xs,

      backgroundColor: "#FFFFFF",
      shadowColor: "#005C55",
      shadowOpacity: 0.09,
      shadowRadius: 15
    },
    clipTop: {
      position: "absolute",
      top: -spacing.xs,
      alignSelf: "center",
      left: spacing.xl,
      width: scale(32),
      height: scale(16),
      borderRadius: spacing.xxs,
    },
    clipLine: {
      height: spacing.xxs,
      backgroundColor: "#D9E8DF",
      borderRadius: spacing.xxs / 2,
    },
    clipLineShort: {
      height: spacing.xxs,
      width: "60%",
      backgroundColor: "#D9E8DF",
      borderRadius: spacing.xxs / 2,
    },
    checkBadge: {
      position: "absolute",
      bottom: -spacing.sm,
      right: -spacing.sm,
    },
    title: {
      fontFamily: fonts.bold,
      fontSize: typeScale.xl,
      textAlign: "center",

      color: "#131B2E"
    },
    subtitle: {
      fontFamily: fonts.medium,
      fontSize: typeScale.md,
      textAlign: "center",
      marginTop: spacing.sm - 2,
      marginBottom: spacing.xl + scale(4),

      color: "#647775"
    },
    buttons: {
      width: "100%",
    },
  }));
}
