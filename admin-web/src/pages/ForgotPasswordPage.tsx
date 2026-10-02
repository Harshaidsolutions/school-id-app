import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import { LoginPageLayout } from "../components/LoginPageLayout";

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

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data } = await api.post<{
        message?: string;
        codeSent?: boolean;
        emailDelivery?: string;
        devOtp?: string;
      }>("/auth/forgot-password", { email: email.trim() });
      if (data.codeSent !== true) {
        setError("Please contact admin for password.");
        return;
      }
      setSuccess(true);
      if (data.devOtp) {
        window.sessionStorage.setItem("dev_reset_otp", data.devOtp);
      }
      setTimeout(
        () =>
          navigate("/verify-otp", {
            state: {
              email: email.trim(),
              ...(data.devOtp ? { devOtp: data.devOtp } : {}),
            },
          }),
        800
      );
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as { message?: string } | undefined;
        setError(body?.message ?? "Failed to send reset email.");
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginPageLayout
      appBrand
      brandAccent
      title="Forgot Password"
      footer={
        <div className="text-center">
          <Link to="/login" className="text-sm font-medium text-button-blue hover:underline">
            Back to Login
          </Link>
        </div>
      }
    >
      <p className="mb-4 text-center text-sm text-text-muted">
        Enter your email and we will send a verification code.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <IconField
          label="Email"
          icon={
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M22 7l-10 7L2 7" />
            </svg>
          }
        >
          <input
            type="email"
            autoComplete="email"
            required
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field-icon w-full min-w-0"
          />
        </IconField>

        {error && <div className="alert-error">{error}</div>}
        {success && <div className="alert-success">Code sent! Redirecting…</div>}

        <button type="submit" disabled={loading || success} className="btn-primary w-full py-2.5 text-sm sm:text-[15px]">
          {loading ? "Sending…" : "Send Code"}
        </button>
      </form>
    </LoginPageLayout>
  );
}
