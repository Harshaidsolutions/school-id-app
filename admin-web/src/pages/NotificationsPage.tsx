import { useEffect, useMemo, useState, type FormEvent } from "react";
import axios from "axios";
import api from "../api/client";
import { BulkActionBar, bulkDeleteMessage } from "../components/BulkActionBar";
import { OtpConfirmModal } from "../components/OtpConfirmModal";
import type {
  ApiErrorBody,
  Institute,
  NotificationItem,
  School,
} from "../types";

type NotificationRow = NotificationItem & {
  school_name?: string | null;
  institute_name?: string | null;
};

/**
 * Notifications — compose and send to schools / institutes
 */
export function NotificationsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<Set<string>>(
    new Set()
  );
  const [selectedInstituteIds, setSelectedInstituteIds] = useState<Set<string>>(
    new Set()
  );
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<NotificationRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadAllNotifications() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ notifications: NotificationRow[] }>(
        "/admin/notifications"
      );
      setNotifications(data.notifications ?? []);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to load notifications.");
      } else setError("Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const [schoolsRes, institutesRes] = await Promise.all([
          api.get<{ schools: School[] }>("/admin/schools"),
          api.get<{ institutes: Institute[] }>("/admin/institutes").catch(() => ({
            data: { institutes: [] as Institute[] },
          })),
        ]);
        setSchools(schoolsRes.data.schools);
        setInstitutes(institutesRes.data.institutes ?? []);
        await loadAllNotifications();
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const body = err.response?.data as ApiErrorBody | undefined;
          setError(body?.message ?? "Failed to load schools.");
        } else setError("Failed to load schools.");
      }
    })();
  }, []);

  const allSchoolsSelected =
    schools.length > 0 && selectedSchoolIds.size === schools.length;

  const allInstitutesSelected =
    institutes.length > 0 && selectedInstituteIds.size === institutes.length;

  function toggleAllSchools() {
    if (allSchoolsSelected) {
      setSelectedSchoolIds(new Set());
    } else {
      setSelectedSchoolIds(new Set(schools.map((s) => s.id)));
    }
  }

  function toggleAllInstitutes() {
    if (allInstitutesSelected) {
      setSelectedInstituteIds(new Set());
    } else {
      setSelectedInstituteIds(new Set(institutes.map((i) => i.id)));
    }
  }

  function toggleSchool(id: string) {
    setSelectedSchoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleInstitute(id: string) {
    setSelectedInstituteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const schoolTargets = [...selectedSchoolIds];
    const instituteTargets = [...selectedInstituteIds];

    if (schoolTargets.length === 0 && instituteTargets.length === 0) {
      setError("Select at least one school or institute.");
      return;
    }

    setSending(true);
    try {
      await Promise.all([
        ...schoolTargets.map((schoolId) =>
          api.post("/admin/notifications", {
            schoolId,
            title: title.trim(),
            message: description.trim(),
          })
        ),
        ...instituteTargets.map((instituteId) =>
          api.post("/admin/notifications", {
            instituteId,
            title: title.trim(),
            message: description.trim(),
          })
        ),
      ]);

      setTitle("");
      setDescription("");
      setSelectedSchoolIds(new Set());
      setSelectedInstituteIds(new Set());

      const parts: string[] = [];
      if (schoolTargets.length) {
        parts.push(
          `${schoolTargets.length} school${schoolTargets.length === 1 ? "" : "s"}`
        );
      }
      if (instituteTargets.length) {
        parts.push(
          `${instituteTargets.length} institute${instituteTargets.length === 1 ? "" : "s"}`
        );
      }
      setSuccess(`Notification sent to ${parts.join(" and ")}.`);
      await loadAllNotifications();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to send notification.");
      } else setError("Failed to send notification.");
    } finally {
      setSending(false);
    }
  }

  const targetLabel = useMemo(() => {
    return (n: NotificationRow) => {
      if (n.institute_name) return `Institute: ${n.institute_name}`;
      if (n.school_name) return `School: ${n.school_name}`;
      if (n.institute_id) return "Institute";
      if (n.school_id) return "School";
      return "—";
    };
  }, []);

  return (
    <div>
      <form
        onSubmit={handleSend}
        className="mb-8 space-y-5 card p-6 sm:p-7"
      >
        <h2 className="text-base font-semibold text-text-navy">Compose Notification</h2>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-text-navy">Title</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-text-navy">
            Description
          </span>
          <textarea
            required
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field resize-y"
          />
        </label>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-text-navy">Send to</span>
            <div className="flex flex-wrap gap-3">
              {schools.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAllSchools}
                  className="text-xs font-semibold text-accent-blue hover:underline"
                >
                  {allSchoolsSelected ? "Clear all schools" : "Send to All Schools"}
                </button>
              )}
              {institutes.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAllInstitutes}
                  className="text-xs font-semibold text-accent-purple hover:underline"
                >
                  {allInstitutesSelected
                    ? "Clear all institutes"
                    : "Send to All Institutes"}
                </button>
              )}
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-content-bg/40 p-3">
            {schools.length === 0 && institutes.length === 0 && (
              <p className="text-sm text-text-muted">
                No schools or institutes yet.
              </p>
            )}

            {schools.length > 0 && (
              <div className="mb-2">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  Schools
                </div>
                <ul className="space-y-1">
                  {schools.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-text hover:bg-white">
                        <input
                          type="checkbox"
                          checked={selectedSchoolIds.has(s.id)}
                          onChange={() => toggleSchool(s.id)}
                          className="h-4 w-4 rounded border-border text-button-blue focus:ring-button-blue/30"
                        />
                        {s.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {institutes.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  Institutes
                </div>
                <ul className="space-y-1">
                  {institutes.map((inst) => (
                    <li key={inst.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-text hover:bg-white">
                        <input
                          type="checkbox"
                          checked={selectedInstituteIds.has(inst.id)}
                          onChange={() => toggleInstitute(inst.id)}
                          className="h-4 w-4 rounded border-border text-accent-purple focus:ring-accent-purple/30"
                        />
                        {inst.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {error && <div className="alert-error">{error}</div>}
        {success && <div className="alert-success">{success}</div>}

        <button
          type="submit"
          disabled={sending}
          className="rounded-lg bg-button-blue px-6 py-3 text-sm font-semibold tracking-wider text-white uppercase shadow-sm hover:bg-button-blue-hover disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>

      <h2 className="mb-3 text-lg font-semibold text-text-navy">
        Sent Notifications
      </h2>
      {!loading && notifications.length > 0 ? (
        <button type="button" className="btn-secondary mb-3" onClick={() => setBulkOpen(true)}>
          Bulk Delete
        </button>
      ) : null}
      {bulkOpen && !loading && notifications.length > 0 ? (
        <BulkActionBar
          selectedCount={notifications.filter((n) => selectedIds.has(n.id)).length}
          allSelected={notifications.every((n) => selectedIds.has(n.id))}
          deleting={bulkDeleting}
          onToggleAll={() => {
            setSelectedIds((prev) => {
              const all = notifications.every((n) => prev.has(n.id));
              if (all) return new Set();
              return new Set(notifications.map((n) => n.id));
            });
          }}
          onClear={() => {
            setSelectedIds(new Set());
            setBulkOpen(false);
          }}
          onDelete={() => {
            if (notifications.filter((n) => selectedIds.has(n.id)).length === 0) return;
            setBulkOpen(true);
          }}
        />
      ) : null}
      <div className="space-y-3">
        {loading && (
          <div className="text-sm text-text-muted">Loading…</div>
        )}
        {!loading && notifications.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-10 text-center text-sm text-text-muted">
            No notifications sent yet. Compose one above to get started.
          </div>
        )}
        {notifications.map((n) => (
          <div
            key={n.id}
            className="rounded-2xl border border-border/60 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <label className="flex items-center gap-2 font-semibold text-text-navy">
                {bulkOpen ? (
                <input
                  type="checkbox"
                  checked={selectedIds.has(n.id)}
                  onChange={() => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(n.id)) next.delete(n.id);
                      else next.add(n.id);
                      return next;
                    });
                  }}
                />
                ) : null}
                {n.title}
              </label>
              <div className="flex items-center gap-3">
                <div className="text-xs text-text-muted">
                  {n.created_at
                    ? new Date(n.created_at).toLocaleString()
                    : ""}
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(n)}
                  className="text-xs font-semibold text-danger hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="mt-2 line-clamp-3 text-sm text-text-muted whitespace-pre-wrap">
              {n.message}
            </p>
            <div className="mt-3 text-xs font-medium text-accent-blue">
              {targetLabel(n)}
            </div>
          </div>
        ))}
      </div>

      {bulkOpen && (
        <OtpConfirmModal
          title="Delete notifications"
          description={`Remove ${notifications.filter((n) => selectedIds.has(n.id)).length} selected notification(s).`}
          confirmLabel="Delete selected"
          onClose={() => {
            if (!bulkDeleting) setBulkOpen(false);
          }}
          onRequestOtp={async () => {
            const ids = notifications.filter((n) => selectedIds.has(n.id)).map((n) => n.id);
            const { data } = await api.post<{ message?: string; devOtp?: string }>(
              "/admin/notifications/bulk-delete/request-otp",
              { ids }
            );
            return { message: data.message, devOtp: data.devOtp };
          }}
          onConfirm={async (otp) => {
            const ids = notifications.filter((n) => selectedIds.has(n.id)).map((n) => n.id);
            setBulkDeleting(true);
            try {
              const { data } = await api.post<{
                deleted: string[];
                deletedCount: number;
                failedCount: number;
              }>("/admin/notifications/bulk-delete", { ids, otp });
              const message = bulkDeleteMessage(data);
              setError(message);
              setNotifications((prev) => prev.filter((item) => !data.deleted?.includes(item.id)));
              setSelectedIds(new Set());
              setBulkOpen(false);
              setBulkOpen(false);
            } catch (err) {
              if (axios.isAxiosError(err)) {
                const body = err.response?.data as ApiErrorBody | undefined;
                throw new Error(body?.message ?? "Failed to delete notifications.");
              }
              throw new Error("Failed to delete notifications.");
            } finally {
              setBulkDeleting(false);
            }
          }}
        />
      )}

      {deleteTarget && (
        <OtpConfirmModal
          title="Delete notification"
          description={`Remove "${deleteTarget.title}" permanently.`}
          confirmLabel="Delete notification"
          onClose={() => setDeleteTarget(null)}
          onRequestOtp={async () => {
            try {
              const { data } = await api.post<{
                message?: string;
                devOtp?: string;
              }>(`/admin/notifications/${deleteTarget.id}/request-delete-otp`);
              return { message: data.message, devOtp: data.devOtp };
            } catch (err) {
              if (axios.isAxiosError(err)) {
                const body = err.response?.data as ApiErrorBody | undefined;
                throw new Error(body?.message ?? "Failed to send OTP.");
              }
              throw new Error("Failed to send OTP.");
            }
          }}
          onConfirm={async (otp) => {
            try {
              await api.delete(`/admin/notifications/${deleteTarget.id}`, {
                data: { otp },
              });
              setNotifications((prev) =>
                prev.filter((item) => item.id !== deleteTarget.id)
              );
              setDeleteTarget(null);
            } catch (err) {
              if (axios.isAxiosError(err)) {
                const body = err.response?.data as ApiErrorBody | undefined;
                throw new Error(body?.message ?? "Failed to delete notification.");
              }
              throw new Error("Failed to delete notification.");
            }
          }}
        />
      )}
    </div>
  );
}
