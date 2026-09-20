import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import axios from "axios";
import api from "../api/client";
import type { ApiErrorBody, Student } from "../types";
import type { FormFieldConfig } from "../constants/formFields";
import { activeFormFields } from "../utils/formFieldHelpers";

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
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(student.photo_url);

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
    setPhotoPreview(student.photo_url);
  }, [student]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

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

    setUploadingPhoto(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      const { data } = await api.post<{ student: Student }>(
        `/admin/students/${student.id}/photo`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setPhotoPreview(data.student.photo_url);
      onSaved(data.student);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to upload photo.");
      } else setError("Failed to upload photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const payload: Record<string, string | null> = {
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
      extraFields[field.key] = fieldValue(field.key).trim() || null;
    }
    const requestBody: Record<string, unknown> = {
      ...payload,
      extra_fields: extraFields,
    };
    for (const field of fields) {
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
      onClick={onClose}
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
              <label className="btn-secondary inline-block cursor-pointer">
                {uploadingPhoto ? "Uploading…" : photoPreview ? "Replace Photo" : "Upload Photo"}
                <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => void handlePhotoChange(e)} disabled={uploadingPhoto} />
              </label>
            </div>

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
