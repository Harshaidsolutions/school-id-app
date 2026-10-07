import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { Link, useLocation } from "react-router-dom";

import axios from "axios";

import api from "../api/client";

import { useAuth } from "../context/AuthContext";
import { useYear } from "../context/YearContext";

import type { ApiErrorBody, DashboardSummary } from "../types";



const REFRESH_MS = 30_000;



function MetricCard({

  label,

  value,

  icon,

  iconBg,

  iconColor,

  cardClass = "",

  linkTo,

  suffix,

  spanTwo,

}: {

  label: string;

  value: string | number;

  icon: ReactNode;

  iconBg: string;

  iconColor: string;

  cardClass?: string;

  linkTo?: string;

  suffix?: string;

  spanTwo?: boolean;

}) {

  return (

    <div className={`dashboard-stat-card h-full ${cardClass} ${spanTwo ? "dashboard-stat-card-span-2" : ""}`}>

      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}>

        {icon}

      </div>

      <div className="min-w-0 flex-1">

        <div className="text-xs text-text-muted">{label}</div>

        <div className="mt-0.5 text-xl font-bold text-text-navy">

          {typeof value === "number" ? value.toLocaleString() : value}

          {suffix ? <span className="text-base">{suffix}</span> : null}

        </div>

        {linkTo && (

          <Link to={linkTo} className="mt-1 inline-block text-[11px] font-semibold text-button-blue hover:underline">

            View all

          </Link>

        )}

      </div>

    </div>

  );

}



function pct(part: number, total: number): string {

  if (total <= 0) return "0.0%";

  return `${((part / total) * 100).toFixed(1)}%`;

}



function StatusPill({ label, value, tone }: { label: string; value: number; tone: string }) {

  return (

    <div className={`h-full rounded-xl border px-4 py-4 text-center ${tone}`}>

      <div className="text-2xl font-bold">{value.toLocaleString()}</div>

      <div className="mt-1 text-xs font-semibold uppercase tracking-wide">{label}</div>

    </div>

  );

}



function MetricPatternGrid({

  cards,

  cardStyle,

  icon,

}: {

  cards: Array<{

    label: string;

    value: string | number;

    linkTo?: string;

  }>;

  cardStyle: Array<{ iconBg: string; iconColor: string; cardClass?: string }>;

  icon: ReactNode;

}) {

  return (

    <div className="dashboard-pattern-grid">

      {cards.map((card, i) => (

        <MetricCard

          key={card.label}

          {...card}

          {...cardStyle[i % cardStyle.length]}

          icon={icon}

          spanTwo={i >= 4}

        />

      ))}

    </div>

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
    <section className="dashboard-section">
      <h2 className="dashboard-section-title">Super Admin contact</h2>
      <div className="card divide-y divide-border">
        {rows.map(([label, value]) => (
          <div key={label} className="px-4 py-3 text-sm">
            <div className="text-xs font-semibold uppercase text-text-muted">{label}</div>
            <div className="mt-1 text-text-navy">{value}</div>
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



  const schoolCards = useMemo(

    () => [

      { label: "Total Schools", value: summary?.totalSchools ?? 0, linkTo: "/schools" },

      { label: "Total Students", value: schoolTotal },

      { label: "Students Captured", value: schoolCaptured },

      { label: "Students Uncaptured", value: schoolPending },

      { label: "Capture Percentage", value: pct(schoolCaptured, schoolTotal) },

      { label: "Uncapture Percentage", value: pct(schoolPending, schoolTotal) },

    ],

    [summary, schoolTotal, schoolCaptured, schoolPending]

  );



  const instituteCards = useMemo(

    () => [

      { label: "Total Institutes", value: summary?.totalInstitutes ?? 0, linkTo: "/institutes" },

      { label: "Total Members", value: instituteTotal },

      { label: "Members Captured", value: instituteCaptured },

      { label: "Members Uncaptured", value: institutePending },

      { label: "Capture Percentage", value: pct(instituteCaptured, instituteTotal) },

      { label: "Uncapture Percentage", value: pct(institutePending, instituteTotal) },

    ],

    [summary, instituteTotal, instituteCaptured, institutePending]

  );



  const cardStyle = [

    { iconBg: "bg-white/80", iconColor: "text-button-blue", cardClass: "bg-[#EFF6FF]" },

    { iconBg: "bg-white/80", iconColor: "text-[#22C55E]", cardClass: "bg-[#F0FDF4]" },

    { iconBg: "bg-white/80", iconColor: "text-primary-orange", cardClass: "bg-[#FFF7ED]" },

    { iconBg: "bg-white/80", iconColor: "text-accent-purple", cardClass: "bg-[#F5F3FF]" },

    { iconBg: "bg-white/80", iconColor: "text-[#38BDF8]", cardClass: "bg-[#F0F9FF]" },

    { iconBg: "bg-white/80", iconColor: "text-accent-pink", cardClass: "bg-[#FDF2F8]" },

  ];



  const icon = (

    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">

      <rect x="4" y="4" width="16" height="16" rx="2" />

    </svg>

  );



  return (

    <div className="app-page dashboard-page space-y-6 pb-2 sm:space-y-8">

      {error && <div className="alert-error">{error}</div>}
      <SuperAdminContactCard />

      {loading ? (

        <div className="text-sm text-text-muted">Loading summary…</div>

      ) : (

        <>

          <section className="dashboard-section">

            <h2 className="dashboard-section-title">Schools</h2>

            <MetricPatternGrid cards={schoolCards} cardStyle={cardStyle} icon={icon} />

          </section>



          <section className="dashboard-section">

            <h2 className="dashboard-section-title">Institutes</h2>

            <MetricPatternGrid cards={instituteCards} cardStyle={cardStyle} icon={icon} />

          </section>



          <section className="dashboard-section">
            <div className="dashboard-status-grid">

              <StatusPill

                label="Active Schools"

                value={summary?.activeSchools ?? 0}

                tone="border-[#BBF7D0] bg-[#F0FDF4] text-[#22C55E]"

              />

              <StatusPill

                label="Inactive Schools"

                value={summary?.inactiveSchools ?? 0}

                tone="border-[#E2E8F0] bg-[#EFF6FF] text-[#64748B]"

              />

              <StatusPill

                label="Active Institutes"

                value={summary?.activeInstitutes ?? 0}

                tone="border-[#BBF7D0] bg-[#F0FDF4] text-[#22C55E]"

              />

              <StatusPill

                label="Inactive Institutes"

                value={summary?.inactiveInstitutes ?? 0}

                tone="border-[#E2E8F0] bg-[#EFF6FF] text-[#64748B]"

              />

            </div>

          </section>

        </>

      )}

    </div>

  );

}

