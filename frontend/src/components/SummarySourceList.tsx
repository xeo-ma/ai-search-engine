'use client';

import type { SummarySourceLink } from '../lib/api-client';

const FALLBACK_FAVICON_PATH = '/favicon-fallback.svg';

function buildFaviconUrl(sourceUrl: string): string {
  try {
    const hostname = new URL(sourceUrl).hostname;
    return `https://${hostname}/favicon.ico`;
  } catch {
    return FALLBACK_FAVICON_PATH;
  }
}

function getDisplayDomain(source: SummarySourceLink): string {
  if (source.domain?.trim()) {
    return source.domain.trim();
  }

  try {
    return new URL(source.url).hostname;
  } catch {
    return source.url;
  }
}

interface SummarySourceListProps {
  sources: SummarySourceLink[];
}

export function SummarySourceList({ sources }: SummarySourceListProps) {
  if (sources.length === 0) {
    return <p className="muted">No citations yet.</p>;
  }

  return (
    <div className="stack summary-sources">
      <strong>Sources</strong>
      <div className="stack summary-source-list">
        {sources.map((source) => {
          const title = source.title?.trim() || getDisplayDomain(source);
          const domain = getDisplayDomain(source);

          return (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="summary-source-item"
              aria-label={title}
            >
              <img
                src={buildFaviconUrl(source.url)}
                alt=""
                width={16}
                height={16}
                className="result-favicon summary-source-favicon"
                loading="eager"
                fetchPriority="high"
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
              <div className="summary-source-copy">
                <span className="summary-source-link">{title}</span>
                <p className="summary-source-domain">{domain}</p>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
