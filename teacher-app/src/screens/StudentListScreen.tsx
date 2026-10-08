import { Pressable } from "../components/Pressable";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import api, { getErrorMessage } from "../api/client";
import { PendingPhotoSheet } from "../components/PendingPhotoSheet";
import { useToast } from "../components/Toast";
import {
  pickStudentPhoto,
  pickStudentPhotoFromCamera,
  type PhotoSource,
} from "../utils/studentPhotoPicker";
import { uploadStudentPhoto } from "../utils/uploadStudentPhoto";
import { scrollToFocusedInput } from "../utils/scrollToFocusedInput";
import { AddStudentForm } from "../components/AddStudentForm";
import { KeyboardAwareFormScrollView } from "../components/KeyboardAwareFormScrollView";
import {
  getCachedStudents,
  invalidateStudentsCache,
  setCachedStudents,
} from "../utils/teacherDataCache";
import { ErrorRetry, LoadingBlock } from "../components/ErrorRetry";
import { IdCardsProgressSection } from "../components/IdCardsProgressSection";
import { IdCardsGreenHeader } from "../components/IdCardsGreenHeader";
import { StudentFlowModal } from "../components/StudentFlowModal";
import { StudentGridCell } from "../components/StudentGridCell";
import type { RootStackParamList } from "../navigation/types";
import { setLastClassSection } from "../navigation/captureContext";
import type { StudentsResponse, TeacherStudent } from "../types";
import { radius, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { gridItemWidth } from "../theme/responsive";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";
import { useFormConfig } from "../hooks/useFormConfig";
import {
  studentHasPhoto,
  studentPendingData,
} from "../utils/recordStatus";

type Props = NativeStackScreenProps<RootStackParamList, "StudentList">;
type TabKey = "all" | "pending-photos" | "pending-data" | "captured";

const NUM_COLS = 2;

export function StudentListScreen({ navigation, route }: Props) {
  const styles = useStudentListStyles();
  const { classSection, openStudentId, patchStudent } = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { showCapturedSection } = useFormConfig();
  const gridGap = spacing.cardGap;
  const gridPad = spacing.sm;
  const itemSize = gridItemWidth(NUM_COLS, gridPad, gridGap, width);
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [tab, setTab] = useState<TabKey>("all");
  useEffect(() => {
    if (!showCapturedSection && tab === "captured") setTab("all");
  }, [showCapturedSection, tab]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flowVisible, setFlowVisible] = useState(false);
  const [flowIndex, setFlowIndex] = useState(0);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const addScrollRef = useRef<ScrollView>(null);
  const [pendingPhotoStudent, setPendingPhotoStudent] = useState<TeacherStudent | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const skipFocusReloadRef = useRef(false);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
    setLastClassSection(classSection);
  }, [classSection, navigation]);

  const loadStudents = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) {
        const cached = getCachedStudents(classSection);
        if (cached) {
          setStudents(cached);
          setLoading(false);
          setError(null);
        }
      }
      if (isRefresh) setRefreshing(true);
      else if (!getCachedStudents(classSection)) setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<StudentsResponse>("/teacher/students", {
          params: { classSection },
        });
        setStudents(data.students);
        setCachedStudents(classSection, data.students);
        return data.students;
      } catch (err) {
        setError(getErrorMessage(err, "Failed to load students."));
        return null;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [classSection]
  );

  useFocusEffect(
    useCallback(() => {
      if (patchStudent) {
        setStudents((prev) => {
          const next = prev.map((s) =>
            s.id === patchStudent.id ? patchStudent : s
          );
          setCachedStudents(classSection, next);
          return next;
        });
        navigation.setParams({ patchStudent: undefined });
      }
      if (skipFocusReloadRef.current) {
        skipFocusReloadRef.current = false;
        return;
      }
      if (photoBusy) return;
      void loadStudents().then((list) => {
        if (openStudentId && list) {
          const idx = list.findIndex((s) => s.id === openStudentId);
          if (idx >= 0) {
            setTab("all");
            setFlowIndex(idx);
            setFlowVisible(true);
          }
          navigation.setParams({ openStudentId: undefined });
        }
      });
    }, [classSection, loadStudents, navigation, openStudentId, patchStudent, photoBusy])
  );

  const pendingPhotoCount = useMemo(
    () => students.filter((s) => !studentHasPhoto(s)).length,
    [students]
  );
  const pendingDataCount = useMemo(
    () => students.filter((s) => studentPendingData(s, false)).length,
    [students]
  );
  const capturedCount = useMemo(
    () => students.filter((s) => studentHasPhoto(s)).length,
    [students]
  );
  const tabs: { key: TabKey; label: string; color: string; count: number }[] = [
    { key: "all", label: "All", color: colors.brandGreen, count: students.length },
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
      return students.filter((s) => !studentHasPhoto(s));
    }
    if (tab === "pending-data") {
      return students.filter((s) => studentPendingData(s, false));
    }
    if (tab === "captured" && showCapturedSection) {
      return students
        .filter((s) => studentHasPhoto(s))
        .sort((a, b) => {
          const aTs = Date.parse(a.photo_captured_at ?? "") || 0;
          const bTs = Date.parse(b.photo_captured_at ?? "") || 0;
          if (aTs !== bTs) return bTs - aTs;
          return (a.student_name ?? "").localeCompare(b.student_name ?? "");
        });
    }
    return students;
  }, [students, tab, showCapturedSection]);

  const openStudentModal = useCallback((student: TeacherStudent) => {
    const idx = filtered.findIndex((s) => s.id === student.id);
    const safeIdx = idx >= 0 ? idx : 0;

    if (tab === "pending-photos" && !studentHasPhoto(student)) {
      setPendingPhotoStudent(student);
      return;
    }

    setFlowIndex(safeIdx);
    setFlowVisible(true);
  }, [filtered, tab]);

  async function handlePendingPhoto(source: PhotoSource) {
    if (!pendingPhotoStudent || photoBusy) return;
    const student = pendingPhotoStudent;
    setPendingPhotoStudent(null);
    setPhotoBusy(true);
    skipFocusReloadRef.current = true;
    try {
      if (source === "camera") {
        const photoUri = await pickStudentPhotoFromCamera();
        if (!photoUri) return;
        const updated = await uploadStudentPhoto(student.id, photoUri);
        setStudents((prev) => {
          const next = prev.map((s) => (s.id === updated.id ? updated : s));
          setCachedStudents(classSection, next);
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
        setCachedStudents(classSection, next);
        return next;
      });
      showToast("Submitted successfully.");
    } catch (err) {
      showToast(getErrorMessage(err, "Failed to capture photo."));
    } finally {
      setPhotoBusy(false);
    }
  }

  const renderStudent = useCallback(
    ({ item }: { item: TeacherStudent }) => (
      <StudentGridCell
        item={item}
        width={itemSize}
        captured={studentHasPhoto(item)}
        colors={colors}
        onPress={openStudentModal}
      />
    ),
    [colors, itemSize, openStudentModal]
  );

  if (loading && !refreshing && students.length === 0) {
    return <LoadingBlock label="Loading students…" />;
  }
  if (error && students.length === 0) {
    return <ErrorRetry message={error} onRetry={() => void loadStudents()} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <IdCardsGreenHeader>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {classSection}
            </Text>
          </View>
          {tab !== "captured" ? (
            <Pressable
              style={styles.addBtnHeader}
              onPress={() => setAddModalVisible(true)}
            >
              <Ionicons name="add" size={14} color={colors.brandGreen} />
              <Text style={[styles.addBtnText, { color: colors.brandGreen }]}>
                Add Member
              </Text>
            </Pressable>
          ) : (
            <View style={styles.addBtnPlaceholder} />
          )}
        </View>
      </IdCardsGreenHeader>

      <IdCardsProgressSection
        captured={capturedCount}
        total={students.length}
        caption={`${capturedCount}/${students.length} photos captured`}
      />

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

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLS}
        columnWrapperStyle={styles.gridRow}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadStudents(true)}
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
        updateCellsBatchingPeriod={50}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {students.length === 0
              ? "No students in this class yet."
              : tab === "pending-photos"
                ? "No students are waiting for a photo."
                : tab === "pending-data"
                  ? "No students are missing required data."
                  : "No captured records yet."}
          </Text>
        }
        renderItem={renderStudent}
      />

      <StudentFlowModal
        visible={flowVisible}
        students={filtered}
        initialIndex={flowIndex}
        classSection={classSection}
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
            <View style={styles.addBtnPlaceholder} />
          </View>
            <KeyboardAwareFormScrollView
              scrollRef={addScrollRef}
              contentContainerStyle={styles.addModalScroll}
              showsVerticalScrollIndicator={false}
              persistentScrollbar={false}
            >
              {addModalVisible ? (
                <AddStudentForm
                  key={`add-student-${classSection}`}
                  classSection={classSection}
                  showHeading={false}
                  showPhotoCapture
                  onInputFocus={(target) =>
                    scrollToFocusedInput(addScrollRef, target)
                  }
                  onSuccess={() => {
                    setAddModalVisible(false);
                    showToast("Student added successfully.");
                    invalidateStudentsCache(classSection);
                    void loadStudents(true);
                  }}
                />
              ) : null}
            </KeyboardAwareFormScrollView>
        </View>
      </Modal>

      <PendingPhotoSheet
        visible={Boolean(pendingPhotoStudent)}
        studentName={pendingPhotoStudent?.student_name ?? ""}
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

function useStudentListStyles() {
  return useResponsiveStyles(({ scale, scaleFont }) => ({
    container: { flex: 1 },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    headerCenter: { flex: 1, minWidth: 0 },
    backBtn: { marginRight: spacing.xxs },
    headerTitle: {
      fontFamily: fonts.bold,
      fontSize: scaleFont(typeScale.lg, typeScale.md),
      color: "#FFFFFF",
    },
    addBtnHeader: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#FFFFFF",
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      gap: scale(4),
      transform: [{ scale: 1.14 }],
    },
    addBtnPlaceholder: { width: spacing.iconSm },
    addBtnText: {
      fontFamily: fonts.semiBold,
      fontSize: scale(13),
    },
    tabs: {
      flexDirection: "row",
      paddingHorizontal: spacing.md,
      gap: spacing.xs,
      marginVertical: spacing.xs,
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
    flex: { flex: 1 },
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
    addModalScroll: {
      paddingBottom: spacing.xxl,
    },
  }));
}
