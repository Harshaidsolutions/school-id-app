import { ToggleSwitch } from "./ui/ToggleSwitch";
import { useEffect, useState } from "react";
import axios from "axios";
import api from "../api/client";
import type { ApiErrorBody } from "../types";

export function OrgAppSettings({
  orgId,
  institute,
  organization = false,
  initialAllowNumberEdit,
  initialAllowRecordEdit,
  initialShowCaptured,
}: {
  orgId: string;
  institute: boolean;
  organization?: boolean;
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
    const previous = {allowNumberEdit, allowRecordEdit, showCaptured};
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const path = organization ? `/admin/organizations/${orgId}/details` : institute
        ? `/admin/institutes/${orgId}/app-settings`
        : `/admin/schools/${orgId}/app-settings`;
      await api.patch(path, organization ? {field_visibility: {allow_record_edit: next.allowRecordEdit, show_captured_section: next.showCaptured}} : {
        allow_number_edit: next.allowNumberEdit,
        allow_record_edit: next.allowRecordEdit,
        show_captured_section: next.showCaptured,
      });
      setSaved("Saved for this organization.");
    } catch (err) {
      setAllowNumberEdit(previous.allowNumberEdit); setAllowRecordEdit(previous.allowRecordEdit); setShowCaptured(previous.showCaptured);
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Could not save settings.");
      } else setError("Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  const options = [
    {
      key: "edit",
      title: "Edit Form",
      description: "Teachers can open saved records in the school app and correct details or retake photos.",
      on: allowRecordEdit,
      icon: (
        <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 6.5l3 3" />
      ),
      toggle: () => {
        const next = !allowRecordEdit;
        setAllowRecordEdit(next);
        void save({ allowNumberEdit, allowRecordEdit: next, showCaptured });
      },
    },
    {
      key: "captured",
      title: "Captured Section",
      description: "Shows the list of already captured students / members in the school app.",
      on: showCaptured,
      icon: (
        <>
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <circle cx="12" cy="13" r="3.2" />
        </>
      ),
      toggle: () => {
        const next = !showCaptured;
        setShowCaptured(next);
        void save({ allowNumberEdit, allowRecordEdit, showCaptured: next });
      },
    },
  ];

  return (
    <section className="centered-page-card org-settings mt-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-[#EEF0FF] to-[#F3EEFF] px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-text-navy">School app settings</h2>
          <p className="text-xs text-text-muted">Controls what teachers can do in the My School ID Card app for this {organization ? "organization" : institute ? "institute" : "school"}.</p>
        </div>
        <span
          role="status"
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            saving ? "bg-white text-text-muted" : error ? "bg-danger-soft text-danger" : saved ? "bg-[#E6F7F5] text-[#0D9488]" : "bg-white/70 text-text-muted"
          }`}
        >
          {saving ? "Saving…" : error ? "Not saved" : saved ? "Saved ✓" : "Changes save instantly"}
        </span>
      </div>
      {error ? <div className="alert-error mx-5 mt-4">{error}</div> : null}
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        {options.map((option) => (
          <div
            key={option.key}
            className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
              option.on ? "border-[#C7D2FE] bg-[#F7F7FF]" : "border-border bg-white"
            }`}
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                option.on ? "bg-[#4F46E5] text-white" : "bg-[#F4F3FF] text-[#77759A]"
              }`}
              aria-hidden
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {option.icon}
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-text-navy">{option.title}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    option.on ? "bg-[#E6F7F5] text-[#0D9488]" : "bg-[#F7F7FC] text-[#77759A]"
                  }`}
                >
                  {option.on ? "ON" : "OFF"}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{option.description}</p>
            </div>
            <ToggleSwitch checked={option.on} disabled={saving} onChange={option.toggle} label={option.title} />
          </div>
        ))}
      </div>
    </section>
  );
}
