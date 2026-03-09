import type { SummarySourceLink } from '../lib/api-client';

interface EvidenceItemProps {
  source: SummarySourceLink;
}

export function EvidenceItem({ source }: EvidenceItemProps) {
  const title = source.title || source.domain || 'Source';
  const snippet = source.snippet ? source.snippet.replace(/\s*\.\.\.\s*$/, '').trim() : '';

  return (
    <div className="evidence-item">
      <div className="evidence-head">
        <strong>{title}</strong>
        {source.domain ? (
          <>
            <span className="muted" aria-hidden="true">
              &middot;
            </span>
            <span className="muted">{source.domain}</span>
          </>
        ) : null}
      </div>
      {snippet ? <p className="muted evidence-snippet">{snippet}</p> : null}
      {source.url ? (
        <a className="evidence-link" href={source.url} target="_blank" rel="noreferrer">
          Open source
        </a>
      ) : null}
    </div>
  );
}
