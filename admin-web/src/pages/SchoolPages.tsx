import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import { BulkModeButtons } from "../components/BulkActionBar";
import { OtpConfirmModal } from "../components/OtpConfirmModal";
import { PageActions } from "../components/ui/PageActions";
import { SearchInput } from "../components/ui/SearchInput";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import type { ApiErrorBody, School } from "../types";
import { formatCalendarDate } from "../utils/formatCalendarDate";

export function SchoolListPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<School | null>(null);
  const [editTarget, setEditTarget] = useState<School | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [otpOpen, setOtpOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  async function loadSchools() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ schools?: School[] }>("/admin/schools");
      setSchools(Array.isArray(data.schools) ? data.schools : []);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to load schools.");
      } else setError("Failed to load schools.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSchools();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (q
      ? schools.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.owner_username ?? "").toLowerCase().includes(q) ||
            (s.phone ?? "").toLowerCase().includes(q)
        )
      : [...schools]
    ).sort((a, b) => {
      const at = new Date(a.created_at ?? 0).getTime();
      const bt = new Date(b.created_at ?? 0).getTime();
      return bt - at;
    });
    return list;
  }, [schools, search]);

  async function toggleActive(school: School) {
    const next = !(school.is_active !== false);
    setTogglingId(school.id);
    try {
      const { data } = await api.patch<{ school: School }>(
        `/admin/schools/${school.id}/active`,
        { is_active: next }
      );
      const savedActive = data.school?.is_active !== false;
      setSchools((prev) =>
        prev.map((s) =>
          s.id === school.id ? { ...s, is_active: savedActive } : s
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

  function captureProtected(school: School) {
    return school.allow_screenshot === false || school.allow_screen_recording === false;
  }

  async function toggleCaptureProtection(school: School) {
    const nextProtected = !captureProtected(school);
    const allow = !nextProtected;
    setCaptureId(school.id);
    try {
      const { data } = await api.patch<{ school: School }>(
        `/admin/schools/${school.id}/capture`,
        {
          allow_screenshot: allow,
          allow_screen_recording: allow,
          screen_capture_protection: nextProtected,
        }
      );
      setSchools((prev) =>
        prev.map((s) =>
          s.id === school.id
            ? {
                ...s,
                allow_screenshot: data.school?.allow_screenshot !== false,
                allow_screen_recording: data.school?.allow_screen_recording !== false,
              }
            : s
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
            placeholder="Search schools…"
          />
        }
        actions={
          <>
            {selecting || filtered.length > 0 ? (
              <BulkModeButtons
                cancelOnRight
                selecting={selecting}
                selectedCount={filtered.filter((school) => selectedIds.has(school.id)).length}
                deleting={bulkDeleting}
                onStart={() => setSelecting(true)}
                onCancel={() => {
                  setSelectedIds(new Set());
                  setSelecting(false);
                  setOtpOpen(false);
                }}
                onConfirm={() => {
                  if (filtered.filter((school) => selectedIds.has(school.id)).length === 0) return;
                  setOtpOpen(true);
                }}
              />
            ) : null}
            <button type="button" className="btn-primary" onClick={() => setShowAdd(true)}>
              + Add School
            </button>
          </>
        }
      />

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
                    aria-label="Select all schools"
                    checked={
                      filtered.length > 0 &&
                      filtered.every((school) => selectedIds.has(school.id))
                    }
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const all = filtered.every((school) => prev.has(school.id));
                        if (all) return new Set();
                        return new Set(filtered.map((school) => school.id));
                      });
                    }}
                  />
                </th>
              ) : null}
              <th className="w-10 px-2 py-3 sm:px-3">S.NO.</th>
              <th className="w-[22%] px-2 py-3 sm:px-3">School Name</th>
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
                  No schools yet — click Add School to get started.
                </td>
              </tr>
            )}
            {filtered.map((school, index) => {
              const active = school.is_active !== false;
              return (
                <tr key={school.id} className="hover:bg-content-bg/50 align-top">
                  {selecting ? (
                    <td className="bulk-check-cell">
                      <input
                        type="checkbox"
                        className="bulk-check"
                        aria-label={`Select ${school.name}`}
                        checked={selectedIds.has(school.id)}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(school.id)) next.delete(school.id);
                            else next.add(school.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                  ) : null}
                  <td className="px-2 py-3 text-text-muted sm:px-3">{index + 1}</td>
                  <td className="px-2 py-3 font-medium text-text-navy sm:px-3">
                    <Link
                      to={`/students?schoolId=${school.id}&schoolName=${encodeURIComponent(school.name)}`}
                      className="line-clamp-2 text-button-blue hover:underline"
                      title={`View students for ${school.name}`}
                    >
                      {school.name}
                    </Link>
                    <div className="mt-1 text-xs text-text-muted md:hidden">
                      {school.owner_username ?? "—"}
                    </div>
                  </td>
                  <td className="hidden truncate px-2 py-3 text-text md:table-cell sm:px-3">
                    {school.owner_username ?? "—"}
                  </td>
                  <td className="px-2 py-3 font-mono text-xs text-text sm:px-3 sm:text-sm">
                    <span className="break-all">{school.owner_password ?? "—"}</span>
                  </td>
                  <td className="hidden truncate px-2 py-3 text-text lg:table-cell sm:px-3">
                    {school.phone ?? "—"}
                  </td>
                  <td className="hidden px-2 py-3 text-xs text-text-muted sm:table-cell sm:px-3">
                    {formatCalendarDate(school.created_at)}
                  </td>
                  <td className="px-2 py-3 sm:px-3">
                    <ToggleSwitch
                      checked={active}
                      disabled={togglingId === school.id}
                      onChange={() => void toggleActive(school)}
                      label={`${school.name} status`}
                    />
                  </td>
                  <td className="px-2 py-3 sm:px-3">
                    <div className="flex items-center gap-2">
                      <span className="capture-protection-label text-xs text-text-muted">Screen capture<br />protection</span>
                      <ToggleSwitch
                        checked={captureProtected(school)}
                        disabled={captureId === school.id}
                        onChange={() => void toggleCaptureProtection(school)}
                        label={`${school.name} screen capture protection`}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => setEditTarget(school)}
                        className="rounded p-1.5 text-text-muted hover:bg-content-bg hover:text-button-blue"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => setDeleteTarget(school)}
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
        <AddSchoolModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            void loadSchools();
          }}
        />
      )}

      {editTarget && (
        <EditSchoolModal
          school={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setSchools((prev) =>
              prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
            );
            setEditTarget(null);
            void loadSchools();
          }}
        />
      )}

      {otpOpen && (
        <OtpConfirmModal
          title="Delete schools"
          description={`Remove ${filtered.filter((school) => selectedIds.has(school.id)).length} selected school(s) and their related records.`}
          confirmLabel="Delete selected"
          onClose={() => {
            if (!bulkDeleting) setOtpOpen(false);
          }}
          onRequestOtp={async () => {
            const ids = filtered.filter((school) => selectedIds.has(school.id)).map((school) => school.id);
            const { data } = await api.post<{ message?: string; devOtp?: string }>(
              "/admin/schools/bulk-delete/request-otp",
              { ids }
            );
            return { message: data.message, devOtp: data.devOtp };
          }}
          onConfirm={async (otp) => {
            const ids = filtered.filter((school) => selectedIds.has(school.id)).map((school) => school.id);
            setBulkDeleting(true);
            try {
              const { data } = await api.post<{ deleted?: string[] }>(
                "/admin/schools/bulk-delete",
                { ids, otp }
              );
              const deleted = new Set(data.deleted ?? ids);
              setSchools((prev) => prev.filter((school) => !deleted.has(school.id)));
              setSelectedIds(new Set());
              setSelecting(false);
              setOtpOpen(false);
            } catch (err) {
              if (axios.isAxiosError(err)) {
                const body = err.response?.data as ApiErrorBody | undefined;
                throw new Error(body?.message ?? "Failed to delete schools.");
              }
              throw new Error("Failed to delete schools.");
            } finally {
              setBulkDeleting(false);
            }
          }}
        />
      )}

      {deleteTarget && (
        <DeleteSchoolOtpModal
          school={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setSchools((prev) =>
              prev.filter((s) => s.id !== deleteTarget.id)
            );
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

function EditSchoolModal({
  school,
  onClose,
  onSaved,
}: {
  school: School;
  onClose: () => void;
  onSaved: (school: School) => void;
}) {
  const [name, setName] = useState(school.name);
  const [username, setUsername] = useState(school.owner_username ?? "");
  const [password, setPassword] = useState(school.owner_password ?? "");
  const [phone, setPhone] = useState(school.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.put(`/admin/schools/${school.id}`, {
        name: name.trim(),
        phone: phone.trim(),
        ownerUsername: username.trim(),
        ownerPassword: password,
      });
      onSaved({
        ...school,
        name: name.trim(),
        phone: phone.trim(),
        owner_username: username.trim(),
        owner_password: password,
      });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to update school.");
      } else setError("Failed to update school.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-navy">Edit School</h2>
          <button type="button" onClick={onClose} className="text-text-muted" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">School Name *</span>
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

function AddSchoolModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [schoolName, setSchoolName] = useState("");
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
      await api.post("/admin/schools-with-owner", {
        schoolName,
        phoneNumber,
        ownerName: username,
        password,
        confirmPassword,
      });
      onCreated();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to add school.");
      } else setError("Failed to add school.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-navy">Add School</h2>
          <button type="button" onClick={onClose} className="text-text-muted" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">School Name *</span>
              <input required value={schoolName} onChange={(e) => setSchoolName(e.target.value)} className="input-field" placeholder="Enter school name" />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Phone Number *</span>
              <input required value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="input-field" placeholder="Enter phone number" />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1.5 block font-medium">Username *</span>
              <input required value={username} onChange={(e) => setUsername(e.target.value)} className="input-field" placeholder="Enter username" />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Password *</span>
              <input required type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" placeholder="Enter password" />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Confirm Password *</span>
              <input required type="text" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input-field" placeholder="Confirm password" />
            </label>
          </div>
          {error && <div className="alert-error">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Saving…" : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteSchoolOtpModal({
  school,
  onClose,
  onDeleted,
}: {
  school: School;
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
      const { data } = await api.post<{
        message?: string;
        devOtp?: string;
        emailDelivery?: string;
      }>(`/admin/schools/${school.id}/request-delete-otp`);
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
      await api.delete(`/admin/schools/${school.id}`, {
        data: { otp: otp.trim() },
      });
      onDeleted();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to delete school.");
      } else setError("Failed to delete school.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-blue/45 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text-navy">Delete School</h2>
            <p className="mt-1 text-sm text-text-muted">
              {school.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-content-bg"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <p className="mb-4 text-sm text-text">
          This permanently deletes the school, its students, and related data.
          Confirm with a one-time code sent to your admin email.
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
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void requestOtp()}
              className="btn-primary"
            >
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void confirmDelete(e)} className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-navy">
                Verification code
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="input-field tracking-widest"
                placeholder="6-digit code"
              />
            </label>
            <div className="flex flex-wrap justify-between gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void requestOtp()}
                className="text-sm font-medium text-button-blue hover:underline disabled:opacity-60"
              >
                Resend code
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? "Deleting…" : "Confirm delete"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
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
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/**
 * Screen 6 — Add School (Figma):
 * School Name, Owner Name/User ID, Password, Confirm Password, Phone Number, Create
 *
 * Edit mode keeps School Name + Phone only (owner credentials are set at create time).
 */
export function SchoolFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        const { data } = await api.get<{ schools: School[] }>("/admin/schools");
        const school = data.schools.find((s) => s.id === id) ?? null;
        if (!cancelled && school) {
          setName(school.name);
          setPhone(school.phone ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          if (axios.isAxiosError(err)) {
            const body = err.response?.data as ApiErrorBody | undefined;
            setError(body?.message ?? "Failed to load school.");
          } else setError("Failed to load school.");
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
    setError(null);

    if (!isEdit) {
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    try {
      if (isEdit && id) {
        await api.put(`/admin/schools/${id}`, {
          name: name.trim(),
          phone: phone.trim(),
        });
      } else {
        // Combined school + owner teacher account create
        await api.post("/admin/schools-with-owner", {
          name: name.trim(),
          ownerName: ownerName.trim(),
          password,
          phone: phone.trim(),
        });
      }
      navigate("/schools");
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

      <form
        onSubmit={handleSubmit}
        className="max-w-xl space-y-5 rounded-2xl border border-border/60 bg-white p-6 shadow-sm sm:p-8"
      >
        <Field label="School Name" required>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
          />
        </Field>

        {!isEdit && (
          <>
            <Field label="Owner Name / User ID" required>
              <input
                required
                autoComplete="username"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="input-field"
              />
            </Field>

            <Field label="Password" required>
              <input
                type="text"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
              />
            </Field>

            <Field label="Confirm Password" required>
              <input
                type="text"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input-field"
              />
            </Field>
          </>
        )}

        <Field label="Phone Number" required>
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input-field"
          />
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-lg bg-button-blue px-4 py-3 text-sm font-semibold tracking-wider text-white uppercase shadow-sm hover:bg-button-blue-hover disabled:opacity-60 sm:w-auto sm:min-w-[160px]"
        >
          {loading ? "Saving…" : isEdit ? "Update" : "Create"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-text-navy">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}
