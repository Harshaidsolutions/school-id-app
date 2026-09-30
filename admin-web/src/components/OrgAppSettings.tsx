import { useEffect, useState } from "react";
import axios from "axios";
import api from "../api/client";
import type { ApiErrorBody } from "../types";

export function OrgAppSettings({
  orgId,
  institute,
  initialAllowNumberEdit,
  initialAllowRecordEdit,
  initialShowCaptured,
}: {
  orgId: string;
  institute: boolean;
  initialAllowNumberEdit: boolean;
  initialAllowRecordEdit: boolean;
  initialShowCaptured: boolean;
}) {
  const [allowNumberEdit, setAllowNumberEdit] = useState(initialAllowNumberEdit);
  const [allowRecordEdit, setAllowRecordEdit] = useState(initialAllowRecordEdit);
  const [showCaptured, setShowCaptured] = useState(initialShowCaptured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setAllowNumberEdit(initialAllowNumberEdit);
    setAllowRecordEdit(initialAllowRecordEdit);
    setShowCaptured(initialShowCaptured);
  }, [initialAllowNumberEdit, initialAllowRecordEdit, initialShowCaptured, orgId]);

  async function save(next: {
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

  return (
    <div className="centered-page-card mt-6 overflow-hidden">
      {error ? <div className="alert-error mx-5 mt-3">{error}</div> : null}
      {saved ? <div className="alert-success mx-5 mt-3">{saved}</div> : null}
      <div className="divide-y divide-border">
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
                void save({ allowNumberEdit, allowRecordEdit: next, showCaptured });
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
                void save({ allowNumberEdit, allowRecordEdit, showCaptured: next });
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
