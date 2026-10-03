import { useMemo, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import { OtpConfirmModal } from "../components/OtpConfirmModal";
import { PageActions } from "../components/ui/PageActions";
import { SearchInput } from "../components/ui/SearchInput";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import type { ApiErrorBody } from "../types";
import { formatCalendarDate } from "../utils/formatCalendarDate";

type OrganizationRow = {
  id: string;
  name: string;
  phone: string | null;
  username: string | null;
  password: string | null;
  is_active: boolean;
  allow_screenshot?: boolean;
  allow_screen_recording?: boolean;
  created_at: string;
};

type FormField = {
  id: string;
  field_name: string;
  field_type: string;
};

type DraftField = {
  fieldName: string;
  fieldType: "text" | "photo";
};

type SubmissionRow = {
  id: string;
  serial: number;
  photoCropped?: boolean;
  values: Record<string, { text: string | null; hasPhoto: boolean }>;
};

export function OrganizationPortalPage() {
  const [rows, setRows] = useState<OrganizationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<OrganizationRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizationRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.name, row.username, row.phone, row.password].some((value) =>
        (value ?? "").toLowerCase().includes(query)
      )
    );
  }, [rows, search]);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<{ organizations: OrganizationRow[] }>("/admin/organizations");
      setRows(data.organizations);
      setError(null);
    } catch (err) {
      setError(messageOf(err, "Failed to load organizations."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleActive(row: OrganizationRow) {
    setTogglingId(row.id);
    try {
      const { data } = await api.patch<{ organization: { is_active: boolean } }>(
        `/admin/organizations/${row.id}/active`,
        { is_active: row.is_active === false }
      );
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, is_active: data.organization.is_active !== false } : item));
    } catch (err) {
      setError(messageOf(err, "Failed to update status."));
    } finally {
      setTogglingId(null);
    }
  }

  async function toggleCapture(row: OrganizationRow) {
    const protectedNow = row.allow_screenshot === false || row.allow_screen_recording === false;
    setCaptureId(row.id);
    try {
      const allow = protectedNow;
      const { data } = await api.patch<{ organization: { allow_screenshot: boolean; allow_screen_recording: boolean } }>(
        `/admin/organizations/${row.id}/capture`,
        { allow_screenshot: allow, allow_screen_recording: allow, screen_capture_protection: !allow }
      );
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, ...data.organization } : item));
    } catch (err) {
      setError(messageOf(err, "Failed to update capture protection."));
    } finally {
      setCaptureId(null);
    }
  }

  return (
    <div className="app-page school-list-page admin-scroll-root">
      <PageActions
        search={<SearchInput value={search} onChange={setSearch} placeholder="Search organizations…" />}
        actions={<button type="button" className="btn-primary" onClick={() => setOpen(true)}>Add Organization</button>}
      />
      {error ? <div className="alert-error">{error}</div> : null}
      <div className="card list-table-scroll school-list-table-panel admin-scroll-panel">
        <table className="list-data-table">
          <thead>
            <tr>
              <th className="w-10">S.No</th>
              <th className="w-[22%]">Organization Name</th>
              <th className="hidden md:table-cell">Username</th>
              <th>Password</th>
              <th className="hidden lg:table-cell">Phone</th>
              <th className="hidden sm:table-cell">Created</th>
              <th>Status</th>
              <th>Captured</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td className="px-4 py-8 text-center text-text-muted" colSpan={9}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="px-4 py-8 text-center text-text-muted" colSpan={9}>No organizations yet.</td></tr>
            ) : filtered.map((row, index) => (
              <tr key={row.id} className="hover:bg-content-bg/50 align-top">
                <td className="text-text-muted">{index + 1}</td>
                <td className="font-medium text-text-navy">
                  <Link className="line-clamp-2 text-button-blue hover:underline" to={`/extra-2/${row.id}`}>{row.name}</Link>
                </td>
                <td className="hidden md:table-cell">{row.username || "—"}</td>
                <td className="font-mono text-xs sm:text-sm"><span className="break-all">{row.password || "—"}</span></td>
                <td className="hidden lg:table-cell">{row.phone || "—"}</td>
                <td className="hidden text-xs text-text-muted sm:table-cell">{formatCalendarDate(row.created_at)}</td>
                <td>
                  <ToggleSwitch checked={row.is_active !== false} disabled={togglingId === row.id} onChange={() => void toggleActive(row)} label={`${row.name} status`} />
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">Screen Capture Protection</span>
                    <ToggleSwitch
                      checked={row.allow_screenshot === false || row.allow_screen_recording === false}
                      disabled={captureId === row.id}
                      onChange={() => void toggleCapture(row)}
                      label={`${row.name} screen capture protection`}
                    />
                  </div>
                </td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" title="Edit" className="rounded p-1.5 text-text-muted hover:bg-content-bg hover:text-button-blue" onClick={() => setEditTarget(row)}>Edit</button>
                    <button type="button" title="Delete" className="rounded p-1.5 text-text-muted hover:bg-danger-soft hover:text-danger" onClick={() => setDeleteTarget(row)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? <AddOrganizationModal onClose={() => setOpen(false)} onCreated={() => { setOpen(false); void load(); }} /> : null}
      {editTarget ? <EditOrganizationModal organization={editTarget} onClose={() => setEditTarget(null)} onSaved={(updated) => { setRows((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item)); setEditTarget(null); }} /> : null}
      {deleteTarget ? (
        <OtpConfirmModal
          title="Delete organization"
          description={`Delete ${deleteTarget.name} and its forms?`}
          confirmLabel="Delete"
          onClose={() => setDeleteTarget(null)}
          onRequestOtp={async () => {
            const { data } = await api.post<{ message?: string; devOtp?: string }>(`/admin/organizations/${deleteTarget.id}/request-delete-otp`);
            return data;
          }}
          onConfirm={async (otp) => {
            await api.delete(`/admin/organizations/${deleteTarget.id}`, { data: { otp } });
            setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
            setDeleteTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}

export function OrganizationDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [drafts, setDrafts] = useState<DraftField[]>([{ fieldName: "", fieldType: "text" }]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "pending" | "captured" | "pending-data">("all");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [instructions, setInstructions] = useState("");
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [infoOpen, setInfoOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [photoFilter, setPhotoFilter] = useState<"any" | "yes" | "no">("any");
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [otpOpen, setOtpOpen] = useState(false);

  async function load() {
    const { data } = await api.get<{
      organization: {
        name: string;
        phone?: string | null;
        address?: string | null;
        instructions?: string | null;
        field_visibility?: Record<string, boolean> | null;
      };
      form: { link: string; fields: FormField[] } | null;
      submissions: SubmissionRow[];
    }>(`/admin/organizations/${id}`);
    setName(data.organization.name);
    setPhone(data.organization.phone ?? "");
    setAddress(data.organization.address ?? "");
    setInstructions(data.organization.instructions ?? "");
    setVisibility(data.organization.field_visibility ?? {});
    setLink(data.form?.link ?? null);
    setFields(data.form?.fields ?? []);
    setSubmissions(data.submissions ?? []);
  }

  useEffect(() => {
    void load().catch((err) => setError(messageOf(err, "Failed to open organization.")));
  }, [id]);

  async function createForm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const { data } = await api.post<{ form: { link: string; fields: FormField[] } }>(
        `/admin/organizations/${id}/forms`,
        { fields: drafts.filter((field) => field.fieldName.trim()) }
      );
      setLink(data.form.link);
      setFields(data.form.fields);
      setBuilding(false);
      setNotice("Link created.");
      await load();
    } catch (err) {
      setError(messageOf(err, "Failed to create the link."));
    }
  }

  const photoFields = fields.filter((field) => field.field_type === "photo");
  const textFields = fields.filter((field) => field.field_type !== "photo");
  function hasAllPhotos(row: SubmissionRow) {
    if (photoFields.length === 0) return false;
    return photoFields.every((field) => row.values[field.id]?.hasPhoto);
  }
  function missingData(row: SubmissionRow) {
    return textFields.some((field) => !(row.values[field.id]?.text ?? "").trim());
  }
  const counts = {
    all: submissions.length,
    pending: submissions.filter((row) => !hasAllPhotos(row)).length,
    captured: submissions.filter((row) => hasAllPhotos(row)).length,
    pendingData: submissions.filter((row) => missingData(row)).length,
  };
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return submissions.filter((row) => {
      const captured = hasAllPhotos(row);
      if (tab === "captured" && !captured) return false;
      if (tab === "pending" && captured) return false;
      if (tab === "pending-data" && !missingData(row)) return false;
      if (photoFilter === "yes" && !captured) return false;
      if (photoFilter === "no" && captured) return false;
      if (!query) return true;
      return fields.some((field) => (row.values[field.id]?.text ?? "").toLowerCase().includes(query));
    });
  }, [submissions, search, tab, fields, photoFields, textFields, photoFilter]);

  async function shareLink() {
    if (!link) return;
    if (navigator.share) {
      await navigator.share({ title: name, url: link });
      return;
    }
    await navigator.clipboard.writeText(link);
    setNotice("Link copied.");
  }

  async function uploadExcel(file: File) {
    const body = new FormData();
    body.append("file", file);
    await api.post(`/admin/organizations/${id}/excel`, body);
    setNotice("Excel uploaded.");
    await load();
  }

  async function downloadExcel() {
    const response = await api.get(`/admin/organizations/${id}/excel`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data as Blob);
    const linkNode = document.createElement("a");
    linkNode.href = url;
    linkNode.download = `${name || "organization"}-records.xlsx`;
    linkNode.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPhotos() {
    let saved = 0;
    for (const row of submissions) {
      for (const field of photoFields) {
        if (!row.values[field.id]?.hasPhoto) continue;
        const response = await api.get(`/admin/organizations/${id}/submissions/${row.id}/fields/${field.id}/photo`, { responseType: "blob" });
        const url = URL.createObjectURL(response.data as Blob);
        const linkNode = document.createElement("a");
        linkNode.href = url;
        linkNode.download = `${row.serial}-${field.field_name}.jpg`;
        linkNode.click();
        URL.revokeObjectURL(url);
        saved += 1;
      }
    }
    setNotice(saved > 0 ? `Downloaded ${saved} photo${saved === 1 ? "" : "s"}.` : "No photos to download.");
  }

  async function saveDetails() {
    await api.patch(`/admin/organizations/${id}/details`, {
      phone,
      address,
      instructions,
      fieldVisibility: visibility,
    });
    setNotice("Organization info saved.");
    setInfoOpen(false);
  }

  function openFields() {
    setDrafts(fields.length > 0 ? fields.map((field) => ({ fieldName: field.field_name, fieldType: field.field_type === "photo" ? "photo" : "text" })) : [{ fieldName: "", fieldType: "text" }]);
    setBuilding(true);
  }

  return (
    <div className="detail-page-shell admin-scroll-root">
      <button type="button" className="mb-4 text-sm font-semibold text-button-blue" onClick={() => navigate("/extra-2")}>← Organizations</button>
      <p className="mb-3 text-sm text-text-muted">{name}</p>
      <div className="detail-toolbar-shell">
        <div className="detail-toolbar-row1">
          <button type="button" className="detail-toolbar-btn" disabled={!id} onClick={openFields}>Form Setup</button>
          <button type="button" className="detail-toolbar-btn" disabled={!id || fields.length === 0} onClick={() => excelInputRef.current?.click()}>Upload Excel</button>
          <button type="button" className="detail-toolbar-btn" disabled={!id} onClick={() => void downloadExcel().catch((err) => setError(messageOf(err, "Failed to download Excel.")))}>Download Excel</button>
          <button type="button" className="detail-toolbar-btn" disabled={!id} onClick={() => void downloadPhotos().catch((err) => setError(messageOf(err, "Failed to download photos.")))}>Download Photos</button>
          <button type="button" className="detail-toolbar-btn" disabled={!id} onClick={() => setInfoOpen(true)}>Organization Info</button>
          <button type="button" className="detail-toolbar-btn" disabled={!id || submissions.length === 0} onClick={() => setSelecting(true)}>Delete Options</button>
          <button type="button" className="detail-toolbar-btn detail-feature-card detail-feature-card-short detail-toolbar-short-slot" disabled={!id} onClick={() => navigate(`/crop-tool?organizationId=${encodeURIComponent(id)}&organizationName=${encodeURIComponent(name)}`)}>
            <span className="detail-feature-label">CROPPING TOOL</span>
          </button>
          <div className="detail-toolbar-btn detail-toolbar-btn-placeholder detail-feature-card detail-feature-card-long detail-toolbar-long-slot">
            <span className="detail-feature-label">ID CARD GENERATOR</span>
          </div>
        </div>
        <div className="detail-toolbar-row2">
          <div className="detail-status-tabs-inline detail-toolbar-row2-tabs">
            {([
              ["all", "All", counts.all],
              ["pending", "Pending", counts.pending],
              ["captured", "Captured", counts.captured],
              ["pending-data", "Pending Data", counts.pendingData],
            ] as const).map(([key, label, count]) => (
              <button key={key} type="button" className={`detail-toolbar-status-tab ${tab === key ? "detail-toolbar-status-tab-active" : "detail-toolbar-status-tab-idle"}`} onClick={() => setTab(key)}>
                {label} ({count})
              </button>
            ))}
          </div>
          <div className="detail-toolbar-row2-search">
            <div className="relative min-w-0 flex-1">
              <input className="input-field w-full text-sm" placeholder="Search…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search" />
            </div>
          </div>
          <button type="button" className="btn-secondary detail-toolbar-row2-filter" onClick={() => setFilterOpen((open) => !open)}>Filter</button>
          <div className="detail-toolbar-row2-actions">
            {selecting ? (
              <button type="button" className="btn-primary shrink-0" disabled={selectedIds.size === 0} onClick={() => setOtpOpen(true)}>Bulk Delete</button>
            ) : (
              <button type="button" className="btn-secondary shrink-0" disabled={submissions.length === 0} onClick={() => setSelecting(true)}>Bulk Delete</button>
            )}
            {selecting ? (
              <button type="button" className="btn-secondary shrink-0" onClick={() => { setSelecting(false); setSelectedIds(new Set()); setOtpOpen(false); }}>Cancel</button>
            ) : null}
            <button type="button" className="detail-toolbar-btn" onClick={openFields}>Create Link</button>
          </div>
        </div>
      </div>
      <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void uploadExcel(file).catch((err) => setError(messageOf(err, "Failed to upload Excel.")));
      }} />
      {filterOpen ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-3">
          <span className="text-sm font-medium">Photo</span>
          {(["any", "yes", "no"] as const).map((value) => (
            <button key={value} type="button" className={photoFilter === value ? "btn-primary" : "btn-secondary"} onClick={() => setPhotoFilter(value)}>
              {value === "any" ? "Any" : value === "yes" ? "Has photo" : "Missing photo"}
            </button>
          ))}
        </div>
      ) : null}
      {infoOpen ? (
        <form className="mt-3 space-y-3 rounded-2xl border border-border bg-white p-4" onSubmit={(event) => { event.preventDefault(); void saveDetails().catch((err) => setError(messageOf(err, "Failed to save organization info."))); }}>
          <h2 className="text-lg font-bold">Organization Info</h2>
          <label className="block text-sm"><span className="mb-1.5 block font-medium">Phone</span><input className="input-field" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
          <label className="block text-sm"><span className="mb-1.5 block font-medium">Address</span><input className="input-field" value={address} onChange={(event) => setAddress(event.target.value)} /></label>
          <label className="block text-sm"><span className="mb-1.5 block font-medium">Instructions</span><textarea className="input-field min-h-24" value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
          {([
            ["required_details", "Required Details"],
            ["detail_phone", "Phone"],
            ["detail_address", "Address"],
            ["detail_instructions", "Instructions"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 text-sm">
              <span>{label}</span>
              <input type="checkbox" checked={visibility[key] !== false} onChange={(event) => setVisibility((current) => ({ ...current, [key]: event.target.checked }))} />
            </label>
          ))}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setInfoOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Save</button>
          </div>
        </form>
      ) : null}
      {error ? <div className="alert-error">{error}</div> : null}
      {notice ? <div className="alert-success">{notice}</div> : null}
      {link ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-white p-4">
          <input readOnly className="input-field min-w-0 flex-1" value={link} onFocus={(event) => event.currentTarget.select()} />
          <button type="button" className="btn-secondary" onClick={(event) => {
            const input = event.currentTarget.parentElement?.querySelector("input");
            input?.focus();
            input?.select();
          }}>Select</button>
          <button type="button" className="btn-secondary" onClick={() => void shareLink()}>Share</button>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-[#F8FAFC] text-left">
            <tr>
              {selecting ? <th className="px-4 py-3" /> : null}
              <th className="px-4 py-3">S.No</th>
              {fields.map((field) => <th key={field.id} className="px-4 py-3">{field.field_name}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td className="px-4 py-8 text-text-muted" colSpan={Math.max(1, fields.length + (selecting ? 2 : 1))}>No submissions yet.</td></tr>
            ) : visibleRows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                {selecting ? (
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => setSelectedIds((current) => {
                      const next = new Set(current);
                      if (next.has(row.id)) next.delete(row.id);
                      else next.add(row.id);
                      return next;
                    })} aria-label={`Select record ${row.serial}`} />
                  </td>
                ) : null}
                <td className="px-4 py-3">{row.serial}</td>
                {fields.map((field) => {
                  const value = row.values[field.id];
                  return (
                    <td key={field.id} className="px-4 py-3">
                      {field.field_type === "photo" ? (
                        value?.hasPhoto ? <OrgPhoto organizationId={id} submissionId={row.id} fieldId={field.id} alt={field.field_name} /> : "—"
                      ) : value?.text || "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {otpOpen ? (
        <OtpConfirmModal
          title="Delete records"
          description="Delete the selected organization records?"
          confirmLabel="Delete"
          onClose={() => setOtpOpen(false)}
          onRequestOtp={async () => {
            const { data } = await api.post<{ message?: string; devOtp?: string }>(`/admin/organizations/${id}/submissions/bulk-delete/request-otp`);
            return data;
          }}
          onConfirm={async (otp) => {
            await api.post(`/admin/organizations/${id}/submissions/bulk-delete`, { ids: [...selectedIds], otp });
            setSelecting(false);
            setSelectedIds(new Set());
            setOtpOpen(false);
            await load();
          }}
        />
      ) : null}
      {building ? (
        <form className="space-y-3 rounded-2xl border border-border bg-white p-4" onSubmit={(event) => void createForm(event)}>
          {drafts.map((field, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">Field Name</span>
                <input required className="input-field" value={field.fieldName} onChange={(event) => {
                  setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fieldName: event.target.value } : item));
                }} />
              </label>
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">Field Type</span>
                <select className="input-field" value={field.fieldType} onChange={(event) => {
                  const fieldType = event.target.value === "photo" ? "photo" : "text";
                  setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fieldType } : item));
                }}>
                  <option value="text">Text/Data</option>
                  <option value="photo">Image/Photo</option>
                </select>
              </label>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => setDrafts((current) => [...current, { fieldName: "", fieldType: "text" }])}>Add Field</button>
            <button type="submit" className="btn-primary">Create</button>
            <button type="button" className="btn-secondary" onClick={() => setBuilding(false)}>Cancel</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function EditOrganizationModal({
  organization,
  onClose,
  onSaved,
}: {
  organization: OrganizationRow;
  onClose: () => void;
  onSaved: (organization: OrganizationRow) => void;
}) {
  const [name, setName] = useState(organization.name);
  const [phone, setPhone] = useState(organization.phone ?? "");
  const [username, setUsername] = useState(organization.username ?? "");
  const [password, setPassword] = useState(organization.password ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.patch<{ organization: OrganizationRow }>(`/admin/organizations/${organization.id}`, {
        name,
        phone,
        username: username.trim(),
        password,
      });
      onSaved({ ...organization, ...data.organization });
    } catch (err) {
      setError(messageOf(err, "Failed to update organization."));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <form className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6" onSubmit={(event) => void submit(event)}>
        <h2 className="text-lg font-bold">Edit Organization</h2>
        <label className="block text-sm"><span className="mb-1.5 block font-medium">Organization Name *</span><input required className="input-field" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1.5 block font-medium">Phone Number *</span><input required className="input-field" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1.5 block font-medium">Username *</span><input required className="input-field" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1.5 block font-medium">Password *</span><input required type="text" className="input-field" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <p className="text-xs text-text-muted">The organization uses this username and password to log in to the app.</p>
        {error ? <div className="alert-error">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Submit"}</button>
        </div>
      </form>
    </div>
  );
}

function AddOrganizationModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/admin/organizations", { name, phone, username, password, confirmPassword });
      onCreated();
    } catch (err) {
      setError(messageOf(err, "Failed to create organization."));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <form className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6" onSubmit={(event) => void submit(event)}>
        <h2 className="text-lg font-bold">Add Organization</h2>
        <label className="block text-sm"><span className="mb-1.5 block font-medium">Organization Name *</span><input required className="input-field" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1.5 block font-medium">Phone Number *</span><input required className="input-field" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1.5 block font-medium">Username *</span><input required className="input-field" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" /></label>
        <label className="block text-sm"><span className="mb-1.5 block font-medium">Password *</span><input required type="text" className="input-field" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label>
        <label className="block text-sm"><span className="mb-1.5 block font-medium">Confirm Password *</span><input required type="text" className="input-field" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>
        <p className="text-xs text-text-muted">Enter the username and password this organization will use to log in to the app.</p>
        {error ? <div className="alert-error">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Submit"}</button>
        </div>
      </form>
    </div>
  );
}

function OrgPhoto({
  organizationId,
  submissionId,
  fieldId,
  alt,
}: {
  organizationId: string;
  submissionId: string;
  fieldId: string;
  alt: string;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    void api.get(`/admin/organizations/${organizationId}/submissions/${submissionId}/fields/${fieldId}/photo`, {
      responseType: "blob",
    }).then(({ data }) => {
      objectUrl = URL.createObjectURL(data as Blob);
      if (!cancelled) setSrc(objectUrl);
    }).catch(() => {
      if (!cancelled) setSrc("");
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [organizationId, submissionId, fieldId]);
  if (!src) return <span className="text-text-muted">Photo</span>;
  return <img alt={alt} className="h-14 w-14 rounded-lg object-cover" src={src} />;
}

function messageOf(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    return body?.message ?? fallback;
  }
  return fallback;
}
