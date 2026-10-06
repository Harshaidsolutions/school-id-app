import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { IdCardsGreenHeader } from "./IdCardsGreenHeader";
import { IdCardsProgressSection } from "./IdCardsProgressSection";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, Image, ScrollView, Share, Text, TextInput, View } from "react-native";
import { Pressable } from "./Pressable";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { fonts } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { openWhatsAppShare } from "../utils/whatsappBusiness";

type Field = { id: string; field_name: string; field_type: string; required?: boolean };
type Submission = {
  id: string;
  serial: number;
  photoNumber?: string;
  values: Record<string, { text: string | null; hasPhoto: boolean }>;
};
type CardTab = "all" | "pending" | "captured" | "pending-data";

export function OrganizationCardsPanel() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const loadingRef = useRef(false);
  const { user } = useAuth();
  const [name, setName] = useState(user?.username ?? "Organization");
  const [link, setLink] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [rows, setRows] = useState<Submission[]>([]);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [details, setDetails] = useState({ phone: "", address: "", instructions: "" });
  const [tab, setTab] = useState<CardTab>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [categoryValue, setCategoryValue] = useState("");
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { data } = await api.get<{
        organizationName: string;
        link: string | null;
        fields: Field[];
        submissions: Submission[];
        phone?: string | null;
        address?: string | null;
        instructions?: string | null;
        fieldVisibility?: Record<string, boolean>;
      }>("/organization-app");
      setName(data.organizationName);
      setLink(data.link);
      setFields(data.fields ?? []);
      setRows(data.submissions ?? []);
      setVisibility(data.fieldVisibility ?? {});
      setDetails({
        phone: data.phone ?? "",
        address: data.address ?? "",
        instructions: data.instructions ?? "",
      });
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, "Could not load organization records."));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && !editingId) void load();
    }, 10000);
    return () => clearInterval(timer);
  }, [load, editingId]));

  useEffect(() => { if (visibility.show_captured_section === false && tab === "captured") setTab("all"); }, [visibility, tab]);

  const photoFields = fields.filter((field) => field.field_type === "photo" && !/signature/i.test(field.field_name));
  const textFields = fields.filter((field) => field.field_type !== "photo" && !isLockedPhotoNumber(field.field_name));
  const categoryField = fields.find((field) => field.field_type !== "photo" && isCategoryLabel(field.field_name));
  function captured(row: Submission) {
    return photoFields.length > 0 && photoFields.every((field) => row.values[field.id]?.hasPhoto);
  }
  function missingData(row: Submission) {
    return textFields.some((field) => field.required !== false && !(row.values[field.id]?.text ?? "").trim());
  }
  const categoryOptions = categoryField
    ? [...new Set(rows.map((row) => (row.values[categoryField.id]?.text ?? "").trim()).filter(Boolean))].sort()
    : [];
  const visible = rows.filter((row) => {
    if (tab === "captured" && !captured(row)) return false;
    if (tab === "pending" && captured(row)) return false;
    if (tab === "pending-data" && !missingData(row)) return false;
    if (categoryField && categoryValue && (row.values[categoryField.id]?.text ?? "").trim() !== categoryValue) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (row.photoNumber ?? "").toLowerCase().includes(query) || fields.some((field) => (row.values[field.id]?.text ?? "").toLowerCase().includes(query));
  });
  const counts = {
    all: rows.length,
    pending: rows.filter((row) => !captured(row)).length,
    captured: rows.filter((row) => captured(row)).length,
    pendingData: rows.filter((row) => missingData(row)).length,
  };
  const showDetails = visibility.required_details !== false;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <IdCardsGreenHeader>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
        <Pressable accessibilityLabel="Back to home" onPress={() => navigation.navigate("Home" as never)}>
          <Text style={{ color: "#fff", fontFamily: fonts.semiBold }}>Back</Text>
        </Pressable>
        <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 22, color: "#fff" }}>{name}</Text>
      </View>
    </IdCardsGreenHeader>
    {!loading ? <IdCardsProgressSection captured={counts.captured} total={counts.all} /> : null}
    <FlatList data={visible} keyExtractor={(row) => row.id}
      refreshing={loading} onRefresh={() => { setLoading(true); void load(); }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      ListHeaderComponent={<View style={{ gap: 12 }}>
      {showDetails ? (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, backgroundColor: colors.surface, gap: 4 }}>
          <Text style={{ fontFamily: fonts.semiBold, color: colors.text }}>Required Details</Text>
          {visibility.detail_phone !== false ? <Text style={{ color: colors.text }}>{details.phone || "—"}</Text> : null}
          {visibility.detail_address !== false ? <Text style={{ color: colors.text }}>{details.address || "—"}</Text> : null}
          {visibility.detail_instructions !== false ? <Text style={{ color: colors.text }}>{details.instructions || "—"}</Text> : null}
        </View>
      ) : null}
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search"
        placeholderTextColor={colors.textMuted}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: colors.text, backgroundColor: colors.surface }}
      />
      {categoryField && categoryOptions.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Pressable onPress={() => setCategoryValue("")} style={{ borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: categoryValue === "" ? colors.brandGreen : colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: categoryValue === "" ? "#fff" : colors.text, fontFamily: fonts.semiBold }}>{categoryField.field_name}</Text>
          </Pressable>
          {categoryOptions.map((option) => (
            <Pressable key={option} onPress={() => setCategoryValue(option)} style={{ borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: categoryValue === option ? colors.brandGreen : colors.surface, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: categoryValue === option ? "#fff" : colors.text, fontFamily: fonts.semiBold }}>{option}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {([
          ["all", `All (${counts.all})`],
          ["pending", `Pending (${counts.pending})`],
          ["captured", `Captured (${counts.captured})`],
          ["pending-data", `Pending Data (${counts.pendingData})`],
        ] as const).filter(([key]) => key !== "captured" || visibility.show_captured_section !== false).map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={{ borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: tab === key ? colors.brandGreen : colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: tab === key ? "#fff" : colors.text, fontFamily: fonts.semiBold }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {link ? (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, backgroundColor: colors.surface }}>
          <Text style={{ fontFamily: fonts.medium, color: colors.text }} numberOfLines={2}>{link}</Text>
          <Pressable
            onPress={() => {
              void openWhatsAppShare(link).catch(() => Share.share({ message: link, url: link }));
            }}
            style={{ marginTop: 10, alignSelf: "flex-start", backgroundColor: colors.brandGreen, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
          >
            <Text style={{ color: "#fff", fontFamily: fonts.semiBold }}>WhatsApp</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={{ color: colors.textMuted }}>No form link yet. Create one from the admin website.</Text>
      )}
      {loading ? <Text style={{ color: colors.textMuted }}>Loading…</Text> : null}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      </View>}
      renderItem={({ item: row }) => {
        const editing = editingId === row.id;
        return (
        <View key={row.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, backgroundColor: colors.surface, gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: fonts.semiBold, color: colors.text }}>S.No {row.serial}</Text>
            {editing ? (
              <Pressable
                disabled={saving}
                onPress={() => {
                  setSaving(true);
                  void api.patch(`/organization-app/submissions/${row.id}`, { values: draft })
                    .then(() => load())
                    .then(() => setEditingId(null))
                    .catch((err) => setError(getErrorMessage(err, "Could not save this record.")))
                    .finally(() => setSaving(false));
                }}
              >
                <Text style={{ color: colors.brandGreen, fontFamily: fonts.semiBold }}>{saving ? "Saving…" : "Save"}</Text>
              </Pressable>
            ) : visibility.allow_record_edit !== false || missingData(row) ? (
              <Pressable onPress={() => {
                const next: Record<string, string> = {};
                for (const field of fields) {
                  if (field.field_type === "text" && !isLockedPhotoNumber(field.field_name)) {
                    next[field.id] = row.values[field.id]?.text ?? "";
                  }
                }
                setDraft(next);
                setEditingId(row.id);
              }}>
                <Text style={{ color: colors.brandGreen, fontFamily: fonts.semiBold }}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{fields.find((field) => isLockedPhotoNumber(field.field_name))?.field_name ?? "Photo Number"}</Text>
          <Text style={{ color: colors.text, fontFamily: fonts.medium }}>{row.photoNumber || "—"}</Text>
          {fields.filter((field) => !isLockedPhotoNumber(field.field_name)).map((field) => {
            return (
            <View key={field.id}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{field.field_name}</Text>
              {field.field_type === "photo" && row.values[field.id]?.hasPhoto ? (
                <SubmissionPhoto submissionId={row.id} fieldId={field.id} onOpen={setViewPhoto} />
              ) : editing && field.field_type === "text" ? (
                <TextInput
                  value={draft[field.id] ?? ""}
                  onChangeText={(text) => setDraft((current) => ({ ...current, [field.id]: text }))}
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: colors.text, fontFamily: fonts.medium }}
                />
              ) : (
                <Text style={{ color: colors.text, fontFamily: fonts.medium }}>{row.values[field.id]?.text || "—"}</Text>
              )}
            </View>
            );
          })}
        </View>
        );
      }}
    />
      {viewPhoto ? (
        <Pressable onPress={() => setViewPhoto(null)} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(15,23,42,0.55)", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Image source={{ uri: viewPhoto }} style={{ width: "100%", height: 420, borderRadius: 16, backgroundColor: "#fff" }} resizeMode="contain" />
        </Pressable>
      ) : null}
    </View>
  );
}

function isLockedPhotoNumber(name: string): boolean {
  return /photo\s*(number|no\.?|id)\b/i.test(name);
}

function isCategoryLabel(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return (
    normalized.includes("department") ||
    normalized.includes("designation") ||
    normalized.includes("group") ||
    normalized === "class" ||
    normalized.includes("classsection") ||
    normalized.includes("section") ||
    normalized.includes("grade")
  );
}

function SubmissionPhoto({
  submissionId,
  fieldId,
  onOpen,
}: {
  submissionId: string;
  fieldId: string;
  onOpen?: (uri: string) => void;
}) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void api.get<ArrayBuffer>(`/organization-app/submissions/${submissionId}/fields/${fieldId}/photo`, {
      responseType: "arraybuffer",
    }).then(({ data }) => {
      if (!cancelled) setUri(`data:image/jpeg;base64,${toBase64(data)}`);
    }).catch(() => {
      if (!cancelled) setUri(null);
    });
    return () => {
      cancelled = true;
    };
  }, [submissionId, fieldId]);
  if (!uri) return null;
  return (
    <Pressable onPress={() => onOpen?.(uri)}>
      <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 8 }} />
    </Pressable>
  );
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return globalThis.btoa(binary);
}
