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
        <div className="login-wordmark"><img src="/brand-wordmark.png" alt="My School ID Card" /></div>
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
