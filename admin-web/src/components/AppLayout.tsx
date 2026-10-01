import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useYear } from "../context/YearContext";
import api from "../api/client";
import { BulkModeButtons } from "./BulkActionBar";
import { HarshaLogo } from "./HarshaLogo";
import { OtpConfirmModal } from "./OtpConfirmModal";

interface NavItem {
  label: string;
  icon: string;
  to: string;
  superOnly?: boolean;
}

const NAV: NavItem[] = [
  { label: "Dashboard", icon: "dashboard", to: "/" },
  { label: "Schools", icon: "school", to: "/schools" },
  { label: "Institutes", icon: "institute", to: "/institutes" },
  { label: "Organization", icon: "extra", to: "/extra-2", superOnly: true },
  { label: "Templates", icon: "templates", to: "/templates" },
  { label: "Models", icon: "model", to: "/models" },
  { label: "Brochures", icon: "brochure", to: "/brochures" },
  { label: "Notifications", icon: "notification", to: "/notifications" },
  { label: "Admin Management", icon: "extra", to: "/extra-1", superOnly: true },
];

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/schools": "Schools",
  "/institutes": "Institutes",
  "/templates": "Templates",
  "/models": "Models",
  "/notifications": "Notifications",
  "/brochures": "Brochures",
  "/extra-1": "Admin Management",
  "/extra-2": "Organization",
  "/students": "Students",
  "/institute-members": "Members",
  "/bulk-upload": "Excel Upload",
  "/form-setup": "Form Setup",
  "/school-info": "School Info",
  "/institute-info": "Institution Info",
};

const ORG_CONTEXT_PATHS = new Set([
  "/students",
  "/institute-members",
  "/bulk-upload",
  "/form-setup",
  "/school-info",
  "/institute-info",
]);

function SideIcon({ name }: { name: string }) {
  const cls = "h-5 w-5 shrink-0";
  switch (name) {
    case "dashboard":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case "school":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6" />
        </svg>
      );
    case "institute":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 20h16M6 20V10h12v10M9 10V6l3-2 3 2v4" />
        </svg>
      );
    case "templates":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      );
    case "model":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
        </svg>
      );
    case "notification":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
      );
    case "brochure":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      );
  }
}

function SidebarNav({
  onNavigate,
  isSuperAdmin,
}: {
  onNavigate?: () => void;
  isSuperAdmin?: boolean;
}) {
  return (
    <nav className="space-y-0.5 px-2 py-2">
      {NAV.filter((item) => !item.superOnly || isSuperAdmin === true).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] ${
              isActive
                ? "nav-active"
                : "font-medium text-text-muted hover:bg-content-bg hover:text-text-navy"
            }`
          }
        >
          <SideIcon name={item.icon} />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

type IncomingNotice = {
  id: string;
  title: string;
  message: string;
  created_at?: string | null;
  audience?: string | null;
};

function parseNoticeDetails(message: string): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  let label: string | null = null;
  for (const line of message.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.endsWith(":") && trimmed.length < 40 && !trimmed.includes(" ")) {
      label = trimmed.slice(0, -1);
      continue;
    }
    if (trimmed.endsWith(":") && trimmed.length < 48) {
      label = trimmed.slice(0, -1);
      continue;
    }
    if (label) {
      rows.push({ label, value: trimmed });
      label = null;
    }
  }
  return rows;
}

function noticeHeadline(
  title: string,
  details: { label: string; value: string }[]
): string {
  const named = title.match(/^(.*) created a new (school|institute)$/i);
  if (named?.[1]?.trim()) return named[1].trim();
  if (/^new (school|institute) created$/i.test(title)) {
    return details.find((row) => row.label === "Created By")?.value?.trim() || title;
  }
  return title;
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { year, years, setYear } = useYear();
  const [searchParams] = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [notices, setNotices] = useState<IncomingNotice[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [openNoticeId, setOpenNoticeId] = useState<string | null>(null);
  const [noticeSelecting, setNoticeSelecting] = useState(false);
  const [noticeSelected, setNoticeSelected] = useState<Set<string>>(new Set());
  const [noticeOtpOpen, setNoticeOtpOpen] = useState(false);
  const [noticeDeleting, setNoticeDeleting] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);

  const studentsSchoolId = searchParams.get("schoolId");
  const studentsSchoolName = searchParams.get("schoolName");
  const instituteId = searchParams.get("instituteId");
  const instituteName = searchParams.get("instituteName");

  const inOrgContext = Boolean(studentsSchoolId || instituteId);
  const hideSidebar = ORG_CONTEXT_PATHS.has(location.pathname) && inOrgContext;

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  const pathKey = `/${location.pathname.split("/").filter(Boolean)[0] ?? ""}`;
  const baseTitle = TITLES[location.pathname] ?? TITLES[pathKey] ?? "Admin";
  const isSchoolDetail =
    location.pathname === "/students" && Boolean(studentsSchoolId);
  const isInstituteDetail =
    location.pathname === "/institute-members" && Boolean(instituteId);

  const title =
    isSchoolDetail && studentsSchoolName
      ? studentsSchoolName
      : isInstituteDetail && instituteName
        ? instituteName
        : baseTitle;

  const isDashboard = location.pathname === "/";

  useEffect(() => {
    if (!isDashboard || user?.isSuperAdmin !== true) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    async function loadUnread() {
      try {
        const { data } = await api.get<{ unreadCount?: number }>(
          "/admin/notifications/unread-count"
        );
        if (!cancelled) setUnreadCount(data.unreadCount ?? 0);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    }
    void loadUnread();
    const timer = window.setInterval(() => void loadUnread(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isDashboard, user?.isSuperAdmin]);

  useEffect(() => {
    if (!noticeOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (noticeRef.current && !noticeRef.current.contains(event.target as Node)) {
        setNoticeOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [noticeOpen]);

  useEffect(() => {
    if (!noticeOpen || user?.isSuperAdmin !== true) return;
    let cancelled = false;
    setNoticesLoading(true);
    void api
      .get<{ notifications?: IncomingNotice[] }>("/admin/notifications")
      .then(({ data }) => {
        if (cancelled) return;
        setNotices(
          (data.notifications ?? []).filter((item) => item.audience === "super_admin")
        );
      })
      .catch(() => {
        if (!cancelled) setNotices([]);
      })
      .finally(() => {
        if (!cancelled) setNoticesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [noticeOpen, user?.isSuperAdmin]);

  async function openIncomingNotice(notice: IncomingNotice) {
    setOpenNoticeId((current) => (current === notice.id ? null : notice.id));
    if (openNoticeId === notice.id) return;
    try {
      await api.post("/admin/notifications/incoming/mark-read", { ids: [notice.id] });
      const { data } = await api.get<{ unreadCount?: number }>(
        "/admin/notifications/unread-count"
      );
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      /* details stay visible; badge refreshes on the next poll */
    }
  }
  const isOrgListPage =
    location.pathname === "/schools" || location.pathname === "/institutes";
  const isOrgDetailListPage =
    (location.pathname === "/students" && Boolean(studentsSchoolId)) ||
    (location.pathname === "/institute-members" && Boolean(instituteId));
  const useLockedPageScroll = isOrgListPage || isOrgDetailListPage;
  const showCenteredHeading = true;

  const sidebarContent = (
    <>
      <div className="shrink-0 border-b border-border px-2 py-2.5">
        {user?.isSuperAdmin === true ? (
          <HarshaLogo compact />
        ) : (
          <div className="px-1 py-1 text-sm">
            {user?.photoUrl ? (
              <img
                src={user.photoUrl}
                alt=""
                className="mb-2 h-16 w-16 rounded-lg bg-white object-contain"
              />
            ) : null}
            <div className="text-text-muted">Hi</div>
            <div className="font-semibold text-text-navy">
              {user?.displayName?.trim() || user?.username || user?.email}
            </div>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav
          onNavigate={() => setMobileOpen(false)}
          isSuperAdmin={user?.isSuperAdmin === true}
        />
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-content-bg">
      {!hideSidebar && (
        <>
          <aside className="app-sidebar hidden h-full shrink-0 flex-col overflow-hidden border-r border-border bg-white lg:flex">
            {sidebarContent}
          </aside>

          {mobileOpen && (
            <button
              type="button"
              aria-label="Close menu overlay"
              className="fixed inset-0 z-30 bg-text-navy/30 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
          )}

          <aside
            className={`app-sidebar fixed inset-y-0 left-0 z-40 flex h-full flex-col overflow-hidden border-r border-border bg-white transition-transform duration-200 lg:hidden ${
              mobileOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            {sidebarContent}
          </aside>
        </>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className={`z-20 flex shrink-0 items-center gap-3 border-b border-border bg-white px-4 py-3 sm:px-6 ${
            useLockedPageScroll ? "" : "sticky top-0"
          }`}
        >
          {hideSidebar && (isSchoolDetail || isInstituteDetail) ? (
            <button
              type="button"
              onClick={() => navigate(isInstituteDetail ? "/institutes" : "/schools")}
              className="rounded-lg p-2 text-text-navy hover:bg-content-bg lg:hidden"
              aria-label="Back to list"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          ) : null}
          {!hideSidebar ? (
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-lg p-2 text-text-navy hover:bg-content-bg lg:hidden"
              aria-label="Toggle menu"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          ) : null}

          <div
            className={`min-w-0 flex-1 truncate ${
              showCenteredHeading
                ? "text-center text-xl font-bold text-button-blue sm:text-2xl"
                : "text-lg font-semibold text-button-blue"
            }`}
          >
            {title.toUpperCase()}
          </div>

          {isDashboard && (
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="max-w-[140px] rounded-lg border border-border bg-white px-2 py-2 text-sm text-text-navy sm:max-w-none sm:px-3"
              aria-label="Academic year"
            >
              {years.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          )}

          {isDashboard ? (
            <div className="relative" ref={noticeRef}>
              <button
                type="button"
                className="relative rounded-lg p-2 text-text-muted hover:bg-content-bg"
                aria-label="Notifications"
                aria-expanded={user?.isSuperAdmin === true ? noticeOpen : undefined}
                onClick={() => {
                  if (user?.isSuperAdmin !== true) {
                    navigate("/notifications");
                    return;
                  }
                  setNoticeOpen((open) => {
                    if (open) {
                      setNoticeSelecting(false);
                      setNoticeSelected(new Set());
                      setNoticeOtpOpen(false);
                      setOpenNoticeId(null);
                    }
                    return !open;
                  });
                }}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
                  <path d="M10 21a2 2 0 0 0 4 0" />
                </svg>
                {user?.isSuperAdmin === true && unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </button>
              {user?.isSuperAdmin === true && noticeOpen ? (
                <div className="absolute right-0 top-full z-30 mt-2 w-[min(28rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-white p-3 shadow-lg">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-text-navy">Notifications</div>
                    {notices.length > 0 ? (
                      <div className="bulk-inline-actions">
                        <BulkModeButtons
                          selecting={noticeSelecting}
                          selectedCount={notices.filter((notice) => noticeSelected.has(notice.id)).length}
                          deleting={noticeDeleting}
                          onStart={() => setNoticeSelecting(true)}
                          onCancel={() => {
                            setNoticeSelected(new Set());
                            setNoticeSelecting(false);
                            setNoticeOtpOpen(false);
                          }}
                          onConfirm={() => {
                            if (notices.filter((notice) => noticeSelected.has(notice.id)).length === 0) {
                              return;
                            }
                            setNoticeOtpOpen(true);
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                  {noticesLoading ? (
                    <div className="px-1 py-3 text-sm text-text-muted">Loading…</div>
                  ) : notices.length === 0 ? (
                    <div className="px-1 py-3 text-sm text-text-muted">No incoming notifications.</div>
                  ) : (
                    <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                      {noticeSelecting ? (
                        <label className="flex items-center gap-2.5 px-3 py-1 text-sm text-text-navy">
                          <input
                            type="checkbox"
                            className="bulk-check"
                            aria-label="Select all notifications"
                            checked={notices.every((notice) => noticeSelected.has(notice.id))}
                            onChange={() => {
                              setNoticeSelected((prev) => {
                                const all = notices.every((notice) => prev.has(notice.id));
                                if (all) return new Set();
                                return new Set(notices.map((notice) => notice.id));
                              });
                            }}
                          />
                          Select all
                        </label>
                      ) : null}
                      {notices.map((notice) => {
                        const open = openNoticeId === notice.id;
                        const details = parseNoticeDetails(notice.message);
                        return (
                          <div key={notice.id} className="rounded-lg border border-border/70">
                            <div className="flex items-center gap-2.5 px-3 py-2">
                              {noticeSelecting ? (
                                <input
                                  type="checkbox"
                                  className="bulk-check"
                                  aria-label={`Select ${notice.title}`}
                                  checked={noticeSelected.has(notice.id)}
                                  onChange={() => {
                                    setNoticeSelected((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(notice.id)) next.delete(notice.id);
                                      else next.add(notice.id);
                                      return next;
                                    });
                                  }}
                                />
                              ) : null}
                              <button
                                type="button"
                                className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
                                onClick={() => void openIncomingNotice(notice)}
                              >
                                <span className="text-sm font-semibold text-text-navy">{noticeHeadline(notice.title, details)}</span>
                                <span className="shrink-0 text-xs text-text-muted">
                                  {notice.created_at
                                    ? new Date(notice.created_at).toLocaleString()
                                    : ""}
                                </span>
                              </button>
                            </div>
                            {open ? (
                              details.length > 0 ? (
                                <dl
                                  className={`grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-border/70 py-2 pr-3 text-sm ${
                                    noticeSelecting ? "pl-10" : "pl-3"
                                  }`}
                                >
                                  {details.map((row) => (
                                    <div key={`${notice.id}-${row.label}`} className="contents">
                                      <dt className="text-text-muted">
                                        {row.label === "Created By" ? "Child Admin" : row.label}
                                      </dt>
                                      <dd className="break-all font-medium text-text-navy">{row.value}</dd>
                                    </div>
                                  ))}
                                </dl>
                              ) : (
                                <p
                                  className={`whitespace-pre-wrap border-t border-border/70 py-2 pr-3 text-sm text-text ${
                                    noticeSelecting ? "pl-10" : "pl-3"
                                  }`}
                                >
                                  {notice.message}
                                </p>
                              )
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {noticeOtpOpen ? (
                    <OtpConfirmModal
                      title="Delete notifications"
                      description={`Remove ${notices.filter((notice) => noticeSelected.has(notice.id)).length} selected notification(s).`}
                      confirmLabel="Delete selected"
                      onClose={() => {
                        if (!noticeDeleting) setNoticeOtpOpen(false);
                      }}
                      onRequestOtp={async () => {
                        const ids = notices
                          .filter((notice) => noticeSelected.has(notice.id))
                          .map((notice) => notice.id);
                        const { data } = await api.post<{ message?: string; devOtp?: string }>(
                          "/admin/notifications/bulk-delete/request-otp",
                          { ids }
                        );
                        return { message: data.message, devOtp: data.devOtp };
                      }}
                      onConfirm={async (otp) => {
                        const ids = notices
                          .filter((notice) => noticeSelected.has(notice.id))
                          .map((notice) => notice.id);
                        setNoticeDeleting(true);
                        try {
                          const { data } = await api.post<{ deleted?: string[] }>(
                            "/admin/notifications/bulk-delete",
                            { ids, otp }
                          );
                          const deleted = new Set(data.deleted ?? ids);
                          setNotices((prev) => prev.filter((notice) => !deleted.has(notice.id)));
                          setNoticeSelected(new Set());
                          setNoticeSelecting(false);
                          setNoticeOtpOpen(false);
                          setOpenNoticeId((current) =>
                            current && deleted.has(current) ? null : current
                          );
                          const unread = await api.get<{ unreadCount?: number }>(
                            "/admin/notifications/unread-count"
                          );
                          setUnreadCount(unread.data.unreadCount ?? 0);
                        } catch (err) {
                          if (axios.isAxiosError(err)) {
                            const body = err.response?.data as { message?: string } | undefined;
                            throw new Error(body?.message ?? "Failed to delete notifications.");
                          }
                          throw new Error("Failed to delete notifications.");
                        } finally {
                          setNoticeDeleting(false);
                        }
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="w-9 shrink-0" aria-hidden />
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-content-bg"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-button-blue text-xs font-bold text-white">
                A
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-semibold text-text-navy">Admin</span>
              </span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-lg border border-border bg-white shadow-lg">
                <div className="truncate border-b border-border px-3 py-2.5 text-xs text-text-muted">
                  {user?.email}
                </div>
                <button
                  type="button"
                  className="block w-full px-3 py-2.5 text-left text-sm text-danger hover:bg-danger-soft"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                    navigate("/login", { replace: true });
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        <main
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden ${
            useLockedPageScroll ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
          <div
            className={`min-h-0 min-w-0 max-w-full ${
              useLockedPageScroll
                ? "flex min-h-0 flex-1 flex-col overflow-hidden px-[clamp(1rem,2.5vw,1.5rem)] pb-4 pt-4"
                : isDashboard
                  ? "px-[clamp(1rem,2.5vw,1.5rem)] py-4"
                  : "px-[clamp(1rem,2.5vw,1.5rem)] py-5"
            }`}
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
