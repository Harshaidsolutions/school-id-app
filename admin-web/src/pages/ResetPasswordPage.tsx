import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import { LoginPageLayout } from "../components/LoginPageLayout";

type LocationState = {
  resetToken?: string;
  email?: string;
};

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

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const resetToken = state?.resetToken ?? "";
  const email = state?.email ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/reset-password", {
        email,
        resetToken,
        newPassword: password,
      });
      navigate("/login", { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as { message?: string } | undefined;
        setError(body?.message ?? "Failed to reset password.");
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginPageLayout
      title="Reset Password"
      footer={
        <div className="text-center">
          <Link to="/login" className="text-sm font-medium text-button-blue hover:underline">
            Back to Login
          </Link>
        </div>
      }
    >
      <p className="mb-4 text-center text-sm text-text-muted">
        Choose a new password for your account.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <IconField
          label="New Password"
          icon={
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          }
        >
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
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
            {showPassword ? "Hide" : "Show"}
          </button>
        </IconField>

        <IconField
          label="Confirm Password"
          icon={
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          }
        >
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input-field-icon w-full min-w-0"
          />
        </IconField>

        {error && <div className="alert-error">{error}</div>}

        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-sm sm:text-[15px]">
          {loading ? "Updating…" : "Update Password"}
        </button>
      </form>
    </LoginPageLayout>
  );
}
