import { useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import { LoginPageLayout } from "../components/LoginPageLayout";
import { useAuth } from "../context/AuthContext";
import type { ApiErrorBody, LoginResponse } from "../types";

function IconField({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block w-full">
      <span className="mb-1.5 block text-sm font-medium text-text-navy">{label}</span>
      <div className="relative w-full">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-muted">
          {icon}
        </span>
        {children}
      </div>
    </label>
  );
}

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>("/auth/login", {
        email: username.trim(),
        password,
      });
      if (data.user.role !== "admin") {
        setError("This panel is for admin accounts only.");
        return;
      }
      login(data.token, data.user);
      navigate("/", { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Login failed. Check your credentials.");
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginPageLayout
      title={
        <span
          className="block text-center"
          onClick={() => navigate("/forgot-password")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigate("/forgot-password");
            }
          }}
          role="presentation"
          tabIndex={-1}
        >
          Admin Login
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <IconField
          label="User ID"
          icon={
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          }
        >
          <input
            type="text"
            autoComplete="username"
            required
            placeholder="Enter your User ID"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input-field-icon w-full min-w-0"
          />
        </IconField>

        <IconField
          label="Password"
          icon={
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          }
        >
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field-icon w-full min-w-0 pr-11"
          />
          <button
            type="button"
            className="absolute inset-y-0 right-3 text-text-muted hover:text-text-navy"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </IconField>

        {error && <div className="alert-error">{error}</div>}

        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-sm sm:text-[15px]">
          {loading ? "Logging in…" : "Login"}
        </button>
      </form>
    </LoginPageLayout>
  );
}
