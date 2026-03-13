import '../styles/globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

const APP_MAINTENANCE_MODE = false;

export const metadata: Metadata = {
  title: 'Lens',
  description: 'Safe-mode-first web search with AI summaries',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {APP_MAINTENANCE_MODE ? (
          <main className="maintenance-layout">
            <section className="maintenance-shell">
              <div className="maintenance-brand">
                <span className="maintenance-brand-mark">L</span>
                <span>Lens</span>
              </div>
              <div className="maintenance-copy">
                <p className="maintenance-eyebrow">Temporary pause</p>
                <h1>Lens is temporarily unavailable.</h1>
                <p>
                  We are resolving a billing activation issue and have temporarily paused access while it is fixed.
                  Existing subscriptions and account data are being reviewed.
                </p>
                <p>
                  The app will return as soon as the issue is verified. No action is needed on your side right now.
                </p>
              </div>
            </section>
          </main>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
