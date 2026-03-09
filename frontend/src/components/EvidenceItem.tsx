import type { SummarySourceLink } from '../lib/api-client';

interface EvidenceItemProps {
  source: SummarySourceLink;
}

export function EvidenceItem({ source }: EvidenceItemProps) {
  const title = source.title || source.domain || 'Source';

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
      {source.snippet ? <p className="muted evidence-snippet">{source.snippet}</p> : null}
      {source.url ? (
        <a className="evidence-link" href={source.url} target="_blank" rel="noreferrer">
          Open source
        </a>
      ) : null}
    </div>
  );
}
