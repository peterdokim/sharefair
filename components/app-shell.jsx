import Link from "next/link";

export function AppShell({ title, subtitle, children, actions, showHome = true }) {
  return (
    <div className="app-shell">
      <div className="phone-frame">
        <div className="top-bar">
          <div>
            {showHome ? (
              <Link className="eyebrow-link" href="/">
                ShareFair
              </Link>
            ) : (
              <span className="eyebrow-label">ShareFair</span>
            )}
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="header-actions">{actions}</div> : null}
        </div>
        <main className="screen-content">{children}</main>
      </div>
    </div>
  );
}

