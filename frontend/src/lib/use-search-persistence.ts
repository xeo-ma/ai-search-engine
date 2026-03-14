'use client';

import { useEffect, useRef, useState } from 'react';

import type { SearchHistoryEntry, ThemePreference } from '../components/AppUtilities';

const SEARCH_HISTORY_STORAGE_KEY = 'ai-search-history';
const SAFE_MODE_STORAGE_KEY = 'ai-search-safe-mode';
const THEME_PREFERENCE_STORAGE_KEY = 'ai-search-theme';
const MAX_SEARCH_HISTORY_ITEMS = 24;

function mergeSearchHistory(existing: SearchHistoryEntry[], query: string): SearchHistoryEntry[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return existing;
  }

  const nextEntry: SearchHistoryEntry = {
    id: `${Date.now()}-${normalizedQuery.toLowerCase()}`,
    query: normalizedQuery,
    lastSearchedAt: new Date().toISOString(),
  };

  return [
    nextEntry,
    ...existing.filter((entry) => entry.query.trim().toLowerCase() !== normalizedQuery.toLowerCase()),
  ].slice(0, MAX_SEARCH_HISTORY_ITEMS);
}

function readStoredHistory(): SearchHistoryEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as SearchHistoryEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is SearchHistoryEntry => {
      return Boolean(
        item &&
          typeof item.id === 'string' &&
          typeof item.query === 'string' &&
          typeof item.lastSearchedAt === 'string',
      );
    });
  } catch {
    return [];
  }
}

function readStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const value = window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

function readStoredSafeMode(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const raw = window.localStorage.getItem(SAFE_MODE_STORAGE_KEY);
    if (raw === null) {
      return true;
    }

    return raw !== 'false';
  } catch {
    return true;
  }
}

function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }

  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

export function useSearchPersistence() {
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [safeMode, setSafeMode] = useState(true);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const hasLoadedHistoryRef = useRef(false);

  useEffect(() => {
    setSearchHistory(readStoredHistory());
    setSafeMode(readStoredSafeMode());
    setThemePreference(readStoredThemePreference());
    hasLoadedHistoryRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasLoadedHistoryRef.current || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(searchHistory));
  }, [searchHistory]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SAFE_MODE_STORAGE_KEY, String(safeMode));
  }, [safeMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, themePreference);

    const root = document.documentElement;
    const applyResolvedTheme = (): void => {
      const resolvedTheme = resolveTheme(themePreference);
      root.dataset.theme = resolvedTheme;
      root.style.colorScheme = resolvedTheme;
    };

    applyResolvedTheme();

    if (themePreference !== 'system') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      applyResolvedTheme();
    };

    mediaQuery.addEventListener('change', onChange);
    return () => {
      mediaQuery.removeEventListener('change', onChange);
    };
  }, [themePreference]);

  function addSearchHistory(query: string): void {
    setSearchHistory((previous) => mergeSearchHistory(previous, query));
  }

  return {
    searchHistory,
    setSearchHistory,
    addSearchHistory,
    safeMode,
    setSafeMode,
    themePreference,
    setThemePreference,
  };
}
