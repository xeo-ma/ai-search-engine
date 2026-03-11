import type { SearchItem } from '../lib/api-client';

const FALLBACK_FAVICON_PATH = '/favicon-fallback.svg';
const TOKEN_PATTERN = /[a-z0-9]+/gi;

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildQueryTermPattern(queryTerms: string[]): RegExp | null {
  if (queryTerms.length === 0) {
    return null;
  }

  const alternatives = queryTerms.map((term) => {
    const escaped = escapeForRegex(term);
    if (/^[a-z0-9]+$/i.test(term)) {
      return `(?<![a-z0-9])(${escaped})(?![a-z0-9])`;
    }

    return `(${escaped})`;
  });

  return new RegExp(alternatives.join('|'), 'gi');
}

function getQueryTerms(query: string): string[] {
  const matches = query.toLowerCase().match(TOKEN_PATTERN) ?? [];
  const uniqueTerms = new Set<string>();

  for (const match of matches) {
    if (match.length < 2) {
      continue;
    }
    uniqueTerms.add(match);
  }

  return [...uniqueTerms].sort((first, second) => second.length - first.length);
}

function renderHighlightedSnippet(snippet: string, queryTerms: string[]): React.ReactNode {
  if (queryTerms.length === 0) {
    return snippet;
  }

  const pattern = buildQueryTermPattern(queryTerms);
  if (!pattern) {
    return snippet;
  }

  const fragments: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of snippet.matchAll(pattern)) {
    const matchedText = match[0];
    const matchIndex = match.index ?? -1;
    if (!matchedText || matchIndex < 0) {
      continue;
    }

    if (matchIndex > lastIndex) {
      fragments.push(<span key={`text-${lastIndex}`}>{snippet.slice(lastIndex, matchIndex)}</span>);
    }

    fragments.push(
      <mark key={`match-${matchIndex}-${matchedText.toLowerCase()}`} className="snippet-highlight">
        {matchedText}
      </mark>,
    );

    lastIndex = matchIndex + matchedText.length;
  }

  if (lastIndex < snippet.length) {
    fragments.push(<span key={`text-${lastIndex}`}>{snippet.slice(lastIndex)}</span>);
  }

  return fragments.length > 0 ? fragments : snippet;
}

function buildFaviconUrl(resultUrl: string): string {
  try {
    const hostname = new URL(resultUrl).hostname;
    return `https://${hostname}/favicon.ico`;
  } catch {
    return FALLBACK_FAVICON_PATH;
  }
}

export function ResultList({
  results,
  query,
  canLoadMore = false,
  onLoadMore,
  isLoadingMore = false,
}: {
  results: SearchItem[];
  query: string;
  canLoadMore?: boolean;
  onLoadMore?: (() => void) | undefined;
  isLoadingMore?: boolean;
}) {
  const queryTerms = getQueryTerms(query);

  return (
    <section className="card stack">
      <h2>Results</h2>
      {results.length === 0 ? (
        <p className="muted">No results found. Try another query.</p>
      ) : (
        results.map((result) => (
          <article key={result.id} className="result-item stack">
            <a href={result.url} target="_blank" rel="noreferrer" className="result-title-link">
              <img
                src={buildFaviconUrl(result.url)}
                alt=""
                width={16}
                height={16}
                className="result-favicon"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={(event) => {
                  const image = event.currentTarget;
                  if (image.dataset.fallbackApplied === 'true') {
                    return;
                  }
                  image.dataset.fallbackApplied = 'true';
                  image.src = FALLBACK_FAVICON_PATH;
                }}
              />
              <strong>{result.title}</strong>
            </a>
            <p className="muted result-domain">{result.displayUrl ?? result.url}</p>
            <p>{renderHighlightedSnippet(result.description, queryTerms)}</p>
          </article>
        ))
      )}
      {canLoadMore && onLoadMore ? (
        <div className="row load-more-row results-load-more">
          <button type="button" onClick={onLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? 'Loading...' : 'Load more results'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
