import { useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PLAY_STORE_MARKET_URL, PLAY_STORE_URL } from "../constants/support";
import { radius, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function RateUsModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (stars < 1 || submitting) return;
    setSubmitting(true);
    try {
      const opened = await Linking.canOpenURL(PLAY_STORE_MARKET_URL);
      await Linking.openURL(opened ? PLAY_STORE_MARKET_URL : PLAY_STORE_URL);
    } catch {
      await Linking.openURL(PLAY_STORE_URL);
    } finally {
      setSubmitting(false);
      setStars(0);
      setComment("");
      onClose();
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: colors.text }]}>Rate Us</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            How would you rate My School ID Card?
          </Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setStars(n)} hitSlop={8}>
                <Ionicons
                  name={n <= stars ? "star" : "star-outline"}
                  size={32}
                  color={colors.primaryOrange}
                />
              </Pressable>
            ))}
          </View>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: colors.border,
                color: colors.text,
                backgroundColor: colors.inputBg,
              },
            ]}
            placeholder="Optional comment"
            placeholderTextColor={colors.textPlaceholder}
            value={comment}
            onChangeText={setComment}
            multiline
          />
          <Pressable
            style={[
              styles.submit,
              { backgroundColor: colors.primaryOrange },
              (stars < 1 || submitting) && { opacity: 0.5 },
            ]}
            onPress={() => void handleSubmit()}
            disabled={stars < 1 || submitting}
          >
            <Text style={styles.submitText}>
              {submitting ? "Opening…" : "Submit"}
            </Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={[styles.cancelText, { color: colors.textMuted }]}>
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(75,60,112,0.45)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: typeScale.lg,
    textAlign: "center",
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  stars: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: spacing.avatarMd,
    padding: spacing.sm,
    textAlignVertical: "top",
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    marginBottom: spacing.md,
  },
  submit: {
    borderRadius: radius.buttonPill,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  submitText: {
    fontFamily: fonts.headingSemiBold,
    fontSize: typeScale.button,
    color: "#FFFFFF",
  },
  cancel: { alignItems: "center", paddingVertical: spacing.sm },
  cancelText: { fontFamily: fonts.bodyMedium, fontSize: typeScale.body },
});
