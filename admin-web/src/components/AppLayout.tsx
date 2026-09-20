import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useYear } from "../context/YearContext";
import { HarshaLogo } from "./HarshaLogo";

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
  { label: "Templates", icon: "templates", to: "/templates" },
  { label: "Models", icon: "model", to: "/models" },
  { label: "Notifications", icon: "notification", to: "/notifications" },
  { label: "Brochures", icon: "brochure", to: "/brochures" },
  { label: "Admin Management", icon: "extra", to: "/extra-1", superOnly: true },
  { label: "Extra Section 2", icon: "extra", to: "/extra-2" },
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
  "/extra-2": "Extra Section 2",
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

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { year, years, setYear } = useYear();
  const [searchParams] = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
  const isOrgListPage =
    location.pathname === "/schools" || location.pathname === "/institutes";
  const showCenteredHeading = true;

  const sidebarContent = (
    <>
      <div className="shrink-0 border-b border-border px-2 py-2.5">
        {user?.isSuperAdmin === true ? (
          <HarshaLogo compact />
        ) : (
          <div className="px-1 py-1 text-sm">
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b border-border bg-white px-4 py-3 sm:px-6">
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
            <button
              type="button"
              className="relative rounded-lg p-2 text-text-muted hover:bg-content-bg"
              aria-label="Notifications"
              onClick={() => navigate("/notifications")}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
                <path d="M10 21a2 2 0 0 0 4 0" />
              </svg>
            </button>
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
          className={`min-h-0 min-w-0 flex-1 overflow-x-hidden ${
            isOrgListPage ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
          <div
            className={`min-w-0 max-w-full ${
              isDashboard ? "px-[clamp(1rem,2.5vw,1.5rem)] py-4" : "px-[clamp(1rem,2.5vw,1.5rem)] py-5"
            } ${isOrgListPage ? "flex h-full min-h-0 flex-col" : ""}`}
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
