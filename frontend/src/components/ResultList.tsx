import type { SearchItem } from '../lib/api-client';

const FALLBACK_FAVICON_PATH = '/favicon-fallback.svg';

function buildFaviconUrl(resultUrl: string): string {
  try {
    const hostname = new URL(resultUrl).hostname;
    return `https://${hostname}/favicon.ico`;
  } catch {
    return FALLBACK_FAVICON_PATH;
  }
}

export function ResultList({ results }: { results: SearchItem[] }) {
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
            <p>{result.description}</p>
          </article>
        ))
      )}
    </section>
  );
}
