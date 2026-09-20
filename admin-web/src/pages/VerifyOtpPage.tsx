import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import { LoginPageLayout } from "../components/LoginPageLayout";

type LocationState = {
  email?: string;
  devOtp?: string;
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

export function VerifyOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const email = state?.email?.trim() ?? "";
  const devOtp =
    state?.devOtp ??
    (typeof window !== "undefined" ? window.sessionStorage.getItem("dev_reset_otp") : null);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data } = await api.post<{ resetToken: string }>("/auth/verify-reset-otp", {
        email,
        otp: code.trim(),
      });

      navigate("/reset-password", {
        state: { resetToken: data.resetToken, email },
        replace: true,
      });
      window.sessionStorage.removeItem("dev_reset_otp");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as { message?: string } | undefined;
        setError(body?.message ?? "Invalid or expired code.");
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginPageLayout
      title="Verify Code"
      footer={
        <div className="text-center">
          <Link to="/forgot-password" className="text-sm font-medium text-button-blue hover:underline">
            Back
          </Link>
        </div>
      }
    >
      <p className="mb-4 text-center text-sm text-text-muted">
        Enter the 6-digit code sent to your email.
      </p>

      {devOtp && (
        <div className="mb-4 rounded-lg border border-border bg-blue-soft px-3 py-2 text-center text-sm text-text-navy">
          Dev mode: your code is <strong className="tracking-widest">{devOtp}</strong>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <IconField
          label="Verification Code"
          icon={
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="8" cy="15" r="4" />
              <path d="M12 15h8v-3" />
              <path d="M17 12v3" />
            </svg>
          }
        >
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="input-field-icon w-full min-w-0 tracking-widest"
          />
        </IconField>

        {error && <div className="alert-error">{error}</div>}

        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-sm sm:text-[15px]">
          {loading ? "Verifying…" : "Verify"}
        </button>
      </form>
    </LoginPageLayout>
  );
}
