import { useState, type FormEvent } from "react";

export function OtpConfirmModal({
  title,
  description,
  confirmLabel = "Confirm",
  danger = true,
  onClose,
  onRequestOtp,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onRequestOtp: () => Promise<{ message?: string; devOtp?: string }>;
  onConfirm: (otp: string) => Promise<void>;
}) {
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRequest() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const result = await onRequestOtp();
      setDevOtp(result.devOtp ?? null);
      setInfo(result.message ?? "Verification code sent.");
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit verification code.");
      return;
    }
    setLoading(true);
    try {
      await onConfirm(otp.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text-navy">{title}</h2>
            <p className="mt-1 text-sm text-text-muted">{description}</p>
          </div>
          <button type="button" onClick={onClose} className="text-text-muted" aria-label="Close">
            ×
          </button>
        </div>

        {error && <div className="mb-3 alert-error">{error}</div>}
        {info && <div className="mb-3 alert-success">{info}</div>}
        {devOtp && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Dev OTP: <span className="font-mono font-bold tracking-widest">{devOtp}</span>
          </div>
        )}

        {step === "request" ? (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleRequest()}
              className="btn-primary"
            >
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-text-navy">Verification code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="input-field tracking-widest"
                placeholder="6-digit code"
              />
            </label>
            <div className="flex flex-wrap justify-between gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleRequest()}
                className="text-sm font-medium text-button-blue hover:underline disabled:opacity-60"
              >
                Resend code
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={
                    danger
                      ? "rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                      : "btn-primary"
                  }
                >
                  {loading ? "Working…" : confirmLabel}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
