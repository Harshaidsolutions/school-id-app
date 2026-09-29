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
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  appBrand?: boolean;
  onTitlePress?: () => void;
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

      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.25rem,3vh,2.5rem)] pb-[clamp(8rem,16vh,11rem)]">
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
                ? "flex w-full max-w-[26rem] items-center justify-center"
                : "flex w-full items-center justify-center md:max-w-[min(100%,26rem)] md:justify-end"
            }
          >
            <div className="w-full rounded-2xl border border-border/70 bg-white px-[clamp(1.25rem,2.5vw,1.75rem)] py-[clamp(1.5rem,3vh,2rem)] shadow-[0_8px_40px_rgba(15,23,42,0.07)]">
              {appBrand ? (
                <div className="mb-4 flex flex-col items-center text-center">
                  <img
                    src="/app-logo.png"
                    alt="My School ID Card"
                    className="h-[8.5rem] w-auto object-contain"
                  />
                  <p className="mt-2 text-lg font-bold text-text-navy">My School ID Card</p>
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
                  className="m-0 block w-full border-0 bg-transparent p-0 text-center text-[clamp(1.125rem,2vw,1.375rem)] font-bold leading-tight text-text-navy hover:underline"
                >
                  {title}
                </button>
              ) : (
                <h1 className="text-center text-[clamp(1.125rem,2vw,1.375rem)] font-bold text-text-navy">
                  {title}
                </h1>
              )}

              <div className="mt-6">{children}</div>
              {footer ? <div className="mt-5">{footer}</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
