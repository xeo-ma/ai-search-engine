'use client';

import { useEffect, useRef, useState } from 'react';

import { DefinitionCard } from '../components/DefinitionCard';
import { ErrorState } from '../components/ErrorState';
import { ResultList } from '../components/ResultList';
import { SearchBar } from '../components/SearchBar';
import { SummaryCard } from '../components/SummaryCard';
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
const LETTERS_ONLY_PATTERN = /^[a-zA-Z]+$/;
const MIN_DEFINITION_WORD_LENGTH = 2;
const ACRONYM_PRIORITY_QUERIES = new Set(['ai']);

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

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [isResultsView, setIsResultsView] = useState(false);
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
  const activeSearchIdRef = useRef(0);
  const hasInitializedFromUrlRef = useRef(false);
  const hasLoadedResults = isResultsView && !resultsLoading && !error;

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
      {!isResultsView ? (
        <section className="landing-search">
          <SearchBar value={query} onChange={setQuery} onSubmit={onSearch} loading={resultsLoading} />
        </section>
      ) : (
        <>
          <section className="card stack">
            <SearchBar
              value={query}
              onChange={setQuery}
              onSubmit={onSearch}
              loading={resultsLoading}
              compact
            />
            <p className="muted">Results for: "{submittedQuery}"</p>
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
            <SummaryCard summary={response.summary} sources={response.sources} claims={response.claims} />
          ) : null}

          {hasLoadedResults && summaryStatus === 'error' ? (
            <section className="card stack">
              <h2>Summary</h2>
              <p className="muted">{response.summaryError ?? 'AI summary unavailable right now.'}</p>
              {response.sources.length > 0 ? (
                <div className="stack">
                  <strong>Sources</strong>
                  {response.sources.map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {hasLoadedResults ? <ResultList results={response.results} query={submittedQuery} /> : null}

          {hasLoadedResults && response.results.length > 0 ? (
            <section className="row load-more-row">
              <button type="button" onClick={onLoadMore} disabled={!hasMoreResults || isLoadingMore}>
                {isLoadingMore ? 'Loading more...' : 'Load more results'}
              </button>
            </section>
          ) : null}

          {hasLoadedResults && loadMoreError ? <p className="error">{loadMoreError}</p> : null}
        </>
      )}
    </main>
  );
}
