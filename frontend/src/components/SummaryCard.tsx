'use client';

import { useState } from 'react';

import type { SummaryClaim, SummarySourceLink } from '../lib/api-client';
import { ClaimEvidenceList } from './ClaimEvidenceList';
import { EvidenceItem } from './EvidenceItem';
import { SummarySourceList } from './SummarySourceList';
import { SystemTracePanel, type SystemTraceData } from './SystemTracePanel';

const FALLBACK_FAVICON_PATH = '/favicon-fallback.svg';

interface SummaryCardProps {
  summary: string;
  sources: SummarySourceLink[];
  claims?: SummaryClaim[];
  trace?: SystemTraceData | null;
}

function buildFaviconUrl(sourceUrl: string): string {
  try {
    const hostname = new URL(sourceUrl).hostname;
    return `https://${hostname}/favicon.ico`;
  } catch {
    return FALLBACK_FAVICON_PATH;
  }
}

function splitSummaryMetaInsight(summary: string): { primary: string; meta: string | null } {
  const normalized = summary.trim();
  const sentences = normalized.match(/[^.!?]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];

  if (sentences.length < 2) {
    return { primary: normalized, meta: null };
  }

  const lastSentence = sentences[sentences.length - 1] ?? '';
  const metaInsightPattern =
    /\b(reference sources?|sources?|citations?|evidence|generally|overall|in similar terms|vary|agree|disagree|consistent)\b/i;

  if (!metaInsightPattern.test(lastSentence)) {
    return { primary: normalized, meta: null };
  }

  return {
    primary: sentences.slice(0, -1).join(' ').trim(),
    meta: lastSentence,
  };
}

export function SummaryCard({ summary, sources, claims = [], trace = null }: SummaryCardProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const hasClaims = claims.length > 0;
  const hasEvidenceFallback = !hasClaims && sources.length > 0;
  const canShowEvidence = hasClaims || hasEvidenceFallback;
  const { primary, meta } = splitSummaryMetaInsight(summary);
  const evidenceToggleLabel = showEvidence ? 'Hide evidence' : 'Show evidence';

  return (
    <section className="card stack">
      {!showEvidence && sources.length > 0 ? (
        <section className="summary-top-sources" aria-label="Top sources">
          <p className="summary-top-sources-label">Top sources</p>
          <div className="summary-top-sources-rail">
            {sources.slice(0, 3).map((source) => {
              const domain = source.domain?.trim() || (() => {
                try {
                  return new URL(source.url).hostname;
                } catch {
                  return source.url;
                }
              })();

              return (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="summary-top-source-chip"
                  aria-label={domain}
                >
                  <img
                    src={buildFaviconUrl(source.url)}
                    alt=""
                    width={14}
                    height={14}
                    className="summary-top-source-favicon"
                    loading="eager"
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
                  <span className="summary-top-source-domain">{domain}</span>
                </a>
              );
            })}
          </div>
        </section>
      ) : null}
      <h2>Summary</h2>
      <div className="stack summary-copy">
        <p className="summary-text">{primary}</p>
        {meta ? <p className="summary-meta">{meta}</p> : null}
      </div>
      {canShowEvidence ? (
        <button
          type="button"
          className="evidence-toggle"
          onClick={() => setShowEvidence((previous) => !previous)}
          aria-expanded={showEvidence}
        >
          <span aria-hidden="true" className={`evidence-toggle-chevron${showEvidence ? ' is-open' : ''}`}>
            ˅
          </span>
          {evidenceToggleLabel}
        </button>
      ) : null}
      {showEvidence && hasClaims ? <ClaimEvidenceList claims={claims} /> : null}
      {showEvidence && hasEvidenceFallback ? (
        <section className="stack fallback-evidence-panel" aria-label="Evidence sources">
          <p className="source-grounding-label">Key sources behind this summary</p>
          <div className="evidence-list stack">
            {sources.slice(0, 3).map((source) => (
              <EvidenceItem key={source.url} source={source} />
            ))}
          </div>
        </section>
      ) : null}
      {!showEvidence ? <SummarySourceList sources={sources} /> : null}
      {trace ? <SystemTracePanel trace={trace} /> : null}
    </section>
  );
}
