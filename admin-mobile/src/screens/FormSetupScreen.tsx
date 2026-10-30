import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api, { errMsg } from "../api/client";
import type { StudentsResponse } from "../shared/types";
import { isManualFormField, sortFormFields, withSequentialDisplayOrder, type FormFieldConfig } from "../shared/formFields";
import { C, F, R, S } from "../theme";
import { Screen } from "../ui/Screen";
import { Banner, Button, Card, Empty, Field, Loading, Muted, Pill, Toggle } from "../ui/kit";
import { Tap } from "../ui/Pressable";
import type { ScreenProps } from "../navigation/types";

export function FormSetupScreen({ route, navigation }: ScreenProps<"FormSetup">) {
  const { kind, id, name } = route.params;
  const isOrg = kind === "organization";
  const params = kind === "school" ? { schoolId: id } : { instituteId: id };
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [parentForm, setParentForm] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let next: FormFieldConfig[] = [];
        if (isOrg) {
          const { data } = await api.get<{ form: { fields: Array<{ id: string; field_name: string; field_type: "text" | "photo"; enabled: boolean; required: boolean }> } | null }>(`/admin/organizations/${id}`);
          next = (data.form?.fields ?? []).map((f, i) => ({ key: f.id, organizationFieldId: f.id, label: f.field_name, fieldType: f.field_type, enabled: f.enabled !== false, required: f.required !== false, source: "manual", displayOrder: i }));
        } else {
          const { data } = await api.get<{ fields: FormFieldConfig[]; studentCount?: number; importBatchCount?: number }>("/admin/form-config", { params });
          next = Array.isArray(data.fields) ? sortFormFields(data.fields) : [];
          if (!next.length && (data.studentCount ?? 0) + (data.importBatchCount ?? 0) > 0) {
            const retry = await api.get<{ fields: FormFieldConfig[] }>("/admin/form-config", { params: { ...params, rebuild: "true" } });
            next = Array.isArray(retry.data.fields) ? sortFormFields(retry.data.fields) : [];
          }
          if (!next.length) {
            const s = await api.get<StudentsResponse>("/admin/students", { params });
            if ((s.data.students?.length ?? 0) > 0) {
              const sync = await api.post<{ fields: FormFieldConfig[] }>("/admin/form-config/sync", params);
              next = Array.isArray(sync.data.fields) ? sortFormFields(sync.data.fields) : [];
            }
          }
        }
        if (!cancelled) setFields(next);
      } catch (e) {
        if (!cancelled) setError(errMsg(e, "Failed to load form setup."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    if (kind === "school")
      void api
        .get(`/admin/schools/${id}/parent-link`)
        .then(({ data }) => !cancelled && setParentForm(data.enabled === true))
        .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, kind]);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    setFields(withSequentialDisplayOrder(next));
  }
  function patch(i: number, p: Partial<FormFieldConfig>) {
    setFields((prev) => prev.map((f, k) => (k === i ? { ...f, ...p } : f)));
  }
  function addField() {
    const label = newLabel.trim();
    if (!label) return;
    if (fields.some((f) => f.label.trim().toLowerCase() === label.toLowerCase())) return setError("This field already exists.");
    const used = new Set(fields.map((f) => f.key));
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "field";
    let key = `dyn_${slug}`;
    let n = 2;
    while (used.has(key)) key = `dyn_${slug}_${n++}`;
    setFields(withSequentialDisplayOrder([...fields, { key, label, enabled: true, source: "manual", displayOrder: fields.length, ...(isOrg ? { fieldType: "text" as const, required: true } : {}) }]));
    setNewLabel("");
    setError(null);
  }
  async function save() {
    if (!fields.length) return setError("No fields to save.");
    setSaving(true);
    setError(null);
    try {
      const payload = withSequentialDisplayOrder(fields);
      if (isOrg)
        await api.post(`/admin/organizations/${id}/forms`, {
          fields: payload.map((f) => ({ id: f.organizationFieldId, fieldName: f.label, fieldType: f.fieldType ?? "text", enabled: f.enabled, required: f.required !== false })),
        });
      else await api.put("/admin/form-config", { ...params, fields: payload });
      navigation.goBack();
    } catch (e) {
      setError(errMsg(e, "Failed to save form setup."));
    } finally {
      setSaving(false);
    }
  }
  async function toggleParentForm(next: boolean) {
    const prev = parentForm;
    setParentForm(next);
    try {
      const { data } = await api.patch(`/admin/schools/${id}/parent-link/settings`, { enabled: next });
      setParentForm(data.enabled === true);
    } catch (e) {
      setParentForm(prev);
      setError(errMsg(e, "Could not update the parent form."));
    }
  }

  return (
    <Screen title="Form Setup" subtitle={name} footer={fields.length ? <Button title="Save" icon="save-outline" onPress={() => void save()} loading={saving} /> : undefined}>
      <Banner text={error} onClose={() => setError(null)} />
      {kind === "school" && parentForm !== null ? (
        <Card style={{ marginBottom: S.lg, backgroundColor: C.primarySoft }}>
          <Toggle label="Parent student form" sub="Show the parent form link on the app’s ID Cards screen." value={parentForm} onChange={(v) => void toggleParentForm(v)} />
        </Card>
      ) : null}
      {loading ? (
        <Loading text="Loading form fields…" />
      ) : !fields.length && !isOrg ? (
        <Empty icon="document-attach-outline" title="No form fields yet" text={`Upload an Excel file for this ${kind} first.`} />
      ) : (
        <>
          <Muted style={{ marginBottom: S.md }}>
            Use the arrows to change the order. {isOrg ? "Set each field's type and whether it is required." : "Excel fields can be renamed and hidden. Only fields you add can be deleted."}
          </Muted>
          {fields.map((f, i) => (
            <View key={`${f.key}-${i}`} style={[st.row, !f.enabled && { opacity: 0.6 }]}>
              <View style={st.order}>
                <Tap onPress={() => move(i, -1)} disabled={i === 0} hitSlop={6} accessibilityLabel="Move up">
                  <Ionicons name="chevron-up" size={20} color={i === 0 ? C.faint : C.primaryDeep} />
                </Tap>
                <Text style={st.idx}>{i + 1}</Text>
                <Tap onPress={() => move(i, 1)} disabled={i === fields.length - 1} hitSlop={6} accessibilityLabel="Move down">
                  <Ionicons name="chevron-down" size={20} color={i === fields.length - 1 ? C.faint : C.primaryDeep} />
                </Tap>
              </View>
              <View style={{ flex: 1 }}>
                {editing === i ? (
                  <View style={{ gap: 6 }}>
                    <Field value={editLabel} onChangeText={setEditLabel} autoFocus />
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <Button small title="Save" onPress={() => {
                        if (editLabel.trim()) patch(i, { label: editLabel.trim() });
                        setEditing(null);
                      }} />
                      <Button small variant="secondary" title="Cancel" onPress={() => setEditing(null)} />
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={st.label}>{f.label}</Text>
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                      <Pill text={isManualFormField(f) ? "Added" : "Excel"} tone={isManualFormField(f) ? "purple" : "blue"} />
                      {isOrg ? (
                        <>
                          <Tap disabled={Boolean(f.organizationFieldId)} onPress={() => patch(i, { fieldType: f.fieldType === "photo" ? "text" : "photo" })}>
                            <Pill text={f.fieldType === "photo" ? "Photo" : "Text"} tone="teal" icon={f.fieldType === "photo" ? "camera" : "text"} />
                          </Tap>
                          <Tap onPress={() => patch(i, { required: f.required === false })}>
                            <Pill text={f.required !== false ? "Required" : "Optional"} tone={f.required !== false ? "orange" : "grey"} />
                          </Tap>
                        </>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: "row", gap: S.md, marginTop: 8 }}>
                      <Tap onPress={() => {
                        setEditing(i);
                        setEditLabel(f.label);
                      }}>
                        <Text style={st.link}>Rename</Text>
                      </Tap>
                      {isManualFormField(f) && f.key !== "signature_upload" && !f.organizationFieldId ? (
                        <Tap onPress={() => setFields(withSequentialDisplayOrder(fields.filter((_, k) => k !== i)))}>
                          <Text style={[st.link, { color: C.danger }]}>Delete</Text>
                        </Tap>
                      ) : null}
                    </View>
                  </>
                )}
              </View>
              <View style={{ alignItems: "center" }}>
                <Toggle value={f.enabled} onChange={(v) => patch(i, { enabled: v })} />
                <Text style={st.vis}>{f.enabled ? "Visible" : "Hidden"}</Text>
              </View>
            </View>
          ))}
          <Card style={{ marginTop: S.md }}>
            <Text style={st.addTitle}>Add a custom field</Text>
            <Field placeholder="e.g. Bus route" value={newLabel} onChangeText={setNewLabel} returnKeyType="done" onSubmitEditing={addField} />
            <Button title="Add field" variant="outline" icon="add" onPress={addField} disabled={!newLabel.trim()} />
          </Card>
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.surface, borderRadius: R.lg, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.line },
  order: { alignItems: "center", width: 28 },
  idx: { fontFamily: F.bodySemi, fontSize: 12, color: C.muted },
  label: { fontFamily: F.hSemi, fontSize: 15, color: C.ink },
  link: { fontFamily: F.bodySemi, fontSize: 13, color: C.accentDeep },
  vis: { fontFamily: F.bodyMed, fontSize: 10, color: C.muted },
  addTitle: { fontFamily: F.hSemi, fontSize: 15, color: C.ink, marginBottom: S.sm },
});
