'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';

import { AppUtilities, type PlanPreference, type SearchHistoryEntry, type ThemePreference } from '../components/AppUtilities';
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
  fetchAccountState,
  searchApi,
  summarizeApi,
  updateAccountPreferences,
  type AccountStateResponse,
  type DefinitionResponse,
  type SearchResponse,
} from '../lib/api-client';
import { useSearchPersistence } from '../lib/use-search-persistence';

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
  const [searchGateMessage, setSearchGateMessage] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [definition, setDefinition] = useState<DefinitionResponse | null>(null);
  const [definitionLoading, setDefinitionLoading] = useState(false);
  const [nextPageOffset, setNextPageOffset] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [response, setResponse] = useState<SearchResponse>(EMPTY_RESPONSE);
  const [searchLatencyMs, setSearchLatencyMs] = useState<number | null>(null);
  const [summaryLatencyMs, setSummaryLatencyMs] = useState<number | null>(null);
  const [accountState, setAccountState] = useState<AccountStateResponse>({
    authenticated: false,
    userId: null,
    email: null,
    plan: 'free',
    subscriptionStatus: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    deepSearchAvailable: false,
    deepSearchEnabled: false,
    safeMode: true,
    freeSearchesRemaining: null,
  });
  const {
    searchHistory,
    setSearchHistory,
    addSearchHistory,
    safeMode,
    setSafeMode,
    themePreference,
    setThemePreference,
  } = useSearchPersistence();
  const activeSearchIdRef = useRef(0);
  const hasInitializedFromUrlRef = useRef(false);
  const searchHeaderRef = useRef<HTMLElement | null>(null);
  const hasLoadedResults = isResultsView && !resultsLoading && !error;
  const refineChips = buildRefineQueryChips(submittedQuery);
  const plan: PlanPreference = accountState.plan;
  const deepSearchEnabled = accountState.deepSearchAvailable ? accountState.deepSearchEnabled : false;
  const freeSearchesRemaining = accountState.freeSearchesRemaining;
  const planMessage = accountState.authenticated
    ? plan === 'pro'
      ? 'Managed through billing. Deep search eligibility is enforced server-side.'
      : 'Free plan is enforced from your account entitlement. Upgrade to Pro for deeper retrieval.'
    : 'Signed-out searches use the free experience. Sign in to sync billing and preferences.';

  function handleSafeModeChange(nextSafeMode: boolean): void {
    setSafeMode(nextSafeMode);

    if (!submittedQuery) {
      return;
    }

    void onSearch(submittedQuery, { replaceUrl: true, safeModeOverride: nextSafeMode, countUsage: false });
  }

  function handleDeepSearchChange(nextDeepSearchEnabled: boolean): void {
    void (async () => {
      try {
        const nextAccountState = await updateAccountPreferences({
          deepSearchEnabled: nextDeepSearchEnabled,
        });
        setAccountState(nextAccountState);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to update deep search preference';
        setLoadMoreError(message);
        return;
      }

      if (!submittedQuery) {
        return;
      }

      void onSearch(submittedQuery, {
        replaceUrl: true,
        deepSearchOverride: nextDeepSearchEnabled,
        countUsage: false,
      });
    })();
  }

  async function handleSignIn(): Promise<void> {
    const callbackUrl = typeof window !== 'undefined' ? window.location.href : '/';
    window.location.assign(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  async function handleSignOut(): Promise<void> {
    await signOut({
      callbackUrl: '/',
    });
  }

  async function handleUpgradeToPro(): Promise<void> {
    window.location.assign('/billing');
  }

  async function handleManageBilling(): Promise<void> {
    window.location.assign('/billing');
  }

  async function onSearch(
    nextQuery?: string,
    options: {
      updateUrl?: boolean;
      replaceUrl?: boolean;
      safeModeOverride?: boolean;
      deepSearchOverride?: boolean;
      countUsage?: boolean;
    } = {},
  ): Promise<void> {
    const trimmedQuery = (nextQuery ?? query).trim();
    if (!trimmedQuery) {
      return;
    }
    const requestedSafeMode = options.safeModeOverride ?? safeMode;
    const requestedDeepSearch =
      accountState.deepSearchAvailable && (options.deepSearchOverride ?? deepSearchEnabled) ? true : false;
    const shouldCountUsage = options.countUsage ?? true;

    if (plan === 'free' && shouldCountUsage && freeSearchesRemaining !== null && freeSearchesRemaining <= 0) {
      setSearchGateMessage('Free plan limit reached for today. Switch to Pro in settings to keep searching.');
      setLoadMoreError(null);
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
    addSearchHistory(trimmedQuery);
    setIsResultsView(true);
    setSubmittedQuery(trimmedQuery);
    setError(null);
    setSearchGateMessage(null);
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
      const data = await searchApi({
        query: trimmedQuery,
        safeMode: requestedSafeMode,
        plan,
        deepSearch: requestedDeepSearch,
        count: PAGE_SIZE,
        offset: 0,
      });
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
      if (plan === 'free' && shouldCountUsage && accountState.authenticated && freeSearchesRemaining !== null) {
        setAccountState((previous) => ({
          ...previous,
          freeSearchesRemaining: Math.max(0, (previous.freeSearchesRemaining ?? 0) - 1),
        }));
      }

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
      if (/free plan limit reached/i.test(message)) {
        setSearchGateMessage(message);
        setResultsLoading(false);
        setSummaryStatus('idle');
        return;
      }
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
        capabilities: response.capabilities
          ? {
              plan: response.capabilities.plan,
              deepSearchRequested: response.capabilities.deepSearchRequested,
              deepSearchAllowed: response.capabilities.deepSearchAllowed,
              deepSearchApplied: response.capabilities.deepSearchApplied,
            }
          : null,
        rankingAudit: response.rankingAudit
          ? {
              safeSearchLevel: response.rankingAudit.safeSearchLevel,
              reranked: response.rankingAudit.reranked,
              lowTrustDemotions: response.rankingAudit.lowTrustDemotions,
              spammyDemotions: response.rankingAudit.spammyDemotions,
              sensitiveDemotions: response.rankingAudit.sensitiveDemotions,
              contextualSensitiveDemotions: response.rankingAudit.contextualSensitiveDemotions,
              topDemotionReasons: response.rankingAudit.topDemotionReasons,
            }
          : null,
      }
    : null;

  const sharedUtilityProps = {
    historyItems: searchHistory,
    onRunHistory: (historyQuery: string) => {
      void onSearch(historyQuery);
    },
    onClearHistory: () => {
      setSearchHistory([]);
    },
    authenticated: accountState.authenticated,
    plan,
    planMessage,
    email: accountState.email,
    deepSearchEnabled,
    deepSearchAvailable: accountState.deepSearchAvailable,
    onDeepSearchChange: handleDeepSearchChange,
    freeSearchesRemaining,
    onSignIn: handleSignIn,
    onSignOut: handleSignOut,
    onUpgradeToPro: handleUpgradeToPro,
    onManageBilling: handleManageBilling,
    safeMode,
    onSafeModeChange: handleSafeModeChange,
    themePreference,
    onThemeChange: setThemePreference,
  } as const;

  useEffect(() => {
    void (async () => {
      try {
        const nextAccountState = await fetchAccountState();
        setAccountState(nextAccountState);
      } catch {
        // Keep the signed-out free fallback if the account route is unavailable.
      }
    })();
  }, []);

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
        safeMode,
        plan,
        deepSearch: deepSearchEnabled,
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
    <>
      <header className="app-shell-bar">
        <div className={`app-shell-inner${isResultsView && showStickySearch ? ' app-shell-inner-with-search' : ''}`}>
          <a href="/" className="app-shell-brand" aria-label="Go to Lens home">
            <span className="app-shell-brand-text">Lens</span>
          </a>
          {isResultsView && showStickySearch ? (
            <div className="app-shell-search" role="search" aria-label="Sticky search">
              <SearchBar
                value={query}
                onChange={setQuery}
                onSubmit={onSearch}
                loading={resultsLoading}
                compact
              />
            </div>
          ) : null}
          <AppUtilities context="shell" {...sharedUtilityProps} />
        </div>
      </header>
      <main className={`${isResultsView ? 'stack results-layout' : 'stack landing-layout'} app-shell-content`}>
      {!isResultsView ? (
        <section className="landing-search">
          <div className="landing-hero stack">
            <p className="landing-eyebrow">Verifiable search</p>
            <div className="stack landing-copy">
              <h1>Search with evidence</h1>
              <p className="landing-subheading">Answers grounded in real sources.</p>
            </div>
            <SearchBar
              value={query}
              onChange={setQuery}
              onSubmit={onSearch}
              loading={resultsLoading}
              placeholder="Search the web"
            />
            {searchGateMessage ? <p className="error">{searchGateMessage}</p> : null}
            <div className="landing-suggestion-block stack">
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
          <section ref={searchHeaderRef} className="card stack search-header-card">
            <SearchBar
              value={query}
              onChange={setQuery}
              onSubmit={onSearch}
              loading={resultsLoading}
              compact
            />
            {searchGateMessage ? <p className="error">{searchGateMessage}</p> : null}
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
            {accountState.authenticated && plan === 'free' ? (
              <p className="results-capability-note">
                Pro adds deeper retrieval before ranking for difficult queries. <a href="/billing">View billing</a>
              </p>
            ) : null}
          </section>

          {resultsLoading ? (
            <>
              <section className="card stack">
                <h2>Summary</h2>
                <p className="results-loading-copy">Gathering sources and preparing an evidence-backed answer.</p>
                <div className="summary-skeleton stack" aria-label="Summary loading">
                  <span className="skeleton-line" />
                  <span className="skeleton-line" />
                  <span className="skeleton-line skeleton-line-short" />
                </div>
              </section>
              <section className="card stack">
                <h2>Results</h2>
                <p className="results-loading-copy">Ranking candidate sources for the strongest evidence.</p>
                <div className="results-skeleton-list stack" aria-label="Results loading">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="results-skeleton-item stack">
                      <div className="results-skeleton-title-row">
                        <span className="results-skeleton-favicon" />
                        <span className="skeleton-line results-skeleton-title" />
                      </div>
                      <span className="skeleton-line results-skeleton-domain" />
                      <span className="skeleton-line" />
                      <span className="skeleton-line" />
                      <span className="skeleton-line skeleton-line-short" />
                    </div>
                  ))}
                </div>
              </section>
            </>
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
    </>
  );
}
