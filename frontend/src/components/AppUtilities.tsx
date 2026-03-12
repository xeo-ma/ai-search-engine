import { useEffect, useMemo, useRef, useState } from 'react';
import { AccountMenu } from './AccountMenu';
import { HistoryPanel, type HistoryGroup } from './HistoryPanel';
import { SettingsMenu } from './SettingsMenu';

export interface SearchHistoryEntry {
  id: string;
  query: string;
  lastSearchedAt: string;
}

export type ThemePreference = 'system' | 'light' | 'dark';
export type PlanPreference = 'free' | 'pro';
type AppUtilitiesContext = 'landing' | 'results' | 'shell';

interface AppUtilitiesProps {
  historyItems: SearchHistoryEntry[];
  onRunHistory: (query: string) => void;
  onClearHistory: () => void;
  authenticated: boolean;
  email: string | null;
  deepSearchEnabled: boolean;
  deepSearchAvailable: boolean;
  onDeepSearchChange: (enabled: boolean) => void;
  onSignIn: () => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
  onManageBilling: () => Promise<void> | void;
  safeMode: boolean;
  onSafeModeChange: (safeMode: boolean) => void;
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  context?: AppUtilitiesContext;
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

function AccountIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="6.4" r="2.8" />
      <path d="M4.6 16.2a5.4 5.4 0 0 1 10.8 0" />
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

export function AppUtilities({
  historyItems,
  onRunHistory,
  onClearHistory,
  authenticated,
  email,
  deepSearchEnabled,
  deepSearchAvailable,
  onDeepSearchChange,
  onSignIn,
  onSignOut,
  onManageBilling,
  safeMode,
  onSafeModeChange,
  themePreference,
  onThemeChange,
  context = 'shell',
}: AppUtilitiesProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);
  const [accountActionError, setAccountActionError] = useState<string | null>(null);
  const [pendingAccountAction, setPendingAccountAction] = useState<null | 'signin' | 'signout' | 'billing'>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const cancelClearHistoryRef = useRef<HTMLButtonElement | null>(null);
  const historyGroups = useMemo(() => groupHistory(historyItems), [historyItems]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      if ((!showSettings && !showHistory && !showAccount) || showClearHistoryConfirm) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (settingsRef.current?.contains(target)) {
        return;
      }

      if (accountRef.current?.contains(target)) {
        return;
      }

      setShowSettings(false);
      setShowAccount(false);
      setShowHistory(false);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setShowClearHistoryConfirm(false);
        setShowSettings(false);
        setShowAccount(false);
        setShowHistory(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showAccount, showClearHistoryConfirm, showHistory, showSettings]);

  useEffect(() => {
    if (!showClearHistoryConfirm) {
      return;
    }

    cancelClearHistoryRef.current?.focus();
  }, [showClearHistoryConfirm]);

  async function runAccountAction(
    action: 'signin' | 'signout' | 'billing',
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
      <div className={`page-utility-bar page-utility-bar-${context}`}>
        <div className="page-utility-actions">
          <div className="page-utility-menu-shell" ref={settingsRef}>
            <button
              type="button"
              className="page-utility-button"
              aria-label="Open settings"
              aria-expanded={showSettings || showHistory}
              onClick={() => {
                if (showHistory) {
                  setShowHistory(false);
                  setShowSettings(true);
                  setShowAccount(false);
                  return;
                }

                setShowAccount(false);
                setShowSettings((current) => !current);
                setShowHistory(false);
              }}
            >
              <SettingsIcon />
            </button>
            {showSettings ? (
              <SettingsMenu
                themePreference={themePreference}
                onThemeChange={onThemeChange}
                safeMode={safeMode}
                onSafeModeChange={onSafeModeChange}
                deepSearchAvailable={deepSearchAvailable}
                deepSearchEnabled={deepSearchEnabled}
                onDeepSearchChange={onDeepSearchChange}
                onOpenHistory={() => {
                  setShowSettings(false);
                  setShowHistory(true);
                }}
                onRequestClearHistory={() => {
                  setShowSettings(false);
                  setShowClearHistoryConfirm(true);
                }}
                historyIcon={<HistoryIcon />}
              />
            ) : null}

            {showHistory ? (
              <HistoryPanel
                historyGroups={historyGroups}
                formatHistoryTimestamp={formatHistoryTimestamp}
                onRunHistory={onRunHistory}
                onBack={() => {
                  setShowHistory(false);
                  setShowSettings(true);
                }}
                onClose={() => setShowHistory(false)}
                emptyIcon={<EmptyHistoryIcon />}
              />
            ) : null}
          </div>

          <div className="page-utility-menu-shell" ref={accountRef}>
            <button
              type="button"
              className="page-utility-button"
              aria-label="Open account menu"
              aria-expanded={showAccount}
              onClick={() => {
                setShowSettings(false);
                setShowHistory(false);
                setShowAccount((current) => !current);
              }}
            >
              <AccountIcon />
            </button>
            {showAccount ? (
              <AccountMenu
                authenticated={authenticated}
                email={email}
                pendingAccountAction={pendingAccountAction}
                accountActionError={accountActionError}
                onSignIn={() => {
                  void runAccountAction('signin', onSignIn);
                }}
                onBilling={() => {
                  void runAccountAction('billing', onManageBilling);
                }}
                onSignOut={() => {
                  void runAccountAction('signout', onSignOut);
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

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
