import { useEffect, useState } from "react";
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
  username: string | null;
  password: string | null;
  created_at: string | null;
  is_active: boolean;
  people_count: number;
  captured_photos: number;
  pending_photos: number;
};

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  const text = value?.trim() ? value : "—";
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-text-navy">{text}</p>
    </div>
  );
}

function formatCreated(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function PasswordValue({ value }: { value: string | null }) {
  const [shown, setShown] = useState(false);
  const password = value?.trim() ?? "";
  if (!password) return <>—</>;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <span className={shown ? "break-all font-mono text-xs" : "font-mono text-xs tracking-wider"}>
        {shown ? password : "••••••••"}
      </span>
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border text-text-navy"
        aria-label={shown ? "Hide password" : "Show password"}
        onClick={() => setShown((open) => !open)}
      >
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </span>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5" />
      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.4 18.4 0 0 1-4.1 4.8" />
      <path d="M6.1 6.1C3.8 7.8 2 12 2 12s3.5 6 10 6c1.5 0 2.9-.3 4.1-.8" />
    </svg>
  );
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
      <div className="overflow-x-auto">
        <table className="list-data-table w-full">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Username</th>
              <th className="px-3 py-2 text-left">Password</th>
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
                <td colSpan={8} className="px-3 py-6 text-center text-text-muted">
                  None yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{row.username?.trim() || "—"}</td>
                  <td className="px-3 py-2">
                    <PasswordValue value={row.password} />
                  </td>
                  <td className="px-3 py-2">{row.people_count}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatCreated(row.created_at)}</td>
                  <td className="px-3 py-2">{row.is_active ? "Active" : "Inactive"}</td>
                  <td className="px-3 py-2">{row.captured_photos}</td>
                  <td className="px-3 py-2">{row.pending_photos}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ChildAdminDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [admin, setAdmin] = useState<AdminRow | null>(null);
  const [schools, setSchools] = useState<OrgRow[]>([]);
  const [institutes, setInstitutes] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="app-page space-y-4">
      <Link to="/extra-1" className="text-sm font-semibold text-button-blue hover:underline">
        Back to Admin Management
      </Link>
      <h1 className="text-xl font-bold text-text-navy">Created Admin Details</h1>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading || !admin ? (
        <p className="text-text-muted">Loading…</p>
      ) : (
        <>
          <section className="card grid gap-3 p-4 sm:grid-cols-2">
            <Detail label="Admin/Company Name" value={admin.display_name} />
            <Detail label="Email" value={admin.email} />
            <Detail label="Phone" value={admin.phone} />
            <Detail label="WhatsApp" value={admin.whatsapp} />
            <Detail label="Facebook" value={admin.facebook_url} />
            <Detail label="Instagram" value={admin.instagram_url} />
            <Detail label="YouTube" value={admin.youtube_url} />
            <Detail label="About Us" value={admin.about_us} />
            <Detail label="Status" value={admin.is_active === false ? "Inactive" : "Active"} />
          </section>
          <OrgTable title="Total Schools" peopleLabel="Students" rows={schools} />
          <OrgTable title="Total Institutes" peopleLabel="Members" rows={institutes} />
        </>
      )}
    </div>
  );
}
