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
  placeholder = 'Search the web',
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

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
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <div className="search-bar-actions">
        <button type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
    </form>
  );
}
