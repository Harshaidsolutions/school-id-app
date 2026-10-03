import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Pressable } from "../components/Pressable";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import api, { getErrorMessage } from "../api/client";
import { ErrorRetry, LoadingBlock } from "../components/ErrorRetry";
import { IdCardsProgressSection } from "../components/IdCardsProgressSection";
import { IdCardsGreenHeader } from "../components/IdCardsGreenHeader";
import type { RootStackParamList } from "../navigation/types";
import { setLastClassSection } from "../navigation/captureContext";
import type { TeacherHomeResponse } from "../types";
import { radius, cardShadow, spacing } from "../theme/colors";
import { fonts, textStyles, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { sortClassSections } from "../utils/classSort";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";
import { greetingForNow } from "../utils/greeting";
import { InstituteMembersPanel } from "../components/InstituteMembersPanel";
import { OrganizationCardsPanel } from "../components/OrganizationCardsPanel";
import { isInstituteUser } from "../utils/orgContext";
import { useAuth } from "../auth/AuthContext";
import {
  getCachedTeacherHome,
  setCachedTeacherHome,
} from "../utils/teacherDataCache";

/**
 * ID Cards tab — matches HTML prototype `screens.cards`
 * School header + overall progress + class list.
 */
const ID_CARDS_SORT_KEY = "teacher_id_cards_sort_dir";

function SchoolIdCardsScreen() {
  const styles = useIdCardsStyles();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [data, setData] = useState<TeacherHomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const scrollRef = useRef<ScrollView>(null);
  const [greeting, setGreeting] = useState(() => greetingForNow());

  useEffect(() => {
    const refreshGreeting = () => setGreeting(greetingForNow());
    refreshGreeting();
    const timer = setInterval(refreshGreeting, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    void AsyncStorage.getItem(ID_CARDS_SORT_KEY).then((saved) => {
      if (saved === "asc" || saved === "desc") setSortDir(saved);
    });
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      const cached = getCachedTeacherHome();
      if (cached) {
        setData(cached);
        setLoading(false);
        setError(null);
      }
    }
    if (isRefresh) setRefreshing(true);
    else if (!getCachedTeacherHome()) setLoading(true);
    setError(null);
    try {
      const homeRes = await api.get<TeacherHomeResponse>("/teacher/home");
      setData(homeRes.data);
      setCachedTeacherHome(homeRes.data);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load ID cards."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const classes = useMemo(
    () =>
      sortClassSections(
        data?.classes ?? [],
        (c) => c.class_section,
        sortDir
      ),
    [data?.classes, sortDir]
  );

  const applySortDir = useCallback((next: "asc" | "desc") => {
    setSortDir(next);
    void AsyncStorage.setItem(ID_CARDS_SORT_KEY, next);
    setMenuOpen(false);
  }, []);

  if (loading && !data) return <LoadingBlock label="Loading ID cards…" />;
  if (error && !data) {
    return <ErrorRetry message={error} onRetry={() => void load()} />;
  }

  const instituteMode =
    isInstituteUser(user) || data?.orgType === "institute";
  const schoolName = data?.schoolName ?? (instituteMode ? "Your Institute" : "Your School");
  const overall = data?.overall;
  const total = overall?.totalStudents ?? 0;
  const captured = overall?.captured ?? 0;

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <IdCardsGreenHeader>
        <View style={styles.idHeaderRow}>
          <Pressable onPress={() => navigation.navigate("Home" as never)} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </Pressable>
          <View style={styles.idHeaderCenter}>
            <View style={styles.idNameRow}>
              <Ionicons name="school" size={22} color="#FFFFFF" />
              <Text style={styles.idSchoolName} numberOfLines={1}>
                {schoolName}
              </Text>
            </View>
            <Text style={styles.idGreeting} numberOfLines={1}>
              {greeting} Sir/Madam
            </Text>
          </View>
          {instituteMode ? (
            <View style={styles.headerSideSpacer} />
          ) : (
            <Pressable onPress={() => setMenuOpen(true)} hitSlop={12}>
              <Ionicons name="ellipsis-vertical" size={20} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
      </IdCardsGreenHeader>

      <IdCardsProgressSection
        captured={captured}
        total={total}
        hideCaption={instituteMode}
      />

      {instituteMode ? (
        <InstituteMembersPanel colors={colors} navigation={navigation} />
      ) : (
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: spacing.xxl + insets.bottom },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.brandGreen}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, { color: colors.brandGreen }]}>
            Select Classes
          </Text>
        </View>

        {classes.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No classes yet
            </Text>
            <Text style={[styles.emptyText, { color: colors.textBody }]}>
              Ask an admin to upload students for this school.
            </Text>
          </View>
        ) : (
          classes.map((item) => {
            const ratio =
              item.totalStudents === 0
                ? 0
                : Math.min(1, item.captured / item.totalStudents);
            const percent = Math.round(ratio * 100);

            return (
              <Pressable
                key={item.class_section}
                style={[
                  styles.classCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.greenSoft,
                  },
                ]}
                onPress={() => {
                  setLastClassSection(item.class_section);
                  navigation.navigate("StudentList", {
                    classSection: item.class_section,
                  });
                }}
              >
                <View style={styles.classCardTop}>
                  <Text
                    style={[styles.classLabel, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {item.class_section}
                  </Text>
                  <Text
                    style={[styles.classCount, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {item.totalStudents} Students
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.brandGreen}
                  />
                </View>
                <View
                  style={[
                    styles.classBarTrack,
                    { backgroundColor: colors.track },
                  ]}
                >
                  <View
                    style={[
                      styles.classBarFill,
                      {
                        width: `${percent}%`,
                        backgroundColor: colors.brandGreen,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.classPhotos, { color: colors.textMuted }]}>
                  {item.captured} / {item.totalStudents} Photos
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
      )}

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={[
            styles.menuBackdrop,
            {
              paddingTop: insets.top + spacing.headerHeight,
              paddingRight: spacing.md,
            },
          ]}
          onPress={() => setMenuOpen(false)}
        >
          <View
            style={[styles.menuCard, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <Pressable
              style={[
                styles.menuItem,
                sortDir === "asc" && {
                  backgroundColor: colors.greenSoft,
                },
              ]}
              onPress={() => applySortDir("asc")}
            >
              <Ionicons
                name={sortDir === "asc" ? "checkmark-circle" : "arrow-up"}
                size={18}
                color={sortDir === "asc" ? colors.brandGreen : colors.text}
              />
              <Text
                style={[
                  styles.menuItemText,
                  {
                    color: sortDir === "asc" ? colors.brandGreen : colors.text,
                    fontFamily: sortDir === "asc" ? fonts.semiBold : fonts.regular,
                  },
                ]}
              >
                Low to High
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.menuItem,
                sortDir === "desc" && {
                  backgroundColor: colors.greenSoft,
                },
              ]}
              onPress={() => applySortDir("desc")}
            >
              <Ionicons
                name={sortDir === "desc" ? "checkmark-circle" : "arrow-down"}
                size={18}
                color={sortDir === "desc" ? colors.brandGreen : colors.text}
              />
              <Text
                style={[
                  styles.menuItemText,
                  {
                    color: sortDir === "desc" ? colors.brandGreen : colors.text,
                    fontFamily: sortDir === "desc" ? fonts.semiBold : fonts.regular,
                  },
                ]}
              >
                High to Low
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export function IdCardsScreen() {
  const { user } = useAuth();
  if (user?.role === "organization_staff") return <OrganizationCardsPanel />;
  return <SchoolIdCardsScreen />;
}

function useIdCardsStyles() {
  return useResponsiveStyles(({ scale }) => {
    const barHeight = scale(8);
    const barRadius = scale(4);
    return {
      safe: { flex: 1 },
      idHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
      },
      idHeaderCenter: { flex: 1 },
      idNameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
      },
      idSchoolName: {
        flex: 1,
        fontFamily: fonts.bold,
        fontSize: typeScale.lg,
        color: "#FFFFFF",
      },
      idGreeting: {
        fontFamily: fonts.regular,
        fontSize: typeScale.subtitle,
        color: "rgba(255,255,255,0.92)",
        marginTop: 2,
      },
      headerSideSpacer: {
        width: 22,
        height: 22,
      },
      content: { paddingHorizontal: spacing.pagePad },
      progress: {
        paddingHorizontal: spacing.pagePad,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
      },
      progressTrack: {
        height: barHeight,
        borderRadius: barRadius,
        overflow: "hidden",
      },
      progressFill: {
        height: "100%",
        borderRadius: barRadius,
      },
      progressCaption: {
        marginTop: spacing.xs,
        fontFamily: fonts.interMedium,
        fontSize: typeScale.subtitle,
      },
      sectionRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.md,
      },
      sectionTitle: {
        ...textStyles.h2,
        textTransform: "none",
      },
      emptyCard: {
        borderRadius: radius.lg,
        padding: spacing.lg,
        borderWidth: 1,
        ...cardShadow,
      },
      emptyTitle: {
        ...textStyles.h3,
        marginBottom: spacing.xxs,
      },
      emptyText: {
        ...textStyles.body,
      },
      classCard: {
        borderRadius: radius.xl,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        marginBottom: spacing.sm,
        borderWidth: 1,
        minHeight: scale(96),
        justifyContent: "center",
      },
      classCardTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.xs,
        gap: spacing.xs,
      },
      classLabel: {
        ...textStyles.h3,
        flex: 1,
        fontSize: typeScale.md,
      },
      classCount: {
        fontFamily: fonts.medium,
        fontSize: typeScale.subtitle,
      },
      classBarTrack: {
        height: barHeight,
        borderRadius: barRadius,
        overflow: "hidden",
      },
      classBarFill: {
        height: "100%",
        borderRadius: barRadius,
      },
      classPhotos: {
        marginTop: spacing.xs,
        fontFamily: fonts.interMedium,
        fontSize: typeScale.subtitle,
      },
      menuBackdrop: {
        flex: 1,
        backgroundColor: "rgba(26,34,51,0.35)",
        alignItems: "flex-end",
      },
      menuCard: {
        minWidth: "55%",
        borderRadius: radius.md,
        paddingVertical: spacing.xxs + 2,
        elevation: 6,
        shadowColor: "#1A2233",
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      menuItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
      },
      menuItemText: {
        fontFamily: fonts.medium,
        fontSize: typeScale.body,
      },
    };
  });
}
