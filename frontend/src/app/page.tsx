'use client';

import { useEffect, useRef, useState } from 'react';

import { AppUtilities, type SearchHistoryEntry, type ThemePreference } from '../components/AppUtilities';
import { DefinitionCard } from '../components/DefinitionCard';
import { ErrorState } from '../components/ErrorState';
import { ResultList } from '../components/ResultList';
import { SearchBar } from '../components/SearchBar';
import { SummaryCard } from '../components/SummaryCard';
import { SummarySourceList } from '../components/SummarySourceList';
import { SystemTracePanel, type SystemTraceData } from '../components/SystemTracePanel';
import type { SearchItem } from '../lib/api-client';
import {
  defineApi,
  searchApi,
  summarizeApi,
  type DefinitionResponse,
  type SearchResponse,
} from '../lib/api-client';

const EMPTY_RESPONSE: SearchResponse = {
  query: '',
  safeModeApplied: true,
  summary: null,
  summaryError: null,
  sources: [],
  claims: [],
  results: [],
};
const PAGE_SIZE = 10;
const SEARCH_HISTORY_STORAGE_KEY = 'ai-search-history';
const THEME_PREFERENCE_STORAGE_KEY = 'ai-search-theme';
const MAX_SEARCH_HISTORY_ITEMS = 24;
const LETTERS_ONLY_PATTERN = /^[a-zA-Z]+$/;
const MIN_DEFINITION_WORD_LENGTH = 2;
const ACRONYM_PRIORITY_QUERIES = new Set(['ai']);
const MAX_REFINE_CHIPS = 4;
const BROAD_ACRONYM_QUERIES = new Set(['ai', 'ml', 'llm', 'nlp']);
const SHORT_TECH_TOKENS = new Set([
  'ai', 'ml', 'llm', 'nlp', 'api', 'sdk', 'sql', 'jwt', 'css', 'html', 'http', 'https', 'aws', 'gcp', 'cpu', 'gpu',
]);
const HOMEPAGE_SUGGESTED_QUERIES = [
  'Physics explained',
  'What is CRISPR',
  'OAuth vs JWT',
  'How does nuclear fusion work',
];

function appendUniqueResults(existing: SearchItem[], incoming: SearchItem[]): SearchItem[] {
  if (incoming.length === 0) {
    return existing;
  }

  const seenUrls = new Set(existing.map((result) => result.url));
  const merged = [...existing];

  for (const result of incoming) {
    if (seenUrls.has(result.url)) {
      continue;
    }
    seenUrls.add(result.url);
    merged.push(result);
  }

  return merged;
}

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

function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }

  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

function withRetryHint(message: string): string {
  const normalized = message.trim();
  if (/try again\.?$/i.test(normalized)) {
    return normalized;
  }
  return `${normalized} Please try again.`;
}

function isDefinitionQuery(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }

  if (ACRONYM_PRIORITY_QUERIES.has(trimmed)) {
    return false;
  }

  if (trimmed.startsWith('define ')) {
    return true;
  }

  if (trimmed.includes('definition of') || trimmed.includes('meaning of')) {
    return true;
  }

  return LETTERS_ONLY_PATTERN.test(trimmed) && trimmed.length >= MIN_DEFINITION_WORD_LENGTH;
}

function extractDefinitionWord(query: string): string | null {
  const trimmed = query.trim();
  const lowered = trimmed.toLowerCase();

  if (ACRONYM_PRIORITY_QUERIES.has(lowered)) {
    return null;
  }

  if (lowered.startsWith('define ')) {
    const candidate = trimmed.slice(7).trim();
    const match = candidate.match(/[a-zA-Z]+/);
    return match ? match[0].toLowerCase() : null;
  }

  const phraseMatch = trimmed.match(/(?:definition of|meaning of)\s+([a-zA-Z]+)/i);
  if (phraseMatch?.[1]) {
    return phraseMatch[1].toLowerCase();
  }

  if (LETTERS_ONLY_PATTERN.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return null;
}

function buildRefineQueryChips(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const normalizedQuery = trimmed.toLowerCase();
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const firstToken = queryTokens[0] ?? '';

  const isLowSignalSingleToken =
    queryTokens.length === 1 &&
    LETTERS_ONLY_PATTERN.test(firstToken) &&
    firstToken.length <= 3 &&
    !SHORT_TECH_TOKENS.has(firstToken);
  const isRepeatedCharacterNoise = queryTokens.length === 1 && /^([a-z])\1{2,}$/i.test(firstToken);

  if (isLowSignalSingleToken || isRepeatedCharacterNoise) {
    return [];
  }

  const lower = trimmed.toLowerCase();
  const appendSuffix = (suffix: string): void => {
    const normalizedSuffix = suffix.trim().toLowerCase();
    if (!normalizedSuffix) {
      return;
    }

    if (lower.endsWith(normalizedSuffix)) {
      return;
    }

    suggestions.push(`${trimmed} ${suffix}`);
  };
  const suggestions: string[] = [];

  const isHowToQuery = /^(how to|how do i|how can i)\b/i.test(trimmed);
  const isComparisonQuery = /\b(vs|versus|compare|difference between)\b/i.test(trimmed);
  const isDefinitionQueryText =
    /^define\s+/i.test(trimmed) || /\b(definition of|meaning of|what is)\b/i.test(trimmed) || queryTokens.length === 1;
  const isBroadAcronymQuery = queryTokens.length === 1 && BROAD_ACRONYM_QUERIES.has(firstToken);

  if (isBroadAcronymQuery) {
    appendSuffix('use cases');
    appendSuffix('risks and limitations');
    suggestions.push(`${trimmed} vs machine learning`);
    appendSuffix('in software engineering');
  } else if (isHowToQuery) {
    appendSuffix('step by step');
    appendSuffix('examples');
    appendSuffix('common mistakes');
    appendSuffix('best practices');
  } else if (isComparisonQuery) {
    appendSuffix('pros and cons');
    appendSuffix('when to use each');
    appendSuffix('performance tradeoffs');
    appendSuffix('for production systems');
  } else if (isDefinitionQueryText) {
    appendSuffix('explained');
    appendSuffix('real world examples');
    appendSuffix('use cases');
    appendSuffix('vs related terms');
  } else {
    appendSuffix('best practices');
    appendSuffix('examples');
    appendSuffix('architecture');
    appendSuffix('production checklist');
  }

  const seen = new Set<string>();
  const unique = suggestions
    .map((item) => item.trim().replace(/\s+/g, ' '))
    .map((item) => {
      const tokens = item.split(' ').filter(Boolean);
      const compacted: string[] = [];
      for (const token of tokens) {
        const previous = compacted[compacted.length - 1];
        if (previous && previous.toLowerCase() === token.toLowerCase()) {
          continue;
        }
        compacted.push(token);
      }
      return compacted.join(' ');
    })
    .filter((item) => {
      if (!item || item.toLowerCase() === lower || item.toLowerCase().startsWith('what is what is ')) {
        return false;
      }
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

  return unique.slice(0, MAX_REFINE_CHIPS);
}

function detectQueryIntent(query: string): string {
  const trimmed = query.trim();
  const lowered = trimmed.toLowerCase();
  const tokens = lowered.split(/\s+/).filter(Boolean);

  if (!trimmed) {
    return 'general';
  }

  if (/\b(vs|versus|compare|difference between)\b/i.test(trimmed)) {
    return 'comparison';
  }

  if (/^(how to|how do i|how can i)\b/i.test(trimmed)) {
    return 'how-to';
  }

  if (/^(what is|what are|what does|explain)\b/i.test(trimmed) || /\b(explained|overview|basics?)$/i.test(trimmed)) {
    return 'explanatory';
  }

  if (/^define\s+/i.test(trimmed) || /\b(definition of|meaning of)\b/i.test(trimmed)) {
    return 'definition';
  }

  if (tokens.length === 1 && BROAD_ACRONYM_QUERIES.has(tokens[0] ?? '')) {
    return 'broad acronym';
  }

  if (isDefinitionQuery(trimmed)) {
    return 'definition';
  }

  return 'general';
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [isResultsView, setIsResultsView] = useState(false);
  const [showStickySearch, setShowStickySearch] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [summaryStatus, setSummaryStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [definition, setDefinition] = useState<DefinitionResponse | null>(null);
  const [definitionLoading, setDefinitionLoading] = useState(false);
  const [nextPageOffset, setNextPageOffset] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [response, setResponse] = useState<SearchResponse>(EMPTY_RESPONSE);
  const [searchLatencyMs, setSearchLatencyMs] = useState<number | null>(null);
  const [summaryLatencyMs, setSummaryLatencyMs] = useState<number | null>(null);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const activeSearchIdRef = useRef(0);
  const hasInitializedFromUrlRef = useRef(false);
  const hasLoadedHistoryRef = useRef(false);
  const searchHeaderRef = useRef<HTMLElement | null>(null);
  const hasLoadedResults = isResultsView && !resultsLoading && !error;
  const refineChips = buildRefineQueryChips(submittedQuery);

  async function onSearch(
    nextQuery?: string,
    options: { updateUrl?: boolean; replaceUrl?: boolean } = {},
  ): Promise<void> {
    const trimmedQuery = (nextQuery ?? query).trim();
    if (!trimmedQuery) {
      return;
    }

    if (options.updateUrl !== false && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('q', trimmedQuery);
      const nextSearch = params.toString();
      const nextUrl = nextSearch ? `/?${nextSearch}` : '/';
      const method = options.replaceUrl ? 'replaceState' : 'pushState';
      window.history[method](null, '', nextUrl);
    }

    const searchId = activeSearchIdRef.current + 1;
    activeSearchIdRef.current = searchId;

    setQuery(trimmedQuery);
    setSearchHistory((previous) => mergeSearchHistory(previous, trimmedQuery));
    setIsResultsView(true);
    setSubmittedQuery(trimmedQuery);
    setError(null);
    setLoadMoreError(null);
    setDefinition(null);
    setDefinitionLoading(false);
    setResultsLoading(true);
    setIsLoadingMore(false);
    setNextPageOffset(0);
    setHasMoreResults(false);
    setSummaryStatus('idle');
    setResponse(EMPTY_RESPONSE);
    setSearchLatencyMs(null);
    setSummaryLatencyMs(null);

    const searchStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const definitionWord = isDefinitionQuery(trimmedQuery) ? extractDefinitionWord(trimmedQuery) : null;
    if (definitionWord) {
      setDefinitionLoading(true);
      void (async () => {
        const definitionData = await defineApi(definitionWord);
        if (activeSearchIdRef.current !== searchId) {
          return;
        }
        setDefinition(definitionData);
        setDefinitionLoading(false);
      })();
    }

    try {
      const data = await searchApi({ query: trimmedQuery, safeMode: true, count: PAGE_SIZE, offset: 0 });
      if (activeSearchIdRef.current !== searchId) {
        return;
      }

      setResponse({
        ...data,
        summary: null,
        summaryError: null,
        claims: [],
      });
      setSearchLatencyMs((typeof performance !== 'undefined' ? performance.now() : Date.now()) - searchStartedAt);
      setResultsLoading(false);
      setNextPageOffset(1);
      setHasMoreResults(data.moreResultsAvailable ?? data.results.length === PAGE_SIZE);

      if (data.results.length === 0) {
        setSummaryStatus('idle');
        return;
      }

      setSummaryStatus('loading');
      const summaryInputResults =
        data.selectedEvidence && data.selectedEvidence.length > 0 ? data.selectedEvidence : data.results;
      const summaryStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      void (async () => {
        const summaryData = await summarizeApi({
          query: trimmedQuery,
          results: summaryInputResults,
        });

        if (activeSearchIdRef.current !== searchId) {
          return;
        }

        setResponse((previous) => ({
          ...previous,
          summary: summaryData.summary,
          summaryError: summaryData.summaryError ?? null,
          sources: summaryData.sources ?? previous.sources,
          claims: summaryData.claims ?? [],
        }));
        setSummaryLatencyMs((typeof performance !== 'undefined' ? performance.now() : Date.now()) - summaryStartedAt);
        setSummaryStatus(summaryData.summary || (summaryData.claims?.length ?? 0) > 0 ? 'ready' : 'error');
      })();
    } catch (err) {
      if (activeSearchIdRef.current !== searchId) {
        return;
      }
      const message = err instanceof Error ? err.message : 'Search request failed';
      setError(withRetryHint(message));
      setResponse(EMPTY_RESPONSE);
      setResultsLoading(false);
      setSummaryStatus('idle');
    }
  }

  const traceSelectedSources =
    response.sources.length > 0
      ? response.sources
      : (response.selectedEvidence ?? []).slice(0, 3).map((source) => ({
          title: source.title,
          url: source.url,
          domain: source.displayUrl,
          snippet: source.description,
        }));

  const systemTrace: SystemTraceData | null = hasLoadedResults
    ? {
        query: submittedQuery,
        intent: detectQueryIntent(submittedQuery),
        expandedQueries: refineChips,
        retrievedCount: response.retrievedCount ?? null,
        selectedCount: response.selectedCount ?? null,
        selectedSources: traceSelectedSources,
        latencyMs:
          searchLatencyMs !== null ? searchLatencyMs + (summaryLatencyMs ?? 0) : summaryLatencyMs ?? null,
        claimCount: response.claims.length,
      }
    : null;

  useEffect(() => {
    setSearchHistory(readStoredHistory());
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

  useEffect(() => {
    if (hasInitializedFromUrlRef.current || typeof window === 'undefined') {
      return;
    }
    hasInitializedFromUrlRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const queryFromUrl = (params.get('q') ?? '').trim();
    if (!queryFromUrl) {
      return;
    }

    setQuery(queryFromUrl);
    void onSearch(queryFromUrl, { updateUrl: false });
  }, []);

  useEffect(() => {
    if (!isResultsView || typeof window === 'undefined') {
      setShowStickySearch(false);
      return;
    }

    const header = searchHeaderRef.current;
    if (!header) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowStickySearch(!(entry?.isIntersecting ?? true));
      },
      {
        root: null,
        threshold: 0,
        rootMargin: '-12px 0px 0px 0px',
      },
    );

    observer.observe(header);

    return () => {
      observer.disconnect();
    };
  }, [isResultsView]);

  async function onLoadMore(): Promise<void> {
    if (!submittedQuery || !hasMoreResults || isLoadingMore || resultsLoading) {
      return;
    }

    const searchId = activeSearchIdRef.current;
    setLoadMoreError(null);
    setIsLoadingMore(true);

    try {
      const data = await searchApi({
        query: submittedQuery,
        safeMode: true,
        count: PAGE_SIZE,
        offset: nextPageOffset,
      });

      if (activeSearchIdRef.current !== searchId) {
        return;
      }

      setResponse((previous) => ({
        ...previous,
        results: appendUniqueResults(previous.results, data.results),
      }));
      setNextPageOffset((previous) => previous + 1);
      setHasMoreResults(data.moreResultsAvailable ?? data.results.length === PAGE_SIZE);
    } catch (err) {
      if (activeSearchIdRef.current !== searchId) {
        return;
      }

      const message = err instanceof Error ? err.message : 'Unable to load more results';
      setLoadMoreError(message);
    } finally {
      if (activeSearchIdRef.current === searchId) {
        setIsLoadingMore(false);
      }
    }
  }

  return (
    <main className={isResultsView ? 'stack results-layout' : 'stack landing-layout'}>
      {isResultsView && showStickySearch ? (
        <div className="sticky-search-shell" role="search" aria-label="Sticky search">
          <div className="sticky-search-bar">
            <SearchBar
              value={query}
              onChange={setQuery}
              onSubmit={onSearch}
              loading={resultsLoading}
              compact
            />
          </div>
        </div>
      ) : null}
      {!isResultsView ? (
        <section className="landing-search">
          <div className="landing-hero stack">
            <AppUtilities
              historyItems={searchHistory}
              onRunHistory={(historyQuery) => {
                void onSearch(historyQuery);
              }}
              onClearHistory={() => {
                setSearchHistory([]);
              }}
              themePreference={themePreference}
              onThemeChange={setThemePreference}
            />
            <p className="landing-eyebrow">Verifiable search engine</p>
            <div className="stack landing-copy">
              <h1>Search with evidence</h1>
              <p className="landing-subheading">Verifiable answers grounded in source links.</p>
            </div>
            <SearchBar
              value={query}
              onChange={setQuery}
              onSubmit={onSearch}
              loading={resultsLoading}
              placeholder="Ask anything..."
            />
            <div className="landing-suggestion-block stack">
              <p className="landing-suggestion-label">Try a grounded query</p>
              <div className="landing-suggestion-chips" aria-label="Suggested example searches">
                {HOMEPAGE_SUGGESTED_QUERIES.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="landing-suggestion-chip"
                    disabled={resultsLoading}
                    onClick={() => {
                      void onSearch(suggestion);
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <>
          <AppUtilities
            historyItems={searchHistory}
            onRunHistory={(historyQuery) => {
              void onSearch(historyQuery);
            }}
            onClearHistory={() => {
              setSearchHistory([]);
            }}
            themePreference={themePreference}
            onThemeChange={setThemePreference}
          />
          <section ref={searchHeaderRef} className="card stack search-header-card">
            <SearchBar
              value={query}
              onChange={setQuery}
              onSubmit={onSearch}
              loading={resultsLoading}
              compact
            />
            <p className="muted results-for-label">
              <span>Results for:</span>{' '}
              <strong className="results-for-query">"{submittedQuery}"</strong>
            </p>
            {refineChips.length > 0 ? (
              <div className="refine-chips" aria-label="Refine query suggestions">
                {refineChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="refine-chip"
                    disabled={resultsLoading || isLoadingMore}
                    onClick={() => {
                      void onSearch(chip);
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          {resultsLoading ? (
            <section className="card">
              <p className="muted">Searching...</p>
            </section>
          ) : null}

          <ErrorState message={error} />

          {hasLoadedResults && definitionLoading ? (
            <section className="card">
              <p className="muted">Looking up definition...</p>
            </section>
          ) : null}

          {hasLoadedResults && definition ? <DefinitionCard definition={definition} /> : null}

          {hasLoadedResults && summaryStatus === 'loading' ? (
            <section className="card stack">
              <h2>Summary</h2>
              <div className="summary-skeleton stack" aria-label="AI summary loading">
                <span className="skeleton-line" />
                <span className="skeleton-line" />
                <span className="skeleton-line skeleton-line-short" />
              </div>
            </section>
          ) : null}

          {hasLoadedResults && summaryStatus === 'ready' && response.summary ? (
            <SummaryCard
              summary={response.summary}
              sources={response.sources}
              claims={response.claims}
              trace={systemTrace}
            />
          ) : null}

          {hasLoadedResults && summaryStatus === 'error' ? (
            <section className="card stack">
              <h2>Summary</h2>
              <p className="muted">{response.summaryError ?? 'AI summary unavailable right now.'}</p>
              <SummarySourceList sources={response.sources} />
              {systemTrace ? <SystemTracePanel trace={systemTrace} /> : null}
            </section>
          ) : null}

          {hasLoadedResults ? (
            <ResultList
              results={response.results}
              query={submittedQuery}
              canLoadMore={response.results.length > 0 && hasMoreResults}
              onLoadMore={() => {
                void onLoadMore();
              }}
              isLoadingMore={isLoadingMore}
            />
          ) : null}

          {hasLoadedResults && loadMoreError ? <p className="error">{loadMoreError}</p> : null}
        </>
      )}
    </main>
  );
}
