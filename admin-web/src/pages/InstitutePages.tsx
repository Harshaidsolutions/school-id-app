import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import { BulkModeButtons } from "../components/BulkActionBar";
import { ImageUploadField } from "../components/ImageUploadField";
import { OtpConfirmModal } from "../components/OtpConfirmModal";
import { PageActions } from "../components/ui/PageActions";
import { SearchInput } from "../components/ui/SearchInput";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import type { ApiErrorBody, Institute } from "../types";
import { formatCalendarDate } from "../utils/formatCalendarDate";

export function InstituteListPage() {
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Institute | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Institute | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [otpOpen, setOtpOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [createdOn, setCreatedOn] = useState("");

  async function loadInstitutes(created = createdOn) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ institutes?: Institute[] }>("/admin/institutes", {
        params: created ? { createdOn: created } : undefined,
      });
      setInstitutes(Array.isArray(data.institutes) ? data.institutes : []);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to load institutes.");
      } else setError("Failed to load institutes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInstitutes();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return institutes;
    return institutes.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.owner_username ?? "").toLowerCase().includes(q) ||
        (item.phone ?? "").toLowerCase().includes(q)
    );
  }, [institutes, search]);

  async function toggleActive(institute: Institute) {
    const next = !(institute.is_active !== false);
    setTogglingId(institute.id);
    try {
      const { data } = await api.patch<{ institute: Institute }>(
        `/admin/institutes/${institute.id}/active`,
        { is_active: next }
      );
      const savedActive = data.institute?.is_active !== false;
      setInstitutes((prev) =>
        prev.map((item) =>
          item.id === institute.id ? { ...item, is_active: savedActive } : item
        )
      );
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to update status.");
      } else setError("Failed to update status.");
    } finally {
      setTogglingId(null);
    }
  }

  function captureProtected(institute: Institute) {
    return (
      institute.allow_screenshot === false || institute.allow_screen_recording === false
    );
  }

  async function toggleCaptureProtection(institute: Institute) {
    const nextProtected = !captureProtected(institute);
    const allow = !nextProtected;
    setCaptureId(institute.id);
    try {
      const { data } = await api.patch<{ institute: Institute }>(
        `/admin/institutes/${institute.id}/capture`,
        {
          allow_screenshot: allow,
          allow_screen_recording: allow,
          screen_capture_protection: nextProtected,
        }
      );
      setInstitutes((prev) =>
        prev.map((item) =>
          item.id === institute.id
            ? {
                ...item,
                allow_screenshot: data.institute?.allow_screenshot !== false,
                allow_screen_recording: data.institute?.allow_screen_recording !== false,
              }
            : item
        )
      );
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to update capture settings.");
      } else setError("Failed to update capture settings.");
    } finally {
      setCaptureId(null);
    }
  }

  return (
    <div className="app-page school-list-page admin-scroll-root">
      <PageActions
        search={
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
            }}
            placeholder="Search institutes…"
          />
        }
        actions={
          <>
            <button type="button" className="btn-secondary shrink-0" onClick={() => setFilterOpen((open) => !open)}>
              Filter
            </button>
            {selecting || filtered.length > 0 ? (
              <BulkModeButtons
                selecting={selecting}
                selectedCount={filtered.filter((institute) => selectedIds.has(institute.id)).length}
                deleting={bulkDeleting}
                onStart={() => setSelecting(true)}
                onCancel={() => {
                  setSelectedIds(new Set());
                  setSelecting(false);
                  setOtpOpen(false);
                }}
                onConfirm={() => {
                  if (filtered.filter((institute) => selectedIds.has(institute.id)).length === 0) {
                    return;
                  }
                  setOtpOpen(true);
                }}
              />
            ) : null}
            <button type="button" className="btn-primary" onClick={() => setShowAdd(true)}>
              + Add Institute
            </button>
          </>
        }
      />

      {filterOpen ? (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-white p-3">
          <label className="text-xs font-medium text-text-navy">
            Created date
            <input
              type="date"
              value={createdOn}
              onChange={(e) => {
                setCreatedOn(e.target.value);
                void loadInstitutes(e.target.value);
              }}
              className="input-field mt-1"
            />
          </label>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setCreatedOn("");
              void loadInstitutes("");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}

      {error && <div className="mb-4 alert-error">{error}</div>}

      <div className="card list-table-scroll school-list-table-panel admin-scroll-panel">
        <table className="list-data-table">
          <thead>
            <tr>
              {selecting ? (
                <th className="bulk-check-cell">
                  <input
                    type="checkbox"
                    className="bulk-check"
                    aria-label="Select all institutes"
                    checked={
                      filtered.length > 0 &&
                      filtered.every((institute) => selectedIds.has(institute.id))
                    }
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const all = filtered.every((institute) => prev.has(institute.id));
                        if (all) return new Set();
                        return new Set(filtered.map((institute) => institute.id));
                      });
                    }}
                  />
                </th>
              ) : null}
              <th className="w-10 px-2 py-3 sm:px-3">S.NO.</th>
              <th className="w-[22%] px-2 py-3 sm:px-3">Institute Name</th>
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
            {loading && (
              <tr>
                <td colSpan={selecting ? 10 : 9} className="px-4 py-10 text-center text-text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={selecting ? 10 : 9} className="px-4 py-10 text-center text-text-muted">
                  No institutes yet — click Add Institute to get started.
                </td>
              </tr>
            )}
            {filtered.map((institute, index) => {
              const active = institute.is_active !== false;
              return (
                <tr key={institute.id} className="hover:bg-content-bg/50 align-top">
                  {selecting ? (
                    <td className="bulk-check-cell">
                      <input
                        type="checkbox"
                        className="bulk-check"
                        aria-label={`Select ${institute.name}`}
                        checked={selectedIds.has(institute.id)}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(institute.id)) next.delete(institute.id);
                            else next.add(institute.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                  ) : null}
                  <td className="px-2 py-3 text-text-muted sm:px-3">
                    {index + 1}
                  </td>
                  <td className="px-2 py-3 font-medium text-text-navy sm:px-3">
                    <Link
                      to={`/institute-members?instituteId=${institute.id}&instituteName=${encodeURIComponent(institute.name)}`}
                      className="line-clamp-2 text-button-blue hover:underline"
                    >
                      {institute.name}
                    </Link>
                    <div className="mt-1 text-xs text-text-muted md:hidden">
                      {institute.owner_username ?? "—"}
                    </div>
                  </td>
                  <td className="hidden truncate px-2 py-3 text-text md:table-cell sm:px-3">
                    {institute.owner_username ?? "—"}
                  </td>
                  <td className="px-2 py-3 font-mono text-xs text-text sm:px-3 sm:text-sm">
                    <span className="break-all">{institute.owner_password ?? "—"}</span>
                  </td>
                  <td className="hidden truncate px-2 py-3 text-text lg:table-cell sm:px-3">
                    {institute.phone ?? "—"}
                  </td>
                  <td className="hidden px-2 py-3 text-xs text-text-muted sm:table-cell sm:px-3">
                    {formatCalendarDate(institute.created_at)}
                  </td>
                  <td className="px-2 py-3 sm:px-3">
                    <ToggleSwitch
                      checked={active}
                      disabled={togglingId === institute.id}
                      onChange={() => void toggleActive(institute)}
                      label={`${institute.name} status`}
                    />
                  </td>
                  <td className="px-2 py-3 sm:px-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">Screen Capture Protection</span>
                      <ToggleSwitch
                        checked={captureProtected(institute)}
                        disabled={captureId === institute.id}
                        onChange={() => void toggleCaptureProtection(institute)}
                        label={`${institute.name} screen capture protection`}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => setEditTarget(institute)}
                        className="rounded p-1.5 text-text-muted hover:bg-content-bg hover:text-button-blue"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => setDeleteTarget(institute)}
                        className="rounded p-1.5 text-text-muted hover:bg-danger-soft hover:text-danger"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddInstituteModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            void loadInstitutes();
          }}
        />
      )}

      {editTarget && (
        <EditInstituteModal
          institute={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setInstitutes((prev) =>
              prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
            );
            setEditTarget(null);
          }}
        />
      )}

      {otpOpen && (
        <OtpConfirmModal
          title="Delete institutes"
          description={`Remove ${filtered.filter((institute) => selectedIds.has(institute.id)).length} selected institute(s) and their related records.`}
          confirmLabel="Delete selected"
          onClose={() => {
            if (!bulkDeleting) setOtpOpen(false);
          }}
          onRequestOtp={async () => {
            const ids = filtered
              .filter((institute) => selectedIds.has(institute.id))
              .map((institute) => institute.id);
            const { data } = await api.post<{ message?: string; devOtp?: string }>(
              "/admin/institutes/bulk-delete/request-otp",
              { ids }
            );
            return { message: data.message, devOtp: data.devOtp };
          }}
          onConfirm={async (otp) => {
            const ids = filtered
              .filter((institute) => selectedIds.has(institute.id))
              .map((institute) => institute.id);
            setBulkDeleting(true);
            try {
              const { data } = await api.post<{ deleted?: string[] }>(
                "/admin/institutes/bulk-delete",
                { ids, otp }
              );
              const deleted = new Set(data.deleted ?? ids);
              setInstitutes((prev) => prev.filter((institute) => !deleted.has(institute.id)));
              setSelectedIds(new Set());
              setSelecting(false);
              setOtpOpen(false);
            } catch (err) {
              if (axios.isAxiosError(err)) {
                const body = err.response?.data as ApiErrorBody | undefined;
                throw new Error(body?.message ?? "Failed to delete institutes.");
              }
              throw new Error("Failed to delete institutes.");
            } finally {
              setBulkDeleting(false);
            }
          }}
        />
      )}

      {deleteTarget && (
        <DeleteInstituteOtpModal
          institute={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setInstitutes((prev) => prev.filter((item) => item.id !== deleteTarget.id));
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

function EditInstituteModal({
  institute,
  onClose,
  onSaved,
}: {
  institute: Institute;
  onClose: () => void;
  onSaved: (institute: Institute) => void;
}) {
  const [name, setName] = useState(institute.name);
  const [username, setUsername] = useState(institute.owner_username ?? "");
  const [password, setPassword] = useState(institute.owner_password ?? "");
  const [phone, setPhone] = useState(institute.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.put(`/admin/institutes/${institute.id}`, {
        name: name.trim(),
        phone: phone.trim(),
        ownerUsername: username.trim(),
        ownerPassword: password,
      });
      onSaved({
        ...institute,
        name: name.trim(),
        phone: phone.trim(),
        owner_username: username.trim(),
        owner_password: password,
      });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to update institute.");
      } else setError("Failed to update institute.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-navy">Edit Institute</h2>
          <button type="button" onClick={onClose} className="text-text-muted" aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Institute Name *</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Username *</span>
            <input required value={username} onChange={(e) => setUsername(e.target.value)} className="input-field" />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Password *</span>
            <input required type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Phone Number</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field" />
          </label>
          {error && <div className="alert-error">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteInstituteOtpModal({
  institute,
  onClose,
  onDeleted,
}: {
  institute: Institute;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { data } = await api.post<{ message?: string; devOtp?: string }>(
        `/admin/institutes/${institute.id}/request-delete-otp`
      );
      setDevOtp(data.devOtp ?? null);
      setInfo(
        data.devOtp
          ? "OTP generated (dev mode — shown below)."
          : data.message ?? "Verification code sent to your admin email."
      );
      setStep("confirm");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to send verification code.");
      } else setError("Failed to send verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit verification code.");
      return;
    }
    setLoading(true);
    try {
      await api.delete(`/admin/institutes/${institute.id}`, {
        data: { otp: otp.trim() },
      });
      onDeleted();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to delete institute.");
      } else setError("Failed to delete institute.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-blue/45 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text-navy">Delete Institute</h2>
            <p className="mt-1 text-sm text-text-muted">{institute.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-text-muted hover:bg-content-bg" aria-label="Close">
            ×
          </button>
        </div>
        <p className="mb-4 text-sm text-text">
          This permanently deletes the institute, its members, and related data. Confirm with a one-time code sent to your admin email.
        </p>
        {error && <div className="mb-3 alert-error">{error}</div>}
        {info && <div className="mb-3 alert-success">{info}</div>}
        {devOtp && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Dev OTP: <span className="font-mono font-bold tracking-widest">{devOtp}</span>
          </div>
        )}
        {step === "request" ? (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="button" disabled={loading} onClick={() => void requestOtp()} className="btn-primary">
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void confirmDelete(e)} className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-navy">Verification code</span>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                className="input-field font-mono tracking-widest"
                placeholder="000000"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? "Deleting…" : "Delete Institute"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function AddInstituteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [instituteName, setInstituteName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/admin/institutes-with-owner", {
        instituteName,
        phoneNumber,
        ownerName: username,
        password,
        confirmPassword,
      });
      onCreated();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to add institute.");
      } else setError("Failed to add institute.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-navy">Add Institute</h2>
          <button type="button" onClick={onClose} className="text-text-muted" aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Institute Name *</span>
              <input required value={instituteName} onChange={(e) => setInstituteName(e.target.value)} className="input-field" />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Phone Number *</span>
              <input required value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="input-field" />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1.5 block font-medium">Username *</span>
              <input required value={username} onChange={(e) => setUsername(e.target.value)} className="input-field" />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Password *</span>
              <input required type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Confirm Password *</span>
              <input required type="text" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input-field" />
            </label>
          </div>
          {error && <div className="alert-error">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Saving…" : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function InstituteFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [instructions, setInstructions] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [existing, setExisting] = useState<Institute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        const { data } = await api.get<{ institutes: Institute[] }>("/admin/institutes");
        const item = data.institutes.find((row) => row.id === id) ?? null;
        if (!cancelled && item) {
          setExisting(item);
          setName(item.name);
          setYear(item.year ?? "");
          setPhone(item.phone ?? "");
          setCode(item.institute_code ?? "");
          setAddress(item.address ?? "");
          setInstructions(item.instructions ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          if (axios.isAxiosError(err)) {
            const body = err.response?.data as ApiErrorBody | undefined;
            setError(body?.message ?? "Failed to load institute.");
          } else setError("Failed to load institute.");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("year", year);
      form.append("phone", phone);
      form.append("institute_code", code);
      form.append("address", address);
      form.append("instructions", instructions);
      if (logo) form.append("logo", logo);
      if (signature) form.append("signature", signature);

      if (isEdit && id) {
        await api.put(`/admin/institutes/${id}`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        await api.post("/admin/institutes", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      navigate("/institutes");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Save failed.");
      } else setError("Save failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && <div className="mb-4 alert-error">{error}</div>}
      <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4 p-6">
        <Label label="Name *">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </Label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label label="Year">
            <input value={year} onChange={(e) => setYear(e.target.value)} className="input-field" />
          </Label>
          <Label label="Phone Number">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field" />
          </Label>
        </div>
        <Label label="Institute Code">
          <input value={code} onChange={(e) => setCode(e.target.value)} className="input-field" />
        </Label>
        <Label label="Address">
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="input-field" />
        </Label>
        <Label label="Instructions">
          <textarea rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} className="input-field" />
        </Label>
        <ImageUploadField label="Logo upload" file={logo} existingUrl={existing?.logo_url} onChange={setLogo} />
        <ImageUploadField label="Signature upload" file={signature} existingUrl={existing?.signature_url} onChange={setSignature} />
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Saving…" : isEdit ? "Update institute" : "Create institute"}
        </button>
      </form>
    </div>
  );
}

function Label({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-text-navy">{label}</span>
      {children}
    </label>
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
