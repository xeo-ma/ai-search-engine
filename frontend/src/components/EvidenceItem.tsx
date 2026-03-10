import type { SummarySourceLink } from '../lib/api-client';

interface EvidenceItemProps {
  source: SummarySourceLink;
}

function getTrustLabel(source: SummarySourceLink): string | null {
  const domain = (source.domain ?? '').toLowerCase();

  if (!domain) {
    return null;
  }

  if (domain.endsWith('.gov') || domain.endsWith('.edu')) {
    return 'Official source';
  }

  if (domain.includes('britannica.com') || domain.includes('wikipedia.org')) {
    return 'Reference';
  }

  if (domain.includes('mozilla.org') || domain.includes('developer.mozilla.org')) {
    return 'Docs';
  }

  return null;
}

export function EvidenceItem({ source }: EvidenceItemProps) {
  const title = source.title || source.domain || 'Source';
  const snippet = source.snippet ? source.snippet.replace(/\s*\.\.\.\s*$/, '').trim() : '';
  const trustLabel = getTrustLabel(source);

  return (
    <div className="evidence-item">
      <div className="evidence-head">
        {source.url ? (
          <a className="evidence-title-link" href={source.url} target="_blank" rel="noreferrer">
            <strong>{title}</strong>
          </a>
        ) : (
          <strong>{title}</strong>
        )}
        {trustLabel ? <span className="evidence-trust-badge">{trustLabel}</span> : null}
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
    </div>
  );
}
