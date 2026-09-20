import { memo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TeacherStudent } from "../types";
import { radius, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import type { AppColors } from "../theme/palettes";
import { icons } from "../theme/responsive";

type Props = {
  item: TeacherStudent;
  width: number;
  captured: boolean;
  colors: AppColors;
  onPress: (student: TeacherStudent) => void;
};

/** ID photo grid cell — 2:3 portrait ratio, green name bar. */
export const StudentGridCell = memo(function StudentGridCell({
  item,
  width,
  captured,
  colors,
  onPress,
}: Props) {
  return (
    <Pressable
      style={[styles.gridItem, { width }]}
      onPress={() => onPress(item)}
    >
      <View
        style={[
          styles.photoCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: captured ? colors.graySoft : colors.primaryOrange,
              borderColor: captured ? colors.borderLight : colors.primaryOrange,
            },
            !captured && styles.avatarPending,
          ]}
        >
          {captured && item.photo_url ? (
            <Image
              source={{ uri: item.photo_url }}
              style={styles.avatarImg}
              resizeMode="cover"
              fadeDuration={0}
            />
          ) : (
            <Ionicons
              name="person"
              size={icons.hero}
              color={captured ? colors.textSubtle : "#FFFFFF"}
            />
          )}
        </View>
        <View style={[styles.nameBar, { backgroundColor: colors.brandGreen }]}>
          <Text
            style={styles.studentName}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {item.student_name}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  gridItem: { alignItems: "stretch" },
  photoCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
  },
  avatar: {
    width: "100%",
    aspectRatio: 2 / 3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
  },
  avatarPending: { borderStyle: "dashed" },
  avatarImg: { width: "100%", height: "100%" },
  nameBar: {
    paddingVertical: spacing.xxs + 2,
    paddingHorizontal: spacing.xxs,
    minHeight: spacing.lg,
    justifyContent: "center",
  },
  studentName: {
    fontFamily: fonts.semiBold,
    fontSize: typeScale.xs,
    textAlign: "center",
    color: "#FFFFFF",
  },
});
