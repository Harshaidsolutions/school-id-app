import { captureDayKey } from "../utils/captureDay";
import { IdCardGeneratorButton } from "../components/IdCardGeneratorButton";
import { BulkUploadModal } from "../components/BulkUploadModal";
import { useMemo, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import { BulkModeButtons } from "../components/BulkActionBar";
import { DeleteOptionsModal, type DeleteJob } from "../components/DeleteOptionsModal";
import { DownloadPhotosModal } from "../components/DownloadPhotosModal";
import { ExcelDownloadModal } from "../components/ExcelDownloadModal";
import { OtpConfirmModal } from "../components/OtpConfirmModal";
import { PageActions } from "../components/ui/PageActions";
import { SearchInput } from "../components/ui/SearchInput";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import type { ApiErrorBody } from "../types";
import { formatCalendarDate } from "../utils/formatCalendarDate";
import { isPhotoNumberLabel, isSignatureLabel, organizationCategoryFields } from "../utils/organizationGroups";

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
  enabled?: boolean;
  required?: boolean;
};

type SubmissionRow = {
  id: string;
  serial: number;
  photoNumber?: string;
  photoCropped?: boolean;
  createdAt?: string;
  capturedAt?: string | null;
  values: Record<string, { text: string | null; hasPhoto: boolean; capturedAt?: string | null; photoCropped?: boolean }>;
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
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [otpOpen, setOtpOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
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
        actions={
          <>
            {selecting || filtered.length > 0 ? (
              <BulkModeButtons
                cancelOnRight
                selecting={selecting}
                selectedCount={filtered.filter((row) => selectedIds.has(row.id)).length}
                deleting={bulkDeleting}
                onStart={() => setSelecting(true)}
                onCancel={() => {
                  setSelectedIds(new Set());
                  setSelecting(false);
                  setOtpOpen(false);
                }}
                onConfirm={() => {
                  if (filtered.filter((row) => selectedIds.has(row.id)).length === 0) return;
                  setOtpOpen(true);
                }}
              />
            ) : null}
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>+ Add Organization</button>
          </>
        }
      />
      {error ? <div className="mb-4 alert-error">{error}</div> : null}
      <div className="card list-table-scroll school-list-table-panel admin-scroll-panel">
        <table className="list-data-table">
          <thead>
            <tr>
              {selecting ? (
                <th className="bulk-check-cell">
                  <input
                    type="checkbox"
                    className="bulk-check"
                    aria-label="Select all organizations"
                    checked={filtered.length > 0 && filtered.every((row) => selectedIds.has(row.id))}
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const all = filtered.every((row) => prev.has(row.id));
                        if (all) return new Set();
                        return new Set(filtered.map((row) => row.id));
                      });
                    }}
                  />
                </th>
              ) : null}
              <th className="w-10 px-2 py-3 sm:px-3">S.NO.</th>
              <th className="w-[22%] px-2 py-3 sm:px-3">Organization Name</th>
              <th className="hidden w-[14%] px-2 py-3 md:table-cell sm:px-3">Username</th>
              <th className="w-[16%] px-2 py-3 sm:px-3">Password</th>
              <th className="hidden w-[12%] px-2 py-3 lg:table-cell sm:px-3">Phone</th>
              <th className="hidden w-[14%] px-2 py-3 sm:table-cell sm:px-3">Created</th>
              <th className="w-16 px-2 py-3 sm:px-3">Status</th>
              <th className="px-2 py-3 sm:px-3">Capture</th>
              <th className="w-24 px-2 py-3 text-right sm:px-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={selecting ? 10 : 9} className="px-4 py-10 text-center text-text-muted">Loading…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={selecting ? 10 : 9} className="px-4 py-10 text-center text-text-muted">
                  No organizations yet — click Add Organization to get started.
                </td>
              </tr>
            ) : filtered.map((row, index) => (
              <tr key={row.id} className="hover:bg-content-bg/50 align-top">
                {selecting ? (
                  <td className="bulk-check-cell">
                    <input
                      type="checkbox"
                      className="bulk-check"
                      aria-label={`Select ${row.name}`}
                      checked={selectedIds.has(row.id)}
                      onChange={() => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          return next;
                        });
                      }}
                    />
                  </td>
                ) : null}
                <td className="px-2 py-3 text-text-muted sm:px-3">{index + 1}</td>
                <td className="px-2 py-3 font-medium text-text-navy sm:px-3">
                  <Link
                    className="line-clamp-2 text-button-blue hover:underline"
                    to={`/extra-2/${row.id}?organizationName=${encodeURIComponent(row.name)}`}
                  >
                    {row.name}
                  </Link>
                  <div className="mt-1 text-xs text-text-muted md:hidden">{row.username || "—"}</div>
                </td>
                <td className="hidden truncate px-2 py-3 text-text md:table-cell sm:px-3">{row.username || "—"}</td>
                <td className="px-2 py-3 font-mono text-xs text-text sm:px-3 sm:text-sm">
                  <span className="break-all">{row.password || "—"}</span>
                </td>
                <td className="hidden truncate px-2 py-3 text-text lg:table-cell sm:px-3">{row.phone || "—"}</td>
                <td className="hidden px-2 py-3 text-xs text-text-muted sm:table-cell sm:px-3">{formatCalendarDate(row.created_at)}</td>
                <td className="px-2 py-3 sm:px-3">
                  <ToggleSwitch checked={row.is_active !== false} disabled={togglingId === row.id} onChange={() => void toggleActive(row)} label={`${row.name} status`} />
                </td>
                <td className="px-2 py-3 sm:px-3">
                  <div className="flex items-center gap-2">
                    <span className="capture-protection-label text-xs text-text-muted">Screen capture<br />protection</span>
                    <ToggleSwitch
                      checked={row.allow_screenshot === false || row.allow_screen_recording === false}
                      disabled={captureId === row.id}
                      onChange={() => void toggleCapture(row)}
                      label={`${row.name} screen capture protection`}
                    />
                  </div>
                </td>
                <td className="px-2 py-3 sm:px-3">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" title="Edit" className="rounded p-1.5 text-text-muted hover:bg-content-bg hover:text-button-blue" onClick={() => setEditTarget(row)}>
                      <EditIcon />
                    </button>
                    <button type="button" title="Delete" className="rounded p-1.5 text-text-muted hover:bg-danger-soft hover:text-danger" onClick={() => setDeleteTarget(row)}>
                      <TrashIcon />
                    </button>
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
      {otpOpen ? (
        <OtpConfirmModal
          title="Delete organizations"
          description={`Remove ${filtered.filter((row) => selectedIds.has(row.id)).length} selected organization(s) and their related records.`}
          confirmLabel="Delete selected"
          onClose={() => {
            if (!bulkDeleting) setOtpOpen(false);
          }}
          onRequestOtp={async () => {
            const ids = filtered.filter((row) => selectedIds.has(row.id)).map((row) => row.id);
            const { data } = await api.post<{ message?: string; devOtp?: string }>("/admin/organizations/bulk-delete/request-otp", { ids });
            return { message: data.message, devOtp: data.devOtp };
          }}
          onConfirm={async (otp) => {
            const ids = filtered.filter((row) => selectedIds.has(row.id)).map((row) => row.id);
            setBulkDeleting(true);
            try {
              const { data } = await api.post<{ deleted?: string[] }>("/admin/organizations/bulk-delete", { ids, otp });
              const deleted = new Set(data.deleted ?? ids);
              setRows((current) => current.filter((row) => !deleted.has(row.id)));
              setSelectedIds(new Set());
              setSelecting(false);
              setOtpOpen(false);
            } catch (err) {
              if (axios.isAxiosError(err)) {
                const body = err.response?.data as ApiErrorBody | undefined;
                throw new Error(body?.message ?? "Failed to delete organizations.");
              }
              throw new Error("Failed to delete organizations.");
            } finally {
              setBulkDeleting(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

export function OrganizationDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "pending" | "captured" | "pending-data">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [photoFilter, setPhotoFilter] = useState("");
  const [pendingDataFilter, setPendingDataFilter] = useState("");
  const [capturedOn, setCapturedOn] = useState("");
  const [groupFilters, setGroupFilters] = useState<Record<string, string>>({});
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [otpOpen, setOtpOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [deleteOptionsOpen, setDeleteOptionsOpen] = useState(false);
  const [deleteJob, setDeleteJob] = useState<DeleteJob | null>(null);
  const [exporting, setExporting] = useState(false);
  const [editingRow, setEditingRow] = useState<SubmissionRow | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [photoPreview, setPhotoPreview] = useState<{ src: string; alt: string } | null>(null);

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




    setLink(data.form?.link ?? null);
    setFields(data.form?.fields ?? []);
    setSubmissions(data.submissions ?? []);
  }

  useEffect(() => {
    void load().catch((err) => setError(messageOf(err, "Failed to open organization.")));
  }, [id]);

  useEffect(() => {
    if (!name || searchParams.get("organizationName") === name) return;
    const next = new URLSearchParams(searchParams);
    next.set("organizationName", name);
    setSearchParams(next, { replace: true });
  }, [name, searchParams, setSearchParams]);

  const activeFields = fields.filter((field) => field.enabled !== false);
  const photoFields = activeFields.filter((field) => field.field_type === "photo");
  const imageFields = photoFields.filter((field) => !isSignatureLabel(field.field_name));
  const signatureFields = photoFields.filter((field) => isSignatureLabel(field.field_name));
  const captureFields = imageFields;
  const textFields = activeFields.filter((field) => field.field_type !== "photo" && !isPhotoNumberLabel(field.field_name));
  const numberLabel = activeFields.find((field) => isPhotoNumberLabel(field.field_name))?.field_name ?? "Photo Number";
  function hasAllPhotos(row: SubmissionRow) {
    if (captureFields.length === 0) return false;
    return captureFields.every((field) => row.values[field.id]?.hasPhoto);
  }
  function missingData(row: SubmissionRow) {
    return textFields.some((field) => field.required !== false && !(row.values[field.id]?.text ?? "").trim());
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
      if (photoFilter === "captured" && !captured) return false;
      if (photoFilter === "uncaptured" && captured) return false;
      if (pendingDataFilter === "yes" && !missingData(row)) return false;
      if (pendingDataFilter === "no" && missingData(row)) return false;
      if (capturedOn && !imageFields.some(f => row.values[f.id]?.hasPhoto && captureDayKey(row.values[f.id]?.capturedAt) === capturedOn)) return false;
      for (const [fieldId, value] of Object.entries(groupFilters)) {
        if (value && (row.values[fieldId]?.text ?? "").trim() !== value) return false;
      }
      if (!query) return true;
      return (row.photoNumber ?? "").toLowerCase().includes(query) || activeFields.some((field) => (row.values[field.id]?.text ?? "").toLowerCase().includes(query));
    });
  }, [submissions, search, tab, activeFields, captureFields, textFields, photoFilter, pendingDataFilter, capturedOn, groupFilters]);
  const categories = useMemo(() => organizationCategoryFields(activeFields), [activeFields]);
  const categoryFields = useMemo(() => {
    return categories
      .map((field) => {
        const counts = new Map<string, number>();
        for (const row of submissions) {
          const value = (row.values[field.key]?.text ?? "").trim();
          if (!value) continue;
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        return {
          label: field.label,
          key: field.key,
          options: [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count, key: field.key })),
        };
      });
  }, [categories, submissions]);
  const photoCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of submissions) {
      for (const field of imageFields) {
        const value = row.values[field.id];
        const day = value?.hasPhoto ? captureDayKey(value.capturedAt) : null;
        if (day) counts[day] = (counts[day] ?? 0) + 1;
      }
    }
    return counts;
  }, [submissions, imageFields]);
  const signatureCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of submissions) {
      for (const field of signatureFields) {
        const value = row.values[field.id];
        const day = value?.hasPhoto ? captureDayKey(value.capturedAt) : null;
        if (day) counts[day] = (counts[day] ?? 0) + 1;
      }
    }
    return counts;
  }, [submissions, signatureFields]);
  const captureDates = useMemo(
    () => Object.entries(photoCounts).map(([name, count]) => ({ name, count })),
    [photoCounts]
  );

  async function shareLink() {
    if (!link) return;
    if (navigator.share) {
      await navigator.share({ title: name, url: link });
      return;
    }
    await navigator.clipboard.writeText(link);
    setNotice("Link copied.");
  }

  async function downloadExcel(job?: { scope: string; date?: string; classSection?: string; fieldKey?: string }) {
    const response = await api.get(`/admin/organizations/${id}/excel`, {
      responseType: "blob",
      params: {
        scope: job?.scope ?? "all",
        date: job?.date,
        fieldId: job?.fieldKey,
        value: job?.classSection,
      },
    });
    const url = URL.createObjectURL(response.data as Blob);
    const linkNode = document.createElement("a");
    linkNode.href = url;
    linkNode.download = `${name || "organization"}-records.xlsx`;
    linkNode.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPhotos(job?: { asset: "photo" | "signature"; date?: string; classSection?: string; fieldKey?: string }) {
    const response = await api.get(`/admin/organizations/${id}/photos.zip`, {
      responseType: "blob", params: {asset:job?.asset ?? "photo",date:job?.date,fieldId:job?.fieldKey,value:job?.classSection}
    });
    const url = URL.createObjectURL(response.data as Blob);
    const anchor = document.createElement("a"); anchor.href = url;
    anchor.download = `${name || "organization"}-${job?.asset === "signature" ? "signatures" : "photos"}.zip`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Photo archive downloaded.");
  }

  async function downloadRowPhoto(row: SubmissionRow, fieldId: string, fieldName: string) {
    const response = await api.get(`/admin/organizations/${id}/submissions/${row.id}/fields/${fieldId}/photo`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data as Blob);
    const linkNode = document.createElement("a");
    linkNode.href = url;
    linkNode.download = `${row.photoNumber || row.serial}-${fieldName}.jpg`;
    linkNode.click();
    URL.revokeObjectURL(url);
  }

  function openFields() { navigate(`/form-setup?organizationId=${encodeURIComponent(id)}&organizationName=${encodeURIComponent(name)}`); }

  return (
    <div className="detail-page-shell admin-scroll-root">
      <Link
        to="/extra-2"
        className="mb-4 inline-flex w-fit max-w-full shrink-0 items-center gap-1.5 self-start text-sm font-semibold text-button-blue hover:underline"
      >
        ← Back to Organizations
      </Link>
      <div className="detail-toolbar-shell">
        <div className="detail-toolbar-row1">
          <button type="button" className="detail-toolbar-btn" disabled={!id} onClick={openFields}>Form Setup</button>
          <button type="button" className="detail-toolbar-btn" disabled={!id || fields.length === 0} onClick={() => setUploadOpen(true)}>Upload Excel</button>
          <button type="button" className="detail-toolbar-btn" disabled={!id} onClick={() => setExcelOpen(true)}>Download Excel</button>
          <button type="button" className="detail-toolbar-btn" disabled={!id} onClick={() => setPhotosOpen(true)}>Download Photos</button>
          <button type="button" className="detail-toolbar-btn" style={{ wordBreak: "normal", whiteSpace: "nowrap", letterSpacing: 0 }} disabled={!id} onClick={() => navigate(`/organization-info?organizationId=${encodeURIComponent(id)}&organizationName=${encodeURIComponent(name)}`)}>Organization Info</button>
          <button type="button" className="detail-toolbar-btn" disabled={!id || submissions.length === 0} onClick={() => setDeleteOptionsOpen(true)}>Delete Options</button>
          <button type="button" className="detail-toolbar-btn detail-feature-card detail-feature-card-short detail-toolbar-short-slot" disabled={!id} onClick={() => navigate(`/crop-tool?organizationId=${encodeURIComponent(id)}&organizationName=${encodeURIComponent(name)}`)}>
            <span className="detail-feature-icon bg-white/20 text-white" aria-hidden>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 3H3v3M18 3h3v3M6 21H3v-3M18 21h3v-3" />
                <rect x="7" y="7" width="10" height="10" rx="1" />
              </svg>
            </span>
            <span className="detail-feature-label">CROPPING TOOL</span>
          </button>
          <IdCardGeneratorButton />
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
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-muted">
                <SearchIcon />
              </span>
              <input className="input-field w-full pl-10 text-sm" placeholder="Search…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search" />
            </div>
          </div>
          <button ref={filterButtonRef} type="button" className="btn-secondary detail-toolbar-row2-filter" onClick={() => setFilterOpen((open) => !open)}>Filter</button>
          <div className="detail-toolbar-row2-actions">
            {selecting ? (
              <button type="button" className="btn-primary shrink-0" disabled={selectedIds.size === 0} onClick={() => { setDeleteJob(null); setOtpOpen(true); }}>Bulk Delete</button>
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
      <BulkUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} organizationId={id} orgName={name} onSuccess={() => void load()} />
      {filterOpen ? createPortal(
        <OrganizationFilterPanel
          anchor={filterButtonRef.current}
          onClose={() => setFilterOpen(false)}
          capturedOn={capturedOn}
          setCapturedOn={setCapturedOn}
          captureDates={captureDates}
          categories={categoryFields}
          groupFilters={groupFilters}
          setGroupFilters={setGroupFilters}
          photoFilter={photoFilter}
          setPhotoFilter={setPhotoFilter}
          pendingDataFilter={pendingDataFilter}
          setPendingDataFilter={setPendingDataFilter}
          onClear={() => {
            setCapturedOn("");
            setGroupFilters({});
            setPhotoFilter("");
            setPendingDataFilter("");
          }}
        />,
        document.body
      ) : null}
      {error ? <div className="alert-error">{error}</div> : null}
      {notice ? <div className="alert-success">{notice}</div> : null}
      {photoPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4" onClick={() => setPhotoPreview(null)}>
          <img alt={photoPreview.alt} src={photoPreview.src} className="max-h-[80vh] max-w-full rounded-2xl bg-white object-contain" onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
      {link ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <input readOnly className="input-field min-w-0 basis-full sm:basis-0 flex-1" value={link} onFocus={(event) => event.currentTarget.select()} />
          <button type="button" className="btn-secondary" onClick={(event) => {
            const input = event.currentTarget.parentElement?.querySelector("input");
            input?.focus();
            input?.select();
          }}>Select</button>
          <button type="button" className="btn-secondary" onClick={() => void shareLink()}>Share</button>
          <a className="btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
      ) : null}
      <div className="students-table-scroll admin-scroll-panel">
        <table className="students-data-table">
          <thead>
            <tr>
              {selecting ? (
                <th className="bulk-check-cell">
                  <input
                    type="checkbox"
                    className="bulk-check"
                    aria-label="Select all records"
                    checked={visibleRows.length > 0 && visibleRows.every((row) => selectedIds.has(row.id))}
                    onChange={() => {
                      setSelectedIds((current) => {
                        const all = visibleRows.every((row) => current.has(row.id));
                        if (all) return new Set();
                        return new Set(visibleRows.map((row) => row.id));
                      });
                    }}
                  />
                </th>
              ) : null}
              <th className="col-sno">S.NO.</th>
              <th className="col-field">{numberLabel}</th>
              {activeFields.filter((field) => !isPhotoNumberLabel(field.field_name)).map((field) => (
                <th key={field.id} className={field.field_type === "photo" ? "col-photo" : "col-field"}>{field.field_name}</th>
              ))}
              <th className="col-captured">Status</th>
              <th className="col-field">Captured</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white">
            {visibleRows.length === 0 ? (
              <tr><td className="px-4 py-10 text-center text-text-muted" colSpan={Math.max(1, activeFields.filter((field) => !isPhotoNumberLabel(field.field_name)).length + (selecting ? 6 : 5))}>No submissions yet.</td></tr>
            ) : visibleRows.map((row) => {
              const captured = hasAllPhotos(row);
              const created = formatCreated(row.capturedAt ?? null);
              const photoField = imageFields.find((field) => row.values[field.id]?.hasPhoto);
              return (
              <tr key={row.id} className="hover:bg-content-bg/50">
                {selecting ? (
                  <td className="bulk-check-cell">
                    <input type="checkbox" className="bulk-check" checked={selectedIds.has(row.id)} onChange={() => setSelectedIds((current) => {
                      const next = new Set(current);
                      if (next.has(row.id)) next.delete(row.id);
                      else next.add(row.id);
                      return next;
                    })} aria-label={`Select record ${row.serial}`} />
                  </td>
                ) : null}
                <td className="col-sno text-text-muted">{row.serial}</td>
                <td className="col-field">{row.photoNumber || "—"}</td>
                {activeFields.filter((field) => !isPhotoNumberLabel(field.field_name)).map((field) => {
                  const value = row.values[field.id];
                  return (
                    <td key={field.id} className={field.field_type === "photo" ? "col-photo" : "col-field"}>
                      {field.field_type === "photo" ? (
                        value?.hasPhoto ? (
                          <OrgPhoto
                            organizationId={id}
                            submissionId={row.id}
                            fieldId={field.id}
                            alt={field.field_name}
                            onOpen={setPhotoPreview}
                          />
                        ) : "—"
                      ) : value?.text || "—"}
                    </td>
                  );
                })}
                <td className="col-captured">
                  {captured ? (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-soft text-royal-green" title="Captured"><CheckIcon /></span>
                  ) : (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-warning/10 text-warning" title="Pending"><ClockIcon /></span>
                  )}
                </td>
                <td className="col-field">
                  {created ? (
                    <span className="block whitespace-normal text-xs leading-4 text-text">{created.date}<br />{created.time}</span>
                  ) : "—"}
                </td>
                <td className="col-actions">
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      title="Download photo"
                      disabled={!photoField}
                      className="rounded p-1.5 text-text-muted hover:bg-content-bg hover:text-parrot-green disabled:opacity-30"
                      onClick={() => {
                        if (!photoField) return;
                        void downloadRowPhoto(row, photoField.id, photoField.field_name).catch((err) => setError(messageOf(err, "Failed to download the photo.")));
                      }}
                    >
                      <DownloadIcon />
                    </button>
                    <button type="button" title="Edit" className="rounded p-1.5 text-text-muted hover:bg-content-bg hover:text-button-blue" onClick={() => {
                      const next: Record<string, string> = {};
                      for (const field of textFields) next[field.id] = row.values[field.id]?.text ?? "";
                      setEditDraft(next);
                      setEditingRow(row);
                    }}><EditIcon /></button>
                    <button type="button" title="Delete" className="rounded p-1.5 text-text-muted hover:bg-danger-soft hover:text-danger" onClick={() => {
                      setDeleteJob(null);
                      setSelectedIds(new Set([row.id]));
                      setOtpOpen(true);
                    }}><TrashIcon /></button>
                  </div>
                </td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>
      {otpOpen ? (
        <OtpConfirmModal
          title={deleteJob?.kind === "photos" ? "Delete photos" : "Delete records"}
          description={deleteJob?.label ?? "Delete the selected organization records?"}
          confirmLabel="Delete"
          onClose={() => { setOtpOpen(false); setDeleteJob(null); }}
          onRequestOtp={async () => {
            const { data } = await api.post<{ message?: string; devOtp?: string }>(`/admin/organizations/${id}/submissions/bulk-delete/request-otp`);
            return data;
          }}
          onConfirm={async (otp) => {
            const ids = deleteJob ? submissions.filter((row) => {
              if (deleteJob.date && !imageFields.some(f => row.values[f.id]?.hasPhoto && captureDayKey(row.values[f.id]?.capturedAt) === deleteJob.date)) return false;
              if (deleteJob.fieldKey && deleteJob.classSection && (row.values[deleteJob.fieldKey]?.text ?? "").trim() !== deleteJob.classSection) return false;
              const captured = hasAllPhotos(row);
              if (deleteJob.dataScope === "captured" && !captured) return false;
              if (deleteJob.dataScope === "uncaptured" && captured) return false;
              if (deleteJob.dataScope === "pending-data" && !missingData(row)) return false;
              if (deleteJob.photoScope === "captured" && !captured) return false;
              if (deleteJob.photoScope === "pending" && captured) return false;
              return true;
            }).map((row) => row.id) : [...selectedIds];
            await api.post(`/admin/organizations/${id}/submissions/bulk-delete`, { ids, otp, photosOnly: deleteJob?.kind === "photos", date: deleteJob?.date });
            setSelecting(false);
            setSelectedIds(new Set());
            setDeleteJob(null);
            setOtpOpen(false);
            await load();
          }}
        />
      ) : null}
      {excelOpen ? (
        <ExcelDownloadModal
          downloading={exporting}
          categoryFields={categoryFields}
          captureDates={captureDates}
          counts={{
            all: counts.all,
            captured: counts.captured,
            pending: counts.pending,
            "pending-data": counts.pendingData,
            "captured-pending-data": submissions.filter((row) => hasAllPhotos(row) && missingData(row)).length,
            "uncaptured-pending-data": submissions.filter((row) => !hasAllPhotos(row) && missingData(row)).length,
          }}
          onClose={() => setExcelOpen(false)}
          onDownload={(job) => {
            setExporting(true);
            void downloadExcel(job)
              .then(() => setExcelOpen(false))
              .catch((err) => setError(messageOf(err, "Failed to download Excel.")))
              .finally(() => setExporting(false));
          }}
        />
      ) : null}
      {photosOpen ? (
        <DownloadPhotosModal
          downloading={exporting}
          photoCounts={photoCounts}
          signatureCounts={signatureCounts}
          showSignature={signatureFields.length > 0 && Object.values(signatureCounts).some((count) => count > 0)}
          categoryFields={categoryFields}
          onClose={() => setPhotosOpen(false)}
          onDownload={(job) => {
            setExporting(true);
            void downloadPhotos(job)
              .then(() => setPhotosOpen(false))
              .catch((err) => setError(messageOf(err, "Failed to download photos.")))
              .finally(() => setExporting(false));
          }}
        />
      ) : null}
      {deleteOptionsOpen ? (
        <DeleteOptionsModal
          photoCounts={photoCounts}
          categoryFields={categoryFields}
          counts={{
            allPhotos: submissions.filter((row) => imageFields.some((field) => row.values[field.id]?.hasPhoto)).length,
            allData: submissions.length,
            capturedData: counts.captured,
            uncapturedData: counts.pending,
          }}
          onClose={() => setDeleteOptionsOpen(false)}
          onChoose={(job) => {
            setDeleteJob(job);
            setDeleteOptionsOpen(false);
            setOtpOpen(true);
          }}
        />
      ) : null}
      {editingRow ? (
        <form
          className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4"
          onSubmit={(event) => {
            event.preventDefault();
            void api.patch(`/admin/organizations/${id}/submissions/${editingRow.id}`, { values: editDraft })
              .then(() => load())
              .then(() => setEditingRow(null))
              .catch((err) => setError(messageOf(err, "Failed to save this record.")));
          }}
        >
          <div className="max-h-[85vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-white p-6">
            <h2 className="text-lg font-bold">Edit record</h2>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">{numberLabel}</span>
              <input className="input-field" value={editingRow.photoNumber || ""} readOnly />
            </label>
            {activeFields.filter((field) => !isPhotoNumberLabel(field.field_name)).map((field) => (
              <label key={field.id} className="block text-sm">
                <span className="mb-1.5 block font-medium">{field.field_name}</span>
                {field.field_type === "photo" ? (
                  <span className="text-text-muted">{editingRow.values[field.id]?.hasPhoto ? "Photo uploaded" : "No photo"}</span>
                ) : (
                  <input className="input-field" value={editDraft[field.id] ?? ""} onChange={(event) => setEditDraft((current) => ({ ...current, [field.id]: event.target.value }))} />
                )}
              </label>
            ))}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditingRow(null)}>Cancel</button>
              <button type="submit" className="btn-primary">Save</button>
            </div>
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
  onOpen,
}: {
  organizationId: string;
  submissionId: string;
  fieldId: string;
  alt: string;
  onOpen?: (photo: { src: string; alt: string }) => void;
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
  return (
    <button type="button" title="View photo" onClick={() => onOpen?.({ src, alt })}>
      <img alt={alt} className="h-14 w-14 rounded-lg object-cover" src={src} />
    </button>
  );
}

function formatCreated(value: string | null): { date: string; time: string } | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed).replace(/\//g, "-");
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
  return { date, time };
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M5 12.5l4.2 4.2L19 7.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 4v11" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function OrganizationFilterPanel({
  anchor,
  onClose,
  capturedOn,
  setCapturedOn,
  captureDates,
  categories,
  groupFilters,
  setGroupFilters,
  photoFilter,
  setPhotoFilter,
  pendingDataFilter,
  setPendingDataFilter,
  onClear,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  capturedOn: string;
  setCapturedOn: (value: string) => void;
  captureDates: { name: string; count: number }[];
  categories: { label: string; key: string; options: { name: string; count: number }[] }[];
  groupFilters: Record<string, string>;
  setGroupFilters: (value: Record<string, string>) => void;
  photoFilter: string;
  setPhotoFilter: (value: string) => void;
  pendingDataFilter: string;
  setPendingDataFilter: (value: string) => void;
  onClear: () => void;
}) {
  const [box, setBox] = useState({ top: 0, left: 0, width: 360 });
  useEffect(() => {
    function place() {
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(560, Math.max(280, window.innerWidth - 16));
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const top = Math.min(rect.bottom + 8, window.innerHeight - 16);
      setBox({ top, left, width });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchor?.contains(target)) return;
      if (document.getElementById("organization-filter-panel")?.contains(target)) return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [anchor, onClose]);
  if (!anchor) return null;
  return (
    <div id="organization-filter-panel" className="rounded-xl border border-border bg-white p-3 shadow-xl" style={{ position: "fixed", top: box.top, left: box.left, width: box.width, zIndex: 60, maxHeight: "70vh", overflow: "auto" }}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[9.5rem] flex-1 text-xs font-medium text-text-navy">
          Capture date
          <select value={capturedOn} onChange={(event) => setCapturedOn(event.target.value)} className="input-field mt-1">
            <option value="">All</option>
            {captureDates.map((item) => <option key={item.name} value={item.name}>{item.name} — {item.count}</option>)}
          </select>
        </label>
        {categories.map((field) => (
          <label key={field.key} className="min-w-[9.5rem] flex-1 text-xs font-medium text-text-navy">
            {field.label}
            <select value={groupFilters[field.key] ?? ""} onChange={(event) => setGroupFilters({ ...groupFilters, [field.key]: event.target.value })} className="input-field mt-1">
              <option value="">All</option>
              {field.options.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </label>
        ))}
        <label className="min-w-[9.5rem] flex-1 text-xs font-medium text-text-navy">
          Photo
          <select value={photoFilter} onChange={(event) => setPhotoFilter(event.target.value)} className="input-field mt-1">
            <option value="">All</option>
            <option value="captured">Captured</option>
            <option value="uncaptured">Uncaptured</option>
          </select>
        </label>
        <label className="min-w-[9.5rem] flex-1 text-xs font-medium text-text-navy">
          Required data
          <select value={pendingDataFilter} onChange={(event) => setPendingDataFilter(event.target.value)} className="input-field mt-1">
            <option value="">All</option>
            <option value="yes">Pending</option>
            <option value="no">Complete</option>
          </select>
        </label>
        <button type="button" className="btn-secondary" onClick={onClear}>Clear Filters</button>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function messageOf(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    return body?.message ?? fallback;
  }
  return fallback;
}
