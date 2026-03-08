'use client';

import { useRef, useState } from 'react';

import { ErrorState } from '../components/ErrorState';
import { ResultList } from '../components/ResultList';
import { SearchBar } from '../components/SearchBar';
import { SummaryCard } from '../components/SummaryCard';
import type { SearchItem } from '../lib/api-client';
import { searchApi, summarizeApi, type SearchResponse } from '../lib/api-client';

const EMPTY_RESPONSE: SearchResponse = {
  query: '',
  safeModeApplied: true,
  summary: null,
  summaryError: null,
  sources: [],
  results: [],
};
const PAGE_SIZE = 10;

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

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [isResultsView, setIsResultsView] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [summaryStatus, setSummaryStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [nextPageOffset, setNextPageOffset] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [response, setResponse] = useState<SearchResponse>(EMPTY_RESPONSE);
  const activeSearchIdRef = useRef(0);
  const hasLoadedResults = isResultsView && !resultsLoading && !error;

  async function onSearch(nextQuery?: string): Promise<void> {
    const trimmedQuery = (nextQuery ?? query).trim();
    if (!trimmedQuery) {
      return;
    }
    const searchId = activeSearchIdRef.current + 1;
    activeSearchIdRef.current = searchId;

    setQuery(trimmedQuery);
    setIsResultsView(true);
    setSubmittedQuery(trimmedQuery);
    setError(null);
    setLoadMoreError(null);
    setResultsLoading(true);
    setIsLoadingMore(false);
    setNextPageOffset(0);
    setHasMoreResults(false);
    setSummaryStatus('idle');
    setResponse(EMPTY_RESPONSE);

    try {
      const data = await searchApi({ query: trimmedQuery, safeMode: true, count: PAGE_SIZE, offset: 0 });
      if (activeSearchIdRef.current !== searchId) {
        return;
      }

      setResponse({
        ...data,
        summary: null,
        summaryError: null,
      });
      setResultsLoading(false);
      setNextPageOffset(1);
      setHasMoreResults(data.moreResultsAvailable ?? data.results.length === PAGE_SIZE);

      if (data.results.length === 0) {
        setSummaryStatus('idle');
        return;
      }

      setSummaryStatus('loading');
      void (async () => {
        const summaryData = await summarizeApi({
          query: trimmedQuery,
          results: data.results,
        });

        if (activeSearchIdRef.current !== searchId) {
          return;
        }

        setResponse((previous) => ({
          ...previous,
          summary: summaryData.summary,
          summaryError: summaryData.summaryError ?? null,
        }));
        setSummaryStatus(summaryData.summary ? 'ready' : 'error');
      })();
    } catch (err) {
      if (activeSearchIdRef.current !== searchId) {
        return;
      }
      const message = err instanceof Error ? err.message : 'Search request failed';
      setError(message);
      setResponse(EMPTY_RESPONSE);
      setResultsLoading(false);
      setSummaryStatus('idle');
    }
  }

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

          {hasLoadedResults && summaryStatus === 'loading' ? (
            <section className="card stack">
              <h2>AI Summary</h2>
              <div className="summary-skeleton stack" aria-label="AI summary loading">
                <span className="skeleton-line" />
                <span className="skeleton-line" />
                <span className="skeleton-line skeleton-line-short" />
              </div>
            </section>
          ) : null}

          {hasLoadedResults && summaryStatus === 'ready' && response.summary ? (
            <SummaryCard summary={response.summary} sources={response.sources} />
          ) : null}

          {hasLoadedResults && summaryStatus === 'error' ? (
            <section className="card stack">
              <h2>AI Summary</h2>
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

          {hasLoadedResults ? <ResultList results={response.results} /> : null}

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
