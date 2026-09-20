import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";

export function AuthPageShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="login-shell relative min-h-screen overflow-hidden">
      <svg
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-[220px]"
        viewBox="0 0 1440 220"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d="M0 80 C200 0 400 40 600 80 C800 120 1000 20 1440 60 L1440 220 L0 220 Z" fill="#F97316" opacity="0.92" />
        <path d="M0 120 C300 60 500 140 720 100 C940 60 1100 130 1440 100 L1440 220 L0 220 Z" fill="#7C3AED" opacity="0.88" />
        <path d="M0 160 C350 110 600 170 850 130 C1100 90 1250 160 1440 140 L1440 220 L0 220 Z" fill="#2563EB" opacity="0.92" />
      </svg>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[68.75rem] items-center px-4 sm:px-6 lg:px-8">
        <div className="hidden flex-1 pb-32 lg:block">
          <BrandMark />
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed font-medium text-text-muted">
            Powerful ID Card Management System for Schools &amp; Institutions.
          </p>
        </div>

        <div className="flex flex-1 items-center justify-center py-12 lg:justify-end">
          <div className="w-full max-w-[min(100%,25rem)] rounded-2xl border border-border/70 bg-white px-5 py-8 shadow-[0_8px_40px_rgba(15,23,42,0.07)] sm:px-7 sm:py-9">
            <div className="mb-5 lg:hidden">
              <BrandMark compact />
            </div>
            <h1 className="text-[22px] font-bold leading-tight text-text-navy">{title}</h1>
            {subtitle ? <p className="mt-1 text-[13px] text-text-muted">{subtitle}</p> : null}
            <div className="mt-6">{children}</div>
            {footer ? <div className="mt-5">{footer}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
