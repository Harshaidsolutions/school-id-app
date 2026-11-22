import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Pressable } from "./Pressable";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import api, { getErrorMessage } from "../api/client";
import { AddStudentForm } from "./AddStudentForm";
import { studentFieldValueForForm } from "../utils/studentFields";
import { KeyboardAwareFormScrollView } from "./KeyboardAwareFormScrollView";
import { ErrorRetry, LoadingBlock } from "./ErrorRetry";
import { PendingPhotoSheet } from "./PendingPhotoSheet";
import { StudentFlowModal } from "./StudentFlowModal";
import { StudentGridCell } from "./StudentGridCell";
import { useToast } from "./Toast";
import type { RootStackParamList } from "../navigation/types";
import type { TeacherStudent } from "../types";
import { radius, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import type { AppColors } from "../theme/palettes";
import { gridItemWidth, responsiveColumns } from "../theme/responsive";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";
import {
  getCachedStudents,
  invalidateStudentsCache,
  setCachedStudents,
} from "../utils/teacherDataCache";
import {
  pickStudentPhotoFromCamera,
  pickStudentPhoto,
  type PhotoSource,
} from "../utils/studentPhotoPicker";
import { uploadStudentPhoto } from "../utils/uploadStudentPhoto";
import { scrollToFocusedInput } from "../utils/scrollToFocusedInput";
import { useFormConfig } from "../hooks/useFormConfig";
import {
  studentHasPhoto,
  studentPendingData,
} from "../utils/recordStatus";

const INSTITUTE_CACHE_KEY = "__institute__";
const PHONE_COLS = 2;

type TabKey = "all" | "pending-photos" | "pending-data" | "captured";

type Props = {
  colors: AppColors;
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

export function InstituteMembersPanel({
  colors,
  navigation,
}: Props) {
  const styles = useInstituteMembersStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { showToast } = useToast();
  const gridGap = spacing.cardGap;
  const gridPad = spacing.sm;
  const NUM_COLS = responsiveColumns(width, PHONE_COLS);
  const itemSize = gridItemWidth(NUM_COLS, gridPad, gridGap, width);

  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [tab, setTab] = useState<TabKey>("all");
  const { showCapturedSection, fields: formFields } = useFormConfig();
  useEffect(() => {
    if (!showCapturedSection && tab === "captured") setTab("all");
  }, [showCapturedSection, tab]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const addScrollRef = useRef<ScrollView>(null);
  const [flowVisible, setFlowVisible] = useState(false);
  const [flowIndex, setFlowIndex] = useState(0);
  const [pendingPhotoStudent, setPendingPhotoStudent] =
    useState<TeacherStudent | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const skipFocusReloadRef = useRef(false);

  const loadMembers = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      const cached = getCachedStudents(INSTITUTE_CACHE_KEY);
      if (cached) {
        setStudents(cached);
        setLoading(false);
        setError(null);
      }
    }
    if (isRefresh) setRefreshing(true);
    else if (!getCachedStudents(INSTITUTE_CACHE_KEY)) setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ students: TeacherStudent[] }>(
        "/teacher/students"
      );
      setStudents(data.students);
      setCachedStudents(INSTITUTE_CACHE_KEY, data.students);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load members."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (skipFocusReloadRef.current) {
        skipFocusReloadRef.current = false;
        return;
      }
      if (photoBusy) return;
      void loadMembers();
    }, [loadMembers, photoBusy])
  );

  // Group members by the admin-configured "Group by this" field (e.g. Designation).
  const groupField = useMemo(
    () =>
      formFields.find(
        (ff) =>
          ff.enabled !== false &&
          ff.label.toLowerCase().replace(/[^a-z0-9]/g, "").includes("designation")
      ) ?? null,
    [formFields]
  );
  const groupLabel = "Designation";
  const memberGroupValue = useCallback(
    (s: TeacherStudent) =>
      groupField ? studentFieldValueForForm(s, groupField, s.class_section ?? undefined).trim() : "",
    [groupField]
  );
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const groups = useMemo(() => {
    if (!groupField) return [] as { value: string; total: number; captured: number }[];
    const map = new Map<string, { value: string; total: number; captured: number }>();
    for (const s of students) {
      const v = memberGroupValue(s) || "Unassigned";
      const e = map.get(v) ?? { value: v, total: 0, captured: 0 };
      e.total += 1;
      if (studentHasPhoto(s)) e.captured += 1;
      map.set(v, e);
    }
    return [...map.values()].sort((a, b) => a.value.localeCompare(b.value));
  }, [students, groupField, memberGroupValue]);
  const scopedStudents = useMemo(
    () =>
      groupField && selectedGroup !== null
        ? students.filter((s) => (memberGroupValue(s) || "Unassigned") === selectedGroup)
        : students,
    [students, groupField, selectedGroup, memberGroupValue]
  );
  const showGroupList = Boolean(groupField) && selectedGroup === null;

  const pendingPhotoCount = useMemo(
    () => scopedStudents.filter((s) => !studentHasPhoto(s)).length,
    [students]
  );
  const pendingDataCount = useMemo(
    () => scopedStudents.filter((s) => studentPendingData(s, true)).length,
    [students]
  );
  const capturedCount = useMemo(
    () => scopedStudents.filter((s) => studentHasPhoto(s)).length,
    [students]
  );
  const tabs: { key: TabKey; label: string; color: string; count: number }[] = [
    { key: "all", label: "All", color: colors.brandGreen, count: scopedStudents.length },
    {
      key: "pending-photos",
      label: "Pending",
      color: colors.brandGreen,
      count: pendingPhotoCount,
    },
    ...(showCapturedSection
      ? [
          {
            key: "captured" as const,
            label: "Captured",
            color: colors.brandGreen,
            count: capturedCount,
          },
        ]
      : []),
  ];

  const filtered = useMemo(() => {
    if (tab === "pending-photos") {
      return scopedStudents.filter((s) => !studentHasPhoto(s));
    }
    if (tab === "pending-data") {
      return scopedStudents.filter((s) => studentPendingData(s, true));
    }
    if (tab === "captured" && showCapturedSection) {
      return scopedStudents
        .filter((s) => studentHasPhoto(s))
        .sort((a, b) => {
          const aTs = Date.parse(a.photo_captured_at ?? "") || 0;
          const bTs = Date.parse(b.photo_captured_at ?? "") || 0;
          if (aTs !== bTs) return bTs - aTs;
          return (a.student_name ?? "").localeCompare(b.student_name ?? "");
        });
    }
    return scopedStudents;
  }, [scopedStudents, tab, showCapturedSection]);

  const openMember = useCallback(
    (student: TeacherStudent) => {
      const idx = filtered.findIndex((s) => s.id === student.id);
      if (tab === "pending-photos" && !studentHasPhoto(student)) {
        setPendingPhotoStudent(student);
        return;
      }
      setFlowIndex(idx >= 0 ? idx : 0);
      setFlowVisible(true);
    },
    [filtered, tab]
  );

  async function handlePendingPhoto(source: PhotoSource) {
    if (!pendingPhotoStudent || photoBusy) return;
    const student = pendingPhotoStudent;
    setPhotoBusy(true);
    skipFocusReloadRef.current = true;
    try {
      if (source === "camera") {
        const photoUri = await pickStudentPhotoFromCamera();
        if (!photoUri) return;
        const updated = await uploadStudentPhoto(student.id, photoUri);
        setStudents((prev) => {
          const next = prev.map((s) => (s.id === updated.id ? updated : s));
          setCachedStudents(INSTITUTE_CACHE_KEY, next);
          return next;
        });
        showToast("Submitted successfully.");
        return;
      }
      const photoUri = await pickStudentPhoto(source);
      if (!photoUri) return;
      const updated = await uploadStudentPhoto(student.id, photoUri);
      setStudents((prev) => {
        const next = prev.map((s) => (s.id === updated.id ? updated : s));
        setCachedStudents(INSTITUTE_CACHE_KEY, next);
        return next;
      });
      showToast("Submitted successfully.");
    } catch (err) {
      showToast(getErrorMessage(err, "Failed to capture photo."));
    } finally {
      setPhotoBusy(false);
      setPendingPhotoStudent(null);
    }
  }

  const renderMember = useCallback(
    ({ item }: { item: TeacherStudent }) => (
      <StudentGridCell
        item={item}
        width={itemSize}
        captured={studentHasPhoto(item)}
        colors={colors}
        onPress={openMember}
      />
    ),
    [colors, itemSize, openMember]
  );

  if (loading && students.length === 0) {
    return <LoadingBlock label="Loading members…" />;
  }
  if (error && students.length === 0) {
    return <ErrorRetry message={error} onRetry={() => void loadMembers()} />;
  }

  const photoCaption = `${capturedCount}/${scopedStudents.length} photos captured`;

  return (
    <View style={styles.container}>
      <View style={styles.statusToolbar}>
        <View style={styles.topRow}>
          <Text
            style={[styles.photoCount, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {photoCaption}
          </Text>
          {tab !== "captured" ? (
            <Pressable
              style={[
                styles.addMemberBtn,
                { backgroundColor: colors.primaryOrange, flexDirection: "row", gap: 6 },
              ]}
              onPress={() => setAddModalVisible(true)}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.addMemberBtnText} numberOfLines={1}>
                Add Member
              </Text>
            </Pressable>
          ) : null}
        </View>

        {selectedGroup !== null ? (
          <Pressable onPress={() => setSelectedGroup(null)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
            <Ionicons name="chevron-back" size={18} color={colors.brandGreen} />
            <Text style={{ color: colors.brandGreen, fontFamily: fonts.semiBold, fontSize: 14 }} numberOfLines={1}>All {groupLabel} · {selectedGroup}</Text>
          </Pressable>
        ) : null}
        {!showGroupList ? (
        <>
        <View style={styles.tabs}>
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                style={[
                  styles.tab,
                  {
                    backgroundColor: active ? t.color : colors.graySoft,
                  },
                ]}
                onPress={() => setTab(t.key)}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      color: active ? "#FFFFFF" : colors.textMuted,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {t.label} ({t.count})
                </Text>
              </Pressable>
            );
          })}
        </View>
        {tab === "pending-photos" || tab === "pending-data" ? (
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
            <Pressable
              onPress={() => setTab("pending-photos")}
              style={{
                flex: 1,
                minHeight: 46,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: tab === "pending-photos" ? colors.brandGreen : colors.border,
                backgroundColor: tab === "pending-photos" ? colors.brandGreen : colors.surface,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 8,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: tab === "pending-photos" ? "#FFFFFF" : colors.text, fontFamily: fonts.semiBold, fontSize: 15, textAlign: "center" }}>
                Pending Photos ({pendingPhotoCount})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTab("pending-data")}
              style={{
                flex: 1,
                minHeight: 46,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: tab === "pending-data" ? colors.brandGreen : colors.border,
                backgroundColor: tab === "pending-data" ? colors.brandGreen : colors.surface,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 8,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: tab === "pending-data" ? "#FFFFFF" : colors.text, fontFamily: fonts.semiBold, fontSize: 15, textAlign: "center" }}>
                Pending Data ({pendingDataCount})
              </Text>
            </Pressable>
          </View>
        ) : null}
        </>
        ) : null}
      </View>

      {showGroupList ? (
        <>
        <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.brandGreen, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 4 }}>
          Select {groupLabel}
        </Text>
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xxl + insets.bottom, gap: 10 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadMembers(true)} tintColor={colors.brandGreen} />}>
          {groups.length === 0 ? (
            <View style={{ padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
              <Text style={{ fontFamily: fonts.semiBold, fontSize: 14, color: colors.text }}>No {groupLabel.toLowerCase()} yet</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, color: colors.textBody, marginTop: 4 }}>Members will appear here grouped by {groupLabel.toLowerCase()} once the admin adds them or uploads an Excel.</Text>
            </View>
          ) : (
            groups.map((g) => {
              const ratio = g.total === 0 ? 0 : Math.min(1, g.captured / g.total);
              return (
                <Pressable key={g.value} style={{ backgroundColor: colors.surface, borderColor: colors.greenSoft, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 }} onPress={() => { setSelectedGroup(g.value); setTab("all"); }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.text }} numberOfLines={1}>{g.value}</Text>
                    <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted }}>{g.total} members</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.graySoft, overflow: "hidden" }}>
                    <View style={{ height: "100%", width: `${Math.round(ratio * 100)}%`, backgroundColor: colors.brandGreen }} />
                  </View>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted }}>{g.captured} / {g.total} photos</Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
        </>
      ) : (
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        key={`cols-${NUM_COLS}`}
        numColumns={NUM_COLS}
        columnWrapperStyle={styles.gridRow}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadMembers(true)}
            tintColor={colors.brandGreen}
          />
        }
        contentContainerStyle={[
          styles.gridContent,
          {
            paddingHorizontal: gridPad,
            paddingBottom: spacing.xxl + insets.bottom,
          },
        ]}
        removeClippedSubviews
        windowSize={7}
        maxToRenderPerBatch={8}
        initialNumToRender={10}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {students.length === 0
              ? "No members yet. Tap Add Member to get started."
              : tab === "pending-photos"
                ? "No members are waiting for a photo."
                : tab === "pending-data"
                  ? "No members are missing required data."
                : "No captured photos yet."}
          </Text>
        }
        renderItem={renderMember}
      />
      )}

      <StudentFlowModal
        visible={flowVisible}
        students={filtered}
        initialIndex={flowIndex}
        classSection=""
        photoCaptureEnabled={tab === "pending-photos"}
        onClose={() => setFlowVisible(false)}
        navigation={navigation}
      />

      <Modal
        visible={addModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View
          style={[
            styles.addModalRoot,
            {
              backgroundColor: colors.background,
              paddingTop: insets.top + spacing.sm,
              paddingBottom: insets.bottom + spacing.md,
            },
          ]}
        >
          <View style={styles.addModalHeader}>
            <Pressable onPress={() => setAddModalVisible(false)} hitSlop={12}>
              <Ionicons name="close" size={28} color={colors.text} />
            </Pressable>
            <Text style={[styles.addModalTitle, { color: colors.text }]}>
              Add Member
            </Text>
            <View style={styles.headerSide} />
          </View>
            <KeyboardAwareFormScrollView
              scrollRef={addScrollRef}
              contentContainerStyle={styles.addModalScroll}
              showsVerticalScrollIndicator={false}
              persistentScrollbar={false}
            >
              {addModalVisible ? (
                <AddStudentForm
                  instituteMode
                  showHeading={false}
                  showPhotoCapture
                  onCancel={() => setAddModalVisible(false)}
                  onInputFocus={(target) =>
                    scrollToFocusedInput(addScrollRef, target)
                  }
                  onSuccess={() => {
                    setAddModalVisible(false);
                    showToast("Member added successfully.");
                    invalidateStudentsCache(INSTITUTE_CACHE_KEY);
                    void loadMembers(true);
                  }}
                />
              ) : null}
            </KeyboardAwareFormScrollView>
        </View>
      </Modal>

      <PendingPhotoSheet
        visible={Boolean(pendingPhotoStudent)}
        studentName={pendingPhotoStudent?.student_name ?? ""}
        subtitle="Add a member photo"
        busy={photoBusy}
        colors={colors}
        onClose={() => {
          if (photoBusy) return;
          setPendingPhotoStudent(null);
        }}
        onPick={(source) => void handlePendingPhoto(source)}
      />
    </View>
  );
}

function useInstituteMembersStyles() {
  return useResponsiveStyles(({ scale, scaleFont }) => ({
    container: { flex: 1 },
    statusToolbar: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xxs,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    photoCount: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
      fontFamily: fonts.medium,
      fontSize: scaleFont(typeScale.subtitle, typeScale.sm),
      textAlign: "left",
    },
    addMemberBtn: {
      flexShrink: 0,
      borderRadius: radius.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      alignItems: "center",
      justifyContent: "center",
    },
    addMemberBtnText: {
      color: "#FFFFFF",
      fontFamily: fonts.semiBold,
      fontSize: scaleFont(typeScale.sm, typeScale.xs),
      textAlign: "center",
    },
    tabs: {
      flexDirection: "row",
      gap: spacing.xs,
      marginBottom: spacing.xs,
    },
    tab: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.xxs,
      borderRadius: radius.full,
    },
    tabText: {
      fontFamily: fonts.semiBold,
      fontSize: scaleFont(typeScale.xs, typeScale.xs * 0.72),
      textAlign: "center",
      width: "100%",
    },
    gridContent: { paddingTop: scale(4) },
    gridRow: { gap: spacing.cardGap, marginBottom: spacing.cardGap },
    empty: {
      textAlign: "center",
      fontFamily: fonts.regular,
      fontSize: typeScale.md,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xxl,
    },
    addModalRoot: {
      flex: 1,
      paddingHorizontal: spacing.lg,
    },
    addModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    addModalTitle: {
      fontFamily: fonts.bold,
      fontSize: typeScale.lg,
    },
    headerSide: { width: spacing.iconSm },
    addModalScroll: {
      paddingBottom: spacing.xxl,
    },
  }));
}
