import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LoginPage } from "../pages/LoginPage";

export function ProtectedRoute() {
  const { isAuthenticated, authReady } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-content-bg text-sm text-text-muted">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    // The login screen lives at the site root (no "/login" in the address bar).
    if (location.pathname === "/") return <LoginPage />;
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
