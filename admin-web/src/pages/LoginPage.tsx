import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
      <span className="mb-1 block text-[13px] font-semibold text-[#45468C]">{label}</span>
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
  const [contacts, setContacts] = useState<{
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
  }>({
    email: null,
    phone: null,
    whatsapp: null,
  });

  useEffect(() => {
    let cancelled = false;
    void api
      .get<{ email?: string | null; phone: string | null; whatsapp: string | null }>(
        "/auth/support-contacts"
      )
      .then(({ data }) => {
        if (!cancelled) {
          setContacts({
            email: data.email ?? null,
            phone: data.phone ?? null,
            whatsapp: data.whatsapp ?? null,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>("/auth/login", {
        audience: "admin",
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
      appBrand
      brandAccent
      titleClassName="text-text-navy"
      onTitlePress={() => navigate("/forgot-password")}
      title="Welcome Admin"
      footer={
        <SuperAdminContacts
          email={contacts.email}
          phone={contacts.phone}
          whatsapp={contacts.whatsapp}
        />
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
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

        <button type="submit" disabled={loading} className="btn-primary h-10 w-full text-[15px]">
          {loading ? "Logging in…" : "Login"}
        </button>
      </form>
    </LoginPageLayout>
  );
}

/** Same admin WhatsApp already used by the app when the profile number is empty. */
const CONFIGURED_ADMIN_WHATSAPP = "7799881779";

function waDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function formatWhatsApp(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith("91")) {
    const local = digits.slice(2);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  const trimmed = value.trim();
  return trimmed.startsWith("+") ? trimmed : `+${digits || trimmed}`;
}

function SuperAdminContacts({
  email,
  phone,
  whatsapp,
}: {
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
}) {
  const chat = whatsapp?.trim() || phone?.trim() || CONFIGURED_ADMIN_WHATSAPP;
  const mail = email?.trim() || null;
  if (!chat && !mail) return null;
  return (
    <div className="login-support">
      {mail ? (
        <a
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 hover:bg-[#EFF6FF]"
          href={`mailto:${mail}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 7 9-7" />
            </svg>
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-[11px] font-semibold text-[#45468C]">Email</span>
            <span className="block whitespace-nowrap text-[11px] font-medium text-[#64748B]">{mail}</span>
          </span>
        </a>
      ) : null}
      {chat ? (
        <a
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 hover:bg-[#F0FDF4]"
          href={`https://wa.me/${waDigits(chat)}`}
          target="_blank"
          rel="noreferrer"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F0FDF4] text-[#22C55E]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M21 11.5a8.4 8.4 0 0 1-9.1 8.4L6 21l1.2-4.4A8.5 8.5 0 1 1 21 11.5z" />
            </svg>
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-[11px] font-semibold text-[#45468C]">WhatsApp</span>
            <span className="block truncate text-[11px] font-medium text-[#64748B]">{formatWhatsApp(chat)}</span>
          </span>
        </a>
      ) : null}
    </div>
  );
}
