import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import axios from "axios";
import api from "../api/client";
import { BulkActionBar, BulkModeButtons, bulkDeleteMessage } from "../components/BulkActionBar";
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
  organization_name?: string | null;
  organization_id?: string | null;
};

/**
 * Notifications — compose and send to schools / institutes
 */
export function NotificationsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [organizations, setOrganizations] = useState<Array<{id:string;name:string}>>([]);
  const [selectedOrganizationIds, setSelectedOrganizationIds] = useState<Set<string>>(new Set());
  const sendingRef = useRef(false);
  const sendRequest = useRef<{fingerprint:string; image:File|null; id:string} | null>(null);
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
  const [otpOpen, setOtpOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
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

  const sentNotifications = useMemo(
    () => notifications.filter((item) => item.audience !== "super_admin"),
    [notifications]
  );

  useEffect(() => {
    void (async () => {
      try {
        const [schoolsRes, institutesRes, organizationsRes] = await Promise.all([
          api.get<{ schools: School[] }>("/admin/schools"),
          api.get<{ institutes: Institute[] }>("/admin/institutes").catch(() => ({
            data: { institutes: [] as Institute[] },
          })),
          api.get<{organizations:Array<{id:string;name:string}>}>("/admin/organizations"),
        ]);
        setSchools(schoolsRes.data.schools);
        setOrganizations(organizationsRes.data.organizations ?? []);
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
    if (sendingRef.current) return;
    setError(null); setSuccess(null);
    type Target = {kind:"schoolId"|"instituteId"|"organizationId"; id:string};
    const targets: Target[] = [
      ...[...selectedSchoolIds].map(id => ({kind:"schoolId" as const,id})),
      ...[...selectedInstituteIds].map(id => ({kind:"instituteId" as const,id})),
      ...[...selectedOrganizationIds].map(id => ({kind:"organizationId" as const,id})),
    ];
    if (!targets.length) { setError("Select at least one school, institute or organization."); return; }
    const fingerprint = JSON.stringify([title.trim(), description.trim()]);
    if (!sendRequest.current || sendRequest.current.fingerprint !== fingerprint || sendRequest.current.image !== imageFile) {
      sendRequest.current = {fingerprint,image:imageFile,id:crypto.randomUUID()};
    }
    const batchId = sendRequest.current.id;
    sendingRef.current = true; setSending(true);
    try {
      const outcomes = await Promise.allSettled(targets.map(target => {
        const requestId = `${batchId}:${target.kind}:${target.id}`;
        if (!imageFile) return api.post("/admin/notifications", {[target.kind]:target.id,title:title.trim(),message:description.trim(),requestId});
        const body = new FormData();
        body.set(target.kind,target.id); body.set("title",title.trim()); body.set("message",description.trim()); body.set("requestId",requestId); body.set("image",imageFile);
        return api.post("/admin/notifications",body);
      }));
      const failed = targets.filter((_,index) => outcomes[index].status === "rejected");
      // Retain the same draft/request keys when retrying failed or timed-out targets.
      setSelectedSchoolIds(new Set(failed.filter(t=>t.kind==="schoolId").map(t=>t.id)));
      setSelectedInstituteIds(new Set(failed.filter(t=>t.kind==="instituteId").map(t=>t.id)));
      setSelectedOrganizationIds(new Set(failed.filter(t=>t.kind==="organizationId").map(t=>t.id)));
      await loadAllNotifications();
      if (failed.length) {
        const first = outcomes.find(outcome => outcome.status === "rejected") as PromiseRejectedResult;
        const detail = axios.isAxiosError(first.reason) ? first.reason.response?.data?.message : "";
        setError(`${targets.length-failed.length} sent; ${failed.length} need retry. Only the remaining recipients are selected.${detail ? ` ${detail}` : ""}`);
      } else {
        setSuccess(`Notification sent to ${targets.length} recipient${targets.length===1?"":"s"}.`);
        setTitle(""); setDescription(""); setImageFile(null);
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImagePreview(null); sendRequest.current = null;
      }
    } catch(err) { setError("Could not finish sending. Retry this draft; completed sends will not be duplicated."); }
    finally { sendingRef.current = false; setSending(false); }
  }

  const targetLabel = useMemo(() => {
    return (n: NotificationRow) => {
      if (n.organization_name) return `Organization: ${n.organization_name}`;
      if (n.organization_id) return "Organization";
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
        <fieldset disabled={sending} className="space-y-5">
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

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-text-navy">Image (optional)</span>
          <input
            key={imageFile ? imageFile.name : "no-image"}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="input-field"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (imagePreview) URL.revokeObjectURL(imagePreview);
              setImageFile(file);
              setImagePreview(file ? URL.createObjectURL(file) : null);
            }}
          />
          {imagePreview ? (
            <div className="mt-2 flex items-start gap-3">
              <img src={imagePreview} alt="" className="max-h-32 max-w-full rounded-lg object-contain" />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  if (imagePreview) URL.revokeObjectURL(imagePreview);
                  setImageFile(null);
                  setImagePreview(null);
                }}
              >
                Remove image
              </button>
            </div>
          ) : null}
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
                  className="text-xs font-semibold text-button-blue hover:underline"
                >
                  {allInstitutesSelected
                    ? "Clear all institutes"
                    : "Send to All Institutes"}
                </button>
              )}
              {organizations.length > 0 && <button type="button" className="text-xs font-semibold text-accent-blue hover:underline" onClick={() => setSelectedOrganizationIds(current => current.size === organizations.length ? new Set() : new Set(organizations.map(org=>org.id)))}>{selectedOrganizationIds.size === organizations.length ? "Clear all organizations" : "Send to All Organizations"}</button>}
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-content-bg/40 p-3">
            {schools.length === 0 && institutes.length === 0 && organizations.length === 0 && (
              <p className="text-sm text-text-muted">
                No schools, institutes or organizations yet.
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
                          className="h-4 w-4 rounded border-border text-button-blue focus:ring-button-blue/30"
                        />
                        {inst.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {organizations.length > 0 && <div className="mt-3 border-t border-border pt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Organizations</div>
              <ul className="space-y-1">{organizations.map(org => <li key={org.id}><label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-text hover:bg-white"><input type="checkbox" checked={selectedOrganizationIds.has(org.id)} onChange={() => setSelectedOrganizationIds(current => {const next=new Set(current); if(next.has(org.id))next.delete(org.id);else next.add(org.id);return next;})} className="h-4 w-4 rounded border-border text-button-blue" />{org.name}</label></li>)}</ul>
            </div>}
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
        </fieldset>
      </form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-text-navy">Sent Notifications</h2>
        {!loading && sentNotifications.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <BulkModeButtons
              selecting={bulkOpen}
              selectedCount={sentNotifications.filter((n) => selectedIds.has(n.id)).length}
              deleting={bulkDeleting}
              onStart={() => setBulkOpen(true)}
              onCancel={() => {
                setSelectedIds(new Set());
                setBulkOpen(false);
                setOtpOpen(false);
              }}
              onConfirm={() => {
                if (sentNotifications.filter((n) => selectedIds.has(n.id)).length === 0) return;
                setOtpOpen(true);
              }}
            />
          </div>
        ) : null}
      </div>
      {bulkOpen && !loading && sentNotifications.length > 0 ? (
        <BulkActionBar
          selectedCount={sentNotifications.filter((n) => selectedIds.has(n.id)).length}
          allSelected={sentNotifications.every((n) => selectedIds.has(n.id))}
          onToggleAll={() => {
            setSelectedIds((prev) => {
              const all = sentNotifications.every((n) => prev.has(n.id));
              if (all) return new Set();
              return new Set(sentNotifications.map((n) => n.id));
            });
          }}
        />
      ) : null}
      <div className="space-y-3">
        {loading && (
          <div className="text-sm text-text-muted">Loading…</div>
        )}
        {!loading && sentNotifications.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-10 text-center text-sm text-text-muted">
            No notifications sent yet. Compose one above to get started.
          </div>
        )}
        {sentNotifications.map((n) => (
          <div
            key={n.id}
            className="rounded-2xl border border-border/60 bg-white p-5 pl-6 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <label className="flex items-center gap-3 pl-1 font-semibold text-text-navy">
                {bulkOpen ? (
                <input
                  type="checkbox"
                  className="bulk-check"
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
            <p className="mt-2 whitespace-pre-wrap text-sm text-text-muted">
              {n.message}
            </p>
            {n.image_url ? (
              <img src={n.image_url} alt="" className="mt-3 max-h-40 max-w-full rounded-lg object-contain" />
            ) : null}
            <div className="mt-3 text-xs font-medium text-accent-blue">
              {targetLabel(n)}
            </div>
          </div>
        ))}
      </div>

      {otpOpen && (
        <OtpConfirmModal
          title="Delete notifications"
          description={`Remove ${sentNotifications.filter((n) => selectedIds.has(n.id)).length} selected notification(s).`}
          confirmLabel="Delete selected"
          onClose={() => {
            if (!bulkDeleting) setOtpOpen(false);
          }}
          onRequestOtp={async () => {
            const ids = sentNotifications.filter((n) => selectedIds.has(n.id)).map((n) => n.id);
            const { data } = await api.post<{ message?: string; devOtp?: string }>(
              "/admin/notifications/bulk-delete/request-otp",
              { ids }
            );
            return { message: data.message, devOtp: data.devOtp };
          }}
          onConfirm={async (otp) => {
            const ids = sentNotifications.filter((n) => selectedIds.has(n.id)).map((n) => n.id);
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
              setOtpOpen(false);
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
