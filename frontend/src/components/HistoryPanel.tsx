import type { ReactNode } from 'react';

import type { SearchHistoryEntry } from './AppUtilities';

export interface HistoryGroup {
  label: string;
  items: SearchHistoryEntry[];
}

interface HistoryPanelProps {
  historyGroups: HistoryGroup[];
  formatHistoryTimestamp: (value: string) => string;
  onRunHistory: (query: string) => void;
  onBack: () => void;
  onClose: () => void;
  emptyIcon: ReactNode;
}

export function HistoryPanel({
  historyGroups,
  formatHistoryTimestamp,
  onRunHistory,
  onBack,
  onClose,
  emptyIcon,
}: HistoryPanelProps) {
  return (
    <div className="history-panel" role="dialog" aria-label="Search history">
      <div className="history-panel-header">
        <div className="stack history-panel-copy">
          <p className="history-panel-eyebrow">History</p>
          <h2>Recent searches</h2>
        </div>
        <div className="history-panel-actions">
          <button type="button" className="history-panel-back" onClick={onBack}>
            Back
          </button>
          <button type="button" className="history-panel-close" aria-label="Close search history" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>

      {historyGroups.length === 0 ? (
        <div className="stack history-panel-empty-state">
          <div className="history-panel-empty-icon">{emptyIcon}</div>
          <p className="muted history-panel-empty">No searches saved yet.</p>
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
                      onClose();
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
    </div>
  );
}
