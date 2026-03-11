import { useEffect, useMemo, useRef, useState } from 'react';

export interface SearchHistoryEntry {
  id: string;
  query: string;
  lastSearchedAt: string;
}

export type ThemePreference = 'system' | 'light' | 'dark';
export type PlanPreference = 'free' | 'pro';

interface AppUtilitiesProps {
  historyItems: SearchHistoryEntry[];
  onRunHistory: (query: string) => void;
  onClearHistory: () => void;
  authenticated: boolean;
  plan: PlanPreference;
  planMessage: string;
  email: string | null;
  deepSearchEnabled: boolean;
  deepSearchAvailable: boolean;
  onDeepSearchChange: (enabled: boolean) => void;
  freeSearchesRemaining: number | null;
  onSignIn: () => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
  onUpgradeToPro: () => Promise<void> | void;
  onManageBilling: () => Promise<void> | void;
  safeMode: boolean;
  onSafeModeChange: (safeMode: boolean) => void;
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  context?: 'landing' | 'results';
}

interface HistoryGroup {
  label: string;
  items: SearchHistoryEntry[];
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function groupHistory(items: SearchHistoryEntry[]): HistoryGroup[] {
  const now = new Date();
  const today = startOfDay(now).getTime();
  const yesterday = today - 24 * 60 * 60 * 1000;
  const lastWeek = today - 7 * 24 * 60 * 60 * 1000;

  const groups: HistoryGroup[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const item of items) {
    const timestamp = startOfDay(new Date(item.lastSearchedAt)).getTime();
    if (Number.isNaN(timestamp)) {
      groups[3].items.push(item);
      continue;
    }

    if (timestamp >= today) {
      groups[0].items.push(item);
    } else if (timestamp >= yesterday) {
      groups[1].items.push(item);
    } else if (timestamp >= lastWeek) {
      groups[2].items.push(item);
    } else {
      groups[3].items.push(item);
    }
  }

  return groups.filter((group) => group.items.length > 0);
}

function formatHistoryTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function HistoryIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 10a6.5 6.5 0 1 0 1.6-4.3" />
      <path d="M3.5 4.5v3.4h3.4" />
      <path d="M10 6.6v3.8l2.7 1.7" />
    </svg>
  );
}

function SettingsIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="2.3" />
      <path d="M16.3 11.4a1 1 0 0 0 .2 1.1l.1.1a1.2 1.2 0 0 1 0 1.7l-.9.9a1.2 1.2 0 0 1-1.7 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.2A1.2 1.2 0 0 1 11 18h-1.3a1.2 1.2 0 0 1-1.2-1.2v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.2 1.2 0 0 1-1.7 0l-.9-.9a1.2 1.2 0 0 1 0-1.7l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6h-.2A1.2 1.2 0 0 1 2 10.3V9a1.2 1.2 0 0 1 1.2-1.2h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1L4 6a1.2 1.2 0 0 1 0-1.7l.9-.9a1.2 1.2 0 0 1 1.7 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9v-.2A1.2 1.2 0 0 1 9.7 2H11a1.2 1.2 0 0 1 1.2 1.2v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.2 1.2 0 0 1 1.7 0l.9.9a1.2 1.2 0 0 1 0 1.7l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2A1.2 1.2 0 0 1 18 9v1.3a1.2 1.2 0 0 1-1.2 1.2h-.2a1 1 0 0 0-.9.6Z" />
    </svg>
  );
}

function EmptyHistoryIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.6v4.6l3 1.9" />
      <path d="M6.2 6.2 4.5 4.5" />
    </svg>
  );
}

function LockIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.8" y="8.5" width="10.4" height="7.2" rx="1.8" />
      <path d="M7 8.5V6.8a3 3 0 0 1 6 0v1.7" />
    </svg>
  );
}

export function AppUtilities({
  historyItems,
  onRunHistory,
  onClearHistory,
  authenticated,
  plan,
  planMessage,
  email,
  deepSearchEnabled,
  deepSearchAvailable,
  onDeepSearchChange,
  freeSearchesRemaining,
  onSignIn,
  onSignOut,
  onUpgradeToPro,
  onManageBilling,
  safeMode,
  onSafeModeChange,
  themePreference,
  onThemeChange,
  context = 'landing',
}: AppUtilitiesProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);
  const [accountActionError, setAccountActionError] = useState<string | null>(null);
  const [pendingAccountAction, setPendingAccountAction] = useState<null | 'signin' | 'signout' | 'upgrade' | 'billing'>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const cancelClearHistoryRef = useRef<HTMLButtonElement | null>(null);
  const historyGroups = useMemo(() => groupHistory(historyItems), [historyItems]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      if (!showSettings || showClearHistoryConfirm) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (settingsRef.current?.contains(target)) {
        return;
      }

      setShowSettings(false);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setShowClearHistoryConfirm(false);
        setShowSettings(false);
        setShowHistory(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showClearHistoryConfirm, showSettings]);

  useEffect(() => {
    if (!showClearHistoryConfirm) {
      return;
    }

    cancelClearHistoryRef.current?.focus();
  }, [showClearHistoryConfirm]);

  async function runAccountAction(
    action: 'signin' | 'signout' | 'upgrade' | 'billing',
    callback: () => Promise<void> | void,
  ): Promise<void> {
    setAccountActionError(null);
    setPendingAccountAction(action);

    try {
      await callback();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to complete that action.';
      setAccountActionError(message);
    } finally {
      setPendingAccountAction((current) => (current === action ? null : current));
    }
  }

  return (
    <>
      {!showHistory ? (
        <div className={`page-utility-bar page-utility-bar-${context}`}>
          <div className="page-utility-actions">
            <button
              type="button"
              className="page-utility-button"
              aria-label="Open search history"
              onClick={() => {
                setShowHistory(true);
                setShowSettings(false);
              }}
            >
              <HistoryIcon />
            </button>
            <div className="page-utility-menu-shell" ref={settingsRef}>
              <button
                type="button"
                className="page-utility-button"
                aria-label="Open settings"
                aria-expanded={showSettings}
                onClick={() => {
                  setShowSettings((current) => !current);
                  setShowHistory(false);
                }}
              >
                <SettingsIcon />
              </button>
              {showSettings ? (
                <div className="settings-menu" role="menu" aria-label="Settings menu">
                  <div className="settings-menu-section">
                    <p className="settings-menu-label">Appearance</p>
                    <div className="settings-theme-control" role="group" aria-label="Appearance">
                      {(['system', 'light', 'dark'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`settings-theme-option${themePreference === option ? ' is-active' : ''}`}
                          aria-pressed={themePreference === option}
                          onClick={() => onThemeChange(option)}
                        >
                          {option === 'system' ? 'System' : option === 'light' ? 'Light' : 'Dark'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="settings-menu-section">
                    <p className="settings-menu-label">Plan</p>
                    <div className="stack settings-menu-copy">
                      {authenticated && email ? <p className="settings-menu-help">Signed in as {email}</p> : null}
                      <div className="settings-menu-row">
                        <span className="settings-menu-value">Current plan</span>
                        <span className="settings-menu-pill">{plan === 'pro' ? 'Pro' : 'Free'}</span>
                      </div>
                      <p className="settings-menu-help">{planMessage}</p>
                      {!authenticated ? (
                        <div className="settings-menu-button-row">
                          <button
                            type="button"
                            className="settings-menu-button settings-menu-button-primary"
                            disabled={pendingAccountAction !== null}
                            onClick={() => {
                              void runAccountAction('signin', onSignIn);
                            }}
                          >
                            {pendingAccountAction === 'signin' ? 'Opening sign in...' : 'Sign in'}
                          </button>
                        </div>
                      ) : plan === 'pro' ? (
                        <div className="settings-menu-button-row">
                          <button
                            type="button"
                            className="settings-menu-button settings-menu-button-secondary"
                            disabled={pendingAccountAction !== null}
                            onClick={() => {
                              void runAccountAction('billing', onManageBilling);
                            }}
                          >
                            {pendingAccountAction === 'billing' ? 'Opening billing...' : 'Manage billing'}
                          </button>
                        </div>
                      ) : (
                        <div className="settings-menu-button-row">
                          <button
                            type="button"
                            className="settings-menu-button settings-menu-button-primary"
                            disabled={pendingAccountAction !== null}
                            onClick={() => {
                              void runAccountAction('upgrade', onUpgradeToPro);
                            }}
                          >
                            {pendingAccountAction === 'upgrade' ? 'Opening checkout...' : 'Upgrade to Pro'}
                          </button>
                        </div>
                      )}
                      {accountActionError ? <p className="settings-menu-error">{accountActionError}</p> : null}
                    </div>
                  </div>
                  <div className="settings-menu-section">
                    <p className="settings-menu-label">Search</p>
                    <div className="stack settings-menu-copy">
                      <div className="settings-menu-row">
                        <span className="settings-menu-value">Safe search</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={safeMode}
                          aria-label={`Safe search ${safeMode ? 'on' : 'off'}`}
                          className={`settings-switch${safeMode ? ' is-active' : ''}`}
                          onClick={() => onSafeModeChange(!safeMode)}
                        >
                          <span className="settings-switch-track" aria-hidden="true">
                            <span className="settings-switch-thumb" />
                          </span>
                        </button>
                      </div>
                      <p className="settings-menu-help">Filters sensitive or lower-trust results.</p>
                      <div className={`settings-menu-row${!deepSearchAvailable ? ' is-disabled' : ''}`}>
                        <span className="settings-menu-value settings-menu-value-with-icon">
                          {!deepSearchAvailable ? (
                            <span className="settings-menu-lock" aria-hidden="true">
                              <LockIcon />
                            </span>
                          ) : null}
                          <span>Deep search</span>
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={deepSearchAvailable ? deepSearchEnabled : false}
                          aria-label={
                            deepSearchAvailable
                              ? `Deep search ${deepSearchEnabled ? 'on' : 'off'}`
                              : authenticated
                                ? 'Deep search available on Pro'
                                : 'Sign in to access Pro features'
                          }
                          className={`settings-switch${deepSearchEnabled && deepSearchAvailable ? ' is-active' : ''}`}
                          disabled={!deepSearchAvailable}
                          onClick={() => {
                            if (!deepSearchAvailable) {
                              return;
                            }
                            onDeepSearchChange(!deepSearchEnabled);
                          }}
                        >
                          <span className="settings-switch-track" aria-hidden="true">
                            <span className="settings-switch-thumb" />
                          </span>
                        </button>
                      </div>
                      <p className="settings-menu-help">
                        {deepSearchAvailable
                          ? 'Extends retrieval depth before reranking.'
                          : authenticated
                            ? 'Upgrade to Pro to enable deeper retrieval.'
                            : 'Sign in to sync plan and deep search preferences.'}
                      </p>
                      {plan === 'free' && freeSearchesRemaining !== null ? (
                        <p className="settings-menu-help">
                          {freeSearchesRemaining} free search{freeSearchesRemaining === 1 ? '' : 'es'} left today.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="settings-menu-section">
                    <p className="settings-menu-label">Data</p>
                    {authenticated ? (
                      <button
                        type="button"
                        className="settings-menu-neutral-action"
                        disabled={pendingAccountAction !== null}
                        onClick={() => {
                          void runAccountAction('signout', onSignOut);
                        }}
                      >
                        {pendingAccountAction === 'signout' ? 'Signing out...' : 'Sign out'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="settings-menu-action"
                      onClick={() => {
                        setShowSettings(false);
                        setShowClearHistoryConfirm(true);
                      }}
                    >
                      Clear history
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showHistory ? (
        <>
          <button
            type="button"
            className="history-drawer-backdrop"
            aria-label="Close search history"
            onClick={() => setShowHistory(false)}
          />
          <aside className="history-drawer" role="dialog" aria-modal="true" aria-label="Search history">
            <div className="history-drawer-header">
              <div className="stack history-drawer-copy">
                <p className="history-drawer-eyebrow">History</p>
                <h2>Recent searches</h2>
              </div>
              <button
                type="button"
                className="history-drawer-close"
                aria-label="Close search history"
                onClick={() => setShowHistory(false)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            {historyGroups.length === 0 ? (
              <div className="stack history-drawer-empty-state">
                <div className="history-drawer-empty-icon">
                  <EmptyHistoryIcon />
                </div>
                <p className="muted history-drawer-empty">No searches saved yet.</p>
              </div>
            ) : (
              <div className="stack history-groups">
                {historyGroups.map((group) => (
                  <section key={group.label} className="stack history-group">
                    <p className="history-group-label">{group.label}</p>
                    <div className="stack history-group-list">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="history-item"
                          onClick={() => {
                            onRunHistory(item.query);
                            setShowHistory(false);
                          }}
                        >
                          <span className="history-item-query">{item.query}</span>
                          <span className="history-item-time">{formatHistoryTimestamp(item.lastSearchedAt)}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </aside>
        </>
      ) : null}

      {showClearHistoryConfirm ? (
        <>
          <button
            type="button"
            className="confirm-modal-backdrop"
            aria-label="Close clear history confirmation"
            onClick={() => setShowClearHistoryConfirm(false)}
          />
          <div
            className="confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-history-title"
            aria-describedby="clear-history-description"
          >
            <div className="stack confirm-modal-copy">
              <h2 id="clear-history-title">Clear search history?</h2>
              <p id="clear-history-description">
                This will remove your recent searches from this browser. This action cannot be undone.
              </p>
              <p className="confirm-modal-note">Only local history will be cleared. Your current search results will stay open.</p>
            </div>
            <div className="confirm-modal-actions">
              <button
                ref={cancelClearHistoryRef}
                type="button"
                className="confirm-modal-button confirm-modal-button-secondary"
                onClick={() => setShowClearHistoryConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirm-modal-button confirm-modal-button-destructive"
                onClick={() => {
                  onClearHistory();
                  setShowClearHistoryConfirm(false);
                }}
              >
                Clear history
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
