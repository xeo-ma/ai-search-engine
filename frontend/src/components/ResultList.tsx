import type { SearchItem } from '../lib/api-client';

const FALLBACK_FAVICON_PATH = '/favicon-fallback.svg';
const TOKEN_PATTERN = /[a-z0-9]+/gi;

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  const pattern = new RegExp(`(${queryTerms.map(escapeForRegex).join('|')})`, 'gi');
  const fragments = snippet.split(pattern);

  return fragments.map((fragment, index) => {
    if (!fragment) {
      return null;
    }

    const isMatch = queryTerms.includes(fragment.toLowerCase());
    if (!isMatch) {
      return <span key={`${index}-${fragment.slice(0, 8)}`}>{fragment}</span>;
    }

    return (
      <mark key={`${index}-${fragment.slice(0, 8)}`} className="snippet-highlight">
        {fragment}
      </mark>
    );
  });
}

function buildFaviconUrl(resultUrl: string): string {
  try {
    const hostname = new URL(resultUrl).hostname;
    return `https://${hostname}/favicon.ico`;
  } catch {
    return FALLBACK_FAVICON_PATH;
  }
}

export function ResultList({ results, query }: { results: SearchItem[]; query: string }) {
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
            <p className="muted">{result.displayUrl ?? result.url}</p>
            <p>{renderHighlightedSnippet(result.description, queryTerms)}</p>
          </article>
        ))
      )}
    </section>
  );
}
