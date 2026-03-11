'use client';

import { useState } from 'react';

import type { SummarySourceLink } from '../lib/api-client';

export interface SystemTraceData {
  query: string;
  intent: string | null;
  expandedQueries: string[];
  retrievedCount: number | null;
  selectedCount: number | null;
  selectedSources: SummarySourceLink[];
  latencyMs: number | null;
  claimCount: number;
  rankingAudit?: {
    safeSearchLevel: 'strict' | 'off';
    reranked: boolean;
    lowTrustDemotions: number;
    spammyDemotions: number;
    sensitiveDemotions: number;
    contextualSensitiveDemotions: number;
    topDemotionReasons: string[];
  } | null;
}

function formatLatency(latencyMs: number | null): string {
  if (latencyMs === null || Number.isNaN(latencyMs)) {
    return 'Unavailable';
  }

  if (latencyMs >= 1000) {
    return `${(latencyMs / 1000).toFixed(1)}s`;
  }

  return `${Math.round(latencyMs)}ms`;
}

function formatIntent(intent: string | null): string {
  if (!intent) {
    return 'Unknown';
  }

  return intent;
}

export function SystemTracePanel({ trace }: { trace: SystemTraceData }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="stack system-trace-section">
      <button
        type="button"
        className="trace-toggle"
        onClick={() => setIsOpen((previous) => !previous)}
        aria-expanded={isOpen}
      >
        <span aria-hidden="true" className="trace-toggle-glyph">
          &lt;/&gt;
        </span>
        {isOpen ? 'Hide system trace' : 'Show system trace'}
      </button>

      {isOpen ? (
        <div className="stack system-trace-panel">
          <strong>System trace</strong>

          <dl className="system-trace-grid">
            <div className="system-trace-row">
              <dt>Query</dt>
              <dd className="system-trace-value">{trace.query}</dd>
            </div>

            <div className="system-trace-row">
              <dt>Intent</dt>
              <dd className="system-trace-value">{formatIntent(trace.intent)}</dd>
            </div>

            <div className="system-trace-row">
              <dt>Expanded queries</dt>
              <dd className="system-trace-value">
                {trace.expandedQueries.length > 0 ? (
                  <ul className="system-trace-list">
                    {trace.expandedQueries.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  'None'
                )}
              </dd>
            </div>

            <div className="system-trace-row">
              <dt>Retrieval</dt>
              <dd className="system-trace-value">
                {trace.retrievedCount ?? 'Unknown'} sources retrieved
                <br />
                {trace.selectedCount ?? 'Unknown'} selected for summary
              </dd>
            </div>

            <div className="system-trace-row">
              <dt>Selected sources</dt>
              <dd className="system-trace-value">
                {trace.selectedSources.length > 0 ? (
                  <ul className="system-trace-list">
                    {trace.selectedSources.map((source) => (
                      <li key={source.url}>{source.domain ?? source.title}</li>
                    ))}
                  </ul>
                ) : (
                  'None'
                )}
              </dd>
            </div>

            <div className="system-trace-row">
              <dt>Answer stats</dt>
              <dd className="system-trace-value">
                {trace.claimCount} claim{trace.claimCount === 1 ? '' : 's'}
                <br />
                {formatLatency(trace.latencyMs)} latency
              </dd>
            </div>

            {trace.rankingAudit ? (
              <div className="system-trace-row">
                <dt>Ranking audit</dt>
                <dd className="system-trace-value">
                  Safe mode {trace.rankingAudit.safeSearchLevel}
                  <br />
                  {trace.rankingAudit.reranked ? 'Quality reranking applied' : 'No reranking'}
                  <br />
                  {trace.rankingAudit.lowTrustDemotions} low-trust, {trace.rankingAudit.spammyDemotions} spam,{' '}
                  {trace.rankingAudit.sensitiveDemotions} sensitive demotions
                  {trace.rankingAudit.contextualSensitiveDemotions > 0 ? (
                    <>
                      <br />
                      {trace.rankingAudit.contextualSensitiveDemotions} context-softened
                    </>
                  ) : null}
                  {trace.rankingAudit.topDemotionReasons.length > 0 ? (
                    <>
                      <br />
                      Top reasons: {trace.rankingAudit.topDemotionReasons.join(', ')}
                    </>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
