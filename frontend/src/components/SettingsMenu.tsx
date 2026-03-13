import type { ReactNode } from 'react';

import type { ThemePreference } from './AppUtilities';

interface SettingsMenuProps {
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  safeMode: boolean;
  onSafeModeChange: (safeMode: boolean) => void;
  deepSearchAvailable: boolean;
  deepSearchEnabled: boolean;
  onDeepSearchChange: (enabled: boolean) => void;
  onOpenHistory: () => void;
  onRequestClearHistory: () => void;
  historyIcon: ReactNode;
}

export function SettingsMenu({
  themePreference,
  onThemeChange,
  safeMode,
  onSafeModeChange,
  deepSearchAvailable,
  deepSearchEnabled,
  onDeepSearchChange,
  onOpenHistory,
  onRequestClearHistory,
  historyIcon,
}: SettingsMenuProps) {
  return (
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
          {deepSearchAvailable ? (
            <>
              <div className="settings-menu-row">
                <span className="settings-menu-value settings-menu-value-with-icon">
                  <span>Deep search</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={deepSearchEnabled}
                  aria-label={`Deep search ${deepSearchEnabled ? 'on' : 'off'}`}
                  className={`settings-switch${deepSearchEnabled ? ' is-active' : ''}`}
                  onClick={() => {
                    onDeepSearchChange(!deepSearchEnabled);
                  }}
                >
                  <span className="settings-switch-track" aria-hidden="true">
                    <span className="settings-switch-thumb" />
                  </span>
                </button>
              </div>
              <p className="settings-menu-help">Gathers a broader candidate set before reranking on harder queries.</p>
            </>
          ) : (
            <p className="settings-menu-help">Deep search is available on Pro for queries that need broader retrieval.</p>
          )}
        </div>
      </div>
      <div className="settings-menu-section">
        <p className="settings-menu-label">Library</p>
        <button type="button" className="settings-menu-neutral-action" onClick={onOpenHistory}>
          <span className="settings-menu-action-icon" aria-hidden="true">
            {historyIcon}
          </span>
          Search history
        </button>
      </div>
      <div className="settings-menu-section">
        <p className="settings-menu-label">Data</p>
        <button type="button" className="settings-menu-action" onClick={onRequestClearHistory}>
          Clear history
        </button>
      </div>
    </div>
  );
}
