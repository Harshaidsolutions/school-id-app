import type { ReactNode } from "react";

function MySchoolIdCardLogo({ compact = false }: { compact?: boolean }) {
  return (
    <img
      src="/myschoolidcard-logo.png"
      alt="MySchoolIdCard"
      className={
        compact
          ? "h-auto w-full object-contain"
          : "h-auto w-full max-w-[760px] object-contain"
      }
    />
  );
}

export function LoginPageLayout({
  title,
  children,
  footer,
  appBrand = false,
  onTitlePress,
  brandAccent = false,
  titleClassName,
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  appBrand?: boolean;
  onTitlePress?: () => void;
  brandAccent?: boolean;
  titleClassName?: string;
}) {
  return (
    <div className="login-shell relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden">
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

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[1400px] items-center justify-center overflow-hidden px-[clamp(0.75rem,3vw,1.5rem)] py-[clamp(0.5rem,1.5vh,1rem)]">
        <div
          className={
            appBrand
              ? "flex w-full items-center justify-center"
              : "grid w-full grid-cols-1 items-center gap-[clamp(1.25rem,3vw,2.5rem)] md:grid-cols-[minmax(0,1.35fr)_minmax(0,26rem)] md:items-center"
          }
        >
          {appBrand ? null : (
            <div className="hidden md:flex md:w-full md:flex-col md:items-center md:justify-center">
              <MySchoolIdCardLogo />
            </div>
          )}

          <div
            className={
              appBrand
                ? "flex w-full max-w-[22.5rem] items-center justify-center"
                : "flex w-full items-center justify-center md:max-w-[min(100%,22.5rem)] md:justify-end"
            }
          >
            <div className="auth-card max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_12px_32px_rgba(99,102,241,0.12)]">
              {appBrand ? (
                <div className="mb-2 flex w-full flex-col items-center overflow-visible px-1 text-center">
                  <img
                    src="/app-logo.png"
                    alt="My School ID Card"
                    className="block h-auto max-h-[3.5rem] w-auto max-w-full object-contain"
                  />
                  <p
                    className={
                      brandAccent
                        ? "mt-2 text-[clamp(1.45rem,2.4vw,1.7rem)] font-bold leading-none text-[#F97316]"
                        : "mt-2 text-lg font-bold text-[#334155]"
                    }
                  >
                    My School ID Card
                  </p>
                  {brandAccent ? (
                    <p className="mt-1.5 text-[12px] font-medium leading-none text-[#64748B]">
                      Get Your Identity Here..
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mb-5 flex flex-col items-center justify-center md:hidden">
                  <MySchoolIdCardLogo compact />
                </div>
              )}

              {onTitlePress ? (
                <button
                  type="button"
                  onClick={onTitlePress}
                  className={`m-0 block w-full cursor-pointer border-0 bg-transparent p-0 text-center text-[1.125rem] font-semibold leading-tight no-underline hover:no-underline ${titleClassName ?? "text-text-navy"}`}
                >
                  {title}
                </button>
              ) : (
                <h1
                  className={`text-center text-[1.125rem] font-semibold ${titleClassName ?? "text-text-navy"}`}
                >
                  {title}
                </h1>
              )}

              <div className="mt-3">{children}</div>
              {footer ? <div className="mt-3">{footer}</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
