import { useRef } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (query: string) => void;
  loading: boolean;
  compact?: boolean;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  onSubmit,
  loading,
  compact = false,
  placeholder = 'Search with evidence',
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasValue = value.trim().length > 0;

  function submitIfValid(): void {
    const query = inputRef.current?.value ?? value;
    if (!loading && query.trim()) {
      onSubmit(query);
    }
  }

  return (
    <form
      className={compact ? 'search-bar search-bar-compact' : 'search-bar'}
      onSubmit={(event) => {
        event.preventDefault();
        submitIfValid();
      }}
    >
      <div className={`search-bar-input-shell${hasValue ? ' has-value' : ''}`}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        <span className="search-bar-inline-icon" aria-hidden="true">
          <span className="search-bar-button-icon">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="9" r="5.75" />
              <path d="M13.2 13.2 17 17" />
            </svg>
          </span>
        </span>
        <button
          type="button"
          className="search-bar-clear-button"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        >
          <span aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <path d="M6 6 14 14" />
              <path d="M14 6 6 14" />
            </svg>
          </span>
        </button>
      </div>
      <div className="search-bar-actions">
        <button type="submit" disabled={loading} aria-label={loading ? 'Searching' : 'Search'}>
          <span className="search-bar-button-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="9" r="5.75" />
              <path d="M13.2 13.2 17 17" />
            </svg>
          </span>
          <span className="search-bar-button-label">{loading ? 'Searching...' : 'Search'}</span>
        </button>
      </div>
    </form>
  );
}
