import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../theme/colors";
import { fonts, textStyles, type as typeScale } from "../theme/typography";
import type { AppColors } from "../theme/palettes";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  colors: AppColors;
  children: React.ReactNode;
  /** Smaller centered card with scroll — used for About Us. */
  compact?: boolean;
  /** Hide modal title when content already includes the heading (About Us). */
  hideTitle?: boolean;
  /** Larger centered heading — used for About Us popup. */
  prominentTitle?: boolean;
};

/** In-page popup — same pattern as About Us in the drawer. */
export function InfoModal({
  visible,
  title,
  onClose,
  colors,
  children,
  compact = false,
  hideTitle = false,
  prominentTitle = false,
}: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  if (!visible) return null;

  const maxCardHeight = compact
    ? Math.min(screenH * 0.88, 680)
    : screenH * 0.85;
  const cardWidth = Math.min(screenW - spacing.lg * 2, 420);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            compact && styles.cardCompact,
            {
              backgroundColor: colors.surface,
              maxHeight: maxCardHeight,
              width: cardWidth,
              maxWidth: cardWidth,
            },
          ]}
        >
          <View style={[styles.titleRow, prominentTitle && styles.titleRowProminent]}>
            {!hideTitle ? (
              <Text
                style={[
                  prominentTitle ? styles.prominentTitle : styles.title,
                  { color: prominentTitle ? colors.primaryOrange : colors.text },
                ]}
              >
                {title}
              </Text>
            ) : null}
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={[styles.closeBtn, { backgroundColor: colors.graySoft }]}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            bounces={false}
          >
            {children}
          </ScrollView>
          <Pressable
            style={[styles.ok, { backgroundColor: colors.primaryOrange }]}
            onPress={onClose}
          >
            <Text style={styles.okText}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function isAboutSectionHeading(text: string): boolean {
  const normalized = text.trim().toUpperCase();
  return (
    normalized === "ABOUT US" ||
    normalized === "OUR STRENGTH" ||
    normalized === "SINGLE LINE ABOUT HARSHA ID SOLUTIONS"
  );
}

function isGetIdentityLine(text: string): boolean {
  const normalized = text.trim().toUpperCase();
  return (
    normalized === "*** GET IDENTITY HERE ***" ||
    normalized === "* GET IDENTITY HERE *" ||
    normalized === "GET IDENTITY HERE"
  );
}

export function InfoParagraph({
  text,
  colors,
}: {
  text: string;
  colors: AppColors;
}) {
  if (isAboutSectionHeading(text)) {
    return (
      <Text style={[styles.sectionHeading, { color: colors.primaryOrange }]}>
        {text}
      </Text>
    );
  }
  if (isGetIdentityLine(text)) {
    return (
      <Text style={[styles.identityLine, { color: colors.primaryOrange }]}>
        * GET IDENTITY HERE *
      </Text>
    );
  }
  return (
    <Text style={[styles.body, { color: colors.textBody }]}>{text}</Text>
  );
}

export function InfoBulletList({
  items,
  colors,
}: {
  items: string[];
  colors: AppColors;
}) {
  return (
    <>
      {items.map((item, i) => (
        <View key={item.slice(0, 24)} style={styles.bulletRow}>
          <Text style={[styles.bulletNum, { color: colors.primaryOrange }]}>
            {i + 1}.
          </Text>
          <Text style={[styles.body, { color: colors.textBody, flex: 1 }]}>
            {item}
          </Text>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,34,51,0.45)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  cardCompact: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    minHeight: 32,
    position: "relative",
  },
  titleRowProminent: {
    minHeight: 40,
    marginBottom: spacing.md,
    paddingTop: spacing.xxs,
  },
  title: {
    ...textStyles.h2,
    flex: 1,
    textAlign: "center",
    fontFamily: fonts.headingSemiBold,
    paddingHorizontal: 40,
  },
  prominentTitle: {
    width: "100%",
    textAlign: "center",
    fontFamily: fonts.bold,
    fontSize: typeScale.xl,
    lineHeight: typeScale.xl * 1.2,
    letterSpacing: 0.6,
    paddingHorizontal: 40,
  },
  closeBtn: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.xxs,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    lineHeight: typeScale.body * 1.55,
    marginBottom: spacing.sm,
  },
  sectionHeading: {
    fontFamily: fonts.bold,
    fontSize: typeScale.body + 1,
    lineHeight: (typeScale.body + 1) * 1.45,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  identityLine: {
    fontFamily: fonts.bold,
    fontSize: typeScale.body + 1,
    lineHeight: (typeScale.body + 1) * 1.45,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  bulletRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  bulletNum: {
    fontFamily: fonts.bold,
    fontSize: typeScale.sm,
    minWidth: 20,
  },
  ok: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  okText: {
    color: "#FFFFFF",
    fontFamily: fonts.bold,
    fontSize: typeScale.sm,
  },
});
