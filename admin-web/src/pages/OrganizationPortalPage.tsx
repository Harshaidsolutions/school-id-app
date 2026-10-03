import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import type { ApiErrorBody } from "../types";

type OrganizationRow = {
  id: string;
  name: string;
  phone: string | null;
  username: string | null;
  is_active: boolean;
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
  values: Record<string, { text: string | null; hasPhoto: boolean }>;
};

export function OrganizationPortalPage() {
  const [rows, setRows] = useState<OrganizationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="app-page">
      <div className="mb-4 flex items-center justify-end">
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>Add Organization</button>
      </div>
      {error ? <div className="alert-error mb-4">{error}</div> : null}
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-[#F8FAFC] text-left">
            <tr>
              <th className="px-4 py-3">S.No</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Phone</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-text-muted" colSpan={4}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-text-muted" colSpan={4}>No organizations yet.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-3">{index + 1}</td>
                <td className="px-4 py-3 font-semibold">
                  <Link className="text-button-blue hover:underline" to={`/extra-2/${row.id}`}>{row.name}</Link>
                </td>
                <td className="px-4 py-3">{row.username || "—"}</td>
                <td className="px-4 py-3">{row.phone || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? <AddOrganizationModal onClose={() => setOpen(false)} onCreated={() => { setOpen(false); void load(); }} /> : null}
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

  async function load() {
    const { data } = await api.get<{
      organization: { name: string };
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

  async function shareLink() {
    if (!link) return;
    if (navigator.share) {
      await navigator.share({ title: name, url: link });
      return;
    }
    await navigator.clipboard.writeText(link);
    setNotice("Link copied.");
  }

  return (
    <div className="app-page space-y-4">
      <button type="button" className="text-sm font-semibold text-button-blue" onClick={() => navigate("/extra-2")}>← Organizations</button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">{name}</p>
        <button type="button" className="btn-primary" onClick={() => setBuilding(true)}>Create Link</button>
      </div>
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
              <th className="px-4 py-3">S.No</th>
              {fields.map((field) => <th key={field.id} className="px-4 py-3">{field.field_name}</th>)}
            </tr>
          </thead>
          <tbody>
            {submissions.length === 0 ? (
              <tr><td className="px-4 py-8 text-text-muted" colSpan={Math.max(1, fields.length + 1)}>No submissions yet.</td></tr>
            ) : submissions.map((row) => (
              <tr key={row.id} className="border-t border-border">
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
        <label className="block text-sm"><span className="mb-1.5 block font-medium">Phone</span><input className="input-field" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1.5 block font-medium">Username *</span><input required className="input-field" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1.5 block font-medium">Password *</span><input required type="password" className="input-field" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1.5 block font-medium">Confirm Password *</span><input required type="password" className="input-field" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
        {error ? <div className="alert-error">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Create"}</button>
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
