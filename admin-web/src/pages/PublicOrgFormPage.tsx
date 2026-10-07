import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import type { ApiErrorBody } from "../types";

type PublicField = {
  id: string;
  fieldName: string;
  fieldType: string;
  required: boolean;
};

export function PublicOrgFormPage({ school = false }: {school?:boolean}) {
  const { token = "" } = useParams();
  const endpoint = `/public/${school ? "school" : "org"}-forms/${token}`;
  const [organizationName, setOrganizationName] = useState("");
  const [fields, setFields] = useState<PublicField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.get<{ organizationName: string; fields: PublicField[] }>(endpoint)
      .then(({ data }) => {
        setOrganizationName(data.organizationName);
        setFields(data.fields);
      })
      .catch((err) => setError(messageOf(err, "This form is not available.")))
      .finally(() => setLoading(false));
  }, [token, school]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const body = new FormData();
      for (const field of fields) {
        if (field.fieldType === "photo") {
          const file = files[field.id];
          if (file) body.append(field.id, file);
        } else {
          body.append(field.id, values[field.id] ?? "");
        }
      }
      await api.post(endpoint, body);
      setDone(true);
    } catch (err) {
      setError(messageOf(err, "Could not submit the form."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8">
      <div className="w-full rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-[#4f46e5]">{organizationName || (school ? "School student form" : "Organization form")}</h1>
        {loading ? <p className="mt-4 text-sm text-text-muted">Loading…</p> : null}
        {done ? <p className="mt-4 text-sm font-medium text-[#16A34A]">Submitted successfully. Your details have been sent to the {school ? "school" : "organization"}.</p> : null}
        {!loading && !done ? (
          <form className="mt-4 space-y-4" onSubmit={(event) => void submit(event)}>
            {fields.map((field) => (
              <label key={field.id} className="block text-sm">
                <span className="mb-1.5 block font-medium">{field.fieldName}{field.required ? " *" : ""}</span>
                {field.fieldType === "photo" ? (
                  <input
                    required={field.required}
                    type="file"
                    accept="image/jpeg,image/png"
                    className="input-field"
                    onChange={(event) => setFiles((current) => ({ ...current, [field.id]: event.target.files?.[0] ?? null }))}
                  />
                ) : (
                  <input
                    required={field.required}
                    className="input-field"
                    value={values[field.id] ?? ""}
                    onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                  />
                )}
              </label>
            ))}
            {error ? <div className="alert-error">{error}</div> : null}
            <button type="submit" className="btn-primary w-full" disabled={saving || fields.length === 0}>{saving ? "Submitting…" : "Submit"}</button>
          </form>
        ) : null}
        {!loading && error && fields.length === 0 ? <div className="alert-error mt-4">{error}</div> : null}
      </div>
    </div>
  );
}

function messageOf(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    return body?.message ?? fallback;
  }
  return fallback;
}
