'use client';

import { useState } from 'react';

import type { SummaryClaim, SummarySourceLink } from '../lib/api-client';
import { ClaimEvidenceList } from './ClaimEvidenceList';
import { EvidenceItem } from './EvidenceItem';
import { SummarySourceList } from './SummarySourceList';

interface SummaryCardProps {
  summary: string;
  sources: SummarySourceLink[];
  claims?: SummaryClaim[];
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

export function SummaryCard({ summary, sources, claims = [] }: SummaryCardProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const hasClaims = claims.length > 0;
  const hasEvidenceFallback = !hasClaims && sources.length > 0;
  const canShowEvidence = hasClaims || hasEvidenceFallback;
  const { primary, meta } = splitSummaryMetaInsight(summary);

  return (
    <section className="card stack">
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
          {showEvidence ? 'Hide evidence' : 'Show evidence'}
        </button>
      ) : null}
      {showEvidence && hasClaims ? <ClaimEvidenceList claims={claims} /> : null}
      {showEvidence && hasEvidenceFallback ? (
        <section className="stack fallback-evidence-panel" aria-label="Evidence sources">
          <p className="claim-label">Key sources behind this summary</p>
          <div className="evidence-list stack">
            {sources.slice(0, 3).map((source) => (
              <EvidenceItem key={source.url} source={source} />
            ))}
          </div>
        </section>
      ) : null}
      {!showEvidence ? <SummarySourceList sources={sources} /> : null}
    </section>
  );
}
