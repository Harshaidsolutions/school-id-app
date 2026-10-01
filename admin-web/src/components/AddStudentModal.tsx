import { useEffect, useMemo, useState, type FormEvent } from "react";
import axios from "axios";
import api from "../api/client";
import type { ApiErrorBody, Student } from "../types";
import type { FormFieldConfig } from "../constants/formFields";
import {
  activeFormFields,
  findClassField,
  findStudentNameField,
} from "../utils/formFieldHelpers";

const GENDER_OPTIONS = ["Male", "Female", "Other"] as const;
const BLOOD_GROUP_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export function AddStudentModal({
  open,
  onClose,
  schoolId,
  instituteId,
  formFields,
  classOptions,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  schoolId?: string;
  instituteId?: string;
  formFields: FormFieldConfig[];
  classOptions: string[];
  onCreated: (student: Student) => void;
}) {
  const fields = useMemo(() => activeFormFields(formFields), [formFields]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues({});
    setError(null);
    setPhotoFile(null);
    setPhotoPreview(null);
    setSignatureFile(null);
    setSignaturePreview(null);
  }, [open, formFields]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    if (!signatureFile) {
      setSignaturePreview(null);
      return;
    }
    const url = URL.createObjectURL(signatureFile);
    setSignaturePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [signatureFile]);

  if (!open) return null;

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function fieldValue(key: string): string {
    return values[key] ?? "";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const nameField = findStudentNameField(fields);
    const classField = findClassField(fields);
    if (nameField && !fieldValue(nameField.key).trim()) {
      setError(`${nameField.label} is required.`);
      return;
    }
    if (classField && !fieldValue(classField.key).trim()) {
      setError(`${classField.label} is required.`);
      return;
    }

    if (
      photoFile &&
      (!["image/jpeg", "image/png"].includes(photoFile.type) ||
        photoFile.size > 10 * 1024 * 1024)
    ) {
      setError("Photo must be a JPG or PNG under 10MB.");
      return;
    }
    if (
      signatureFile &&
      (!["image/jpeg", "image/png"].includes(signatureFile.type) ||
        signatureFile.size > 10 * 1024 * 1024)
    ) {
      setError("Signature must be a JPG or PNG under 10MB.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const nameRaw = nameField ? fieldValue(nameField.key).trim() : "";
      const nameParts = nameRaw.split(/\s+/);
      const extraFields: Record<string, string | null> = {};
      const payload: Record<string, unknown> = {
        firstName: nameParts[0] ?? "",
        lastName: nameParts.slice(1).join(" "),
        studentName: nameRaw || undefined,
        classSection: classField ? fieldValue(classField.key).trim() || undefined : undefined,
        schoolId: schoolId || undefined,
        instituteId: instituteId || undefined,
      };

      for (const field of fields) {
        if (field.key === "signature_upload") continue;
        const value = fieldValue(field.key).trim();
        extraFields[field.key] = value || null;
        payload[field.key] = value || undefined;
      }
      payload.extra_fields = extraFields;

      const { data } = await api.post<{ student: Student }>("/admin/students", payload);
      let student = data.student;
      if (signatureFile) {
        try {
          const form = new FormData();
          form.append("signature", signatureFile);
          const uploaded = await api.post<{ student: Student }>(
            `/admin/students/${student.id}/signature`,
            form,
            { headers: { "Content-Type": "multipart/form-data" } }
          );
          student = uploaded.data.student ?? student;
        } catch (err) {
          onCreated(student);
          if (axios.isAxiosError(err)) {
            const body = err.response?.data as ApiErrorBody | undefined;
            setError(body?.message ?? "Record saved, but the signature could not be uploaded.");
          } else {
            setError("Record saved, but the signature could not be uploaded.");
          }
          return;
        }
      }
      if (photoFile) {
        try {
          const form = new FormData();
          form.append("photo", photoFile);
          const uploaded = await api.post<{ student: Student }>(
            `/admin/students/${student.id}/photo`,
            form,
            { headers: { "Content-Type": "multipart/form-data" } }
          );
          student = uploaded.data.student ?? student;
        } catch (err) {
          onCreated(student);
          if (axios.isAxiosError(err)) {
            const body = err.response?.data as ApiErrorBody | undefined;
            setError(body?.message ?? "Record saved, but the photo could not be uploaded.");
          } else {
            setError("Record saved, but the photo could not be uploaded.");
          }
          return;
        }
      }
      onCreated(student);
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to add student.");
      } else setError("Failed to add student.");
    } finally {
      setSaving(false);
    }
  }

  function renderField(field: FormFieldConfig) {
    const label = field.label;
    const key = field.key;

    if (key === "class_section") {
      return (
        <label key={key} className="block text-sm">
          <span className="mb-1.5 block font-medium text-text-navy">{label} *</span>
          {classOptions.length > 0 ? (
            <select
              required
              value={fieldValue(key)}
              onChange={(e) => setField(key, e.target.value)}
              className="input-field"
            >
              <option value="">Select class</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <input
              required
              value={fieldValue(key)}
              onChange={(e) => setField(key, e.target.value)}
              className="input-field"
            />
          )}
        </label>
      );
    }

    if (key === "gender") {
      return (
        <label key={key} className="block text-sm">
          <span className="mb-1.5 block font-medium text-text-navy">{label}</span>
          <select value={fieldValue(key)} onChange={(e) => setField(key, e.target.value)} className="input-field">
            <option value="">Select gender</option>
            {GENDER_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (key === "blood_group") {
      return (
        <label key={key} className="block text-sm">
          <span className="mb-1.5 block font-medium text-text-navy">{label}</span>
          <select value={fieldValue(key)} onChange={(e) => setField(key, e.target.value)} className="input-field">
            <option value="">Select blood group</option>
            {BLOOD_GROUP_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (key === "dob") {
      return (
        <label key={key} className="block text-sm">
          <span className="mb-1.5 block font-medium text-text-navy">{label}</span>
          <input
            type="date"
            value={fieldValue(key)}
            onChange={(e) => setField(key, e.target.value)}
            className="input-field"
          />
        </label>
      );
    }

    if (key === "address") {
      return (
        <label key={key} className="block text-sm">
          <span className="mb-1.5 block font-medium text-text-navy">{label}</span>
          <textarea
            rows={3}
            value={fieldValue(key)}
            onChange={(e) => setField(key, e.target.value)}
            className="input-field"
          />
        </label>
      );
    }

    if (key === "signature_upload") {
      return (
        <div key={key} className="text-sm">
          <span className="mb-1.5 block font-medium text-text-navy">{label}</span>
          {signaturePreview ? (
            <img
              src={signaturePreview}
              alt="Selected signature"
              className="mb-2 h-20 w-full rounded-lg object-contain"
            />
          ) : null}
          <label className="group relative flex h-10 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-white px-3 text-sm font-semibold text-text-navy hover:border-button-blue/40 hover:bg-blue-soft/30">
            {signatureFile ? signatureFile.name : "Choose File"}
            <input
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => setSignatureFile(e.target.files?.[0] ?? null)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          {signatureFile ? (
            <button
              type="button"
              className="mt-1 text-xs font-semibold text-danger"
              onClick={() => setSignatureFile(null)}
            >
              Remove signature
            </button>
          ) : (
            <p className="mt-1 text-xs text-text-muted">JPG or PNG, up to 10MB.</p>
          )}
        </div>
      );
    }

    if (key === "student_name") {
      return (
        <label key={key} className="block text-sm">
          <span className="mb-1.5 block font-medium text-text-navy">{label} *</span>
          <input
            required
            value={fieldValue(key)}
            onChange={(e) => setField(key, e.target.value)}
            className="input-field"
          />
        </label>
      );
    }

    return (
      <label key={key} className="block text-sm">
        <span className="mb-1.5 block font-medium text-text-navy">{label}</span>
        <input value={fieldValue(key)} onChange={(e) => setField(key, e.target.value)} className="input-field" />
      </label>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="page-heading text-xl">{instituteId ? "Add Member" : "Add Student"}</h2>
        {fields.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">Upload Excel first to configure form fields.</p>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
            <div className="text-sm">
              <span className="mb-1.5 block font-medium text-text-navy">Photo</span>
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Selected photo"
                  className="mb-2 h-28 w-24 rounded-lg object-cover"
                />
              ) : null}
              <label className="group relative flex h-10 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-white px-3 text-sm font-semibold text-text-navy hover:border-button-blue/40 hover:bg-blue-soft/30">
                {photoFile ? photoFile.name : "Choose File"}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              {photoFile ? (
                <button
                  type="button"
                  className="mt-1 text-xs font-semibold text-danger"
                  onClick={() => setPhotoFile(null)}
                >
                  Remove photo
                </button>
              ) : (
                <p className="mt-1 text-xs text-text-muted">Optional. JPG or PNG, up to 10MB.</p>
              )}
            </div>
            {fields.map((field) => renderField(field))}
            {error && <div className="alert-error">{error}</div>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? "Saving…" : instituteId ? "Add Member" : "Add Student"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
