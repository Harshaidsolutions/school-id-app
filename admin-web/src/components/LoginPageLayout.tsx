import type { ReactNode } from "react";

export function LoginPageLayout({ title, children, footer, onTitlePress }: {
  title: ReactNode; children: ReactNode; footer?: ReactNode;
  appBrand?: boolean; brandAccent?: boolean; titleClassName?: string;
  onTitlePress?: () => void;
}) {
  const logo = <img src="/brand-wordmark.png" alt="My School ID Card" className="login-main-logo" />;
  return (
    <main className="login-shell"><div className="login-composition">
      <section className="login-brand-panel" aria-label="My School ID Card">
        <span className="login-brand-ring" aria-hidden />
        <span className="login-brand-dot" aria-hidden />
        <span className="login-orb login-orb-1" aria-hidden />
        <span className="login-orb login-orb-2" aria-hidden />
        {/* Rubber-stamp style brand seal */}
        <div className="login-stamp" aria-hidden>
          <svg viewBox="0 0 320 320" role="presentation">
            <defs>
              <path id="stampTop" d="M 160 160 m -118 0 a 118 118 0 1 1 236 0" />
              <path id="stampBottom" d="M 160 160 m -128 0 a 128 128 0 0 0 256 0" />
            </defs>
            <circle cx="160" cy="160" r="150" className="stamp-ring stamp-ring-outer" />
            <circle cx="160" cy="160" r="140" className="stamp-ring" />
            <circle cx="160" cy="160" r="96" className="stamp-ring stamp-ring-inner" />
            <text className="stamp-text"><textPath href="#stampTop" startOffset="50%" textAnchor="middle">MY SCHOOL ID CARD</textPath></text>
            <text className="stamp-text stamp-text-small"><textPath href="#stampBottom" startOffset="50%" textAnchor="middle">★ HARSHA ID SOLUTIONS ★</textPath></text>
            <text x="160" y="150" textAnchor="middle" className="stamp-center">ADMIN</text>
            <text x="160" y="182" textAnchor="middle" className="stamp-center stamp-center-small">VERIFIED WORKSPACE</text>
            <line x1="104" y1="196" x2="216" y2="196" className="stamp-line" />
          </svg>
        </div>
        <div className="login-brand-copy">
          <span className="login-eyebrow">ADMIN WORKSPACE</span>
          <h2>Every identity.<br />One organized place.</h2>
          <p>Manage your schools, institutes and organizations with a clear view of every record.</p>
          <div className="login-feature-list"><span><b>01</b>Records &amp; photos</span><span><b>02</b>Forms &amp; exports</span><span><b>03</b>One shared workspace</span></div>
        </div>
        <p className="login-brand-footnote">My School ID Card · Administration</p>
      </section>
      <section className="login-form-panel">
        <div className="auth-card">
          {/* Password recovery is intentionally not shown as a link: tapping the logo opens it. */}
          {onTitlePress ? (
            <button type="button" onClick={onTitlePress} className="login-logo-action" aria-label="My School ID Card">
              {logo}
            </button>
          ) : logo}
          <h1 className="login-heading">{title}</h1>
          <p className="login-caption text-sm text-text-muted">Your workspace starts here.</p>
          {children}
          {footer ? <div className="login-footer border-t border-border">{footer}</div> : null}
        </div>
      </section>
    </div></main>
  );
}
