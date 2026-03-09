'use client';

import { useState } from 'react';

import type { SummaryClaim, SummarySourceLink } from '../lib/api-client';
import { ClaimEvidenceList } from './ClaimEvidenceList';

interface SummaryCardProps {
  summary: string;
  sources: SummarySourceLink[];
  claims?: SummaryClaim[];
}

export function SummaryCard({ summary, sources, claims = [] }: SummaryCardProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const hasClaims = claims.length > 0;

  return (
    <section className="card stack">
      <h2>AI Summary</h2>
      <p className="summary-text">{summary}</p>
      {hasClaims ? (
        <button
          type="button"
          className="evidence-toggle"
          onClick={() => setShowEvidence((previous) => !previous)}
          aria-expanded={showEvidence}
        >
          {showEvidence ? 'Hide evidence' : 'Show evidence'}
        </button>
      ) : null}
      {showEvidence && hasClaims ? <ClaimEvidenceList claims={claims} /> : null}
      {!showEvidence && sources.length > 0 ? (
        <div className="stack">
          <strong>Sources</strong>
          {sources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
          ))}
        </div>
      ) : !showEvidence ? (
        <p className="muted">No citations yet.</p>
      ) : null}
    </section>
  );
}
