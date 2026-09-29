import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { ApiErrorBody } from "../types";

type AdminRow = {
  id: string;
  email: string;
  display_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  about_us: string | null;
  is_active: boolean;
};

type OrgRow = {
  id: string;
  name: string;
  created_at: string | null;
  is_active: boolean;
  people_count: number;
  captured_photos: number;
  pending_photos: number;
};

type FormState = {
  displayName: string;
  email: string;
  phone: string;
  whatsapp: string;
  facebook: string;
  instagram: string;
  youtube: string;
  aboutUs: string;
};

function formatCreated(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function OrgTable({
  title,
  peopleLabel,
  rows,
}: {
  title: string;
  peopleLabel: string;
  rows: OrgRow[];
}) {
  return (
    <section className="card overflow-hidden">
      <h2 className="border-b border-border px-4 py-3 font-semibold text-text-navy">
        {title}: {rows.length}
      </h2>
      <table className="list-data-table w-full">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left">Name</th>
            <th className="px-3 py-2 text-left">{peopleLabel}</th>
            <th className="px-3 py-2 text-left">Created</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Captured Photos</th>
            <th className="px-3 py-2 text-left">Pending Photos</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                None yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.people_count}</td>
                <td className="px-3 py-2">{formatCreated(row.created_at)}</td>
                <td className="px-3 py-2">{row.is_active ? "Active" : "Inactive"}</td>
                <td className="px-3 py-2">{row.captured_photos}</td>
                <td className="px-3 py-2">{row.pending_photos}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

export function ChildAdminDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [admin, setAdmin] = useState<AdminRow | null>(null);
  const [schools, setSchools] = useState<OrgRow[]>([]);
  const [institutes, setInstitutes] = useState<OrgRow[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{
        admin: AdminRow;
        schools: OrgRow[];
        institutes: OrgRow[];
      }>(`/admin/managed-admins/${id}/overview`);
      setAdmin(data.admin);
      setSchools(data.schools);
      setInstitutes(data.institutes);
      setForm({
        displayName: data.admin.display_name ?? "",
        email: data.admin.email,
        phone: data.admin.phone ?? "",
        whatsapp: data.admin.whatsapp ?? "",
        facebook: data.admin.facebook_url ?? "",
        instagram: data.admin.instagram_url ?? "",
        youtube: data.admin.youtube_url ?? "",
        aboutUs: data.admin.about_us ?? "",
      });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Could not load this admin.");
      } else setError("Could not load this admin.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  if (!user?.isSuperAdmin) {
    return (
      <div className="app-page">
        <p className="text-text-muted">Super admin access is required.</p>
      </div>
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!id || !form) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put(`/admin/managed-admins/${id}`, form);
      setSaved(true);
      await load();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Could not save these details.");
      } else setError("Could not save these details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-page space-y-4">
      <Link to="/extra-1" className="text-sm font-semibold text-button-blue hover:underline">
        Back to Admin Management
      </Link>
      <h1 className="text-xl font-bold text-text-navy">Child Admin Details</h1>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {saved ? <p className="text-sm text-text-navy">Saved. The app will use these details on the next refresh.</p> : null}
      {loading || !form ? (
        <p className="text-text-muted">Loading…</p>
      ) : (
        <>
          <form onSubmit={(e) => void save(e)} className="card space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-text-navy">
                Name
                <input
                  className="input-field"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  required
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-text-navy">
                Email
                <input
                  className="input-field"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-text-navy">
                Phone
                <input
                  className="input-field"
                  value={form.phone}
                  maxLength={10}
                  onChange={(e) =>
                    setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })
                  }
                  required
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-text-navy">
                WhatsApp
                <input
                  className="input-field"
                  value={form.whatsapp}
                  onChange={(e) =>
                    setForm({ ...form, whatsapp: e.target.value.replace(/\D/g, "").slice(0, 15) })
                  }
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-text-navy">
                Facebook
                <input
                  className="input-field"
                  value={form.facebook}
                  onChange={(e) => setForm({ ...form, facebook: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-text-navy">
                Instagram
                <input
                  className="input-field"
                  value={form.instagram}
                  onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-text-navy sm:col-span-2">
                YouTube
                <input
                  className="input-field"
                  value={form.youtube}
                  onChange={(e) => setForm({ ...form, youtube: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-text-navy sm:col-span-2">
                About Us
                <textarea
                  className="input-field"
                  rows={4}
                  value={form.aboutUs}
                  onChange={(e) => setForm({ ...form, aboutUs: e.target.value })}
                />
              </label>
            </div>
            <p className="text-sm text-text-muted">
              Account status: {admin?.is_active === false ? "Inactive" : "Active"}
            </p>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
          <OrgTable title="Total Schools" peopleLabel="Students" rows={schools} />
          <OrgTable title="Total Institutes" peopleLabel="Members" rows={institutes} />
        </>
      )}
    </div>
  );
}
