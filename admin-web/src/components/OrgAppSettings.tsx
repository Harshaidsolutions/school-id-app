import { useEffect, useState } from "react";
import axios from "axios";
import api from "../api/client";
import type { ApiErrorBody } from "../types";
import type { FormFieldConfig } from "../constants/formFields";

export function OrgAppSettings({
  orgId,
  institute,
  initialVisibility,
  initialAllowNumberEdit,
  initialAllowRecordEdit,
  initialShowCaptured,
}: {
  orgId: string;
  institute: boolean;
  initialVisibility: Record<string, boolean>;
  initialAllowNumberEdit: boolean;
  initialAllowRecordEdit: boolean;
  initialShowCaptured: boolean;
}) {
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [allowNumberEdit, setAllowNumberEdit] = useState(initialAllowNumberEdit);
  const [allowRecordEdit, setAllowRecordEdit] = useState(initialAllowRecordEdit);
  const [showCaptured, setShowCaptured] = useState(initialShowCaptured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setVisibility(initialVisibility);
    setAllowNumberEdit(initialAllowNumberEdit);
    setAllowRecordEdit(initialAllowRecordEdit);
    setShowCaptured(initialShowCaptured);
  }, [initialVisibility, initialAllowNumberEdit, initialAllowRecordEdit, initialShowCaptured, orgId]);

  useEffect(() => {
    let cancelled = false;
    const params = institute ? { instituteId: orgId } : { schoolId: orgId };
    void api
      .get<{ fields: FormFieldConfig[] }>("/admin/form-config", { params })
      .then(({ data }) => {
        if (!cancelled) setFields(data.fields ?? []);
      })
      .catch(() => {
        if (!cancelled) setFields([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, institute]);

  async function save(next: {
    visibility: Record<string, boolean>;
    allowNumberEdit: boolean;
    allowRecordEdit: boolean;
    showCaptured: boolean;
  }) {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const path = institute
        ? `/admin/institutes/${orgId}/app-settings`
        : `/admin/schools/${orgId}/app-settings`;
      await api.patch(path, {
        field_visibility: next.visibility,
        allow_number_edit: next.allowNumberEdit,
        allow_record_edit: next.allowRecordEdit,
        show_captured_section: next.showCaptured,
      });
      setSaved("Saved for this organization.");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Could not save settings.");
      } else setError("Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  function toggleField(key: string, on: boolean) {
    const next = { ...visibility, [key]: on };
    setVisibility(next);
    void save({ visibility: next, allowNumberEdit, allowRecordEdit, showCaptured });
  }

  const rows = fields.filter(
    (field) => field.enabled !== false && field.key !== "photo" && field.key !== "photo_id"
  );

  return (
    <div className="centered-page-card mt-6 overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-text-navy">Required Details</h2>
      </div>
      {error ? <div className="alert-error mx-5 mt-3">{error}</div> : null}
      {saved ? <div className="alert-success mx-5 mt-3">{saved}</div> : null}
      <div className="divide-y divide-border">
        {rows.map((field) => {
          const on = visibility[field.key] !== false;
          return (
            <label
              key={field.key}
              className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
            >
              <span className="font-medium text-text-navy">{field.label}</span>
              <span className="flex items-center gap-2 text-text-muted">
                {on ? "ON" : "OFF"}
                <input
                  type="checkbox"
                  role="switch"
                  checked={on}
                  disabled={saving}
                  onChange={(e) => toggleField(field.key, e.target.checked)}
                  className="h-4 w-4"
                />
              </span>
            </label>
          );
        })}
        <label className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
          <span className="font-medium text-text-navy">Edit Form</span>
          <span className="flex items-center gap-2 text-text-muted">
            {allowRecordEdit ? "ON" : "OFF"}
            <input
              type="checkbox"
              role="switch"
              checked={allowRecordEdit}
              disabled={saving}
              onChange={(e) => {
                const next = e.target.checked;
                setAllowRecordEdit(next);
                void save({ visibility, allowNumberEdit, allowRecordEdit: next, showCaptured });
              }}
              className="h-4 w-4"
            />
          </span>
        </label>
        <label className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
          <span className="font-medium text-text-navy">Captured Section</span>
          <span className="flex items-center gap-2 text-text-muted">
            {showCaptured ? "ON" : "OFF"}
            <input
              type="checkbox"
              role="switch"
              checked={showCaptured}
              disabled={saving}
              onChange={(e) => {
                const next = e.target.checked;
                setShowCaptured(next);
                void save({ visibility, allowNumberEdit, allowRecordEdit, showCaptured: next });
              }}
              className="h-4 w-4"
            />
          </span>
        </label>
      </div>
      {saving ? <p className="px-5 py-3 text-xs text-text-muted">Saving…</p> : null}
    </div>
  );
}
