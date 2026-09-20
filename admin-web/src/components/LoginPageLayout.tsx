import type { ReactNode } from "react";
import { HarshaLogo } from "./HarshaLogo";

export function LoginPageLayout({
  title,
  children,
  footer,
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="login-shell relative flex min-h-[100dvh] flex-col overflow-x-hidden">
      <svg
        className="pointer-events-none absolute bottom-0 left-0 z-0 w-full"
        style={{ height: "clamp(88px, 16vh, 180px)" }}
        viewBox="0 0 1440 220"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d="M0 80 C200 0 400 40 600 80 C800 120 1000 20 1440 60 L1440 220 L0 220 Z" fill="#F97316" opacity="0.92" />
        <path d="M0 120 C300 60 500 140 720 100 C940 60 1100 130 1440 100 L1440 220 L0 220 Z" fill="#7C3AED" opacity="0.88" />
        <path d="M0 160 C350 110 600 170 850 130 C1100 90 1250 160 1440 140 L1440 220 L0 220 Z" fill="#2563EB" opacity="0.92" />
      </svg>

      <div className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-1 items-center justify-center px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.25rem,3vh,2.5rem)] pb-[clamp(8rem,16vh,11rem)]">
        <div className="grid w-full grid-cols-1 items-center gap-[clamp(1.25rem,3vw,2.5rem)] md:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] md:items-center xl:grid-cols-[minmax(0,1.05fr)_minmax(0,26rem)]">
          <div className="hidden md:flex md:max-w-md md:flex-col md:items-center md:justify-center">
            <HarshaLogo />
            <p className="login-tagline mt-6 max-w-sm px-2">
              Powerful ID Card Management System for Schools &amp; Institutions.
            </p>
          </div>

          <div className="flex w-full items-center justify-center md:max-w-[min(100%,26rem)] md:justify-end">
            <div className="w-full rounded-2xl border border-border/70 bg-white px-[clamp(1.25rem,2.5vw,1.75rem)] py-[clamp(1.5rem,3vh,2rem)] shadow-[0_8px_40px_rgba(15,23,42,0.07)]">
              <div className="mb-5 flex flex-col items-center justify-center md:hidden">
                <HarshaLogo compact />
                <p className="login-tagline login-tagline-compact mt-4 max-w-[18rem]">
                  Powerful ID Card Management System for Schools &amp; Institutions.
                </p>
              </div>

              <h1 className="text-center text-[clamp(1.125rem,2vw,1.375rem)] font-bold text-text-navy">
                {title}
              </h1>

              <div className="mt-6">{children}</div>
              {footer ? <div className="mt-5">{footer}</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
