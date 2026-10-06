import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import axios from "axios";
import api from "../api/client";
import type { ApiErrorBody, Student } from "../types";
import type { FormFieldConfig } from "../constants/formFields";
import { activeFormFields } from "../utils/formFieldHelpers";
import {
  authenticatedStudentPhotoUrl,
  invalidateStudentPhotoCache,
} from "../utils/studentPhotoSrc";

const GENDER_OPTIONS = ["Male", "Female", "Other"] as const;
const BLOOD_GROUP_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export function EditStudentModal({
  student,
  formFields,
  classOptions,
  onClose,
  onSaved,
}: {
  student: Student;
  formFields: FormFieldConfig[];
  classOptions: string[];
  onClose: () => void;
  onSaved: (updated: Student) => void;
}) {
  const fields = useMemo(() => activeFormFields(formFields), [formFields]);
  const numberField = fields.find(field => field.key === "photo_id" || /^(id|photoid|photonumber|photono|photoidnumber)$/.test(field.label.toLowerCase().replace(/[^a-z0-9]/g, "")));
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(student.photo_url);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(student.signature_url ?? null);
  const [uploadingSignature, setUploadingSignature] = useState(false);

  useEffect(() => {
    const next: Record<string, string> = {
      student_name: student.student_name ?? "",
      class_section: student.class_section ?? "",
      roll_no: student.roll_no ?? "",
      dob: student.dob?.slice(0, 10) ?? "",
      gender: student.gender ?? "",
      blood_group: student.blood_group ?? "",
      parent_name: student.parent_name ?? "",
      parent_phone: student.parent_phone ?? "",
      address: student.address ?? "",
      photo_id: student.photo_id ?? "",
      custom_1: student.custom_1 ?? "",
      custom_2: student.custom_2 ?? "",
      custom_3: student.custom_3 ?? "",
    };
    if (student.extra_fields && typeof student.extra_fields === "object") {
      for (const [key, value] of Object.entries(student.extra_fields)) {
        next[key] = value ?? "";
      }
    }
    setValues(next);
    setSignaturePreview(student.signature_url ?? null);
  }, [student]);

  useEffect(() => {
    if (!student.photo_url) {
      setPhotoPreview(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    void authenticatedStudentPhotoUrl(student.id, {
      signal: controller.signal,
      version: student.updated_at,
    }).then((url) => {
      if (!cancelled && url) setPhotoPreview(url);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [student.id, student.photo_url, student.updated_at]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function fieldValue(key: string): string {
    return values[key] ?? "";
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError("Photo must be a JPG or PNG under 10MB.");
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPhotoPreview(localUrl);
    setUploadingPhoto(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      const { data } = await api.post<{ student: Student }>(
        `/admin/students/${student.id}/photo`,
        form
      );
      invalidateStudentPhotoCache(student.id);
      onSaved(data.student);
    } catch (err) {
      URL.revokeObjectURL(localUrl);
      void authenticatedStudentPhotoUrl(student.id, { version: student.updated_at }).then((url) => {
        setPhotoPreview(url);
      });
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to upload photo.");
      } else setError("Failed to upload photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSignatureChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingSignature(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("signature", file);
      const { data } = await api.post<{ student: Student }>(
        `/admin/students/${student.id}/signature`,
        form
      );
      setSignaturePreview(data.student.signature_url ?? null);
      onSaved(data.student);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to upload signature.");
      } else setError("Failed to upload signature.");
    } finally {
      setUploadingSignature(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const payload: Record<string, string | null> = {
      photo_id: fieldValue(numberField?.key ?? "photo_id").trim() || null,
      student_name: fieldValue("student_name").trim(),
      class_section: fieldValue("class_section").trim(),
      roll_no: fieldValue("roll_no").trim() || null,
      dob: fieldValue("dob") || null,
      gender: fieldValue("gender") || null,
      blood_group: fieldValue("blood_group") || null,
      parent_name: fieldValue("parent_name").trim() || null,
      parent_phone: fieldValue("parent_phone").trim() || null,
      address: fieldValue("address").trim() || null,
      custom_1: fieldValue("custom_1").trim() || null,
      custom_2: fieldValue("custom_2").trim() || null,
      custom_3: fieldValue("custom_3").trim() || null,
    };

    const extraFields: Record<string, string | null> = {};
    for (const field of fields) {
      if (field.key === "signature_upload") continue;
      extraFields[field.key] = fieldValue(field.key).trim() || null;
    }
    const requestBody: Record<string, unknown> = {
      ...payload,
      extra_fields: extraFields,
    };
    for (const field of fields) {
      if (field.key === "signature_upload") continue;
      requestBody[field.key] = fieldValue(field.key).trim() || null;
    }

    try {
      const { data } = await api.put<{ student: Student }>(
        `/admin/students/${student.id}`,
        requestBody
      );
      onSaved(data.student ?? { ...student, ...payload });
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to save student.");
      } else {
        setError("Failed to save student.");
      }
    } finally {
      setLoading(false);
    }
  }

  const classes = Array.from(
    new Set([fieldValue("class_section"), ...classOptions].filter(Boolean))
  ).sort();

  function renderField(field: FormFieldConfig) {
    const label = field.label;
    const key = field.key;

    if (key === "class_section") {
      return (
        <label key={key} className="block text-sm">
          <span className="mb-1 block font-medium text-text-navy">{label} *</span>
          <select
            required
            value={fieldValue(key)}
            onChange={(e) => setField(key, e.target.value)}
            className="input-field"
          >
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (key === "gender") {
      return (
        <label key={key} className="block text-sm">
          <span className="mb-1 block font-medium text-text-navy">{label}</span>
          <select value={fieldValue(key)} onChange={(e) => setField(key, e.target.value)} className="input-field">
            <option value="">Select gender</option>
            {GENDER_OPTIONS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
      );
    }

    if (key === "blood_group") {
      return (
        <label key={key} className="block text-sm">
          <span className="mb-1 block font-medium text-text-navy">{label}</span>
          <select value={fieldValue(key)} onChange={(e) => setField(key, e.target.value)} className="input-field">
            <option value="">Select blood group</option>
            {BLOOD_GROUP_OPTIONS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
      );
    }

    if (key === "dob") {
      return (
        <label key={key} className="block text-sm">
          <span className="mb-1 block font-medium text-text-navy">{label}</span>
          <input type="date" value={fieldValue(key)} onChange={(e) => setField(key, e.target.value)} className="input-field" />
        </label>
      );
    }

    if (key === "address") {
      return (
        <label key={key} className="block text-sm">
          <span className="mb-1 block font-medium text-text-navy">{label}</span>
          <textarea rows={2} value={fieldValue(key)} onChange={(e) => setField(key, e.target.value)} className="input-field" />
        </label>
      );
    }

    if (key === "student_name") {
      return (
        <label key={key} className="block text-sm">
          <span className="mb-1 block font-medium text-text-navy">{label} *</span>
          <input required value={fieldValue(key)} onChange={(e) => setField(key, e.target.value)} className="input-field" />
        </label>
      );
    }

    if (key === "signature_upload") {
      return (
        <div key={key} className="block text-sm">
          <span className="mb-1 block font-medium text-text-navy">{label}</span>
          {signaturePreview ? (
            <img
              src={signaturePreview}
              alt="Signature"
              className="mb-2 h-16 w-full rounded-lg bg-white object-contain"
            />
          ) : null}
          <label className="relative flex h-10 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-white px-3 text-sm font-semibold text-text-navy">
            {uploadingSignature ? "Uploading…" : "Choose File"}
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="absolute inset-0 cursor-pointer opacity-0"
              disabled={uploadingSignature}
              onChange={(event) => void handleSignatureChange(event)}
            />
          </label>
        </div>
      );
    }

    if (key === "photo_id") {
      return (
        <label key={key} className="block text-sm">
          <span className="mb-1 block font-medium text-text-navy">{label}</span>
          <input value={fieldValue(key)} onChange={(e) => setField(key, e.target.value)} className="input-field" />
        </label>
      );
    }

    return (
      <label key={key} className="block text-sm">
        <span className="mb-1 block font-medium text-text-navy">{label}</span>
        <input value={fieldValue(key)} onChange={(e) => setField(key, e.target.value)} className="input-field" />
      </label>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-border px-5 py-4 text-center">
          <h2 className="page-heading text-lg">Edit Student</h2>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="rounded-xl border border-border bg-content-bg/50 p-4 text-center">
              <p className="mb-3 text-sm font-medium text-text-navy">Photo</p>
              {photoPreview ? (
                <img src={photoPreview} alt="Student" className="mx-auto mb-3 h-28 w-28 rounded-lg object-cover ring-2 ring-border" />
              ) : (
                <div className="mx-auto mb-3 flex h-28 w-28 items-center justify-center rounded-lg bg-content-bg text-sm text-text-muted">
                  No photo
                </div>
              )}
              <label className="btn-secondary relative inline-block cursor-pointer">
                {uploadingPhoto ? "Uploading…" : photoPreview ? "Replace Photo" : "Upload Photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => void handlePhotoChange(e)}
                  disabled={uploadingPhoto}
                />
              </label>
            </div>

            {!numberField && <label className="block text-sm"><span className="mb-1 block font-medium">Photo Number</span><input className="input-field" value={fieldValue("photo_id")} onChange={event => setField("photo_id", event.target.value)} /></label>}
            {fields.length === 0 ? (
              <p className="text-sm text-text-muted">No Excel fields configured.</p>
            ) : (
              fields.map((field) => renderField(field))
            )}

            {error && <div className="alert-error">{error}</div>}
          </div>

          <div className="flex shrink-0 gap-2 border-t border-border px-5 py-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={loading || fields.length === 0} className="btn-primary flex-1">
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
