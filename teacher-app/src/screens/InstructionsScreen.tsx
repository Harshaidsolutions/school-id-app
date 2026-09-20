import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientButton } from "../components/GradientButton";
import { useAuth } from "../auth/AuthContext";
import type { RootStackParamList } from "../navigation/types";
import { spacing } from "../theme/colors";
import { fonts, textStyles, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { useState } from "react";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";

type Props = NativeStackScreenProps<RootStackParamList, "Instructions">;

export const INSTRUCTIONS_READ_KEY = "teacher_instructions_read";

/** Set when the client provides the sample photo URL. */
export const SAMPLE_PHOTO_URL = "";

type StepItem = {
  text: string;
  /** Optional tappable link label shown after the step text */
  linkLabel?: string;
  linkUrl?: string;
};

const STEPS: StepItem[] = [
  { text: "Take clear and proper photos in good lighting." },
  { text: "Upload correct student data." },
  { text: "Choose the right template and model." },
  { text: "Upload logo, signature and other requirements." },
  { text: "Check all details before submitting." },
  { text: "ID cards will be printed as per the provided data." },
  { text: "No changes allowed after final submission." },
  { text: "Contact support for any assistance." },
  { text: "Use this app only for authorized purpose." },
  { text: "Follow all the above steps for best results." },
  {
    text: "This app works only on Android phones. It does not work on iPhones (iOS).",
  },
  {
    text: "Do not share your username and password with anyone without permission from the Principal or Admin.",
  },
  {
    text: "Please ask the Admin for a sample student photo. Check the sample photo carefully and take the students' photos in the same way.",
    linkLabel: SAMPLE_PHOTO_URL ? "View sample photo" : undefined,
    linkUrl: SAMPLE_PHOTO_URL || undefined,
  },
  {
    text: "Make sure the student wears the full uniform and is looking straight at the phone camera. The student should stand straight and should not wear glasses or a cap. Make sure the student is not closing their eyes, looking sideways, or smiling too much.",
  },
  {
    text: "Make sure the background is one color. After taking the photo, check it carefully. If the photo is good, upload it. If not, take the photo again.",
  },
  {
    text: "Leave some space above the student's head and on both sides of the shoulders. Take the photo only up to the student's stomach.",
  },
  {
    text: "The username and password given to you will work for only 5 working days. Please complete the full student photo shoot within these 5 working days.",
  },
  {
    text: "If a student is absent, please call the parent and ask them to send the student's photo. Then upload the photo. You can also take the photo when the student comes to school.",
  },
];

export function InstructionsScreen(_props: Props) {
  const styles = useInstructionsStyles();
  const { colors } = useTheme();
  const { completeInstructions } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleYes() {
    setConfirmOpen(false);
    await completeInstructions();
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "bottom"]}
    >
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Instructions
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {STEPS.map((step, i) => (
          <View key={i} style={styles.row}>
            <View
              style={[
                styles.numberCircle,
                { backgroundColor: colors.brandGreen },
              ]}
            >
              <Text style={[styles.numberText, { color: "#FFFFFF" }]}>
                {i + 1}
              </Text>
            </View>
            <View style={styles.stepBody}>
              <Text style={[styles.stepText, { color: colors.text }]}>
                {step.text}
              </Text>
              {step.linkUrl && step.linkLabel ? (
                <Pressable
                  onPress={() => void Linking.openURL(step.linkUrl!)}
                  hitSlop={8}
                >
                  <Text
                    style={[styles.linkText, { color: colors.primaryOrange }]}
                  >
                    {step.linkLabel}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.bottomBar}>
        <GradientButton
          label="Next"
          variant="orange"
          onPress={() => setConfirmOpen(true)}
        />
      </View>

      <Modal visible={confirmOpen} transparent animationType="fade">
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="help-circle" size={44} color={colors.primaryOrange} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Have you read all the instructions?
            </Text>
            <Text style={[styles.modalSub, { color: colors.textMuted }]}>
              Please confirm to continue
            </Text>
            <View style={styles.modalActions}>
              <GradientButton
                label="Yes, I have read"
                variant="orange"
                onPress={() => void handleYes()}
              />
              <View style={{ height: spacing.sm }} />
              <GradientButton
                label="No, I want to read again"
                variant="orangeOutline"
                onPress={() => setConfirmOpen(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function useInstructionsStyles() {
  return useResponsiveStyles(({ scale, modalWidth }) => {
    const circleSize = scale(32);
    return {
      safe: { flex: 1 },
      header: {
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      },
      headerTitle: {
        textAlign: "center",
        ...textStyles.h2,
        fontSize: typeScale.screenTitle,
      },
      scroll: {
        paddingHorizontal: spacing.pagePad,
        paddingTop: spacing.sm,
        paddingBottom: spacing.md,
      },
      row: {
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: spacing.cardGap,
        gap: spacing.iconTextGap,
      },
      numberCircle: {
        width: circleSize,
        height: circleSize,
        borderRadius: circleSize / 2,
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 0,
      },
      numberText: {
        ...textStyles.badge,
        textAlign: "center",
        includeFontPadding: false,
        lineHeight: circleSize,
      },
      stepBody: {
        flex: 1,
        gap: scale(4),
      },
      stepText: {
        fontFamily: fonts.interRegular,
        fontSize: typeScale.body,
        lineHeight: typeScale.body * 1.45,
      },
      linkText: {
        fontFamily: fonts.interSemiBold,
        fontSize: typeScale.body,
        textDecorationLine: "underline",
      },
      bottomBar: {
        paddingHorizontal: spacing.pagePad,
        paddingBottom: spacing.md,
        paddingTop: spacing.xs,
      },
      modalBackdrop: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: spacing.lg,
      },
      modalCard: {
        width: "100%",
        maxWidth: modalWidth,
        borderRadius: spacing.md,
        padding: spacing.lg,
        alignItems: "center",
      },
      modalTitle: {
        fontFamily: fonts.bold,
        fontSize: typeScale.xl,
        textAlign: "center",
        marginTop: spacing.md,
      },
      modalSub: {
        fontFamily: fonts.medium,
        fontSize: typeScale.md,
        textAlign: "center",
        marginTop: spacing.sm,
        marginBottom: spacing.lg,
      },
      modalActions: {
        width: "100%",
      },
    };
  });
}

