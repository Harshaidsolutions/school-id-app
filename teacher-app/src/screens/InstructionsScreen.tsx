import { Pressable } from "../components/Pressable";
import {

  Linking,

  Modal,

  ScrollView,

  StyleSheet,

  Text,

  View,

} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { SafeAreaView } from "react-native-safe-area-context";

import { useFonts, NotoSansTelugu_400Regular } from "@expo-google-fonts/noto-sans-telugu";

import { GradientButton } from "../components/GradientButton";

import { useAuth } from "../auth/AuthContext";

import type { RootStackParamList } from "../navigation/types";

import { spacing } from "../theme/colors";

import { fonts, textStyles, type as typeScale } from "../theme/typography";

import { useTheme } from "../theme/ThemeContext";

import { useState } from "react";

import { useResponsiveStyles } from "../hooks/useResponsiveStyles";

import {

  DEFAULT_INSTRUCTION_LANG,

  INSTRUCTION_LANG_LABELS,

  INSTRUCTIONS_BY_LANG,

  type InstructionLang,

} from "../constants/instructionsContent";

import { SAMPLE_PHOTO_URL } from "./InstructionsScreen.constants";

export const PHOTO_EXAMPLES: {
  ok: boolean;
  source: number;
  title: string;
  caption: string;
}[] = [
  {
    ok: true,
    source: require("../../assets/instructions/instruction-photo-correct.jpg"),
    title: "✓ Correct face position",
    caption: "Keep the face centered and clearly visible.",
  },
  {
    ok: false,
    source: require("../../assets/instructions/instruction-photo-dark.jpg"),
    title: "✕ Incorrect lighting",
    caption: "Do not take a photo when the face is too dark.",
  },
  {
    ok: false,
    source: require("../../assets/instructions/instruction-photo-backlight.jpg"),
    title: "✕ Incorrect lighting",
    caption: "Avoid strong backlight.",
  },
  {
    ok: false,
    source: require("../../assets/instructions/instruction-photo-bad-framing.jpg"),
    title: "✕ Too far",
    caption: "Do not capture the person from too far away.",
  },
];



type Props = NativeStackScreenProps<RootStackParamList, "Instructions">;



export { INSTRUCTIONS_READ_KEY } from "./InstructionsScreen.constants";



export function InstructionsScreen(_props: Props) {

  const styles = useInstructionsStyles();

  const { colors } = useTheme();

  const { completeInstructions } = useAuth();

  const [confirmOpen, setConfirmOpen] = useState(false);

  const [lang, setLang] = useState<InstructionLang>(DEFAULT_INSTRUCTION_LANG);

  const [teluguFontLoaded] = useFonts({ NotoSansTelugu_400Regular });



  const steps = INSTRUCTIONS_BY_LANG[lang].map((step) => {

    if (lang === "en" && step.text.includes("sample student photo")) {

      return {

        ...step,

        linkLabel: SAMPLE_PHOTO_URL ? "View sample photo" : undefined,

        linkUrl: SAMPLE_PHOTO_URL || undefined,

      };

    }

    return step;

  });



  const stepFontFamily =

    lang === "te" && teluguFontLoaded

      ? "NotoSansTelugu_400Regular"

      : fonts.interRegular;



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



      <View style={styles.langRow}>

        {(["te", "en", "hi"] as InstructionLang[]).map((code) => {

          const active = lang === code;

          return (

            <Pressable

              key={code}

              onPress={() => setLang(code)}

              style={[

                styles.langChip,

                {

                  borderColor: active ? colors.brandGreen : colors.borderLight,

                  backgroundColor: active ? colors.brandGreen : colors.surface,

                },

              ]}

            >

              <Text

                style={[

                  styles.langChipText,

                  {

                    color: active ? "#FFFFFF" : colors.text,

                    fontFamily:

                      code === "te" && teluguFontLoaded

                        ? "NotoSansTelugu_400Regular"

                        : fonts.semiBold,

                  },

                ]}

              >

                {INSTRUCTION_LANG_LABELS[code].short}

              </Text>

            </Pressable>

          );

        })}

      </View>



      <ScrollView

        contentContainerStyle={styles.scroll}

        showsVerticalScrollIndicator={false}

      >

        {steps.map((step, i) => (

          <View key={`${lang}-${i}`} style={styles.row}>

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

              <Text

                style={[

                  styles.stepText,

                  { color: colors.text, fontFamily: stepFontFamily },

                ]}

              >

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

      safe: { flex: 1 ,
      backgroundColor: "#FAF8FF"
    },

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

      langRow: {

        flexDirection: "row",

        justifyContent: "center",

        gap: spacing.sm,

        paddingHorizontal: spacing.pagePad,

        paddingBottom: spacing.sm,


      marginVertical: 14
    },

      langChip: {

        paddingHorizontal: spacing.md,

        paddingVertical: spacing.xs,

        borderRadius: 16,

        borderWidth: 1,


      minHeight: 42
    },

      langChipText: {

        fontSize: typeScale.sm,

      },

      scroll: {

        paddingHorizontal: spacing.pagePad,

        paddingTop: spacing.xs,

        paddingBottom: spacing.md,

      },

      row: {

        flexDirection: "row",

        alignItems: "flex-start",

        marginBottom: 12,

        gap: spacing.iconTextGap,


      backgroundColor: "#FFFFFF",
      borderRadius: 22,
      borderWidth: 1,
      borderColor: "#E9ECF2",
      shadowColor: "#005C55",
      shadowOpacity: 0.05,
      shadowRadius: 10
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

        fontSize: typeScale.body,

        lineHeight: typeScale.body * 1.45,


      color: "#3E4947"
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

        borderRadius: 26,

        padding: spacing.lg,

        alignItems: "center",


      backgroundColor: "#FFFFFF"
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


