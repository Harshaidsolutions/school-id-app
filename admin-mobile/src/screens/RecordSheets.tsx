import { MAX_ZIP_MB, uploadPhotoZip, type ImportResult } from "../lib/zipUpload";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import api, { apiImage, errMsg } from "../api/client";
import type { Student } from "../shared/types";
import type { FormFieldConfig } from "../shared/formFields";
import { activeFormFields, allValuesLabel, findClassField, findStudentNameField, isClassCategoryField, isPlainPhotoPrompt, wiseActionLabel } from "../shared/formFieldHelpers";
import { C, F, R, S } from "../theme";
import { Banner, Button, Check, Field, Muted, Segmented } from "../ui/kit";
import { Select, Sheet } from "../ui/Sheet";
import { PhotoPick } from "../ui/PhotoPick";
import { Tap } from "../ui/Pressable";
import { DOC_TYPES, asFormFile, pickDocuments, pickImages, sizeOk, type PickedFile } from "../lib/files";
import { dayLabel } from "../lib/format";
import { fieldProblem, isPhoneField } from "../lib/validate";

const GENDERS = ["Male", "Female", "Other"];
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export type CountOption = { name: string; count: number; key?: string };
export type CategoryField = { label: string; key: string; options: CountOption[] };

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const d = value ? new Date(`${value}T00:00:00`) : null;
  return (
    <View style={{ marginBottom: S.md }}>
      <Text style={st.label}>{label}</Text>
      <Tap onPress={() => setOpen(true)} style={st.date} scaleTo={0.99}>
        <Ionicons name="calendar-outline" size={18} color={C.muted} />
        <Text style={[st.dateText, !value && { color: C.faint }]}>{value ? dayLabel(value) : "Choose date"}</Text>
        {value ? (
          <Tap onPress={() => onChange("")} hitSlop={8} accessibilityLabel="Clear date">
            <Ionicons name="close-circle" size={18} color={C.faint} />
          </Tap>
        ) : null}
      </Tap>
      {open ? (
        <DateTimePicker
          value={d && !Number.isNaN(d.getTime()) ? d : new Date(2015, 0, 1)}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          maximumDate={new Date()}
          onChange={(event, picked) => {
            setOpen(Platform.OS === "ios");
            if (event.type === "set" && picked) {
              const iso = `${picked.getFullYear()}-${String(picked.getMonth() + 1).padStart(2, "0")}-${String(picked.getDate()).padStart(2, "0")}`;
              onChange(iso);
            }
          }}
        />
      ) : null}
    </View>
  );
}

/** Add or edit a student / member. Fields come from the school's Form Setup. */
export function RecordFormSheet({
  visible,
  onClose,
  record,
  orgKind,
  orgId,
  formFields,
  classOptions,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  record: Student | null;
  orgKind: "school" | "institute";
  orgId: string;
  formFields: FormFieldConfig[];
  classOptions: string[];
  onSaved: (s: Student, isNew: boolean) => void;
}) {
  const fields = useMemo(() => activeFormFields(formFields), [formFields]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<PickedFile | null>(null);
  const [signature, setSignature] = useState<PickedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = !record;
  const hasSignature = fields.some((f) => f.key === "signature_upload");
  const numberField = fields.find(
    (f) => f.key === "photo_id" || /^(id|photoid|photonumber|photono|photoidnumber)$/.test(f.label.toLowerCase().replace(/[^a-z0-9]/g, ""))
  );

  useEffect(() => {
    if (!visible) return;
    setPhoto(null);
    setSignature(null);
    setError(null);
    if (!record) {
      setValues({});
      return;
    }
    const next: Record<string, string> = {
      student_name: record.student_name ?? "",
      class_section: record.class_section ?? "",
      roll_no: record.roll_no ?? "",
      dob: record.dob?.slice(0, 10) ?? "",
      gender: record.gender ?? "",
      blood_group: record.blood_group ?? "",
      parent_name: record.parent_name ?? "",
      parent_phone: record.parent_phone ?? "",
      address: record.address ?? "",
      photo_id: record.photo_id ?? "",
      custom_1: record.custom_1 ?? "",
      custom_2: record.custom_2 ?? "",
      custom_3: record.custom_3 ?? "",
    };
    for (const [k, v] of Object.entries(record.extra_fields ?? {})) next[k] = v ?? "";
    setValues(next);
  }, [visible, record]);

  const val = (k: string) => values[k] ?? "";
  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  async function uploadAssets(id: string): Promise<Student | null> {
    let latest: Student | null = null;
    if (signature) {
      const form = new FormData();
      form.append("signature", asFormFile(signature));
      latest = (await api.post<{ student: Student }>(`/admin/students/${id}/signature`, form)).data.student;
    }
    if (photo) {
      const form = new FormData();
      form.append("photo", asFormFile(photo));
      latest = (await api.post<{ student: Student }>(`/admin/students/${id}/photo`, form)).data.student;
    }
    return latest;
  }

  async function save() {
    const nameField = findStudentNameField(fields);
    const classField = findClassField(fields);
    if (nameField && !val(nameField.key).trim()) return setError(`${nameField.label} is required.`);
    if (classField && !val(classField.key).trim()) return setError(`${classField.label} is required.`);
    for (const f of [photo, signature]) if (f && !sizeOk(f, 10)) return setError("Photos must be under 10 MB.");
    for (const fl of fields) {
      if (fl.key === "signature_upload" || isPlainPhotoPrompt(fl)) continue;
      const problem = fieldProblem(fl.key, fl.label, val(fl.key));
      if (problem) return setError(problem);
    }
    setBusy(true);
    setError(null);
    try {
      const extra: Record<string, string | null> = {};
      for (const f of fields) if (f.key !== "signature_upload") extra[f.key] = val(f.key).trim() || null;
      let saved: Student;
      if (isNew) {
        const nameRaw = nameField ? val(nameField.key).trim() : "";
        const parts = nameRaw.split(/\s+/);
        const payload: Record<string, unknown> = {
          firstName: parts[0] ?? "",
          lastName: parts.slice(1).join(" "),
          studentName: nameRaw || undefined,
          classSection: classField ? val(classField.key).trim() || undefined : undefined,
          schoolId: orgKind === "school" ? orgId : undefined,
          instituteId: orgKind === "institute" ? orgId : undefined,
          extra_fields: extra,
        };
        for (const f of fields) if (f.key !== "signature_upload") payload[f.key] = val(f.key).trim() || undefined;
        saved = (await api.post<{ student: Student }>("/admin/students", payload)).data.student;
      } else {
        const body: Record<string, unknown> = {
          photo_id: record!.photo_id ?? null,
          student_name: val("student_name").trim(),
          class_section: val("class_section").trim(),
          roll_no: val("roll_no").trim() || null,
          dob: val("dob") || null,
          gender: val("gender") || null,
          blood_group: val("blood_group") || null,
          parent_name: val("parent_name").trim() || null,
          parent_phone: val("parent_phone").trim() || null,
          address: val("address").trim() || null,
          custom_1: val("custom_1").trim() || null,
          custom_2: val("custom_2").trim() || null,
          custom_3: val("custom_3").trim() || null,
          extra_fields: extra,
        };
        for (const f of fields) if (f.key !== "signature_upload") body[f.key] = val(f.key).trim() || null;
        body.photo_id = record!.photo_id ?? null;
        const { data } = await api.put<{ student: Student }>(`/admin/students/${record!.id}`, body);
        saved = data.student ?? { ...record!, ...(body as Partial<Student>) };
      }
      try {
        const withAssets = await uploadAssets(saved.id);
        if (withAssets) saved = withAssets;
      } catch (e) {
        onSaved(saved, isNew);
        setError(errMsg(e, "Details saved, but the photo could not be uploaded. Try again."));
        return;
      }
      onSaved(saved, isNew);
      onClose();
    } catch (e) {
      setError(errMsg(e, isNew ? "Failed to add record." : "Failed to save record."));
    } finally {
      setBusy(false);
    }
  }

  const classes = Array.from(new Set([val("class_section"), ...classOptions].filter(Boolean))).sort();
  const noun = orgKind === "institute" ? "member" : "student";

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={isNew ? `Add ${noun}` : `Edit ${noun}`}
      subtitle={record?.student_name ?? undefined}
      footer={fields.length ? <Button title={isNew ? `Add ${noun}` : "Save changes"} icon="checkmark" onPress={() => void save()} loading={busy} /> : undefined}
    >
      {fields.length === 0 ? (
        <Banner tone="amber" text="Upload an Excel file first. Its columns become this form's fields." />
      ) : (
        <>
          <Banner text={error} />
          <PhotoPick
            label="Photo"
            value={photo}
            onChange={setPhoto}
            current={record?.photo_url ? apiImage(`/admin/students/${record.id}/photo?thumb=1&v=${encodeURIComponent(record.updated_at ?? "")}`) : null}
            hint={record?.photo_url ? "Pick a new photo to replace it." : "Optional. JPG or PNG, up to 10 MB."}
          />
          {fields
            .filter((f) => !isPlainPhotoPrompt(f) && f.key !== "signature_upload")
            .map((f) => {
              if (isClassCategoryField(f) || f.key === "class_section") {
                return f.key === "class_section" && classes.length ? (
                  <Select key={f.key} label={f.label} required value={val(f.key)} onChange={(v) => set(f.key, v)} options={classes.map((c) => ({ value: c, label: c }))} placeholder={`Select ${f.label}`} />
                ) : (
                  <Field key={f.key} label={f.label} required value={val(f.key)} onChangeText={(t) => set(f.key, t)} />
                );
              }
              if (f.key === "gender") return <Select key={f.key} label={f.label} value={val(f.key)} onChange={(v) => set(f.key, v)} options={GENDERS.map((g) => ({ value: g, label: g }))} placeholder="Select gender" />;
              if (f.key === "blood_group") return <Select key={f.key} label={f.label} value={val(f.key)} onChange={(v) => set(f.key, v)} options={BLOOD.map((g) => ({ value: g, label: g }))} placeholder="Select blood group" />;
              if (f.key === "dob") return <DateField key={f.key} label={f.label} value={val(f.key)} onChange={(v) => set(f.key, v)} />;
              if (f.key === "address") return <Field key={f.key} label={f.label} value={val(f.key)} onChangeText={(t) => set(f.key, t)} multiline />;
              if (!isNew && (f.key === "photo_id" || f.key === numberField?.key)) {
                // The photo number links the record to its photo files — it can never be changed.
                return <Field key={f.key} label={f.label} value={val(f.key)} editable={false} icon="lock-closed-outline" hint="The photo number cannot be changed." style={{ color: C.muted }} />;
              }
              const phone = isPhoneField(f.key, f.label);
              return (
                <Field
                  key={f.key}
                  label={f.label}
                  required={f.key === "student_name"}
                  value={val(f.key)}
                  onChangeText={(t) => set(f.key, t)}
                  keyboardType={phone ? "phone-pad" : /mail/i.test(f.label) ? "email-address" : "default"}
                  maxLength={phone ? 13 : undefined}
                  error={fieldProblem(f.key, f.label, val(f.key))}
                  autoCapitalize={f.key === "student_name" || /name/i.test(f.label) ? "words" : "sentences"}
                />
              );
            })}
          {hasSignature ? (
            <PhotoPick
              label="Signature"
              wide
              value={signature}
              onChange={setSignature}
              current={record?.signature_url ? apiImage(`/admin/students/${record.id}/signature?thumb=1`) : null}
              hint="Photo of the signature on white paper."
            />
          ) : null}
        </>
      )}
    </Sheet>
  );
}

type UploadTarget = { schoolId?: string; instituteId?: string; organizationId?: string };

/** Upload the Excel sheet of records (new or replace). */
export function ExcelUploadSheet({ visible, onClose, target, onDone }: { visible: boolean; onClose: () => void; target: UploadTarget; onDone: () => void }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<{ row: number; reason: string }[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [hasExisting, setHasExisting] = useState(false);
  const [replace, setReplace] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setFile(null);
    setError(null);
    setRowErrors([]);
    setDone(null);
    setReplace(false);
    if (target.organizationId) {
      setHasExisting(false);
      return;
    }
    void api
      .get<{ importBatchCount?: number }>("/admin/form-config", { params: target.schoolId ? { schoolId: target.schoolId } : { instituteId: target.instituteId } })
      .then(({ data }) => setHasExisting((data.importBatchCount ?? 0) > 0))
      .catch(() => setHasExisting(false));
  }, [visible, target.organizationId, target.schoolId, target.instituteId]);

  async function upload() {
    if (!file) return setError("Choose an .xlsx file first.");
    if (hasExisting && !replace) return setError("This list already has an Excel. Tick “Replace existing Excel” to continue.");
    setBusy(true);
    setError(null);
    setRowErrors([]);
    try {
      const form = new FormData();
      form.append("file", asFormFile(file));
      if (target.schoolId) form.append("schoolId", target.schoolId);
      if (target.instituteId) form.append("instituteId", target.instituteId);
      if (replace) form.append("replaceExisting", "true");
      const url = target.organizationId ? `/admin/organizations/${target.organizationId}/excel` : "/admin/students/bulk-upload";
      const { data } = await api.post(url, form, { timeout: 600000 });
      if (data?.success === false) {
        setRowErrors(data.errors ?? []);
        return;
      }
      const msg = data?.imported !== undefined ? `Imported ${data.imported} record(s)${data.inserted !== undefined ? ` — ${data.inserted} new, ${data.updated ?? 0} updated` : ""}.` : "Excel uploaded successfully.";
      setDone(msg);
      setFile(null);
      setHasExisting(!target.organizationId);
      onDone();
    } catch (e) {
      const body = (e as { response?: { data?: { success?: boolean; errors?: { row: number; reason: string }[] } } }).response?.data;
      if (body?.success === false && body.errors) setRowErrors(body.errors);
      else setError(errMsg(e, "Upload failed. Please check the file and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Upload Excel" subtitle="The first row must have the column names." footer={<Button title={replace ? "Replace Excel" : "Upload"} icon="cloud-upload-outline" onPress={() => void upload()} loading={busy} disabled={!file} />}>
      <Banner text={error} />
      <Banner text={done} tone="green" />
      {rowErrors.length ? (
        <View style={st.errBox}>
          <Text style={st.errTitle}>Fix these rows and upload again</Text>
          {rowErrors.slice(0, 30).map((r, i) => (
            <Muted key={i}>
              Row {r.row}: {r.reason}
            </Muted>
          ))}
        </View>
      ) : null}
      <Tap
        onPress={async () => {
          const [f] = await pickDocuments(DOC_TYPES.excel);
          if (f) {
            setFile(f);
            setError(null);
            setDone(null);
          }
        }}
        style={st.drop}
      >
        <Ionicons name={file ? "document-text" : "cloud-upload-outline"} size={34} color={C.primary} />
        <Text style={st.dropTitle}>{file ? file.name : "Choose Excel file (.xlsx)"}</Text>
        <Muted>{file ? "Tap to choose a different file" : "From your phone, Drive or WhatsApp downloads"}</Muted>
      </Tap>
      {hasExisting ? <Check checked={replace} onPress={() => setReplace((r) => !r)} label="Replace existing Excel (existing photos are kept)" /> : null}
    </Sheet>
  );
}

/**
 * Upload photos named by their Excel photo number (e.g. ADD_001.jpg):
 * pick several photos (Files keeps the real file names) or one ZIP.
 * Each photo is sent separately so one bad file does not stop the rest.
 */
export function PhotoImportSheet({ visible, onClose, orgId, kind, onDone }: { visible: boolean; onClose: () => void; orgId: string; kind: "school" | "institute"; onDone: () => void }) {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [totals, setTotals] = useState<{ uploaded: number; skipped: number; failed: number } | null>(null);
  const [fraction, setFraction] = useState(0);
  const stop = useRef(false);
  useEffect(() => {
    if (visible) {
      setTotals(null);
      setFiles([]);
      setReplace(false);
      setError(null);
      setResults([]);
      setProgress(null);
    }
  }, [visible]);

  function choose(picked: PickedFile[]) {
    if (!picked.length) return;
    const bad = picked.filter((f) => !/\.(zip|jpe?g|png)$/i.test(f.name));
    if (bad.length) {
      setError(`Only JPG, PNG or ZIP files can be uploaded (${bad[0].name}).`);
      return;
    }
    const zips = picked.filter((f) => /\.zip$/i.test(f.name));
    if (zips.length && zips.length !== picked.length) {
      setError("Choose ZIP files, or choose photos (not both together).");
      return;
    }
    setError(null);
    setResults([]);
    setTotals(null);
    setFiles(picked);
  }

  async function upload() {
    if (!files.length) return;
    const isZip = /\.zip$/i.test(files[0].name);
    if (isZip && files.some((f) => !sizeOk(f, MAX_ZIP_MB))) return setError(`Each ZIP must be under ${MAX_ZIP_MB} MB. Split bigger ZIPs.`);
    if (!isZip && files.some((f) => !sizeOk(f, 20))) return setError("Each photo must be under 20 MB.");
    setBusy(true);
    setError(null);
    setResults([]);
    setTotals(null);
    stop.current = false;
    const all: ImportResult[] = [];
    const sum = { uploaded: 0, skipped: 0, failed: 0 };
    const count = (r: ImportResult) => {
      if (r.status === "uploaded") sum.uploaded += 1;
      else if (r.status === "skipped") sum.skipped += 1;
      else sum.failed += 1;
    };
    try {
      for (let i = 0; i < files.length; i++) {
        if (stop.current) break;
        const f = files[i];
        const label = files.length > 1 ? `${isZip ? "ZIP" : "Photo"} ${i + 1} of ${files.length}` : f.name;
        if (isZip) {
          try {
            const job = await uploadPhotoZip(f, {
              orgId,
              kind,
              replace,
              isCancelled: () => stop.current,
              onProgress: (text, fraction) => {
                setProgress(`${label} · ${text}`);
                setFraction(fraction);
              },
            });
            if (job.status === "failed") {
              const r = { file: f.name, status: "failed", reason: job.error ?? "ZIP could not be processed" };
              all.push(r);
              count(r);
            } else {
              sum.uploaded += job.uploaded;
              sum.skipped += job.skipped;
              sum.failed += job.failed;
              all.push(...job.results.filter((r) => r.status !== "uploaded"));
            }
          } catch (e) {
            const r = { file: f.name, status: "failed", reason: errMsg(e, "Upload failed. Check the internet and upload this ZIP again.") };
            all.push(r);
            count(r);
          }
        } else {
          setProgress(`Uploading ${label}`);
          setFraction((i + 1) / files.length);
          const form = new FormData();
          form.append("orgId", orgId);
          form.append("kind", kind);
          form.append("replace", String(replace));
          form.append("file", asFormFile({ ...f, type: f.type || "image/jpeg" }));
          try {
            const { data } = await api.post("/admin/photo-import", form, { timeout: 300000 });
            for (const r of (data?.results ?? []) as ImportResult[]) {
              count(r);
              if (r.status !== "uploaded") all.push(r);
            }
          } catch (e) {
            const r = { file: f.name, status: "failed", reason: errMsg(e, "Upload failed") };
            all.push(r);
            count(r);
          }
        }
        setResults([...all]);
        setTotals({ ...sum });
      }
      onDone();
    } finally {
      setResults([...all]);
      setTotals({ ...sum });
      setBusy(false);
      setProgress(null);
      setFraction(0);
    }
  }

  const isZip = files.length > 0 && /\.zip$/i.test(files[0].name);
  return (
    <Sheet
      visible={visible}
      onClose={() => !busy && onClose()}
      title="Upload Photos"
      subtitle="Each photo's file name must be its Excel Photo Number, e.g. ADD_001.jpg"
      footer={
        busy ? (
          <Button title="Stop after this file" variant="secondary" icon="stop-circle-outline" onPress={() => (stop.current = true)} />
        ) : (
          <Button title={files.length ? `Upload ${files.length} ${isZip ? "ZIP" : "photo"}${files.length > 1 ? "s" : ""}` : "Upload"} icon="cloud-upload-outline" onPress={() => void upload()} disabled={!files.length} />
        )
      }
    >
      <Banner text={error} onClose={() => setError(null)} />
      {progress ? (
        <View style={{ marginBottom: S.md }}>
          <Banner text={progress} tone="blue" />
          <View style={st.bar}>
            <View style={[st.barFill, { width: `${Math.max(3, Math.round(fraction * 100))}%` }]} />
          </View>
        </View>
      ) : null}
      <View style={{ gap: S.sm, marginBottom: S.md }}>
        <Button title="Choose photos from Files" variant="soft" icon="folder-open-outline" disabled={busy} onPress={async () => choose(await pickDocuments(["image/jpeg", "image/png"], true))} />
        <Button title="Choose photos from Gallery" variant="soft" icon="images-outline" disabled={busy} onPress={async () => choose(await pickImages(true))} />
        <Button title="Choose ZIP files (up to 500 MB each)" variant="soft" icon="file-tray-full-outline" disabled={busy} onPress={async () => choose(await pickDocuments(DOC_TYPES.zip, true))} />
      </View>
      {files.length ? (
        <View style={st.errBox}>
          <Text style={st.errTitle}>{isZip ? `${files.length} ZIP file(s) selected` : `${files.length} photo(s) selected`}</Text>
          {files.slice(0, 8).map((f) => (
            <Muted key={f.uri}>• {f.name}</Muted>
          ))}
          {files.length > 8 ? <Muted>…and {files.length - 8} more</Muted> : null}
        </View>
      ) : (
        <Muted style={{ marginBottom: S.md }}>Tip: “Files” keeps the original photo names. Gallery names may change on some phones. ZIP files up to 500 MB each (choose several, or upload more ZIPs later) · JPG/PNG up to 20 MB each. Photos are matched by Photo Number.</Muted>
      )}
      <Check checked={replace} onPress={() => setReplace((r) => !r)} label="Replace photos that already exist (they become uncropped)" />
      {totals ? (
        <View style={[st.errBox, { marginTop: S.md }]}>
          <Text style={st.errTitle}>
            ✓ {totals.uploaded} uploaded · {totals.skipped} skipped · {totals.failed} failed
          </Text>
          {results
            .filter((r) => r.status !== "uploaded")
            .slice(0, 60)
            .map((r, i) => (
              <Muted key={i}>
                {r.file}: {r.reason ?? r.status}
              </Muted>
            ))}
        </View>
      ) : null}
    </Sheet>
  );
}

export type ExcelJob = { scope: string; date?: string; classSection?: string; fieldKey?: string };

const EXCEL_MENU = [
  { scope: "all", label: "All Excel" },
  { scope: "captured", label: "Captured photos Excel" },
  { scope: "pending", label: "Pending photos Excel" },
  { scope: "captured-pending-data", label: "Captured photos – pending data" },
  { scope: "uncaptured-pending-data", label: "Uncaptured photos – pending data" },
];

/** Choose which Excel to download. */
export function ExcelDownloadSheet({
  visible,
  onClose,
  counts,
  captureDates,
  categoryFields,
  busy,
  onDownload,
}: {
  visible: boolean;
  onClose: () => void;
  counts: Record<string, number>;
  captureDates: CountOption[];
  categoryFields: CategoryField[];
  busy: boolean;
  onDownload: (job: ExcelJob) => void;
}) {
  const [mode, setMode] = useState<"menu" | "date" | "field">("menu");
  const [scope, setScope] = useState("all");
  const [date, setDate] = useState("");
  const [fieldIndex, setFieldIndex] = useState(0);
  const [value, setValue] = useState("");
  const [dataType, setDataType] = useState("all");
  useEffect(() => {
    if (visible) {
      setMode("menu");
      setScope("all");
      setDate("");
      setValue("");
      setDataType("all");
    }
  }, [visible]);
  const field = categoryFields[fieldIndex];
  function go() {
    if (mode === "menu") onDownload({ scope });
    else if (mode === "date") onDownload({ scope: "captured", date });
    else {
      const opt = field?.options.find((o) => o.name === value);
      onDownload({ scope: dataType, classSection: value === "__all__" ? undefined : value, fieldKey: value === "__all__" ? undefined : opt?.key || field?.key });
    }
  }
  const ready = mode === "menu" || (mode === "date" && date) || (mode === "field" && value);
  return (
    <Sheet visible={visible} onClose={onClose} title="Download Excel" footer={<Button title="Download" icon="download-outline" onPress={go} loading={busy} disabled={!ready} />}>
      {mode === "menu" ? (
        <>
          {EXCEL_MENU.map((m) => (
            <Choice key={m.scope} on={scope === m.scope} title={m.label} count={counts[m.scope] ?? 0} onPress={() => setScope(m.scope)} />
          ))}
          <Choice title="Date-wise captured data" count={captureDates.reduce((a, b) => a + b.count, 0)} chevron onPress={() => setMode("date")} />
          {categoryFields.map((f, i) => (
            <Choice key={f.key} title={wiseActionLabel("DOWNLOAD", f.label)} count={f.options.reduce((a, b) => a + b.count, 0)} chevron onPress={() => {
              setFieldIndex(i);
              setValue("");
              setMode("field");
            }} />
          ))}
        </>
      ) : mode === "date" ? (
        <>
          <BackLink onPress={() => setMode("menu")} />
          <Select label="Capture date" value={date} onChange={setDate} options={captureDates.map((d) => ({ value: d.name, label: `${dayLabel(d.name)} — ${d.count} photos` }))} placeholder="Choose a date" />
        </>
      ) : (
        <>
          <BackLink onPress={() => setMode("menu")} />
          <Select label={field?.label ?? "Field"} value={value} onChange={setValue} options={[{ value: "__all__", label: allValuesLabel(field?.label ?? "Field") }, ...(field?.options ?? []).map((o) => ({ value: o.name, label: `${o.name} (${o.count})` }))]} />
          <Select label="Download type" value={dataType} onChange={setDataType} options={[{ value: "all", label: "All data" }, { value: "pending-data", label: "Pending data" }, { value: "captured", label: "Captured data" }]} />
        </>
      )}
    </Sheet>
  );
}

export type PhotoJob = { asset: "photo" | "signature"; date?: string; classSection?: string; fieldKey?: string };

/** Choose which photos (ZIP) to download. */
export function PhotoDownloadSheet({
  visible,
  onClose,
  photoCounts,
  categoryFields,
  showSignature,
  busy,
  onDownload,
}: {
  visible: boolean;
  onClose: () => void;
  photoCounts: Record<string, number>;
  categoryFields: CategoryField[];
  showSignature: boolean;
  busy: boolean;
  onDownload: (job: PhotoJob) => void;
}) {
  const [mode, setMode] = useState<"all" | "date" | string>("all");
  const [asset, setAsset] = useState<"photo" | "signature">("photo");
  const [date, setDate] = useState("");
  const [value, setValue] = useState("");
  useEffect(() => {
    if (visible) {
      setMode("all");
      setAsset("photo");
      setDate("");
      setValue("");
    }
  }, [visible]);
  const total = Object.values(photoCounts).reduce((a, b) => a + b, 0);
  const dates = Object.entries(photoCounts).sort(([a], [b]) => b.localeCompare(a));
  const field = categoryFields.find((f) => f.key === mode);
  function go() {
    if (mode === "all") onDownload({ asset });
    else if (mode === "date") onDownload({ asset, date });
    else {
      const opt = field?.options.find((o) => o.name === value);
      onDownload({ asset, classSection: value === "__all__" ? undefined : value, fieldKey: value === "__all__" ? undefined : opt?.key || field?.key });
    }
  }
  const ready = mode === "all" || (mode === "date" && date) || (field && value);
  return (
    <Sheet visible={visible} onClose={onClose} title="Download photos" subtitle="Photos are saved as a ZIP file." footer={<Button title="Download ZIP" icon="download-outline" onPress={go} loading={busy} disabled={!ready} />}>
      {showSignature ? (
        <Segmented
          value={asset}
          onChange={setAsset}
          items={[
            { key: "photo", label: "Photos" },
            { key: "signature", label: "Signatures" },
          ]}
        />
      ) : null}
      <Choice on={mode === "all"} title="All photos" count={total} onPress={() => setMode("all")} />
      <Choice on={mode === "date"} title="Date-wise photos" count={total} onPress={() => setMode("date")} />
      {mode === "date" ? (
        <Select label="Capture date" value={date} onChange={setDate} options={dates.map(([d, c]) => ({ value: d, label: `${dayLabel(d)} — ${c} photos` }))} placeholder="Choose a date" />
      ) : null}
      {categoryFields.map((f) => (
        <View key={f.key}>
          <Choice on={mode === f.key} title={wiseActionLabel("DOWNLOAD", f.label)} count={f.options.reduce((a, b) => a + b.count, 0)} onPress={() => {
            setMode(f.key);
            setValue("");
          }} />
          {mode === f.key ? (
            <Select label={f.label} value={value} onChange={setValue} options={[{ value: "__all__", label: allValuesLabel(f.label) }, ...f.options.map((o) => ({ value: o.name, label: `${o.name} (${o.count})` }))]} />
          ) : null}
        </View>
      ))}
    </Sheet>
  );
}

export type DeleteJob = {
  kind: "photos" | "data";
  label: string;
  date?: string;
  classSection?: string;
  fieldKey?: string;
  dataScope?: "captured" | "uncaptured" | "pending-data";
  photoScope?: "all" | "pending" | "captured";
};

/** Choose what to delete (then confirm with OTP). */
export function DeleteOptionsSheet({
  visible,
  onClose,
  photoCounts,
  categoryFields,
  counts,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  photoCounts: Record<string, number>;
  categoryFields: CategoryField[];
  counts: { allPhotos: number; allData: number; capturedData: number; uncapturedData: number };
  onChoose: (job: DeleteJob) => void;
}) {
  const [step, setStep] = useState<"menu" | "date" | "field">("menu");
  const [mode, setMode] = useState<"photos" | "data">("photos");
  const [fieldIndex, setFieldIndex] = useState(0);
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");
  const [dataScope, setDataScope] = useState("all");
  useEffect(() => {
    if (visible) {
      setStep("menu");
      setValue("");
      setDate("");
      setDataScope("all");
    }
  }, [visible]);
  const field = categoryFields[fieldIndex];
  const dates = Object.entries(photoCounts).sort(([a], [b]) => b.localeCompare(a));
  return (
    <Sheet visible={visible} onClose={onClose} title="Delete options" subtitle="Only the set you choose is removed, after OTP confirmation.">
      {step === "menu" ? (
        <>
          <Text style={st.group}>Photos</Text>
          <Choice danger title="Delete all photos" count={counts.allPhotos} onPress={() => onChoose({ kind: "photos", label: "Delete all photos" })} />
          <Choice danger chevron title="Delete date-wise photos" count={counts.allPhotos} onPress={() => setStep("date")} />
          {categoryFields.map((f, i) => (
            <Choice key={`p${f.key}`} danger chevron title={wiseActionLabel("DELETE", f.label, "Photos")} count={f.options.reduce((a, b) => a + b.count, 0)} onPress={() => {
              setFieldIndex(i);
              setMode("photos");
              setValue("");
              setStep("field");
            }} />
          ))}
          <Text style={[st.group, { marginTop: S.lg }]}>Data</Text>
          <Choice danger title="Delete Excel / full data" count={counts.allData} onPress={() => onChoose({ kind: "data", label: "Delete full data" })} />
          <Choice danger title="Delete captured data" count={counts.capturedData} onPress={() => onChoose({ kind: "data", dataScope: "captured", label: "Delete captured data" })} />
          <Choice danger title="Delete uncaptured data" count={counts.uncapturedData} onPress={() => onChoose({ kind: "data", dataScope: "uncaptured", label: "Delete uncaptured data" })} />
          {categoryFields.map((f, i) => (
            <Choice key={`d${f.key}`} danger chevron title={wiseActionLabel("DELETE", f.label, "Data")} count={counts.allData} onPress={() => {
              setFieldIndex(i);
              setMode("data");
              setValue("");
              setStep("field");
            }} />
          ))}
        </>
      ) : step === "date" ? (
        <>
          <BackLink onPress={() => setStep("menu")} />
          <Select label="Capture date" value={date} onChange={setDate} options={dates.map(([d, c]) => ({ value: d, label: `${dayLabel(d)} — ${c} photos` }))} placeholder="Choose a date" />
          <Button title="Delete photos of this date" variant="danger" icon="trash-outline" disabled={!date} onPress={() => onChoose({ kind: "photos", date, label: `Delete photos from ${dayLabel(date)}` })} />
        </>
      ) : (
        <>
          <BackLink onPress={() => setStep("menu")} />
          <Select label={field?.label ?? "Field"} value={value} onChange={setValue} options={[{ value: "__all__", label: allValuesLabel(field?.label ?? "Field") }, ...(field?.options ?? []).map((o) => ({ value: o.name, label: o.name }))]} />
          {mode === "data" ? (
            <Select label="Which data" value={dataScope} onChange={setDataScope} options={[{ value: "all", label: "All data" }, { value: "pending-data", label: "Pending data" }, { value: "captured", label: "Captured data" }]} />
          ) : null}
          <Button
            title="Delete"
            variant="danger"
            icon="trash-outline"
            disabled={!value}
            onPress={() => {
              const opt = field?.options.find((o) => o.name === value);
              const label = value === "__all__" ? allValuesLabel(field?.label ?? "Field") : value;
              const classSection = value === "__all__" ? undefined : value;
              const fieldKey = value === "__all__" ? undefined : opt?.key || field?.key;
              if (mode === "photos") onChoose({ kind: "photos", classSection, fieldKey, photoScope: "all", label: `Delete photos for ${label}` });
              else
                onChoose({
                  kind: "data",
                  classSection,
                  fieldKey,
                  dataScope: dataScope === "all" ? undefined : (dataScope as DeleteJob["dataScope"]),
                  label: `Delete ${dataScope === "pending-data" ? "pending" : dataScope} data for ${label}`,
                });
            }}
          />
        </>
      )}
    </Sheet>
  );
}

function Choice({ title, count, onPress, on, chevron, danger }: { title: string; count?: number; onPress: () => void; on?: boolean; chevron?: boolean; danger?: boolean }) {
  return (
    <Tap onPress={onPress} scaleTo={0.985} style={[st.choice, on && st.choiceOn]}>
      <Text style={[st.choiceText, danger && { color: C.danger }, on && { color: C.primaryDeep }]}>{title}</Text>
      {count !== undefined ? <Text style={st.count}>{count}</Text> : null}
      {chevron ? <Ionicons name="chevron-forward" size={16} color={C.faint} /> : on ? <Ionicons name="checkmark-circle" size={20} color={C.primary} /> : null}
    </Tap>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Tap onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: S.md }} hitSlop={8}>
      <Ionicons name="chevron-back" size={16} color={C.accentDeep} />
      <Text style={{ fontFamily: F.bodySemi, color: C.accentDeep }}>Back</Text>
    </Tap>
  );
}

const st = StyleSheet.create({
  label: { fontFamily: F.bodySemi, fontSize: 13, color: C.text, marginBottom: 6 },
  date: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line, borderRadius: R.md, paddingHorizontal: S.md, minHeight: 50 },
  dateText: { flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink },
  drop: { alignItems: "center", gap: 6, padding: S.xl, borderRadius: R.lg, borderWidth: 2, borderStyle: "dashed", borderColor: C.primaryLight, backgroundColor: C.primarySoft, marginBottom: S.md },
  dropTitle: { fontFamily: F.hSemi, fontSize: 15, color: C.ink, textAlign: "center" },
  errBox: { backgroundColor: C.white, borderRadius: R.md, padding: S.md, marginBottom: S.md, borderWidth: 1, borderColor: C.line, gap: 2 },
  errTitle: { fontFamily: F.hSemi, fontSize: 14, color: C.ink, marginBottom: 4 },
  bar: { height: 8, borderRadius: 4, backgroundColor: C.line, overflow: "hidden", marginTop: -4 },
  barFill: { height: 8, borderRadius: 4, backgroundColor: C.primary },
  choice: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: C.white, borderRadius: R.md, paddingVertical: 14, paddingHorizontal: S.md, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  choiceOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  choiceText: { flex: 1, fontFamily: F.bodySemi, fontSize: 14, color: C.ink },
  count: { fontFamily: F.bodySemi, fontSize: 12, color: C.muted, backgroundColor: C.primarySoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: "hidden" },
  group: { fontFamily: F.bodySemi, fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
});
