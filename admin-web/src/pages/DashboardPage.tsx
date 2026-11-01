import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useYear } from "../context/YearContext";
import type { ApiErrorBody, DashboardSummary } from "../types";

const REFRESH_MS = 30_000;

function pct(part: number, total: number): string {
  if (total <= 0) return "0.0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

/** Ring chart: captured share of all photos. */
function CaptureRing({ captured, total, tone }: { captured: number; total: number; tone: "indigo" | "teal" }) {
  const share = total > 0 ? Math.min(1, captured / total) : 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className={`dash-ring dash-ring-${tone}`}>
      <svg viewBox="0 0 128 128" aria-hidden>
        <circle cx="64" cy="64" r={r} className="dash-ring-track" />
        <circle cx="64" cy="64" r={r} className="dash-ring-value" strokeDasharray={`${share * c} ${c}`} transform="rotate(-90 64 64)" />
      </svg>
      <div className="dash-ring-label">
        <b>{pct(captured, total)}</b>
        <span>captured</span>
      </div>
    </div>
  );
}

type PanelProps = {
  title: string;
  tone: "indigo" | "teal";
  count: number;
  countLabel: string;
  link: string;
  people: string; // "Students" / "Members"
  total: number;
  captured: number;
  pending: number;
  active: number;
  inactive: number;
};

/** One big panel per area (Schools / Institutes): count, capture ring, numbers, active vs inactive. */
function OverviewPanel(p: PanelProps) {
  const orgTotal = p.active + p.inactive;
  const activeShare = orgTotal > 0 ? (p.active / orgTotal) * 100 : 0;
  return (
    <section className={`dash-panel dash-panel-${p.tone}`} aria-label={p.title}>
      <header className="dash-panel-head">
        <div>
          <span className="dash-panel-eyebrow">{p.title}</span>
          <div className="dash-panel-count">
            <b>{p.count.toLocaleString()}</b>
            <span>{p.countLabel}</span>
          </div>
        </div>
        <Link to={p.link} className="dash-panel-link">View all →</Link>
      </header>
      <div className="dash-panel-body">
        <CaptureRing captured={p.captured} total={p.total} tone={p.tone} />
        <div className="dash-stats">
          <div className="dash-stat"><span>Total {p.people}</span><b>{p.total.toLocaleString()}</b></div>
          <div className="dash-stat is-good"><span>{p.people} Captured</span><b>{p.captured.toLocaleString()}</b></div>
          <div className="dash-stat is-warn"><span>{p.people} Uncaptured</span><b>{p.pending.toLocaleString()}</b></div>
          <div className="dash-stat"><span>Uncapture Percentage</span><b>{pct(p.pending, p.total)}</b></div>
        </div>
      </div>
      <footer className="dash-panel-foot">
        <div className="dash-active-row">
          <span><i className="dot is-on" /> Active {p.title} <b>{p.active}</b></span>
          <span><i className="dot" /> Inactive {p.title} <b>{p.inactive}</b></span>
        </div>
        <div className="dash-bar" role="img" aria-label={`${p.active} active, ${p.inactive} inactive`}>
          <i style={{ width: `${activeShare}%` }} />
        </div>
      </footer>
    </section>
  );
}

function SuperAdminContactCard() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<{
    phone: string | null;
    whatsapp: string | null;
    facebook: string | null;
    instagram: string | null;
    youtube: string | null;
  } | null>(null);

  useEffect(() => {
    if (user?.isSuperAdmin) return;
    let cancelled = false;
    void api
      .get<{
        phone: string | null;
        whatsapp: string | null;
        facebook?: string | null;
        instagram?: string | null;
        youtube?: string | null;
      }>("/auth/support-contacts")
      .then(({ data }) => {
        if (!cancelled) {
          setContacts({
            phone: data.phone,
            whatsapp: data.whatsapp,
            facebook: data.facebook ?? null,
            instagram: data.instagram ?? null,
            youtube: data.youtube ?? null,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.isSuperAdmin]);

  if (user?.isSuperAdmin || !contacts) return null;
  const rows = [
    ["Phone", contacts.phone],
    ["WhatsApp", contacts.whatsapp],
    ["Facebook", contacts.facebook],
    ["Instagram", contacts.instagram],
    ["YouTube", contacts.youtube],
  ].filter((row) => row[1]);
  if (rows.length === 0) return null;

  return (
    <section className="dashboard-section dashboard-collection">
      <h2 className="dashboard-section-title">Super Admin contact</h2>
      <div className="card grid divide-y divide-border sm:grid-flow-col sm:divide-x sm:divide-y-0">
        {rows.map(([label, value]) => (
          <div key={label} className="px-4 py-2 text-sm">
            <div className="text-xs font-semibold text-text-muted">{label}</div>
            <div className="mt-0.5 break-all text-text-navy">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DashboardPage() {

  const { year } = useYear();

  const location = useLocation();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);



  const loadSummary = useCallback(async (showLoading = true) => {

    if (showLoading) setLoading(true);

    setError(null);

    try {

      const { data } = await api.get<DashboardSummary>("/admin/dashboard-summary", {

        params: { year },

      });

      setSummary(data);

    } catch (err) {

      if (axios.isAxiosError(err)) {

        const body = err.response?.data as ApiErrorBody | undefined;

        setError(body?.message ?? "Failed to load dashboard.");

      } else setError("Failed to load dashboard.");

    } finally {

      if (showLoading) setLoading(false);

    }

  }, [year]);



  useEffect(() => {

    void loadSummary(true);

  }, [year, location.key, loadSummary]);



  useEffect(() => {

    const timer = window.setInterval(() => {

      if (!document.hidden) void loadSummary(false);

    }, REFRESH_MS);

    return () => window.clearInterval(timer);

  }, [loadSummary]);



  const schoolTotal = summary?.schoolPhotos ?? summary?.totalStudents ?? 0;

  const schoolCaptured = summary?.schoolCaptured ?? summary?.totalCaptured ?? 0;

  const schoolPending = summary?.schoolPending ?? summary?.totalUncaptured ?? 0;

  const instituteTotal = summary?.institutePhotos ?? 0;

  const instituteCaptured = summary?.instituteCaptured ?? 0;

  const institutePending = summary?.institutePending ?? 0;



  return (
    <div className="app-page dashboard-page dash-v2">
      {error && <div className="alert-error">{error}</div>}
      <SuperAdminContactCard />
      {loading ? (
        <div className="text-sm text-text-muted">Loading summary…</div>
      ) : (
        <div className="dash-panels">
          <OverviewPanel
            title="Schools"
            tone="indigo"
            count={summary?.totalSchools ?? 0}
            countLabel="Total Schools"
            link="/schools"
            people="Students"
            total={schoolTotal}
            captured={schoolCaptured}
            pending={schoolPending}
            active={summary?.activeSchools ?? 0}
            inactive={summary?.inactiveSchools ?? 0}
          />
          <OverviewPanel
            title="Institutes"
            tone="teal"
            count={summary?.totalInstitutes ?? 0}
            countLabel="Total Institutes"
            link="/institutes"
            people="Members"
            total={instituteTotal}
            captured={instituteCaptured}
            pending={institutePending}
            active={summary?.activeInstitutes ?? 0}
            inactive={summary?.inactiveInstitutes ?? 0}
          />
        </div>
      )}
    </div>
  );
}
