import Link from 'next/link';
import type { ReactNode } from 'react';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function AuthShell({ eyebrow, title, description, footer, children }: AuthShellProps) {
  return (
    <main className="auth-layout">
      <section className="auth-shell">
        <div className="auth-shell-header">
          <Link className="auth-back-link" href="/">
            Back to search
          </Link>
          <p className="auth-eyebrow">{eyebrow}</p>
          <div className="auth-copy">
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </div>
        <div className="auth-card">{children}</div>
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </section>
    </main>
  );
}
