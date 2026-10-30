import { useState } from "react";

/** Password stays hidden (••••) until the admin clicks the eye. */
export function PasswordCell({ value }: { value?: string | null }) {
  const [show, setShow] = useState(false);
  const v = value?.trim();
  if (!v) return <span>—</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <span className={show ? "break-all" : "tracking-widest"}>{show ? v : "••••••••"}</span>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="shrink-0 rounded p-1 text-text-muted hover:bg-content-bg hover:text-button-blue"
        aria-label={show ? "Hide password" : "Show password"}
        title={show ? "Hide password" : "Show password"}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {show ? <path d="m3 3 18 18" /> : null}
        </svg>
      </button>
    </span>
  );
}

/** Password input with an eye button to show / hide what was typed. */
export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input {...props} type={show ? "text" : "password"} className={`${props.className ?? "input-field"} pr-10`} autoComplete="new-password" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-2 my-auto flex h-8 w-8 items-center justify-center rounded text-text-muted hover:text-button-blue"
        aria-label={show ? "Hide password" : "Show password"}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {show ? <path d="m3 3 18 18" /> : null}
        </svg>
      </button>
    </span>
  );
}
